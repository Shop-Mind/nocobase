# 预览编辑页 · 视觉重设计实施规划（2026-07-08）

> 目标：把已定稿的高保真设计稿 **1:1 落到真实页面**，风格与创意工坊成套（Creative Console 语言）。
> **视觉与交互重构为主，不改动已验证的服务端能力**（`aiListingReview:*`、`aiListingMedia:*` 均在线可用）。
> 可视化基准（唯一视觉真源）：`docs/plans/mockups/preview-edit-redesign.html`（本地浏览器打开即可，含 Fraunces 衬线 + 真实图；沙箱内字体/图会降级）。

---

## 一、架构现状与实施策略（先读，决定每个 phase 落到哪）

### 1.1 真实页面是怎么搭的

在本地 `localhost:13000` 抓到的真实「预览编辑」页是一个**三栏工作台**，由两部分拼成：

| 部分 | 载体 | 在哪 | 可否版本管理 |
|---|---|---|---|
| **三栏外壳** + 商品列表 + 标题头 + SKU 定价 + 商品属性 + 描述 + 生命周期 + 变更记录 | **jsBlock `um6v8ddxrz8`**（沙箱 JS，存在数据库 uiSchema 里） | NocoBase 页面里 | ❌ 不在仓库 |
| **AI 候选区**（商品图片·AI 改图：图集 + 预览/对比 + 候选 + 采纳） | **`MediaStudio.tsx`**（真 React） | 仓库 `src/client-v2/components/MediaStudio/` | ✅ 在仓库 |
| 创意工坊（全屏 Modal） | `CreativeWorkshop.tsx`（真 React） | 仓库 | ✅ |

jsBlock 通过 `window.__aiListingMediaKit.mount(container, { productId })` 把 MediaStudio 挂进自己的容器（见 `media-kit.ts`）。即：**外壳是 jsBlock，候选区是 React，两者用 window kit 桥接。**

### 1.2 实施策略（已定，低风险 + 可版本管理）

三条铁律：

1. **表现层改造，逻辑零改动。** 定价/毛利/阶梯价校验、字段白名单、审计、状态流转都在服务端（`review/index.ts`）。本次只改 UI 呈现与前端交互，不碰 `saveFinal`/`approveDraft`/`ladder 校验` 等已验证逻辑。
2. **设计系统全局注入，两端共用。** 新建一套 **Creative Console 设计令牌 + 组件类**，由插件客户端 `load()` 注入一个全局 `<style id="ai-listing-creative-console">`；**MediaStudio（React）与 jsBlock 都只引用这套 class**，保证成套一致、单一真源。
3. **jsBlock 源码纳管。** 把 `um6v8ddxrz8` 当前 JS 抽出、落到仓库文件 `docs/jsblocks/preview-edit.js` 作为真源，之后所有 jsBlock 改动都改这个文件再贴回块里（或走加载器）。杜绝"只在 DB 里改、改完丢失"。

> **为什么不整页重写成 React**：定价/属性/保存这套逻辑已在 jsBlock 里跑通并审计，整页重写风险高、收益低。本次诉求是"还原 demo 视觉 + 少量交互（候选区、店铺条、标题精简）"，绝大部分是**呈现**，故"就地重排样式 + 全局 CSS + 源码纳管"是最优解。（未来若要把外壳也 React 化，另起 `__aiListingReviewKit` + `PreviewEditConsole`，本规划的分区/数据映射可直接复用。）

### 1.3 每个 phase 落到哪

| Phase | 区域 | 载体 |
|---|---|---|
| 0 | 设计系统地基 + jsBlock 源码纳管 | 插件 client `load()` + 新文件 |
| 1 | 媒体区视觉重构（图集滚动 + 视频入列 + 预览/对比） | **MediaStudio.tsx** |
| 2 | 候选区增强（横滑候选条 + 场景/时间角标 + 以此再改 + 批量逐张） | **MediaStudio.tsx** |
| 3 | 店铺条置顶 + 标题头精简 | jsBlock |
| 4 | SKU 定价区重排 | jsBlock |
| 5 | 商品属性 + 描述 | jsBlock |
| 6 | 右栏：生命周期 + 变更记录 | jsBlock |
| 7 | 左栏商品列表 + 整页壳/topbar | jsBlock |
| 8 | 全局收尾（响应式 / a11y / i18n / 自托管字体）+ 闭环验收 | 全局 |

---

## 二、设计系统（Creative Console，唯一真源 = mockup）

所有令牌与组件样式**以 `mockups/preview-edit-redesign.html` 的 `<style>` 为准**，实施时直接从 mockup 拷贝。核心令牌摘要（完整见附录 A）：

