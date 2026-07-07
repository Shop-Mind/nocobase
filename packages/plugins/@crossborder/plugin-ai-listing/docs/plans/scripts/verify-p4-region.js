// 创意工坊 P4 E2E:提示词区域编辑(换色/擦除/细节)。P4 走「精准提示词 + 其余完全保留」(gpt-image-2 强 instruct),
// 硬像素 mask 留 P4b/DashScope。本脚本验:
//   ① recolor 场景模板注入区域指令且带「完全不变」约束(读候选 genParams.prompt);
//   ② detail 场景已启用(scenes 含 detail,instructionRequired);
//   ③ 真实出图产候选(需 gpt-image-2 网关可用;冷却 429 时提示跳过出图断言,非代码问题);
//   ④ 无凭证泄露。产物落 /tmp/p4-region-{src,out}.png 供人工看「只改指定部位」。
// 用法:node verify-p4-region.js [productId]
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
    // 带图 edits 经 codex 上游偏慢(~2–3 分钟),放宽客户端超时
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
  // ② scenes 含 detail
  const scenes = (await api('/aiListingMedia:scenes')).json?.data?.scenes || [];
  const detail = scenes.find((s) => s.key === 'detail');
  check(
    '② detail 场景已启用(instruct + instructionRequired)',
    Boolean(detail) && detail.route === 'instruct' && detail.instructionRequired === true,
    `route=${detail?.route}`,
  );

  // 选商品源图
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
  console.log('product:', productId, 'source:', src.id);

  // ③ 区域换色出图(网关冷却 429 时跳过出图断言)
  const region = '红色的那个酒瓶套换成藏青色';
  const t0 = Date.now();
  const gen = await api(
    '/aiListingMedia:generate',
    { productId, assetId: src.id, scene: 'recolor', instruction: region, n: 1 },
    { allowFail: true },
  );
  const a = gen.json?.data?.assets?.[0];
  const errMsg = gen.json?.errors?.[0]?.message || '';
  if (a) {
    console.log('generate', Math.round((Date.now() - t0) / 1000) + 's', 'model:', gen.json?.data?.model);
    check('③ 区域换色出候选', a.assetId > 0, `assetId=${a.assetId}`);
    // ① 读候选 genParams.prompt:含区域指令 + 完全不变约束
    const cand = (await api('/aiListingMedia:candidates', { productId })).json?.data;
    const c0 = (cand?.candidates || []).find((c) => c.id === a.assetId);
    const p = c0?.genParams?.prompt || '';
    check('① recolor prompt 注入区域指令 + 保留约束', p.includes(region) && p.includes('完全不变'), p.slice(0, 60));
    // 产物落盘供人工看「只改指定部位」
    await dl(src.url, '/tmp/p4-region-src.png');
    await dl(a.url, '/tmp/p4-region-out.png');
    console.log('  产物已存 /tmp/p4-region-src.png /tmp/p4-region-out.png(人工看:只有红色那个变藏青,其余不变)');
    // 清理验证候选
    await api('/aiListingMedia:discard', { assetId: a.assetId }, { allowFail: true });
    console.log('  (已弃用验证候选', a.assetId, ')');
    check('④ 响应不含 sk- 凭证', !/sk-[a-zA-Z0-9]{8}/.test(JSON.stringify(cand)), '');
  } else if (/429|cooling down/i.test(errMsg)) {
    console.log('③ 出图跳过:gpt-image-2 网关冷却中(429),非代码问题——冷却后重跑本脚本验区域换色。');
    check('③ 出图(网关冷却跳过,不计失败)', true, 'skipped(429)');
  } else {
    check('③ 区域换色出候选', false, `err=${errMsg.slice(0, 80)}`);
  }

  const failed = checks.filter((c) => !c).length;
  console.log(failed ? `E2E-P4-FAILED(${failed})` : 'E2E-P4-OK');
  process.exit(failed ? 1 : 0);
}
main().catch((e) => {
  console.error('E2E-P4-ERROR:', e.message);
  process.exit(1);
});
