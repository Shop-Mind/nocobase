// P0 基线复验(非破坏性活检):不真实出图、不改数据,只验运行中服务的 aiListingMedia action 层健康:
//   scenes 返回 9 场景 / imageModels 返回 image_gen 模型清单(下拉数据源)/ candidates 三段结构 /
//   负例:采纳非候选(抓取原图)被 400 MEDIA_NOT_CANDIDATE 拦截。
// 出图闭环因 gpt-image-2 网关 401 暂不可跑,逻辑另由单测(edit-adopt/scenes/publishable-media)覆盖。
// 用法:node verify-p0-live-noncreate.js
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
    signal: AbortSignal.timeout(60000),
    ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}),
  });
  let json = await resp.json().catch(() => ({}));
  if (json?.data && typeof json.data === 'object' && !Array.isArray(json.data) && 'ok' in json.data) json = json.data;
  if (!resp.ok && !allowFail) throw new Error(`${pathname} HTTP ${resp.status}: ${JSON.stringify(json).slice(0, 200)}`);
  return { status: resp.status, json };
}

async function main() {
  // 1. scenes:9 场景齐全
  const scenes = (await api('/aiListingMedia:scenes')).json?.data?.scenes || [];
  const keys = scenes.map((s) => s.key).sort();
  const want = [
    'custom',
    'erase',
    'expand',
    'hd',
    'material',
    'recolor',
    'scene_gen',
    'selling_point',
    'white_bg',
  ].sort();
  check('scenes 返回 9 个场景', keys.length === 9 && want.every((k) => keys.includes(k)), keys.join(','));

  // 2. imageModels:模型下拉数据源(可能因网关配置为空,只验结构与是否含 gpt-image-2)
  const models = (await api('/aiListingMedia:imageModels')).json?.data?.models || [];
  check('imageModels 返回结构合法', Array.isArray(models), `count=${models.length}`);
  console.log(
    '  可选图像模型:',
    models.map((m) => `${m.llmService}:${m.model}`).join(' | ') || '(空-需在 AI员工→LLM服务 启用 image_gen 模型)',
  );

  // 3. 选一个可编辑商品,验 candidates 三段结构
  const products =
    (await api('/aiListingReview:list', { pageSize: 200 })).json?.data?.products?.filter((p) =>
      ['processed', 'reviewing', 'publish_failed'].includes(p.status),
    ) || [];
  check('存在可编辑商品', products.length > 0, `count=${products.length}`);
  const productId = products[0]?.id;
  const cand = (await api('/aiListingMedia:candidates', { productId })).json?.data;
  check(
    'candidates 返回 gallery/candidates/adopted 三段',
    cand && Array.isArray(cand.gallery) && Array.isArray(cand.candidates) && Array.isArray(cand.adopted),
    `gallery=${cand?.gallery?.length} candidates=${cand?.candidates?.length} adopted=${cand?.adopted?.length}`,
  );

  // 4. 负例:采纳一张非候选(图集里的源图/已采纳图)→ 应 400 MEDIA_NOT_CANDIDATE(不改数据)
  const nonCandidate = (cand?.gallery || [])[0];
  if (nonCandidate) {
    const wrong = await api('/aiListingMedia:adopt', { assetId: nonCandidate.id }, { allowFail: true });
    check(
      '采纳非候选被拒(400 MEDIA_NOT_CANDIDATE)',
      wrong.status === 400 && wrong.json?.errors?.[0]?.code === 'MEDIA_NOT_CANDIDATE',
      JSON.stringify(wrong.json?.errors?.[0] || {}).slice(0, 120),
    );
  } else {
    check('采纳非候选被拒(跳过:该商品图集为空)', true, 'skipped');
  }

  // 5. 负例:缺 assetId → 400
  const noId = await api('/aiListingMedia:adopt', {}, { allowFail: true });
  check('缺 assetId 被拒(400)', noId.status === 400, String(noId.status));

  // 6. 响应不含凭证
  check('活检响应不含 sk- 凭证', !/sk-[a-zA-Z0-9]{8}/.test(JSON.stringify({ scenes, models, cand })), '');

  const failed = checks.filter((c) => !c).length;
  console.log(failed ? `P0-LIVE-FAILED(${failed})` : 'P0-LIVE-OK');
  process.exit(failed ? 1 : 0);
}
main().catch((e) => {
  console.error('P0-LIVE-ERROR:', e.message);
  process.exit(1);
});
