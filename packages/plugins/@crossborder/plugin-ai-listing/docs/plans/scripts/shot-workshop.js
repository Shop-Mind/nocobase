// W0 · 创意工坊验收工具:无头登录 → 预览编辑页 → 打开「创意工坊」Modal → 输出结构诊断 JSON + 分功能截图。
// 用法:SHOT_ACCOUNT=xx SHOT_PASSWORD=xx [SHOT_OUT=输出目录] node shot-workshop.js
// 账号走环境变量不落盘;截图默认写 SHOT_OUT(建议指到会话 scratchpad),避免二进制进仓库。
// 诊断口径对齐 2026-07-09-creative-workshop-parity-phases.md:三区宽度 / 左轨顺序与角标 / 顶部栏 /
// 选图计数 / 张数控件形态 / 提示词计数器 / 预计消耗 / 创作历史入口有无。W1 起用同一脚本复测。
const ROOT = '/Users/wuzhixuan/code/project/nocobase';
const { chromium } = require(ROOT + '/node_modules/playwright');
const EXE =
  '/Users/wuzhixuan/Library/Caches/ms-playwright/chromium-1223/chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const OUT = process.env.SHOT_OUT || process.cwd();
const PAGE_URL = 'http://localhost:13000/admin/bska9eot90k';
// 分功能截图清单(按左轨中文名点击)
const SHOT_FUNCS = ['白底图', '场景图', '商品换色', '模特图'];

(async () => {
  const res = await fetch('http://localhost:13000/api/auth:signIn', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Authenticator': 'basic' },
    body: JSON.stringify({ account: process.env.SHOT_ACCOUNT, password: process.env.SHOT_PASSWORD }),
  });
  const token = (await res.json()).data?.token;
  if (!token) throw new Error('signIn failed');
  const browser = await chromium.launch({ executablePath: EXE });
  const ctx = await browser.newContext({ viewport: { width: 1680, height: 1000 }, deviceScaleFactor: 1.5 });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on('console', (m) => (m.type() === 'error' ? consoleErrors.push(m.text().slice(0, 200)) : null));
  await page.addInitScript((t) => {
    localStorage.setItem('NOCOBASE_TOKEN', t);
    localStorage.setItem('NOCOBASE_ROLE', 'root');
  }, token);
  await page.goto(PAGE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(9000);

  // 打开工坊(候选区工具栏按钮;排除「图生视频」那颗)
  await page.click('button:has-text("创意工坊")');
  await page.waitForSelector('.ant-modal:has-text("创意工坊")', { timeout: 15000 });
  await page.waitForTimeout(2500);

  const diag = await page.evaluate(() => {
    const modal = [...document.querySelectorAll('.ant-modal')].find((m) => m.textContent.includes('创意工坊'));
    if (!modal) return { error: 'modal not found' };
    // 左轨 = 功能 role=button 们的共同父级;三区 = 左轨父级(flex row)的直接子元素
    const railItems = [...modal.querySelectorAll('[role="button"]')].filter((b) =>
      /白底图|场景图|图片擦除|商品换色/.test(b.textContent),
    );
    const rail = railItems.length ? railItems[0].parentElement : null;
    const row = rail ? rail.parentElement : null;
    const cols = row ? [...row.children].map((c) => Math.round(c.getBoundingClientRect().width)) : [];
    const railLabels = rail
      ? [...rail.querySelectorAll('[role="button"]')].map((b) => {
          const spans = b.querySelectorAll('span');
          return spans.length > 1 ? spans[1].textContent.trim() : b.textContent.trim();
        })
      : [];
    const txt = modal.textContent;
    const middle = row ? row.children[1] : null;
    return {
      cols, // [左轨, 中栏, 右栏] 实测宽度
      railCount: railLabels.length,
      railLabels,
      railHasGroupLabel: /素材生成/.test(txt), // 阿里有「素材生成」分组标题;基线预期 false
      railNewBadges: rail
        ? [...rail.querySelectorAll('[role="button"]')].filter((b) =>
            /新/.test(
              [...b.querySelectorAll('span')]
                .slice(2)
                .map((s) => s.textContent)
                .join(''),
            ),
          ).length
        : 0,
      topTabs: [...(modal.querySelector('.ant-segmented')?.querySelectorAll('.ant-segmented-item') || [])].map((i) =>
        i.textContent.trim(),
      ),
      hasBackBtn: /返回候选区/.test(txt),
      hasHistoryEntry: /创作历史/.test(txt), // 基线预期 false;W4 点亮
      pickedText: (txt.match(/\(\d+\/9\)|已选\s*\d+/) || [null])[0], // (n/9) 计数(W1 起);旧基线为「已选 n」
      canvasState: modal.querySelector('[data-testid="ws-results"]')
        ? 'results'
        : modal.querySelector('[data-testid="ws-hero"]')
        ? 'hero'
        : 'unknown', // 画布双态:有候选=results,空闲=hero
      countControl:
        middle && middle.querySelector('.ant-input-number')
          ? 'InputNumber'
          : middle && middle.querySelector('.ant-select')
          ? 'Select'
          : 'none',
      beansText: (txt.match(/预计消耗[^i]*i豆/) || [null])[0],
      templateTabs: /推荐风格模版/.test(txt), // 模版三 tab;基线预期 false;W2 点亮
      heroOnCanvas: /效果示例|Preview/.test(row ? row.children[2]?.textContent || '' : ''),
    };
  });

  await page.screenshot({ path: OUT + '/w0-workshop-overview.png' });
  const shots = ['w0-workshop-overview.png'];
  for (const label of SHOT_FUNCS) {
    try {
      await page.click(`.ant-modal [role="button"]:has-text("${label}")`);
      await page.waitForTimeout(1200);
      const file = `w0-func-${label}.png`;
      await page.screenshot({ path: `${OUT}/${file}` });
      shots.push(file);
    } catch (e) {
      shots.push(`${label}: FAILED ${e.message.slice(0, 80)}`);
    }
  }
  // 提示词计数器要在带提示词的功能上测(白底图没有提示词框);上面循环最后停在模特图,切回场景图测
  await page.click('.ant-modal [role="button"]:has-text("场景图")');
  await page.waitForTimeout(800);
  diag.promptCounter = await page.evaluate(() => !!document.querySelector('.ant-modal .ant-input-data-count'));
  // 智能视频 tab 一张
  try {
    await page.click('.ant-modal .ant-segmented-item:has-text("智能视频")');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: OUT + '/w0-video-tab.png' });
    shots.push('w0-video-tab.png');
  } catch (e) {
    shots.push(`video-tab: FAILED ${e.message.slice(0, 80)}`);
  }

  console.log(JSON.stringify({ diag, shots, out: OUT, consoleErrors: consoleErrors.slice(0, 5) }, null, 1));
  await browser.close();
})().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
