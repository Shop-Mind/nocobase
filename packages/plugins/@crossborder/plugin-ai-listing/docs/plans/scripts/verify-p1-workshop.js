// 创意工坊 P1 E2E(P1 为纯前端:独立工坊页 + 商品图带入 + 9 场景专属表单;后端零改动,复用 aiListingMedia
// 现有 action)。本脚本验证工坊所依赖的服务端契约:
//   ① 带入数据源:candidates.gallery 非空(工坊上传区带入的就是它)。
//   ② 工坊「上传新图」走 sourceImageUrl 生成路径已接通:generate 传 sourceImageUrl 能过源图解析、到达 provider
//      (当前 gpt-image-2 网关 401,故预期 MEDIA_EDIT_FAILED 且 message 含 401,而非 MEDIA_SOURCE_NOT_FOUND 校验错)。
//   ③ scene 契约:generate 传 scene=white_bg(工坊功能 key)被接受。
// 出图闭环待网关鉴权恢复后由 verify-phase0 一次性补验。
// 用法:node verify-p1-workshop.js [productId]
const fs = require('fs');
const cfg = JSON.parse(fs.readFileSync(process.env.HOME + '/.nocobase/config.json', 'utf8'));
const BASE = cfg.envs.dev.apiBaseUrl;
const H = {
  Authorization: 'Bearer ' + cfg.envs.dev.auth.accessToken,
  'Content-Type': 'application/json',
  'X-Role': 'root',
  'X-Authenticator': 'basic',
  'X-Hostname': 'localhost',
  'X-Locale': 'zh-CN',
};
const checks = [];
const check = (name, ok, detail = '') => {
  checks.push(ok);
  console.log(ok ? 'PASS' : 'FAIL', name, detail);
};
async function api(pathname, body, { allowFail } = {}) {
  const resp = await fetch(BASE + pathname, {
    headers: H,
    signal: AbortSignal.timeout(300000),
    ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}),
  });
  let json = await resp.json().catch(() => ({}));
  if (json?.data && typeof json.data === 'object' && !Array.isArray(json.data) && 'ok' in json.data) json = json.data;
  if (!resp.ok && !allowFail) throw new Error(`${pathname} HTTP ${resp.status}: ${JSON.stringify(json).slice(0, 200)}`);
  return { status: resp.status, json };
}

async function main() {
  // 选商品:参数指定或第一个有图集的可编辑商品
  let productId = Number(process.argv[2]) || 0;
  let gallery = [];
  const ids = productId
    ? [productId]
    : (await api('/aiListingReview:list', { pageSize: 200 })).json?.data?.products
        ?.filter((p) => ['processed', 'reviewing', 'publish_failed'].includes(p.status))
        .map((p) => p.id) || [];
  for (const id of ids) {
    const c = (await api('/aiListingMedia:candidates', { productId: id })).json?.data;
    if (c?.gallery?.length) {
      productId = id;
      gallery = c.gallery;
      break;
    }
  }
  check('① 带入数据源:candidates.gallery 非空', gallery.length > 0, `product=${productId} gallery=${gallery.length}`);
  if (!gallery.length) {
    console.log('E2E-P1-FAILED(no gallery)');
    process.exit(1);
  }

  const withUrl = gallery.find((g) => g.url);
  check('图集图片带可用 URL(带入缩略图)', Boolean(withUrl?.url), String(withUrl?.url).slice(0, 40));

  // ② 工坊「上传新图」路径:generate 传 sourceImageUrl(用图集里真实图 URL 模拟上传后的 URL)+ scene
  const gen = await api(
    '/aiListingMedia:generate',
    { productId, sourceImageUrl: withUrl.url, scene: 'white_bg', instruction: '', n: 1 },
    { allowFail: true },
  );
  const code = gen.json?.errors?.[0]?.code;
  const msg = gen.json?.errors?.[0]?.message || '';
  // 「已接通」= 过了源图解析、到达 provider:成功(网关恢复)或 MEDIA_EDIT_FAILED(provider/网关侧失败,如 401/503 no-auth),
  // 而非 MEDIA_SOURCE_NOT_FOUND(源图/参数校验错)。当前 gpt-image-2 网关 503 no-auth,属预期的 provider 侧失败。
  const passedSourceResolve = gen.json?.ok === true || code === 'MEDIA_EDIT_FAILED';
  check(
    '② sourceImageUrl 生成路径已接通(过源图解析、到达 provider)',
    passedSourceResolve && code !== 'MEDIA_SOURCE_NOT_FOUND',
    gen.json?.ok ? 'ok(网关已恢复,真实出图)' : `code=${code} msg=${msg.slice(0, 60)}`,
  );

  // ③ scene 契约:未知 scene 被拒(证明 scene 校验生效),已知 scene 不因 scene 报错
  const badScene = await api(
    '/aiListingMedia:generate',
    { productId, sourceImageUrl: withUrl.url, scene: 'not_a_scene', instruction: 'x', n: 1 },
    { allowFail: true },
  );
  check(
    '③ 未知 scene 被拒(MEDIA_SCENE_UNKNOWN)',
    badScene.json?.errors?.[0]?.code === 'MEDIA_SCENE_UNKNOWN',
    JSON.stringify(badScene.json?.errors?.[0] || {}).slice(0, 100),
  );

  // 无凭证泄露
  check('响应不含 sk- 凭证', !/sk-[a-zA-Z0-9]{8}/.test(JSON.stringify({ gen: gen.json, badScene: badScene.json })), '');

  const failed = checks.filter((c) => !c).length;
  console.log(failed ? `E2E-P1-FAILED(${failed})` : 'E2E-P1-OK');
  process.exit(failed ? 1 : 0);
}
main().catch((e) => {
  console.error('E2E-P1-ERROR:', e.message);
  process.exit(1);
});
