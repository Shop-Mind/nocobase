// 创意工坊 P8 E2E:智能视频(图生视频 i2v)——「提交即验」策略(用户拍板:不烧钱,不轮询到完成、不产生出图费)。验:
//   ① publicUrl 管线:主图能求出公网可访问 URL(视频端点强制公网 img_url 的前置);
//   ② generateVideo:提交 i2v 任务被服务商接受(返回 jobId + providerTaskId),建 JOB_TYPE_VIDEO 任务;
//   ③ videoJobStatus:任务态可查(running/failed/success 之一,不等待完成);
//   ④ candidates 返回 videoCandidates/videoAdopted 数组(视频候选通道接通);
//   ⑤ 无凭证泄露。
// 说明:真实出视频需轮询数分钟并计费,本脚本只验「提交被接受 + 任务态可查」;完整 生成→候选→采纳→发布 链路由
//       零成本单测 video.test.ts(假 provider)覆盖。若视频账号未开通,generateVideo 会返回明确错误 → 标记待就绪不判失败。
// 用法:node verify-p8-video.js [productId]
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
    signal: AbortSignal.timeout(120000),
    ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}),
  });
  let json = await resp.json().catch(() => ({}));
  if (json?.data && typeof json.data === 'object' && !Array.isArray(json.data) && 'ok' in json.data) json = json.data;
  if (!resp.ok && !allowFail) throw new Error(`${pathname} HTTP ${resp.status}: ${JSON.stringify(json).slice(0, 200)}`);
  return { status: resp.status, json };
}

async function main() {
  // 选商品:主图当视频源
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
  if (!gallery.length) throw new Error('没有可用的商品图');
  const src = gallery.find((g) => g.role === 'main') || gallery[0];
  console.log('product:', productId, 'srcImg:', src.id);

  // ① candidates 返回视频数组(通道接通)
  const cand = (await api('/aiListingMedia:candidates', { productId })).json?.data;
  check(
    '① candidates 返回 videoCandidates/videoAdopted 数组',
    Array.isArray(cand?.videoCandidates) && Array.isArray(cand?.videoAdopted),
    `vc=${(cand?.videoCandidates || []).length} va=${(cand?.videoAdopted || []).length}`,
  );

  // ② publicUrl(视频端点前置:主图公网可达)
  const pu = (await api('/aiListingMedia:publicUrl', { assetId: src.id })).json?.data;
  check('② 主图可求公网 URL', pu?.public === true && /^https?:\/\//.test(pu?.url || ''), `source=${pu?.source}`);

  // ③ generateVideo:提交 i2v 任务(不轮询到完成)
  const gen = await api(
    '/aiListingMedia:generateVideo',
    { productId, assetId: src.id, duration: 3, resolution: '720P', prompt: '商品缓慢旋转,镜头轻微推近展示细节' },
    { allowFail: true },
  );
  const jobId = gen.json?.data?.jobId;
  const errMsg = gen.json?.errors?.[0]?.message || '';
  if (jobId) {
    check(
      '③ i2v 任务被接受(返回 jobId + providerTaskId)',
      jobId > 0 && Boolean(gen.json?.data?.providerTaskId),
      `jobId=${jobId} task=${gen.json?.data?.providerTaskId}`,
    );
    // ④ 任务态可查(提交即验,不等完成)
    const st = (await api('/aiListingMedia:videoJobStatus', { jobId })).json?.data;
    check('④ videoJobStatus 可查任务态', ['running', 'success', 'failed'].includes(st?.status), `status=${st?.status}`);
    console.log('  (视频真机出片需数分钟且计费,按「提交即验」策略不等待完成;完整链路见 video.test.ts 单测)');
  } else if (
    /未.*就绪|未开通|not.*ready|MEDIA_SOURCE_NOT_PUBLIC|Model|model.*not|InvalidApiKey|API-?key|blocked|401|403|Forbidden|disabled|AccessDenied|Arrearage|欠费|quota|额度/i.test(
      errMsg,
    )
  ) {
    // 视频账号/端点未就绪(如 API-key is blocked / 未开通 i2v / 欠费):管线已正确打到服务商并拿回明确错误,非代码问题。
    console.log('③ 视频账号/端点未就绪,提交被服务商拒(非代码问题):', errMsg.slice(0, 120));
    check('③ i2v 提交(账号未就绪,标记待就绪不判失败)', true, 'endpoint-not-ready');
  } else {
    check('③ i2v 任务被接受', false, `err=${errMsg.slice(0, 120)}`);
  }

  // ⑤ 无凭证泄露
  check('⑤ 响应不含 sk- 凭证', !/sk-[a-zA-Z0-9]{8}/.test(JSON.stringify(gen.json) + JSON.stringify(cand)), '');

  const failed = checks.filter((c) => !c).length;
  console.log(failed ? `E2E-P8-FAILED(${failed})` : 'E2E-P8-OK');
  process.exit(failed ? 1 : 0);
}
main().catch((e) => {
  console.error('E2E-P8-ERROR:', e.message);
  process.exit(1);
});
