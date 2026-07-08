/* __AIC_CSS_INJECT_START__ (mirrored from creative-console.ts — do not hand-edit; run embed-css.js) */
(function () {
  try {
    if (typeof document === 'undefined' || !document.head) return;
    if (document.getElementById('ai-listing-creative-console')) return;
    var s = document.createElement('style');
    s.id = 'ai-listing-creative-console';
    s.setAttribute('type', 'text/css');
    s.appendChild(
      document.createTextNode(
        '\n:root{\n    --canvas:#f4f1ea; --canvas-2:#eae4d9; --paper:#fffdf8; --paper-2:#faf7f0; --paper-3:#f5f1e8;\n    --ink:#15121e; --ink-2:#1e1a2c; --ink-3:#2a2440;\n    --violet:#6a5cff; --violet-2:#8b78ff; --violet-soft:#efeaff; --violet-line:#ded6ff;\n    --amber:#ff9e2c; --amber-soft:#fff2dd; --amber-line:#f4dcae;\n    --coral:#ff6a4d; --coral-soft:#ffe7e0; --coral-line:#f7cabb;\n    --jade:#12b981; --jade-2:#2fd399; --jade-soft:#dcf7ec; --jade-line:#bfead6;\n    --blue:#2b8cff; --blue-soft:#e3f0ff;\n    --text:#1b1926; --text-2:#6b6578; --text-3:#9a94a6;\n    --line:rgba(20,18,30,.09); --line-2:rgba(20,18,30,.055);\n    --shadow-sm:0 1px 2px rgba(20,18,30,.05),0 2px 6px rgba(20,18,30,.045);\n    --shadow-md:0 6px 22px -8px rgba(28,20,60,.2),0 2px 8px rgba(20,18,30,.05);\n    --shadow-lg:0 24px 60px -20px rgba(30,20,70,.4);\n  }\n\n.aic-scope{\n  font-family:"Instrument Sans","Noto Sans SC",system-ui,sans-serif;\n  color:var(--text);\n  font-size:13px;\n  line-height:1.45;\n  -webkit-font-smoothing:antialiased;\n  background:var(--canvas);\n  background-image:radial-gradient(1200px 500px at 15% -6%,rgba(106,92,255,.05),transparent 60%),radial-gradient(900px 480px at 106% 2%,rgba(255,158,44,.045),transparent 55%);\n}\n.aic-scope,.aic-scope *{box-sizing:border-box}\n\n@keyframes aic-blink{50%{opacity:0}}\n\n.aic-scope .num{font-family:"Fraunces",serif;font-variant-numeric:tabular-nums;font-feature-settings:"ss01"}\n\n.aic-scope ::-webkit-scrollbar{width:9px;height:9px}\n\n.aic-scope ::-webkit-scrollbar-thumb{background:rgba(20,18,30,.14);border-radius:9px;border:2px solid transparent;background-clip:content-box}\n\n.aic-scope .wtop{display:flex;align-items:center;gap:12px;padding:12px 20px;background:var(--paper);border-bottom:1px solid var(--line)}\n\n.aic-scope .wtop h1{font-size:15px;font-weight:700;margin:0;letter-spacing:-.2px}\n\n.aic-scope .wtop .crumb{font-size:11px;color:var(--text-3);font-weight:600;letter-spacing:.4px}\n\n.aic-scope .wtop .sp{flex:1}\n\n.aic-scope .kbd{font-size:11px;color:var(--text-3);background:var(--paper-2);border:1px solid var(--line);border-radius:7px;padding:4px 9px}\n\n.aic-scope .panes{flex:1;display:grid;grid-template-columns:266px minmax(0,1fr) 316px;gap:0;min-height:0}\n\n.aic-scope .pane{min-height:0;overflow-y:auto}\n\n.aic-scope .pane.list{border-right:1px solid var(--line);background:var(--paper-2)}\n\n.aic-scope .pane.editor{background:linear-gradient(180deg,var(--paper) 0,var(--canvas) 22%,var(--canvas) 100%);padding:16px 20px 40px}\n\n.aic-scope .pane.side{border-left:1px solid var(--line);background:var(--paper-2);padding:16px 15px 40px}\n\n.aic-scope .lp{padding:13px 13px 8px;position:sticky;top:0;background:var(--paper-2);z-index:2;border-bottom:1px solid var(--line-2)}\n\n.aic-scope .search{display:flex;align-items:center;gap:8px;background:#fff;border:1px solid var(--line);border-radius:10px;padding:8px 11px;box-shadow:var(--shadow-sm)}\n\n.aic-scope .search input{border:0;outline:0;font:inherit;font-size:12.5px;flex:1;background:transparent;color:var(--text)}\n\n.aic-scope .filters{display:flex;gap:7px;margin-top:9px}\n\n.aic-scope .fsel{flex:1;font-size:11.5px;font-weight:600;color:var(--text-2);background:#fff;border:1px solid var(--line);border-radius:8px;padding:6px 10px;display:flex;align-items:center;justify-content:space-between;cursor:pointer}\n\n.aic-scope .fsel::after{content:"⌄";color:var(--text-3);margin-left:4px;transform:translateY(-2px)}\n\n.aic-scope .plist{padding:8px}\n\n.aic-scope .pcard{display:flex;gap:10px;padding:9px;border-radius:12px;cursor:pointer;border:1.5px solid transparent;margin-bottom:4px;transition:.14s}\n\n.aic-scope .pcard:hover{background:#fff;box-shadow:var(--shadow-sm)}\n\n.aic-scope .pcard.on{background:#fff;border-color:var(--violet-line);box-shadow:0 0 0 3px rgba(106,92,255,.12),var(--shadow-sm)}\n\n.aic-scope .pcard .pt{width:46px;height:46px;border-radius:9px;overflow:hidden;flex-shrink:0;box-shadow:var(--shadow-sm)}\n\n.aic-scope .pcard .pt img{width:100%;height:100%;object-fit:cover}\n\n.aic-scope .pcard .pb{min-width:0;flex:1}\n\n.aic-scope .pcard .pn{font-size:12px;font-weight:600;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;color:var(--text)}\n\n.aic-scope .pcard .pm{display:flex;align-items:center;gap:6px;margin-top:5px}\n\n.aic-scope .badge{font-size:10px;font-weight:700;padding:2px 7px;border-radius:6px;letter-spacing:.2px}\n\n.aic-scope .badge.pub{background:var(--jade-soft);color:#0b7a56}\n\n.aic-scope .badge.rev{background:var(--amber-soft);color:#a5680d}\n\n.aic-scope .badge.done{background:var(--blue-soft);color:#1a63c0}\n\n.aic-scope .plat{font-size:10.5px;color:var(--text-3);font-weight:600}\n\n.aic-scope .lpage{display:flex;align-items:center;justify-content:space-between;padding:11px 14px;font-size:11.5px;color:var(--text-2);border-top:1px solid var(--line-2);position:sticky;bottom:0;background:var(--paper-2)}\n\n.aic-scope .lpage .pg{display:flex;gap:3px}\n\n.aic-scope .lpage .pg b{width:22px;height:22px;border-radius:6px;display:grid;place-items:center;background:var(--violet);color:#fff;font-weight:700;font-family:"Fraunces",serif}\n\n.aic-scope .lpage .pg span{width:22px;height:22px;border-radius:6px;display:grid;place-items:center;background:#fff;border:1px solid var(--line);cursor:pointer}\n\n.aic-scope .card{background:var(--paper);border:1px solid var(--line);border-radius:16px;box-shadow:var(--shadow-md);margin-bottom:16px;overflow:hidden}\n\n.aic-scope .card .cbody{padding:16px 17px}\n\n.aic-scope .shead{display:flex;align-items:center;gap:10px;padding:12px 17px;border-bottom:1px solid var(--line-2);background:var(--paper-2)}\n\n.aic-scope .shead .eyebrow{font-size:10.5px;font-weight:700;letter-spacing:1.3px;text-transform:uppercase;color:var(--text-3)}\n\n.aic-scope .shead .zh{font-size:13.5px;font-weight:700;color:var(--text)}\n\n.aic-scope .shead .i{color:var(--text-3);font-size:12px;cursor:help}\n\n.aic-scope .shead .sp{flex:1}\n\n.aic-scope .shead .meta{font-size:11px;color:var(--text-3);font-weight:600}\n\n.aic-scope .shopbar{display:flex;align-items:center;gap:14px;background:var(--paper);border:1px solid var(--line);border-radius:14px;box-shadow:var(--shadow-md);padding:12px 16px;margin-bottom:14px}\n\n.aic-scope .shopbar .sb-logo{width:38px;height:38px;border-radius:10px;display:grid;place-items:center;font-family:"Fraunces",serif;font-weight:700;font-size:17px;color:#fff;background:linear-gradient(150deg,#4a7fff,#2b8cff);flex-shrink:0;box-shadow:var(--shadow-sm)}\n\n.aic-scope .shopbar .sb-main{min-width:0;flex:1}\n\n.aic-scope .shopbar .sb-name{font-size:13.5px;font-weight:700;display:flex;align-items:center;gap:8px;min-width:0;flex-wrap:nowrap}\n\n.aic-scope .shopbar .sb-name .sb-nm{flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\n\n.aic-scope .shopbar .sb-plat{font-size:10px;font-weight:700;color:#1a63c0;background:var(--blue-soft);padding:2px 8px;border-radius:20px;white-space:nowrap;flex-shrink:0}\n\n.aic-scope .shopbar .sb-sub{font-size:11.5px;color:var(--text-3);margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\n\n.aic-scope .shopbar .sb-stats{display:flex;gap:13px;padding:0 13px;border-left:1px solid var(--line-2);border-right:1px solid var(--line-2);flex-shrink:0}\n\n.aic-scope .shopbar .sb-stats .st{text-align:center}\n\n.aic-scope .shopbar .sb-stats .sv{font-family:"Fraunces",serif;font-weight:600;font-size:16px;line-height:1}\n\n.aic-scope .shopbar .sb-stats .sk{font-size:10px;color:var(--text-3);margin-top:4px;font-weight:600}\n\n.aic-scope .shopbar .sb-act{color:var(--violet);font-size:12px;font-weight:600;text-decoration:none;white-space:nowrap;flex-shrink:0}\n\n.aic-scope .ehead{background:var(--paper);border:1px solid var(--line);border-radius:16px;box-shadow:var(--shadow-md);margin-bottom:16px;padding:15px 17px}\n\n.aic-scope .eh-top{display:flex;align-items:center;gap:10px;margin-bottom:12px}\n\n.aic-scope .eh-top .lbl{font-size:11px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--text-3)}\n\n.aic-scope .eh-top .norm{font-size:11px;color:var(--violet);font-weight:600;background:var(--violet-soft);border:1px solid var(--violet-line);padding:2px 8px;border-radius:20px;cursor:pointer}\n\n.aic-scope .eh-top .sp{flex:1}\n\n.aic-scope .avs{display:flex}\n\n.aic-scope .avs .av{width:30px;height:30px;border-radius:50%;border:2px solid var(--paper);margin-left:-6px;box-shadow:var(--shadow-sm);overflow:hidden;background:#ddd6ea;cursor:pointer;transition:transform .16s}\n\n.aic-scope .avs .av:hover{transform:translateY(-2px)}\n\n.aic-scope .avs .av:first-child{margin-left:0}\n\n.aic-scope .avs .av img{width:100%;height:100%}\n\n.aic-scope .hbtn{font:inherit;font-size:12px;font-weight:600;border-radius:9px;padding:7px 13px;cursor:pointer;display:inline-flex;align-items:center;gap:6px;white-space:nowrap}\n\n.aic-scope .hbtn.ghost{background:#fff;border:1px solid var(--line);color:#4a4560;box-shadow:var(--shadow-sm)}\n\n.aic-scope .hbtn.ghost:hover{border-color:var(--violet-line);color:var(--violet)}\n\n.aic-scope .hbtn.dark{background:var(--ink);border:0;color:#fff}\n\n.aic-scope .seg2{display:flex;background:var(--canvas-2);border-radius:9px;padding:2px}\n\n.aic-scope .seg2 button{border:0;background:transparent;font:inherit;font-size:12px;color:var(--text-2);padding:5px 11px;border-radius:7px;cursor:pointer;font-weight:600}\n\n.aic-scope .seg2 button.on{background:#fff;color:var(--violet);box-shadow:var(--shadow-sm)}\n\n.aic-scope .titlein{font-size:18px;font-weight:600;line-height:1.4;color:var(--text);border:1px solid var(--line);border-radius:11px;padding:12px 14px;background:#fff;box-shadow:var(--shadow-sm)}\n\n.aic-scope .titlein.active{border-color:var(--violet);box-shadow:0 0 0 3px rgba(106,92,255,.13)}\n\n.aic-scope .titlein .cur{display:inline-block;width:2px;height:18px;background:var(--violet);vertical-align:-3px;animation:blink 1.1s steps(1) infinite}\n\n.aic-scope .chips{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-top:11px}\n\n.aic-scope .chip{font-size:11.5px;font-weight:600;padding:4px 11px;border-radius:20px;display:inline-flex;align-items:center;gap:5px}\n\n.aic-scope .chip.pub{background:var(--jade-soft);color:#0b7a56;border:1px solid var(--jade-line)}\n\n.aic-scope .chip.src{background:var(--blue-soft);color:#1a63c0}\n\n.aic-scope .chip.cat{background:var(--paper-2);color:var(--text-2);border:1px solid var(--line)}\n\n.aic-scope .chip.moq{background:var(--amber-soft);color:#a5680d;border:1px solid var(--amber-line)}\n\n.aic-scope .chip.sup{background:#fff;color:var(--text-2);border:1px solid var(--line);box-shadow:var(--shadow-sm)}\n\n.aic-scope .cnt{font-size:11.5px;color:var(--text-2)}\n\n.aic-scope .cnt b{font-family:"Fraunces",serif;color:var(--jade);font-weight:600}\n\n.aic-scope .statusline{display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin-top:11px}\n\n.aic-scope .statusline .div{width:1px;height:13px;background:var(--line)}\n\n.aic-scope .lockhint{font-size:11px;color:var(--text-3);margin-left:auto;display:flex;align-items:center;gap:5px}\n\n.aic-scope .banner{display:flex;align-items:center;gap:12px;padding:11px 15px;border-radius:13px;margin-bottom:16px;box-shadow:var(--shadow-sm)}\n\n.aic-scope .banner.ok{background:linear-gradient(100deg,var(--jade-soft),#f4fdf9);border:1px solid var(--jade-line);border-left:3px solid var(--jade)}\n\n.aic-scope .banner .bic{width:30px;height:30px;border-radius:9px;display:grid;place-items:center;font-size:15px;background:#fff;box-shadow:var(--shadow-sm);flex-shrink:0}\n\n.aic-scope .banner .bt{font-weight:700;font-size:12.5px}\n\n.aic-scope .banner .bs{font-size:11.5px;color:var(--text-2);margin-top:1px}\n\n.aic-scope .banner .bs a{color:var(--violet);font-weight:600;text-decoration:none}\n\n.aic-scope .banner .bsp{flex:1}\n\n.aic-scope .studio-head{display:flex;align-items:center;gap:10px;padding:13px 17px;background:linear-gradient(115deg,#1b1530,#261c42);color:#efeafc;position:relative;overflow:hidden;flex-wrap:wrap}\n\n.aic-scope .studio-head::after{content:"";position:absolute;inset:0;opacity:.55;pointer-events:none;\n    background:radial-gradient(340px 130px at 4% -30%,rgba(139,120,255,.5),transparent 60%),radial-gradient(260px 130px at 99% 140%,rgba(255,106,77,.32),transparent 60%)}\n\n.aic-scope .studio-head .st{font-weight:700;font-size:13.5px;display:flex;align-items:center;gap:8px;position:relative;z-index:1}\n\n.aic-scope .studio-head .st .g{width:23px;height:23px;border-radius:7px;display:grid;place-items:center;font-size:12px;background:conic-gradient(from 200deg,#8b78ff,#6a5cff,#ff6a4d,#8b78ff)}\n\n.aic-scope .studio-head .hint{font-size:11px;color:#b7afd6;position:relative;z-index:1}\n\n.aic-scope .studio-tools{display:flex;gap:7px;padding:11px 15px;flex-wrap:wrap;align-items:center;background:var(--paper-2);border-bottom:1px solid var(--line-2)}\n\n.aic-scope .tbtn{font:inherit;font-size:12px;font-weight:600;border-radius:8px;padding:6px 12px;cursor:pointer;display:inline-flex;align-items:center;gap:5px;white-space:nowrap;background:#fff;border:1px solid var(--line);color:#4a4560;box-shadow:var(--shadow-sm)}\n\n.aic-scope .tbtn.go{border:0;color:#fff;background:linear-gradient(120deg,#7a5cff,#9b6bff);box-shadow:0 4px 12px -3px rgba(120,80,255,.6)}\n\n.aic-scope .tbtn:not(.go):hover{border-color:var(--violet-line);color:var(--violet)}\n\n.aic-scope .mc{margin-left:auto;display:flex;align-items:center;gap:6px;font-size:11.5px;color:var(--text-2)}\n\n.aic-scope .mc .box{background:#fff;border:1px solid var(--line);border-radius:7px;padding:4px 9px;font-weight:600;color:var(--text)}\n\n.aic-scope .studio-body{display:grid;grid-template-columns:190px 1fr;gap:15px;padding:15px 16px}\n\n.aic-scope .gtabs{display:flex;gap:3px;background:var(--canvas-2);border-radius:9px;padding:3px;margin-bottom:11px}\n\n.aic-scope .gtabs button{flex:1;border:0;background:transparent;font:inherit;font-size:11.5px;font-weight:600;color:var(--text-2);padding:5px;border-radius:7px;cursor:pointer}\n\n.aic-scope .gtabs button.on{background:#fff;color:var(--violet);box-shadow:var(--shadow-sm)}\n\n.aic-scope .glbl{font-size:11px;color:var(--text-3);font-weight:700;margin:4px 0 7px;letter-spacing:.3px;display:flex;align-items:center;gap:6px}\n\n.aic-scope .glbl b{color:var(--text-2);font-family:"Fraunces",serif}\n\n.aic-scope .glbl .roll{margin-left:auto;font-weight:500;color:var(--text-3);font-size:10px}\n\n.aic-scope .gcol{display:flex;flex-direction:column;min-height:0;position:relative}\n\n.aic-scope .gscroll{overflow-y:auto;max-height:452px;padding-right:7px;margin-right:-5px}\n\n.aic-scope .gcol::after{content:"";position:absolute;left:0;right:6px;bottom:0;height:24px;pointer-events:none;background:linear-gradient(180deg,transparent,var(--paper-2) 92%)}\n\n.aic-scope .ggrid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:12px}\n\n.aic-scope .th{position:relative;aspect-ratio:1;border-radius:9px;overflow:hidden;cursor:pointer;box-shadow:var(--shadow-sm);border:1.5px solid transparent;transition:transform .16s,box-shadow .16s}\n\n.aic-scope .th:hover{transform:translateY(-2px);box-shadow:var(--shadow-md)}\n\n.aic-scope .th.sel{border-color:var(--violet);box-shadow:0 0 0 3px rgba(106,92,255,.18),var(--shadow-md)}\n\n.aic-scope .th img{width:100%;height:100%;object-fit:cover;display:block}\n\n.aic-scope .th .star{position:absolute;left:4px;top:4px;width:15px;height:15px;border-radius:50%;display:grid;place-items:center;\n    background:linear-gradient(160deg,#ffc65c,#ff9e2c);color:#fff;font-size:9px;border:1.5px solid #fff;box-shadow:0 2px 5px rgba(255,158,44,.5)}\n\n.aic-scope .th .chk{position:absolute;right:4px;top:4px;width:15px;height:15px;border-radius:5px;display:grid;place-items:center;background:var(--violet);color:#fff;font-size:9px;border:1.5px solid #fff}\n\n.aic-scope .th .adp{position:absolute;right:4px;bottom:4px;width:14px;height:14px;border-radius:50%;display:grid;place-items:center;background:linear-gradient(160deg,#2fd399,#12b981);color:#fff;font-size:8px;border:1.5px solid #fff}\n\n.aic-scope .stagelbl{display:flex;align-items:center;gap:8px;margin-bottom:9px}\n\n.aic-scope .stagelbl .t{font-weight:700;font-size:13px}\n\n.aic-scope .stagelbl .scene{font-size:11px;font-weight:600;color:#5a3ff0;background:var(--violet-soft);border:1px solid var(--violet-line);padding:2px 9px;border-radius:20px}\n\n.aic-scope .stagelbl .modes{margin-left:auto;display:flex;background:var(--canvas-2);border-radius:8px;padding:2px}\n\n.aic-scope .stagelbl .modes button{border:0;background:transparent;font:inherit;font-size:11px;font-weight:600;color:var(--text-2);padding:4px 11px;border-radius:6px;cursor:pointer}\n\n.aic-scope .stagelbl .modes button.on{background:#fff;color:var(--violet);box-shadow:var(--shadow-sm)}\n\n.aic-scope .stagelbl .modes button:disabled{opacity:.45;cursor:not-allowed}\n\n.aic-scope .stagelbl .modes.submode{margin-left:8px}\n\n.aic-scope .stage{position:relative;border-radius:13px;overflow:hidden;box-shadow:var(--shadow-md);aspect-ratio:1/1;max-height:330px;background:#efeae0;user-select:none;margin:0 auto}\n\n.aic-scope .stage .layer{position:absolute;inset:0;background-size:cover;background-position:center}\n\n.aic-scope .stage .full{inset:0}\n\n.aic-scope .stage .before{filter:saturate(.6) brightness(.99)}\n\n.aic-scope .stage .after{clip-path:inset(0 0 0 54%);background-image:linear-gradient(120deg,rgba(255,158,44,.12),rgba(106,92,255,.1)),var(--ph);filter:saturate(1.2) brightness(1.05)}\n\n.aic-scope .stage .tag{position:absolute;top:10px;font-size:10px;font-weight:700;letter-spacing:.4px;padding:3px 9px;border-radius:20px;color:#fff;backdrop-filter:blur(3px)}\n\n.aic-scope .stage .tag.l{left:10px;background:rgba(20,18,30,.5)}\n\n.aic-scope .stage .tag.r{right:10px;background:linear-gradient(120deg,#7a5cff,#ff6a4d)}\n\n.aic-scope .stage .divider{position:absolute;top:0;bottom:0;left:54%;width:2px;background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.1)}\n\n.aic-scope .stage .handle{position:absolute;top:50%;left:54%;transform:translate(-50%,-50%);width:36px;height:36px;border-radius:50%;background:#fff;display:grid;place-items:center;box-shadow:var(--shadow-md);color:var(--violet);font-size:15px;cursor:ew-resize}\n\n.aic-scope .stage.duo{aspect-ratio:2/1;display:grid;grid-template-columns:1fr 1fr;gap:2px;background:#d9d2c6}\n\n.aic-scope .stage.duo .duocell{position:relative;overflow:hidden;background:#efeae0;display:grid;place-items:center}\n\n.aic-scope .stage.duo .duocell img{width:100%;height:100%;object-fit:contain}\n\n.aic-scope .cand{display:flex;align-items:center;gap:7px;margin:12px 0;flex-wrap:wrap}\n\n.aic-scope .cand .cl{font-size:11.5px;color:var(--text-2);font-weight:700}\n\n.aic-scope .cand .candhint{font-size:11px;color:var(--text-3);margin-left:4px}\n\n.aic-scope .stage .plabel{position:absolute;left:10px;bottom:10px;font-size:10.5px;font-weight:700;color:#fff;background:rgba(20,18,30,.5);backdrop-filter:blur(3px);padding:3px 10px;border-radius:20px}\n\n.aic-scope .cand .ct{width:44px;height:44px;border-radius:8px;overflow:hidden;cursor:pointer;border:2px solid transparent;box-shadow:var(--shadow-sm)}\n\n.aic-scope .cand .ct.on{border-color:var(--violet);box-shadow:0 0 0 2px rgba(106,92,255,.2)}\n\n.aic-scope .cand .ct img{width:100%;height:100%;object-fit:cover}\n\n.aic-scope .actbar{display:flex;gap:8px;flex-wrap:wrap}\n\n.aic-scope .act{font:inherit;font-size:12px;font-weight:600;border-radius:9px;padding:7px 15px;cursor:pointer;display:inline-flex;align-items:center;gap:5px}\n\n.aic-scope .act.adopt{border:0;color:#fff;background:linear-gradient(120deg,#2fd399,#12b981);box-shadow:0 4px 12px -3px rgba(18,185,129,.55)}\n\n.aic-scope .act.iter{background:#fff;border:1px solid var(--violet-line);color:var(--violet)}\n\n.aic-scope .act.discard{background:#fff;border:1px solid var(--coral-line);color:var(--coral)}\n\n.aic-scope .act:disabled,\n.aic-scope .act.mut{opacity:.5}\n\n.aic-scope .batch{font-size:10.5px;font-weight:700;color:#a5680d;background:var(--amber-soft);border:1px solid var(--amber-line);padding:2px 9px;border-radius:20px;display:inline-flex;align-items:center;gap:5px}\n\n.aic-scope .batch .nav{cursor:pointer;color:#a5680d;font-weight:800}\n\n.aic-scope .candbar{margin:13px 0 12px}\n\n.aic-scope .candhead{display:flex;align-items:center;gap:8px;margin-bottom:8px}\n\n.aic-scope .candhead .cl{font-size:11.5px;color:var(--text-2);font-weight:700}\n\n.aic-scope .candhead .cl b{font-family:"Fraunces",serif;color:var(--violet)}\n\n.aic-scope .candhead .candhint{font-size:11px;color:var(--text-3)}\n\n.aic-scope .candstrip{display:flex;gap:9px;overflow-x:auto;padding:2px 2px 6px}\n\n.aic-scope .ccard{width:72px;flex-shrink:0;cursor:pointer}\n\n.aic-scope .ccard .cimg{position:relative;width:72px;height:72px;border-radius:10px;overflow:hidden;border:2px solid transparent;box-shadow:var(--shadow-sm);transition:transform .15s}\n\n.aic-scope .ccard:hover .cimg{transform:translateY(-2px)}\n\n.aic-scope .ccard.on .cimg{border-color:var(--violet);box-shadow:0 0 0 3px rgba(106,92,255,.2),var(--shadow-sm)}\n\n.aic-scope .ccard .cimg img{width:100%;height:100%;object-fit:cover}\n\n.aic-scope .ccard .cscene{position:absolute;left:3px;top:3px;font-size:8px;font-weight:700;color:#fff;background:rgba(20,18,30,.55);backdrop-filter:blur(2px);padding:1px 6px;border-radius:20px}\n\n.aic-scope .ccard .cchk{position:absolute;right:3px;top:3px;width:15px;height:15px;border-radius:50%;background:var(--violet);color:#fff;font-size:9px;display:none;place-items:center;border:1.5px solid #fff}\n\n.aic-scope .ccard.on .cchk{display:grid}\n\n.aic-scope .ccard .ctime{display:block;text-align:center;font-size:9.5px;color:var(--text-3);margin-top:4px;font-weight:600}\n\n.aic-scope .ccard.newgen .cimg::after{content:"NEW";position:absolute;right:3px;bottom:3px;font-size:7.5px;font-weight:800;color:#fff;background:var(--jade);padding:0 4px;border-radius:4px;letter-spacing:.3px}\n\n.aic-scope .vslot{margin-bottom:13px}\n\n.aic-scope .vthumb{position:relative;width:100%;aspect-ratio:16/10;border-radius:10px;overflow:hidden;box-shadow:var(--shadow-sm);cursor:pointer;background:#15121e;border:1.5px solid transparent}\n\n.aic-scope .vthumb:hover{box-shadow:var(--shadow-md)}\n\n.aic-scope .vthumb img{width:100%;height:100%;object-fit:cover;opacity:.9}\n\n.aic-scope .vthumb .vplay{position:absolute;inset:0;display:grid;place-items:center;color:#fff;font-size:22px;text-shadow:0 2px 8px rgba(0,0,0,.5)}\n\n.aic-scope .vthumb .vbadge{position:absolute;left:5px;top:5px;font-size:9px;font-weight:700;color:#0b7a56;background:var(--jade-soft);border:1px solid var(--jade-line);padding:1px 6px;border-radius:20px}\n\n.aic-scope .vthumb .vdur{position:absolute;right:5px;bottom:5px;font-size:9px;font-weight:700;color:#fff;background:rgba(20,18,30,.62);padding:1px 6px;border-radius:20px;font-family:"Fraunces",serif}\n\n.aic-scope .vcap{display:flex;align-items:center;gap:6px;margin-top:6px}\n\n.aic-scope .vcap .vt{font-size:11px;font-weight:700;color:var(--text-2)}\n\n.aic-scope .vcap a{margin-left:auto;font-size:10.5px;font-weight:600;color:var(--jade);text-decoration:none}\n\n.aic-scope .sup{display:flex;gap:13px;align-items:flex-start}\n\n.aic-scope .sup .slogo{width:40px;height:40px;border-radius:11px;display:grid;place-items:center;font-family:"Fraunces",serif;font-weight:700;font-size:18px;color:#fff;background:linear-gradient(150deg,#4a7fff,#2b8cff);flex-shrink:0;box-shadow:var(--shadow-sm)}\n\n.aic-scope .sup .sname{font-size:13.5px;font-weight:700}\n\n.aic-scope .sup a{color:var(--violet);font-size:11.5px;font-weight:600;text-decoration:none;display:inline-block;margin:3px 0 6px}\n\n.aic-scope .sup .smeta{font-size:11px;color:var(--text-3)}\n\n.aic-scope .glabel{font-size:11.5px;color:var(--text-2);margin-bottom:9px}\n\n.aic-scope .plad{display:flex;gap:10px;margin-bottom:16px}\n\n.aic-scope .pt-tier{flex:1;border:1.5px solid var(--line);border-radius:12px;padding:11px 13px;cursor:pointer;background:#fff;position:relative;transition:.14s}\n\n.aic-scope .pt-tier:hover{border-color:var(--coral-line)}\n\n.aic-scope .pt-tier.on{border-color:var(--coral);background:linear-gradient(160deg,var(--coral-soft),#fff);box-shadow:0 0 0 3px rgba(255,106,77,.12)}\n\n.aic-scope .pt-tier .pv{font-family:"Fraunces",serif;font-weight:600;font-size:22px;line-height:1}\n\n.aic-scope .pt-tier.on .pv{color:var(--coral)}\n\n.aic-scope .pt-tier .pq{font-size:11px;color:var(--text-3);margin-top:5px;font-weight:600}\n\n.aic-scope .pt-tier .pick{position:absolute;top:9px;right:10px;font-size:9px;font-weight:700;color:var(--coral);background:#fff;border:1px solid var(--coral-line);padding:1px 6px;border-radius:20px;display:none}\n\n.aic-scope .pt-tier.on .pick{display:block}\n\n.aic-scope .specrow{display:flex;align-items:center;gap:9px;margin-bottom:11px}\n\n.aic-scope .specrow .sl{font-size:12px;color:var(--text-2)}\n\n.aic-scope .specrow .sl b{color:var(--text);font-weight:700}\n\n.aic-scope .spec-chip{position:relative;font-size:12px;font-weight:700;padding:7px 15px;border-radius:10px;border:1.5px solid var(--ink);background:#fff;cursor:pointer}\n\n.aic-scope .spec-chip .cnt2{position:absolute;top:-7px;right:-7px;width:17px;height:17px;border-radius:50%;background:var(--jade);color:#fff;font-size:10px;display:grid;place-items:center;border:2px solid var(--paper);font-family:"Fraunces",serif}\n\n.aic-scope .skurow{display:grid;grid-template-columns:auto auto 1fr auto 1fr;gap:12px;align-items:center;padding:12px 14px;border:1px solid var(--line);border-radius:12px;background:var(--paper-2);margin-bottom:13px}\n\n.aic-scope .skurow .tag2{font-size:12px;font-weight:700;padding:5px 12px;border-radius:8px;background:#fff;border:1px solid var(--line)}\n\n.aic-scope .skurow .cost{font-size:11.5px;color:var(--text-2)}\n\n.aic-scope .skurow .cost b{font-family:"Fraunces",serif;color:var(--text);font-weight:600}\n\n.aic-scope .field{display:flex;flex-direction:column;gap:3px}\n\n.aic-scope .field .fl{font-size:10px;font-weight:700;letter-spacing:.4px;text-transform:uppercase;color:var(--text-3)}\n\n.aic-scope .inp{font:inherit;font-size:13px;font-weight:600;border:1px solid var(--line);border-radius:8px;padding:7px 11px;background:#fff;color:var(--text);width:100%;font-family:"Fraunces",serif;box-shadow:var(--shadow-sm)}\n\n.aic-scope .inp:focus{outline:0;border-color:var(--violet);box-shadow:0 0 0 3px rgba(106,92,255,.13)}\n\n.aic-scope .margin{font-family:"Fraunces",serif;font-weight:600;font-size:13px;color:var(--jade)}\n\n.aic-scope .ladbox{border:1.5px dashed var(--violet-line);border-radius:13px;padding:14px;background:linear-gradient(160deg,#faf8ff,#fff);margin-bottom:14px}\n\n.aic-scope .ladbox .lh{display:flex;align-items:center;gap:8px;margin-bottom:11px}\n\n.aic-scope .ladbox .lh b{font-size:12.5px;font-weight:700}\n\n.aic-scope .ladbox .lh .r{margin-left:auto;font-size:11px;color:var(--text-3);font-weight:600}\n\n.aic-scope .ladrow{display:grid;grid-template-columns:auto auto 1fr auto;gap:10px;align-items:center;padding:7px 0;border-top:1px solid var(--line-2);font-size:12.5px}\n\n.aic-scope .ladrow:first-of-type{border-top:0}\n\n.aic-scope .ladrow .q{color:var(--text-2)}\n\n.aic-scope .ladrow .q b{font-family:"Fraunces",serif;color:var(--text)}\n\n.aic-scope .ladrow .approx{font-family:"Fraunces",serif;color:var(--text-3);font-size:11.5px}\n\n.aic-scope .ladin{width:88px;font-family:"Fraunces",serif;font-weight:600;font-size:13px;border:1px solid var(--line);border-radius:7px;padding:5px 9px;background:#fff}\n\n.aic-scope .summ{display:flex;align-items:center;gap:24px;flex-wrap:wrap;padding-top:4px}\n\n.aic-scope .summ .s .k{font-size:11px;color:var(--text-3);font-weight:600}\n\n.aic-scope .summ .s .v{font-family:"Fraunces",serif;font-weight:600;font-size:17px;margin-top:2px}\n\n.aic-scope .summ .s .v.hi{color:var(--coral)}\n\n.aic-scope .summ .s .v small{font-size:11px;color:var(--text-3);font-family:"Instrument Sans",sans-serif;font-weight:600;margin-left:3px}\n\n.aic-scope .attrgrid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}\n\n.aic-scope .attr{display:grid;grid-template-columns:96px 1fr;align-items:center;border:1px solid var(--line-2);border-radius:10px;overflow:hidden;background:#fff}\n\n.aic-scope .attr .ak{font-size:11px;font-weight:700;color:var(--text-3);background:var(--paper-2);padding:9px 11px;letter-spacing:.2px}\n\n.aic-scope .attr .av{font-size:12px;font-weight:600;padding:9px 11px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n\n.aic-scope .attr.ai{border-color:var(--violet-line)}\n\n.aic-scope .attr.ai .ak{background:var(--violet-soft);color:#5a3ff0}\n\n.aic-scope .attr.ai .ak::after{content:"AI";font-size:8px;margin-left:5px;background:#fff;border:1px solid var(--violet-line);padding:0 3px;border-radius:4px}\n\n.aic-scope .dtabs{display:flex;gap:4px}\n\n.aic-scope .dtabs button{border:0;background:transparent;font:inherit;font-size:12px;font-weight:600;color:var(--text-2);padding:5px 11px;border-radius:8px;cursor:pointer}\n\n.aic-scope .dtabs button.on{background:var(--violet-soft);color:var(--violet)}\n\n.aic-scope .desc{border:1px solid var(--line);border-radius:12px;padding:13px 15px;background:#fff;font-size:12.5px;color:var(--text-2);line-height:1.7;box-shadow:var(--shadow-sm);position:relative}\n\n.aic-scope .desc .aiopt{position:absolute;right:12px;bottom:12px;font-size:11px;font-weight:600;color:#fff;background:linear-gradient(120deg,#7a5cff,#9b6bff);border:0;border-radius:8px;padding:6px 12px;cursor:pointer;box-shadow:0 4px 12px -3px rgba(120,80,255,.5)}\n\n.aic-scope .srcsup{display:flex;gap:11px;align-items:flex-start;margin-bottom:11px}\n\n.aic-scope .srcsup .slogo{width:36px;height:36px;border-radius:10px;display:grid;place-items:center;font-family:"Fraunces",serif;font-weight:700;font-size:16px;color:#fff;background:linear-gradient(150deg,#4a7fff,#2b8cff);flex-shrink:0;box-shadow:var(--shadow-sm)}\n\n.aic-scope .srcsup .sname{font-size:12.5px;font-weight:700;line-height:1.35}\n\n.aic-scope .srcsup a{color:var(--violet);font-size:11px;font-weight:600;text-decoration:none;display:inline-block;margin-top:4px}\n\n.aic-scope .srcmeta{border-top:1px solid var(--line-2);padding-top:9px}\n\n.aic-scope .mrow{display:flex;gap:10px;padding:4px 0;font-size:11.5px;align-items:baseline}\n\n.aic-scope .mrow .mk{color:var(--text-3);font-weight:600;width:74px;flex-shrink:0}\n\n.aic-scope .mrow .mv{color:var(--text);font-weight:600;min-width:0}\n\n.aic-scope .mrow .mv.dim{color:var(--text-3);font-weight:500;font-size:11px}\n\n.aic-scope .sidecard{background:var(--paper);border:1px solid var(--line);border-radius:15px;box-shadow:var(--shadow-md);margin-bottom:15px;overflow:hidden}\n\n.aic-scope .sc-head{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid var(--line-2)}\n\n.aic-scope .sc-head .t{font-size:12.5px;font-weight:700}\n\n.aic-scope .sc-head .i{color:var(--text-3);font-size:11px}\n\n.aic-scope .sc-head .sp{flex:1}\n\n.aic-scope .sc-body{padding:13px 14px}\n\n.aic-scope .viewbtn{width:100%;border:0;border-radius:10px;padding:10px;font:inherit;font-weight:700;font-size:12.5px;color:#fff;cursor:pointer;margin-bottom:13px;\n    background:linear-gradient(120deg,#2b8cff,#4a7fff);box-shadow:0 5px 14px -4px rgba(43,140,255,.55)}\n\n.aic-scope .steps{position:relative;padding-left:6px}\n\n.aic-scope .step{display:flex;align-items:center;gap:11px;padding:7px 0;position:relative}\n\n.aic-scope .step .dot{width:22px;height:22px;border-radius:50%;display:grid;place-items:center;font-size:11px;flex-shrink:0;z-index:1;font-weight:700}\n\n.aic-scope .step .dot.done{background:var(--jade);color:#fff;box-shadow:0 0 0 3px var(--jade-soft)}\n\n.aic-scope .step .dot.cur{background:var(--violet);color:#fff;box-shadow:0 0 0 4px var(--violet-soft)}\n\n.aic-scope .step .dot.wait{background:#fff;border:1.5px solid var(--line);color:var(--text-3)}\n\n.aic-scope .step .sl{font-size:12.5px;font-weight:600;color:var(--text)}\n\n.aic-scope .step.waitl .sl{color:var(--text-3)}\n\n.aic-scope .step .rb{margin-left:auto;font-size:10.5px;font-weight:600;color:var(--violet);background:var(--violet-soft);border:1px solid var(--violet-line);padding:2px 8px;border-radius:20px;cursor:pointer}\n\n.aic-scope .step::before{content:"";position:absolute;left:10px;top:-7px;bottom:50%;width:2px;background:var(--jade)}\n\n.aic-scope .step:first-child::before{display:none}\n\n.aic-scope .step.waitl::before,\n.aic-scope .step.curl::before{background:var(--line)}\n\n.aic-scope .afilter{display:flex;gap:4px;margin-left:auto}\n\n.aic-scope .afilter button{border:0;background:transparent;font:inherit;font-size:11px;font-weight:600;color:var(--text-3);padding:3px 8px;border-radius:7px;cursor:pointer}\n\n.aic-scope .afilter button.on{background:var(--ink);color:#fff}\n\n.aic-scope .log{position:relative}\n\n.aic-scope .logrow{display:grid;grid-template-columns:40px 1fr;gap:9px;padding:10px 0;border-top:1px solid var(--line-2)}\n\n.aic-scope .logrow:first-child{border-top:0}\n\n.aic-scope .actor{font-size:9.5px;font-weight:700;letter-spacing:.3px;padding:2px 0;border-radius:6px;text-align:center;height:19px;line-height:15px;border:1px solid transparent}\n\n.aic-scope .actor.user{background:var(--amber-soft);color:#a5680d;border-color:var(--amber-line)}\n\n.aic-scope .actor.ai{background:var(--violet-soft);color:#5a3ff0;border-color:var(--violet-line)}\n\n.aic-scope .actor.sys{background:var(--paper-2);color:var(--text-2);border-color:var(--line)}\n\n.aic-scope .logrow .lc .lf{font-size:12px;font-weight:700;display:flex;align-items:center;gap:6px}\n\n.aic-scope .logrow .lc .lf .tm{margin-left:auto;font-size:10.5px;color:var(--text-3);font-weight:500;font-family:"Fraunces",serif}\n\n.aic-scope .logrow .lc .lv{font-size:11.5px;color:var(--text-2);margin-top:3px}\n\n.aic-scope .logrow .lc .lv .old{text-decoration:line-through;color:var(--text-3)}\n\n.aic-scope .logrow .lc .lv .new{font-family:"Fraunces",serif;font-weight:600;color:var(--text)}\n\n.aic-scope .logrow .lc .ln{font-size:11px;color:var(--text-3);margin-top:2px}\n\n/* ── Phase 8 收尾:防横向溢出 + 键盘焦点可见(a11y) + 窄屏优雅收拢 ── */\n.aic-scope .plad,.aic-scope .studio-tools,.aic-scope .chips,.aic-scope .statusline,.aic-scope .actbar,.aic-scope .filters{flex-wrap:wrap}\n.aic-scope [role="button"]:focus-visible,.aic-scope button:focus-visible,.aic-scope .pcard:focus-visible,.aic-scope .pt-tier:focus-visible,.aic-scope .th:focus-visible,.aic-scope .ccard:focus-visible,.aic-scope .spec-chip:focus-visible,.aic-scope .step .rb:focus-visible{outline:2px solid var(--violet);outline-offset:2px;border-radius:8px}\n@media (max-width:920px){\n  .aic-scope .studio-body{grid-template-columns:1fr}\n  .aic-scope .attrgrid{grid-template-columns:1fr}\n  .aic-scope .panes{grid-template-columns:1fr}\n}\n@media (max-width:560px){\n  .aic-scope .skurow{grid-template-columns:1fr 1fr;row-gap:8px}\n  .aic-scope .plad{flex-direction:column}\n}\n',
      ),
    );
    document.head.appendChild(s);
  } catch (e) {}
})();
/* __AIC_CSS_INJECT_END__ */
/* ============================================================================
 * 预览编辑页 jsBlock 源码纳管（Creative Console 重设计 · 真源）
 * ----------------------------------------------------------------------------
 * 这是「AI 商品搬运 · 预览编辑」页三栏工作台外壳的沙箱 JS，运行在 NocoBase v2
 * FlowEngine 运行时里，由数据库中的 flowModel 承载（不在 uiSchemas）。此文件是
 * 该块的仓库真源：所有 jsBlock 改动先改这里，再贴回运行中的块（见下方贴回步骤）。
 *
 * 载体（v2 flowModel）：
 *   表        flowModels
 *   uid       um6v8ddxrz8
 *   use       JSBlockModel
 *   代码路径  options.stepParams.jsSettings.runJs.code
 *
 * 运行时约定（由 JSBlockModel 注入）：
 *   ctx.libs.React / ctx.libs...   —— 宿主提供的库
 *   ctx.element / ctx.model / ...  —— 块上下文
 *   通过 window.__aiListingMediaKit.mount(container, { productId }) 挂载 React 候选区
 *
 * 贴回步骤（更新线上块）：
 *   1) 编辑本文件，保存。
 *   2) 在运行中的 admin 里打开该 JSBlock 的「编辑 JS」抽屉，用本文件内容整体替换代码框，保存。
 *   （或）直接改库：update "flowModels" set options=jsonb_set(...) where "uid"=um6v8ddxrz8。
 *      —— 走 API/界面更安全，直接改库需谨慎并清 flowModel 缓存/刷新页面。
 *
 * 抽取时间：2026-07-08（Phase 0）。若线上块被他处改动，请重抽以本文件对齐。
 * ========================================================================== */

