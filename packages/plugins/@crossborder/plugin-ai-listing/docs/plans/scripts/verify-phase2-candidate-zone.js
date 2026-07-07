// 图片编辑闭环 Phase 2 候选区闭环 E2E(真实 Key,走运行中的 dev 服务):
//   candidates 返回 gallery(=发布装配 selectPublishableMedia 同一过滤)/candidates/adopted 三段
//   → 擦除场景生成 2 候选 → 候选带 compareMode → 采纳(追加)后 gallery +1 且含候选本地 URL、发布 precheck 仍就绪
//   → 弃用第二张后不进 gallery → hd 候选 compareMode=slider → 替换采纳:被替换原图移出 gallery、候选继承其 role/sort。
//   验证「采纳后进入发布图集」:gallery 与发布 loadProductContext 用同一 selectPublishableMedia,故 gallery 即发布图集。
// 用法:node verify-phase2-candidate-zone.js [productId]
const fs = require('fs');

const cfg = JSON.parse(fs.readFileSync(process.env.HOME + '/.nocobase/config.json', 'utf8'));
const token = cfg.envs.dev.auth.accessToken;
const BASE = cfg.envs.dev.apiBaseUrl;
const H = {
  Authorization: 'Bearer ' + token,
  'Content-Type': 'application/json',
  'X-Role': 'root',
  'X-Timezone': '+08:00',
  'X-Locale': 'zh-CN',
  'X-Hostname': 'localhost',
  'X-Authenticator': 'basic',
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
  if (!resp.ok && !allowFail) throw new Error(`${pathname} HTTP ${resp.status}: ${JSON.stringify(json).slice(0, 300)}`);
  return { status: resp.status, json };
}

const galleryIds = (panel) => (panel?.gallery || []).map((g) => g.id);

async function precheckReady(productId) {
  const r = await api('/aiListingPublish:precheck', { productIds: [productId], config: {} }, { allowFail: true });
  const res = (r.json?.data?.results || [])[0];
  return res;
}

