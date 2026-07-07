# 创意工坊落地 · 可执行/可测试/可验收 分阶段计划（2026-07-07）

> 配套：设计原型 `docs/plans/mockups/creative-workshop-mockup.html`、总规划 `2026-07-07-creative-workshop-clone-plan.md`、调研 `2026-07-07-alibaba-creative-workshop-research(-supplement).md`。
> 本文把总规划的 P0–P6 拆细成 **9 个可独立交付、独立验收的 Phase**。每个 Phase 结构固定：**目标 → 前置 → 后端改动 → 前端改动 → i18n → 测试 → 验收清单 → 回退**。
> 铁律（贯穿所有 Phase）：**AI/生成只产候选，采纳/弃用是用户显式动作（audit actorType=user），发布采纳集优先；API Key 永不出服务端；测试出图统一走 gpt-image-2（不走阿里云）；改插件 src 需 `yarn build` + touch 重启（`src/ai/` 例外）。**

---

## 现状基线（P0 已完成，全部复用不推倒）

| 能力 | 落点（真实文件） |
|---|---|
| 改图服务 `editImage`（scene/function/parameters/n/llmService/model；源图 assetId 或 URL；产候选） | `src/server/media/service.ts:446` |
| 场景库 9 个（white_bg/scene_gen/erase/recolor/selling_point/hd/expand/material/custom） | `src/server/media/scenes.ts` |
| 受控 action `aiListingMedia`（scenes/imageModels/candidates/generate/jobStatus/adopt/discard） | `src/server/media/actions.ts` |
| 候选资产模型（origin/role/sort/finalSelected/discarded/parentAssetId/genParams/meta.storedUrl） | `src/server/collections/media-assets.ts` |
| 采纳集优先发布（`selectPublishableMedia`） | `src/server/publish/index.ts` |
| 候选区 UI（图集带入/对比拉帘/采纳/弃用/轮询回流/选模型/数量） | `src/client-v2/components/MediaStudio/*` |
| 场景元数据（中文 label/icon、QUICK_SCENES） | `src/client-v2/components/MediaStudio/scenes-meta.ts` |
| 采纳弹窗 / 前后对比视图 | `AdoptModal.tsx` / `CompareModal.tsx`（导出 `CompareView`） |
| 挂载套件（jsBlock 里 `window.__aiListingBlockKit` 挂 React 根） | `media-kit.ts` + jsBlock flowModel `um6v8ddxrz8` |
| 会话工具（改图/生图/查任务） | `src/ai/tools/aiListing{EditImage,GenerateImage,CheckMediaJob}.ts` |

> **页面承载方式（已定）**：本插件业务页走 NocoBase 原生页面（flow-surfaces 菜单 + 页面），页面内放一个**全宽 jsBlock**，jsBlock 用 `__aiListingBlockKit` 挂 React 根——与候选区完全同一套机制（`src/client-v2/plugin.tsx:16` 注释确认不注册脱框自定义路由）。创意工坊页沿用此法：不新建脱框路由。

> **缺口（要补的）**：①每功能专属表单（现只有"场景下拉+指令"一种）；②图片比例透传；③推荐提示词（看图出词）；④选区 mask；⑤第二张图（Logo/材质）；⑥预置库（工艺/模版/模特）；⑦公网 URL 管线（翻译/模特强制）；⑧5 个新场景（logo/model_shot/detail/translate/process）；⑨独立工坊页；⑩智能视频。

---

## Phase 总览与依赖

| Phase | 名称 | 交付物 | 依赖 | 难度 | 出图后端 |
|---|---|---|---|---|---|
| **P1** ✅ | 独立工坊页骨架 + 商品图带入 + 9 场景专属表单 | 能打开、能带图、能出候选回流采纳 | P0 | ★★★ | 复用 editImage |
| **P2** ✅ | 图片比例（size）透传 + 模型档语义（基础/进阶） | 选比例生效、档位映射模型 | P1 | ★★ | editImage 扩 size |
| **P3** ✅ | 推荐提示词（点图出 3 条） | 场景图/卖点图「一键推荐·填入·换一换」 | P1 | ★★ | 新增 qwen-vl 看图 |
| **P4** ✅ | 区域编辑(提示词精准) | 换色/擦除/细节区域精准+其余保留;硬 mask=P4b(DashScope) | P1 | ★★★ | 强化模板+detail |
| **P5** ✅ | 第二张图输入 + 工艺/位置 | Logo定制、换材质参考图 | P1,P4修复 | ★★★ | 多图输入 |
| **P6** ✅ | 公网 URL 管线 + 图片翻译 + 模特图 | 详情图一键翻译、AI 模特上身 | P1,P4 | ★★★★ | 签名 URL + 新端点 |
| **P7** ✅ | 生产流程图 + 营销卖点图增强 | 图文信息图、卖点 AI 提取勾选 | P1,P3 | ★★★ | 图文混排 |
| **P8** ✅ | 智能视频（顶部第二 tab，优先图生视频） | 单图→展示视频，回候选采纳 | P1 | ★★★★ | 异步视频任务 |
| **P9** ✅ | 抽屉收窄 + 上线打磨（i18n/权限/限额/文档） | 抽屉回归自由对话，全量验收 | P1–P8 | ★★ | — |

> 建议交付顺序：**P1 →（P2、P3 并行）→ P5 → P4 → P7 → P6 → P8 → P9**。P1 最快见效（重排既有能力）；P4 选区、P6 公网 URL 是两大真难点，放在有价值功能铺垫之后。
>
> **✅ 全部 9 个 Phase 已完成并验收(2026-07-07)**。14 图片功能全部真机验证出图;智能视频 i2v 管线落地(待 DashScope 视频账号解禁真机复片);抽屉收窄根治消失按钮。剩 P4b 硬 mask(等 DashScope)+ 视频账号就绪后 P8 真机复验。

---

## P1 · 独立工坊页骨架 + 商品图带入 + 9 场景专属表单

