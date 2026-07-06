# 预览编辑 · AI 改图与采纳闭环 · 分阶段实施计划(v1)

> 日期:2026-07-06 · 状态:**待评审,未开工**
> 目标:在预览编辑页实现「选中主图/详情图 → 让 AI 员工改图(去 logo / 白底 / 场景图等,对标阿里国际站创意工坊)→ 生成图与原图对比 → 显式采纳 → 商品发布使用采纳图」的完整闭环;并在 AI 对话抽屉里按员工注入专属快捷功能选项(对标生意助手「猜你想问 / 推荐工具」)。
> 原则延续:**通用化(换模型即切能力,不为单一模型写代码)**、**AI 只产候选、用户显式采纳才生效**、**API Key 永不出服务端**。

---

## 一、调研核心结论(产品与架构依据)

### 1.1 业界交互范式(竞品调研:Shopify Magic/Sidekick、Amazon Ads 生图、PicCopilot、PhotoRoom、WeShop、即梦 Agent、Firefly/Midjourney)

1. **「候选暂存 → 显式采纳 → 才落业务数据」是全行业一致范式**。Shopify 保存时二选一「替换原文件 / 另存新文件」;Amazon 平台规则强制 AI 图只能进副图槽位、不能碰主图;A+ 内容走「生成 → review → approve → submit」三段式。**没有任何一家让 AI 直接写库**——与本项目 jsBlock「staged + Submit + 审计」模型天然同构。
2. **采纳动作默认「追加为新图」,替换需显式确认**;原图永不静默覆盖(Shape of AI 最佳实践:「永不在确认前覆写原始输出」)。
3. **候选呈现:网格是主流,4 张是黄金数量**(Midjourney 2×2、Firefly 4 格、PicCopilot 4-8 张);模型成本高时退化为「1 张 + 再来一张 + 历史列表」(Shopify、PhotoRoom 模式)。卡片 hover 就地给「采纳 / 对比 / 以此再生成 / 下载 / 弃用」按钮(Firefly、PhotoRoom 模式)。
4. **对比 UI 按编辑类型分流**:换背景/换场景/扩图等结构性改动 → **并排对比**(构图已变,滑块无意义);高清放大/瑕疵修复等像素级增强 → **before/after 拉帘滑块**(Claid/Topaz 事实标准)。一个 `compareMode: 'side-by-side' | 'slider'` 字段承载。
5. **对话式改图的目标图指定三件套**:默认「最近一张」+ 把商品图集(带序号)注入系统上下文供用户说「第 3 张」+ 页面点选图片后带上下文打开抽屉。多轮修改学即梦 Agent:「只改说到的部分、其余保持」,把上一次生成参数回传给模型实现增量指令。
6. 差异化机会:业界普遍**没有**严格版本/审计能力,本项目已有审计基建,「采纳留痕 + 原图快照可回滚」可以做成卖点。

### 1.2 模型与 API 矩阵(2026-07 官方文档核实)

| 能力 | 首选模型 | 端点(协议形状) | 同步/异步 | 输入图 | 备注 |
|---|---|---|---|---|---|
| 指令式改图(去 logo/白底/场景/换色/换材质/卖点图) | `qwen-image-2.0-pro`(生成+编辑融合)、`qwen-image-edit-max`/`-plus` | dashscope multimodal-generation(**已有适配器**) | 同步 | **URL / base64 data URI 均可**,1~3 张 | n 可 1~6;本地 dev 直接可用 |
| 专项:高清超分 / 扩图改尺寸 / 去文字水印 / mask 局部重绘 | `wanx2.1-imageedit` + `function`(`super_resolution`/`expand`/`remove_watermark`/`description_edit_with_mask`) | dashscope image-synthesis 异步轮询(**已有适配器**) | 异步 | **URL / base64 均可** | 0.14 元/张;`upscale_factor` 1~4、四向 `*_scale` 扩图 |
| 电商换背景(透明底合成) | `wanx-background-generation-v2` | background-generation 异步(轮询同 `/tasks/{id}`) | 异步 | ⚠️ 仅公网 URL + RGBA 透明底 PNG | 0.08 元/张;生产可用,本地 dev 不可用 |
| 图片翻译(详情图文字多语言) | `qwen-mt-image` | image-synthesis 异步 | 异步 | ⚠️ 仅公网 URL | 15 语种,源/目标至少一端中或英 |
| 模特图/虚拟试衣 | `aitryon-plus` / `virtualmodel-v2` | image-synthesis 异步 | 异步 | 公网 URL | 生产场景,后置 |
| 兜底/多云对比 | OpenAI `gpt-image-*`(/images/edits multipart,≤16 图)、Gemini `gemini-3.1-flash-image`(generateContent inline base64)、方舟 `doubao-seedream-4.x`/`seededit`(images 端点带 image 字段) | 三者均已有端点组适配器 | 同步 | 文件直传/base64,本地友好 | 换模型即切,零业务代码 |

