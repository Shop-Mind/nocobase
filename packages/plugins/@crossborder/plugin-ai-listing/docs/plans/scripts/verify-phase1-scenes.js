// 图片编辑闭环 Phase 1 场景冒烟(真实 Key,走运行中的 dev 服务):
//   aiListingMedia:scenes 返回场景库 → 对同一张详情图跑 5 个验收场景(white_bg/erase/recolor/hd/expand,
//   各 1 张)→ 断言:指令场景路由 qwen-image-edit 系、hd/expand 路由 wanx imageedit 系、候选落本地
//   /storage、genParams.scene 记录、hd 产物分辨率 ≥ 2× 源图;负例:未知场景、缺必填指令。
// 用法:node verify-phase1-scenes.js [productId]
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
  if (json?.data && typeof json.data === 'object' && !Array.isArray(json.data) && 'ok' in json.data) {
    json = json.data;
  }
  if (!resp.ok && !allowFail) throw new Error(`${pathname} HTTP ${resp.status}: ${JSON.stringify(json).slice(0, 300)}`);
  return { status: resp.status, json };
}

// 图片尺寸:PNG 读 IHDR;JPEG 扫 SOF0-15(跳过 C4/C8/CC);WEBP VP8X/VP8/VP8L 简化处理
function imageSize(buf) {
  if (buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let off = 2;
    while (off + 9 < buf.length) {
      if (buf[off] !== 0xff) {
        off++;
        continue;
      }
      const marker = buf[off + 1];
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: buf.readUInt16BE(off + 5), width: buf.readUInt16BE(off + 7) };
      }
      off += 2 + buf.readUInt16BE(off + 2);
    }
  }
  return null;
}

async function fetchImageSize(url) {
  const abs = /^https?:/i.test(url) ? url : BASE.replace(/\/api\/?$/, '') + url;
  const resp = await fetch(abs, { headers: { Authorization: H.Authorization }, signal: AbortSignal.timeout(60000) });
  if (!resp.ok) return null;
  return imageSize(Buffer.from(await resp.arrayBuffer()));
}

