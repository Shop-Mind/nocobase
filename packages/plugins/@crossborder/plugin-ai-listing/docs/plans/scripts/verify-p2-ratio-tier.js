// 创意工坊 P2 E2E(真实出图):验图片比例(aspect→size)透传 + 模型档(tier)透传落到候选 genParams。
//   generate(scene=white_bg, aspect=16:9, tier=advanced, n=1) → 候选 genParams.aspect='16:9'、
//   genParams.parameters.size='1280*720'(ratioToSize 换算)、genParams.tier='advanced'、model 已解析。
// 需 gpt-image-2 网关可用。用法:node verify-p2-ratio-tier.js [productId]
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
  let productId = Number(process.argv[2]) || 0;
  let source = null;
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
      source = g;
      break;
    }
  }
  if (!source) throw new Error('没有带图的可编辑商品');
  console.log('product:', productId, 'source asset:', source.id);

  // 生成:白底图 + 16:9 + 进阶档,n=1
  const t0 = Date.now();
  const gen = await api('/aiListingMedia:generate', {
    productId,
    assetId: source.id,
    scene: 'white_bg',
    instruction: '',
    n: 1,
    aspect: '16:9',
    tier: 'advanced',
  });
  const assetId = gen.json?.data?.assets?.[0]?.assetId;
  console.log('generate 耗时', Math.round((Date.now() - t0) / 1000) + 's', 'model:', gen.json?.data?.model);
  check('generate 出候选', gen.json?.ok === true && assetId > 0, `assetId=${assetId}`);
  if (!assetId) {
    console.log('E2E-P2-FAILED(no candidate)');
    process.exit(1);
  }

  // 读候选 genParams
  const cand = (await api('/aiListingMedia:candidates', { productId })).json?.data;
  const c0 = (cand?.candidates || []).find((c) => c.id === assetId);
  const gp = c0?.genParams || {};
  check('① aspect 透传到 genParams', gp.aspect === '16:9', `aspect=${gp.aspect}`);
  check(
    '② aspect 换算 size=1280*720 落到 parameters',
    gp.parameters?.size === '1280*720',
    `size=${gp.parameters?.size}`,
  );
  check('③ tier 透传到 genParams', gp.tier === 'advanced', `tier=${gp.tier}`);
  check('④ 模型已解析(测试环境回退 gpt-image-2)', Boolean(gp.model), `model=${gp.model}`);
  check('响应不含 sk- 凭证', !/sk-[a-zA-Z0-9]{8}/.test(JSON.stringify(cand)), '');

  // 清理:弃用这张验证候选,不污染候选区
  await api('/aiListingMedia:discard', { assetId }, { allowFail: true });
  console.log('(已弃用验证候选', assetId, ')');

  const failed = checks.filter((c) => !c).length;
  console.log(failed ? `E2E-P2-FAILED(${failed})` : 'E2E-P2-OK');
  process.exit(failed ? 1 : 0);
}
main().catch((e) => {
  console.error('E2E-P2-ERROR:', e.message);
  process.exit(1);
});
