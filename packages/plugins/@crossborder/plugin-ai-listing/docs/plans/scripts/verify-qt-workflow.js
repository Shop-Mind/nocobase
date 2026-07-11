/**
 * 快速搬运工作流全链 E2E 验收（QT6 固化）。**共享生产库 + 会产生真实 Alibaba 草稿（平台侧需手删），请你自己运行**：
 *   ! SHOT_ACCOUNT=<管理员账号> SHOT_PASSWORD=<密码> node packages/plugins/@crossborder/plugin-ai-listing/docs/plans/scripts/verify-qt-workflow.js
 *
 * 可选环境变量：
 *   APP_BASE_URL   默认 http://localhost:13000
 *   QT_SOURCE_URL  测试货源链接（默认一条实测有实时库存的 Alibaba offer；换环境请挑库存充足的真链接，
 *                  无库存商品在「跳过改图」分支会 PUBLISH_STOCK_INVALID——除非看板里开了缺省库存）
 *   QT_KEEP=1      跳过净零清理（留数据人工检查）
 *
 * 覆盖两条分支（工作流按标题动态发现，不锁 id）：
 *   A) skipMedia=false：抓取→处理→condition 假分支→停改图待办（校验待办标题带商品名）→提交待办→提审→真草稿
 *   B) skipMedia=true ：抓取→处理→condition 真分支→零待办直通→提审→真草稿
 * 收尾：看板行校验 + 测试数据净零清理（商品全链/请求行/执行/发布批次与记录/抓取与处理任务），复核全空。
 */
const BASE = process.env.APP_BASE_URL || 'http://localhost:13000';
const ACCOUNT = process.env.SHOT_ACCOUNT;
const PASSWORD = process.env.SHOT_PASSWORD;
const SRC_URL =
  process.env.QT_SOURCE_URL ||
  'https://www.alibaba.com/product-detail/Hot-Sale-Coffee-Cotton-Linen-Shampoo_1601756026713.html';
const WORKFLOW_TITLE = '快速搬运流水线（URL→改图→上架草稿）';

const U = (r) => (r && r.data && r.data.data) || (r && r.data) || r;
const F = (f) => encodeURIComponent(JSON.stringify(f));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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
const fails = [];
const check = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) fails.push(name);
};

