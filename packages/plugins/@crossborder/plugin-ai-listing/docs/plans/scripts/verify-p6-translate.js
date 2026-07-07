// 创意工坊 P6 E2E:图片翻译(translate 场景)。验:
//   ① translate 场景已启用(instruct、instructionRequired=false、模板含 {target_language});
//   ② 带 targetLanguage 生成:产候选 + genParams.targetLanguage/scene 记录(证明语种注入接通);
//      (gpt-image-2 网关冷却 429 时跳过出图断言,非代码问题);
//   ③ 无凭证泄露。产物落 /tmp/p6-translate-out.png 供人工看文字是否译成目标语言、版式是否保留。
// 用法:node verify-p6-translate.js [productId] [lang]
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
const LANG = process.argv[3] || 'English';
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
  // ① translate 场景
  const scenes = (await api('/aiListingMedia:scenes')).json?.data?.scenes || [];
  const tr = scenes.find((s) => s.key === 'translate');
  check(
    '① translate 场景已启用(instruct + {target_language} 模板)',
    Boolean(tr) &&
      tr.route === 'instruct' &&
      tr.instructionRequired === false &&
      /\{target_language\}/.test(tr.promptTemplate),
    `route=${tr?.route}`,
  );

  // 选商品:取一张详情图(通常含文字)当翻译源
  let productId = Number(process.argv[2]) || 0;
  let gallery = [];
  const ids = productId
    ? [productId]
    : (await api('/aiListingReview:list', { pageSize: 200 })).json?.data?.products
        ?.filter((p) => ['processed', 'reviewing', 'publish_failed'].includes(p.status))
        .map((p) => p.id) || [];
  for (const id of ids) {
    const c = (await api('/aiListingMedia:candidates', { productId: id })).json?.data;
    if ((c?.gallery || []).filter((x) => x.url).length >= 1) {
      productId = id;
      gallery = c.gallery.filter((x) => x.url);
      break;
    }
  }
  if (!gallery.length) throw new Error('没有可编辑的商品图');
  const src = gallery.find((g) => g.role === 'detail') || gallery.find((g) => g.role === 'main') || gallery[0];
  console.log('product:', productId, 'srcImg:', src.id, 'lang:', LANG);

  // ② translate 生成
  const t0 = Date.now();
  const gen = await api(
    '/aiListingMedia:generate',
    { productId, assetId: src.id, scene: 'translate', targetLanguage: LANG, n: 1 },
    { allowFail: true },
  );
  const a = gen.json?.data?.assets?.[0];
  const errMsg = gen.json?.errors?.[0]?.message || '';
  if (a) {
    console.log('generate', Math.round((Date.now() - t0) / 1000) + 's', 'model:', gen.json?.data?.model);
    check('② translate 出候选', a.assetId > 0, `assetId=${a.assetId}`);
    const cand = (await api('/aiListingMedia:candidates', { productId })).json?.data;
    const c0 = (cand?.candidates || []).find((c) => c.id === a.assetId);
    check(
      '② genParams 记录 scene=translate + targetLanguage',
      c0?.genParams?.scene === 'translate' && c0?.genParams?.targetLanguage === LANG,
      `scene=${c0?.genParams?.scene} lang=${c0?.genParams?.targetLanguage}`,
    );
    await dl(a.url, '/tmp/p6-translate-out.png');
    console.log('  产物已存 /tmp/p6-translate-out.png(人工看文字是否译成', LANG, '、版式是否保留)');
    await api('/aiListingMedia:discard', { assetId: a.assetId }, { allowFail: true });
    console.log('  (已弃用验证候选', a.assetId, ')');
    check('③ 响应不含 sk- 凭证', !/sk-[a-zA-Z0-9]{8}/.test(JSON.stringify(cand)), '');
  } else if (/429|cooling down/i.test(errMsg)) {
    console.log('② 出图跳过:gpt-image-2 网关冷却中(429)——冷却后重跑验翻译。');
    check('② 出图(网关冷却跳过,不计失败)', true, 'skipped(429)');
  } else {
    check('② translate 出候选', false, `err=${errMsg.slice(0, 80)}`);
  }

  const failed = checks.filter((c) => !c).length;
  console.log(failed ? `E2E-P6-TRANSLATE-FAILED(${failed})` : 'E2E-P6-TRANSLATE-OK');
  process.exit(failed ? 1 : 0);
}
main().catch((e) => {
  console.error('E2E-P6-TRANSLATE-ERROR:', e.message);
  process.exit(1);
});