- **配色**：暖白画布 `--canvas #f4f1ea` / `--paper #fffdf8`；深墨 `--ink #15121e`；**语义色**——AI/激活=电光紫 `--violet #6a5cff`，价值/价格=琥珀 `--amber #ff9e2c`，成功/采纳/已发布=翡翠 `--jade #12b981`，警告/失败/成本=珊瑚 `--coral #ff6a4d`，来源/平台=蓝 `--blue #2b8cff`。
- **字体**：正文 `Instrument Sans + Noto Sans SC`；**数字/展示 `Fraunces`（衬线，价格/毛利/库存/计数/时间戳用它）**。生产**自托管**，系统衬线/无衬线降级（Phase 0/8）。
- **深墨只用在该重处**：workspace topbar、AI 改图区头、（可选）生命周期高亮；密集数据区（定价/属性/审计）保持浅色可读。
- **动效克制**：进场错峰淡入、坞/卡片 hover 微抬、生成按钮暖光、候选上浮——仅 4 处。

---

## 三、数据来源映射（可执行的关键——每个 UI 块对应哪个字段）

`aiListingReview` 资源（`src/server/review/index.ts`）：

| UI 区域 | 动作 | 关键字段 |
|---|---|---|
| 左栏商品列表 | `list`（status/platform/keyword 筛选，轻量+主图） | id, title, status, sourcePlatform, 主图 url |
| 店铺条 | `detail.product` | sourcePlatform, `shopInfo`/`tradeInfo`（店铺名/入驻/主营/回头率/服务分/发货率/好评率）, sourceUrl, sourceProductId, categoryOriginal, moq, statusOriginal, createdAt |
| 标题头 | `detail.product` | titleFinal/Processed/Original, status, `locked`(=LOCKED_STATUS), categoryOriginal, moq |
| 媒体区（候选区） | `aiListingMedia:candidates/generate/adopt/discard/scenes/imageModels/generateVideo/videoJobStatus` | gallery, candidates, adopted, videoCandidates/videoAdopted |
| SKU 定价 | `detail.skus` + `detail.product` | skus[{sku,specName,specValue,priceOriginal,ladderPrice,priceTarget,stock}], priceTarget, listPriceTarget, ladderTarget, stock, moq |
| 商品属性 | `detail.product` | attributesProcessed（AI 整理，高亮）, attributesOriginal（原始） |
| 商品描述 | `detail.product` | descriptionFinal/Processed/Original/HtmlOriginal（对应 tab：发布描述/参考建议/源站文本/源站详情） |
| 生命周期 | `detail.product.status` | processed→reviewing→reviewed→publishing→published(+publish_failed)；`lastPublishFailure`/`publishUrl` |
| 变更记录 | `changeLog` | `aiListingAuditLogs`：actorType(user/ai_employee/system), field, oldValue→newValue, reason, createdAt |
| 状态流转按钮 | `approveDraft`/`rollbackReview`/`reopenForEdit`/`saveFinal` | — |

**生命周期 6 步映射**（demo 右栏）：
`1 已抓取(captured)` → `2 已处理(processed)` → `3 编辑/审核中(reviewing)` → `4 已审核·可发布(reviewed)` → `5 发布中(publishing)` → `6 已发布(published)`。当前步 = product.status；`reviewed/publishing/published` = locked（字段锁定，需 `reopenForEdit` 退回）；`publish_failed` 归到第 3 步并挂珊瑚色失败原因（`lastPublishFailure`）。

**数据缺口（需标注/择机补）**：店铺四项指标（回头率/服务分/发货率/好评率）当前**源接口未提供**（`shopInfo` 可能为空）。Phase 3 必须**优雅降级**（显示"待抓取"），真正填充需抓取侧补 `shopInfo`（列为 Phase 3 可选子任务 / 独立跟进）。

---

## 四、Phase 拆分（可执行 · 可验收）

> 每个 phase：**目标 / 改哪里 / 做什么 / 数据 / 验收标准 / 验证方法**。验证统一两条腿：① Playwright 对**真实页面** DOM 断言 + 区域截图比对 mockup；② MediaStudio 相关另加 vitest 交互测试。截图脚本沿用 `docs/plans/scripts/verify-*.js` 风格。

### Phase 0 — 设计系统地基 + jsBlock 源码纳管

**目标**：一套令牌两端共用；jsBlock 进仓库可版本管理；本 phase 之后页面**外观零变化**（仅接线）。