**架构结论:图像编辑不需要新协议适配器。** plugin-ai 通用层(2026-07-05 计划已完成)的 `MediaTaskInvoker` 已带 `images[]` 输入,dashscope multimodal-generation / image-synthesis、OpenAI、Gemini、Ark 四类端点组全部就绪;增量只是:① `images[]` 在各 provider 请求体里的透传补全;② image-synthesis 通道透传 `function`/`mask` 等专项参数;③ 能力注册中心补 `qwen-image-edit*`、`wanx2.1-imageedit`、`doubao-seededit*` 家族规则。**场景 = prompt 模板 + 路由配置,与模型解耦**,符合通用化铁律。

### 1.3 创意工坊功能对标(用户截图菜单 → 我们的场景映射)

| 创意工坊 | 我们的场景 key | 实现路由 | 分期 |
|---|---|---|---|
| 白底图生成 | `white_bg` | 指令式(qwen-image-edit) | Phase 1 |
| 场景图生成 | `scene_gen` | 指令式(场景描述参数化) | Phase 1 |
| 图片擦除(去 logo/水印/杂物) | `erase` | 指令式;文字水印可走 `remove_watermark` | Phase 1 |
| 商品换色 | `recolor` | 指令式 | Phase 1 |
| 营销卖点图 | `selling_point` | 指令式(qwen-image 系文字渲染强) | Phase 1 |
| 高清图 | `hd` | `super_resolution` | Phase 1 |
| 改尺寸/扩图 | `expand` | `expand` + 四向 scale | Phase 1 |
| 换材质 | `material` | 指令式 | Phase 1 |
| 指令生图(自由改图) | `custom` | 指令式 | Phase 1 |
| 图片翻译 | `translate` | `qwen-mt-image`(需公网 URL) | Phase 5 |
| 模特图 | `model_shot` | aitryon/virtualmodel(需公网 URL) | Phase 5 |
| 细节图 / Logo 定制 / 生产流程图 | — | 指令式覆盖(多图输入带品牌素材),暂不单列 | 按需 |

---

## 二、现状基线(代码探查结论,均带出处)

