/**
 * 创建/同步「创意工坊」独立菜单页(W1-0)。**共享生产库,请你自己运行**:
 *   ! SHOT_ACCOUNT=<管理员账号> SHOT_PASSWORD=<密码> node packages/plugins/@crossborder/plugin-ai-listing/docs/plans/scripts/create-workshop-page.js
 *
 * 幂等三步(重跑安全):
 *   1) 页面不存在 → 走运行中应用的 flowSurfaces:createMenu(服务端一条龙维护 desktopRoutes/flowModels/treePath);
 *      已存在 → 复用。
 *   2) 页面里没有 jsBlock → flowSurfaces:addBlock(type=jsBlock);已存在 → 复用。
 *   3) 无论新旧,把 docs/jsblocks/creative-workshop.js 镜像同步进 jsBlock 代码(pg 直写,与 apply-jsblock-to-db 同模式),
 *      并给 admin/member/r_store_admin 三个角色补页面授权(已授权则跳过)。
 * 完成后输出页面 URL;硬刷新 /admin 后左侧菜单出现「创意工坊」。
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../../../../../../..'); // -> repo root (nocobase)
const { Client } = require(path.join(ROOT, 'node_modules/pg'));
const MIRROR = path.join(__dirname, '../../jsblocks/creative-workshop.js');
const BASE = process.env.APP_BASE_URL || 'http://localhost:13000';
const GROUP_TITLE = 'AI 商品搬运工具';
const PAGE_TITLE = '创意工坊';
const ROLES = ['admin', 'member', 'r_store_admin'];

const env = {};
for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
}

const code = fs.readFileSync(MIRROR, 'utf8');
if (!(code.length > 500 && code.trimEnd().endsWith('ctx.render(<WorkshopPage />);'))) {
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
  // 登录(账号走环境变量,不落盘)
  const login = await fetch(`${BASE}/api/auth:signIn`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Authenticator': 'basic' },
    body: JSON.stringify({ account: process.env.SHOT_ACCOUNT, password: process.env.SHOT_PASSWORD }),
  }).then((r) => r.json());
  token = login?.data?.token;
  if (!token) throw new Error('signIn failed — 请传 SHOT_ACCOUNT/SHOT_PASSWORD');

  // 1) 页面:存在即复用
  let pageUid;
  const found = await api('desktopRoutes:list', {
    method: 'get',
    query: { filter: JSON.stringify({ title: PAGE_TITLE, type: 'flowPage' }), pageSize: '1' },
  });
  if (found?.data?.[0]?.schemaUid) {
    pageUid = found.data[0].schemaUid;
    console.log(`page exists: ${pageUid}`);
  } else {
    const groups = await api('desktopRoutes:list', {
      method: 'get',
      query: { filter: JSON.stringify({ title: GROUP_TITLE, type: 'group' }), pageSize: '1' },
    });
    const parentMenuRouteId = groups?.data?.[0]?.id;
    if (!parentMenuRouteId) throw new Error(`菜单分组「${GROUP_TITLE}」不存在`);
    const created = await api('flowSurfaces:createMenu', {
      body: { title: PAGE_TITLE, icon: 'BgColorsOutlined', parentMenuRouteId: String(parentMenuRouteId) },
    });
    // 结果里递归找 pageSchemaUid(返回结构做了防御式提取)
    const dig = (o) => {
      if (!o || typeof o !== 'object') return undefined;
      if (typeof o.pageSchemaUid === 'string') return o.pageSchemaUid;
      for (const v of Object.values(o)) {
        const r = dig(v);
        if (r) return r;
      }
      return undefined;
    };
    pageUid =
      dig(created) ||
      (
        await api('desktopRoutes:list', {
          method: 'get',
          query: { filter: JSON.stringify({ title: PAGE_TITLE, type: 'flowPage' }), pageSize: '1' },
        })
      )?.data?.[0]?.schemaUid;
    if (!pageUid) throw new Error('createMenu 成功但未取到 pageSchemaUid');
    console.log(`page created: ${pageUid}`);
  }

  // 路由行(page + tabs 子路由)与 tab schemaUid
  const routeRow = (
    await api('desktopRoutes:list', {
      method: 'get',
      query: { filter: JSON.stringify({ schemaUid: pageUid }), pageSize: '1', appends: 'children' },
    })
  )?.data?.[0];
  const routeId = routeRow?.id;
  const tabRow = (routeRow?.children || [])[0];
  const tabUid = tabRow?.schemaUid;
  if (!tabUid) throw new Error('未找到 tab 路由(schemaUid)');

  // pg:找 grid / jsBlock(存在即复用)
  const c = new Client({
    host: env.DB_HOST,
    port: +(env.DB_PORT || 5432),
    database: env.DB_DATABASE,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
  });
  await c.connect();
  const q = async (sql, args) => (await c.query(sql, args)).rows;
  const findChild = async (parentUid, use) =>
    (
      await q(`select uid from "flowModels" where options->>'parentId'=$1 and options->>'use'=$2 limit 1`, [
        parentUid,
        use,
      ])
    )[0]?.uid;

  let gridUid = await findChild(tabUid, 'BlockGridModel');
  let blockUid = gridUid ? await findChild(gridUid, 'JSBlockModel') : undefined;
  if (!blockUid) {
    // 2) 加 jsBlock(先用占位代码,第 3 步统一同步镜像)
    await api('flowSurfaces:addBlock', {
      body: {
        type: 'jsBlock',
        target: { uid: gridUid || tabUid },
        settings: {
          title: PAGE_TITLE,
          version: '1.0.0',
          code: 'ctx.render(<div>creative workshop placeholder</div>);',
        },
      },
    });
    gridUid = gridUid || (await findChild(tabUid, 'BlockGridModel'));
    blockUid = gridUid ? await findChild(gridUid, 'JSBlockModel') : undefined;
    if (!blockUid) throw new Error('addBlock 成功但未找到 JSBlockModel 行');
    console.log(`jsBlock created: ${blockUid}`);
  } else {
    console.log(`jsBlock exists: ${blockUid}`);
  }

  // 3) 同步镜像代码(幂等)
  const row = (await q(`select options from "flowModels" where uid=$1`, [blockUid]))[0];
  const opt = row.options;
  if (!opt?.stepParams?.jsSettings?.runJs) throw new Error('jsBlock options 结构异常');
  const oldLen = (opt.stepParams.jsSettings.runJs.code || '').length;
  opt.stepParams.jsSettings.runJs.code = code;
  await c.query(`update "flowModels" set options=$1 where uid=$2`, [opt, blockUid]);
  console.log(`code synced: oldLen=${oldLen} newLen=${code.length}`);

  // 角色授权(page + tab 两行 × 三角色,已存在跳过)
  for (const rid of [routeId, tabRow?.id].filter(Boolean)) {
    for (const role of ROLES) {
      // select 列表里的裸参数 PG 推导不出类型,必须显式 cast(首跑曾报 inconsistent types deduced for parameter)
      await c.query(
        `insert into "rolesDesktopRoutes" ("createdAt","updatedAt","desktopRouteId","roleName")
         select now(), now(), $1::bigint, $2::text
         where not exists (select 1 from "rolesDesktopRoutes" where "desktopRouteId"=$1::bigint and "roleName"=$2::text)`,
        [String(rid), role],
      );
    }
  }
  console.log(`roles granted: ${ROLES.join('/')}`);
  await c.end();
  console.log(`\n✅ done. 页面: ${BASE}/admin/${pageUid}`);
  console.log('   硬刷新 /admin(Cmd+Shift+R)后,左侧菜单「AI 商品搬运工具」下出现「创意工坊」。');
})().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
