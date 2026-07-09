# 预览编辑页质量提升 · Phase 计划（2026-07-08）

> 依据：`2026-07-08-preview-edit-ux-audit.md`（实拍评审）。
> 原则：每个 phase 独立可验收；客户端改动 rebuild 即生效，jsBlock 改动最后经 apply 脚本写库（共享生产库，写前确认）。
> 自测工具：`docs/plans/scripts/shot-preview-edit.js`（无头登录截图 + 断言），每个 phase 自测跑同一套脚本。

## 部署通道说明

- **客户端改动**（creative-console.ts / MediaStudio.tsx）：`yarn build @crossborder/plugin-ai-listing --client-v2-only` + 硬刷新（Cmd+Shift+R）。
- **jsBlock 改动**（docs/jsblocks/preview-edit.js 镜像）：改镜像 → prettier → `! node docs/plans/scripts/apply-jsblock-to-db.js` 写库 → 硬刷新。**写库即影响生产**，每次写前跟你确认。

---

## Phase 0：验收工具固化（0.5h）✅ 前置

**做什么**
- 把本次评审用的无头截图/诊断脚本固化为 `docs/plans/scripts/shot-preview-edit.js`：登录（账号从环境变量 `SHOT_ACCOUNT/SHOT_PASSWORD` 传入，不落盘）→ 打开页面 → 输出三栏宽度、字体加载状态、sticky 检测 → 存 3 屏滚动截图。
- 基线截图已存（live-s0~s2.png / mock-full.png）。

**自测**：脚本能跑通、输出诊断 JSON。
**你验收**：无需操作（工具类 phase）。

---

## Phase 1：字体自托管（P0-2，~0.5d）【纯客户端】

**做什么**
1. 下载 Fraunces 500/600/700 + Instrument Sans 400/500/600/700 的 latin 子集 woff2（Google Fonts 静态文件，构建期一次性下载）。
2. base64 内嵌为 `@font-face` 追加进 `creative-console.ts`（`font-display: swap`）——同一份 CSS 会随 embed 脚本进 jsBlock 注入器，**生产端（国内）零外网依赖**。
3. 控制体积：只取 latin 子集（数字/拉丁字母/标点），总增量目标 < 200KB。
4. 同步镜像 CSS（`embed-jsblock-css.js`），本 phase 先不写库（Phase 2 一起写）。

**自测**
- 脚本断言：`document.fonts` 中出现 Fraunces/Instrument Sans 且 `status=loaded`；canvas 宽度 `Fraunces ≠ serif`；截图 SALES 区价格数字与 demo 对照。

**你验收**
- 硬刷新后看三处：SALES 的 `$1.2 / $0.76 / $0.62`、右栏变更记录里 `1.56 → 1.21`、左栏分页页码。都应从「细瘦 Times」变成 demo 那种**粗壮圆润的衬线数字**（对照 demo 图很明显）。

**回滚**：revert creative-console.ts 重新 build。

---

## Phase 2：三栏固定像素 + 修 sticky（P0-1，~1d）【jsBlock，需写库】

**做什么**
1. `Row/Col` 24 格布局 → flex：`左 250px 固定 + 中 flex(min-width:0) + 右 250px 固定`，`align-items: flex-start`（这一步同时让 sticky 天然生效：容器高度=中栏高度，左右栏有滑行空间）。
2. 左右栏 `position: sticky; top: 8px` + `max-height: calc(100vh - 头部高度)`，栏内自身滚动（列表已有内滚，右栏变更记录加内滚）。
3. 响应式：<1360px 两侧收窄到 220px；<1100px 三栏改纵向堆叠（媒体优先）。
4. 右栏 250px 下复查变更记录/过滤 chips：不再字中折行即可，不够再降密（单行摘要）。

**自测**
- 脚本断言：三栏实测宽度 `250 / ~950 / 250`；滚动到页底截图中**左列表和右栏仍可见**；变更记录无字中折行（截图人工复查）。

**你验收**
1. 滚到最底部（属性/描述区）：左侧商品列表、右侧生命周期+变更记录**始终在视口里**，两侧不再是大白。
2. 右栏「商品状态」「发布标题」等不再折成「商品状/态」。
3. 窗口缩到笔记本宽度（~1280）不破版。