const React = ctx.libs.React;
const { useState, useEffect, useCallback, useMemo, useRef } = React;
const {
  Row,
  Col,
  Card,
  Tag,
  Button,
  Space,
  Typography,
  Alert,
  Table,
  Empty,
  Input,
  InputNumber,
  Select,
  Image,
  Divider,
  Segmented,
  Tooltip,
  Switch,
  Spin,
  Checkbox,
  Descriptions,
  Avatar,
  Collapse,
  Pagination,
  message,
  Modal,
} = ctx.libs.antd;
const dayjs = ctx.libs.dayjs;

const IMG_FALLBACK =
  'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="240" height="240"%3E%3Crect width="240" height="240" fill="%23f5f5f5"/%3E%3Ctext x="120" y="120" font-size="14" fill="%23bbb" text-anchor="middle" dominant-baseline="middle"%3E图片预览（mock）%3C/text%3E%3C/svg%3E';

const STATUS_META = {
  processed: { color: 'lime', label: '已处理' },
  reviewing: { color: 'gold', label: '审核中' },
  reviewed: { color: 'green', label: '已审核' },
  publishing: { color: 'geekblue', label: '发布中' },
  published: { color: 'green', label: '已发布' },
  publish_failed: { color: 'red', label: '发布失败' },
};
const ACTOR_META = {
  user: { color: 'blue', label: '人工' },
  ai_employee: { color: 'purple', label: 'AI' },
  system: { color: 'default', label: '系统' },
};