**改哪里**
- `src/client-v2/components/shared/creative-console.css`（新）——从 mockup `<style>` 抽出令牌 `:root{…}` + 组件类（`.card/.shopbar/.studio-head/.th/.candstrip/.stepper/.logrow/…`）。
- `src/client-v2/components/shared/inject-styles.ts`（新）——导出 `injectCreativeConsole()`：幂等地 `document.head` 注入 `<style id="ai-listing-creative-console">`（内容 = 上面 css 字符串，构建时内联）。
- `src/client-v2/plugin.tsx` `load()`：调用 `injectCreativeConsole()`（try/catch，失败不阻断）。
- `docs/jsblocks/preview-edit.js`（新）——把 `um6v8ddxrz8` 当前 JS 完整导出到此，作为后续 jsBlock 改动的真源（顶部注释：块 ID、贴回步骤）。

**做什么**：只接线，不动结构。MediaStudio 与 jsBlock 后续都改用注入的 class。

**验收标准**
- 真实页面 `getComputedStyle(document.documentElement).getPropertyValue('--violet')` === `#6a5cff`（令牌已全局可用）。
- `document.getElementById('ai-listing-creative-console')` 存在且唯一（幂等）。
- 页面**视觉无回归**（本 phase 未改任何区域结构）。
- `docs/jsblocks/preview-edit.js` 已提交，内容与线上块一致。

**验证方法**：Playwright 断言上述三点；`yarn eslint --fix` + `tsc` 通过。

**验收记录（2026-07-08 · 已通过）**
- 落地与原计划的一处改良：mockup 的通用短类名（`.card/.chip/.field/.step/.stage/.search…`）**不注入全局**，
  统一作用域化在 `.aic-scope` 之下（仅 `:root` 令牌与 `@keyframes` 全局，且都是惰性的），避免与 antd/壳类名相撞。
  转换「只改选择器、不改声明值」，令牌/阴影/配色 1:1。新增 `AIC_SCOPE_CLASS='aic-scope'` 常量，后续 phase 给
  MediaStudio 根与 jsBlock 根挂此 class 即复用全部组件类。
- 接线位置修正：运行中的 `/admin` 加载的是插件 **v1 入口**（`src/client/plugin.tsx`，它 import 并调用 v2 的 setup），
  故注入在 v1、v2 两个 `plugin.tsx` 的 `load()` 都各自 try/catch 调用了 `injectCreativeConsole()`。
- jsBlock 真源：块实际存于 **v2 `flowModels` 表**（`uid=um6v8ddxrz8`，`use=JSBlockModel`，
  代码路径 `options.stepParams.jsSettings.runJs.code`，1343 行 antd React），已完整落到 `docs/jsblocks/preview-edit.js`（带纳管头注释）。
- 实况断言（`/admin/bska9eot90k` 预览编辑页，重建 dist 后硬刷新）：
  `--violet=#6a5cff`、`--jade=#12b981`、`--amber=#ff9e2c`；`#ai-listing-creative-console` **唯一存在**（len≈33k）；
  含 `.aic-scope .card` 规则；**DOM 中暂无任何 `.aic-scope` → 页面视觉零回归**（截图确认三栏原样渲染）。
  控制台无新增报错（既有的 antd Tooltip 弃用告警与本改动无关）。
- `yarn build @crossborder/plugin-ai-listing --client-v2-only` 成功（含 declaration 层）；改动文件 `eslint --fix` 干净。

---

### Phase 1 — 媒体区 MediaStudio 视觉重构（React）

**目标**：AI 改图区 1:1 还原 demo：深墨区头 + 工具栏 + **图集独立竖向滚动（视频入列）** + **预览/对比双模式舞台（点图即大图预览）**。

**改哪里**：`MediaStudio.tsx`、`CompareModal.tsx`(`CompareView`)、`scenes-meta.ts`、`types.ts`；`media-kit.ts` 挂载不变。

**做什么**
1. 卡片外壳 → `.studio-head`（深墨渐变 + 光晕）+ `.studio-tools`（🎨创意工坊 / 💬找美工改图 / ☀️白底图 / 🧽去logo水印 / 🔍高清 / **🎬图生视频** + 模型/数量）。
2. 左**图集列**：tabs（全部/主图/详情/视频）固定，缩略图区 `.gscroll`（`max-height≈452px; overflow-y:auto` + 底部渐隐 + `↓滚动查看全部`）；**视频并入列顶**（`.vslot`：▶ + 已下载 + 时长 + 采纳为主视频），删除原独立"视频"卡。
3. 右**舞台**：默认 `.stage.preview`——**点任意缩略图（主图/详情/视频）立刻大图预览**（单图，`.layer.full`）；`预览 / 对比` 双模式切换；`对比` = 原图↔候选拉帘（复用 `CompareView` 的 slider/side）。
4. 缩略图角标：主图金星 `.star`、多选 `.chk`、已采纳翡翠 `.adp`；选中 `.th.sel`（紫描边光晕）。

