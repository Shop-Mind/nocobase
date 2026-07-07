// 创意工坊 P7 E2E:生产流程图(process)+ 营销卖点图增强(selling_point)。验:
//   ① process 场景已启用(instruct、含 {style} 模板);selling_point 仍在;
//   ② suggestPrompts(scene=selling_point) 返回非空卖点数组(看图出卖点,复用 P3);
//   ③ process 带步骤+风格生成:产候选 + genParams.scene=process/style 记录;
//   ④ selling_point 带勾选卖点生成:产候选 + genParams.scene=selling_point 记录;
//      (gpt-image-2 网关冷却 429 时跳过该次出图断言,非代码问题);
//   ⑤ 无凭证泄露。产物落 /tmp/p7-process-out.png、/tmp/p7-sp-out.png 供人工看图文/卖点渲染。
// 用法:node verify-p7-process-sp.js [productId]
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
// 出图 + 断言 genParams(429 冷却时跳过,不计失败)
async function genAssert(label, body, out, assertGen) {
  const t0 = Date.now();
  const gen = await api('/aiListingMedia:generate', body, { allowFail: true });
  const a = gen.json?.data?.assets?.[0];
  const errMsg = gen.json?.errors?.[0]?.message || '';
  if (a) {
    console.log(`${label} generate`, Math.round((Date.now() - t0) / 1000) + 's', 'model:', gen.json?.data?.model);
    check(`${label} 出候选`, a.assetId > 0, `assetId=${a.assetId}`);
    const cand = (await api('/aiListingMedia:candidates', { productId: body.productId })).json?.data;
    const c0 = (cand?.candidates || []).find((c) => c.id === a.assetId);
    assertGen(c0);
    await dl(a.url, out);
    console.log(`  产物已存 ${out}`);
    await api('/aiListingMedia:discard', { assetId: a.assetId }, { allowFail: true });
    check(`${label} 响应不含 sk- 凭证`, !/sk-[a-zA-Z0-9]{8}/.test(JSON.stringify(cand)), '');
  } else if (/429|cooling down/i.test(errMsg)) {
    console.log(`${label} 出图跳过:gpt-image-2 网关冷却中(429)——冷却后重跑。`);
    check(`${label} 出图(网关冷却跳过,不计失败)`, true, 'skipped(429)');
  } else {
    check(`${label} 出候选`, false, `err=${errMsg.slice(0, 80)}`);
  }
}

async function main() {
  // ① 场景
  const scenes = (await api('/aiListingMedia:scenes')).json?.data?.scenes || [];
  const proc = scenes.find((s) => s.key === 'process');
  const sp = scenes.find((s) => s.key === 'selling_point');
  check(
    '① process 场景已启用(instruct + {style} 模板)',
    Boolean(proc) && proc.route === 'instruct' && /\{style\}/.test(proc.promptTemplate),
    `route=${proc?.route}`,
  );
  check('① selling_point 场景在', Boolean(sp), `route=${sp?.route}`);

  // 选商品:主图当源图
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
  const src = gallery.find((g) => g.role === 'main') || gallery[0];
  console.log('product:', productId, 'srcImg:', src.id);

  // ② suggestPrompts(selling_point) 出卖点(看图,复用 P3)
  const sug = (await api('/aiListingMedia:suggestPrompts', { assetId: src.id, scene: 'selling_point', n: 3 })).json
    ?.data;
  const points = sug?.prompts || [];
  check(
    '② 看图出卖点(非空数组)',
    Array.isArray(points) && points.length > 0,
    `${points.length}条 fallback=${sug?.fallback}`,
  );
  console.log('  卖点:', points.join(' · '));

  // ③ process 出图(步骤 + 风格)
  await genAssert(
    '③ process',
    {
      productId,
      assetId: src.id,
      scene: 'process',
      instruction: '1. 精选原料裁剪\n2. 高温压制成型\n3. 手工缝合封边\n4. 质检包装出厂',
      style: '商务信息图',
      n: 1,
    },
    '/tmp/p7-process-out.png',
    (c0) =>
      check(
        '③ genParams 记录 scene=process + style',
        c0?.genParams?.scene === 'process' && c0?.genParams?.style === '商务信息图',
        `scene=${c0?.genParams?.scene} style=${c0?.genParams?.style}`,
      ),
  );

  // ④ selling_point 出图(勾选卖点,前端用 · 连接后作 instruction)
  const joined = (points.length ? points.slice(0, 3) : ['大容量', '环保帆布', '定制印花']).join(' · ');
  await genAssert(
    '④ selling_point',
    { productId, assetId: src.id, scene: 'selling_point', instruction: joined, n: 1 },
    '/tmp/p7-sp-out.png',
    (c0) =>
      check(
        '④ genParams 记录 scene=selling_point',
        c0?.genParams?.scene === 'selling_point',
        `scene=${c0?.genParams?.scene}`,
      ),
  );

  const failed = checks.filter((c) => !c).length;
  console.log(failed ? `E2E-P7-FAILED(${failed})` : 'E2E-P7-OK');
  process.exit(failed ? 1 : 0);
}
main().catch((e) => {
  console.error('E2E-P7-ERROR:', e.message);
  process.exit(1);
});
