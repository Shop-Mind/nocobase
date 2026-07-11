/**
 * 创建/同步 商品抓取页「快速搬运」tab（QT1）。**共享生产库，请你自己运行**：
 *   ! SHOT_ACCOUNT=<管理员账号> SHOT_PASSWORD=<密码> node packages/plugins/@crossborder/plugin-ai-listing/docs/plans/scripts/create-quick-transfer-tab.js
 *
 * 幂等步骤（重跑安全）：
 *   1) 商品抓取页无「快速搬运」tab → flowSurfaces:addTab（页 enableTabs 已为 true）；已存在 → 复用。
 *   2) tab 内无原生表单 → flowSurfaces:addBlock(type=createForm 绑 aiListingQuickTransferRequests, 4 字段+提交)；
 *      尝试 addAction 挂 lst-kai aiEmployee（失败仅告警不阻断）。
 *   3) tab 内无 jsBlock → addBlock 占位；随后把 docs/jsblocks/quick-transfer-board.js 镜像同步进代码（pg 直写）。
 *   4) 给 admin/member/r_store_admin 补 tab 路由授权（已授权跳过）。
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../../../../../../..');
const { Client } = require(path.join(ROOT, 'node_modules/pg'));
const MIRROR = path.join(__dirname, '../../jsblocks/quick-transfer-board.js');
const BASE = process.env.APP_BASE_URL || 'http://localhost:13000';
const PAGE_TITLE = '商品抓取';
const TAB_TITLE = '快速搬运';
const ROLES = ['admin', 'member', 'r_store_admin'];

const env = {};
for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
}

const code = fs.readFileSync(MIRROR, 'utf8');
if (!(code.length > 500 && code.trimEnd().endsWith('ctx.render(<QuickTransferBoard />);'))) {
  console.error('ABORT: mirror failed integrity gate (length / entrypoint).');
  process.exit(1);
}

let token = '';
async function api(pathname, { method = 'post', body, query } = {}) {
  const url = new URL(`/api/${pathname}`, BASE);
  for (const [k, v] of Object.entries(query || {})) url.searchParams.set(k, v);
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'X-Role': 'root' },
    body: method === 'get' ? undefined : JSON.stringify(body || {}),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${pathname} ${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
  return json;
}

(async () => {
  const login = await fetch(`${BASE}/api/auth:signIn`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Authenticator': 'basic' },
    body: JSON.stringify({ account: process.env.SHOT_ACCOUNT, password: process.env.SHOT_PASSWORD }),
  }).then((r) => r.json());
  token = login?.data?.token;
  if (!token) throw new Error('signIn failed — 请传 SHOT_ACCOUNT/SHOT_PASSWORD');

  // 商品抓取页路由 + 现有 tabs
  const pageRow = (
    await api('desktopRoutes:list', {
      method: 'get',
      query: { filter: JSON.stringify({ title: PAGE_TITLE, type: 'flowPage' }), pageSize: '1', appends: 'children' },
    })
  )?.data?.[0];
  if (!pageRow) throw new Error(`页面「${PAGE_TITLE}」不存在`);
  const pageUid = pageRow.schemaUid;
  console.log(`page: ${pageUid} routeId=${pageRow.id} tabs=${(pageRow.children || []).length}`);

  // 1) tab：存在即复用
  let tabRow = (pageRow.children || []).find((t) => t.title === TAB_TITLE);
  if (!tabRow) {
    // addTab 的 target 是 canonical page uid（flowSurfaces:get 的 target.uid，非 schemaUid）
    const surface = await api('flowSurfaces:get', { method: 'get', query: { pageSchemaUid: pageUid } });
    const dig = (o) => {
      if (!o || typeof o !== 'object') return undefined;
      if (typeof o.uid === 'string' && o.type === 'page') return o.uid;
      for (const v of Object.values(o)) {
        const r = dig(v);
        if (r) return r;
      }
      return undefined;
    };
    const canonicalUid = surface?.data?.target?.uid || dig(surface) || pageUid;
    await api('flowSurfaces:addTab', {
      body: { target: { uid: canonicalUid }, title: TAB_TITLE, icon: 'ThunderboltOutlined' },
    });
    tabRow = (
      await api('desktopRoutes:list', {
        method: 'get',
        query: { filter: JSON.stringify({ schemaUid: pageUid }), pageSize: '1', appends: 'children' },
      })
    )?.data?.[0]?.children?.find((t) => t.title === TAB_TITLE);
    if (!tabRow) throw new Error('addTab 成功但未找到 tab 路由行');
    console.log(`tab created: ${tabRow.schemaUid}`);
  } else {
    console.log(`tab exists: ${tabRow.schemaUid}`);
  }
  const tabUid = tabRow.schemaUid;

  const c = new Client({
    host: env.DB_HOST,
    port: +(env.DB_PORT || 5432),
    database: env.DB_DATABASE,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
  });
  await c.connect();
  const q = async (sql, args) => (await c.query(sql, args)).rows;
  const children = async (parentUid) =>
    q(`select uid, options->>'use' as use from "flowModels" where options->>'parentId'=$1`, [parentUid]);
  const findChild = async (parentUid, use) => (await children(parentUid)).find((r) => r.use === use)?.uid;

  let gridUid = await findChild(tabUid, 'BlockGridModel');

  // 2) 原生表单（存在即复用；以「grid 下存在非 JSBlock 的块」判定）
  let kids = gridUid ? await children(gridUid) : [];
  let formUid = kids.find((k) => k.use && k.use !== 'JSBlockModel' && k.use !== 'BlockGridModel')?.uid;
  if (!formUid) {
    await api('flowSurfaces:addBlock', {
      body: {
        type: 'createForm',
        target: { uid: gridUid || tabUid },
        resourceInit: { dataSourceKey: 'main', collectionName: 'aiListingQuickTransferRequests' },
        // rule/targetStore 是 belongsTo 关联字段（复用 ruleId/targetStoreId 外键列）→ 表单渲染成按名称选择的下拉。
        fields: [
          { key: 'fSourceUrl', fieldPath: 'sourceUrl' },
          { key: 'fRule', fieldPath: 'rule' },
          { key: 'fTargetStore', fieldPath: 'targetStore' },
          { key: 'fSkipMedia', fieldPath: 'skipMedia' },
        ],
        actions: [{ type: 'submit', settings: { title: '开始搬运' } }],
      },
    });
    gridUid = gridUid || (await findChild(tabUid, 'BlockGridModel'));
    kids = await children(gridUid);
    formUid = kids.find((k) => k.use && k.use !== 'JSBlockModel' && k.use !== 'BlockGridModel')?.uid;
    console.log(`form created: ${formUid} (use=${kids.map((k) => k.use).join(',')})`);
    // Kai aiEmployee 按钮（失败不阻断——可后续在设计器里手动补）
    try {
      await api('flowSurfaces:addAction', {
        body: { target: { uid: formUid }, type: 'aiEmployee', settings: { username: 'lst-kai' } },
      });
      console.log('Kai aiEmployee action attached');
    } catch (e) {
      console.warn('WARN: addAction(aiEmployee) failed, 可稍后手动补 →', String(e.message).slice(0, 160));
    }
  } else {
    console.log(`form exists: ${formUid}`);
  }

  // 3) 看板 jsBlock（存在即复用 + 镜像同步）
  let blockUid = await findChild(gridUid, 'JSBlockModel');
  if (!blockUid) {
    await api('flowSurfaces:addBlock', {
      body: {
        type: 'jsBlock',
        target: { uid: gridUid },
        settings: {
          title: '搬运看板',
          version: '1.0.0',
          code: 'ctx.render(<div>quick transfer board placeholder</div>);',
        },
      },
    });
    blockUid = await findChild(gridUid, 'JSBlockModel');
    if (!blockUid) throw new Error('addBlock(jsBlock) 成功但未找到 JSBlockModel 行');
    console.log(`jsBlock created: ${blockUid}`);
  } else {
    console.log(`jsBlock exists: ${blockUid}`);
  }
  const row = (await q(`select options from "flowModels" where uid=$1`, [blockUid]))[0];
  const opt = row.options;
  if (!opt?.stepParams?.jsSettings?.runJs) throw new Error('jsBlock options 结构异常');
  const oldLen = (opt.stepParams.jsSettings.runJs.code || '').length;
  opt.stepParams.jsSettings.runJs.code = code;
  await c.query(`update "flowModels" set options=$1 where uid=$2`, [opt, blockUid]);
  console.log(`board code synced: oldLen=${oldLen} newLen=${code.length}`);

  // 3.5) 区块顺序：表单在上、看板在下（重建表单后新行会追加到末尾，rowOrder 调回）
  if (gridUid && formUid && blockUid) {
    const gridRow = (await q(`select options from "flowModels" where uid=$1`, [gridUid]))[0];
    const gopt = gridRow.options;
    const layout = gopt?.stepParams?.gridSettings?.grid || gopt?.props;
    if (layout?.rows && Array.isArray(layout.rowOrder)) {
      const rowOf = (uid) => Object.keys(layout.rows).find((rk) => (layout.rows[rk] || []).flat().includes(uid));
      const formRow = rowOf(formUid);
      const boardRow = rowOf(blockUid);
      if (formRow && boardRow && layout.rowOrder.indexOf(formRow) > layout.rowOrder.indexOf(boardRow)) {
        const newOrder = [formRow, ...layout.rowOrder.filter((rk) => rk !== formRow)];
        if (gopt.props?.rowOrder) gopt.props.rowOrder = newOrder;
        if (gopt.stepParams?.gridSettings?.grid?.rowOrder) gopt.stepParams.gridSettings.grid.rowOrder = newOrder;
        await c.query(`update "flowModels" set options=$1 where uid=$2`, [gopt, gridUid]);
        console.log(`grid rowOrder fixed: form row first (${newOrder.join(' > ')})`);
      }
    }
  }

  // 4) tab 路由授权
  for (const role of ROLES) {
    await c.query(
      `insert into "rolesDesktopRoutes" ("createdAt","updatedAt","desktopRouteId","roleName")
       select now(), now(), $1::bigint, $2::text
       where not exists (select 1 from "rolesDesktopRoutes" where "desktopRouteId"=$1::bigint and "roleName"=$2::text)`,
      [String(tabRow.id), role],
    );
  }
  console.log(`roles granted: ${ROLES.join('/')}`);
  await c.end();
  console.log(`DONE → ${BASE}/admin/${pageUid}（硬刷新后切「${TAB_TITLE}」tab）`);
})().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