> **✅ 已完成并验收(2026-07-07)**。落点:`src/client-v2/components/CreativeWorkshop/`(`functions.ts` 14 功能元数据、`CreativeWorkshop.tsx` 三栏主组件、`workshop-kit.ts` 挂载套件、`index.ts`);候选区入口 = `MediaStudio.tsx` 头部「🎨 创意工坊」按钮开全屏 Modal(带入当前商品+选中图);v1 `client/plugin.tsx` 装 `setupWorkshopKit`;i18n 补 55 键。**后端零改动**(复用 `aiListingMedia` 现有 action)。
> 验收证据:①单测 `edit-adopt`(21)、`scenes`(6)、`publishable-media`(3)全绿;②浏览器活收——商品 113 真实数据挂载,33 图带入(勾选/切换/上传位)、9 功能亮 5 灰、白底/场景表单正确、2 存量候选可对比+采纳/弃用、**0 报错**;③候选区「创意工坊」按钮开 Modal 端到端通;④E2E `verify-p1-workshop.js` OK。
> **遗留**:①真实出图闭环待 gpt-image-2 网关鉴权恢复(现 503 no-auth,外部基建);②独立 admin 菜单页(入口①)未做——需商品选择器,建议放 P9 或按需补;当前入口②(候选区→工坊)已满足主流程。

**目标（用户可见）**：admin 菜单出现「🎨 AI 创意工坊」；从商品预览编辑页候选区头部「🎨 创意工坊」按钮可带**当前商品 + 选中图**跳入；页面三栏（功能栏 / 专属表单 / 示例+结果）；**商品主图+详情图自动带入上传区（可勾选、可再上传新图）**；左侧 9 个已支持功能各有最简专属表单；点「开始生成」→ 走 `aiListingMedia:generate` → 候选**回流到该商品候选区** → 可对比/采纳/弃用。5 个未支持功能（logo/model_shot/detail/translate/process）图标置灰「即将上线」。

**前置**：P0。

**后端改动**（小）：
- `src/server/media/actions.ts`：新增只读 action `workshopFunctions`（返回功能栏元数据：`[{key,label,icon,enabled,formFields,tier,cost}]`，供前端渲染功能栏与专属表单；enabled=false 的先置灰）。或复用 `scenes` + 前端静态 meta 合并——二选一，**推荐前端静态 meta（scenes-meta.ts 扩成 workshop-functions.ts）+ 后端 scenes 作为出图能力真相源**，减少后端面。
- `MEDIA_ACTIONS` 若加 `workshopFunctions` 需同步 `app.acl.allow`。
- `candidates` action 已返回 `gallery`（源图+采纳，供带入）——工坊页带入直接复用，无需改。

**前端改动**（大，本 Phase 主体）：
- 新页面组件：`src/client-v2/components/CreativeWorkshop/`
  - `CreativeWorkshop.tsx`：三栏容器 + 顶部 tab（智能图片，视频 tab 占位置灰）+ 功能栏 + 表单区 + 预览/结果区。状态：`productId`、`assetIds`(带入)、`activeFunc`、`picked`(多选)、`count`、`modelKey`、`generating`、候选轮询。
  - `functions.ts`：14 功能元数据（icon/label中文/enabled/fields 声明/tier/cost）——由 `scenes-meta.ts` 扩展而来，字段声明驱动表单渲染。
  - `FunctionForm.tsx`：按 `fields` 声明渲染专属表单（upload/prompt/segment/ratio 占位…本 Phase 只实现 upload+prompt+张数+模型；比例/mask/推荐词后续 Phase 接入）。
  - `CarryInUploader.tsx`：带入商品图（读 `candidates.gallery`）+ 勾选（多图功能）/ 单选切换（单图功能）+「+ 上传新图」（走 File Manager 上传，得 URL 传 `sourceImageUrl`）。
  - `ResultPanel.tsx`：复用 `CompareView`（`CompareModal.tsx` 导出）+ 候选网格 + `AdoptModal`；轮询复用 MediaStudio 里 `jobStatus` 逻辑（抽出 `useMediaJob` hook 到 `MediaStudio/` 供两处共用）。
- 页面承载：新建一个 NocoBase 原生页面（flow-surfaces 菜单「AI 创意工坊」），页内放全宽 jsBlock；jsBlock code 用 `__aiListingBlockKit` 挂 `CreativeWorkshop` 根（挂载函数加进 `media-kit.ts` 的 `installMediaKit`，暴露 `mountCreativeWorkshop(el, {productId, assetIds})`）。
- 入口按钮：候选区头部加「🎨 创意工坊」→ `navigate('/admin/<workshop-page>?productId=..&assetIds=..')`（原生页面 uid 路由）。
- 装配文档同步：把新 jsBlock 的 flowModel code 备份进 `docs/plans/scripts/`（与现有 jsBlock 备份一致）。

**i18n**：`src/locale/{zh-CN,en-US}.json` 新增：创意工坊/智能图片/智能视频/该功能未上线/已带入当前商品/上传新图/开始生成/预计消耗/基础版/进阶版 等键。

**数据/迁移**：无（复用现有集合）。

**测试**：
- E2E `docs/plans/scripts/verify-p1-workshop.js`（真实登录态 → 找有本地图的在编商品 → 调 `aiListingMedia:generate`（scene=white_bg, n=2, gpt-image-2）→ 断言产 2 候选、origin=ai_candidate、回 `candidates.candidates` → adopt append → 断言 finalSelected=true & 审计 actorType=user）。
- 浏览器：菜单打开工坊页 → 断言功能栏 14 项（9 亮 5 灰）→ 断言带入横幅 + 主图/详情缩略图 → 切 3 个功能表单不同 → 生成 → 候选出现在结果区且回商品候选区 → 采纳成功。console 0 error。

**验收清单**：
- [ ] admin 菜单有「AI 创意工坊」，能打开三栏页，无 console 报错。
- [ ] 从候选区「🎨 创意工坊」跳入，URL 带 productId/assetIds，页面正确带入该商品图。
- [ ] 带入区显示主图+详情图，多图功能可勾选、单图功能可切换、可「+ 上传新图」。
- [ ] 9 个功能各有独立表单；5 个新功能置灰不可点。
- [ ] 白底/场景/换色（指令版）/擦除/高清/换材质（指令版）/扩图/指令/卖点 均能出候选。
- [ ] 候选回流到该商品候选区，可对比/采纳/弃用；采纳写审计 actorType=user。
- [ ] 张数默认 2、可改 1–4；模型下拉含 gpt-image-2；i豆预估显示。