**回滚**：`docs/jsblocks/_backup/` 快照 + apply 脚本回写。

---

## Phase 3：媒体卡首屏整顿（P0-3，~0.5d）【纯客户端】

**做什么**
1. stage 加衬底：canvas 色底 + 1px 内描边 + 阴影，白底商品图不再融进白卡。
2. **候选条 + 操作条（采纳选中候选/以此再改/弃用）移到 stage 正下方**，与舞台形成「看图→决策」动线（现在挂在左侧图集列底部，空间脱节）。
3. 去掉图集列底部的灰色骨架条。
4. 视频缩略取首帧（`src + '#t=0.1'`），已下载/已采纳徽章保留。

**自测**
- 截图断言：actbar 的 DOM 位置在 stage 之后（同列）；stage 有边界色；视频缩略非灰块。

**你验收**
1. 打开有候选的商品：三个操作按钮应在大图正下方。
2. 白底商品图四周能看到明显的卡片边界。
3. 视频缩略显示真实首帧。

---

## Phase 4：Header hero 标题卡（P1，~1d）【jsBlock，需写库】

**做什么**
1. 标题区重构为 demo 的 hero 卡：chip 行（标题规范ⓘ/锁定态/状态/品类/起订）→ 20px 大输入框（焦点光环、`98/128 ✓合规` 计数）→ 原标题/恢复行。
2. 右侧动作组同排：AI 头像 ×2、发布前检查、PC/手机 segmented（替换 Switch）、深色「退回编辑/保存/审核」按钮组。
3. emoji 图标（🔍✨🔒）→ 内联 SVG；antd 默认 Tag → 皮肤 chip（本卡范围内）。
4. 锁定态/编辑态两种形态都按 demo 处理。

**自测**
- 截图对照 demo hero 卡（锁定态 + 编辑态各一张）；输入超长标题看计数与合规提示。

**你验收**
1. 标题变大字号输入框，字数计数在框内右下。
2. 右上动作按钮风格统一（深色主钮、无默认蓝）。
3. 「退回编辑」→ 编辑态输入框可改、计数实时变。

---

## Phase 5：保存安全网（P1，~1d）【jsBlock，需写库】

**做什么**
1. 粘性操作条：dirty 时顶部常驻「待提交 N · 保存 · 标记审核通过」（与 Phase 4 的 Header 合并为粘性头）。
2. `Cmd/Ctrl+S` 保存（阻止浏览器默认）。
3. 未保存拦截：切换商品弹确认；`beforeunload` 关页提示。

**自测**
- 脚本：改字段 → 滚到底截图（操作条可见）→ 模拟切商品（确认弹窗出现）。

**你验收**
1. 改任意字段后滚到页底：保存按钮仍在视口。
2. `Cmd+S` 直接保存（出 toast）。
3. 改完不保存点别的商品：弹「未保存」确认；直接关标签页：浏览器拦截提示。

---

## P2 待排期（另立计划，按价值排序）

采纳免确认+可撤销 → 生成任务队列化（工具栏不阻塞）→ 候选网格对比+批量采纳 → 键盘流（j/k 切商品、←→ 切候选）→ 失败重试 / 对比缩放 / 常驻 prompt → 多人编辑占用。

## 节奏

Phase 1+3（纯客户端）先行 → 你验收观感 → Phase 2 写库（一次 apply 同时带上 Phase 1 的字体 CSS）→ 验收 → Phase 4 → Phase 5。每个 phase 完成即停，等你验收通过再进下一个。

## 验收记录