// ---- 变更记录人话化：审计里的 fieldName 是英文字段名、值是原始 JSON，电商运营看不懂 —— 全部翻成中文短语。----
const FIELD_LABELS = {
  titleProcessed: '标题建议',
  descriptionProcessed: '描述建议',
  attributesProcessed: '属性建议',
  titleFinal: '发布标题',
  descriptionFinal: '发布描述',
  attributes: '商品属性',
  priceTarget: '售价',
  listPriceTarget: '划线价',
  ladderTarget: '发布阶梯价',
  stock: '库存',
  'skus.priceTarget': 'SKU 定价',
  'skus.stock': 'SKU 库存',
  mediaJobs: '图片处理任务',
  status: '商品状态',
  reviewStatus: '审核状态',
  riskFlags: '风险词扫描',
  categoryTarget: '目标类目',
  enabled: '规则启用',
};
const REVIEW_STATUS_LABELS = { pending: '待审核', approved: '已通过', rejected: '已驳回' };
const MEDIA_JOB_LABELS = {
  remove_watermark: '去水印',
  white_background: '白底图',
  whitebg: '白底图',
  localize: '本地化',
};
const fieldLabel = (f) => {
  if (!f) return '';
  if (FIELD_LABELS[f]) return FIELD_LABELS[f];
  const m = /^sku#(\d+)\.(priceTarget|stock)$/.exec(f);
  if (m) return `SKU#${m[1]} ${m[2] === 'stock' ? '库存' : '售价'}`;
  return f;
};
const fmtAuditVal = (f, v) => {
  if (v == null || v === '') return '（空）';
  if (f === 'status') return (STATUS_META[v] || {}).label || String(v);
  if (f === 'reviewStatus') return REVIEW_STATUS_LABELS[v] || String(v);
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? '开' : '关';
  if (typeof v === 'string') return v.length > 30 ? v.slice(0, 30) + '…' : v;
  if (Array.isArray(v)) {
    if (f === 'ladderTarget') {
      // 显示具体档位而不是「N 档」——否则档数不变、价格变了会看起来像「3 档 → 3 档」的无效变更。
      if (!v.length) return '未设置';
      const s = v.map((t) => `≥${(t || {}).minQuantity}:${(t || {}).price}`).join(' / ');
      return `${v.length} 档（${s.length > 30 ? s.slice(0, 30) + '…' : s}）`;
    }
    return `${v.length} 项`;
  }
  if (typeof v === 'object') {
    if (v.count != null) return `${v.count} 个 SKU`;
    if (Array.isArray(v.types))
      return `${v.created != null ? v.created + ' 个：' : ''}${v.types
        .map((t) => MEDIA_JOB_LABELS[t] || t)
        .join('、')}`;
    const ks = Object.keys(v);
    return `${ks.length} 项（${ks.slice(0, 3).join('、')}${ks.length > 3 ? '…' : ''}）`;
  }
  return String(v);
};

// decimal 列读回字符串、前端提交数字——服务端历史上把「"0.3" vs 0.3」记成了变更（已修）。
// 存量审计里这类 0.3 → 0.3 的无效条目在展示层过滤掉，不再干扰运营阅读。
const numLike = (v) => typeof v === 'number' || (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v)));
const canonAuditVal = (f, v) => {
  if (v == null || v === '') return null;
  const numericField =
    ['priceTarget', 'listPriceTarget', 'stock'].includes(f) ||
    /^sku#\d+\.(priceTarget|stock)$/.test(f) ||
    f === 'skus.priceTarget' ||
    f === 'skus.stock';
  if (numericField && numLike(v)) return Number(v);
  if (f === 'ladderTarget' && Array.isArray(v))
    return v.map((t) => ({ m: Number((t || {}).minQuantity), p: Number((t || {}).price) }));
  return v;
};
const isNoopAudit = (l) => {
  if (l.oldValue == null || l.newValue == null) return false;
  return (
    JSON.stringify(canonAuditVal(l.fieldName, l.oldValue)) === JSON.stringify(canonAuditVal(l.fieldName, l.newValue))
  );
};

const PendingTag = () => (
  <Tag color="gold" style={{ marginLeft: 6, transform: 'scale(0.85)', transformOrigin: 'left' }}>
    待提交
  </Tag>
);

// AI 员工原生头像（复刻原生 AIEmployeeShortcut 的 hover 转头：常态明亮、hover flip 转头）。
// 顶层组件（非 ReviewApp 内嵌）以保证跨父渲染稳定，头像只取一次、focus 态不丢。kit 由 window.__aiListingBlockKit 提供。
function EmployeeAvatar({ kit, username, size, disabled, title, onClick }) {
  const [normal, setNormal] = useState(null);
  const [hover, setHover] = useState(null);
  const [focus, setFocus] = useState(false);
  useEffect(() => {
    if (!kit || !kit.getAvatar) return;
    kit
      .getAvatar(username, { mouth: undefined, mask: undefined })
      .then((u) => u && setNormal(u))
      .catch(() => {});
    kit
      .getAvatar(username, { mask: undefined, flip: true })
      .then((u) => u && setHover(u))
      .catch(() => {});
  }, [kit, username]);
  return (
    <Tooltip title={title}>
      <span
        style={{ cursor: disabled ? 'not-allowed' : 'pointer', display: 'inline-block', opacity: disabled ? 0.4 : 1 }}
        onMouseEnter={() => setFocus(true)}
        onMouseLeave={() => setFocus(false)}
        onClick={() => {
          if (!disabled) onClick();
        }}
      >
        <Avatar
          size={size || 36}
          shape="circle"
          src={(focus ? hover : normal) || undefined}
          style={{ background: normal ? undefined : '#722ed1' }}
        >
          {normal ? null : 'AI'}
        </Avatar>
      </span>
    </Tooltip>
  );
}

