/**
 * 创建「快速搬运流水线」工作流（QT3 最终形态，幂等，可在全新环境从零重建）。**共享生产库，请你自己运行**：
 *   ! SHOT_ACCOUNT=<管理员账号> SHOT_PASSWORD=<密码> node packages/plugins/@crossborder/plugin-ai-listing/docs/plans/scripts/create-quick-transfer-workflow.js
 *
 * 目标形态（QT2 链形 + QT3 待办卡片增强）：
 *   collection 触发(aiListingQuickTransferRequests 新增行)
 *     → ① listingCapture（抓取商品）
 *     → ② listingProcess（信息处理，result 带 title/image/price 展示字段）
 *     → ③ condition「跳过改图？」（basic 引擎判 {{$context.data.skipMedia}} == true，rejectOnFalse:false）
 *          ├─ 真分支：留空 = 直通下游（无人工卡点）
 *          └─ 假分支(branchIndex=0)：manual「改图确认（人工卡点）」
 *              · title 模板带商品名（服务端 getParsedValue 解析后快照进 workflowManualTasks.title）
 *              · schema：商品摘要（DetailsBlockProvider 内嵌 handlebars Markdown，$nRecord=处理节点 result）
 *                + 去预览编辑/去创意工坊深链（?productId=，页面 uid 按标题运行时解析）+「确认继续」custom 表单
 *     → ④ listingApprove（提审锁定）
 *     → ⑤ listingPublishDraft（发布 Alibaba 草稿，strategy 锁 draft）
 *
 * 幂等：按标题查工作流——已存在则只打印现状（含形态判定）不做任何修改。
 * 注意：已执行过的工作流版本被引擎锁定（禁增删节点/改配置）；老版本升级到本形态须走 workflows:revision 复制新版再重塑，
 * 本脚本只负责从零建链（新环境重放场景）。branchIndex 语义照 plugin-workflow：1=真分支，0=假分支，分支节点 upstreamId
 * 指向 condition 节点，分支跑完回到 condition 的 downstream 继续。
 * 坑（QT3 实测）：摘要区块 DetailsBlockProvider 的 collection 必须是**内联对象**（{name,fields:[]}）——传字符串
 * 'aiListingProducts' 时客户端集合管理器查不到（该表未 db2cm 进 UI 数据源），CollectionProvider 渲染 null 整块静默消失；
 * Markdown 文本插值只认客户端变量（$nRecord 等），直接写 $jobsMapByNodeKey 不会被解析。
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
      const manual = (w.nodes || []).find((n) => n.type === 'manual');
      const hasSummary = Boolean(
        manual?.config?.schema?.tab1?.properties?.grid?.properties?.row1?.properties?.col1?.properties?.summary,
      );
      const shape = hasSummary ? 'QT3(summary)' : hasCondition ? 'QT2(condition)' : 'QT1(linear)';
      console.log(
        `workflow exists: id=${w.id} key=${w.key} enabled=${w.enabled} current=${w.current} nodes=${w.nodes?.length} shape=${shape}`,
      );
    }
    console.log('已存在，不做修改。老形态升级请走 workflows:revision（见文件头注释）。');
    return;
  }

  // 深链页面 uid 按标题运行时解析（跨环境 uid 不同）；找不到就退化为任务中心路径，不阻断建链。
  async function pageUidByTitle(title) {
    const rows = U(
      await api(
        `desktopRoutes:list?filter=${encodeURIComponent(JSON.stringify({ title, type: 'flowPage' }))}&pageSize=1`,
        { method: 'GET' },
      ),
    );
    return rows?.[0]?.schemaUid || null;
  }
  const previewUid = await pageUidByTitle('预览编辑');
  const workshopUid = await pageUidByTitle('创意工坊');
  if (!previewUid || !workshopUid) console.warn(`WARN: 页面 uid 缺失 preview=${previewUid} workshop=${workshopUid}`);

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
  // QT3：title 模板带商品名（服务端解析）；schema = 商品摘要（DetailsBlockProvider + handlebars Markdown）+ 确认表单。
  const mdContent = [
    `### {{$nRecord.title}}`,
    ``,
    `<img src="{{$nRecord.image}}" width="240" style="border-radius:8px" />`,
    ``,
    `**目标价**：{{$nRecord.price}} 元 ｜ **商品编号**：#{{$nRecord.productId}}`,
    ``,
    `改图入口（改完回本待办点「确认继续」）：`,
    ``,
    `[🖌 去预览编辑改图](/admin/${
      previewUid || 'workflow/tasks'
    }?productId={{$nRecord.productId}}) ｜ [🎨 去创意工坊](/admin/${
      workshopUid || 'workflow/tasks'
    }?productId={{$nRecord.productId}})`,
  ].join('\n');

  const n3b = await addNode({
    type: 'manual',
    title: '③b 改图确认（人工卡点）',
    upstreamId: n3.id,
    branchIndex: 0,
    config: {
      assignees: [myId],
      mode: 0,
      title: `改图确认：{{$jobsMapByNodeKey.${n2.key}.title}}`,
      forms: {
        confirm: {
          type: 'custom',
          title: '确认继续',
          actions: [{ status: 1, key: 'resolve' }],
          collection: { name: 'qt_confirm_form', fields: [] },
        },
      },
      schema: {
        tab1: {
          type: 'void',
          title: '改图确认',
          'x-component': 'Tabs.TabPane',
          'x-designer': 'Tabs.Designer',
          properties: {
            grid: {
              type: 'void',
              'x-component': 'Grid',
              'x-initializer': 'workflowManual:popup:configureUserInterface:addBlock',
              properties: {
                row1: {
                  type: 'void',
                  'x-component': 'Grid.Row',
                  properties: {
                    col1: {
                      type: 'void',
                      'x-component': 'Grid.Col',
                      properties: {
                        summary: {
                          type: 'void',
                          title: '商品信息',
                          'x-decorator': 'DetailsBlockProvider',
                          // collection 必须内联对象（见文件头「坑」），dataPath 指向处理节点 result
                          'x-decorator-props': {
                            collection: { name: 'qt_summary_ctx', fields: [] },
                            dataPath: `$jobsMapByNodeKey.${n2.key}`,
                          },
                          'x-component': 'CardItem',
                          'x-component-props': { title: '商品信息' },
                          properties: {
                            md: {
                              type: 'void',
                              'x-decorator-props': { name: 'markdown', engine: 'handlebars' },
                              'x-component': 'Markdown.Void',
                              'x-editable': false,
                              'x-component-props': { content: mdContent },
                            },
                          },
                        },
                      },
                    },
                  },
                },
                row2: {
                  type: 'void',
                  'x-component': 'Grid.Row',
                  properties: {
                    col1: {
                      type: 'void',
                      'x-component': 'Grid.Col',
                      properties: {
                        confirmBlock: {
                          type: 'void',
                          'x-decorator': 'CustomFormBlockProvider',
                          'x-decorator-props': { collection: { name: 'qt_confirm_form', fields: [] } },
                          'x-component': 'CardItem',
                          'x-component-props': { title: '确认继续' },
                          'x-designer': 'SimpleDesigner',
                          'x-designer-props': { type: 'customForm' },
                          properties: {
                            // 节点名 confirm = formKey，须与 forms.confirm / 提交体 result.confirm 一致
                            confirm: {
                              type: 'void',
                              'x-component': 'FormV2',
                              'x-use-component-props': 'useFormBlockProps',
                              properties: {
                                grid: {
                                  type: 'void',
                                  'x-component': 'Grid',
                                  'x-initializer': 'workflowManual:customForm:configureFields',
                                  properties: {},
                                },
                                actions: {
                                  type: 'void',
                                  'x-decorator': 'ActionBarProvider',
                                  'x-component': 'ActionBar',
                                  'x-component-props': {
                                    layout: 'one-column',
                                    style: { marginTop: '1.5em', flexWrap: 'wrap' },
                                  },
                                  'x-initializer': 'workflowManual:form:configureActions',
                                  properties: {
                                    resolve: {
                                      type: 'void',
                                      title: '确认继续，生成上架草稿',
                                      'x-decorator': 'ManualActionStatusProvider',
                                      'x-decorator-props': { value: 1 },
                                      'x-component': 'Action',
                                      'x-component-props': { type: 'primary', useAction: '{{ useSubmit }}' },
                                      'x-designer': 'ManualActionDesigner',
                                    },
                                  },
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
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