(async () => {
  token = U(await api('auth:signIn', { body: { account: ACCOUNT, password: PASSWORD } }))?.token;
  if (!token) throw new Error('signIn failed — 请传 SHOT_ACCOUNT/SHOT_PASSWORD');

  // 动态发现现役工作流版本
  const wf = (U(
    await api(`workflows:list?filter=${F({ title: WORKFLOW_TITLE, enabled: true })}&pageSize=1&sort=-id`, {
      method: 'GET',
    }),
  ) || [])[0];
  if (!wf) throw new Error(`未找到启用中的工作流「${WORKFLOW_TITLE}」——先跑 create-quick-transfer-workflow.js`);
  console.log(`workflow: ${wf.id} (key=${wf.key})`);

  async function execFor(requestId) {
    const list = U(
      await api(`executions:list?filter=${F({ workflowId: wf.id })}&sort=-id&pageSize=8&appends=jobs`, {
        method: 'GET',
      }),
    );
    return (list || []).find((e) => Number(e?.context?.data?.id) === Number(requestId));
  }
  async function waitStable(requestId, maxSec = 180) {
    for (let i = 0; i < maxSec / 3; i++) {
      await sleep(3000);
      const e = await execFor(requestId);
      if (!e) continue;
      if (e.status !== 0 || (e.jobs || []).some((j) => j.status === 0)) return e;
    }
    return null;
  }
  const draftOf = (e) => (e?.jobs || []).map((j) => j.result && j.result.draftUrl).find(Boolean);
  const productOf = (e) => (e?.jobs || []).map((j) => j.result && j.result.productId).find(Boolean);

  // ===== A) 改图卡点分支 =====
  console.log('\n===== A) skipMedia=false（改图卡点分支）=====');
  const reqA = U(
    await api('aiListingQuickTransferRequests:create', { body: { sourceUrl: SRC_URL, skipMedia: false } }),
  );
  let execA = await waitStable(reqA.id);
  const pendingA = (execA?.jobs || []).find((j) => j.status === 0);
  check('A 停在人工卡点', execA?.status === 0 && Boolean(pendingA), `status=${execA?.status}`);
  const todoA = (U(
    await api(`workflowManualTasks:list?filter=${F({ executionId: execA?.id, status: 0 })}&pageSize=5`, {
      method: 'GET',
    }),
  ) || [])[0];
  check('A 生成待办', Boolean(todoA), `todo=${todoA?.id}`);
  check(
    'A 待办标题带商品名',
    Boolean(todoA?.title) && todoA.title.startsWith('改图确认：') && !todoA.title.includes('{{'),
    todoA?.title,
  );
  await api(`workflowManualTasks:submit?filterByTk=${todoA.id}`, { body: { result: { confirm: {}, _: 'resolve' } } });
  for (let i = 0; i < 60; i++) {
    await sleep(3000);
    execA = U(await api(`executions:get?filterByTk=${execA.id}&appends=jobs`, { method: 'GET' }));
    if (execA.status !== 0) break;
  }
  check(
    'A 提交待办后走完出草稿',
    execA?.status === 1 && Boolean(draftOf(execA)),
    draftOf(execA) || JSON.stringify(execA?.jobs?.map((j) => j.result)).slice(0, 200),
  );

  // ===== B) 跳过改图直通分支 =====
  console.log('\n===== B) skipMedia=true（直通分支）=====');
  const reqB = U(await api('aiListingQuickTransferRequests:create', { body: { sourceUrl: SRC_URL, skipMedia: true } }));
  const execB = await waitStable(reqB.id);
  const todosB =
    U(await api(`workflowManualTasks:list?filter=${F({ executionId: execB?.id })}&pageSize=5`, { method: 'GET' })) ||
    [];
  check('B 零待办', todosB.length === 0, `todos=${todosB.length}`);
  check(
    'B 直通出草稿',
    execB?.status === 1 && Boolean(draftOf(execB)),
    draftOf(execB) || JSON.stringify(execB?.jobs?.map((j) => j.result)).slice(0, 200),
  );

  // ===== 看板校验 =====
  const board = await api('aiListingQuickTransfer:board', { body: { limit: 10 } });
  const rows = (board && board.data && board.data.data && board.data.data.rows) || [];
  const rowA = rows.find((r) => r.requestId === reqA.id);
  const rowB = rows.find((r) => r.requestId === reqB.id);
  check('看板 A/B 行终态正确', rowA?.state === 'done' && rowB?.state === 'done', `A=${rowA?.state} B=${rowB?.state}`);
  check('看板 B 行带草稿链接', Boolean(rowB?.draftUrl), rowB?.draftUrl);

  const products = [productOf(execA), productOf(execB)].filter(Boolean);
  console.log(`\n产物：products=${products} drafts=[${draftOf(execA)}, ${draftOf(execB)}]`);
  console.log('注意：两条真实 Alibaba 草稿已进卖家后台草稿箱，平台侧请手动删除。');

  // ===== 净零清理 =====
  if (process.env.QT_KEEP === '1') {
    console.log('QT_KEEP=1 → 跳过清理');
  } else {
    console.log('\n===== 净零清理 =====');
    const recs =
      U(
        await api(
          `aiListingPublishRecords:list?filter=${F({ productId: { $in: products } })}&pageSize=50&fields=id,batchId`,
          { method: 'GET' },
        ),
      ) || [];
    const batchIds = [...new Set(recs.map((r) => r.batchId).filter(Boolean))];
    const capTasks =
      U(await api('aiListingCaptureTasks:list?sort=-id&pageSize=20&fields=id,metadata', { method: 'GET' })) || [];
    const capIds = capTasks.filter((t) => products.includes(Number(t?.metadata?.productId))).map((t) => t.id);
    const steps =
      U(
        await api(
          `aiListingTaskSteps:list?filter=${F({ productId: { $in: products } })}&pageSize=200&fields=taskType,taskId`,
          { method: 'GET' },
        ),
      ) || [];
    const procIds = [...new Set(steps.filter((s) => s.taskType === 'process').map((s) => s.taskId))];
    await api(`aiListingSkus:destroy?filter=${F({ productId: { $in: products } })}`);
    await api(`aiListingMediaAssets:destroy?filter=${F({ productId: { $in: products } })}`);
    await api(`aiListingMediaJobs:destroy?filter=${F({ productId: { $in: products } })}`);
    await api(`aiListingTaskSteps:destroy?filter=${F({ productId: { $in: products } })}`);
    if (capIds.length) {
      await api(`aiListingTaskSteps:destroy?filter=${F({ taskType: 'capture', taskId: { $in: capIds } })}`);
      await api(`aiListingCaptureTasks:destroy?filter=${F({ id: { $in: capIds } })}`);
    }
    if (procIds.length) {
      await api(`aiListingTaskSteps:destroy?filter=${F({ taskType: 'process', taskId: { $in: procIds } })}`);
      await api(`aiListingProcessingJobs:destroy?filter=${F({ id: { $in: procIds } })}`);
    }
    if (recs.length) await api(`aiListingPublishRecords:destroy?filter=${F({ productId: { $in: products } })}`);
    if (batchIds.length) {
      await api(`aiListingTaskSteps:destroy?filter=${F({ taskType: 'publish', taskId: { $in: batchIds } })}`);
      await api(`aiListingPublishBatches:destroy?filter=${F({ id: { $in: batchIds } })}`);
    }
    await api(`aiListingAuditLogs:destroy?filter=${F({ resourceType: 'product', resourceId: { $in: products } })}`);
    await api(`aiListingProducts:destroy?filter=${F({ id: { $in: products } })}`);
    await api(`aiListingQuickTransferRequests:destroy?filter=${F({ id: { $in: [reqA.id, reqB.id] } })}`);
    for (const eid of [execA?.id, execB?.id].filter(Boolean)) await api(`executions:destroy?filterByTk=${eid}`);
    for (const c of [
      `aiListingProducts:list?filter=${F({ id: { $in: products } })}&fields=id`,
      `aiListingQuickTransferRequests:list?filter=${F({ id: { $in: [reqA.id, reqB.id] } })}&fields=id`,
      `executions:list?filter=${F({ id: { $in: [execA?.id, execB?.id] } })}&fields=id`,
    ]) {
      const left = U(await api(c, { method: 'GET' })) || [];
      check(`清理复核 ${c.split('?')[0]} 为空`, left.length === 0, JSON.stringify(left).slice(0, 80));
    }
  }

  console.log(`\n${fails.length ? 'E2E FAILED: ' + fails.join(' | ') : 'QT WORKFLOW E2E ALL PASS'}`);
  process.exit(fails.length ? 1 : 0);
})().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