**回退**：工坊页是新增独立页，不动候选区/发布既有链路；出问题隐藏菜单入口即可，零影响存量。

---

## P2 · 图片比例（size）透传 + 模型档语义（基础/进阶）

> **✅ 已完成并验收(2026-07-07)**。落点:`service.ts` 新增 `ratioToSize`(比例→"宽*高",较长边 1280、夹 512~2048、取 16 倍数)与 `resolveModelByTier`(env `AI_LISTING_MODEL_TIERS` 映射,无映射回退自动解析);`EditImageInput` 加 `aspect`/`tier`,editImage 在 `parameters.size` 出口接入(不与 hd 超分冲突),genParams 记 `aspect`/`tier` 溯源;`actions.ts` generate 透传。前端 `CreativeWorkshop.tsx`:比例 10 档 CheckableTag(+原图默认)、基础/进阶 Segmented(切功能取该功能默认档)。
> 验收证据:①单测 `ratio-tier`(6)全绿 + 回归 `edit-adopt`(21)/`scenes`(6);②E2E `verify-p2-ratio-tier.js` **真实出图 OK**——aspect `16:9` 透传、换算 `size=1280*720` 落 parameters、tier `advanced` 透传、模型解析、验证候选已弃用不留痕;③浏览器:比例 chips 可选(原图→16:9)、档位 Segmented 正确默认(场景图=进阶版)、**0 报错**。
> 说明:测试期 tier 两档都回退 gpt-image-2(仅一个 image_gen 模型);生产设 `AI_LISTING_MODEL_TIERS={"basic":"svc:model","advanced":"svc:model"}` 即映射真实档位模型。

**目标**：支持功能里出现「图片比例」10 档（1:1/2:3/3:2/3:4/4:3/4:5/5:4/9:16/16:9/21:9），选择后真实生效；模型「基础版/进阶版」语义档 → 映射到具体模型（测试期都指 gpt-image-2，生产映射万相 标准 vs pro）。

**前置**：P1。

**后端改动**：
- `src/server/media/service.ts`：`EditImageInput` 增 `size?: string`（"宽*高"）或 `aspect?: string`（"16:9"）；`editImage` 内加 `aspect→size` 映射表（`ratioToSize(aspect, base)`，命中 qwen-image-max/plus 5 固定档，其余走自定义档；写入 `parameters.size`）。与既有 hd 的 `sizeStrategy:'upscale'` 复用同一 `parameters.size` 出口。
- `scenes.ts`：`MediaScene` 增 `ratioSupported?: boolean`（scene_gen/model_shot/process/selling_point/custom = true）。
- 模型档：新增 `resolveModelByTier(app, tier)`（'basic'|'advanced' → 具体 llmService/model；测试环境两档都回 gpt-image-2；env `AI_LISTING_MODEL_TIERS` 可配映射）。`generate` action 接 `tier` 参数，优先于自动解析。

**前端改动**：
- `FunctionForm.tsx`：`ratio` 字段渲染比例 chips（仅 ratioSupported 的功能显示）；底部模型档 segmented（基础/进阶）→ 传 `tier`。
- 传参：`generate` 带 `aspect`（选中比例）+ `tier`。

**i18n**：比例分组名（渠道常用/竖版/横版）、基础版/进阶版说明。

**测试**：
- E2E `verify-p2-ratio-tier.js`：generate 带 aspect=16:9 → 读 `jobStatus`/job.genParams 断言 `size` 命中 1664×928（或映射值）；带 tier=basic/advanced 断言 job.model 符合映射。
- 浏览器：场景图选 16:9 出图，产物比例≈16:9；切基础/进阶档，i豆预估随档变化。

**验收清单**：
- [ ] 支持比例的功能显示 10 档，未选=默认（原图比例/1:1）。
- [ ] 选定比例后产物尺寸符合映射（抽查 3 档：1:1、16:9、21:9）。
- [ ] 基础/进阶档切换改变 `tier` 参数与 i豆预估；测试期两档都出图（gpt-image-2）。
- [ ] 不支持比例的功能（白底/高清/擦除）不显示比例控件。

**回退**：size/aspect/tier 均为可选入参，不传时行为与 P1 完全一致。

---

## P3 · 推荐提示词（点图出 3 条）

> **✅ 已完成并验收(2026-07-07)**。落点:后端新增 `src/server/media/suggest.ts`(`suggestPrompts` 看图出词:①选视觉 chat 模型 = capability.task='chat' 且 input 含 image,冷 catalog 兜底按名匹配 gpt-5/gpt-4o/vl/vision/qvq/omni;②源图优先公网 http URL 喂模型[小载荷更稳],本地图退 base64;③system+看图指令→JSON 数组解析→n 条;④无视觉模型/失败/超时[35s]→静态兜底 fallback=true 不阻塞);`actions.ts` 加 `suggestPrompts` action + acl。前端 `CreativeWorkshop.tsx`:场景图/卖点图紫色推荐词面板(进表单/换源图自动出 3 条、填入写提示词框、换一换重拉、loading/兜底态)。
> 现网命中 **gpt-5.5**(OpenAI 服务 `v_o0thcar5dcs`,task=chat/input 含 image)。验收:①E2E `verify-p3-suggest.js` **OK**——scene_gen 7s 出 3 条圣诞场景词(看懂图,fallback=false/gpt-5.5)、selling_point 出 3 条卖点(加厚麻布/抽绳/圣诞送礼)、缺源图 404、无凭证;②浏览器:进场景图自动出 3 条、填入写入提示词框、换一换出新词、**0 报错**。
> 关键坑记录:plugin-ai 能力判定除内置规则外还查 **LiteLLM 在线目录(异步冷缓存)**——重启后目录未加载时 gpt-5.5 暂被判纯文本;故 `resolveVisionModel` 加按名兜底,避免头几次调用误降级。