// AI 候选区（Phase 2）：把插件 bundle 里的 MediaStudio 面板挂进本区块容器（window.__aiListingMediaKit）。
// 生成→对比→采纳/弃用全部走受控 action；采纳后 onChange 刷新本页详情图集（发布装配已「采纳集优先」）。
// kit 未安装（旧 bundle）时静默显示占位，绝不影响主体编辑。React 隔离：mount 内部自建 root，与本区块 React 无耦合。
function AiCandidateZone({ productId, onChange }) {
  const ref = useRef(null);
  const cbRef = useRef(onChange);
  cbRef.current = onChange;
  useEffect(() => {
    const kit = (typeof window !== 'undefined' && window.__aiListingMediaKit) || null;
    if (!kit || !kit.mount || !ref.current || !productId) return;
    let unmount = null;
    try {
      unmount = kit.mount(ref.current, {
        productId,
        onChange: () => {
          if (cbRef.current) cbRef.current();
        },
      });
    } catch (e) {
      /* 挂载失败不影响主体 */
    }
    return () => {
      try {
        if (unmount) unmount();
      } catch (e) {}
    };
  }, [productId]);
  const has = typeof window !== 'undefined' && window.__aiListingMediaKit;
  // Creative Console 深墨区头(studio-head)由本卡壳提供;MediaStudio 挂进下方挂载点,只渲染工具栏 + 主体。
  return (
    <div className="aic-scope" style={{ marginTop: 12 }}>
      <div className="card" style={{ margin: 0 }}>
        <div className="studio-head">
          <div className="st">
            <span className="g">🎨</span>商品图片 · AI 改图
          </div>
          <span className="hint">主图 / 详情图在这里管理:选图 → 改图 → 对比 → 采纳(采纳后进入发布图集)</span>
        </div>
        {has ? (
          <div ref={ref} />
        ) : (
          <div style={{ padding: 16 }}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              AI 图片工具未就绪（请刷新或联系管理员）
            </Typography.Text>
          </div>
        )}
      </div>
    </div>
  );
}

const unwrap = (body) => {
  if (!body || typeof body !== 'object') return null;
  if (typeof body.ok === 'boolean') return body;
  if (body.data && typeof body.data === 'object' && typeof body.data.ok === 'boolean') return body.data;
  return body;
};
const callApi = async (url, data) => {
  try {
    const res = await ctx.request({ url, method: 'post', data: data || {}, skipNotify: true });
    return unwrap(res?.data) || { ok: false, errors: [{ code: 'EMPTY_RESPONSE', message: '空响应' }], traceId: '-' };
  } catch (err) {
    return (
      unwrap(err?.response?.data) || {
        ok: false,
        errors: [{ code: 'NETWORK_ERROR', message: '网络异常' }],
        traceId: '-',
      }
    );
  }
};
const errOf = (env) => {
  const first = (env && env.errors && env.errors[0]) || {};
  return {
    code: first.code || 'UNKNOWN',
    msg: first.friendlyMessage || first.message || '操作失败',
    traceId: (env && env.traceId) || '-',
    retryable: first.recoverable,
  };
};

