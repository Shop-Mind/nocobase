/**
 * 创建「快速搬运流水线」工作流（QT2 最终形态，幂等，可在全新环境从零重建）。**共享生产库，请你自己运行**：
 *   ! SHOT_ACCOUNT=<管理员账号> SHOT_PASSWORD=<密码> node packages/plugins/@crossborder/plugin-ai-listing/docs/plans/scripts/create-quick-transfer-workflow.js
 *
 * 目标形态（QT2）：
 *   collection 触发(aiListingQuickTransferRequests 新增行)
 *     → ① listingCapture（抓取商品）
 *     → ② listingProcess（信息处理）
 *     → ③ condition「跳过改图？」（basic 引擎判 {{$context.data.skipMedia}} == true，rejectOnFalse:false）
 *          ├─ 真分支：留空 = 直通下游（无人工卡点）
 *          └─ 假分支(branchIndex=0)：manual「改图确认（人工卡点）」
 *     → ④ listingApprove（提审锁定）
 *     → ⑤ listingPublishDraft（发布 Alibaba 草稿，strategy 锁 draft）
 *
 * 幂等：按标题查工作流——已存在则只打印现状（含是否为 condition 形态）不做任何修改。
 * 注意：已执行过的工作流版本被引擎锁定（禁增删节点）；老版本升级到本形态须走 workflows:revision 复制新版再重塑，
 * 本脚本只负责从零建链（新环境重放场景）。branchIndex 语义照 plugin-workflow：1=真分支，0=假分支，分支节点 upstreamId
 * 指向 condition 节点，分支跑完回到 condition 的 downstream 继续。
 */
const BASE = process.env.APP_BASE_URL || 'http://localhost:13000';
const ACCOUNT = process.env.SHOT_ACCOUNT;
const PASSWORD = process.env.SHOT_PASSWORD;
const TITLE = '快速搬运流水线（URL→改图→上架草稿）';

const U = (r) => (r && r.data && r.data.data) || (r && r.data) || r;

let token = '';
async function api(path, { method = 'POST', body } = {}) {
  const res = await fetch(`${BASE}/api/${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'X-Authenticator': 'basic',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${JSON.stringify(json).slice(0, 300)}`);
  return json;
}

(async () => {
  token = U(await api('auth:signIn', { body: { account: ACCOUNT, password: PASSWORD } }))?.token;
  if (!token) throw new Error('signIn failed — 请传 SHOT_ACCOUNT/SHOT_PASSWORD');

  // manual 节点的默认受理人 = 当前登录管理员
  const me = U(await api('auth:check', { method: 'GET' }));
  const myId = me?.id;
  if (!myId) throw new Error('auth:check 未返回用户 id');

  // 幂等：按标题查已有工作流（同 key 多版本都会命中，只看是否存在）
  const existing =
    U(
      await api(
        `workflows:list?filter=${encodeURIComponent(
          JSON.stringify({ title: TITLE }),
        )}&pageSize=10&sort=-id&appends=nodes`,
        { method: 'GET' },
      ),
    ) || [];
  if (existing.length) {
    for (const w of existing) {
      const hasCondition = (w.nodes || []).some((n) => n.type === 'condition');
      console.log(
        `workflow exists: id=${w.id} key=${w.key} enabled=${w.enabled} current=${w.current} nodes=${
          w.nodes?.length
        } shape=${hasCondition ? 'QT2(condition)' : 'QT1(linear)'}`,
      );
    }
    console.log('已存在，不做修改。老形态升级请走 workflows:revision（见文件头注释）。');
    return;
  }

  // 1) 建 workflow（collection 触发：快速搬运请求表新增一行）
  const wf = U(
    await api('workflows:create', {
      body: {
        title: TITLE,
        type: 'collection',
        description:
          '贴 URL 提交请求 → 自动抓取+信息处理 → 勾选「跳过改图」则直通，否则停改图人工卡点（待办） → 提审 → Alibaba 草稿。草稿只进卖家后台草稿箱，不会直接上架。',
        config: { mode: 1, collection: 'aiListingQuickTransferRequests' },
        enabled: false,
      },
    }),
  );
  console.log('workflow created:', wf.id, wf.key);

  async function addNode(values) {
    const node = U(await api(`workflows/${wf.id}/nodes:create`, { body: values }));
    console.log(
      `node created: ${node.id} [${node.type}] key=${node.key}${
        values.branchIndex != null ? ` branch=${values.branchIndex}` : ''
      }`,
    );
    return node;
  }

  // 2) 主链（nodes:create 传 upstreamId 自动接双向指针）
  const n1 = await addNode({
    type: 'listingCapture',
    title: '① 抓取商品',
    config: { url: '{{$context.data.sourceUrl}}' },
  });
  const n2 = await addNode({
    type: 'listingProcess',
    title: '② 信息处理',
    upstreamId: n1.id,
    config: { productId: `{{$jobsMapByNodeKey.${n1.key}.productId}}`, ruleId: '{{$context.data.ruleId}}' },
  });
  const n3 = await addNode({
    type: 'condition',
    title: '③ 跳过改图？',
    upstreamId: n2.id,
    config: {
      rejectOnFalse: false,
      engine: 'basic',
      calculation: {
        group: {
          type: 'and',
          calculations: [{ calculator: 'equal', operands: ['{{$context.data.skipMedia}}', true] }],
        },
      },
    },
  });
  const n4 = await addNode({
    type: 'listingApprove',
    title: '④ 提审锁定',
    upstreamId: n3.id,
    config: { productId: `{{$jobsMapByNodeKey.${n1.key}.productId}}` },
  });
  const n5 = await addNode({
    type: 'listingPublishDraft',
    title: '⑤ 发布 Alibaba 草稿',
    upstreamId: n4.id,
    config: {
      productId: `{{$jobsMapByNodeKey.${n1.key}.productId}}`,
      targetStoreId: '{{$context.data.targetStoreId}}',
      targetPlatform: 'Alibaba.com',
    },
  });

  // 3) 假分支 manual 卡点（真分支留空 = 直通）。必须在主链接好后再建，避免 create 把它当主链下游拼接。
  const n3b = await addNode({
    type: 'manual',
    title: '③b 改图确认（人工卡点）',
    upstreamId: n3.id,
    branchIndex: 0,
    config: {
      assignees: [myId],
      mode: 0,
      title: '改图/确认后继续生成上架草稿',
      forms: { confirm: { type: 'custom', title: '确认继续', actions: [{ status: 1, key: 'resolve' }] } },
      schema: {},
    },
  });

  // 4) 启用
  await api(`workflows:update?filterByTk=${wf.id}`, { body: { enabled: true } });
  console.log('workflow enabled');
  console.log(`canvas: ${BASE}/admin/settings/workflow/workflows/${wf.id}`);
  console.log(
    JSON.stringify({
      workflowId: wf.id,
      key: wf.key,
      nodes: { capture: n1.id, process: n2.id, condition: n3.id, manual: n3b.id, approve: n4.id, publish: n5.id },
    }),
  );
})().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