- **预览编辑页是存于数据库 ui schema 的 jsBlock**,src 只供三样:受控 action(`aiListingReview:detail`/`saveFinal`,`src/server/review/index.ts:180/281`)、window 桥接 kit(`__aiListingBlockKit`,`src/client-v2/ai/jsblock-ai.ts` + `components/assistant-bridge.ts`)、媒体服务层。
- **指令式改图服务层已就绪**:`src/server/media/service.ts` 的 `generateImageSync({prompt, sourceImageUrl})` 即「基于源图的指令改图」,产物落 File Manager + `aiListingMediaAssets`(`processType:'ai_generate'`)+ 审计 + 日限额;会话工具 `aiListingGenerateImage`(ASK/backend)已可调用。
- **图片数据结构**:`aiListingMediaAssets`(`src/server/collections/media-assets.ts`)有 `role(main/detail/sku/video)`、`sourceUrl`、`sourceFileId/processedFileId`、`meta`;取图惯例 **`meta.storedUrl` 优先、回退 `sourceUrl`**(`download.ts:104`、`service.ts:214`)。**缺变体/采纳字段**(`parentAssetId/origin/finalSelected/genParams`)。
- **saveFinal 白名单不含图片字段**(`review/index.ts:316-324`),媒体在 `detail` 里只读返回——采纳需独立受控 action。
- **抽屉快捷按钮机制在 plugin-ai 里现成**:`role:'task'` 消息由 `TaskMessage` 渲染成按钮组(`MessageRenderers.tsx:531-568`),点击走 `triggerTask`(可预填 user/system/附件/技能/模型/autoSend,`useChatBoxActions.ts:219-339`);ai-listing 的 `openNativeAssistant` 直控 store 注入消息(`assistant-bridge.ts:87-134`),**追加一条 task 消息即可,plugin-ai 零改动**。
- **前端工具链**(服务端中断 → 客户端 invoke → resumeToolCall 回灌)与 `jsBlockApplyPatch` 模式可直接复用。
- **plugin-ai 出方向不接收模型直接回的图片内容块**——改图产物必须经工具/服务层落库,不能靠员工「对话里回图」。

---

## 三、交互设计定案(产品决策,评审重点)

1. **候选图生命周期**:生成即落库为候选资产(`origin:'ai_candidate'`, `finalSelected:false`,文件进 File Manager 不过期)→ 展示在预览编辑页「AI 候选区」→ 用户**采纳**(置 `finalSelected:true` + role/sort,即刻生效并写审计,`actorType:'user'`)或**弃用**(标记 `discarded`,不进发布,后置清理)。采纳与 `saveFinal` 同守 `EDITABLE_STATUS` 状态锁(已发布锁定态须先退回编辑)。
2. **采纳动作二选一**:默认「**追加为新详情图**」(排到图集末尾);「**替换第 N 张**」需 Modal 二次确认,被替换原图不删除、仅移出最终集(审计里留快照,可回滚)。主图替换额外提示平台白底合规规则。
3. **候选数量**:每次生成默认 **2 张**(成本考虑),场景可配 1~4;网格呈现,卡片 hover 出「采纳 / 对比 / 以此再生成 / 弃用」。
4. **对比**:并排对比为默认(左原图右候选);`hd`/`expand` 等像素级场景用拉帘滑块。场景表带 `compareMode` 字段。
5. **对话式改图**:页面选中图 → 点员工头像/「AI 改图」→ 抽屉打开时注入(a)商品图集清单(序号+URL)(b)当前选中图(c)system 铁律「只产候选,采纳权在用户;增量修改只改说到的部分」。生成结果同时出现在气泡(markdown 预览)与页面候选区。
6. **发布取图**:发布装配时**采纳集优先**(`finalSelected` 的 processedFile 优先,无采纳则用原图),用户需求「发布使用哪张」由此闭环。

---

## 四、分阶段实施

### Phase 0 — 数据模型与通用编辑通道(服务端地基)

**实施**
1. `src/server/collections/media-assets.ts` 加字段:`parentAssetId`(变体溯源)、`origin`(`source|ai_candidate|ai_adopted`)、`finalSelected`(bool)、`discarded`(bool)、`genParams`(jsonb:scene/instruction/model/n/源图);`media-jobs.ts` 补 `provider/model/prompt/batchId`。新字段靠 `yarn nocobase upgrade` 自动同步,无需迁移文件。
2. **媒体服务接通 plugin-ai 通用层**:`service.ts` 改为经 `LLMProvider.invokeMediaTask()`(已公开)调用,模型/服务从能力注册中心 + `llmServices` 解析(不再绑死自有 dashscope provider,后者保留回退);plugin-ai 侧补全:①能力注册中心 `qwen-image-edit*` / `wanx2.1-imageedit` / `doubao-seededit*` 家族规则;②multimodal-generation 请求体 `images[]` 多图透传;③image-synthesis 通道 `function`/`mask_image_url`/`upscale_factor`/四向 scale 参数透传。
3. 新服务函数 `editImage({productId, assetId|sourceImageUrl, instruction, scene?, function?, n})`:源图取 `meta.storedUrl` 优先 → 读本地文件转 base64 data URI 传入(本地 dev 无公网也可用);产物按第三节生命周期落候选资产 + 审计 + 日限额。
4. 受控 action `aiListingMedia:{candidates, generate, jobStatus, adopt, discard}`(新增 `src/server/media/actions.ts`,`acl.allow(...,'loggedIn')`);`adopt` 校验 `EDITABLE_STATUS`、写 `finalSelected`/role/sort + 审计(含被替换原图快照)。

