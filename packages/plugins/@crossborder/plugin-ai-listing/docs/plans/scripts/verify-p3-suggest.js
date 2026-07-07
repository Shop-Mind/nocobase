// 创意工坊 P3 E2E:推荐提示词(看图出词)。对真实商品图调 suggestPrompts:
//   ① scene_gen 返回 n 条非空中文;② selling_point 也返回 n 条;③ 视觉模型命中时 fallback=false、model 非空
//   (现网 gpt-5.5);④ 缺源图报 MEDIA_SOURCE_NOT_FOUND;⑤ 无凭证泄露。
// 用法:node verify-p3-suggest.js [productId]
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
    signal: AbortSignal.timeout(60000),
    ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}),
  });
  let json = await resp.json().catch(() => ({}));
  if (json?.data && typeof json.data === 'object' && !Array.isArray(json.data) && 'ok' in json.data) json = json.data;
  if (!resp.ok && !allowFail) throw new Error(`${pathname} HTTP ${resp.status}: ${JSON.stringify(json).slice(0, 200)}`);
  return { status: resp.status, json };
}
const hasCJK = (s) => /[一-龥]/.test(String(s || ''));

async function main() {
  let productId = Number(process.argv[2]) || 0;
  let src = null;
  const ids = productId
    ? [productId]
    : (await api('/aiListingReview:list', { pageSize: 200 })).json?.data?.products
        ?.filter((p) => ['processed', 'reviewing', 'publish_failed'].includes(p.status))
        .map((p) => p.id) || [];
  for (const id of ids) {
    const c = (await api('/aiListingMedia:candidates', { productId: id })).json?.data;
    const g = (c?.gallery || []).find((x) => x.url);
    if (g) {
      productId = id;
      src = g;
      break;
    }
  }
  if (!src) throw new Error('没有带图的可编辑商品');
  console.log('product:', productId, 'source asset:', src.id);

  // ① 场景图推荐
  const t0 = Date.now();
  const sc = (await api('/aiListingMedia:suggestPrompts', { assetId: src.id, scene: 'scene_gen', n: 3 })).json?.data;
  console.log(
    'scene_gen 耗时',
    Math.round((Date.now() - t0) / 1000) + 's',
    'model:',
    sc?.model,
    'fallback:',
    sc?.fallback,
  );
  console.log('  →', (sc?.prompts || []).join(' | '));
  check(
    '① scene_gen 返回 3 条非空中文',
    (sc?.prompts || []).length === 3 && sc.prompts.every((p) => hasCJK(p) && p.trim()),
    '',
  );

  // ② 卖点图推荐
  const sp = (await api('/aiListingMedia:suggestPrompts', { assetId: src.id, scene: 'selling_point', n: 3 })).json
    ?.data;
  console.log('  selling_point →', (sp?.prompts || []).join(' | '), 'fallback:', sp?.fallback);
  check(
    '② selling_point 返回 3 条非空中文',
    (sp?.prompts || []).length === 3 && sp.prompts.every((p) => hasCJK(p) && p.trim()),
    '',
  );

  // ③ 视觉模型可达(现网 gpt-5.5):场景/卖点至少一个命中(fallback=false)。单次调用延迟有波动,故取二者其一。
  const visionHit = (sc?.fallback === false && sc?.model) || (sp?.fallback === false && sp?.model);
  check(
    '③ 视觉模型可达(scene/卖点至少一个命中)',
    Boolean(visionHit),
    `sc=${sc?.model}/${sc?.fallback} sp=${sp?.model}/${sp?.fallback}`,
  );

  // ④ 缺源图报错
  const noSrc = await api('/aiListingMedia:suggestPrompts', { scene: 'scene_gen', n: 3 }, { allowFail: true });
  // _NOT_FOUND 系错误按 httpStatusOf 映射 404
  check(
    '④ 缺源图报 MEDIA_SOURCE_NOT_FOUND(404)',
    noSrc.status === 404 && noSrc.json?.errors?.[0]?.code === 'MEDIA_SOURCE_NOT_FOUND',
    `status=${noSrc.status} ${JSON.stringify(noSrc.json?.errors?.[0] || {}).slice(0, 80)}`,
  );

  // ⑤ 无凭证泄露
  check('⑤ 响应不含 sk- 凭证', !/sk-[a-zA-Z0-9]{8}/.test(JSON.stringify({ sc, sp })), '');

  const failed = checks.filter((c) => !c).length;
  console.log(failed ? `E2E-P3-FAILED(${failed})` : 'E2E-P3-OK');
  process.exit(failed ? 1 : 0);
}
main().catch((e) => {
  console.error('E2E-P3-ERROR:', e.message);
  process.exit(1);
});
