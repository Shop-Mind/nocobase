/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

/**
 * Creative Console 设计系统 —— 预览编辑页视觉重设计的唯一样式真源。
 *
 * 视觉真源：docs/plans/mockups/preview-edit-redesign.html 的 <style>。本文件由其中样式
 * 「只改选择器、不改声明值」作用域化而来。
 *
 * 作用域约定（关键）：
 *   - :root{...} 设计令牌 与 @keyframes 保持全局（自定义属性纯惰性，不影响任何未引用它的元素）。
 *   - 其余所有组件类一律作用域化在 .aic-scope 之下（如 .aic-scope .card / .aic-scope .shopbar …）。
 *   - 因此在容器挂上 class="aic-scope" 之前，注入这套样式对现有 admin 页面「零影响」，
 *     不会与 antd / NocoBase 外壳的通用类名（.card/.chip/.field/.step…）相撞。
 *   - 后续 phase：给 MediaStudio 根、以及预览编辑 jsBlock 根加上 AIC_SCOPE_CLASS 即可复用全部组件类；
 *     MediaStudio（React）与 jsBlock 共用这一份，单一真源。
 *
 * 字体：引用 Instrument Sans / Fraunces / Noto Sans SC，但本 phase 不加任何外链字体，
 *   缺失时优雅降级到 system-ui / serif（Phase 8 再自托管，禁外链）。
 */
export const CREATIVE_CONSOLE_STYLE_ID = 'ai-listing-creative-console';

/** 挂到需要 Creative Console 视觉的容器根节点上的作用域 class。 */
export const AIC_SCOPE_CLASS = 'aic-scope';