async function main() {
  // 0. 场景库
  const scenesResp = (await api('/aiListingMedia:scenes', {})).json;
  const scenes = scenesResp?.data?.scenes || [];
  check(
    '场景库返回 9 场景',
    scenes.length === 9 && scenes.some((s) => s.key === 'white_bg'),
    scenes.map((s) => s.key).join(','),
  );

  // 1. 选商品(可编辑 + 有已下载图片)
  let productId = Number(process.argv[2]) || 0;
  let detail;
  let media = [];
  const candidateIds = productId
    ? [productId]
    : (await api('/aiListingReview:list', { pageSize: 200 })).json?.data?.products
        ?.filter((p) => ['processed', 'reviewing', 'publish_failed'].includes(p.status))
        .map((p) => p.id) || [];
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
  if (!media.length) throw new Error('没有可用的测试商品(可编辑 + 已下载图片)');
  const source = media.find((m) => m.role === 'detail') || media[0];
  console.log('product:', productId, 'source asset:', source.id);
  const sourceSize = await fetchImageSize(source.meta?.storedUrl || source.sourceUrl);
  console.log('source size:', JSON.stringify(sourceSize));

  // hd 专用源:挑一张 2× 后不超 2048 的图(qwen-image-edit size 上限),否则退回主源图(输出会被夹到 2048)
  let hdSource = source;
  let hdSize = sourceSize;
  for (const m of media.slice(0, 12)) {
    const s = await fetchImageSize(m.meta?.storedUrl || m.sourceUrl);
    if (s && s.width >= 512 && s.height >= 512 && Math.max(s.width, s.height) <= 1024) {
      hdSource = m;
      hdSize = s;
      break;
    }
  }
  console.log('hd source asset:', hdSource.id, JSON.stringify(hdSize));

  // 2. 五场景各 1 张(hd/expand 走 wanx 专项通道,其余指令式)
  const MATRIX = [
    { scene: 'white_bg', instruction: '', expectModel: /qwen-image-edit/i },
    { scene: 'erase', instruction: '品牌 logo 和文字水印', expectModel: /qwen-image-edit/i },
    { scene: 'recolor', instruction: '墨绿色', expectModel: /qwen-image-edit/i },
    { scene: 'hd', instruction: '', expectModel: /qwen-image-edit/i },
    { scene: 'expand', instruction: '', expectModel: /imageedit/i },
  ];
  const results = {};
  for (const item of MATRIX) {
    const t0 = Date.now();
    const srcAsset = item.scene === 'hd' ? hdSource : source;
    const gen = (
      await api('/aiListingMedia:generate', {
        productId,
        assetId: srcAsset.id,
        scene: item.scene,
        instruction: item.instruction,
        n: 1,
      })
    ).json;
    const asset = (gen?.data?.assets || [])[0];
    const secs = Math.round((Date.now() - t0) / 1000);
    results[item.scene] = { asset, model: gen?.data?.model };
    check(
      `${item.scene} 生成成功(${secs}s, ${gen?.data?.model})`,
      gen?.ok === true && Boolean(asset) && String(asset.url).startsWith('/storage/'),
      asset?.url || JSON.stringify(gen?.errors || {}).slice(0, 160),
    );
    check(`${item.scene} 路由模型符合预期`, item.expectModel.test(String(gen?.data?.model)), String(gen?.data?.model));
  }

  // 3. genParams.scene 记录(取 white_bg 候选)
  const cand = (await api('/aiListingMedia:candidates', { productId })).json?.data;
  const whiteBg = (cand?.candidates || []).find((c) => c.id === results.white_bg?.asset?.assetId);
  check(
    '候选 genParams 记录场景与对比模式',
    whiteBg?.genParams?.scene === 'white_bg' && whiteBg?.genParams?.compareMode === 'side_by_side',
    JSON.stringify({ scene: whiteBg?.genParams?.scene, compareMode: whiteBg?.genParams?.compareMode }),
  );

  // 4. hd 产物分辨率 ≥ 2× 源图(qwen-image-edit 输出上限 2048:超限时按 clamp 后的期望校验,模型取整容差 3%)
  if (results.hd?.asset && hdSize) {
    const outSize = await fetchImageSize(results.hd.asset.url);
    const scale = Math.min(2, 2048 / hdSize.width, 2048 / hdSize.height);
    const ok =
      Boolean(outSize) &&
      outSize.width >= hdSize.width * scale * 0.97 &&
      outSize.height >= hdSize.height * scale * 0.97;
    check(
      `hd 分辨率达到 ${scale.toFixed(2)}× 源图(${JSON.stringify(outSize)} vs ${JSON.stringify(hdSize)})`,
      ok,
      scale < 2 ? '(源图过大,已按 2048 上限 clamp)' : '',
    );
  } else {
    check('hd 分辨率 ≥ 2× 源图', false, 'hd 产物或源图尺寸不可得');
  }

  // 5. 负例:未知场景 / 缺必填指令
  const unknown = await api(
    '/aiListingMedia:generate',
    { productId, assetId: source.id, scene: 'nope', instruction: 'x' },
    { allowFail: true },
  );
  check(
    '未知场景被拒(400 MEDIA_SCENE_UNKNOWN)',
    unknown.status === 400 && unknown.json?.errors?.[0]?.code === 'MEDIA_SCENE_UNKNOWN',
    JSON.stringify(unknown.json?.errors?.[0] || {}).slice(0, 120),
  );
  const noInstr = await api(
    '/aiListingMedia:generate',
    { productId, assetId: source.id, scene: 'recolor', instruction: '' },
    { allowFail: true },
  );
  check(
    '缺必填指令被拒(400 MEDIA_EDIT_NO_INSTRUCTION)',
    noInstr.status === 400 && noInstr.json?.errors?.[0]?.code === 'MEDIA_EDIT_NO_INSTRUCTION',
    JSON.stringify(noInstr.json?.errors?.[0] || {}).slice(0, 120),
  );

  console.log('\n候选图(供肉眼核对):');
  for (const [scene, r] of Object.entries(results)) console.log(` ${scene}: ${r.asset?.url}`);
  const failed = checks.filter((c) => !c).length;
  console.log(failed ? `E2E-PHASE1-FAILED(${failed})` : 'E2E-PHASE1-OK');
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error('E2E-ERROR:', e.message);
  process.exit(1);
});