async function main() {
  // 1. 选可编辑 + 有本地图片的商品
  let productId = Number(process.argv[2]) || 0;
  let source = null;
  const candidateIds = productId
    ? [productId]
    : (await api('/aiListingReview:list', { pageSize: 200 })).json?.data?.products
        ?.filter((p) => ['processed', 'reviewing', 'publish_failed'].includes(p.status))
        .map((p) => p.id) || [];
  for (const id of candidateIds) {
    const d = (await api('/aiListingReview:detail', { id })).json?.data;
    const imgs = (d?.media || []).filter((m) => m.assetType === 'image' && m.sourceFileId);
    if (imgs.length >= 2) {
      productId = id;
      source = imgs.find((m) => m.role === 'detail') || imgs[0];
      break;
    }
  }
  if (!source) throw new Error('没有可用的测试商品(可编辑 + ≥2 张本地图片)');
  console.log('product:', productId, 'source asset:', source.id);

  const before = (await api('/aiListingMedia:candidates', { productId })).json?.data;
  const beforeIds = galleryIds(before);
  check(
    'candidates 返回 gallery/candidates/adopted 三段',
    Array.isArray(before?.gallery) && Array.isArray(before?.candidates) && Array.isArray(before?.adopted),
    `gallery=${beforeIds.length}`,
  );

  // 2. 擦除场景生成 2 候选
  const gen = (
    await api('/aiListingMedia:generate', {
      productId,
      assetId: source.id,
      scene: 'erase',
      instruction: '品牌 logo 和文字水印',
      n: 2,
    })
  ).json;
  const assets = gen?.data?.assets || [];
  check('擦除场景生成 2 候选', gen?.ok === true && assets.length === 2, `assets=${assets.length}`);

  let panel = (await api('/aiListingMedia:candidates', { productId })).json?.data;
  const c0 = (panel?.candidates || []).find((c) => c.id === assets[0]?.assetId);
  const c1 = (panel?.candidates || []).find((c) => c.id === assets[1]?.assetId);
  check(
    '候选带对比模式(erase=并排)',
    c0?.genParams?.compareMode === 'side_by_side',
    String(c0?.genParams?.compareMode),
  );
  check('新候选未进 gallery(不进发布)', !galleryIds(panel).includes(c0.id), '');

  // 3. 采纳(追加)→ gallery +1 且含候选本地 URL,发布 precheck 仍就绪
  const readyBefore = await precheckReady(productId);
  const adopt = (await api('/aiListingMedia:adopt', { assetId: c0.id, mode: 'append' })).json;
  check('采纳(追加)成功', adopt?.ok === true && Number(adopt?.data?.sort) > 0, JSON.stringify(adopt?.data));
  panel = (await api('/aiListingMedia:candidates', { productId })).json?.data;
  const afterIds = galleryIds(panel);
  check(
    '采纳后 gallery(=发布图集)+1 且含该候选',
    afterIds.length === beforeIds.length + 1 && afterIds.includes(c0.id),
    `before=${beforeIds.length} after=${afterIds.length}`,
  );
  const adoptedInGallery = (panel?.gallery || []).find((g) => g.id === c0.id);
  check(
    '发布图集里该图为本地 /storage 候选',
    String(adoptedInGallery?.url || '').startsWith('/storage/'),
    adoptedInGallery?.url || '',
  );
  const readyAfter = await precheckReady(productId);
  check('发布 precheck 仍就绪(图集有效)', readyAfter?.ready === readyBefore?.ready, `ready=${readyAfter?.ready}`);

  // 4. 弃用第二张候选 → 不进 gallery/candidates
  const dis = (await api('/aiListingMedia:discard', { assetId: c1.id })).json;
  check('弃用第二张候选成功', dis?.ok === true, '');
  panel = (await api('/aiListingMedia:candidates', { productId })).json?.data;
  check(
    '弃用候选不在 gallery 也不在 candidates',
    !galleryIds(panel).includes(c1.id) && !(panel?.candidates || []).some((c) => c.id === c1.id),
    '',
  );

  // 5. hd 候选 compareMode=slider(拉帘对比)
  const hdGen = (
    await api('/aiListingMedia:generate', { productId, assetId: source.id, scene: 'hd', instruction: '', n: 1 })
  ).json;
  const hdAsset = (hdGen?.data?.assets || [])[0];
  panel = (await api('/aiListingMedia:candidates', { productId })).json?.data;
  const hdCand = (panel?.candidates || []).find((c) => c.id === hdAsset?.assetId);
  check(
    'hd 候选对比模式=slider(拉帘)',
    hdCand?.genParams?.compareMode === 'slider',
    String(hdCand?.genParams?.compareMode),
  );

  // 6. 替换采纳:被替换原图移出 gallery,候选继承其 role/sort
  const replaceTarget = (before?.gallery || []).find((g) => g.id === source.id) || (before?.gallery || [])[0];
  const rep = (
    await api(
      '/aiListingMedia:adopt',
      { assetId: hdCand.id, mode: 'replace', replaceAssetId: replaceTarget.id },
      { allowFail: true },
    )
  ).json;
  check(
    '替换采纳成功且继承原图 role',
    rep?.ok === true && rep?.data?.role === replaceTarget.role,
    JSON.stringify(rep?.data || rep?.errors),
  );
  panel = (await api('/aiListingMedia:candidates', { productId })).json?.data;
  check(
    '被替换原图移出 gallery、候选入 gallery',
    !galleryIds(panel).includes(replaceTarget.id) && galleryIds(panel).includes(hdCand.id),
    `gallery=${galleryIds(panel).join(',')}`,
  );

  const failed = checks.filter((c) => !c).length;
  console.log(failed ? `E2E-PHASE2-FAILED(${failed})` : 'E2E-PHASE2-OK');
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error('E2E-ERROR:', e.message);
  process.exit(1);
});