export const CREATIVE_CONSOLE_CSS = `
:root{
    /* 中性色板（用户定稿：与系统统一的白/中性灰，不要暖棕纸色） */
    --canvas:#f5f6f8; --canvas-2:#eceef2; --paper:#ffffff; --paper-2:#fafbfc; --paper-3:#f2f3f6;
    --ink:#15121e; --ink-2:#1e1a2c; --ink-3:#2a2440;
    --violet:#6a5cff; --violet-2:#8b78ff; --violet-soft:#efeaff; --violet-line:#ded6ff;
    --amber:#ff9e2c; --amber-soft:#fff2dd; --amber-line:#f4dcae;
    --coral:#ff6a4d; --coral-soft:#ffe7e0; --coral-line:#f7cabb;
    --jade:#12b981; --jade-2:#2fd399; --jade-soft:#dcf7ec; --jade-line:#bfead6;
    --blue:#2b8cff; --blue-soft:#e3f0ff;
    --text:#1b1926; --text-2:#6b6578; --text-3:#9a94a6;
    --line:rgba(20,18,30,.09); --line-2:rgba(20,18,30,.055);
    --shadow-sm:0 1px 2px rgba(20,18,30,.05),0 2px 6px rgba(20,18,30,.045);
    --shadow-md:0 6px 22px -8px rgba(28,20,60,.2),0 2px 8px rgba(20,18,30,.05);
    --shadow-lg:0 24px 60px -20px rgba(30,20,70,.4);
  }

.aic-scope{
  font-family:"Instrument Sans","Noto Sans SC",system-ui,sans-serif;
  color:var(--text);
  font-size:13px;
  line-height:1.45;
  -webkit-font-smoothing:antialiased;
  /* 不在 scope 上涂底色：每个区块各自包一层 .aic-scope，涂色会在白色页面上留下一块块色斑（用户反馈的「突兀」）。 */
}
.aic-scope,.aic-scope *{box-sizing:border-box}

@keyframes aic-blink{50%{opacity:0}}

.aic-scope .num{font-family:"Fraunces",serif;font-variant-numeric:tabular-nums;font-feature-settings:"ss01"}

.aic-scope ::-webkit-scrollbar{width:9px;height:9px}

.aic-scope ::-webkit-scrollbar-thumb{background:rgba(20,18,30,.14);border-radius:9px;border:2px solid transparent;background-clip:content-box}

.aic-scope .wtop{display:flex;align-items:center;gap:12px;padding:12px 20px;background:var(--paper);border-bottom:1px solid var(--line)}

.aic-scope .wtop h1{font-size:15px;font-weight:700;margin:0;letter-spacing:-.2px}

.aic-scope .wtop .crumb{font-size:11px;color:var(--text-3);font-weight:600;letter-spacing:.4px}

.aic-scope .wtop .sp{flex:1}

.aic-scope .kbd{font-size:11px;color:var(--text-3);background:var(--paper-2);border:1px solid var(--line);border-radius:7px;padding:4px 9px}

.aic-scope .panes{flex:1;display:grid;grid-template-columns:266px minmax(0,1fr) 316px;gap:0;min-height:0}

.aic-scope .pane{min-height:0;overflow-y:auto}

.aic-scope .pane.list{border-right:1px solid var(--line);background:var(--paper-2)}

.aic-scope .pane.editor{background:linear-gradient(180deg,var(--paper) 0,var(--canvas) 22%,var(--canvas) 100%);padding:16px 20px 40px}

.aic-scope .pane.side{border-left:1px solid var(--line);background:var(--paper-2);padding:16px 15px 40px}

/* ── 预览编辑页三栏骨架（jsBlock 根布局）：固定像素栏宽（弃用 antd 24 格），左右栏 sticky + 自身内滚。
   挂在 jsBlock 根上（不在 .aic-scope 内），类名全局唯一。断点：<1360 收窄侧栏，<1100 纵向堆叠。 */
.aic-cols{display:flex;align-items:flex-start;gap:14px}
.aic-cols>.aic-rail{flex:0 0 250px;width:250px;min-width:0;position:sticky;top:8px;max-height:calc(100vh - 118px);overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin}
.aic-cols>.aic-rail.right{display:flex;flex-direction:column;gap:12px}
.aic-cols>.aic-main{flex:1;min-width:0}
/* 粘性保存条（Phase 5）：wrapper 承担 sticky（父级 .aic-main 高度=整列，才有滑行空间），bar 只管观感 */
.aic-savewrap{position:sticky;top:8px;z-index:30}
.aic-savewrap .savebar{display:flex;align-items:center;gap:10px;background:#fff;border:1px solid var(--amber-line);border-left:4px solid var(--amber);border-radius:12px;box-shadow:var(--shadow-md);padding:9px 14px;margin-bottom:12px}
.aic-savewrap .sb-txt{font-size:12.5px;font-weight:600;color:var(--text-2)}
.aic-savewrap .sb-txt b{color:#a5680d;font-size:14px}
.aic-savewrap .sp{flex:1}
.aic-savewrap .sb-kbd{font-size:11px;color:var(--text-3);background:var(--paper-2);border:1px solid var(--line);border-radius:6px;padding:2px 7px;white-space:nowrap}

@media (max-width:1360px){.aic-cols>.aic-rail{flex-basis:220px;width:220px}}
@media (max-width:1100px){.aic-cols{display:block}.aic-cols>.aic-rail{position:static;width:auto;max-height:none;overflow:visible;margin-bottom:12px}}

.aic-scope .lp{padding:13px 13px 8px;position:sticky;top:0;background:var(--paper-2);z-index:2;border-bottom:1px solid var(--line-2)}

.aic-scope .search{display:flex;align-items:center;gap:8px;background:#fff;border:1px solid var(--line);border-radius:10px;padding:8px 11px;box-shadow:var(--shadow-sm)}

.aic-scope .search input{border:0;outline:0;font:inherit;font-size:12.5px;flex:1;background:transparent;color:var(--text)}

.aic-scope .filters{display:flex;gap:7px;margin-top:9px}

.aic-scope .fsel{flex:1;font-size:11.5px;font-weight:600;color:var(--text-2);background:#fff;border:1px solid var(--line);border-radius:8px;padding:6px 10px;display:flex;align-items:center;justify-content:space-between;cursor:pointer}

.aic-scope .fsel::after{content:"⌄";color:var(--text-3);margin-left:4px;transform:translateY(-2px)}

.aic-scope .plist{padding:8px}

.aic-scope .pcard{display:flex;gap:10px;padding:9px;border-radius:12px;cursor:pointer;border:1.5px solid transparent;margin-bottom:4px;transition:.14s}

.aic-scope .pcard:hover{background:#fff;box-shadow:var(--shadow-sm)}

.aic-scope .pcard.on{background:#fff;border-color:var(--violet-line);box-shadow:0 0 0 3px rgba(106,92,255,.12),var(--shadow-sm)}

.aic-scope .pcard .pt{width:46px;height:46px;border-radius:9px;overflow:hidden;flex-shrink:0;box-shadow:var(--shadow-sm)}

.aic-scope .pcard .pt img{width:100%;height:100%;object-fit:cover}

.aic-scope .pcard .pb{min-width:0;flex:1}

.aic-scope .pcard .pn{font-size:12px;font-weight:600;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;color:var(--text)}

.aic-scope .pcard .pm{display:flex;align-items:center;gap:6px;margin-top:5px}

.aic-scope .badge{font-size:10px;font-weight:700;padding:2px 7px;border-radius:6px;letter-spacing:.2px}

.aic-scope .badge.pub{background:var(--jade-soft);color:#0b7a56}

.aic-scope .badge.rev{background:var(--amber-soft);color:#a5680d}

.aic-scope .badge.done{background:var(--blue-soft);color:#1a63c0}

.aic-scope .plat{font-size:10.5px;color:var(--text-3);font-weight:600}

.aic-scope .lpage{display:flex;align-items:center;justify-content:space-between;padding:11px 14px;font-size:11.5px;color:var(--text-2);border-top:1px solid var(--line-2);position:sticky;bottom:0;background:var(--paper-2)}

.aic-scope .lpage .pg{display:flex;gap:3px;align-items:center}
.aic-scope .lpage .pg i{font-style:normal;color:var(--text-3);padding:0 3px}

.aic-scope .lpage .pg b{width:22px;height:22px;border-radius:6px;display:grid;place-items:center;background:var(--violet);color:#fff;font-weight:700;font-family:"Fraunces",serif}

.aic-scope .lpage .pg span{width:22px;height:22px;border-radius:6px;display:grid;place-items:center;background:#fff;border:1px solid var(--line);cursor:pointer}

.aic-scope .card{background:var(--paper);border:1px solid var(--line);border-radius:16px;box-shadow:var(--shadow-md);margin-bottom:16px;overflow:hidden}

.aic-scope .card .cbody{padding:16px 17px}

.aic-scope .shead{display:flex;align-items:center;gap:10px;padding:12px 17px;border-bottom:1px solid var(--line-2);background:var(--paper-2)}

.aic-scope .shead .eyebrow{font-size:10.5px;font-weight:700;letter-spacing:1.3px;text-transform:uppercase;color:var(--text-3)}

.aic-scope .shead .zh{font-size:13.5px;font-weight:700;color:var(--text)}

.aic-scope .shead .i{color:var(--text-3);font-size:12px;cursor:help}

.aic-scope .shead .sp{flex:1}

.aic-scope .shead .meta{font-size:11px;color:var(--text-3);font-weight:600}

.aic-scope .shopbar{display:flex;align-items:center;gap:14px;background:var(--paper);border:1px solid var(--line);border-radius:14px;box-shadow:var(--shadow-md);padding:12px 16px;margin-bottom:14px}

.aic-scope .shopbar .sb-logo{width:38px;height:38px;border-radius:10px;display:grid;place-items:center;font-family:"Fraunces",serif;font-weight:700;font-size:17px;color:#fff;background:linear-gradient(150deg,#4a7fff,#2b8cff);flex-shrink:0;box-shadow:var(--shadow-sm)}

.aic-scope .shopbar .sb-main{min-width:0;flex:1}

.aic-scope .shopbar .sb-name{font-size:13.5px;font-weight:700;display:flex;align-items:center;gap:8px;min-width:0;flex-wrap:nowrap}

.aic-scope .shopbar .sb-name .sb-nm{flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

.aic-scope .shopbar .sb-plat{font-size:10px;font-weight:700;color:#1a63c0;background:var(--blue-soft);padding:2px 8px;border-radius:20px;white-space:nowrap;flex-shrink:0}

.aic-scope .shopbar .sb-sub{font-size:11.5px;color:var(--text-3);margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

.aic-scope .shopbar .sb-stats{display:flex;gap:13px;padding:0 13px;border-left:1px solid var(--line-2);border-right:1px solid var(--line-2);flex-shrink:0}

.aic-scope .shopbar .sb-stats .st{text-align:center}

.aic-scope .shopbar .sb-stats .sv{font-family:"Fraunces",serif;font-weight:600;font-size:16px;line-height:1}

.aic-scope .shopbar .sb-stats .sk{font-size:10px;color:var(--text-3);margin-top:4px;font-weight:600}

.aic-scope .shopbar .sb-act{color:var(--violet);font-size:12px;font-weight:600;text-decoration:none;white-space:nowrap;flex-shrink:0}

.aic-scope .ehead{background:var(--paper);border:1px solid var(--line);border-radius:16px;box-shadow:var(--shadow-md);margin-bottom:16px;padding:15px 17px}

.aic-scope .eh-top{display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap;row-gap:8px}

.aic-scope .eh-top .lbl,.aic-scope .eh-top .norm{white-space:nowrap;flex-shrink:0}

.aic-scope .eh-top .lbl{font-size:11px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--text-3)}

.aic-scope .eh-top .norm{font-size:11px;color:var(--violet);font-weight:600;background:var(--violet-soft);border:1px solid var(--violet-line);padding:2px 8px;border-radius:20px;cursor:pointer}

.aic-scope .eh-top .sp{flex:1}

.aic-scope .avs{display:flex}

.aic-scope .avs .av{width:30px;height:30px;border-radius:50%;border:2px solid var(--paper);margin-left:-6px;box-shadow:var(--shadow-sm);overflow:hidden;background:#ddd6ea;cursor:pointer;transition:transform .16s}

.aic-scope .avs .av:hover{transform:translateY(-2px)}

.aic-scope .avs .av:first-child{margin-left:0}

.aic-scope .avs .av img{width:100%;height:100%}

.aic-scope .hbtn{font:inherit;font-size:12px;font-weight:600;border-radius:9px;padding:7px 13px;cursor:pointer;display:inline-flex;align-items:center;gap:6px;white-space:nowrap}

.aic-scope .hbtn.ghost{background:#fff;border:1px solid var(--line);color:#4a4560;box-shadow:var(--shadow-sm)}

.aic-scope .hbtn.ghost:hover{border-color:var(--violet-line);color:var(--violet)}

.aic-scope .hbtn.dark{background:var(--ink);border:0;color:#fff}

.aic-scope .seg2{display:flex;background:var(--canvas-2);border-radius:9px;padding:2px}

.aic-scope .seg2 button{border:0;background:transparent;font:inherit;font-size:12px;color:var(--text-2);padding:5px 11px;border-radius:7px;cursor:pointer;font-weight:600}

.aic-scope .seg2 button.on{background:#fff;color:var(--violet);box-shadow:var(--shadow-sm)}

.aic-scope .titlein{font-size:18px;font-weight:600;line-height:1.4;color:var(--text);border:1px solid var(--line);border-radius:11px;padding:12px 14px;background:#fff;box-shadow:var(--shadow-sm)}

.aic-scope .titlein.active{border-color:var(--violet);box-shadow:0 0 0 3px rgba(106,92,255,.13)}

/* 真实编辑态：原生 textarea 版 titlein（jsBlock Header 用），贴内容自适应高度由 JS 控制 */
.aic-scope textarea.titlein{width:100%;display:block;outline:0;resize:none;overflow:hidden;font-family:inherit}
.aic-scope textarea.titlein:focus{border-color:var(--violet);box-shadow:0 0 0 3px rgba(106,92,255,.13)}
.aic-scope .titlein{word-break:break-word}
.aic-scope .eh-top button.norm{font:inherit;font-size:11px}
.aic-scope .hbtn:disabled{opacity:.55;cursor:not-allowed}
.aic-scope .chip.err{background:var(--coral-soft);color:#b3401f;border:1px solid var(--coral-line)}
.aic-scope .orig-line{font-size:11.5px;color:var(--text-3);margin-top:7px}
.aic-scope .orig-line a{color:var(--violet);margin-left:6px;cursor:pointer}

.aic-scope .titlein .cur{display:inline-block;width:2px;height:18px;background:var(--violet);vertical-align:-3px;animation:blink 1.1s steps(1) infinite}

.aic-scope .chips{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-top:11px}

.aic-scope .chip{font-size:11.5px;font-weight:600;padding:4px 11px;border-radius:20px;display:inline-flex;align-items:center;gap:5px;white-space:nowrap}

.aic-scope .chip.pub{background:var(--jade-soft);color:#0b7a56;border:1px solid var(--jade-line)}

.aic-scope .chip.src{background:var(--blue-soft);color:#1a63c0}

.aic-scope .chip.cat{background:var(--paper-2);color:var(--text-2);border:1px solid var(--line)}

.aic-scope .chip.moq{background:var(--amber-soft);color:#a5680d;border:1px solid var(--amber-line)}

.aic-scope .chip.sup{background:#fff;color:var(--text-2);border:1px solid var(--line);box-shadow:var(--shadow-sm)}

.aic-scope .cnt{font-size:11.5px;color:var(--text-2)}

.aic-scope .cnt b{font-family:"Fraunces",serif;color:var(--jade);font-weight:600}

.aic-scope .statusline{display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin-top:11px}

.aic-scope .statusline .div{width:1px;height:13px;background:var(--line)}

.aic-scope .lockhint{font-size:11px;color:var(--text-3);margin-left:auto;display:flex;align-items:center;gap:5px}

.aic-scope .banner{display:flex;align-items:center;gap:12px;padding:11px 15px;border-radius:13px;margin-bottom:16px;box-shadow:var(--shadow-sm)}

.aic-scope .banner.ok{background:linear-gradient(100deg,var(--jade-soft),#f4fdf9);border:1px solid var(--jade-line);border-left:3px solid var(--jade)}

.aic-scope .banner .bic{width:30px;height:30px;border-radius:9px;display:grid;place-items:center;font-size:15px;background:#fff;box-shadow:var(--shadow-sm);flex-shrink:0}

.aic-scope .banner .bt{font-weight:700;font-size:12.5px}

.aic-scope .banner .bs{font-size:11.5px;color:var(--text-2);margin-top:1px}

.aic-scope .banner .bs a{color:var(--violet);font-weight:600;text-decoration:none}

.aic-scope .banner .bsp{flex:1}

.aic-scope .studio-head{display:none}

.aic-scope .studio-head::after{content:"";position:absolute;inset:0;opacity:.55;pointer-events:none;
    background:radial-gradient(340px 130px at 4% -30%,rgba(139,120,255,.5),transparent 60%),radial-gradient(260px 130px at 99% 140%,rgba(255,106,77,.32),transparent 60%)}

.aic-scope .studio-head .st{font-weight:700;font-size:13.5px;display:flex;align-items:center;gap:8px;position:relative;z-index:1}

.aic-scope .studio-head .st .g{width:23px;height:23px;border-radius:7px;display:grid;place-items:center;font-size:12px;background:conic-gradient(from 200deg,#8b78ff,#6a5cff,#ff6a4d,#8b78ff)}

.aic-scope .studio-head .hint{font-size:11px;color:#b7afd6;position:relative;z-index:1}

.aic-scope .studio-tools{display:flex;gap:7px;padding:11px 15px;flex-wrap:wrap;align-items:center;background:var(--paper-2);border-bottom:1px solid var(--line-2)}

.aic-scope .tbtn{font:inherit;font-size:12px;font-weight:600;border-radius:8px;padding:6px 12px;cursor:pointer;display:inline-flex;align-items:center;gap:5px;white-space:nowrap;background:#fff;border:1px solid var(--line);color:#4a4560;box-shadow:var(--shadow-sm)}

.aic-scope .tbtn.go{border:0;color:#fff;background:linear-gradient(120deg,#7a5cff,#9b6bff);box-shadow:0 4px 12px -3px rgba(120,80,255,.6)}

.aic-scope .tbtn:not(.go):hover{border-color:var(--violet-line);color:var(--violet)}

.aic-scope .mc{margin-left:auto;display:flex;align-items:center;gap:6px;font-size:11.5px;color:var(--text-2)}

/* 生成队列 chip(工具栏右侧):⏳排队+进行 ✓完成 ✕失败,点开 Popover 看逐条状态/重试 */
.aic-scope .genq{font-weight:700;color:var(--violet);background:var(--violet-soft);border:1px solid var(--violet-line);border-radius:20px;padding:3px 10px;cursor:pointer;white-space:nowrap}

.aic-scope .mc .box{background:#fff;border:1px solid var(--line);border-radius:7px;padding:4px 9px;font-weight:600;color:var(--text)}

.aic-scope .studio-body{display:grid;grid-template-columns:220px 1fr;gap:15px;padding:15px 16px}

.aic-scope .gtabs{display:flex;gap:3px;background:var(--canvas-2);border-radius:9px;padding:3px;margin-bottom:11px}

.aic-scope .gtabs button{flex:1;border:0;background:transparent;font:inherit;font-size:11.5px;font-weight:600;color:var(--text-2);padding:5px;border-radius:7px;cursor:pointer}

.aic-scope .gtabs button.on{background:#fff;color:var(--violet);box-shadow:var(--shadow-sm)}

.aic-scope .glbl{font-size:11px;color:var(--text-3);font-weight:700;margin:4px 0 7px;letter-spacing:.3px;display:flex;align-items:center;gap:6px}

.aic-scope .glbl b{color:var(--text-2);font-family:"Fraunces",serif}

.aic-scope .glbl .roll{margin-left:auto;font-weight:500;color:var(--text-3);font-size:10px}

.aic-scope .gcol{display:flex;flex-direction:column;min-height:0;position:relative}

.aic-scope .gscroll{overflow-y:auto;max-height:560px;padding-right:7px;margin-right:-5px}

.aic-scope .gwrap{position:relative;min-height:0}
.aic-scope .gwrap::after{content:"";position:absolute;left:0;right:6px;bottom:0;height:24px;pointer-events:none;background:linear-gradient(180deg,transparent,#fff 92%)}

.aic-scope .ggrid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:12px}

.aic-scope .th{position:relative;aspect-ratio:1;border-radius:9px;overflow:hidden;cursor:pointer;box-shadow:var(--shadow-sm);border:1.5px solid transparent;transition:transform .16s,box-shadow .16s}

.aic-scope .th:hover{transform:translateY(-2px);box-shadow:var(--shadow-md)}

.aic-scope .th.sel{border-color:var(--violet);box-shadow:0 0 0 3px rgba(106,92,255,.18),var(--shadow-md)}

.aic-scope .th img{width:100%;height:100%;object-fit:cover;display:block}

.aic-scope .th .star{position:absolute;left:4px;top:4px;width:15px;height:15px;border-radius:50%;display:grid;place-items:center;
    background:linear-gradient(160deg,#ffc65c,#ff9e2c);color:#fff;font-size:9px;border:1.5px solid #fff;box-shadow:0 2px 5px rgba(255,158,44,.5)}

.aic-scope .th .chk{position:absolute;right:4px;top:4px;width:15px;height:15px;border-radius:5px;display:grid;place-items:center;background:var(--violet);color:#fff;font-size:9px;border:1.5px solid #fff}

.aic-scope .th .adp{position:absolute;right:4px;bottom:4px;width:14px;height:14px;border-radius:50%;display:grid;place-items:center;background:linear-gradient(160deg,#2fd399,#12b981);color:#fff;font-size:8px;border:1.5px solid #fff}

.aic-scope .stagelbl{display:flex;align-items:center;gap:8px;margin-bottom:9px}

.aic-scope .stagelbl .t{font-weight:700;font-size:13px}

.aic-scope .stagelbl .scene{font-size:11px;font-weight:600;color:#5a3ff0;background:var(--violet-soft);border:1px solid var(--violet-line);padding:2px 9px;border-radius:20px}

.aic-scope .stagelbl .modes{margin-left:auto;display:flex;background:var(--canvas-2);border-radius:8px;padding:2px}

.aic-scope .stagelbl .modes button{border:0;background:transparent;font:inherit;font-size:11px;font-weight:600;color:var(--text-2);padding:4px 11px;border-radius:6px;cursor:pointer}

.aic-scope .stagelbl .modes button.on{background:#fff;color:var(--violet);box-shadow:var(--shadow-sm)}

.aic-scope .stagelbl .modes button:disabled{opacity:.45;cursor:not-allowed}

.aic-scope .stagelbl .modes.submode{margin-left:8px}

.aic-scope .stage{position:relative;border-radius:13px;overflow:hidden;box-shadow:var(--shadow-md);aspect-ratio:1/1;max-height:460px;background:var(--canvas-2);user-select:none;margin:0 auto}

.aic-scope .stage::after{content:"";position:absolute;inset:0;border-radius:inherit;box-shadow:inset 0 0 0 1px rgba(20,18,30,.1);pointer-events:none}

.aic-scope .stage .layer{position:absolute;inset:0;background-size:cover;background-position:center}

.aic-scope .stage .full{inset:0;background-size:contain;background-repeat:no-repeat}

.aic-scope .stage .before{filter:saturate(.6) brightness(.99)}

.aic-scope .stage .after{clip-path:inset(0 0 0 54%);background-image:linear-gradient(120deg,rgba(255,158,44,.12),rgba(106,92,255,.1)),var(--ph);filter:saturate(1.2) brightness(1.05)}

.aic-scope .stage .tag{position:absolute;top:10px;font-size:10px;font-weight:700;letter-spacing:.4px;padding:3px 9px;border-radius:20px;color:#fff;backdrop-filter:blur(3px)}

.aic-scope .stage .tag.l{left:10px;background:rgba(20,18,30,.5)}

.aic-scope .stage .tag.r{right:10px;background:linear-gradient(120deg,#7a5cff,#ff6a4d)}

.aic-scope .stage .divider{position:absolute;top:0;bottom:0;left:54%;width:2px;background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.1)}

.aic-scope .stage .handle{position:absolute;top:50%;left:54%;transform:translate(-50%,-50%);width:36px;height:36px;border-radius:50%;background:#fff;display:grid;place-items:center;box-shadow:var(--shadow-md);color:var(--violet);font-size:15px;cursor:ew-resize}

.aic-scope .stage.duo{aspect-ratio:2/1;display:grid;grid-template-columns:1fr 1fr;gap:2px;background:var(--line)}

.aic-scope .stage.duo .duocell{position:relative;overflow:hidden;background:var(--canvas-2)}

/* 绝对定位填格：height:100% 在 auto 网格行里按 indefinite 解析（回退 auto→按原图比例撑高溢出被裁），
   absolute+inset 始终贴合格子，contain 保证两张图完整可见。 */
.aic-scope .stage.duo .duocell img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain}

.aic-scope .cand{display:flex;align-items:center;gap:7px;margin:12px 0;flex-wrap:wrap}

.aic-scope .cand .cl{font-size:11.5px;color:var(--text-2);font-weight:700}

.aic-scope .cand .candhint{font-size:11px;color:var(--text-3);margin-left:4px}

.aic-scope .stage .plabel{position:absolute;left:10px;bottom:10px;font-size:10.5px;font-weight:700;color:#fff;background:rgba(20,18,30,.5);backdrop-filter:blur(3px);padding:3px 10px;border-radius:20px}

.aic-scope .cand .ct{width:44px;height:44px;border-radius:8px;overflow:hidden;cursor:pointer;border:2px solid transparent;box-shadow:var(--shadow-sm)}

.aic-scope .cand .ct.on{border-color:var(--violet);box-shadow:0 0 0 2px rgba(106,92,255,.2)}

.aic-scope .cand .ct img{width:100%;height:100%;object-fit:cover}

.aic-scope .actbar{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-top:2px}

.aic-scope .act{font:inherit;font-size:12px;font-weight:600;border-radius:9px;padding:7px 15px;cursor:pointer;display:inline-flex;align-items:center;gap:5px}

.aic-scope .act.adopt{border:0;color:#fff;background:linear-gradient(120deg,#2fd399,#12b981);box-shadow:0 4px 12px -3px rgba(18,185,129,.55)}

.aic-scope .act.iter{background:#fff;border:1px solid var(--violet-line);color:var(--violet)}

.aic-scope .act.discard{background:#fff;border:1px solid var(--coral-line);color:var(--coral)}

.aic-scope .act:disabled,
.aic-scope .act.mut{opacity:.5}

.aic-scope .batch{font-size:10.5px;font-weight:700;color:#a5680d;background:var(--amber-soft);border:1px solid var(--amber-line);padding:2px 9px;border-radius:20px;display:inline-flex;align-items:center;gap:5px}

.aic-scope .batch .nav{cursor:pointer;color:#a5680d;font-weight:800}

.aic-scope .candbar{margin:13px auto 12px;max-width:560px}

.aic-scope .candhead{display:flex;align-items:center;gap:8px;margin-bottom:8px}

.aic-scope .candhead .cl{font-size:11.5px;color:var(--text-2);font-weight:700}

.aic-scope .candhead .cl b{font-family:"Fraunces",serif;color:var(--violet)}

.aic-scope .candhead .candhint{font-size:11px;color:var(--text-3)}

.aic-scope .candstrip{display:flex;gap:9px;overflow-x:auto;padding:2px 2px 6px}

.aic-scope .ccard{width:72px;flex-shrink:0;cursor:pointer}

.aic-scope .ccard .cimg{position:relative;width:72px;height:72px;border-radius:10px;overflow:hidden;border:2px solid transparent;box-shadow:var(--shadow-sm);transition:transform .15s}

.aic-scope .ccard:hover .cimg{transform:translateY(-2px)}

.aic-scope .ccard.on .cimg{border-color:var(--violet);box-shadow:0 0 0 3px rgba(106,92,255,.2),var(--shadow-sm)}

.aic-scope .ccard .cimg img{width:100%;height:100%;object-fit:cover}

.aic-scope .ccard .cscene{position:absolute;left:3px;top:3px;font-size:8px;font-weight:700;color:#fff;background:rgba(20,18,30,.55);backdrop-filter:blur(2px);padding:1px 6px;border-radius:20px}

.aic-scope .ccard .cchk{position:absolute;right:3px;top:3px;width:15px;height:15px;border-radius:50%;background:var(--violet);color:#fff;font-size:9px;display:none;place-items:center;border:1.5px solid #fff}

.aic-scope .ccard.on .cchk{display:grid}

.aic-scope .ccard .ctime{display:block;text-align:center;font-size:9.5px;color:var(--text-3);margin-top:4px;font-weight:600}

.aic-scope .ccard.newgen .cimg::after{content:"NEW";position:absolute;right:3px;bottom:3px;font-size:7.5px;font-weight:800;color:#fff;background:var(--jade);padding:0 4px;border-radius:4px;letter-spacing:.3px}

/* ── 候选网格视图 + 批量采纳(A2):大图同屏对比,左下角复选,candhead 里 采纳选中 N 张 ── */
.aic-scope .candbar.wide{max-width:none}
.aic-scope .candgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;padding:2px}
.aic-scope .ccard.big{width:auto}
.aic-scope .ccard.big .cimg{width:100%;height:auto;aspect-ratio:1}
.aic-scope .ccard.big .cscene{font-size:10px;padding:2px 8px}
.aic-scope .ccard .cpk{position:absolute;left:4px;bottom:4px;width:16px;height:16px;border-radius:5px;border:1.5px solid #fff;background:rgba(20,18,30,.28);color:#fff;font-size:10px;display:grid;place-items:center;cursor:pointer;opacity:0;transition:opacity .12s}
.aic-scope .ccard:hover .cpk,.aic-scope .ccard .cpk.on,.aic-scope .ccard.big .cpk{opacity:1}
.aic-scope .ccard .cpk.on{background:var(--violet);border-color:var(--violet)}
.aic-scope .candhead .modes{margin-left:auto;display:flex;background:var(--canvas-2);border-radius:8px;padding:2px}
.aic-scope .candhead .modes button{border:0;background:transparent;font:inherit;font-size:11px;font-weight:600;color:var(--text-2);padding:3px 10px;border-radius:6px;cursor:pointer;white-space:nowrap}
.aic-scope .candhead .modes button.on{background:#fff;color:var(--violet);box-shadow:var(--shadow-sm)}
.aic-scope .act.slim{font-size:11px;padding:4px 11px;border-radius:8px}

.aic-scope .vslot{margin-bottom:13px}

.aic-scope .vthumb{position:relative;width:100%;aspect-ratio:16/10;border-radius:10px;overflow:hidden;box-shadow:var(--shadow-sm);cursor:pointer;background:#15121e;border:1.5px solid transparent}

.aic-scope .vthumb:hover{box-shadow:var(--shadow-md)}

.aic-scope .vthumb img{width:100%;height:100%;object-fit:cover;opacity:.9}

.aic-scope .vthumb .vplay{position:absolute;inset:0;display:grid;place-items:center;color:#fff;font-size:22px;text-shadow:0 2px 8px rgba(0,0,0,.5)}

.aic-scope .vthumb .vbadge{position:absolute;left:5px;top:5px;font-size:9px;font-weight:700;color:#0b7a56;background:var(--jade-soft);border:1px solid var(--jade-line);padding:1px 6px;border-radius:20px}

.aic-scope .vthumb .vdur{position:absolute;right:5px;bottom:5px;font-size:9px;font-weight:700;color:#fff;background:rgba(20,18,30,.62);padding:1px 6px;border-radius:20px;font-family:"Fraunces",serif}

.aic-scope .vcap{display:flex;align-items:center;gap:6px;margin-top:6px}

.aic-scope .vcap .vt{font-size:11px;font-weight:700;color:var(--text-2)}

.aic-scope .vcap a{margin-left:auto;font-size:10.5px;font-weight:600;color:var(--jade);text-decoration:none}

.aic-scope .sup{display:flex;gap:13px;align-items:flex-start}

.aic-scope .sup .slogo{width:40px;height:40px;border-radius:11px;display:grid;place-items:center;font-family:"Fraunces",serif;font-weight:700;font-size:18px;color:#fff;background:linear-gradient(150deg,#4a7fff,#2b8cff);flex-shrink:0;box-shadow:var(--shadow-sm)}

.aic-scope .sup .sname{font-size:13.5px;font-weight:700}

.aic-scope .sup a{color:var(--violet);font-size:11.5px;font-weight:600;text-decoration:none;display:inline-block;margin:3px 0 6px}

.aic-scope .sup .smeta{font-size:11px;color:var(--text-3)}

.aic-scope .glabel{font-size:11.5px;color:var(--text-2);margin-bottom:9px}

.aic-scope .plad{display:flex;gap:10px;margin-bottom:16px}

.aic-scope .pt-tier{flex:1;border:1.5px solid var(--line);border-radius:12px;padding:11px 13px;cursor:pointer;background:#fff;position:relative;transition:.14s}

.aic-scope .pt-tier:hover{border-color:var(--coral-line)}

.aic-scope .pt-tier.on{border-color:var(--coral);background:linear-gradient(160deg,var(--coral-soft),#fff);box-shadow:0 0 0 3px rgba(255,106,77,.12)}

.aic-scope .pt-tier .pv{font-family:"Fraunces",serif;font-weight:600;font-size:22px;line-height:1}

.aic-scope .pt-tier.on .pv{color:var(--coral)}

.aic-scope .pt-tier .pq{font-size:11px;color:var(--text-3);margin-top:5px;font-weight:600}

.aic-scope .pt-tier .pick{position:absolute;top:9px;right:10px;font-size:9px;font-weight:700;color:var(--coral);background:#fff;border:1px solid var(--coral-line);padding:1px 6px;border-radius:20px;display:none}

.aic-scope .pt-tier.on .pick{display:block}

.aic-scope .specrow{display:flex;align-items:center;gap:9px;margin-bottom:11px}

.aic-scope .specrow .sl{font-size:12px;color:var(--text-2)}

.aic-scope .specrow .sl b{color:var(--text);font-weight:700}

.aic-scope .spec-chip{position:relative;font-size:12px;font-weight:700;padding:7px 15px;border-radius:10px;border:1.5px solid var(--ink);background:#fff;cursor:pointer}

.aic-scope .spec-chip .cnt2{position:absolute;top:-7px;right:-7px;width:17px;height:17px;border-radius:50%;background:var(--jade);color:#fff;font-size:10px;display:grid;place-items:center;border:2px solid var(--paper);font-family:"Fraunces",serif}

.aic-scope .skurow{display:grid;grid-template-columns:auto auto 1fr auto 1fr;gap:12px;align-items:center;padding:12px 14px;border:1px solid var(--line);border-radius:12px;background:var(--paper-2);margin-bottom:13px}

.aic-scope .skurow .tag2{font-size:12px;font-weight:700;padding:5px 12px;border-radius:8px;background:#fff;border:1px solid var(--line)}

.aic-scope .skurow .cost{font-size:11.5px;color:var(--text-2)}

.aic-scope .skurow .cost b{font-family:"Fraunces",serif;color:var(--text);font-weight:600}

.aic-scope .field{display:flex;flex-direction:column;gap:3px}

.aic-scope .field .fl{font-size:10px;font-weight:700;letter-spacing:.4px;text-transform:uppercase;color:var(--text-3)}

.aic-scope .inp{font:inherit;font-size:13px;font-weight:600;border:1px solid var(--line);border-radius:8px;padding:7px 11px;background:#fff;color:var(--text);width:100%;font-family:"Fraunces",serif;box-shadow:var(--shadow-sm)}

.aic-scope .inp:focus{outline:0;border-color:var(--violet);box-shadow:0 0 0 3px rgba(106,92,255,.13)}

.aic-scope .margin{font-family:"Fraunces",serif;font-weight:600;font-size:13px;color:var(--jade)}

.aic-scope .ladbox{border:1.5px dashed var(--violet-line);border-radius:13px;padding:14px;background:linear-gradient(160deg,#faf8ff,#fff);margin-bottom:14px}

.aic-scope .ladbox .lh{display:flex;align-items:center;gap:8px;margin-bottom:11px}

.aic-scope .ladbox .lh b{font-size:12.5px;font-weight:700}

.aic-scope .ladbox .lh .r{margin-left:auto;font-size:11px;color:var(--text-3);font-weight:600}

.aic-scope .ladrow{display:grid;grid-template-columns:auto auto 1fr auto;gap:10px;align-items:center;padding:7px 0;border-top:1px solid var(--line-2);font-size:12.5px}

.aic-scope .ladrow:first-of-type{border-top:0}

.aic-scope .ladrow .q{color:var(--text-2)}

.aic-scope .ladrow .q b{font-family:"Fraunces",serif;color:var(--text)}

.aic-scope .ladrow .approx{font-family:"Fraunces",serif;color:var(--text-3);font-size:11.5px}

.aic-scope .ladin{width:88px;font-family:"Fraunces",serif;font-weight:600;font-size:13px;border:1px solid var(--line);border-radius:7px;padding:5px 9px;background:#fff}

.aic-scope .summ{display:flex;align-items:center;gap:24px;flex-wrap:wrap;padding-top:4px}

.aic-scope .summ .s .k{font-size:11px;color:var(--text-3);font-weight:600}

.aic-scope .summ .s .v{font-family:"Fraunces",serif;font-weight:600;font-size:17px;margin-top:2px}

.aic-scope .summ .s .v.hi{color:var(--coral)}

.aic-scope .summ .s .v small{font-size:11px;color:var(--text-3);font-family:"Instrument Sans",sans-serif;font-weight:600;margin-left:3px}

.aic-scope .attrgrid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}

.aic-scope .attr{display:grid;grid-template-columns:96px 1fr;align-items:center;border:1px solid var(--line-2);border-radius:10px;overflow:hidden;background:#fff}

.aic-scope .attr .ak{font-size:11px;font-weight:700;color:var(--text-3);background:var(--paper-2);padding:9px 11px;letter-spacing:.2px}

.aic-scope .attr .av{font-size:12px;font-weight:600;padding:9px 11px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

.aic-scope .attr.ai{border-color:var(--violet-line)}

.aic-scope .attr.ai .ak{background:var(--violet-soft);color:#5a3ff0}

.aic-scope .attr.ai .ak::after{content:"AI";font-size:8px;margin-left:5px;background:#fff;border:1px solid var(--violet-line);padding:0 3px;border-radius:4px}

.aic-scope .dtabs{display:flex;gap:4px}

.aic-scope .dtabs button{border:0;background:transparent;font:inherit;font-size:12px;font-weight:600;color:var(--text-2);padding:5px 11px;border-radius:8px;cursor:pointer}

.aic-scope .dtabs button.on{background:var(--violet-soft);color:var(--violet)}

.aic-scope .desc{border:1px solid var(--line);border-radius:12px;padding:13px 15px;background:#fff;font-size:12.5px;color:var(--text-2);line-height:1.7;box-shadow:var(--shadow-sm);position:relative}

.aic-scope .desc .aiopt{position:absolute;right:12px;bottom:12px;font-size:11px;font-weight:600;color:#fff;background:linear-gradient(120deg,#7a5cff,#9b6bff);border:0;border-radius:8px;padding:6px 12px;cursor:pointer;box-shadow:0 4px 12px -3px rgba(120,80,255,.5)}

.aic-scope .srcsup{display:flex;gap:11px;align-items:flex-start;margin-bottom:11px}

.aic-scope .srcsup .slogo{width:36px;height:36px;border-radius:10px;display:grid;place-items:center;font-family:"Fraunces",serif;font-weight:700;font-size:16px;color:#fff;background:linear-gradient(150deg,#4a7fff,#2b8cff);flex-shrink:0;box-shadow:var(--shadow-sm)}

.aic-scope .srcsup .sname{font-size:12.5px;font-weight:700;line-height:1.35}

.aic-scope .srcsup a{color:var(--violet);font-size:11px;font-weight:600;text-decoration:none;display:inline-block;margin-top:4px}

.aic-scope .srcmeta{border-top:1px solid var(--line-2);padding-top:9px}

.aic-scope .mrow{display:flex;gap:10px;padding:4px 0;font-size:11.5px;align-items:baseline}

.aic-scope .mrow .mk{color:var(--text-3);font-weight:600;width:74px;flex-shrink:0}

.aic-scope .mrow .mv{color:var(--text);font-weight:600;min-width:0}

.aic-scope .mrow .mv.dim{color:var(--text-3);font-weight:500;font-size:11px}

.aic-scope .sidecard{background:var(--paper);border:1px solid var(--line);border-radius:15px;box-shadow:var(--shadow-md);margin-bottom:15px;overflow:hidden}

.aic-scope .sc-head{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid var(--line-2);flex-wrap:wrap;row-gap:6px}

.aic-scope .sc-head .t{font-size:12.5px;font-weight:700}

.aic-scope .sc-head .i{color:var(--text-3);font-size:11px}

.aic-scope .sc-head .sp{flex:1}

.aic-scope .sc-body{padding:13px 14px}

.aic-scope .viewbtn{width:100%;border:0;border-radius:10px;padding:10px;font:inherit;font-weight:700;font-size:12.5px;color:#fff;cursor:pointer;margin-bottom:13px;
    background:linear-gradient(120deg,#2b8cff,#4a7fff);box-shadow:0 5px 14px -4px rgba(43,140,255,.55)}

.aic-scope .steps{position:relative;padding-left:6px}

.aic-scope .step{display:flex;align-items:center;gap:11px;padding:7px 0;position:relative}

.aic-scope .step .dot{width:22px;height:22px;border-radius:50%;display:grid;place-items:center;font-size:11px;flex-shrink:0;z-index:1;font-weight:700}

.aic-scope .step .dot.done{background:var(--jade);color:#fff;box-shadow:0 0 0 3px var(--jade-soft)}

.aic-scope .step .dot.cur{background:var(--violet);color:#fff;box-shadow:0 0 0 4px var(--violet-soft)}

.aic-scope .step .dot.wait{background:#fff;border:1.5px solid var(--line);color:var(--text-3)}

.aic-scope .step .sl{font-size:12.5px;font-weight:600;color:var(--text)}

.aic-scope .step.waitl .sl{color:var(--text-3)}

.aic-scope .step .rb{margin-left:auto;font-size:10.5px;font-weight:600;color:var(--violet);background:var(--violet-soft);border:1px solid var(--violet-line);padding:2px 8px;border-radius:20px;cursor:pointer}

.aic-scope .step::before{content:"";position:absolute;left:10px;top:-7px;bottom:50%;width:2px;background:var(--jade)}

.aic-scope .step:first-child::before{display:none}

.aic-scope .step.waitl::before,
.aic-scope .step.curl::before{background:var(--line)}

.aic-scope .afilter{display:flex;gap:4px;margin-left:auto}

.aic-scope .afilter button{border:0;background:transparent;font:inherit;font-size:11px;font-weight:600;color:var(--text-3);padding:3px 8px;border-radius:7px;cursor:pointer}

.aic-scope .afilter button.on{background:var(--ink);color:#fff}

.aic-scope .log{position:relative}

.aic-scope .logrow{display:grid;grid-template-columns:34px 1fr;gap:8px;padding:7px 0;border-top:1px solid var(--line-2)}

.aic-scope .logrow:first-child{border-top:0}

.aic-scope .actor{font-size:9.5px;font-weight:700;letter-spacing:.3px;padding:2px 0;border-radius:6px;text-align:center;height:19px;line-height:15px;border:1px solid transparent}

.aic-scope .actor.user{background:var(--amber-soft);color:#a5680d;border-color:var(--amber-line)}

.aic-scope .actor.ai{background:var(--violet-soft);color:#5a3ff0;border-color:var(--violet-line)}

.aic-scope .actor.sys{background:var(--paper-2);color:var(--text-2);border-color:var(--line)}

.aic-scope .logrow .lc .lf{font-size:12px;font-weight:700;display:flex;align-items:center;gap:6px}

.aic-scope .logrow .lc .lf .tm{margin-left:auto;font-size:10.5px;color:var(--text-3);font-weight:500;font-family:"Fraunces",serif}

.aic-scope .logrow .lc .lv{font-size:11.5px;color:var(--text-2);margin-top:1px;line-height:1.35}

.aic-scope .logrow .lc .lv .old{text-decoration:line-through;color:var(--text-3)}

.aic-scope .logrow .lc .lv .new{font-family:"Fraunces",serif;font-weight:600;color:var(--text)}

.aic-scope .logrow .lc .ln{font-size:10.5px;color:var(--text-3);margin-top:1px;line-height:1.3}

/* ── Phase 8 收尾:防横向溢出 + 键盘焦点可见(a11y) + 窄屏优雅收拢 ── */
.aic-scope .plad,.aic-scope .studio-tools,.aic-scope .chips,.aic-scope .statusline,.aic-scope .actbar,.aic-scope .filters{flex-wrap:wrap}
.aic-scope [role="button"]:focus-visible,.aic-scope button:focus-visible,.aic-scope .pcard:focus-visible,.aic-scope .pt-tier:focus-visible,.aic-scope .th:focus-visible,.aic-scope .ccard:focus-visible,.aic-scope .spec-chip:focus-visible,.aic-scope .step .rb:focus-visible{outline:2px solid var(--violet);outline-offset:2px;border-radius:8px}
@media (max-width:920px){
  .aic-scope .studio-body{grid-template-columns:1fr}
  .aic-scope .attrgrid{grid-template-columns:1fr}
  .aic-scope .panes{grid-template-columns:1fr}
}
@media (max-width:560px){
  .aic-scope .skurow{grid-template-columns:1fr 1fr;row-gap:8px}
  .aic-scope .plad{flex-direction:column}
}
`;
