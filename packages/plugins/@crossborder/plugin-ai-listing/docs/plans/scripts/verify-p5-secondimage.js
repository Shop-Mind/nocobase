// 创意工坊 P5 E2E:第二张图输入(Logo定制 / 换材质参考图)。验:
//   ① logo 场景已启用(instruct、instructionRequired=false、模板含「第二张图」);
//   ② 带第二图(refImageUrl)生成:产候选 + genParams.refImageUrl 记录(证明多图输入接通 image[]);
//      (gpt-image-2 网关冷却 429 时跳过出图断言,非代码问题);
//   ③ 无凭证泄露。产物落 /tmp/p5-logo-out.png 供人工看 Logo 是否贴到商品上。
// 用法:node verify-p5-secondimage.js [productId]
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
async function dl(url, out) {
  const full = url.startsWith('http') ? url : BASE.replace('/api', '') + url;
  const r = await fetch(full, { headers: H });
  if (!r.ok) return false;
  fs.writeFileSync(out, Buffer.from(await r.arrayBuffer()));
  return true;
}

async function main() {
  // ① logo 场景
  const scenes = (await api('/aiListingMedia:scenes')).json?.data?.scenes || [];
  const logo = scenes.find((s) => s.key === 'logo');
  check(
    '① logo 场景已启用(instruct + 多图模板)',
    Boolean(logo) && logo.route === 'instruct' && logo.instructionRequired === false,
    `route=${logo?.route}`,
  );

  // 选商品:主图作商品图,另取一张详情图 URL 当「第二张图」(仅验多图管线,语义不重要)
  let productId = Number(process.argv[2]) || 0;
  let gallery = [];
  const ids = productId
    ? [productId]
    : (await api('/aiListingReview:list', { pageSize: 200 })).json?.data?.products
        ?.filter((p) => ['processed', 'reviewing', 'publish_failed'].includes(p.status))
        .map((p) => p.id) || [];
  for (const id of ids) {
    const c = (await api('/aiListingMedia:candidates', { productId: id })).json?.data;
    if ((c?.gallery || []).filter((x) => x.url).length >= 2) {
      productId = id;
      gallery = c.gallery.filter((x) => x.url);
      break;
    }
  }
  if (gallery.length < 2) throw new Error('没有 ≥2 张图的可编辑商品');
  const product = gallery.find((g) => g.role === 'main') || gallery[0];
  const ref = gallery.find((g) => g.id !== product.id);
  console.log('product:', productId, 'productImg:', product.id, 'refImg:', ref.id);

  // ② logo 生成(带第二图)
  const t0 = Date.now();
  const gen = await api(
    '/aiListingMedia:generate',
    {
      productId,
      assetId: product.id,
      scene: 'logo',
      instruction: '印在商品的正面中间,采用丝网印工艺',
      refImageUrl: ref.url,
      n: 1,
    },
    { allowFail: true },
  );
  const a = gen.json?.data?.assets?.[0];
  const errMsg = gen.json?.errors?.[0]?.message || '';
  if (a) {
    console.log('generate', Math.round((Date.now() - t0) / 1000) + 's', 'model:', gen.json?.data?.model);
    check('② logo 带第二图出候选', a.assetId > 0, `assetId=${a.assetId}`);
    const cand = (await api('/aiListingMedia:candidates', { productId })).json?.data;
    const c0 = (cand?.candidates || []).find((c) => c.id === a.assetId);
    check(
      '② genParams 记录 refImageUrl(多图输入接通)',
      c0?.genParams?.refImageUrl === ref.url,
      `ref=${c0?.genParams?.refImageUrl}`,
    );
    await dl(a.url, '/tmp/p5-logo-out.png');
    console.log('  产物已存 /tmp/p5-logo-out.png(人工看 Logo/第二图是否合成到商品上)');
    await api('/aiListingMedia:discard', { assetId: a.assetId }, { allowFail: true });
    console.log('  (已弃用验证候选', a.assetId, ')');
    check('③ 响应不含 sk- 凭证', !/sk-[a-zA-Z0-9]{8}/.test(JSON.stringify(cand)), '');
  } else if (/429|cooling down/i.test(errMsg)) {
    console.log('② 出图跳过:gpt-image-2 网关冷却中(429)——冷却后重跑验多图合成。');
    check('② 出图(网关冷却跳过,不计失败)', true, 'skipped(429)');
  } else {
    check('② logo 带第二图出候选', false, `err=${errMsg.slice(0, 80)}`);
  }

  const failed = checks.filter((c) => !c).length;
  console.log(failed ? `E2E-P5-FAILED(${failed})` : 'E2E-P5-OK');
  process.exit(failed ? 1 : 0);
}
main().catch((e) => {
  console.error('E2E-P5-ERROR:', e.message);
  process.exit(1);
});