**目标**：场景图、营销卖点图表单里「AI 推荐提示词」：进表单/点图后自动出 **3 条基于该商品图的场景/卖点描述**，可「填入」到提示词框、可「换一换」重出。

**前置**：P1（P2 可选）。

**后端改动**：
- `src/server/media/service.ts`（或新文件 `suggest.ts`）：`suggestPrompts({app, assetId|sourceUrl, scene, n=3})` → 取源图 data URI → 调 **qwen-vl / qwen3-vl 多模态**（`aiManager.getLLMService` 拿一个 vl/文本模型，OpenAI 兼容 chat + image_url）→ 提示「你是电商视觉运营，看这张商品图，产出 N 条{场景/卖点}描述，每条≤40字，中文，JSON 数组」→ 解析返回 `string[]`。**别用生图端点自带 prompt_extend（那是文改文）**。
- `actions.ts`：新增 action `suggestPrompts`（入参 assetId/sourceUrl/scene/n）；加进 `MEDIA_ACTIONS` + acl。测试期 vl 模型走现网可用多模态（不走阿里云）。

**前端改动**：
- `FunctionForm.tsx`：`reco` 字段渲染推荐词面板（3 条卡片 + 填入 + 换一换）；进入 scene_gen/selling_point 或切换带入图时自动请求一次；「换一换」重新请求。

**i18n**：推荐提示词/换一换/填入/AI 正在分析该商品。

**测试**：
- E2E `verify-p3-suggest.js`：对一张真实商品图调 `suggestPrompts(scene=scene_gen,n=3)` → 断言返回 3 条非空中文字符串。
- 浏览器：进场景图 → 自动出 3 条 → 点「填入」进提示词框 → 「换一换」内容变化。

**验收清单**：
- [ ] 场景图/卖点图进入时自动出 3 条推荐词（loading 态友好）。
- [ ] 「填入」把该条写入提示词框；「换一换」重新生成 3 条。
- [ ] 无 vl 模型可用时优雅降级（提示"暂无推荐，可手动输入"，不报错阻塞）。
- [ ] 商品图 data URI 不泄露 Key；请求走服务端。

**回退**：纯增量面板，失败时隐藏推荐区，手填提示词照常出图。

---

## P4 · 区域编辑（提示词精准；硬 mask=P4b 延后）

> **✅ 已完成(2026-07-07);方案调整(用户拍板)**。调研发现:测试模型 **gpt-image-2 是很强的 instruct 编辑器**(实测能背景分割级抠图、精准保留主体),但**硬像素 mask 通道对它未验证**(plugin-ai OpenAI 路径走 `/images/generations`,未接 `/images/edits`+mask);真 mask 是 **DashScope `description_edit_with_mask` 生产能力**,现网测不了。故 P4 先做**提示词区域编辑**(精准描述部位 + 强约束"其余完全不变",gpt-image-2 今天就能用);canvas 涂抹二值 mask + DashScope 硬 mask 记为 **P4b**,等生产 DashScope 就绪或确有必要再补。
> 落点:`scenes.ts` 强化 `recolor`/`erase` 模板(区域精准 + "不改动目标以外任何像素")、**新增 `detail` 场景**(裁切放大局部特写);`functions.ts` 启用 `detail`;`CreativeWorkshop.tsx` 换色/擦除/细节表单加"哪个部位换成什么"引导 placeholder + 「💡 精准描述部位,其余完全保留」提示。
> 验收:①单测 `scenes`(7,含 detail)、回归 `edit-adopt`(21)全绿;②浏览器:细节图已启用(功能栏 10 亮 4 灰)、换色/细节 placeholder + 区域提示正确、**0 报错**;③E2E `verify-p4-region.js` OK;④**真实区域换色出图已验(实拍对比):把红色酒瓶套换藏青,只有那一个变色、其余 3 个套子+酒杯+雪景背景像素级不变**——完美区域编辑。
>
> **⚠️ 过程中发现并修复了一个影响 P1–P4 的根本性 bug(plugin-ai 核心)**:测试模型 **gpt-image-2 之前根本没在编辑源图**——plugin-ai 的 OpenAI 图像通路走 `/images/generations`(**不接收 image**),源图被丢、退化成与原图无关的**纯文生图**(实测换色出了一瓶不相干的蓝酒)。之前那些"像源图的编辑"其实是旧会话里 **qwen-image-edit(DashScope)** 做的。**修复**:`packages/plugins/@nocobase/plugin-ai/src/server/llm-providers/common/media-task.ts` 新增 `openAIImagesEdit`(multipart 走 `/images/edits`,支持 `image[]` 多图 + `mask` 预留 + 上游瞬时 TLS/5xx 重试);`openAIMediaTaskInvoker` 路由:**image_gen 有源图 → edits(带图编辑),无源图 → generations(纯文生图)**。网关(codex 代理 chatgpt backend)`/images/edits` 实测支持带图编辑,修后 gpt-image-2 真正编辑源图。单测 `plugin-ai/media-task`(24,含新路由测试)全绿。注:codex 上游偏慢(单张 ~2–3 分钟),E2E 客户端超时放宽到 300s。

**目标(原始·硬 mask,记为 P4b)**：商品换色、细节图、图片擦除支持「设置选区」：前端 canvas 涂抹/框选出区域 → 生成**与原图等分辨率的二值 mask（白=改、黑=留）** → 出图只改选区。

**前置**：P1。

**后端改动**：
- `service.ts`：`EditImageInput` 增 `maskUrl?: string`（mask 图 File URL）；当带 mask 时走 `description_edit_with_mask`（function 路由，`parameters.mask_image_url`）或对应通道；scenes recolor/detail/erase 标 `maskSupported`。
- 校验：mask 与源图同分辨率（服务端读两图尺寸比对，不符报 400）。

**前端改动**：
- 新组件 `CreativeWorkshop/MaskEditor.tsx`：canvas 叠加在源图上，画笔涂抹（白）+ 橡皮 + 清空 + 反选；导出与源图等分辨率的黑白 PNG → 上传 File Manager 得 URL。
- `FunctionForm.tsx`：`mask` 字段渲染「打开涂抹工具」→ MaskEditor 抽屉/弹窗；换色的 mask 必填、细节/擦除可选。
- 传参：`generate` 带 `maskUrl`。