**验收**
- 单测:字段落库、adopt/discard 状态机、状态锁拒绝、审计内容(不含 Key)、通用层参数透传(mock 5 形状)。
- 真实 Key E2E(脚本固化 docs/plans/scripts/):对一张已抓取详情图执行「去掉图中的品牌 logo」→ 候选资产 `origin:'ai_candidate'`、URL 为本地 `/storage/uploads/...`;`adopt` 后 `finalSelected:true`、审计出现 `media.adopt` 记录;`discard` 后不再出现在 candidates。

### Phase 1 — 场景库(对标创意工坊)+ 会话工具

**实施**
1. `src/server/media/scenes.ts` 场景注册表:`{key, title(i18n), promptTemplate(带 {instruction}/{color}/{scene} 占位), route:'instruct'|'function', function?, compareMode, defaultN}`,覆盖 1.3 表中 Phase 1 的 9 个场景;env `AI_LISTING_MEDIA_SCENES` JSON 可增补覆盖(零发版加场景)。
2. 会话工具 `src/ai/tools/aiListingEditImage.ts`(GENERAL/ASK/backend,纯 JSON Schema):入参 `{scene?, instruction, sourceImageUrl|assetId, n?}`,调 `editImage`,返回候选 `urls/assetIds` + markdown 预览指令 +「上次生成参数」(供多轮增量);既有 `aiListingGenerateImage` 保持不动(纯生图)。
3. i18n:场景名/提示 zh-CN + en-US。

**验收**
- 场景矩阵真实 Key 冒烟:`white_bg`/`erase`/`recolor`/`hd`/`expand` 各出 1 张,肉眼验证语义正确;`hd` 产物分辨率 ≥ 2× 源图。
- 抽屉里对员工说「把这张图换成白底」+ 贴图 → 工具被调用、气泡出现候选图 markdown。

### Phase 2 — 预览编辑页:候选区 + 对比 + 采纳(UI 闭环)

**实施**
1. 新增 `src/client-v2/components/MediaStudio/`(候选区组件,antd v5:图集网格、候选卡片 hover 菜单、并排/滑块对比 Modal、采纳确认 Modal)+ `media-kit.ts` 挂 `window.__aiListingMediaKit = {mount(container,{productId}), refresh(), onSelect(cb)}`;v1 入口 `src/client/plugin.tsx` 安装(try/catch 不阻塞加载)。
2. 图片卡片选中态 +「AI 改图」入口(场景下拉 + 自定义指令),直调 `aiListingMedia:generate`,轮询 `jobStatus` 刷新候选区。
3. 采纳/弃用走 Phase 0 action;替换主图时弹平台合规提示。
4. **发布取图改「采纳集优先」**:`src/server/publish/index.ts` 装配图集时 `finalSelected` 资产的 processedFile 优先、回退原图,排序按 sort。
5. 预览编辑 jsBlock 挂载 `__aiListingMediaKit.mount(...)`(**配置操作,非 src 代码**,操作步骤写入交付说明)。

**验收**(浏览器闭环)
- 选中一张详情图 → 场景「图片擦除」+ 指令「去掉左下角 logo」→ 候选网格出现 2 张 → 并排对比 → 采纳(追加)→ 详情图列表末尾出现新图 → 发布草稿 payload 中包含新图 URL。
- 「替换第 1 张」走确认弹窗后生效,原图不再进发布但资产仍在;审计可见替换快照;弃用的候选不进发布。
- `hd` 场景对比为拉帘滑块。