**数据**：`aiListingMedia:candidates`（gallery/candidates/adopted/video*）、`scenes`、`imageModels`。

**验收标准**
- 图集在**固定高度内独立竖向滚动**（右侧大图不随之滚），34 张（主图6+详情28）可完整浏览。
- 视频出现在图集列（不再单独成块）；工具栏有「🎬图生视频」。
- **点主图/详情/视频缩略图 → 舞台立刻显示该图大图预览**；`预览/对比` 可切；有候选时 `对比` 显示原图↔候选拉帘、可拖手柄。
- 区域截图与 mockup 媒体区一致。

**验证方法**
- vitest（新 `MediaStudio.interaction.test.tsx`）：渲染后 `click(主图缩略图)` → 舞台 `src`/背景 = 该图；`click(对比)` 且存在候选 → 渲染 `CompareView`；无候选时 `对比` 禁用/回退预览。
- Playwright：媒体卡截图比对 mockup；断言 `.gscroll` `scrollHeight > clientHeight`。

**验收记录（2026-07-08 · 已通过）**
- 改动文件(全部本地代码,不碰共享 DB)：`MediaStudio.tsx`(全量重构)、`CompareModal.tsx`(舞台配色→白分隔线/紫珊瑚候选标)、
  `media-kit.ts`(ConfigProvider 注入紫色主题 colorPrimary=#6a5cff)、`types.ts`(MediaPanelData +videos/videoCandidates/videoAdopted,MediaAsset +assetType)、
  `scenes-meta.ts`(复用)、locale zh/en(+12 键)、新增 `__tests__/MediaStudio.interaction.test.tsx`。
- **服务端一处只读增量**(必要的数据前提,非逻辑改动)：`server/media/actions.ts` 的 `candidates` action 增加 `videos`
  (全部未弃用视频,采纳优先)与 `mapAsset` 增加 `assetType`。原因:源站视频 `origin=null/finalSelected=false`,既不在
  `videoCandidates` 也不在 `videoAdopted`,不暴露则「视频入列」对真实商品无效。已验证 candidates 响应回带 videos(role=video,url 有)。
- **两处按架构现实重新落位**(与原计划的偏离,均已在代码注释标注)：
  1. `.aic-scope` 作用域 class 挂在 MediaStudio 根;媒体区全部改用 Creative Console 组件类(studio-tools/gcol/gscroll/vslot/stage/candstrip/ggrid/th…)。
  2. **studio-head(深墨区头)+ 卡壳不由 MediaStudio 渲染**,改归 Phase 3。因为「商品图片·AI 改图」这张卡的**壳+标题是外层 jsBlock 的 antd Card**;
     若 MediaStudio 再渲染同名深墨头 → 标题重复 + 卡中卡。且 **DB 与生产 app.xuanwu.space 共库、但生产跑旧客户端**,现在删 jsBlock 卡头会让生产端「无标题」。
     故深墨头 = 「jsBlock Card 头 → 深墨」的 restyle,须随新客户端一起上线,正确归 Phase 3。MediaStudio 本 phase 只渲染 工具栏 + 主体。
- 实况断言(`/admin/bska9eot90k`,重建 client-v2 dist 后硬刷新,真实商品 6 主图+28 详情+1 视频)：
  `.gscroll` 独立竖滚(scrollH 972 > clientH 452);34 张缩略图;工具栏 6 键(创意工坊[紫]/找美工改图/白底图/去logo水印/高清/🎬图生视频);
  `.vslot` 视频入列「视频 1 · 主图视频位 · 已下载 · ✓采纳为主视频」;点缩略图→舞台大图切换、点候选→进对比+CompareView、点视频→舞台放视频;
  页面仅 1 个「商品图片」标题(无重复)、无卡中卡。控制台无新增报错。
- vitest 4/4 通过;`eslint --fix` 干净;`yarn build @crossborder/plugin-ai-listing` 成功(server 增量已被 dev 自动热重载,API 实测回带 videos)。
- **遗留(归后续 phase,均需随客户端上线一并处理共享 jsBlock)**：① 删除 jsBlock 底部独立「视频 已下载」卡(现与 vslot 重复) → Phase 3;
  ② jsBlock Card 头 → 深墨 studio-head → Phase 3;③ 候选场景/时间角标 + NEW + 批量逐张 + 以此再改(接力选中候选) → Phase 2;
  ④ 缩略图未选态勾选框可再弱化(hover 显) → Phase 8 收尾。

---

### Phase 2 — 候选区增强（React）

**目标**：候选从"一条缩略"升级为**可横滑、带场景/时间角标、可接力再改、支持批量逐张**。

**改哪里**：`MediaStudio.tsx`（候选条 + 批量导航状态）、`scenes-meta.ts`（scene→icon/label）、`types.ts`（candidate `genParams`: scene/createdAt）。

**做什么**
1. `.candstrip` **横向滚动**；每张 `.ccard` = 缩略 + **场景角标**（🏝️场景/☀️白底/🧽去水印/🔍高清，取 `scenes-meta`）+ **相对时间**（刚刚/N分钟）+ 新出 `NEW` 翠标；选中 `.ccard.on`（紫框✓）→ 驱动舞台对比。
2. **以此再改**（`↻`）：基于**当前选中候选**继续迭代（把该候选作为下一次 generate 的源）——非回到原图。
3. **批量逐张**：多选主图/详情时，舞台头显示 `‹ 主图 · 第 N / M 张 ›`（琥珀 `.batch`），`‹ ›` 翻页逐张预览/对比；图集组标题同步「已选 M 张」。
4. 操作条：`✓采纳选中候选` / `↻以此再改` / `✕弃用`（未选候选时前两者禁用态）。

**数据**：`candidates[].genParams.{scene, compareMode, createdAt}`；多选来自现有 `picked` set。

**验收标准**
- 多候选横向滚动，每张有场景+时间角标，新出的有 NEW。
- 点某候选 → 进入原图↔候选对比；`以此再改` 以选中候选为源发起再改。
- 多选 M 张 → 舞台出现 `第 N/M 张` 且 `‹ ›` 可逐张切换。
- 区域截图与 mockup 候选区一致。

**验证方法**
- vitest：给 4 个候选（不同 scene/createdAt）→ 断言角标文案、`NEW`、`.candstrip` 可滚（`scrollWidth>clientWidth`）；选中→`CompareView` 出现；`picked=3` → 渲染 `第 1/3 张` 与翻页按钮。
- Playwright：候选区截图比对。

**验收记录（2026-07-08 · 已通过）**
- 改动文件(全部本地 React)：`MediaStudio.tsx`(候选角标 + 批量导航 batchIndex/pickedList/stepBatch + iterateFromCandidate)、
  `scenes-meta.ts`(新增 `relTime(iso)` 相对时间 + `isRecent(iso)` 近3分钟判定)、locale zh/en(+5 键:第/张/上一张/下一张/接力提示,并把「Iterate」文案对齐为「以此再改」)、
  新增 `__tests__/MediaStudio.candidates.test.tsx`。`types.ts` 的 candidate `genParams.scene`/`createdAt` Phase 1 已具备,无需再改。
- 候选角标:`.ccard` = 缩略 + `.cscene`(sceneMeta 图标+中文名)+ `.ctime`(relTime)+ `.newgen`(isRecent→NEW 翠标);`.candstrip` 本就 `overflow-x:auto` 横滑。
- 以此再改:`iterateFromCandidate` 以 `viewCandidate.id` 为源开原生抽屉续改(非回原图),并把候选场景带入。
- 批量逐张:`pickedList`=已选图片按图集顺序;≥2 张时舞台头显示琥珀 `.batch`「‹ {主图/详情} · 第 N/M 张 ›」,`‹ ›`(stepBatch)循环翻页并同步 currentId 预览;组标题「已选 M 张」。未选候选时 采纳/以此再改 禁用。
- 实况断言(`/admin/bska9eot90k`,重建 dist 后硬刷新):候选场景角标「🏞️ 场景图」+ 相对时间「17 小时」+ 旧候选无 NEW(正确);
  勾选 3 主图 → `.batch`「主图 · 第 1/3 张」,点 › →「第 2/3 张」、舞台随之翻页,组标题「已选 3」。截图与 mockup 候选区一致。
- vitest:interaction 4/4 + candidates 2/2 全过;`eslint --fix` 干净;`build --client-v2-only` 成功。
- 说明:live 当前商品仅 1 候选,「多候选横滑 + NEW」由 vitest(4 候选,近出者 newgen、场景/时间文案)覆盖;`.candstrip` 横滑为 CSS `overflow-x:auto`。

---

### Phase 3 — 店铺条置顶 + 标题头精简（jsBlock）

**目标**：店铺信息按电商惯例（对标 1688）**横铺在商品内容顶部**；标题区从"标题头+整张锁定横幅"精简为一行状态。

**改哪里**：`docs/jsblocks/preview-edit.js`（→ 贴回 `um6v8ddxrz8`）。

**做什么**
1. **店铺条 `.shopbar`**（编辑区最顶）：`Q`Logo + 店名 + `1688·供应商`蓝标 + 副行（入驻N年·主营·源商品#…·抓取于…）+ **四指标带**（回头率/服务分/准时发货/好评率，Fraunces 数字）+ `在源站查看店铺→`。
2. **删除**：右栏原「来源·供应商」卡（若之前放过）+ 标题头里那条超长供应商 chip → **去重**。
3. **标题头**：标题 input + `.statusline` 一行——`🔒已发布·字段锁定`(翠) + `品类`chip + `98/128 ✓合规` + 右侧灰字锁定提示；**删除**原整张绿色「该商品已发布…」横幅（"查看平台商品"右栏生命周期已有）。
4. **降级**：`shopInfo` 缺指标时四指标显示「待抓取」，不留空洞。

**数据**：`detail.product`（shopInfo/tradeInfo, sourcePlatform, sourceUrl, sourceProductId, categoryOriginal, moq, createdAt, status, locked, titleFinal）。

**验收标准**
- `.shopbar` 在编辑区顶部、含店名与四指标（或"待抓取"）；页面**无重复**供应商信息。
- 标题区仅一行状态、无绿色横幅；锁定态用带🔒的翠 chip 表达。
- 顶部区域截图与 mockup 一致。

**验证方法**：Playwright DOM——编辑区首个子块是 `.shopbar` 且含 supplier 文本；无 `.banner.ok`；标题头 chip ≤2；截图比对顶部区。

**可选子任务（数据）**：抓取侧补 `shopInfo`（回头率/服务分/发货率/好评率）——独立跟进，不阻塞本 phase。

**验收记录（2026-07-08 · 镜像内实现 + 本地验证,未回写线上块）**
- 改动:仅 `docs/jsblocks/preview-edit.js`(仓库纳管真源)。① `ShopBar` const(`.aic-scope`>`.shopbar`)插到 RightPanel 顶部、`{Header}` 之前;
  ② 移除整张「已发布/已审核·字段锁定」绿色 Alert 横幅(发布失败/操作反馈/发布前检查提示仍保留);③ Header 状态行去掉超长供应商 chip、加「🔒 字段已锁定」chip(带 tooltip)。
- **数据实测**:`aiListingProducts.shopInfo` 只有 `{companyId, supplierName}`,`tradeInfo` 全为 null(114/118 商品有 shopInfo)。
  故四指标(回头率/服务分/准时发货/好评率)**全部降级「待抓取」**(muted 占位);店铺条真实内容 = 供应商名 + 平台 + 主营品类 + 源商品# + 抓取日期 + 源站链接。
- **本地验证**:`esbuild --loader:.js=jsx` 转译整块通过(EXIT=0,无 JSX/语法错);店铺条真实数据静态 harness(注入 creative-console CSS)截图与 mockup `.shopbar` 一致。
  ⚠️ 未做真实页面整体渲染验证——jsBlock 需写入共享库才能在线上看到,按既定策略推迟。
- **上线策略(与用户确认)**:P3-P7 全在镜像 `preview-edit.js` 攒齐 + 本地验证;jsBlock 依赖客户端注入的 `.aic-scope` CSS,
  须**先部署 phase 0-2 新客户端到生产,再把本镜像回写共享库**(否则生产旧客户端下店铺条裸奔无样式)。
- 说明:计划里「标题头 .statusline 98/128 合规」等细节本次以「状态 chip 行 + 🔒锁定 chip」落地(更贴近现有 antd Header 结构)。

**验收记录续(2026-07-08 · Phase 3 收尾,收 Phase 1 遗留)**
- ④ **深墨 studio-head**(Phase 1 承诺挪到此):`AiCandidateZone` 的 antd Card 换成 `.aic-scope > .card > .studio-head`(深墨渐变 + 🎨紫宝石)+ 挂载点;
  MediaStudio 挂进下方只渲染工具栏 + 主体 → 整卡 = 深墨头 + 工具栏 + 图集/舞台/候选,单一标题不重复。
- ⑤ **删底部独立「视频 已下载」卡**(已并入 AI 改图区图集列 vslot,去重);⑥ **删图库下方冗余「供应商卡」**(已置顶为店铺条);
  图集/视频/供应商上移后中栏该行只余 SKU 定价、占满整行。
- 本地验证:esbuild 转译整块通过、无悬挂引用(SupplierCard/`{Gallery}` 均 0);店铺条 + 深墨头组合 harness 截图与 mockup 一致。
  遗留死 const(detailMedia/mainSrc/videoMedia/dlTag,无害)留 Phase 8 清。
- commit:`d1e09fefaf`(店铺条+去横幅+去 chip)、`13e7f2f6b9`(深墨头+去视频/供应商卡)。**均只在镜像,未回写共享库。**

---

### Phase 4 — SKU 定价区重排（jsBlock）

**目标**：还原 demo 定价区，逻辑不变。

**做什么**
- **源站采购阶梯** `.plad`：3 档可点，选中"成本档"珊瑚高亮（`.pt-tier.on`）。
- **规格切换** `.spec-chip`：color/spec 芯片，翠色计数角标 `.cnt2`=该规格已定价数。
- **SKU 定价行** `.skurow`：规格 + 成本 + **售价 input** + **毛利%**（Fraunces，实时随售价重算）+ **库存 input**。
- **发布阶梯价** `.ladbox`（紫色虚线卡）：3 档 `≥数量 → 售价¥ ≈$`。
- **汇总** `.summ`：发布展示价(珊瑚) / 划线价 / 总库存（Fraunces）。

**数据**：`detail.skus`、`product.ladderTarget/priceTarget/listPriceTarget/stock/moq`。

**验收标准**
- 视觉与 mockup 一致；点成本档切换高亮；**改售价 → 毛利实时更新**。
- **回归**：`saveFinal` 保存售价/库存/阶梯价仍成功、审计仍写（沿用现有服务端校验）。

**验证方法**：Playwright——成本档点选切换 `.on`；改 `售价` input → `毛利` 文本变化；截图比对。回归：跑既有 saveFinal 相关 verify（阶梯价校验路径不变）。

---

### Phase 5 — 商品属性 + 描述（jsBlock）

**做什么**
- **属性网格** `.attrgrid`（2 列 k/v）：AI 整理过的属性 `.attr.ai`（紫底 + `AI`角标），原始属性常态；`全部套用 AI` 入口。
- **描述** `.dtabs`：`发布描述(可编辑) / 参考建议 / 源站文本 / 源站详情页` 切换；`.desc` 文本区 + 右下 `✨AI优化描述`。

**数据**：`attributesProcessed`/`attributesOriginal`；`descriptionFinal/Processed/Original/HtmlOriginal`。

**验收标准**：属性网格按 mockup、AI 改过的高亮；描述 4 个 tab 切换对应数据源；截图一致。

**验证方法**：Playwright——`.attr.ai` 存在且带 AI 标；点 tab 切换文本源；截图比对。

---

### Phase 6 — 右栏：生命周期 + 变更记录（jsBlock）

**做什么**
- **生命周期** `.steps`：竖向 6 步 stepper，完成翠✓ / 当前紫 / 待办灰；当前步 = `product.status`（映射见 §三）；当前为可编辑态时挂 `退回编辑`；`publish_failed` 在第 3 步挂珊瑚失败原因（`lastPublishFailure`）；顶部 `查看平台上的商品→`（`publishUrl`）。
- **变更记录** `.log`：读 `aiListingReview:changeLog`；每行 `.logrow` = **操作者色标**（人工=琥珀 / AI=紫 / 系统=灰）+ 字段 + 时间戳(Fraunces) + `旧值(划线)→新值` + 备注；顶部筛选 `全部/人工/AI/系统`。

**数据**：`detail.product.status`、`lastPublishFailure`、`publishUrl`；`changeLog`（actorType/field/old→new/reason/createdAt）。

**验收标准**
- Stepper 当前步与真实 status 一致；锁定态展示正确。
- 审计时间线按操作者配色、`旧→新` 正确；筛选切换有效。
- 右栏截图与 mockup 一致。

**验证方法**：Playwright——切不同 status 商品，断言 stepper 当前步；`changeLog` 行渲染且色标正确；点「人工」筛选后仅剩 user 行；截图比对。

---

### Phase 7 — 左栏商品列表 + 整页壳 / topbar（jsBlock）

**做什么**
- **商品列表** `.plist`：卡片化（缩略 + 两行标题 + 状态徽章 + 平台）；搜索 `.search` + `全部状态/全部平台` 筛选；分页 `.lpage`；选中 `.pcard.on`（紫描边光晕）。点卡 → 载入该商品 detail 到中栏。
- **workspace topbar** `.wtop`：面包屑（AI 商品搬运·第 3 步）+ 标题「预览编辑」+ 右侧 `共 N 件待审` / `⌘K 搜索`；三栏 grid `266px / 1fr / 316px`。（NocoBase 应用外壳侧栏不动。）

**数据**：`aiListingReview:list`（筛选/分页）。

**验收标准**：列表卡按 mockup；点卡切换商品并载入中栏；搜索/筛选/分页可用；三栏布局与 mockup 一致。

**验证方法**：Playwright——列表卡样式 + 点击载入新商品（标题变化）；筛选/分页交互；整页截图比对。

---

### Phase 8 — 全局收尾 + 闭环验收

**做什么**
- **自托管字体**：Fraunces + Instrument Sans + Noto Sans SC 打包进插件静态资源（或 base64 内联到注入的 `<style>`），**移除对 Google Fonts 的外链依赖**；系统衬线/无衬线优雅降级。
- **响应式**：窄屏三栏优雅收拢（右栏可折叠 / 列表抽屉化）；页面 body 永不横向滚动，宽内容（属性/阶梯表）各自 `overflow-x:auto`。
- **a11y**：缩略图/候选/stepper/tabs 加 `role`/`aria-*`、键盘可达（Enter/Space 选中、方向键切候选）；对比手柄 `role="slider"`。
- **i18n**：新增文案全部走 `t()`，补齐 `zh-CN`/`en-US`（店铺条/生命周期/变更记录/候选/预览对比/批量 等键）。
- **深墨面质感**：topbar 与 studio-head 的颗粒/光晕按 mockup。

**验收标准**
- 无任何外链字体/图（生产自托管/降级）；lint + tsc 干净。
- a11y：键盘可完成 选图→预览→切对比→采纳；筛选/翻页可键盘操作。
- i18n：中英切换无漏译、无硬编码。
- **整页截图 1:1 比对 mockup**；真实 Key 跑通核心闭环：`改图→候选→对比→采纳`、`保存最终字段`、`标记审核/退回编辑`、生命周期与变更记录随之更新。

**验证方法**：Playwright 整页截图比对 + 交互脚本（`docs/plans/scripts/verify-preview-edit-redesign.js`）；`yarn eslint --fix`、`tsc`、相关 vitest 全绿。

---

## 五、验收与回归总则

- **视觉真源**：`mockups/preview-edit-redesign.html`。每个 phase 交付时，用 Playwright 截取对应区域与 mockup 并排比对（沙箱内字体/图会降级，以本地真浏览器为准）。
- **不碰服务端**：`review/index.ts`、`media/*`、发布链路零改动；回归面集中在前端呈现 + jsBlock。定价/阶梯价/字段保存回归跑现有 verify 脚本。
- **逐 phase 可上**：Phase 1–2（MediaStudio）收益最大且最可控，可独立先发；Phase 3–7（jsBlock）按区域独立上，互不阻塞；Phase 0 是前置，Phase 8 收口。

---

## 六、风险与决策

| 项 | 决策 |
|---|---|
| 外壳是否 React 化 | **本次不**。就地重排 jsBlock 样式 + 全局 CSS + 源码纳管；未来另起 `__aiListingReviewKit` 再迁。 |
| 设计系统落地方式 | 插件 `load()` **全局注入** `<style>`，MediaStudio 与 jsBlock **共用 class**，单一真源。 |
| jsBlock 版本管理 | 抽到 `docs/jsblocks/preview-edit.js`，改这里再贴回块。 |
| 店铺四指标数据 | 当前源接口未提供 → **优雅降级"待抓取"**；真实填充列为抓取侧独立跟进。 |
| 字体 | 生产**自托管** Fraunces/Instrument Sans/Noto SC，系统字体降级；禁外链。 |
| 服务端 | **零改动**（定价/校验/审计/状态流转均沿用）。 |

---

## 附录 A · 设计令牌（以 mockup `<style>` 为准，实施直接拷贝）

```css
:root{
  --canvas:#f4f1ea; --canvas-2:#eae4d9; --paper:#fffdf8; --paper-2:#faf7f0;
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
/* 字体：正文 Instrument Sans + Noto Sans SC；.num/展示 Fraunces */
```

## 附录 B · demo class → 实现区域 对照

| class（mockup） | 区域 | 载体 |
|---|---|---|
| `.rail` / `.wtop` / `.panes` | 应用轨 / 顶栏 / 三栏栅格 | jsBlock（轨为 NocoBase 壳，仅示意） |
| `.pcard` / `.search` / `.lpage` | 左栏商品列表 | jsBlock (P7) |
| `.shopbar .sb-*` | 店铺条 | jsBlock (P3) |
| `.ehead` / `.statusline` / `.titlein` | 标题头 | jsBlock (P3) |
| `.studio-head` / `.studio-tools` / `.gcol` `.gscroll` / `.vslot` / `.stage` / `.candstrip .ccard` / `.actbar` | 媒体·候选区 | **MediaStudio.tsx (P1/P2)** |
| `.plad .pt-tier` / `.spec-chip` / `.skurow` / `.ladbox` / `.summ` | SKU 定价 | jsBlock (P4) |
| `.attrgrid .attr` / `.dtabs` / `.desc` | 属性 / 描述 | jsBlock (P5) |
| `.steps .step` / `.log .logrow` `.actor` | 生命周期 / 变更记录 | jsBlock (P6) |

---

**下一步**：确认本规划（尤其 §1.2 策略、Phase 顺序）。确认后建议从 **Phase 0 → Phase 1/2（MediaStudio，收益最大最可控）** 开工，再按区域推进 jsBlock 各 phase。
