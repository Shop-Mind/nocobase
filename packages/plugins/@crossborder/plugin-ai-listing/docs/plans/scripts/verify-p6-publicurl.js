// 创意工坊 P6 E2E:公网 URL 管线(toPublicUrl / aiListingMedia:publicUrl)。验:
//   ① 对某商品图资产求 publicUrl → 返回绝对 URL、public=true;
//   ② 该 URL 服务端可 200 拉取(证明外部服务商能回源);
//   ③ 响应不含 sk- 凭证。
// 说明:测试期图像编辑走 gpt-image-2 的 /images/edits(base64 入图),不经本管线;本管线是切生产翻译/模特/视频端点的入图基座。
// 用法:node verify-p6-publicurl.js [productId]
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

async function main() {
  // 选一个有图的商品
  let productId = Number(process.argv[2]) || 0;
  let gallery = [];
  const ids = productId
    ? [productId]
    : (await api('/aiListingReview:list', { pageSize: 200 })).json?.data?.products
        ?.filter((p) => ['processed', 'reviewing', 'publish_failed'].includes(p.status))
        .map((p) => p.id) || [];
  for (const id of ids) {
    const c = (await api('/aiListingMedia:candidates', { productId: id })).json?.data;
    if ((c?.gallery || []).filter((x) => x.url && x.id).length >= 1) {
      productId = id;
      gallery = c.gallery.filter((x) => x.url && x.id);
      break;
    }
  }
  if (!gallery.length) throw new Error('没有可用的商品图资产');
  const asset = gallery.find((g) => g.role === 'main') || gallery[0];
  console.log('product:', productId, 'asset:', asset.id, 'storedUrl:', String(asset.url).slice(0, 60));

  // ① publicUrl
  const pu = (await api('/aiListingMedia:publicUrl', { assetId: asset.id })).json?.data;
  console.log('publicUrl →', JSON.stringify(pu));
  check('① publicUrl 返回绝对 URL', /^https?:\/\//i.test(pu?.url || ''), `url=${String(pu?.url).slice(0, 70)}`);
  check('① public=true', pu?.public === true, `source=${pu?.source}`);

  // ② 该 URL 可 200 拉取(带鉴权头,内部 /storage 亦可)
  let status = 0;
  let bytes = 0;
  try {
    const r = await fetch(pu.url, { headers: H, signal: AbortSignal.timeout(30000) });
    status = r.status;
    if (r.ok) bytes = (await r.arrayBuffer()).byteLength;
  } catch (e) {
    console.log('  fetch err:', e.message);
  }
  check('② 公网 URL 可 200 拉取', status === 200 && bytes > 0, `HTTP ${status}, ${bytes}B`);

  // ③ 无凭证泄露
  check('③ 响应不含 sk- 凭证', !/sk-[a-zA-Z0-9]{8}/.test(JSON.stringify(pu)), '');

  const failed = checks.filter((c) => !c).length;
  console.log(failed ? `E2E-P6-PUBLICURL-FAILED(${failed})` : 'E2E-P6-PUBLICURL-OK');
  process.exit(failed ? 1 : 0);
}
main().catch((e) => {
  console.error('E2E-P6-PUBLICURL-ERROR:', e.message);
  process.exit(1);
});