### Phase 3 — 对话式改图闭环 + 美工员工

**实施**
1. seed 专属美工员工 `lst-ivy`(`assistant/index.ts` 的 `lst-` 前缀机制:人设 = 电商美工,铁律 = 只产候选/增量修改/不代替采纳)。
2. `jsblock-ai.ts` `openAI` / `assistant-bridge.ts` 扩展:打开抽屉时把商品图集清单(序号 + storedUrl)+ 当前选中图注入 system;用户可说「第 3 张」。
3. 多轮增量:工具返回携带 `genParams`,员工提示词要求后续指令基于上次参数只改增量(「再亮一点」「背景换成厨房」)。
4. 候选区联动:media kit 监听 job 完成(轮询)自动刷新,气泡与页面双端同步。

**验收**
- 对话:「把第 2 张详情图的 logo 去掉」→ 工具调用 → 气泡 + 候选区同步出图;接着说「背景再换成北欧客厅」→ 基于上一张候选增量生成(源图为上一候选);全程无一次直接写库。
- 换成 OpenAI/Gemini/Ark 任一已配 Key 服务的编辑模型,同一对话流程可跑通(通用化验收)。

### Phase 4 — 抽屉专属快捷功能选项(按员工)

**实施**
1. `assistant-bridge.ts` `openNativeAssistant` 支持 `tasks` 参数:greeting 后追加一条 `{role:'task', content:{content: tasks}}` 消息;`jsblock-ai.ts` `openAI(key, {tasks})` 透传。
2. 按 username 内置任务组:`lst-ivy` = 去logo / 白底图 / 场景图 / 高清放大 / 自定义改图(每个 task 预填 `message.user` 指令模板,autoSend=false 供用户补充);其他员工不注入。plugin-ai 零改动(TaskMessage/triggerTask 现成)。
3. i18n 文案。

**验收**
- 打开 `lst-ivy` 抽屉:欢迎语下方出现快捷按钮组;点「白底图」→ 输入框预填指令,回车即触发工具链;打开 `lst-toby` 抽屉无这些按钮。

### Phase 5 — 批量、合规与生产专属场景

**实施**
1. 批量:候选区勾选多张详情图 → 同一场景批量提交(`batchId` 串联,队列 + 进度条,受日限额保护)。
2. 生产专属场景接入:`translate`(qwen-mt-image)与 `model_shot`(aitryon/virtualmodel)——两者要求公网 URL,生产环境(app.xuanwu.space)`storedUrl` 公网可达即用;本地 dev 检测到非公网地址给出友好提示而非报错。
3. 合规守卫:主图采纳/替换时按目标平台规则提示(Amazon 主图须真实白底等)。

**验收**
- 批量 5 张详情图「白底图」全部完成,进度可见,限额触顶时给出中文提示。
- 生产环境:一张含中文文字的详情图 `translate` 为英文出图;本地 dev 同操作得到「需公网可访问图片」提示。

### Phase 6(可选后置)— 进阶

- mask 笔刷局部重绘(`description_edit_with_mask`,WeShop/ChatGPT 式选区);
- 采纳时自动生成目标平台合规尺寸组(PicCopilot 式,跨境差异化);
- 候选图效果数据回流(哪张图发布后点击率高)。

---

## 五、通用铁律(全程约束)

1. **Key 永不出服务端**:改图链路只在服务端内存读 `llmServices.options.apiKey`;审计/日志/前端载荷一律不含 Key(现有 `service.ts` 惯例延续)。
2. **AI 永不直接写最终数据**:工具只产候选;`adopt` 是用户显式动作,审计 `actorType:'user'`。
3. **通用化**:场景=配置,协议=既有 5 形状适配器,模型=能力注册中心解析;任何「按模型名写 if」都要先问是否该进注册中心家族规则。
4. 每 Phase 交付 = 代码 + 单测 + 真实 Key E2E 脚本(固化 docs/plans/scripts/)+ 浏览器验证步骤;改插件源码须 `yarn build` 重建 dist 再 touch 重启后验证。