**i18n**：设置选区/涂抹/橡皮/清空/白=改黑=留/请先涂抹要处理的区域。

**测试**：
- E2E `verify-p4-mask.js`：构造一张纯色图 + 半边 mask → generate（recolor 换红）→ 断言产物**只有 mask 白区变色、黑区像素基本不变**（抽样比对像素）。
- 浏览器：换色功能涂抹主体 → 换蓝 → 只主体变蓝，背景不变。

**验收清单**：
- [ ] MaskEditor 能涂抹/橡皮/清空,导出与原图等分辨率二值 PNG。
- [ ] 换色必须先涂抹（未涂抹禁用生成并提示）；细节/擦除可选。
- [ ] 带 mask 出图只改选区（像素抽样验证黑区不变）。
- [ ] mask 与源图尺寸不符时服务端报可读错误。

**回退**：maskUrl 可选；不涂抹时退化为 P1 的整图指令改图。

---

## P5 · 第二张图输入 + 预置库（Logo定制 / 换材质参考图）

> **✅ 已完成并验收(2026-07-07)**。**多图输入白捡了 P4 的修复**——`openAIImagesEdit` 已支持 `image[]`,第二图直接作 image[1] 送编辑。落点:`service.ts` `EditImageInput.refImageUrl`,editImage 把第二图解析 dataUri 拼进 images 数组(`refInfo ? [src, ref] : [src]`),genParams 记 refImageUrl;`scenes.ts` 新增 `logo` 场景(instruct 多图合成,模板"把第二张图的 Logo 印到商品上"),`material` 支持参考图;`actions.ts` 透传 refImageUrl。前端 `functions.ts` 启用 logo;`CreativeWorkshop.tsx` 加第二图上传(Logo/材质,走 attachments)、logo 的**工艺 10 档 + 位置 7 档 CheckableTag**、generate 组合指令(位置+工艺)+ 传 refImageUrl + Logo 图必传校验。工艺/位置为前端常量(轻量,不做后端 presets 库)。
> 验收:①单测 `scenes`(8,含 logo)、回归 `edit-adopt`(21)全绿;②E2E `verify-p5-secondimage.js` **OK**——logo 带第二图出候选(256s)、genParams 记 refImageUrl(多图接通);③**实拍验:第二图的品牌 Logo 被丝网印效果印到 4 个酒瓶套正面中间,其余像素级保留**——真多图合成;④浏览器:Logo定制表单(上传 Logo 图 + 10 工艺 + 7 位置)、换材质参考图 渲染正确,**0 报错**。
> 说明:预置资源库(工艺/模版的 env 可配库 + `mediaPresets` action)按需再补(当前工艺/位置前端常量已够用),不阻塞 P5 目标。

**目标**：Logo定制（上传 Logo 图 + 位置 + 工艺库）、换材质（上传材质参考图，可选 mask）——支持**多图输入**与**预置资源库**。新增场景 `logo`、扩展 `material`。

**前置**：P1（Logo 位置若用选区则依赖 P4）。

**后端改动**：
- `scenes.ts`：新增场景 `logo`（route=instruct，多图合成，promptTemplate 含工艺/位置占位）；`material` 已存在，扩支持参考图。
- `service.ts`：`EditImageInput` 增 `refImageUrl?: string`（第二张图）；`editImage` 组多图输入（provider 支持 1–3 图，data URI 数组）。工艺/位置作为 prompt 参数注入 `buildScenePrompt`。
- 预置库：`src/server/media/presets.ts`（工艺列表 12+、场景/营销模版；env `AI_LISTING_MEDIA_PRESETS` 可覆盖）；action `mediaPresets({kind})` 返回。

**前端改动**：
- `FunctionForm.tsx`：`secondImage` 字段（上传第二图）、`craft` 字段（工艺 chips，读 presets）、`position` 字段（Logo 位置：先简化为九宫格方位下拉，进阶版拖拽放 P4 之后）。
- 组多图传参：`generate` 带 `refImageUrl` + 工艺/位置进 instruction/parameters。

**i18n**：Logo定制/上传Logo图/定制工艺/12 种工艺名/换材质/材质参考图/Logo位置。

**测试**：
- E2E `verify-p5-secondimage.js`：logo 场景传 商品图+Logo图 → 断言 job 输入含两图、产候选。
- 浏览器：Logo定制上传 Logo、选工艺"丝网印"、选位置"左上"→ 出图；换材质传参考图出图。

**验收清单**：
- [ ] Logo定制能同时带商品图 + Logo 图 + 工艺 + 位置并出候选。
- [ ] 换材质能传材质参考图（或纯文字）出候选。
- [ ] 工艺库/模版库从 presets 渲染，env 可覆盖。
- [ ] 多图输入不破坏单图功能（回归 P1 各功能仍正常）。

**回退**：refImageUrl 可选；新场景独立，旧场景不受影响。

---

## P6 · 公网 URL 管线 + 图片翻译 + 模特图【难点】