- **Phase 0** ✅ 2026-07-08：`shot-preview-edit.js` 固化并自测；顺带定位 sticky 失效根因（外层 `ant-card-body` `overflow:auto` 劫持滚动参照）。
- **Phase 1** ✅ 2026-07-08：`document.fonts` 实测 `Fraunces/500-700: loaded`、`Instrument Sans/400-700: loaded`，`frauncesReal=true`；SALES 价格/变更记录数字/页码实拍对照 demo 一致。woff2 按 URL 去重后仅 95KB（可变字体一份文件覆盖全部字重）。
- **Phase 3** ✅ 2026-07-08：灰胶囊（gcol::after 渐隐锚错位+配色）消失；候选条/操作条居中到 stage 正下方；无候选时操作条隐藏；视频缩略 `#t=0.1` 强制首帧（实测 readyState=4 无错误，该视频首帧本身为灰色画面，非 bug）。
- **Phase 2** ✅ 2026-07-08：三栏实测 `250 / 886 / 250`（此前 238/1010/178）；滚到页底左右栏可见性 `true/true`（此前 false/false）；变更记录不再字中折行、过滤 chips 单行；Babel parse 校验通过后经用户 `!` 运行 apply 写库。
- **Phase 4** ✅ 2026-07-09：Header hero 标题卡上线。锁定态与 demo 一致（20px 标题/计数 ✓合规/🔒锁定 chip/深色退回钮）；编辑态 textarea 自适应高度+焦点光环、实时计数、待提交、原标题/恢复。补修：eh-top 挤压折行（lbl/norm/chip nowrap + 整行 wrap）、去掉标题旁重复 PendingTag。
- **用户反馈批** ✅ 2026-07-09：①并排对比不完整——duocell img `height:100%` 在 auto 网格行解析失败导致溢出裁切，改绝对定位填格（实测 295×296 完整 contain）；②暖棕色板→中性白（tokens 全量中性化）；③区块色斑突兀——移除 `.aic-scope` 涂底；④左栏迷你分页（共 N 件 + ‹ n/m ›）替换 antd 全量分页；⑤去掉 1780px 上限、三栏铺满窗口（2100 视口实测 250/1306/250）。
- **Phase 5** ✅ 2026-07-09：保存安全网自测 7/7 通过——干净态 Cmd+S 拦截不误保存、编辑出现粘性保存条、滚到页底保存条钉住视口、dirty 时 beforeunload preventDefault、带草稿切商品弹确认、「留在本页」草稿保留。

## P2（改图效率深化）验收记录 — 2026-07-09 全部完成

- **P2-1 采纳免确认+可撤销** ✅ `f3136fe0a4`：主按钮免 Modal（有源图替换/无源图追加，标签动态），8s 撤销 toast；服务端 `revertAdopt` 按最近 media.adopt 审计回放（恢复被替换图/被顶视频），单测 27/27（4 新增），E2E 采纳→撤销净零。
- **A1 生成任务队列化** ✅ `17d9f01ebf`：模块级串行队列（跨商品切换存活），工具栏不再锁死；队列 chip（⏳/✓/✕）+ Popover 逐条状态 + 重试失败/清空；完成自动刷新候选。单测 3/3；E2E 拦截验证 ⏳2→✓1✕1→重试→✓2 全程工具栏可用。
- **A2 候选网格+批量采纳** ✅ `6d5f4af96c`：条带/网格切换（网格大图同屏对比）、卡左下复选、「采纳选中 N」批量（planBatchAdopt：同源冲突第一张替换其余追加）、撤销全部。规划器单测 3/3；E2E 勾2→采纳(10→8)→撤销全部(2/2 回 10)。
- **A3 键盘流** ✅ `cc59490cde`：←→ 切候选、A 采纳、X 弃用、Esc 回预览（客户端）；J/K 切商品（jsBlock，走 switchProduct 继承未保存确认，需 apply）。三重守卫：输入态/弹窗/拉帘手柄。E2E：0→1→0、Esc、A+撤销净零、搜索框吞键。
- **A5 对比缩放细查** ✅ `683bb59683`：滚轮 100–400%、放大拖动平移、双击复位、缩放角标。拉帘用背景缩放（transform 会带走 clip-path 导致帘线错位），两层像素级同步。E2E：双层 200% 帘线 50% 不动、平移 50/50→67/63、复位清空。
- **A6 舞台常驻 prompt 行** ✅ `ac79fd6bf5`：舞台下输入改图需求回车即进队列（无场景纯指令），共享模型/数量设置与队列 chip。E2E 拦截：清空输入、任务「自定义改图」、请求带 instruction 无 scene、完成 ✓1。
- **待排期**：B7 多人编辑占用（等多人使用场景）、B8 切商品骨架屏、B9 变更记录字段过滤/展开 diff（小打磨）。
