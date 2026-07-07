// 图片编辑闭环 Phase 0 E2E(真实 Key,走运行中的 dev 服务):
//   选可编辑商品的详情图 → aiListingMedia:generate 指令改图(去 logo)→ 候选落库(origin=ai_candidate,
//   本地 /storage URL,parentAssetId 溯源)→ adopt 追加进最终集(商品状态收敛 reviewing,审计 actorType=user)
//   → discard 第二张候选 → 负例:采纳已弃用候选被拒、采纳非候选原图被拒。审计/响应全程不得含 Key。
// 用法:node verify-phase0-image-edit-adopt.js [productId]
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
  // 自定义 action 的 {ok,...} 载荷会被 koa 再包一层 data;标准 list 的 data 是数组,不受影响
  if (json?.data && typeof json.data === 'object' && !Array.isArray(json.data) && 'ok' in json.data) {
    json = json.data;
  }
  if (!resp.ok && !allowFail) throw new Error(`${pathname} HTTP ${resp.status}: ${JSON.stringify(json).slice(0, 300)}`);
  return { status: resp.status, json };
}

async function main() {
  // 1. 选商品:可编辑状态 + 已下载图片(候选商品逐个探测,跳过没有本地图片资产的)
  let detail;
  let media = [];
  let productId = Number(process.argv[2]) || 0;
  const candidateIds = productId
    ? [productId]
    : (await api('/aiListingReview:list', { pageSize: 200 })).json?.data?.products
        ?.filter((p) => ['processed', 'reviewing', 'publish_failed'].includes(p.status))
        .map((p) => p.id) || [];
  if (!candidateIds.length) throw new Error('没有可编辑状态的商品');
  for (const id of candidateIds) {
    const d = (await api('/aiListingReview:detail', { id })).json?.data;
    const imgs = (d?.media || []).filter((m) => m.assetType === 'image' && m.sourceFileId);
    if (imgs.length) {
      productId = id;
      detail = d;
      media = imgs;
      break;
    }
  }
  if (!media.length) throw new Error(`可编辑商品(${candidateIds.join(',')})均没有已下载的图片资产`);
  const source = media.find((m) => m.role === 'detail') || media[0];
  console.log(
    'product:',
    productId,
    (detail?.product?.titleFinal || detail?.product?.titleOriginal || '').slice(0, 60),
  );
  console.log('source asset:', source.id, source.role);

  // 2. 指令改图(同步等待,n=2)
  const t0 = Date.now();
  const gen = (
    await api('/aiListingMedia:generate', {
      productId,
      assetId: source.id,
      instruction: '去掉图片中的品牌 logo 和所有文字水印,保持商品主体、光线与构图不变',
      n: 2,
    })
  ).json;
  const assets = gen?.data?.assets || [];
  console.log('generate 耗时', Math.round((Date.now() - t0) / 1000) + 's', 'model:', gen?.data?.model);
  check('generate 返回候选', gen?.ok === true && assets.length >= 1, `assets=${assets.length}`);
  check(
    '候选 URL 已转存本地 /storage',
    assets.length >= 1 && assets.every((a) => String(a.url).startsWith('/storage/')),
    assets.map((a) => a.url).join(' '),
  );

  // 3. 候选区:溯源 + 生成参数快照
  let cand = (await api('/aiListingMedia:candidates', { productId })).json?.data;
  const c0 = (cand?.candidates || []).find((c) => c.id === assets[0]?.assetId);
  check(
    'candidates 含新候选且 parentAssetId 溯源正确',
    Boolean(c0) && c0.parentAssetId === source.id && c0.origin === 'ai_candidate',
    JSON.stringify({ parent: c0?.parentAssetId, origin: c0?.origin }),
  );
  check('genParams 记录指令与模型', Boolean(c0?.genParams?.instruction && c0?.genParams?.model), '');

  // 4. 采纳(追加)→ 状态收敛 + adopted 集
  const adopt = (await api('/aiListingMedia:adopt', { assetId: assets[0].assetId })).json;
  check('adopt 成功且排到图集末尾', adopt?.ok === true && Number(adopt?.data?.sort) > 0, JSON.stringify(adopt?.data));
  const d2 = (await api('/aiListingReview:detail', { id: productId })).json?.data;
  check('采纳后商品状态收敛 reviewing', d2?.product?.status === 'reviewing', String(d2?.product?.status));
  cand = (await api('/aiListingMedia:candidates', { productId })).json?.data;
  check(
    '采纳后进入 adopted 集',
    (cand?.adopted || []).some((a) => a.id === assets[0].assetId),
    '',
  );

  // 5. 审计:media.adopt actorType=user,且响应/审计不含 Key
  const auditFilter = encodeURIComponent(JSON.stringify({ action: 'media.adopt', resourceId: productId }));
  const audits = (await api(`/aiListingAuditLogs:list?filter=${auditFilter}&sort=-id&pageSize=5`)).json;
  const auditRow = (audits?.data || [])[0];
  check(
    '审计 media.adopt actorType=user',
    auditRow?.actorType === 'user' && auditRow?.fieldName === `media#${assets[0].assetId}`,
    JSON.stringify({ actor: auditRow?.actorType, actorId: auditRow?.actorId, field: auditRow?.fieldName }),
  );
  check('审计不含凭证', !/sk-[a-zA-Z0-9]{8}/.test(JSON.stringify(audits?.data || {})), '');

  // 6. 弃用第二张候选 + 负例
  if (assets[1]) {
    const dis = (await api('/aiListingMedia:discard', { assetId: assets[1].assetId })).json;
    check('discard 成功', dis?.ok === true, '');
    const again = await api('/aiListingMedia:adopt', { assetId: assets[1].assetId }, { allowFail: true });
    check(
      '采纳已弃用候选被拒(400)',
      again.status === 400 && again.json?.errors?.[0]?.code === 'MEDIA_CANDIDATE_DISCARDED',
      JSON.stringify(again.json?.errors?.[0] || {}).slice(0, 140),
    );
  }
  // 负例:采纳非 AI 图(抓取原图 origin=null/'source')应被拒。注意不能用 source.id——历史数据里 role=detail 的图
  // 可能是已采纳的 AI 图(origin='ai_adopted'),而守卫允许再采纳 ai_candidate/ai_adopted;须显式挑守卫会拒的非 AI 图。
  cand = (await api('/aiListingMedia:candidates', { productId })).json?.data;
  const rawSource = (cand?.gallery || []).find((g) => g.origin !== 'ai_candidate' && g.origin !== 'ai_adopted');
  if (rawSource) {
    const wrong = await api('/aiListingMedia:adopt', { assetId: rawSource.id }, { allowFail: true });
    check(
      '采纳非候选(抓取原图)被拒',
      wrong.status === 400 && wrong.json?.errors?.[0]?.code === 'MEDIA_NOT_CANDIDATE',
      JSON.stringify(wrong.json?.errors?.[0] || {}).slice(0, 140),
    );
  } else {
    check('采纳非候选被拒(跳过:该商品图集无非 AI 原图)', true, 'skipped');
  }

  const failed = checks.filter((c) => !c).length;
  console.log(failed ? `E2E-PHASE0-FAILED(${failed})` : 'E2E-PHASE0-OK');
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error('E2E-ERROR:', e.message);
  process.exit(1);
});