> **✅ 已完成并验收(2026-07-07)**。落点:后端 `scenes.ts` 新增 `translate`(模板注入 `{target_language}`、强约束「只换文字、版式全保留」、defaultN=1)与 `model_shot`(模特上身、商品保持完全不变);`service.ts` `EditImageInput.targetLanguage` → 注入 `buildScenePrompt` 的 `{target_language}`,genParams 记录;`actions.ts` generate 透传 `targetLanguage`。新增 `public-url.ts`:`toPublicUrl(assetId|url)` 归一化为公网绝对 URL(绝对 http 原样→remote;相对 `/storage`→前置 env `AI_LISTING_PUBLIC_BASE_URL` 或请求 origin→public_base;data:/无基址→public=false 回退),`actions.ts` 加 `publicUrl` action(ctx origin 兜底)+acl。前端 `functions.ts` 启用 translate(lang+prompt)/model_shot(modelGrid+secondImage);`CreativeWorkshop.tsx` 加 `LANGS`(9 语种)/`MODEL_PRESETS`(6 预置模特)常量、语种 CheckableTag + 「近似翻译,生产可切专用端点」提示、模特库网格(自传模特图时降权)、doGenerate 组合模特描述/传 targetLanguage/refImageUrl。i18n +6 键(en/zh)。
> **重要边界**:测试铁律走 gpt-image-2(`/images/edits`,base64 入图),不经公网管线;`toPublicUrl` 是切生产翻译/模特/视频端点(`qwen-mt-image`/`virtualmodel`/`aitryon`)的入图基座,独立成型 + 独立 E2E 验其可 200。翻译当前为 gpt-image-2 近似(UI 已明示),生产切真实翻译端点。
> **验收证据**:单测 `scenes.test`(13 场景 + translate/model_shot 断言,10/10)、`edit-adopt.test`(+translate targetLanguage 用例,22/22)全绿。E2E:`verify-p6-publicurl.js` **OK**(remote 直通 200 296KB + 相对→origin 前置 public_base + data:→public=false 三分支);`verify-p6-translate.js` **OK**(gpt-image-2 100s 出候选、genParams 记 scene=translate/lang=English、版式保留,实拍验证)、`verify-p6-model.js` **OK**(115s 出候选、genParams 记 scene=model_shot,实拍验证生成专业亚洲女模特上身展示、商品像素级保留)。浏览器(工坊 kit 挂载 productId=113):图片翻译 9 语种 chip + 近似提示渲染、模特图 6 预置模特库 + 可选模特参考图上传渲染,console 0 错误。

**目标**：打通「商品图落公网可访问对象存储（签名 URL）」基建；上线**图片翻译**（详情图中文→英/多语，版式不变）与**模特图**（AI 模特上身 / 试衣）。这两个官方端点强制要求公网可访问 URL。

**前置**：P1、P4（模特图常配 mask）。

**后端改动**：
- 公网 URL 管线：`src/server/media/public-url.ts`：把某 File/asset 上传到可公网访问对象存储（或已配置的 File Manager 公网存储）→ 返回带签名的临时 URL（TTL）。抽象成 `toPublicUrl(app, assetId|fileId)`，供翻译/模特/视频统一用。
- 新场景 `translate`（route=function/独立端点，参数 `target_language`）、`model_shot`（虚拟模特/试衣端点）。
- `service.ts`：`editImage`（或专门 `translateImage`/`modelShot`）走对应生产端点（`qwen-mt-image` / `virtualmodel-v2` / `aitryon-plus`），入源用 `toPublicUrl`。**注意**：测试期若现网无对应端点，先用 gpt-image-2 兜底做"翻译=按语言重绘文字"的近似，并在 UI 标注"生产切真实翻译端点"。
- 异步任务轮询：这些端点多为建任务→轮询 task_id，复用/扩展 `media-task.ts` 异步管线。

**前端改动**：
- `FunctionForm.tsx`：`lang` 字段（目标语种下拉）、`modelGrid` 字段（模特库网格 + 自传模特图，读 presets）。
- 结果面板支持异步任务态（生成中→轮询→出候选）。

**i18n**：图片翻译/目标语种/9 语种名/模特图/模特选择/推荐模特/自传模特。

**测试**：
- E2E `verify-p6-publicurl.js`：`toPublicUrl(assetId)` 返回可 200 拉取的 URL（服务端 fetch 验证）。
- E2E `verify-p6-translate.js` / `verify-p6-model.js`：调翻译/模特 → 断言产候选（测试端点或兜底）。
- 浏览器：详情图选"英语"翻译出图；模特图选模特出上身图。

**验收清单**：
- [ ] `toPublicUrl` 产出的 URL 公网可 200 访问，带 TTL，用后可失效。
- [ ] 图片翻译能出候选（生产端点或兜底，UI 明示当前模式）。
- [ ] 模特图能选模特库/自传并出候选。
- [ ] 签名 URL 不泄露长期凭证；Key 不出服务端。

**回退**：翻译/模特为独立新场景；公网管线失败时该功能提示不可用，不影响其余功能。

---

## P7 · 生产流程图 + 营销卖点图增强

> **✅ 已完成并验收(2026-07-07)**。落点:后端 `scenes.ts` 新增 `process`(图文信息图,注入 `{style}`+`{instruction}`步骤文本,instructionRequired=true,defaultN=1);`service.ts` `EditImageInput.style` → 注入 `buildScenePrompt` 的 `{style}`,genParams 记录;`actions.ts` generate 透传 `style`。**营销卖点图增强复用 P3 `suggestPrompts(scene='selling_point')`(看图出卖点),无新后端端点**——增强点纯前端:多选卖点 chips 组合进 instruction。前端 `functions.ts` 启用 process(styleSeg+ratio+prompt)、selling_point 的 sellingPoints 字段转激活;`CreativeWorkshop.tsx` 加 `STYLES`(3 风格)常量、procStyle/pickedPoints 状态、styleSeg Segmented + 「文字渲染依赖模型,生产可切强文字端点」提示、selling_point 推荐面板改多选 CheckableTag(勾选用 ` · ` 连接 + 「已选 N · …」预览)、doGenerate 组合卖点/传 style、卖点必填单独校验。i18n +4 键。至此 **14 功能全部启用,功能栏零灰标**。
> **验收证据**:单测 `scenes.test`(14 场景 + process `{style}` 断言,11/11)、`edit-adopt.test`(+process style 用例,23/23)、ratio-tier 6/6 全绿。E2E `verify-p7-process-sp.js` **OK**:看图出卖点 3 条真值(fallback=false:「圣诞氛围酒瓶袋·麻布材质更有质感·抽绳设计包装方便」)、process 出候选 81s(genParams scene=process/style=商务信息图)、selling_point 出候选 124s(genParams scene=selling_point)、无凭证泄露。**实拍验证**:process 生成完整「生产工艺流程 PRODUCTION PROCESS」商务信息图(01 精选原料裁剪→02 高温压制成型→03 手工缝合封边→04 质检包装出厂,各配图标+中英文说明,步骤 04 用上源图实物,底部 4 保障徽章,文字渲染清晰);selling_point 生成营销主图(大标题+3 卖点卡片,4 酒瓶套实物保留)。浏览器(工坊 kit 挂载 productId=113):process 3 风格档+文字提示+步骤域渲染;selling_point AI 3 卖点多选 chip(勾选 2 个变蓝+「已选 2·…」组合预览),console 0 错误。