// 列表缩略图：alicdn 图加尺寸后缀提速省流量；非 alicdn 或已带后缀的原样返回。
const thumb = (u, size) => {
  if (!u || typeof u !== 'string' || !/^https?:\/\//i.test(u)) return u;
  if (!/alicdn\.com/i.test(u) || /_\d+x\d+/.test(u)) return u;
  return /\.(jpe?g|png|webp)$/i.test(u) ? u + '_' + size + 'x' + size + '.jpg' : u;
};

const listEnv = await callApi('aiListingReview:list', { page: 1, pageSize: 20 });

function ReviewApp() {
  const [products, setProducts] = useState(listEnv && listEnv.ok ? listEnv.data.products : []);
  const [listError] = useState(listEnv && listEnv.ok ? null : listEnv);
  const [kw, setKw] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [platformFilter, setPlatformFilter] = useState('');
  const [selectedId, setSelectedId] = useState(
    listEnv && listEnv.ok && listEnv.data.products[0] ? listEnv.data.products[0].id : null,
  );
  // 左侧列表服务端分页：只取当前页数据，商品量大也不卡。
  const [listPage, setListPage] = useState(1);
  const [listPageSize, setListPageSize] = useState(20);
  const [listTotal, setListTotal] = useState(
    listEnv && listEnv.ok ? Number(listEnv.data.total) || listEnv.data.products.length : 0,
  );
  const [checkedIds, setCheckedIds] = useState([]);

  const [detail, setDetail] = useState(null);
  const [skus, setSkus] = useState([]);
  const [media, setMedia] = useState([]);
  const [draft, setDraft] = useState(null);
  const [baseline, setBaseline] = useState(null); // 载入/保存后的基准值，用于「待提交」黄标对比
  const [imgIdx, setImgIdx] = useState(0);
  const [logs, setLogs] = useState([]);
  const [logFilter, setLogFilter] = useState('');
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState(null); // {type,msg}
  const [precheck, setPrecheck] = useState(null);
  const [mobile, setMobile] = useState(false);
  // Alibaba.com 官方标题规范（帮助中心 20142419 + 发布接入文档 3.3.1），标题编辑提示与 Toby 上下文共用。
  const TITLE_RULES_TEXT =
    'Alibaba.com 官方标题规范：① 结构=核心品名+特征属性+标准/认证+型号，与买家搜索词强相关；' +
    '② with/for 可用但核心词必须在其前面（如 steel pipe with ASTM Standard）；' +
    '③ 长度适当：上限 128 英文字符（中文约 40 字，发布后编辑页翻译），买家搜索词仅 50 字符，过长降低匹配；' +
    '④ 禁关键词罗列堆砌（降低搜索匹配精度与排序）；⑤ 慎用 / – ( ) 等特殊符号，必须用时前后加空格；' +
    '⑥ 禁夸大词、绝对化用语与违禁词。';
  // Alibaba.com 官方商品卖点规范（《商品卖点上线》+ 发布接入文档 3.4.5）：发布描述落到结构化详描 textDesc（商品卖点），
  // 进 AI Search 索引并在商详高优展示。描述编辑提示与 Toby 上下文共用。
  const SELLING_RULES_TEXT =
    'Alibaba.com 官方商品卖点规范（发布描述写入平台「商品卖点」，进 AI Search 索引并在商详高优展示）：' +
    '① 英文分点最多 5 条，每条「标题: 内容」形式，标题首字母大写，不用特殊符号；' +
    '② 内容可含商品变体表达、商品特征、商品竞争优势（材质/做工、价格、服务、供应链时效）、适用人群/场景；5 条建议依次覆盖：产品核心亮点（差异化价值）、关键功能与用途、材质/规格/尺寸（自然语言转译，便于买家判断）、适用场景与人群、配件与服务支持（不承诺售后担保）；' +
    '③ 用清晰自然的语言，禁关键词罗列堆砌；' +
    '④ 避免与标题、属性重复用词，用更丰富的表达契合买家搜索习惯，突出帮助买家决策的附加信息；' +
    '⑤ 与标题/属性/详情信息保持一致，全文 ≤2000 字符；⑥ 禁夸大词、绝对化用语与违禁词。';
  // 官方文档《商品卖点上线》的 5 类卖点内容说明 + 参考示例（左右两列完整搬运）：只注入 AI 上下文，不进 UI tooltip。
  const SELLING_EXAMPLES_TEXT =
    '官方 5 类卖点内容说明与参考示例（示例为耳机品类，仅参考格式与风格，内容必须取材于当前商品，禁止照抄）：\n' +
    '1. 产品核心亮点——突出最主要卖点或创新点，说明产品最具吸引力或差异化的特性，明确传递核心价值。' +
    '示例：Active Noise Cancellation ANC: ANC noise cancelling earbuds help block ambient sound on subway bus airplane and in office so you can focus on music podcasts and calls\n' +
    '2. 重要功能或特性说明——呈现关键功能和用途，介绍产品的主要功能、实用性和能带来的利益。' +
    '示例：Touch Control And Transparency Mode: Tap to play pause answer calls and switch modes letting you hear surroundings for street walking commuting and quick conversations\n' +
    '3. 材质（材料、规格、尺寸等）——明确描述产品的主要属性、材料、容量、尺寸、重量等，以便买家判断是否匹配需求；建议用自然语言转译，让买家更容易理解。' +
    '示例：Bluetooth 5 0 Wireless Connection: Bluetooth earbuds provide stable pairing with iPhone Android phone iPad laptop and help reduce dropouts for videos and gaming\n' +
    '4. 场景适用与用户体验——适用范围、便捷性、目标客户群：指明适用人群或场合，以及产品使用的便捷性和体验优势。' +
    '示例：In Ear Silicone Ear Tips And Lightweight Fit: In ear design with multiple ear tip sizes improves seal and comfort making them suitable for running gym workouts and long listening sessions\n' +
    '5. 配件、使用与服务支持——说明产品是否附带操作说明、配件或支持渠道，突出简单易用性，但不承诺售后、保证信息。' +
    '示例：Charging Case Included And Easy Setup: Comes with charging case charging cable extra ear tips and user guide for fast pairing and convenient everyday carry';

  // 通用发布编辑器状态：选中的主规格值（颜色）、成本档（阶梯档位）、批量定价利润率、描述页签。
  const [selPrimary, setSelPrimary] = useState(null);
  const [costTierIdx, setCostTierIdx] = useState(0);
  const [marginPct, setMarginPct] = useState(30);
  const [descTab, setDescTab] = useState('final');

  // kit + refs：getData/getSchema/applyPatch 读最新 draft/detail（避免闭包过期）。
  const kit = (typeof window !== 'undefined' && window.__aiListingBlockKit) || null;
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const detailRef = useRef(detail);
  detailRef.current = detail;
  const skusRef = useRef(skus);
  skusRef.current = skus;

  const platforms = useMemo(() => {
    const set = new Set();
    products.forEach((p) => {
      if (p.targetPlatform) set.add(p.targetPlatform);
      if (p.sourcePlatform) set.add(p.sourcePlatform);
    });
    return Array.from(set);
  }, [products]);

  const reloadList = useCallback(
    async (over) => {
      const params = {
        keyword: kw,
        status: statusFilter,
        platform: platformFilter,
        page: listPage,
        pageSize: listPageSize,
        ...over,
      };
      const env = await callApi('aiListingReview:list', params);
      if (env.ok) {
        setProducts(env.data.products);
        setListTotal(Number(env.data.total) || env.data.products.length);
        if (params.page) setListPage(params.page);
      }
    },
    [kw, statusFilter, platformFilter, listPage, listPageSize],
  );

  const loadDetail = useCallback(async (id) => {
    if (!id) {
      setDetail(null);
      return;
    }
    setLoadingDetail(true);
    setPrecheck(null);
    const [dEnv, lEnv] = await Promise.all([
      callApi('aiListingReview:detail', { id }),
      callApi('aiListingReview:changeLog', { id }),
    ]);
    if (dEnv.ok) {
      const p = dEnv.data.product;
      setDetail(p);
      setSkus(dEnv.data.skus || []);
      setMedia(dEnv.data.media || []);
      setImgIdx(0);
      setSelPrimary(null);
      setCostTierIdx(0);
      setDescTab('final');
      const nextDraft = {
        // 免采纳:最终标题默认沿用原标题(与服务端 approveDraft 兜底一致);AI 优化/手改直接落在这里,点「保存」才入库。
        titleFinal: p.titleFinal || p.titleOriginal || '',
        descriptionFinal: p.descriptionFinal || '',
        priceTarget: p.priceTarget != null ? Number(p.priceTarget) : null,
        listPriceTarget: p.listPriceTarget != null ? Number(p.listPriceTarget) : null,
        stock: p.stock != null ? Number(p.stock) : null,
        ladderTarget: Array.isArray(p.ladderTarget)
          ? p.ladderTarget.map((t) => ({ minQuantity: t.minQuantity, price: t.price }))
          : [],
        attributes: { ...(p.attributesProcessed || {}) },
        skus: (dEnv.data.skus || []).map((s) => ({
          id: s.id,
          priceTarget: s.priceTarget != null ? Number(s.priceTarget) : null,
          stock: s.stock != null ? Number(s.stock) : null,
        })),
      };
      setDraft(nextDraft);
      setBaseline(nextDraft); // 基准 = 刚载入的最终值；AI/人工改动后与之比对出「待提交」
    }
    if (lEnv.ok) setLogs(lEnv.data.logs || []);
    setLoadingDetail(false);
  }, []);

  useEffect(() => {
    loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  const locked = detail && detail.locked;

  const setDraftField = (k, v) => setDraft((d) => ({ ...d, [k]: v }));
  const setSkuField = (sid, f, v) =>
    setDraft((d) => ({ ...d, skus: d.skus.map((s) => (s.id === sid ? { ...s, [f]: v } : s)) }));

  // ── jsBlock 通用 AI 能力：把「最终字段」暂存注册进 kit。Toby 经原生抽屉对话调 jsBlockApplyPatch 直接改暂存；
  //    只有点「保存」才走受控 saveFinal 入库（逐字段审计 actorType=user、reviewed 锁定→409）。AI 绝不写库。
  const buildFields = useCallback(() => {
    const p = detailRef.current || {};
    return [
      {
        name: 'titleFinal',
        label: '标题',
        type: 'string',
        hint: `面向目标平台「${p.targetPlatform || '-'}」的最终标题；原始:「${
          p.titleOriginal || ''
        }」；参考建议(处理阶段规则清洗):「${
          p.titleProcessed || ''
        }」；核心品名前置（with/for 前）、≤128 英文字符（中文约 40 字）、禁堆砌与夸大词、特殊符号前后加空格`,
      },
      {
        name: 'descriptionFinal',
        label: '发布描述（平台商品卖点）',
        type: 'string',
        hint: `最终发布描述——发布时写入 Alibaba 结构化详描「商品卖点」(textDesc，≤2000 字符，进 AI Search 索引)；原始:「${(
          p.descriptionOriginal || ''
        ).slice(0, 80)}」；参考建议:「${(p.descriptionProcessed || '').slice(
          0,
          80,
        )}」；写法：英文分点 ≤5 条、每条「Title: Content」（标题首字母大写、禁特殊符号），依次覆盖核心亮点/功能用途/材质规格/适用场景人群/配件服务，避免与标题重复用词，条与条之间用换行分隔`,
      },
      {
        name: 'skus',
        label: 'SKU 定价',
        type: 'array',
        hint:
          '数组 [{id, priceTarget, stock}]。id 与规格见背景信息「SKU 清单」；priceTarget=该规格目标售价（数字），stock=库存（整数）。批量定价优先改这里（商品级售价/总库存会自动汇总）',
      },
      {
        name: 'ladderTarget',
        label: '发布阶梯价',
        type: 'array',
        hint:
          '数组 [{minQuantity, price}]，¥ 价格。档数跟随源站/用户要求（起订量递增、价格随数量不升；目标平台有上限时发布时截断，Alibaba 为 4 档）；设了阶梯草稿走「按数量阶梯价」（与 SKU 规格价二选一），清空 [] 回固定/规格价',
      },
      {
        name: 'listPriceTarget',
        label: '划线价',
        type: 'number',
        hint: '数字；划线价（原价展示用），一般为售价的 1.2~1.5 倍',
      },
      {
        name: 'priceTarget',
        label: '商品级售价',
        type: 'number',
        hint: '数字；一般不用手填——保存时自动取最低 SKU 售价',
      },
      { name: 'stock', label: '商品级总库存', type: 'number', hint: '整数；一般不用手填——保存时自动汇总各 SKU 库存' },
      {
        name: 'attributes',
        label: '商品属性',
        type: 'object',
        hint: `键值对对象（发布后展示在商品页规格参数区）；来源属性:${JSON.stringify(p.attributesOriginal || {})}`,
      },
    ];
  }, []);

  useEffect(() => {
    if (!kit) return undefined;
    kit.register('review-detail', {
      title: '预览编辑·商品最终字段（Toby 可对话编辑）',
      submitLabel: '保存',
      getData: () => {
        const d = draftRef.current || {};
        return {
          titleFinal: d.titleFinal,
          descriptionFinal: d.descriptionFinal,
          priceTarget: d.priceTarget,
          listPriceTarget: d.listPriceTarget,
          stock: d.stock,
          attributes: d.attributes || {},
          skus: d.skus || [],
          ladderTarget: d.ladderTarget || [],
        };
      },
      getSchema: buildFields,
      // 只读背景信息（进 system prompt，用户看不到）：技术细节放这里，让可见的输入框提示语保持自然口语。
      getSystemContext: () => {
        const p = detailRef.current || {};
        const sInfo = p.shopInfo || {};
        const ladder0 =
          ((skusRef.current || []).find((s) => Array.isArray(s.ladderPrice) && s.ladderPrice.length) || {})
            .ladderPrice || [];
        const ladderText = ladder0.length
          ? ladder0
              .map(
                (t) =>
                  `${
                    t.maxQuantity === -1 || t.maxQuantity == null
                      ? '≥' + t.minQuantity
                      : t.minQuantity + '-' + t.maxQuantity
                  }件=${t.currency || ''}${t.price}`,
              )
              .join('，')
          : '（无）';
        return [
          `商品数据库主键 id：${p.id}（如需读取该商品完整的原始/建议/最终字段，可调用 reviewGetProduct 并传此 id；不要用标题里的货号当 id）。`,
          `商品状态：${p.status || '-'}${p.locked ? '（已审核锁定，不可修改）' : ''}；目标平台：${
            p.targetPlatform || '-'
          }。`,
          `来源背景：平台 ${p.sourcePlatform || '-'}；源类目「${p.categoryOriginal || '-'}」；供应商「${
            sInfo.supplierName || '-'
          }」；起订量 MOQ ${p.moq != null ? p.moq : '-'}；原价 ${p.currencyOriginal || ''} ${
            p.priceOriginal != null ? p.priceOriginal : '-'
          }（起订档）。`,
          `源站采购阶梯价：${ladderText}。用户让你定价时：按用户预计采购量命中的档位作为成本价，叠加用户给的利润率/运费估算每个 SKU 的目标售价，用 jsBlockApplyPatch 写 skus 数组（[{id, priceTarget, stock}]）；商品级售价与总库存保存时自动汇总，不必单独填。划线价（listPriceTarget）一般为售价的 1.2~1.5 倍。把计算过程简述给用户。`,
          `发布阶梯价（草稿将写入）：${JSON.stringify(
            (draftRef.current || {}).ladderTarget || [],
          )}。用户要求按数量整体阶梯报价时：写 ladderTarget 数组 [{minQuantity, price}]（¥，档数跟随源站或用户要求，起订量递增、价格随数量不升，可参照源站档位加利润率；Alibaba 发布时最多写 4 档）；设了阶梯草稿走阶梯价（与逐 SKU 规格价平台二选一），清空 [] 则回固定/规格价。`,
          'SKU 清单（id=规格）：' +
            ((skusRef.current || [])
              .map((s) => `${s.id}=${(s.specAttrs || []).map((a) => a.value).join('/') || s.specValue || s.sku}`)
              .join('；') || '（无）'),
          `优化标题时必须严格遵守：${TITLE_RULES_TEXT}`,
          `优化发布描述（descriptionFinal）时必须严格遵守：${SELLING_RULES_TEXT}`,
          SELLING_EXAMPLES_TEXT,
          '属性优化同样突出品类关键词与真实卖点，禁用夸大词与平台违禁词。',
        ].join('\n');
      },
      applyPatch: (patch) =>
        setDraft((d) => {
          if (!d) return d;
          const next = { ...d };
          for (const [k, v] of Object.entries(patch || {})) {
            if (k === 'attributes' && v && typeof v === 'object' && !Array.isArray(v))
              next.attributes = { ...(d.attributes || {}), ...v };
            else if (k === 'skus' && Array.isArray(v)) {
              // AI 批量定价：按 id 合并进 SKU 暂存，只认 priceTarget/stock 两个数字字段。
              next.skus = (d.skus || []).map((s) => {
                const p = v.find((x) => x && Number(x.id) === s.id);
                if (!p) return s;
                const ns = { ...s };
                if (p.priceTarget != null && !Number.isNaN(Number(p.priceTarget)))
                  ns.priceTarget = Number(p.priceTarget);
                if (p.stock != null && !Number.isNaN(Number(p.stock))) ns.stock = Number(p.stock);
                return ns;
              });
            } else if (k === 'ladderTarget' && Array.isArray(v)) {
              next.ladderTarget = v
                .map((t) => ({ minQuantity: Math.round(Number(t && t.minQuantity)), price: Number(t && t.price) }))
                .filter((t) => t.minQuantity > 0 && t.price > 0);
            } else if (k === 'priceTarget' || k === 'listPriceTarget' || k === 'stock')
              next[k] = v === '' || v == null ? null : Number(v);
            else if (k === 'titleFinal' || k === 'descriptionFinal') next[k] = v == null ? '' : String(v);
          }
          return next;
        }),
    });
    return () => kit.unregister('review-detail');
  }, [kit, buildFields]);

  const isDirty = useCallback(
    (field) => {
      if (!draft || !baseline) return false;
      if (field === 'price') {
        return (
          JSON.stringify([draft.priceTarget, draft.listPriceTarget]) !==
          JSON.stringify([baseline.priceTarget, baseline.listPriceTarget])
        );
      }
      return JSON.stringify(draft[field]) !== JSON.stringify(baseline[field]);
    },
    [draft, baseline],
  );

  const dirtyCount = useMemo(() => {
    if (!draft || !baseline) return 0;
    const keys = [
      'titleFinal',
      'descriptionFinal',
      'priceTarget',
      'listPriceTarget',
      'ladderTarget',
      'stock',
      'attributes',
      'skus',
    ];
    return keys.filter((k) => JSON.stringify(draft[k]) !== JSON.stringify(baseline[k])).length;
  }, [draft, baseline]);

  // 编辑型：Toby 经原生抽屉对话改「最终值」暂存（jsBlockApplyPatch）。
  const openToby = useCallback(async () => {
    if (!kit) {
      message.warning('AI 能力未就绪，请刷新页面');
      return;
    }
    const p = detailRef.current;
    if (!p) return;
    const ok = await kit.openAI('review-detail', {
      username: 'lst-toby',
      prompt: `帮我把这个商品优化得更适合 ${
        p.targetPlatform || '目标平台'
      }：标题更吸引人、描述更完整、补全关键参数；也可以按源站阶梯价加上我的利润率帮我算目标售价。改好先给我看，我确认后再点「保存」。`,
    });
    if (!ok) message.warning('打开原生 AI 抽屉失败');
  }, [kit]);

  // 字段级 AI 优化（仿平台官方「标题优化」）：一键打开原生抽屉并自动发送，Toby 直接改对应暂存字段（页面实时可见、标黄「待提交」），点「保存」才入库。
  const openFieldAI = useCallback(
    async (field) => {
      if (!kit) {
        message.warning('AI 能力未就绪，请刷新页面');
        return;
      }
      const p = detailRef.current;
      if (!p) return;
      const prompts = {
        title:
          '请优化这个商品的标题：严格遵守平台标题规范（核心品名前置、不堆砌关键词、禁夸大词，≤128 英文字符），突出真实卖点。直接把优化后的标题写入暂存字段 titleFinal 给我看，并用一两句话说明改动理由。',
        description:
          '请按 Alibaba.com 官方「商品卖点」规范重写这个商品的发布描述（发布时写入结构化详描商品卖点，进 AI Search 索引）：' +
          '用英文写最多 5 条卖点，每条一行、「标题: 内容」形式（标题首字母大写，不用特殊符号），' +
          '依次覆盖①产品核心亮点②关键功能与用途③材质/规格/尺寸（自然语言表达）④适用场景与人群⑤配件与服务支持（不承诺售后担保），' +
          '内容取材于源站描述与商品属性、与标题信息一致但避免重复标题用词，语言自然清晰、不堆砌关键词，全文 ≤2000 字符，禁夸大词与违禁词。' +
          '直接把结果写入暂存字段 descriptionFinal 给我看，并用中文简述每条卖点的取材依据。',
      };
      const ok = await kit.openAI('review-detail', {
        username: 'lst-toby',
        prompt: prompts[field] || '',
        autoSend: true,
      });
      if (!ok) message.warning('打开原生 AI 抽屉失败');
    },
    [kit],
  );

  // 只读型：Rena 合规检查，不改数据（走 window.aiListingOpenAssistant，不注入写工具指令）。
  const openRena = useCallback(async () => {
    const p = detailRef.current;
    if (!p) return;
    const opener = typeof window !== 'undefined' ? window.aiListingOpenAssistant : null;
    if (typeof opener !== 'function') {
      message.warning('AI 能力未就绪，请刷新页面');
      return;
    }
    const content = [
      `商品ID ${p.id}｜目标平台 ${p.targetPlatform || '-'}`,
      `标题：${p.titleFinal || p.titleProcessed || p.titleOriginal || ''}`,
      `描述：${(p.descriptionFinal || p.descriptionProcessed || p.descriptionOriginal || '').slice(0, 200)}`,
      `参数：${JSON.stringify(p.attributesProcessed || p.attributesOriginal || {})}`,
    ].join('\n');
    const ok = await opener('lst-rena', {
      content,
      prompt: '帮我看看这个商品有没有违禁词或合规风险，再给点更适合目标平台的合规和卖点建议。',
    });
    if (!ok) message.warning('打开原生 AI 抽屉失败');
  }, []);

  const saveWith = useCallback(
    async (d) => {
      if (!detail || !d) return false;
      setBusy(true);
      setBanner(null);
      // 商品级售价/总库存自动汇总（电商通用约定：展示价=最低 SKU 售价「¥X 起」，总库存=各 SKU 之和）；
      // 没有任何 SKU 定价/库存时退回手填值。
      const skuPrices = (d.skus || []).map((s) => s.priceTarget).filter((n) => n != null);
      const skuStockSum = (d.skus || []).reduce((a, s) => a + (s.stock || 0), 0);
      const env = await callApi('aiListingReview:saveFinal', {
        id: detail.id,
        values: {
          titleFinal: d.titleFinal,
          descriptionFinal: d.descriptionFinal,
          priceTarget: skuPrices.length ? Math.min(...skuPrices) : d.priceTarget,
          listPriceTarget: d.listPriceTarget,
          stock: skuStockSum > 0 ? skuStockSum : d.stock,
          ladderTarget: d.ladderTarget || [],
          attributesProcessed: d.attributes,
        },
        skus: d.skus,
      });
      if (env.ok) {
        setBanner({ type: 'success', msg: `已保存最终字段（变更 ${env.data.changed} 项），商品进入「审核中」。` });
        await loadDetail(detail.id);
        await reloadList();
      } else {
        const e = errOf(env);
        setBanner({ type: 'error', msg: `${e.msg}（${e.code}） traceId: ${e.traceId}` });
      }
      setBusy(false);
      return env.ok;
    },
    [detail, loadDetail, reloadList],
  );

  const save = useCallback(() => saveWith(draft), [saveWith, draft]);

  const approveCore = useCallback(async () => {
    if (!detail) return;
    setBusy(true);
    setBanner(null);
    const env = await callApi('aiListingReview:approveDraft', { id: detail.id });
    if (env.ok) {
      setBanner({ type: 'success', msg: '已标记审核通过，关键字段已锁定。' });
      await loadDetail(detail.id);
      await reloadList();
    } else {
      const e = errOf(env);
      setBanner({ type: 'warning', msg: `${e.msg}（${e.code}）` });
    }
    setBusy(false);
  }, [detail, loadDetail, reloadList]);

  // 审核守卫：库存漏填是高频返工点（发布必填，缺了发布报错要退回重改）——审核前拦下，可一键补默认库存；
  // 顺带兜住「改了没点保存就直接审核」的场景（审核读的是已入库值，暂存不生效）。
  const approve = useCallback(async () => {
    if (!detail || !draft) return approveCore();
    const skuList = draft.skus || [];
    const missingSkuStock = skuList.filter((s) => s.priceTarget != null && !(s.stock > 0));
    const stockMissing = skuList.length
      ? missingSkuStock.length > 0 || !skuList.some((s) => s.stock > 0)
      : !(draft.stock > 0);
    const unsaved = dirtyCount > 0;
    if (!stockMissing && !unsaved) return approveCore();
    const filled = stockMissing
      ? {
          ...draft,
          skus: skuList.map((s) => (s.stock > 0 ? s : { ...s, stock: 1000 })),
          stock: skuList.length ? draft.stock : draft.stock > 0 ? draft.stock : 1000,
        }
      : draft;
    Modal.confirm({
      title: stockMissing ? '库存未填写，发布时会报错' : `有 ${dirtyCount} 项修改未保存`,
      content: stockMissing
        ? `发布平台要求库存必填，缺库存会导致发布失败、需退回重改。可先按默认值 1000 补齐${
            skuList.length ? `（${missingSkuStock.length || skuList.length} 个 SKU）` : ''
          }再通过，之后仍可退回修改。`
        : '标记审核读取的是已保存的值，未保存的修改不会生效。将先保存这些修改，再标记审核通过。',
      okText: stockMissing ? '补库存 1000 并通过' : '保存并通过',
      cancelText: '返回补填',
      onOk: async () => {
        if (stockMissing) setDraft(filled);
        const ok = await saveWith(filled);
        if (ok) await approveCore();
      },
    });
  }, [detail, draft, dirtyCount, approveCore, saveWith]);

  const rollback = useCallback(async () => {
    if (!detail) return;
    setBusy(true);
    setBanner(null);
    const env = await callApi('aiListingReview:rollbackReview', { id: detail.id });
    if (env.ok) {
      setBanner({ type: 'info', msg: '已回退审核，可重新编辑。' });
      await loadDetail(detail.id);
      await reloadList();
    }
    setBusy(false);
  }, [detail, loadDetail, reloadList]);

  // 退回编辑：已发布 / 卡死的发布中 显式退回「审核中」重新走编辑→审核→发布（发布失败无需退回，直接编辑即可）。
  const reopen = useCallback(async () => {
    if (!detail) return;
    setBusy(true);
    setBanner(null);
    const env = await callApi('aiListingReview:reopenForEdit', { id: detail.id });
    if (env.ok) {
      setBanner({ type: 'info', msg: (env.warnings || [])[0] || '已退回编辑，可重新修改后再走审核发布。' });
      await loadDetail(detail.id);
      await reloadList();
    } else {
      const e = errOf(env);
      setBanner({ type: 'warning', msg: `${e.msg}（${e.code}）` });
    }
    setBusy(false);
  }, [detail, loadDetail, reloadList]);

  const precheckRun = useCallback(async () => {
    if (!detail) return;
    const env = await callApi('aiListingReview:aiPrecheck', { id: detail.id });
    if (env.ok) setPrecheck(env.data);
  }, [detail]);

  const batchApprove = useCallback(async () => {
    if (!checkedIds.length) return;
    setBusy(true);
    let ok = 0,
      fail = 0;
    for (const id of checkedIds) {
      const env = await callApi('aiListingReview:approveDraft', { id });
      if (env.ok) ok++;
      else fail++;
    }
    setBanner({
      type: fail ? 'warning' : 'success',
      msg: `批量审核：成功 ${ok}，失败 ${fail}（未填标题会自动沿用原标题；失败多为商品状态不允许）。`,
    });
    setCheckedIds([]);
    await reloadList();
    if (selectedId) await loadDetail(selectedId);
    setBusy(false);
  }, [checkedIds, reloadList, loadDetail, selectedId]);

  // ---------- 左侧列表 ----------
  const LeftPanel = (
    <div className="aic-scope">
      <div
        style={{
          borderRadius: 14,
          overflow: 'hidden',
          border: '1px solid var(--line)',
          background: 'var(--paper-2)',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <div className="lp" style={{ position: 'static' }}>
          <div className="search">
            <Input.Search
              placeholder="搜索商品标题"
              allowClear
              value={kw}
              onChange={(e) => setKw(e.target.value)}
              onSearch={() => reloadList({ page: 1 })}
              variant="borderless"
              style={{ padding: 0 }}
            />
          </div>
          <div className="filters">
            <Select
              size="small"
              style={{ flex: 1, minWidth: 96 }}
              value={statusFilter}
              onChange={(v) => {
                setStatusFilter(v);
                reloadList({ status: v, page: 1 });
              }}
              options={[
                { value: '', label: '全部状态' },
                { value: 'processed', label: '已处理' },
                { value: 'reviewing', label: '审核中' },
                { value: 'reviewed', label: '已审核' },
                { value: 'publish_failed', label: '发布失败' },
                { value: 'publishing', label: '发布中' },
                { value: 'published', label: '已发布' },
              ]}
            />
            <Select
              size="small"
              style={{ flex: 1, minWidth: 96 }}
              value={platformFilter}
              onChange={(v) => {
                setPlatformFilter(v);
                reloadList({ platform: v, page: 1 });
              }}
              options={[{ value: '', label: '全部平台' }, ...platforms.map((p) => ({ value: p, label: p }))]}
            />
          </div>
          {checkedIds.length ? (
            <Space size={6} style={{ marginTop: 9 }}>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                已选 {checkedIds.length}
              </Typography.Text>
              <Button size="small" type="primary" loading={busy} onClick={batchApprove}>
                批量审核通过
              </Button>
              <Button size="small" onClick={() => setCheckedIds([])}>
                清空
              </Button>
            </Space>
          ) : null}
        </div>
        <div className="plist" style={{ maxHeight: 'calc(100vh - 330px)', minHeight: 200, overflowY: 'auto' }}>
          {products.length === 0 ? (
            <Empty description="无商品" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ padding: 16 }}>
              <Button size="small" type="primary" onClick={() => ctx.router?.navigate?.('/admin/bhgkujnjpe7')}>
                去信息处理
              </Button>
            </Empty>
          ) : (
            products.map((p) => {
              const active = p.id === selectedId;
              const sm = STATUS_META[p.status] || { color: 'default', label: p.status };
              const badgeCls =
                { published: 'pub', reviewed: 'pub', reviewing: 'rev', publish_failed: 'rev', publishing: 'rev' }[
                  p.status
                ] || 'done';
              return (
                <div
                  key={p.id}
                  className={`pcard${active ? ' on' : ''}`}
                  role="button"
                  tabIndex={0}
                  aria-pressed={active}
                  onClick={() => setSelectedId(p.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedId(p.id);
                    }
                  }}
                >
                  <Checkbox
                    checked={checkedIds.includes(p.id)}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) =>
                      setCheckedIds((ids) => (e.target.checked ? [...ids, p.id] : ids.filter((x) => x !== p.id)))
                    }
                    style={{ alignSelf: 'center' }}
                  />
                  <div className="pt">
                    <img
                      src={thumb(p.mainImage, 120) || IMG_FALLBACK}
                      alt=""
                      onError={(e) => {
                        e.target.src = IMG_FALLBACK;
                      }}
                    />
                  </div>
                  <div className="pb">
                    <div className="pn">{p.title || '（无标题）'}</div>
                    <div className="pm">
                      <span className={`badge ${badgeCls}`}>{sm.label}</span>
                      {p.targetPlatform ? <span className="plat">{p.targetPlatform}</span> : null}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
        {listTotal > listPageSize || listPage > 1 ? (
          <div className="lpage">
            <Pagination
              size="small"
              current={listPage}
              pageSize={listPageSize}
              total={listTotal}
              showSizeChanger
              pageSizeOptions={['20', '50', '100']}
              showTotal={(t) => `共 ${t} 件`}
              onChange={(pg, ps) => {
                const np = ps !== listPageSize ? 1 : pg;
                setListPage(np);
                setListPageSize(ps);
                reloadList({ page: np, pageSize: ps });
              }}
            />
          </div>
        ) : null}
      </div>
    </div>
  );

  // ---------- 右侧详情 ----------
  let RightPanel;
  if (!detail) {
    RightPanel = (
      <Card size="small" style={{ height: '100%' }}>
        <Empty description="请选择左侧商品" />
      </Card>
    );
  } else {
    const sm = STATUS_META[detail.status] || { color: 'default', label: detail.status };
    const mainMedia = media.filter((m) => m.role === 'main' || (!m.role && m.assetType === 'image'));
    const detailMedia = media.filter((m) => m.role === 'detail');
    const videoMedia = media.filter((m) => m.assetType === 'video');
    const mainSrc = (mainMedia[imgIdx] && mainMedia[imgIdx].sourceUrl) || IMG_FALLBACK;
    const dlTag = (m) =>
      !m ? null : m.processStatus === 'success' ? (
        <Tag color="green" style={{ marginInlineStart: 4 }}>
          已下载
        </Tag>
      ) : m.processStatus === 'failed' ? (
        <Tag color="red" style={{ marginInlineStart: 4 }}>
          下载失败
        </Tag>
      ) : m.processStatus === 'running' ? (
        <Tag color="blue" style={{ marginInlineStart: 4 }}>
          下载中
        </Tag>
      ) : null;
    const attrEntries = Object.entries(draft.attributes || {});

    // ---- 销售信息（SKU）：通用发布编辑器范式（对齐 1688 国际站/抖店/拼多多发布页）----
    // 规格维度（颜色×尺寸）组合出 SKU，每个组合独立售价/库存；商品级展示价=最低 SKU 售价（X 起），总库存=各 SKU 之和。
    const curSym = (c) => (c === 'CNY' ? '¥' : c === 'USD' ? '$' : c ? c + ' ' : '');
    const firstLadder =
      (skus.find((s) => Array.isArray(s.ladderPrice) && s.ladderPrice.length) || {}).ladderPrice || [];
    const ladderShared =
      firstLadder.length > 0 &&
      skus.every((s) => !s.ladderPrice || JSON.stringify(s.ladderPrice) === JSON.stringify(firstLadder));
    const skuUnit = (skus.find((s) => s.unit) || {}).unit || '';
    const dims = [];
    for (const s of skus) {
      for (const a of s.specAttrs || []) {
        let d = dims.find((x) => x.name === a.name);
        if (!d) {
          d = { name: a.name, values: [] };
          dims.push(d);
        }
        let v = d.values.find((x) => x.value === a.value);
        if (!v) {
          v = { value: a.value, image: a.image, count: 0 };
          d.values.push(v);
        }
        v.count += 1;
        if (!v.image && a.image) v.image = a.image;
      }
    }
    const primaryDim = dims.find((d) => d.values.some((v) => v.image)) || dims[0] || null;
    const otherDims = dims.filter((d) => d !== primaryDim);
    const primarySel =
      selPrimary != null ? selPrimary : primaryDim && primaryDim.values[0] ? primaryDim.values[0].value : null;
    const skuAttr = (s, name) => {
      const a = (s.specAttrs || []).find((x) => x.name === name);
      return a ? a.value : null;
    };
    const rowSkus = primaryDim ? skus.filter((s) => skuAttr(s, primaryDim.name) === primarySel) : skus;

    // 成本档（点选阶梯档位作为采购成本）→ 批量定价：售价 = 成本 × (1 + 利润率%)。
    const costTier = firstLadder.length ? firstLadder[Math.min(costTierIdx, firstLadder.length - 1)] : null;
    const costPrice = costTier ? costTier.price : null;
    const round2 = (n) => Math.round(n * 100) / 100;
    const draftSku = (id) => ((draft && draft.skus) || []).find((s) => s.id === id) || {};
    const fillPrices = (onlyCurrent) => {
      if (costPrice == null || locked) return;
      const target = round2(costPrice * (1 + (marginPct || 0) / 100));
      const ids = (onlyCurrent ? rowSkus : skus).map((s) => s.id);
      setDraft((d) => ({ ...d, skus: d.skus.map((s) => (ids.includes(s.id) ? { ...s, priceTarget: target } : s)) }));
    };
    const skuPriceList = ((draft && draft.skus) || []).map((s) => s.priceTarget).filter((n) => n != null);
    const autoPrice = skuPriceList.length ? Math.min(...skuPriceList) : null;
    const autoStock = ((draft && draft.skus) || []).reduce((a, s) => a + (s.stock || 0), 0);
    const unitLabel = skuUnit ? skuUnit.toLowerCase() + 's' : '件';

    // ---- 发布阶梯价编辑器：档数跟随源站生成（信息处理时），此处可增删改；
    // 设了阶梯 → 草稿走「按数量阶梯价」（与 SKU 规格价平台二选一），清空 → 回固定价/规格价。
    const ladderDraft = (draft && draft.ladderTarget) || [];
    const setLadderTier = (i, k, v) =>
      setDraft((d) => ({ ...d, ladderTarget: (d.ladderTarget || []).map((t, j) => (j === i ? { ...t, [k]: v } : t)) }));
    const removeLadderTier = (i) =>
      setDraft((d) => ({ ...d, ladderTarget: (d.ladderTarget || []).filter((_, j) => j !== i) }));
    const addLadderTier = () =>
      setDraft((d) => {
        const cur = d.ladderTarget || [];
        const last = cur[cur.length - 1];
        const tier = last
          ? {
              minQuantity: Math.max(Math.round((last.minQuantity || 1) * 2), (last.minQuantity || 1) + 1),
              price: round2((last.price || 0) * 0.9) || null,
            }
          : { minQuantity: detail.moq || 1, price: d.priceTarget != null ? d.priceTarget : autoPrice };
        return { ...d, ladderTarget: [...cur, tier] };
      });
    const genLadderFromSource = () => {
      if (!firstLadder.length) return;
      setDraft((d) => ({
        ...d,
        ladderTarget: firstLadder.map((t) => ({
          minQuantity: t.minQuantity,
          price: round2(t.price * (1 + (marginPct || 0) / 100)),
        })),
      }));
    };
    const ladderIssues = [];
    for (let i = 1; i < ladderDraft.length; i++) {
      if (!(Number(ladderDraft[i].minQuantity) > Number(ladderDraft[i - 1].minQuantity)))
        ladderIssues.push('起订量需逐档递增');
      if (Number(ladderDraft[i].price) > Number(ladderDraft[i - 1].price))
        ladderIssues.push('价格应随数量增加而不升（量大更优惠）');
    }
    const ladderOverLimit = ladderDraft.length > 4;
    const LadderEditor = (
      <div className="ladbox">
        <div className="lh" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <b style={{ fontSize: 13 }}>发布阶梯价</b>
          <Tooltip title="档数跟随源站，可自由增删改（起订量递增、价格随数量不升，¥ 自动折 USD）。设了阶梯，草稿走「按数量阶梯价」；清空则回固定价（SKU 全有售价时走规格价）。目标平台有档数上限时（Alibaba.com 为 4 档）发布时截断并标注。">
            <Typography.Text type="secondary" style={{ fontSize: 12, cursor: 'help' }}>
              ⓘ
            </Typography.Text>
          </Tooltip>
          {isDirty('ladderTarget') ? <PendingTag /> : null}
          <span style={{ flex: 1 }} />
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {ladderDraft.length
              ? `${ladderDraft.length} 档 · 草稿走阶梯价`
              : `未设置 · 草稿走${skus.length ? '规格价（SKU 全有售价时）/固定价' : '固定价'}`}
          </Typography.Text>
        </div>
        {ladderDraft.map((t, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              ≥
            </Typography.Text>
            <InputNumber
              size="small"
              disabled={locked}
              min={1}
              precision={0}
              value={t.minQuantity}
              onChange={(v) => setLadderTier(i, 'minQuantity', v)}
              style={{ width: 96 }}
              aria-label={`第 ${i + 1} 档起订量`}
            />
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {unitLabel} → 售价 ¥
            </Typography.Text>
            <InputNumber
              size="small"
              disabled={locked}
              min={0.01}
              step={0.01}
              value={t.price}
              onChange={(v) => setLadderTier(i, 'price', v)}
              style={{ width: 96 }}
              aria-label={`第 ${i + 1} 档售价`}
            />
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {t.price > 0 ? `≈ $${(t.price / 7.2).toFixed(2)}` : ''}
            </Typography.Text>
            {!locked ? (
              <Button size="small" type="text" danger onClick={() => removeLadderTier(i)}>
                删除
              </Button>
            ) : null}
          </div>
        ))}
        {ladderIssues.length ? (
          <Typography.Text type="danger" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>
            {[...new Set(ladderIssues)].join('；')}（保存会被拦截）
          </Typography.Text>
        ) : null}
        {ladderOverLimit ? (
          <Typography.Text type="warning" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>
            Alibaba.com 平台上限 4 档：发布时仅前 4 档写入草稿（结果说明会标注），其余档保留在系统内。
          </Typography.Text>
        ) : null}
        {!locked ? (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
            <Button size="small" onClick={addLadderTier}>
              + 新增档位
            </Button>
            {firstLadder.length > 1 ? (
              <Button size="small" onClick={genLadderFromSource}>
                按源阶梯 ×(1+利润率{marginPct || 0}%) 生成
              </Button>
            ) : null}
            {ladderDraft.length ? (
              <Button size="small" onClick={() => setDraftField('ladderTarget', [])}>
                清空（回固定/规格价）
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    );

    const SkuSection = skus.length ? (
      <div className="aic-scope" style={{ marginTop: 12 }}>
        <div className="card" style={{ margin: 0 }}>
          <div className="shead">
            <span className="eyebrow">SALES</span>
            <span className="zh">销售信息（SKU 定价）</span>
            <Tooltip title="通用发布范式：规格维度（颜色×尺寸）组合出 SKU，每个组合独立售价与库存；发布到 1688 国际站 / 抖店 / 拼多多等平台时按各平台规格结构自动映射。">
              <span className="i" style={{ cursor: 'help' }}>
                ⓘ
              </span>
            </Tooltip>
            {isDirty('skus') ? <PendingTag /> : null}
            <span className="sp" />
            <span className="meta">{skus.length} 个 SKU</span>
          </div>
          <div className="cbody">
            {ladderShared ? (
              <div style={{ marginBottom: 4 }}>
                <div className="glabel">
                  源站采购阶梯 <span style={{ color: 'var(--text-3)' }}>（点选你的预计采购档，作为定价成本）</span>
                </div>
                <div className="plad">
                  {firstLadder.map((t, i) => {
                    const rng =
                      t.maxQuantity == null || t.maxQuantity === -1
                        ? `≥${t.minQuantity}`
                        : `${t.minQuantity}-${t.maxQuantity}`;
                    const active = i === costTierIdx;
                    return (
                      <div
                        key={i}
                        className={`pt-tier${active ? ' on' : ''}`}
                        role="button"
                        tabIndex={0}
                        aria-pressed={active}
                        onClick={() => setCostTierIdx(i)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setCostTierIdx(i);
                          }
                        }}
                      >
                        <span className="pick">成本档</span>
                        <div className="pv">
                          {curSym(t.currency)}
                          {t.price}
                        </div>
                        <div className="pq">
                          {rng} {unitLabel}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
            {primaryDim ? (
              <div style={{ marginBottom: 8 }}>
                <Typography.Text strong style={{ fontSize: 13 }}>
                  {primaryDim.name}：{primarySel}
                </Typography.Text>
                <Typography.Text type="secondary" style={{ fontSize: 12, marginLeft: 6 }}>
                  {primaryDim.values.length} 种 · 点选切换（绿色角标=该{primaryDim.name}下已定价规格数）
                </Typography.Text>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
                  {primaryDim.values.map((v) => {
                    const active = v.value === primarySel;
                    const priced = skus.filter(
                      (s) => skuAttr(s, primaryDim.name) === v.value && draftSku(s.id).priceTarget != null,
                    ).length;
                    return (
                      <span
                        key={v.value}
                        role="button"
                        tabIndex={0}
                        aria-pressed={active}
                        aria-label={v.value}
                        onClick={() => setSelPrimary(v.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setSelPrimary(v.value);
                          }
                        }}
                        style={{
                          position: 'relative',
                          cursor: 'pointer',
                          display: 'inline-block',
                          border: active ? '2px solid #222' : '1px solid #d9d9d9',
                          borderRadius: 8,
                          padding: 2,
                          lineHeight: 0,
                        }}
                      >
                        {v.image ? (
                          <Image
                            width={48}
                            height={48}
                            preview={false}
                            src={v.image}
                            fallback={IMG_FALLBACK}
                            style={{ borderRadius: 6, objectFit: 'cover', pointerEvents: 'none' }}
                          />
                        ) : (
                          <span
                            style={{ display: 'inline-block', lineHeight: '20px', padding: '4px 12px', fontSize: 12 }}
                          >
                            {v.value}
                          </span>
                        )}
                        {priced > 0 ? (
                          <span
                            style={{
                              position: 'absolute',
                              top: -8,
                              right: -8,
                              background: '#52c41a',
                              color: '#fff',
                              fontSize: 11,
                              borderRadius: 10,
                              padding: '0 6px',
                              lineHeight: '16px',
                              zIndex: 1,
                            }}
                          >
                            {priced}
                          </span>
                        ) : null}
                      </span>
                    );
                  })}
                </div>
              </div>
            ) : null}
            {rowSkus.length ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {otherDims.length ? (
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {otherDims.map((d) => d.name).join(' / ')}
                  </Typography.Text>
                ) : null}
                {rowSkus.map((s) => {
                  const d = draftSku(s.id);
                  const skuCost =
                    Array.isArray(s.ladderPrice) && s.ladderPrice[costTierIdx]
                      ? s.ladderPrice[costTierIdx].price
                      : costPrice;
                  const cur =
                    (Array.isArray(s.ladderPrice) && s.ladderPrice[0] && s.ladderPrice[0].currency) ||
                    detail.currencyOriginal;
                  const mg =
                    d.priceTarget != null && skuCost != null && d.priceTarget > 0
                      ? Math.round(((d.priceTarget - skuCost) / d.priceTarget) * 100)
                      : null;
                  return (
                    <div key={s.id} className="skurow">
                      <span className="tag2">
                        {otherDims.length
                          ? otherDims
                              .map((dm) => skuAttr(s, dm.name))
                              .filter(Boolean)
                              .join(' / ')
                          : s.specValue || s.sku}
                      </span>
                      <div className="cost">
                        成本 <b>{skuCost != null ? `${curSym(cur)}${skuCost}` : '-'}</b>
                      </div>
                      <div className="field">
                        <span className="fl">售价</span>
                        <InputNumber
                          size="small"
                          disabled={locked}
                          min={0}
                          step={0.01}
                          value={d.priceTarget}
                          onChange={(v) => setSkuField(s.id, 'priceTarget', v)}
                          style={{ width: '100%' }}
                        />
                      </div>
                      <div
                        className="margin"
                        style={{ color: mg == null ? 'var(--text-3)' : mg < 0 ? 'var(--coral)' : 'var(--jade)' }}
                      >
                        {mg == null ? '毛利 -' : `毛利 ${mg}%`}
                      </div>
                      <div className="field">
                        <span className="fl">库存</span>
                        <InputNumber
                          size="small"
                          disabled={locked}
                          min={0}
                          value={d.stock}
                          onChange={(v) => setSkuField(s.id, 'stock', v)}
                          style={{ width: '100%' }}
                          placeholder="必填"
                          status={!locked && d.priceTarget != null && !(d.stock > 0) ? 'error' : undefined}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
            {!locked && ladderShared ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  flexWrap: 'wrap',
                  marginTop: 10,
                  padding: '6px 8px',
                  background: '#fafafa',
                  borderRadius: 6,
                }}
              >
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  批量定价：成本 {costTier ? `${curSym(costTier.currency)}${costTier.price}` : '-'} × (1 + 利润率
                </Typography.Text>
                <InputNumber
                  size="small"
                  min={0}
                  max={500}
                  value={marginPct}
                  onChange={(v) => setMarginPct(v || 0)}
                  style={{ width: 72 }}
                  suffix="%"
                />
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  )
                </Typography.Text>
                <Button size="small" onClick={() => fillPrices(false)}>
                  应用到全部 SKU
                </Button>
                {primaryDim ? (
                  <Button size="small" onClick={() => fillPrices(true)}>
                    仅当前{primaryDim.name}
                  </Button>
                ) : null}
              </div>
            ) : null}
            {LadderEditor}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                flexWrap: 'wrap',
                marginTop: 10,
                paddingTop: 8,
                borderTop: '1px solid #f5f5f5',
              }}
            >
              <Typography.Text style={{ fontSize: 13 }}>
                发布展示价：
                <Typography.Text strong style={{ fontSize: 15, color: '#ff4d4f' }}>
                  {autoPrice != null ? `${autoPrice} 起` : '未定价'}
                </Typography.Text>
              </Typography.Text>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                （自动=最低 SKU 售价）
              </Typography.Text>
              <span style={{ flex: 1 }} />
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                划线价
              </Typography.Text>
              <InputNumber
                size="small"
                disabled={locked}
                min={0}
                step={0.01}
                value={draft.listPriceTarget}
                onChange={(v) => setDraftField('listPriceTarget', v)}
                style={{ width: 92 }}
              />
              <Typography.Text style={{ fontSize: 13 }}>
                总库存：
                {autoStock > 0 ? (
                  <Typography.Text strong>{autoStock}</Typography.Text>
                ) : (
                  <Typography.Text type="danger">未填</Typography.Text>
                )}
              </Typography.Text>
              {autoStock > 0 ? (
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  （自动=各 SKU 之和）
                </Typography.Text>
              ) : (
                <InputNumber
                  size="small"
                  disabled={locked}
                  min={0}
                  value={draft.stock}
                  onChange={(v) => setDraftField('stock', v)}
                  style={{ width: 92 }}
                  placeholder="必填"
                  status={!locked ? 'error' : undefined}
                />
              )}
              {!locked && (draft.skus || []).some((s) => !(s.stock > 0)) ? (
                <Button
                  size="small"
                  onClick={() =>
                    setDraft((d) => ({ ...d, skus: d.skus.map((s) => (s.stock > 0 ? s : { ...s, stock: 1000 })) }))
                  }
                >
                  空库存全部填 1000
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    ) : (
      <div style={{ padding: '12px 14px', background: '#fff', border: '1px solid #f0f0f0', borderRadius: 8 }}>
        <Typography.Text strong>销售信息</Typography.Text>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            该商品无 SKU，直接填商品级定价：售价
          </Typography.Text>
          <InputNumber
            size="small"
            disabled={locked}
            min={0}
            step={0.01}
            value={draft.priceTarget}
            onChange={(v) => setDraftField('priceTarget', v)}
            style={{ width: 92 }}
          />
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            划线价
          </Typography.Text>
          <InputNumber
            size="small"
            disabled={locked}
            min={0}
            step={0.01}
            value={draft.listPriceTarget}
            onChange={(v) => setDraftField('listPriceTarget', v)}
            style={{ width: 92 }}
          />
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            库存
          </Typography.Text>
          <InputNumber
            size="small"
            disabled={locked}
            min={0}
            value={draft.stock}
            onChange={(v) => setDraftField('stock', v)}
            style={{ width: 92 }}
            placeholder="必填"
            status={!locked && !(draft.stock > 0) ? 'error' : undefined}
          />
        </div>
        {LadderEditor}
      </div>
    );

    // 供应商信息已置顶为店铺条 .shopbar(Phase 3),此处不再单列供应商卡,避免重复。

    // ---- 抓取全量信息（来源/供应商/关键属性/证书/贸易信息/详情页 HTML 原文）----
    const shop = detail.shopInfo || {};
    const certs = Array.isArray(detail.certifications) ? detail.certifications : [];
    const trade = detail.tradeInfo && typeof detail.tradeInfo === 'object' ? detail.tradeInfo : {};
    const origAttrs = Object.entries(detail.attributesOriginal || {});
    const srcStatusTag = detail.statusOriginal ? (
      <Tag color={detail.statusOriginal === 'PRODUCT_ONLINE' ? 'green' : 'default'}>
        {detail.statusOriginal === 'PRODUCT_ONLINE' ? '源站在售' : detail.statusOriginal}
      </Tag>
    ) : (
      '-'
    );
    const infoItems = [
      {
        key: 'source',
        label: (
          <Space size={6}>
            <span>商品信息</span>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              来源 / 供应商 / MOQ
            </Typography.Text>
          </Space>
        ),
        children: (
          <Descriptions
            size="small"
            column={2}
            bordered
            items={[
              { key: 'p', label: '来源平台', children: detail.sourcePlatform || '-' },
              { key: 'pid', label: '源商品 ID', children: detail.sourceProductId || '-' },
              { key: 'cat', label: '源类目', children: detail.categoryOriginal || '-' },
              { key: 'st', label: '源商品状态', children: srcStatusTag },
              { key: 'moq', label: '起订量 MOQ', children: detail.moq != null ? detail.moq : '-' },
              { key: 'cur', label: '原币种', children: detail.currencyOriginal || '-' },
              { key: 'sup', label: '供应商（店铺）', children: shop.supplierName || '-' },
              {
                key: 'cap',
                label: '抓取时间',
                children: detail.createdAt ? dayjs(detail.createdAt).format('YYYY-MM-DD HH:mm') : '-',
              },
              {
                key: 'url',
                label: '源链接',
                span: 2,
                children: detail.sourceUrl ? (
                  <Typography.Link
                    href={detail.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    ellipsis
                    style={{ maxWidth: 420, display: 'inline-block' }}
                  >
                    {detail.sourceUrl}
                  </Typography.Link>
                ) : (
                  '-'
                ),
              },
            ]}
          />
        ),
      },
      origAttrs.length
        ? {
            key: 'attrs',
            label: (
              <Space size={6}>
                <span>关键属性（原始）</span>
                <Tag>{origAttrs.length} 项</Tag>
              </Space>
            ),
            children: (
              <Descriptions
                size="small"
                column={2}
                bordered
                items={origAttrs.map(([ak, av], i) => ({ key: String(i), label: ak, children: String(av ?? '-') }))}
              />
            ),
          }
        : null,
      certs.length
        ? {
            key: 'certs',
            label: (
              <Space size={6}>
                <span>证书</span>
                <Tag color="magenta">{certs.length} 个</Tag>
              </Space>
            ),
            children: (
              <Space direction="vertical" size={6} style={{ width: '100%' }}>
                {certs.map((c, i) => (
                  <Space key={i} size={8} wrap>
                    <Tag color="magenta">{c.certName || '证书'}</Tag>
                    <Typography.Text style={{ fontSize: 12 }}>{c.certNo || ''}</Typography.Text>
                    {(c.certUrls || []).map((u, ui) => (
                      <Image
                        key={ui}
                        width={48}
                        height={48}
                        src={u}
                        fallback={IMG_FALLBACK}
                        style={{ borderRadius: 4, objectFit: 'cover', border: '1px solid #f0f0f0' }}
                      />
                    ))}
                  </Space>
                ))}
              </Space>
            ),
          }
        : null,
      Object.keys(trade).length
        ? {
            key: 'trade',
            label: '贸易信息',
            children: (
              <Descriptions
                size="small"
                column={2}
                bordered
                items={Object.entries(trade).map(([tk, tv], i) => ({
                  key: String(i),
                  label: tk,
                  children: typeof tv === 'object' ? JSON.stringify(tv) : String(tv ?? '-'),
                }))}
              />
            ),
          }
        : null,
      {
        key: 'reviews',
        label: (
          <Space size={6}>
            <span>评价</span>
            {detail.productReviews || detail.shopReviews ? null : (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                接口未提供
              </Typography.Text>
            )}
          </Space>
        ),
        children:
          detail.productReviews || detail.shopReviews ? (
            <Space direction="vertical" size={6} style={{ width: '100%' }}>
              {detail.shopReviews ? (
                <Typography.Text style={{ fontSize: 12 }}>
                  店铺评价：{JSON.stringify(detail.shopReviews)}
                </Typography.Text>
              ) : null}
              {Array.isArray(detail.productReviews)
                ? detail.productReviews.map((rv, i) => (
                    <div key={i} style={{ borderBottom: '1px solid #f0f0f0', paddingBottom: 4 }}>
                      <Typography.Text style={{ fontSize: 12 }}>
                        {typeof rv === 'object' ? JSON.stringify(rv) : String(rv)}
                      </Typography.Text>
                    </div>
                  ))
                : null}
            </Space>
          ) : (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              产品评价 / 店铺评价：Alibaba 官方接口未提供评论数据。抓取选项勾选「产品评价 /
              店铺评价」时会在任务步骤中记录说明；接入爬虫服务后即可真实抓取并在此展示。
            </Typography.Text>
          ),
      },
    ].filter(Boolean);

    const Header = (
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 8,
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <div style={{ flex: 1, minWidth: 280 }}>
          {/* 商品标题：常显输入框（免采纳，默认沿用原标题）+ 官方式「AI 优化」一键入口 */}
          <Space size={8} wrap style={{ marginBottom: 4 }}>
            <Typography.Text strong style={{ fontSize: 13 }}>
              商品标题
            </Typography.Text>
            <Tooltip title={TITLE_RULES_TEXT} overlayStyle={{ maxWidth: 420 }}>
              <Typography.Text type="secondary" style={{ fontSize: 12, cursor: 'help' }}>
                标题规范 ⓘ
              </Typography.Text>
            </Tooltip>
            {!locked ? (
              <Button
                size="small"
                type="link"
                style={{ padding: 0, height: 20, fontWeight: 500 }}
                onClick={() => openFieldAI('title')}
              >
                ✨ AI 优化标题
              </Button>
            ) : null}
            {isDirty('titleFinal') ? <PendingTag /> : null}
          </Space>
          {locked ? (
            <Typography.Text strong style={{ fontSize: 15, display: 'block' }}>
              {draft.titleFinal || detail.titleOriginal || '（无标题）'}
            </Typography.Text>
          ) : (
            <Input
              value={draft.titleFinal}
              maxLength={128}
              showCount
              placeholder="发布标题（默认沿用原标题，可直接改或点「AI 优化标题」）"
              onChange={(e) => setDraftField('titleFinal', e.target.value)}
            />
          )}
          {!locked && (detail.titleOriginal || '') && draft.titleFinal !== (detail.titleOriginal || '') ? (
            <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 2 }}>
              原标题：{detail.titleOriginal}
              <Button
                type="link"
                size="small"
                style={{ padding: '0 4px', height: 18 }}
                onClick={() => setDraftField('titleFinal', detail.titleOriginal || '')}
              >
                恢复
              </Button>
            </div>
          ) : null}
          {/* 状态行(精简版):锁定态 + 状态 + 源站在售 + 品类 + 起订。供应商已移到顶部店铺条,此处去重不再重复。 */}
          <Space size={4} wrap style={{ marginTop: 4 }}>
            {locked ? (
              <Tooltip
                title={
                  detail.status === 'reviewed'
                    ? '已审核锁定,改前先「回退审核」'
                    : '已锁定,改前先「退回编辑」(平台内容不受影响)'
                }
              >
                <Tag color="green">🔒 字段已锁定</Tag>
              </Tooltip>
            ) : null}
            <Tag color={sm.color}>{sm.label}</Tag>
            {detail.statusOriginal === 'PRODUCT_ONLINE' ? <Tag color="green">源站在售</Tag> : null}
            {detail.categoryOriginal ? <Tag>{detail.categoryOriginal}</Tag> : null}
            {detail.moq != null ? (
              <Tag color="orange">
                起订 {detail.moq} {skuUnit || '件'}
              </Tag>
            ) : null}
          </Space>
        </div>
        <Space wrap align="center">
          {/* AI 员工与发布前检查与审核操作同排（用户反馈：这些都属于「审核动作」，集中放一起） */}
          <EmployeeAvatar
            kit={kit}
            username="lst-toby"
            disabled={locked}
            title={
              locked
                ? `已锁定，请先「${detail.status === 'reviewed' ? '回退审核' : '退回编辑'}」再让 Toby 编辑`
                : '文案管家 Toby：对话式改标题/描述/属性，或按阶梯成本+利润率批量给 SKU 定价（先暂存标黄，点「保存」才入库）。也可直接说「按 500 件档、40% 利润率给全部 SKU 定价」'
            }
            onClick={openToby}
          />
          <EmployeeAvatar
            kit={kit}
            username="lst-rena"
            title="合规研究员 Rena：只读检查违禁词/合规风险与卖点建议，不改数据"
            onClick={openRena}
          />
          <Button size="small" onClick={precheckRun}>
            🔍 发布前检查
          </Button>
          <Tooltip title="移动端预览">
            <span>
              <Switch
                size="small"
                checkedChildren="移动"
                unCheckedChildren="PC"
                checked={mobile}
                onChange={setMobile}
              />
            </span>
          </Tooltip>
          {locked ? (
            detail.status === 'reviewed' ? (
              <Button size="small" loading={busy} onClick={rollback}>
                回退审核
              </Button>
            ) : (
              <Tooltip
                title={
                  detail.status === 'published'
                    ? '退回后可重新编辑并再走审核发布；平台上已发布的内容不受影响'
                    : '发布中一般请等批次结束；超过 5 分钟没动静可用本按钮解锁'
                }
              >
                <Button size="small" loading={busy} onClick={reopen}>
                  退回编辑
                </Button>
              </Tooltip>
            )
          ) : (
            <>
              {dirtyCount ? (
                <Tag color="gold" style={{ marginInlineEnd: 0 }}>
                  待提交 {dirtyCount}
                </Tag>
              ) : null}
              <Button size="small" loading={busy} onClick={save}>
                保存
              </Button>
              <Button size="small" type="primary" loading={busy} onClick={approve}>
                {detail.status === 'publish_failed' ? '重新标记审核' : '标记审核通过'}
              </Button>
            </>
          )}
        </Space>
      </div>
    );

    // 店铺 / 供应商条(仿 1688 店铺头,置于商品内容最顶)。Creative Console 皮肤 → 外层挂 .aic-scope。
    // 店铺四指标(回头率/服务分/准时发货/好评率)源站 OpenAPI 未提供 → 优雅降级「待抓取」(数据补齐前占位)。
    const shopBarInfo = detail.shopInfo || {};
    const supplierName = shopBarInfo.supplierName || '未知供应商';
    const shopInitial = (String(supplierName).trim()[0] || '?').toUpperCase();
    const capturedAt = detail.createdAt ? dayjs(detail.createdAt).format('YYYY-MM-DD') : '';
    const shopSub = [
      detail.categoryOriginal ? '主营 ' + detail.categoryOriginal : null,
      detail.sourceProductId ? '源商品 #' + detail.sourceProductId : null,
      capturedAt ? '抓取于 ' + capturedAt : null,
    ]
      .filter(Boolean)
      .join('　·　');
    const ShopBar = (
      <div className="aic-scope">
        <div className="shopbar">
          <div className="sb-logo">{shopInitial}</div>
          <div className="sb-main">
            <div className="sb-name">
              <span className="sb-nm" title={supplierName}>
                {supplierName}
              </span>
              {detail.sourcePlatform ? <span className="sb-plat">{detail.sourcePlatform} · 供应商</span> : null}
            </div>
            {shopSub ? <div className="sb-sub">{shopSub}</div> : null}
          </div>
          <div className="sb-stats">
            {['回头率', '服务分', '准时发货', '好评率'].map((k) => (
              <div className="st" key={k}>
                <div
                  className="sv"
                  style={{ fontFamily: 'inherit', fontSize: 11, fontWeight: 600, color: 'var(--text-3)' }}
                >
                  待抓取
                </div>
                <div className="sk">{k}</div>
              </div>
            ))}
          </div>
          {detail.sourceUrl ? (
            <a className="sb-act" href={detail.sourceUrl} target="_blank" rel="noreferrer">
              在源站查看店铺 →
            </a>
          ) : null}
        </div>
      </div>
    );

    // 视频已并入上方「商品图片 · AI 改图」区的图集列(vslot),供应商信息已置顶为店铺条 .shopbar,
    // 此处不再单列图集/视频/供应商,避免与之重复(Phase 3)。
    const Gallery = null;

    // ---- 商品属性（规格参数）：发布后展示在商品页「规格参数/产品属性」区，多数平台按类目必填 ----
    const attrOrig = detail.attributesOriginal || {};
    const AttributesSection = (
      <div className="aic-scope" style={{ marginTop: 12 }}>
        <div className="card" style={{ margin: 0 }}>
          <div className="shead">
            <span className="zh">商品属性（规格参数）</span>
            <Tooltip title="发布到平台后展示在商品页「规格参数 / 产品属性」区（如 材质/产地/用途）；多数平台按类目必填，填得全有利搜索曝光。左边属性名、右边属性值，可增删改；来源为抓取的关键属性 + AI 补全建议（紫色=AI 整理/补全）。">
              <span className="i" style={{ cursor: 'help' }}>
                ⓘ
              </span>
            </Tooltip>
            {isDirty('attributes') ? <PendingTag /> : null}
            <span className="sp" />
            <span className="meta">{attrEntries.length} 项</span>
          </div>
          <div className="cbody">
            <div className="attrgrid">
              {attrEntries.map(([k, val], i) => {
                const isAi =
                  !(k in attrOrig) || String(attrOrig[k] == null ? '' : attrOrig[k]) !== String(val == null ? '' : val);
                return (
                  <div
                    key={i}
                    className={`attr${isAi ? ' ai' : ''}`}
                    style={{ gridTemplateColumns: '112px 1fr auto', alignItems: 'center' }}
                  >
                    <Input
                      variant="borderless"
                      size="small"
                      disabled={locked}
                      value={k}
                      onChange={(e) => {
                        const nk = e.target.value;
                        setDraft((d) => {
                          const ent = Object.entries(d.attributes);
                          ent[i] = [nk, val];
                          return { ...d, attributes: Object.fromEntries(ent) };
                        });
                      }}
                      style={{ fontSize: 11, fontWeight: 700, color: isAi ? '#5a3ff0' : 'var(--text-3)' }}
                    />
                    <Input
                      variant="borderless"
                      size="small"
                      disabled={locked}
                      value={val}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, attributes: { ...d.attributes, [k]: e.target.value } }))
                      }
                      style={{ fontSize: 12, fontWeight: 600 }}
                    />
                    {isAi ? (
                      <span
                        style={{
                          fontSize: 8,
                          color: '#5a3ff0',
                          border: '1px solid var(--violet-line)',
                          borderRadius: 4,
                          padding: '0 3px',
                          marginRight: 4,
                        }}
                      >
                        AI
                      </span>
                    ) : null}
                    {!locked ? (
                      <Button
                        type="text"
                        size="small"
                        danger
                        style={{ padding: '0 6px' }}
                        onClick={() =>
                          setDraft((d) => {
                            const a = { ...d.attributes };
                            delete a[k];
                            return { ...d, attributes: a };
                          })
                        }
                      >
                        删
                      </Button>
                    ) : null}
                  </div>
                );
              })}
            </div>
            {!locked ? (
              <Button
                size="small"
                type="dashed"
                style={{ marginTop: 10 }}
                onClick={() =>
                  setDraft((d) => ({
                    ...d,
                    attributes: { ...d.attributes, [`新属性${Object.keys(d.attributes).length + 1}`]: '' },
                  }))
                }
              >
                + 添加属性
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    );

    // ---- 商品描述：发布描述可编辑；AI 建议 / 源站文本 / 源站详情页 供参考对照 ----
    const DESC_TABS = [
      { label: '发布描述（可编辑）', value: 'final' },
      { label: '参考建议', value: 'ai' },
      { label: '源站文本', value: 'original' },
      { label: '源站详情页', value: 'html' },
    ];
    const DescriptionSection = (
      <div className="aic-scope" style={{ marginTop: 12 }}>
        <div className="card" style={{ margin: 0 }}>
          <div className="shead">
            <span className="zh">商品描述</span>
            <Tooltip title={SELLING_RULES_TEXT} overlayStyle={{ maxWidth: 420 }}>
              <span className="i" style={{ cursor: 'help' }}>
                卖点规范 ⓘ
              </span>
            </Tooltip>
            {isDirty('descriptionFinal') ? <PendingTag /> : null}
            <span className="sp" />
            {!locked ? (
              <Button
                size="small"
                type="link"
                style={{ padding: 0, fontWeight: 600 }}
                onClick={() => openFieldAI('description')}
              >
                ✨ AI 优化描述
              </Button>
            ) : null}
          </div>
          <div className="cbody">
            <div className="dtabs" style={{ marginBottom: 10 }}>
              {DESC_TABS.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  className={descTab === t.value ? 'on' : undefined}
                  onClick={() => setDescTab(t.value)}
                >
                  {t.label}
                </button>
              ))}
            </div>
            {descTab === 'final' ? (
              <>
                <Input.TextArea
                  rows={8}
                  disabled={locked}
                  value={draft.descriptionFinal}
                  onChange={(e) => setDraftField('descriptionFinal', e.target.value)}
                  placeholder={
                    '发布后作为平台「商品卖点」展示（进 AI Search 索引）。建议英文分点 ≤5 条、每条「Title: Content」，可点右上「✨ AI 优化描述」按官方规范一键生成'
                  }
                />
                {!locked && detail.descriptionProcessed ? (
                  <Button
                    size="small"
                    type="link"
                    style={{ padding: 0, marginTop: 4 }}
                    onClick={() => setDraftField('descriptionFinal', detail.descriptionProcessed)}
                  >
                    使用参考建议 →
                  </Button>
                ) : null}
              </>
            ) : descTab === 'ai' ? (
              <div
                className="desc"
                style={{ color: '#5a3ff0', whiteSpace: 'pre-wrap', maxHeight: 320, overflowY: 'auto' }}
              >
                {detail.descriptionProcessed ||
                  '（暂无参考建议。参考建议来自信息处理阶段；要生成新文案请点「✨ AI 优化描述」，结果直接写入发布描述）'}
              </div>
            ) : descTab === 'original' ? (
              <div
                className="desc"
                style={{ color: 'var(--text-2)', whiteSpace: 'pre-wrap', maxHeight: 320, overflowY: 'auto' }}
              >
                {detail.descriptionOriginal || '-'}
              </div>
            ) : detail.descriptionHtmlOriginal ? (
              <iframe
                title="源站详情页预览"
                sandbox=""
                srcDoc={detail.descriptionHtmlOriginal}
                style={{
                  width: '100%',
                  height: 480,
                  border: '1px solid var(--line)',
                  borderRadius: 10,
                  background: '#fff',
                }}
              />
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="无源站详情页 HTML" />
            )}
          </div>
        </div>
      </div>
    );

    RightPanel = (
      <Card size="small" style={{ height: '100%' }} styles={{ body: { padding: 12 } }}>
        {ShopBar}
        {Header}
        {/* 原「已发布/已审核·字段锁定」整张绿横幅已精简移除:锁定态由 Header 的锁定行 + 右栏生命周期面板(含
            「查看平台上的商品」)表达,不再占一整块。发布失败/操作反馈/发布前检查等即时提示仍保留。 */}
        {detail.status === 'publish_failed' ? (
          <Alert
            type="error"
            showIcon
            style={{ marginBottom: 8 }}
            message={`上次发布失败${
              detail.lastPublishFailure && detail.lastPublishFailure.errorCode
                ? `（${detail.lastPublishFailure.errorCode}）`
                : ''
            }：${(detail.lastPublishFailure || {}).reason || '未记录原因，请查看发布页记录'}`}
            description="可直接在本页修改（保存后自动回到「审核中」）；若问题在平台侧、本地无需改动，也可直接点「重新标记审核」后去发布页重发。"
          />
        ) : null}
        {banner ? (
          <Alert
            type={banner.type}
            showIcon
            closable
            style={{ marginBottom: 8 }}
            message={banner.msg}
            onClose={() => setBanner(null)}
          />
        ) : null}

        {precheck ? (
          <Alert
            style={{ marginBottom: 10 }}
            type={precheck.ready ? 'success' : 'warning'}
            showIcon
            message={precheck.ready ? '发布前检查通过（注意：本阶段不做真实发布）' : '发布前检查发现问题'}
            description={
              precheck.issues.length ? (
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {precheck.issues.map((it, i) => (
                    <li key={i}>
                      <Tag color={it.level === 'block' ? 'red' : 'gold'}>{it.level === 'block' ? '阻断' : '建议'}</Tag>
                      {it.message}
                    </li>
                  ))}
                </ul>
              ) : null
            }
          />
        ) : null}

        <Spin spinning={loadingDetail}>
          <div
            style={
              mobile ? { maxWidth: 375, margin: '0 auto', border: '1px solid #eee', borderRadius: 8, padding: 12 } : {}
            }
          >
            {/* 商品图片(主图/详情图)与 AI 改图统一在此区,不再单列图集,避免重复 */}
            {detail && detail.id ? (
              <AiCandidateZone productId={detail.id} onChange={() => loadDetail(detail.id)} />
            ) : null}
            {/* 图集/视频/供应商已上移(AI 改图区 vslot + 顶部店铺条),此处只余 SKU 定价,占满整行。 */}
            {SkuSection}
            {AttributesSection}
            {DescriptionSection}
            {/* 更多来源信息（默认收起）：商品信息 / 关键属性原始 / 证书 / 贸易信息 / 评价 */}
            <Collapse size="small" style={{ marginTop: 12 }} items={infoItems} />
          </div>
        </Spin>
      </Card>
    );
  }

  // ---------- 商品生命周期面板（仿官方 demo 订单详情的 Order workflow 侧栏）----------
  // 阶段按顺序列出：已完成 ✓、当前阶段高亮、后续灰置；每个阶段旁只出现「当前合法」的流转按钮，
  // 按钮复用本页既有受控动作（回退审核/退回编辑/标记审核），跨页动作跳对应页面。
  const PUBLISH_PAGE = 'tys37qjf3jz';
  const PROCESS_PAGE = 'bhgkujnjpe7';
  const goPage = (uid) => ctx.router?.navigate?.(`/admin/${uid}`);
  let LifecyclePanel = null;
  if (detail) {
    const st = detail.status;
    const stepIdx =
      {
        captured: 0,
        capturing: 0,
        processing: 0,
        process_failed: 0,
        processed: 1,
        reviewing: 2,
        reviewed: 3,
        publishing: 4,
        published: 5,
        publish_failed: 5,
      }[st] ?? 2;
    const canApprove = ['processed', 'reviewing', 'publish_failed'].includes(st) && detail.titleFinal;
    const steps = [
      { label: '1. 已抓取' },
      {
        label: '2. 已处理',
        action: ['captured', 'process_failed'].includes(st)
          ? { text: '去处理', run: () => goPage(PROCESS_PAGE) }
          : null,
      },
      {
        label: '3. 编辑 / 审核中',
        action:
          st === 'reviewed'
            ? { text: '回退审核', run: rollback }
            : ['published', 'publish_failed', 'publishing'].includes(st)
            ? { text: '退回编辑', run: reopen }
            : null,
      },
      {
        label: '4. 已审核（可发布）',
        action: canApprove ? { text: st === 'publish_failed' ? '重新标记审核' : '标记审核通过', run: approve } : null,
      },
      { label: '5. 发布中' },
      {
        label: st === 'publish_failed' ? '6. 发布失败' : '6. 已发布',
        danger: st === 'publish_failed',
        action: st === 'reviewed' ? { text: '去发布', run: () => goPage(PUBLISH_PAGE) } : null,
      },
    ];
    // 「下一步」主行动：电商运营看这块只想知道「现在该干嘛」——按状态给出唯一的主 CTA。
    const nextAction = ['captured', 'process_failed'].includes(st)
      ? { text: '下一步：去信息处理', run: () => goPage(PROCESS_PAGE) }
      : ['processed', 'reviewing'].includes(st)
      ? { text: '下一步：标记审核通过', run: approve }
      : st === 'publish_failed'
      ? { text: '下一步：重新标记审核', run: approve }
      : st === 'reviewed'
      ? { text: '下一步：去发布', run: () => goPage(PUBLISH_PAGE) }
      : st === 'published' && detail.publishUrl
      ? { text: '查看平台上的商品 →', run: () => window.open(detail.publishUrl, '_blank') }
      : null;
    // 发布就绪清单：把「发布必须的信息」直接亮出来，缺什么一眼看到（库存漏填是最高频返工点）。
    const dSkus = (draft && draft.skus) || [];
    const priceReady =
      dSkus.some((s) => s.priceTarget != null) ||
      (draft && draft.priceTarget != null) ||
      ((draft && draft.ladderTarget) || []).length > 0;
    const stockReady = dSkus.length
      ? dSkus.some((s) => s.stock > 0) && dSkus.every((s) => !(s.priceTarget != null) || s.stock > 0)
      : !!(draft && draft.stock > 0);
    const readiness =
      !locked && draft
        ? [
            { label: '标题', ok: true, note: draft.titleFinal ? '已填写' : '沿用原标题' },
            { label: '定价', ok: priceReady, note: priceReady ? '已定价' : '未定价' },
            {
              label: '库存',
              ok: stockReady,
              note: stockReady ? '已填写' : '未填（发布会失败）',
              fix: !stockReady
                ? () =>
                    setDraft((d) => ({
                      ...d,
                      skus: (d.skus || []).map((s) => (s.stock > 0 ? s : { ...s, stock: 1000 })),
                      stock: (d.skus || []).length ? d.stock : d.stock > 0 ? d.stock : 1000,
                    }))
                : null,
            },
            {
              label: '描述',
              ok: !!draft.descriptionFinal,
              note: draft.descriptionFinal ? '已填写' : '建议 AI 生成',
              soft: true,
            },
          ]
        : null;
    LifecyclePanel = (
      <div className="aic-scope">
        <div className="sidecard">
          <div className="sc-head">
            <span className="t">商品生命周期</span>
            <Tooltip title="阶段按流程顺序列出：✓ 已完成、当前阶段高亮；主按钮是当前该做的下一步。">
              <span className="i" style={{ cursor: 'help' }}>
                ⓘ
              </span>
            </Tooltip>
            <span className="sp" />
            <Tag color={(STATUS_META[st] || {}).color || 'default'} style={{ marginInlineEnd: 0 }}>
              {(STATUS_META[st] || {}).label || st}
            </Tag>
          </div>
          <div className="sc-body">
            {nextAction ? (
              <button type="button" className="viewbtn" disabled={busy} onClick={nextAction.run}>
                {nextAction.text}
              </button>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 13, textAlign: 'center' }}>
                发布中，等待批次完成…
              </div>
            )}
            {readiness ? (
              <div
                style={{ border: '1px solid var(--line-2)', borderRadius: 10, padding: '8px 11px', marginBottom: 13 }}
              >
                <Typography.Text type="secondary" style={{ fontSize: 11, fontWeight: 700 }}>
                  发布就绪检查
                </Typography.Text>
                {readiness.map((r) => (
                  <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                    <span style={{ fontSize: 13, lineHeight: 1 }}>{r.ok ? '✅' : r.soft ? '⚠️' : '❌'}</span>
                    <Typography.Text style={{ fontSize: 12, width: 32 }}>{r.label}</Typography.Text>
                    <Typography.Text
                      type={r.ok ? 'secondary' : r.soft ? 'warning' : 'danger'}
                      style={{ fontSize: 12, flex: 1 }}
                    >
                      {r.note}
                    </Typography.Text>
                    {r.fix ? (
                      <Button size="small" type="link" style={{ padding: 0, height: 18, fontSize: 12 }} onClick={r.fix}>
                        一键填 1000
                      </Button>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
            <div className="steps">
              {steps.map((s, i) => {
                const current = i === stepIdx;
                const done = i < stepIdx;
                return (
                  <div key={s.label} className={`step${current ? ' curl' : ''}${!done && !current ? ' waitl' : ''}`}>
                    <span className={`dot ${done ? 'done' : current ? 'cur' : 'wait'}`}>{done ? '✓' : i + 1}</span>
                    <span
                      className="sl"
                      style={current && s.danger ? { color: 'var(--coral)', fontWeight: 700 } : undefined}
                    >
                      {s.label.replace(/^\d+\.\s*/, '')}
                    </span>
                    {s.action ? (
                      <button type="button" className="rb" disabled={busy} onClick={s.action.run}>
                        {s.action.text}
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
            {detail.status === 'publish_failed' && detail.lastPublishFailure ? (
              <div style={{ fontSize: 12, color: 'var(--coral)', marginTop: 10 }}>
                上次失败：{(detail.lastPublishFailure.reason || '').slice(0, 60)}
              </div>
            ) : null}
            {detail.publishUrl && st !== 'published' ? (
              <div style={{ marginTop: 10 }}>
                <a
                  href={detail.publishUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{ fontSize: 12, color: 'var(--violet)' }}
                >
                  查看平台上的商品/草稿 →
                </a>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  // ---------- 变更记录（人话版：中文字段名 + 值摘要；原始字段名进悬停提示留给排查用）----------
  const shownLogs = logs.filter((l) => !isNoopAudit(l)).filter((l) => !logFilter || l.actorType === logFilter);
  const ChangeLog = (
    <div className="aic-scope">
      <div className="sidecard">
        <div className="sc-head">
          <span className="t">变更记录</span>
          <span className="sp" />
          <div className="afilter">
            {[
              { label: '全部', value: '' },
              { label: '人工', value: 'user' },
              { label: 'AI', value: 'ai_employee' },
              { label: '系统', value: 'system' },
            ].map((o) => (
              <button
                key={o.value}
                type="button"
                className={logFilter === o.value ? 'on' : undefined}
                onClick={() => setLogFilter(o.value)}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
        <div className="sc-body" style={{ maxHeight: 'calc(100vh - 480px)', overflowY: 'auto' }}>
          {shownLogs.length === 0 ? (
            <Empty description={logs.length ? '该来源暂无变更' : '暂无变更'} image={Empty.PRESENTED_IMAGE_SIMPLE} />
          ) : (
            <div className="log">
              {shownLogs.map((l) => {
                const am = ACTOR_META[l.actorType] || { color: 'default', label: l.actorType };
                const actorCls = { user: 'user', ai_employee: 'ai', system: 'sys' }[l.actorType] || 'sys';
                const f = l.fieldName;
                const hasOld = l.oldValue != null && l.oldValue !== '';
                return (
                  <div key={l.id} className="logrow">
                    <span className={`actor ${actorCls}`}>{am.label}</span>
                    <div className="lc">
                      <div className="lf">
                        <Tooltip title={`字段：${f || l.action}`}>
                          <span>{fieldLabel(f) || l.action}</span>
                        </Tooltip>
                        <span className="tm">{l.createdAt ? dayjs(l.createdAt).format('MM-DD HH:mm') : ''}</span>
                      </div>
                      <div className="lv" style={{ wordBreak: 'break-all' }}>
                        {hasOld ? (
                          <>
                            <span className="old">{fmtAuditVal(f, l.oldValue)}</span> →{' '}
                          </>
                        ) : null}
                        <span className="new">{fmtAuditVal(f, l.newValue)}</span>
                      </div>
                      {l.reason ? <div className="ln">{l.reason}</div> : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  if (listError) {
    const e = errOf(listError);
    return (
      <Alert
        type="error"
        showIcon
        message={`商品列表加载失败（${e.code}）`}
        description={<Typography.Text copyable code>{`traceId: ${e.traceId}`}</Typography.Text>}
      />
    );
  }

  // 三栏布局：中栏（商品详情）是唯一的长内容主滚动区；左右两栏 sticky 跟随视口，
  // 既修掉「左栏被中栏撑高、下面一大片空白」的问题，也让操作/记录始终在手边。
  return (
    <Row gutter={12}>
      <Col xs={24} sm={7} md={6} lg={5}>
        <div style={{ position: 'sticky', top: 8 }}>{LeftPanel}</div>
      </Col>
      <Col xs={24} sm={17} md={12} lg={13}>
        {RightPanel}
      </Col>
      <Col xs={24} sm={24} md={6} lg={6}>
        <div style={{ position: 'sticky', top: 8, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {LifecyclePanel}
          {ChangeLog}
        </div>
      </Col>
    </Row>
  );
}

ctx.render(<ReviewApp />);
