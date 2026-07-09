/**
 * 预览编辑页无头验收脚本：登录 → 打开页面 → 输出诊断（三栏宽度/字体加载/sticky）→ 存 3 屏滚动截图。
 *
 * 用法（凭证走环境变量，不落盘）：
 *   SHOT_ACCOUNT=<账号> SHOT_PASSWORD=<密码> node docs/plans/scripts/shot-preview-edit.js [输出目录]
 *
 * 输出：<输出目录>/live-s0.png ~ live-s2.png + stdout 诊断 JSON。
 * 依赖仓库根 node_modules/playwright；浏览器用本机 ms-playwright 缓存里的 Chrome for Testing。
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const ROOT = path.resolve(__dirname, '../../../../../../..');
const { chromium } = require(path.join(ROOT, 'node_modules/playwright'));
const OUT = process.argv[2] || __dirname;
const PAGE_URL = 'http://localhost:13000/admin/bska9eot90k';

function findChrome() {
  const base = path.join(os.homedir(), 'Library/Caches/ms-playwright');
  const dirs = fs
    .readdirSync(base)
    .filter((d) => /^chromium-\d+$/.test(d))
    .sort()
    .reverse();
  for (const d of dirs) {
    const exe = path.join(
      base,
      d,
      'chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
    );
    if (fs.existsSync(exe)) return exe;
  }
  return undefined; // 交给 playwright 默认解析
}

(async () => {
  if (!process.env.SHOT_ACCOUNT || !process.env.SHOT_PASSWORD) {
    console.error('需要 SHOT_ACCOUNT / SHOT_PASSWORD 环境变量');
    process.exit(1);
  }
  const res = await fetch('http://localhost:13000/api/auth:signIn', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Authenticator': 'basic' },
    body: JSON.stringify({ account: process.env.SHOT_ACCOUNT, password: process.env.SHOT_PASSWORD }),
  });
  const j = await res.json();
  const token = j && j.data && j.data.token;
  if (!token) {
    console.error('登录失败', res.status, JSON.stringify(j && j.errors));
    process.exit(1);
  }

  const browser = await chromium.launch({ executablePath: findChrome() });
  const ctxB = await browser.newContext({ viewport: { width: 1680, height: 1000 }, deviceScaleFactor: 1.5 });
  const page = await ctxB.newPage();
  await page.addInitScript((t) => {
    localStorage.setItem('NOCOBASE_TOKEN', t);
    localStorage.setItem('NOCOBASE_ROLE', 'root');
  }, token);
  page.on('pageerror', (e) => console.log('pageerror:', String(e).slice(0, 200)));
  await page.goto(PAGE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(10000);

  const diag = await page.evaluate(async () => {
    await document.fonts.ready;
    const cv = document.createElement('canvas').getContext('2d');
    const w = (f) => {
      cv.font = '32px ' + f;
      return Math.round(cv.measureText('0123456789 $Handbag').width * 10) / 10;
    };
    // 三栏：兼容 antd Col 和 flex 布局（取 .aic-cols 或最外层 Row 的直接子级）
    const scope = document.querySelector('.aic-scope');
    const rowEl =
      document.querySelector('.aic-cols') ||
      (scope && scope.closest('.ant-col') && scope.closest('.ant-col').parentElement);
    const cols = rowEl ? [...rowEl.children].map((c) => Math.round(c.getBoundingClientRect().width)) : [];
    const faces = [...document.fonts].map((f) => `${f.family}/${f.weight}:${f.status}`);
    // sticky 检测：找内滚容器，滚到底后左右栏是否仍有可见内容
    let scroller = document.querySelector('.aic-cols') || document.querySelector('.aic-scope');
    while (scroller && scroller !== document.body) {
      const s = getComputedStyle(scroller);
      if ((s.overflowY === 'auto' || s.overflowY === 'scroll') && scroller.scrollHeight > scroller.clientHeight + 50)
        break;
      scroller = scroller.parentElement;
    }
    if (scroller) scroller.setAttribute('data-shot-scroller', '1');
    return {
      cols,
      fontFaces: faces.slice(0, 12),
      widths: {
        fraunces: w('Fraunces'),
        serif: w('serif'),
        instrument: w('"Instrument Sans"'),
        system: w('system-ui'),
      },
      frauncesReal: w('Fraunces') !== w('serif') && [...document.fonts].some((f) => /Fraunces/i.test(f.family)),
      scrollH: scroller ? scroller.scrollHeight : document.body.scrollHeight,
    };
  });

  const scrollTo = (y) =>
    page.evaluate((yy) => {
      const s = document.querySelector('[data-shot-scroller]');
      if (s) s.scrollTo(0, yy);
      else window.scrollTo(0, yy);
    }, y);

  for (let i = 0; i < 3; i++) {
    await scrollTo(i * 900);
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(OUT, `live-s${i}.png`) });
  }
  // 滚到底后检测左右栏可见性（sticky 验收）
  const stickyCheck = await page.evaluate(() => {
    const scope = document.querySelector('.aic-scope');
    const rowEl =
      document.querySelector('.aic-cols') ||
      (scope && scope.closest('.ant-col') && scope.closest('.ant-col').parentElement);
    if (!rowEl) return null;
    const kids = [...rowEl.children];
    // 量栏内第一个子元素（sticky 卡片本体），而不是可能被拉伸的空 Col 容器
    const vis = (col) => {
      const el = col && col.firstElementChild;
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return r.height > 40 && r.bottom > 120 && r.top < innerHeight - 120;
    };
    // 诊断：sticky 元素与滚动容器之间是否有 overflow!=visible 的祖先（会让 sticky 失效/困住）
    const stickyEl = kids[0] && kids[0].firstElementChild;
    const badAncestors = [];
    let el = stickyEl && stickyEl.parentElement;
    while (el && el !== document.body) {
      const s = getComputedStyle(el);
      if (s.overflowY !== 'visible' || s.overflow === 'hidden')
        badAncestors.push(
          `${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]}(oy=${s.overflowY},h=${Math.round(
            el.getBoundingClientRect().height,
          )})`,
        );
      el = el.parentElement;
    }
    return { leftVisible: vis(kids[0]), rightVisible: vis(kids[2]), overflowAncestors: badAncestors.slice(0, 8) };
  });
  console.log(JSON.stringify({ ...diag, stickyAtBottom: stickyCheck }, null, 1));
  await browser.close();
})().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