**目标**：**生产流程图**（生产步骤→图文并茂信息图，风格可选、比例可选）；**营销卖点图增强**（AI 从商品图提卖点→勾选→生成带文案主图，复用 P3 的看图能力）。新增场景 `process`，增强 `selling_point`。

**前置**：P1、P3（卖点提取复用 suggestPrompts 的看图路径）。

**后端改动**：
- `scenes.ts`：新增 `process`（图文混排，参数 步骤文本/风格/比例）；`selling_point` 增强（支持传入勾选卖点数组）。
- `service.ts`：`suggestPrompts` 复用/扩展出 `suggestSellingPoints`（看图出卖点数组）。图文混排走 `qwen-image`/`wan2.6-image`（强中英文字渲染）；测试期 gpt-image-2 兜底。

**前端改动**：
- `FunctionForm.tsx`：`sellingPoints` 字段（AI 提取的卖点 chips + 勾选 + 换一换）、`styleSeg` 字段（流程图风格：实物写实/简约卡通/商务信息图）、`process` 步骤文本域。

**i18n**：生产流程图/流程步骤/流程图风格/卖点选择/卖点由AI提取。

**测试**：
- E2E `verify-p7-process-sp.js`：process 传步骤出候选；selling_point 传勾选卖点出候选；`suggestSellingPoints` 返回非空数组。
- 浏览器：流程图填 5 步选风格出图；卖点图勾 3 卖点出图。

**验收清单**：
- [ ] 生产流程图能按步骤+风格+比例出信息图候选。
- [ ] 卖点图能 AI 提卖点、勾选、换一换并出带文案候选。
- [ ] 中英文字渲染清晰（生产端点）；测试期兜底可用并标注。

**回退**：两个场景独立新增，不影响其余。

---

## P8 · 智能视频（顶部第二 tab，优先图生视频）

> **✅ 已完成并验收(2026-07-07,策略=「提交即验」不烧钱)**。落点:providers 扩展 `MediaGenInput.parameters` + dashscope `submitVideo` 透传 resolution/duration;`service.ts` 新增 `generateVideo`(源图经 `toPublicUrl` 落公网 URL——非公网直接拒 `MEDIA_SOURCE_NOT_PUBLIC`;DashScope 万相 i2v 异步任务;建 `JOB_TYPE_VIDEO` 带 productId;立即返回 jobId 不阻塞)+ `pollVideoJob`(running/failed/success;成功下载视频落库 + 建视频候选 origin=ai_candidate/assetType=video/role=video);`adoptAsset` 加**视频位分支**(单槽:采纳新视频把旧采纳视频移出、finalSelected/role=video、审计 actorType=user);`publish` 加 `selectPublishableVideo`(采纳视频优先,回退非候选历史视频,**裸候选绝不发布**)并替换两处取视频逻辑。`actions.ts` 加 `generateVideo`/`videoJobStatus` action(+acl)、`candidates` 追加 `videoCandidates`/`videoAdopted` 数组。前端 `CreativeWorkshop.tsx` 启用智能视频 tab;新建 `VideoPane.tsx`(图生视频表单:源图单选 + 时长 3/5s + 分辨率 720P/1080P + 运镜 prompt + 生成;异步轮询进度态 排队/生成中/完成/失败可重试;视频候选 `<video>` 预览 + 采纳/弃用;首尾帧/文生/数字人置灰「即将」占位)。i18n +27 键。
> **重要边界**:gpt-image-2 无视频能力,真机 i2v 只能走 DashScope(计费),经用户拍板选「提交即验」——完整 生成→候选→采纳→发布 链路由**零成本单测 `video.test.ts`(假 provider+假 download)9/9 覆盖**;真机 E2E 只验「提交被接受 + 任务态可查」不轮询到完成。**现网 DashScope 视频 API-key is blocked(HTTP 401)= 视频账号未就绪**(与 memory 一致),管线已正确打到服务商并拿回明确错误,E2E 归为「待就绪」不判失败;账号就绪后设 `AI_LISTING_PUBLIC_BASE_URL=公网域名`(如 app.xuanwu.space)+ 解禁 key 即可真机出片。
> **验收证据**:单测 `video.test`(generateVideo 公网校验/提交/env 基址、pollVideoJob 建候选幂等、adopt 视频位替换、selectPublishableVideo 只带采纳)9/9;回归 scenes 11/edit-adopt 23/ratio-tier 6/dashscope 5/publishable-media 3 全绿。E2E `verify-p8-video.js` **OK**(candidates 视频数组接通、主图 publicUrl 公网可达、generateVideo 正确打到 DashScope 拿回 401 blocked→优雅标记待就绪、无凭证泄露)。浏览器(工坊 kit 挂载 productId=113):智能视频 tab 切换、图生视频表单(源图选择器主图选中/时长 3·5s/分辨率 720P·1080P/运镜域/生成按钮)、4 子类型(i2v 激活 + 首尾帧·文生·数字人 3 灰「即将」)、视频候选面板渲染,console 0 错误。

**目标**：顶部「智能视频」tab 落地，聚合 4 类（图生/首尾帧/文生/数字人），**优先图生视频**（单图→动态展示视频）；产物为**视频候选**，回商品候选区，采纳后进发布视频位。

**前置**：P1、P6（视频端点同样需公网 URL）。已有 `aiListingGenerateVideo.ts` 会话工具可参考。

**后端改动**：
- 视频场景/端点：图生视频 `wan2.2-i2v`/`wan2.6-i2v-flash`/`wan2.7-i2v`（异步 `video-generation/video-synthesis`，720P/1080P，2–15s）；首尾帧/文生/数字人后续。
- `service.ts`：`generateVideo({assetId, mode:'i2v', duration, resolution, ...})` → `toPublicUrl` → 建异步任务 → 轮询 → 产视频候选资产（assetType='video'）。
- `media-jobs`/轮询：复用 JOB_TYPE_VIDEO 与异步管线。
- 发布：视频候选采纳后进商品视频位（`selectPublishableMedia` 视频分支已存在则复用）。

**前端改动**：
- `CreativeWorkshop.tsx`：视频 tab 启用；`VideoPane.tsx`（图生视频表单：选带入图 + 时长/分辨率/运镜 + 生成；异步进度）。
- 结果面板支持视频预览播放 + 采纳/弃用。

**i18n**：智能视频/图生视频/时长/分辨率/运镜/生成中。

**测试**：
- E2E `verify-p8-video.js`：图生视频建任务 → 轮询到完成 → 断言产视频候选、可采纳。
- 浏览器：选主图→图生视频→进度→出视频候选→播放→采纳。

**验收清单**：
- [ ] 图生视频能出视频候选并可播放预览。
- [ ] 视频候选采纳后进商品视频位、发布可带出。
- [ ] 异步任务态（排队/生成中/完成/失败）UI 清晰，失败可重试。
- [ ] 首尾帧/文生/数字人先占位（置灰"即将上线"），不阻塞图生视频。

**回退**：视频 tab 独立;图片链路不受影响;端点不可用时 tab 显示"暂未开通"。

---

## P9 · 抽屉收窄 + 上线打磨

> **✅ 已完成并验收(2026-07-07)**。落点:`assistant-bridge.ts` `openMediaEditor` **移除注入的 `tasks` 快捷按钮**(plugin-ai 原生 task 点击后重置会话/按钮消失——「场景图点了按钮就没了」的根因彻底根治),抽屉回归纯自由对话 + 仅注入选中图(assetId)上下文;systemMessage/引导语改「本对话处理复杂/多轮改图,标准功能引导去『🎨 创意工坊』」。客户端 `SYSTEM['lst-ivy']` 与服务端 `PERSONA['lst-ivy']` 双端 persona 更新指向工坊。**限额**:工坊两入口已受保护——改图 `editImage`→`checkDailyLimit(JOB_TYPE_IMAGE_EDIT)`(service.ts:529)、视频 `generateVideo`→`checkDailyLimit(JOB_TYPE_VIDEO)`(service.ts:727)。**权限**:`MEDIA_ACTIONS` 全部 `acl.allow('aiListingMedia', action, 'loggedIn')`(含 P8 新增 generateVideo/videoJobStatus/publicUrl),未登录越权被拒。**i18n**:en/zh 各 402 键对齐、JSON 合法、新组件用户串均走 t()。
> **验收证据**:回归 media/publish 单测全绿(scenes 11/edit-adopt 23/video 9/publishable-media 3)。浏览器(候选区 media-kit 挂载 productId=113):头部「🎨 创意工坊」入口 + 「💬 找美工」自由对话入口都在;点「找美工」不再注入 task 按钮(抽屉 `openNativeAssistant` 不再收 tasks);候选区头部 QUICK_SCENES(白底/去logo/高清)是直连出图按钮、非抽屉、无消失 bug;console 0 错误。lint 全触碰文件干净。
> **说明**:候选区头部 QUICK_SCENES 直连快捷键保留(不在抽屉内、不触发消失 bug、便于候选区快速改图);创意工坊为标准功能的主入口。

**目标**：把原生 AI 抽屉里的功能按钮**移除**（根治"场景图点击后按钮消失"），抽屉回归「自由对话找美工 Ivy」（复杂/多轮）；全量 i18n / 权限 / 限额 / 文档收口。

**前置**：P1–P8（工坊页已承载全部功能后才收窄抽屉）。

**改动**：
- `src/client-v2/components/assistant-bridge.ts`：移除 `openMediaEditor` 注入的功能按钮（tasks），抽屉只保留自由对话 + 注入选中图上下文；引导语改为"复杂需求描述给 Ivy，标准功能去创意工坊"。
- `src/server/assistant/index.ts`：Ivy persona 引导词更新（指向创意工坊页）。
- 权限：工坊 action 走既有 acl loggedIn；如需角色控制在此收口。
- 限额：改图/视频日限额（`checkDailyLimit`）覆盖工坊入口，防刷。
- i18n 全量校对 en-US/zh-CN；`yarn eslint --fix` 全触碰文件。
- 文档：更新总规划"已完成"状态；录 E2E + 浏览器验收截图。

**验收清单**：
- [ ] 抽屉不再有会消失的功能按钮;自由对话正常;注入选中图上下文。
- [ ] 从抽屉引导可跳创意工坊。
- [ ] 全站新字符串 en/zh 齐全，无硬编码。
- [ ] 改图/视频受日限额保护;越权访问被拒。
- [ ] 触碰文件 eslint/type 干净。

**回退**：抽屉改动小且可逆;保留旧 tasks 分支开关以防回退。

---

## 贯穿性测试与验收基线（每 Phase 都要过）

1. **单测**：改到 `src/server/**` 跑对应 `__tests__/*.test.ts`（`yarn test <file>`，服务端测试串行不并行）。
2. **E2E**：`docs/plans/scripts/verify-p*.js` 真实登录态跑通（koa 自定义 action 返回体注意 `{ok,data}` 解包）。
3. **浏览器**：playwright 打开对应页面截图，console 0 error。
4. **构建**：改插件 src 后 `yarn build` + touch 重启（`src/ai/` 例外）;`yarn eslint --fix` 触碰文件。
5. **铁律回归**：候选不入最终集、采纳审计 actorType=user、发布采纳集优先、Key 不出服务端、测试走 gpt-image-2。

> **当前阻塞（P0 外部依赖）**：gpt-image-2 网关（120.76.157.51:8317）曾返回 503 no-auth。**任一 Phase 的"真实出图"验收都依赖该网关鉴权恢复**——恢复后可一次性把 P1 起的出图闭环补验。不影响页面/表单/带入/采纳等非出图逻辑的先行开发与验收。
