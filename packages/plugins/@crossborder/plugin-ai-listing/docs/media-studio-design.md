# 图像/视频工场(Media Studio)设计方案(v1 评审稿)

> 懂店 ShopMind · AI 商品搬运工具 · 预览编辑页企业版升级
> 日期:2026-07-04 · **状态:待评审,零代码改动** · 关联文档:[AI 员工插件优化方案](./ai-employee-optimization-plan.md)

## 1. 需求与目标

**痛点**:搬运的商品直接用源商品的主图/详情图发布,会被目标平台(1688 等)的重复图片检测命中,判定与他人商品同图,影响上架与流量。

**目标**:在预览编辑页提供"基于原图生成差异化新图"的能力——

1. 对原图执行 去水印/去 logo、换标(贴自有品牌标)、白底化、场景/背景重绘、平台规格裁剪 等操作,一张原图可生成多个变体;
2. 图片可**多选批量**处理;展示上**原图与生成图并列可对比**,由人工挑选采纳为最终发布图;
3. 生成后自动做**查重自检**(与原图的感知哈希相似度),给出"是否足够差异化"的量化提示;
4. (二期)基于主图**生成商品展示短视频**,用于平台视频位;
5. 生成能力由 **AI 员工**承载(新员工"美工"),生成服务商的 Key **复用 plugin-ai「LLM 服务」配置**(用户已拍板);
6. 全程遵守项目铁律:AI 产物只进"变体池/建议区",**只有人工采纳 + Submit 才影响发布**,逐次审计。

## 2. 现有底座盘点(设计直接续建,不另起炉灶)

| 底座 | 现状 | 在本方案中的角色 |
|---|---|---|
| `aiListingMediaAssets` | 已有:assetType(image/video)、sourceUrl、sourceFileId、processedFileId、role(main/detail/sku/video)、sort、processStatus、processType、meta | 资产主表,扩展"变体树 + 采纳"字段 |
| `aiListingMediaJobs` | 已有:jobType 枚举**已预留** remove_watermark/white_bg/crop/scene/video、status 状态机、input/outputFileId、tracing 字段 | 生成任务表,扩展 provider/prompt/成本字段 |
| `src/server/media/download.ts` | 已把源图下载入 File Manager(processType='download') | 原图入库链路,不动 |
| 三段字段审核范式 | titleOriginal/Processed/Final + saveFinal 受控写入 + 审计 | 图片沿用同一哲学:原图(captured)/变体池(ai_generated)/最终图(finalSelected) |
| plugin-ai LLM 服务 | 内置 `dashscope` 提供商(server/llm-providers/dashscope.ts);当前已配 DeepSeek | **生成服务商配置入口**:用户在「LLM 服务」添加 Dashscope(百炼)条目,媒体管线读取其 apiKey/baseURL |
| plugin-ai 工具/技能/员工包机制 | 见优化方案第 3 节(SPECIFIED 工具、SKILLS.md 渐进加载、代码定义员工) | 二期"美工"员工的承载方式 |
| jsBlock staged 模式 | AI 只改暂存,Submit 入库 | 会话式改图沿用:生成物进变体池,采纳在页面 |

## 3. 总体架构

```
预览编辑页(媒体区)                     AI 员工会话(二期)
  │ 多选原图 → 批量操作按钮                │ 自然语言("这张换成厨房场景")
  │      (确定性,不经 LLM)               │ Ivy 调工具(经 LLM)
  ▼                                       ▼
aiListingMedia:generate(受控 action) ← generateImageVariant 工具(同一服务层)
  │ 建 aiListingMediaJobs(pending) + 审计 + 成本护栏检查
  ▼
媒体生成服务层(队列:并发限制/重试/超时)
  │ MediaProvider 适配器接口
  ├─ DashScopeProvider:改图 = qwen-image-edit 系列;视频 = 通义万相 Wan I2V(二期)
  │    └─ Key/BaseURL 从 llmServices 中"被指定的 dashscope 服务"读取
  └─ (可插拔:火山/OpenAI 后续实现同一接口)
  ▼
产物回写:File Manager 存图 → 新增 mediaAssets 变体行(parentAssetId=原图)
  → pHash 相似度自检写 meta → job success + 耗时/成本落库
  ▼
页面变体条展示 → 人工对比/采纳(finalSelected)→ 发布链路取"采纳集"(未采纳的 role 回退原图)
```

**为什么按钮直连 + 员工会话双轨**:批量去水印这类确定性操作走按钮直连服务层,快、稳、省(不消耗 LLM tokens);"把背景换成北欧客厅风"这类开放式精修走员工会话,由 LLM 把意图翻译成操作与 prompt。两轨最终汇入同一个任务队列与变体池,审计与成本口径统一。

**FAQ:为什么需要 DashScope 适配器,不能"直接用 AI 员工"生成?**(2026-07-04 评审提问,含二次追问修正)精确的技术事实(已核对 plugin-ai 源码):员工管线**入方向支持多模态**(附件→image_url 内容块,provider.ts:254-262,员工可"看图");**出方向只解析文本+工具调用**(utils.ts parseResponseMessage / provider 流式解析),模型回包里的图片内容块无人接收、存储、渲染——虽然 qwen-image-edit 也能走 OpenAI 兼容对话协议"回图",但当前 plugin-ai 接不住,图会被丢弃。且生图模型不支持工具调用/真对话,绑给员工会失去员工的全部编排能力。因此分工是:员工挂 qwen-vl(看图+对话+调工具),生成走工具背后的适配器(约百行,Key 复用 llmServices);批量 50 张走后台队列而非会话串行(tokens/速度/漏图/关页即断)。**演进方向**:可向上游提 issue/PR 支持"对话内生图"(接回包图片→存文件→渲染图片消息),届时 Ivy 可在会话里直接回图预览;但图片成为业务资产(变体池/采纳/审计/发布)仍需 mediaAssets 管线。若 plugin-ai 官方增加图像生成服务类型,`MediaProvider` 接口即替换点。

## 4. 数据模型扩展(自动同步,无需迁移文件;新增列跑 `yarn nocobase upgrade`)

### 4.1 `aiListingMediaAssets` 新增字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `parentAssetId` | bigInt(自关联) | 变体指向其原图资产;原图为 null。一图多变体 = 多行,**不再复用 processedFileId 单槽**(该字段保留兼容下载链路) |
| `origin` | select:`captured` / `ai_generated` / `manual_upload` | 来源;列表分组与徽标依据 |
| `finalSelected` | boolean 默认 false | 采纳为最终发布图;同一 role 下按 sort 排序组成发布图集 |
| `genParams` | jsonb | 生成参数快照:{jobType, prompt, provider, model, sourceAssetId} |
| `similarity` | jsonb | 自检结果:{pHash, distanceToSource, verdict: 'ok'\|'too_similar'} |

### 4.2 `aiListingMediaJobs` 新增字段与枚举

- jobType 枚举扩展:`replace_logo`(换标)、`style_variation`(构图/色调微调);已有 remove_watermark/white_bg/crop/scene/video 复用。
- 新增:`provider`(string)、`model`(string)、`prompt`(text)、`costEstimate`(decimal,估算费用)、`batchId`(string,同一次批量操作的分组)。

### 4.3 新表 `aiListingBrandAssets`(品牌素材库,支撑"换标")

{ id, name, kind: `logo`/`watermark_corner`, fileId, isDefault, enabled }。设置页维护;**贴标不走 AI**——用 sharp 本地合成(角标/透明叠加),零成本、位置可控;"换标"= AI 去他人标 + 本地贴自有标两步一个 job 完成。

## 5. 服务商接入(按你的决定:在「LLM 服务」配置)

1. 用户在 `AI 员工 → LLM 服务` 添加一条 **Dashscope** 服务(百炼 API Key)——与 DeepSeek 同一管理入口、同一交互。
2. 本插件设置页(现有 SettingsPage)增加「媒体生成」区:
   - **图像服务**:下拉选一条 llmServices 记录(过滤 provider=dashscope,后续开放其他 provider)+ 模型名(默认 `qwen-image-edit`,可改);
   - **模型选型(千问 vs 万相,2026-07-04 决策)**:改图默认用**千问-图像编辑(qwen-image-edit)**——指令式改图,一个接口覆盖全部操作类型(去水印/白底/换背景/微调),且对图片中的**中文文字与水印**的理解/擦除是百炼系里最强,电商图大量中文促销文案场景下优势明显;**万相-通用图像编辑(wanx*-imageedit)作为备选**——它有专门的 `remove_watermark` 等函数式接口,若千问去水印效果不达预期可在设置页把模型名换成万相系,适配器按模型名自动切换调用协议。二期视频必用**万相**(Wan I2V,千问系无视频模型);
   - **视频服务**(二期):同上,默认 `wan2.2-i2v-flash`;
   - **成本护栏**:单日生成上限(张)、单次批量上限、超限行为(拒绝并提示)。
3. 媒体服务层通过所选 llmServices 行读取 apiKey/baseURL 调百炼 REST(改图为异步任务,轮询取结果)。**Key 永不下发前端、不入日志/审计**(沿用现有铁律)。
4. 所选服务被停用/删除时:新任务直接失败并给出可读提示,不影响已完成变体。

## 6. AI 员工怎么接:技能 + 工具组合(结论:两者都用,各司其职)

| 载体 | 承担什么 | 具体设计 |
|---|---|---|
| **工具(SPECIFIED,绑定给美工员工)** | 执行动作 | `listProductMedia`(只读列出某商品的原图/变体与采纳态)· `generateImageVariant`(**ASK 权限**;入参 assetId+jobType+prompt;提交 media job,返回 jobId——长耗时生成不做同步等待,两段式)· `checkMediaJob`(只读查任务进度/结果)· `imageSimilarityCheck`(只读,算两图 pHash 距离) |
| **技能(SKILLS.md:`image-rework`)** | 方法论 | 平台图片规范(1688/国际站主图尺寸、白底要求、水印规则)+ 查重规避策略(先去标→仍过近则换背景→再不行构图微调;prompt 模板库;何时建议贴自有标)。渐进加载:平时只占系统提示词一行,处理图片任务时经 getSkill 载入 |
| **员工(新增 `lst-ivy` 美工 Ivy)** | 会话入口 | 按优化方案 P0-1 的"代码定义员工包"结构落地(`ai/ai-employees/lst-ivy/`:prompt.md 人格 + tools/ + skills/);头像挂在预览编辑页媒体区,预设任务"主图去重一键处理"(任务级工具子集只勾 4 个媒体工具) |

**为什么不是"纯技能"或"纯工具"**:技能没有执行力(它只是提示词+工具组),工具没有方法论(LLM 不知道该选哪种改法)。工具负责"做",技能负责"怎么做对",员工负责"和谁对话"。生成类长任务必须拆成"提交+查询"两个工具,避免会话阻塞在几十秒的生成上。

### 6.1 选图会话流(2026-07-04 用户新增需求:预览编辑页选中图片交给 AI 员工优化)

1. **选图**:媒体区的多选框复用为"员工上下文选择"——勾选若干张图(原图或变体均可)。
2. **入口**:批量工具栏新增「交给美工 Ivy」按钮(原生员工头像样式,复用 blockKit 头像规范)。点击经 bridge 打开原生 plugin-ai 抽屉,并注入上下文(复用 `__aiListingBlockKit` 的 register/getData 模式):商品 id、选中图片的 assetId/role/缩略 URL、平台图片预设、可用操作清单,以及指令"处理图片调用 generateImageVariant({assetId, jobType, prompt}),完成用 checkMediaJob 查进度"。
3. **会话**:用户自然语言指挥("这三张都去水印,第二张背景换成户外草地")→ Ivy 逐图调用工具(ASK 权限,首次调用出确认卡)→ 返回 jobId 后她轮询 checkMediaJob,并在会话里汇报;页面变体条经轮询同步出现新变体。
4. **铁律不变**:会话产物只进变体池;采纳(finalSelected)只能在页面点,Submit 才影响发布。
5. **让 Ivy"看得见图"**:Ivy 的员工级模型设置绑定**多模态模型(Dashscope qwen-vl 系)**——她能实际查看选中图片,指出水印位置、评估白底是否干净、判断变体效果,再决定操作与 prompt;纯文本模型(DeepSeek)只能"盲改"。这是员工级模型设置(官方能力)的典型用法。

## 7. 预览编辑页媒体区 UI 设计

- **分组 Tab/锚点**:主图 · 详情图 ·(二期)视频。
- **原图卡片流**:每张原图一张卡(徽标「原图」),卡下方是**变体条**——该图的 AI 生成变体横向排列,每张变体卡显示:操作类型标签(去水印/白底/换背景…)、**相似度徽标**(与原图的差异度,`too_similar` 时橙色警示"仍可能判重")、状态(生成中 spinner/失败重试)。
- **对比查看**:点击变体 → 大图弹层,原图/新图左右滑杆对比(或并排),支持键盘左右切换(a11y)。
- **多选批量**:卡片复选 + 顶部批量操作栏(操作下拉 + 生成按钮 + 进度 n/m);批量共用 batchId,失败项可单独重试。
- **采纳**:变体卡"采纳为最终图"→ finalSelected 打勾并顶到"发布图集"预览区(按 role 分组、可拖拽排序);再次点击可取消。**发布图集区就是发布时的所见即所得**:某 role 无采纳变体则显示原图占位并标注"将使用原图(有判重风险)"。
- **员工入口**:Ivy 头像(原生 AIEmployeeShortcut 样式,复用 blockKit 的 getAvatar/头像动画规范),预设任务一键触发。
- **审计入口**:变体卡"⋯"菜单可看生成参数与审计记录(谁/何时/什么操作/费用估算)。
- 组件全部 antd v5;文案走 i18n(en-US + zh-CN)。

## 8. 查重自检(企业版差异化能力,零外部成本)

- 生成完成即计算变体与原图的**感知哈希**(pHash/dHash,sharp + blockhash 本地计算),汉明距离写入 `similarity`;
- 阈值分档:距离 < 阈值 A → `too_similar`(橙色警示,建议追加换背景);≥ A → `ok`;阈值在设置页可调;
- 批量结束给汇总:"12 张生成完成,2 张差异度不足建议二次处理";
- 说明:pHash 是对平台查重的**近似预估**,不承诺与平台算法一致——UI 文案如实标注,避免误导商家。

## 8.5 平台规格预设(消除"规格不确定"的设计)

图片规格不写死在代码里,做成**设置页可配置的平台预设**(按 targetPlatform 一套),裁剪/白底/自检按预设执行。默认值按 1688 官方规则初始化(2025 口径,来源见文末):

| 预设项 | 1688 默认值 |
|---|---|
| 主图 | 正方形,≥750×750,推荐 **800×800**;JPG/PNG;前 4 张 ≤3MB;至少 3 张 |
| 白底图(第 5 张) | 白底、主体完整居中、**无水印/文字/logo/拼接**;>310×310;38K–300K |
| 主图禁项 | 除品牌 logo 外不得有水印;不得拼接/加边框/留白;不得含促销、夸大文案或联系方式 |
| 详情图 | 宽 750/790(常用口径),高度不限,单张 ≤3MB(预设可调) |

规格来源:[1688 白底图规范(店托易整理)](https://diantuoyi.com/article/6986.html) · [1688 工业品主图规范](https://diantuoyi.com/article/7371.html) · [1688 主图/详情尺寸(阿明查查)](https://www.kaqiw.com/2706.html) · [1688 官方主图百科](https://view.1688.com/cms/baike/chengxintong002.html)。平台规则会演进,预设可随时在设置页更新,不用发版。

**联动**:白底图禁项(无水印/无 logo)恰好就是"去水印 + 白底化"两个 jobType 的组合——一期提供「一键合规白底图」组合操作;"贴自有品牌标"仅用于前 4 张主图(1688 允许品牌 logo),白底图预设强制不贴标。

## 9. 分期计划

| 期 | 内容 | 交付判定 |
|---|---|---|
| **一期:改图闭环** | 模型扩展(4.1–4.3)· DashScope 图像 adapter(经 llmServices)· 队列/重试/成本护栏 · 批量按钮链路 · 变体条+对比+采纳 UI · pHash 自检 · 发布链路取采纳集 · 审计 | 选 10 张主图批量"去水印+换背景",全部生成、对比、采纳、成功发布,发布图与原图 pHash 距离达标,审计完整 |
| **二期 a:员工选图会话(优先)** | lst-ivy 员工包(工具×4 + image-rework 技能,绑定 qwen-vl 多模态模型)· 媒体区「交给美工 Ivy」选图入口(§6.1)· 预设任务 | 页面勾选 3 张图 →会话说"都去水印,第二张换户外背景"→ 变体生成、页面同步、采纳发布 |
| **二期 b:视频** | Wan I2V 图生视频(assetType=video 同链路)· 发布带视频位 | 主图生成 5s 视频并发布 |
| **三期:企业增强** | 全店批量去重流水线(工作流,对齐优化方案 P1-8)· 成本/相似度看板 · 更多 provider(火山即梦)适配 | 一键对整批商品跑图片去重并出报告 |

视频放二期是我的推荐(生成耗时长、单价高,先把改图闭环做扎实);若你要一期并入,只影响排期不影响架构。

## 10. 风险与对策

| 风险 | 对策 |
|---|---|
| 生成质量不稳定(logo 残留、物体变形) | 人工采纳兜底(不采纳不发布);变体卡一键"换个方式重生成";prompt 模板沉淀在技能里持续调优 |
| 百炼限流/异步任务超时 | 队列并发限制(默认 2)+ 指数退避重试 + 任务级超时落 failed 可重试 |
| 费用失控 | 设置页日限额/批量上限;job 落 costEstimate;超限拒绝并提示 |
| 存储膨胀(变体多) | 变体未采纳超 N 天可清理(设置项,默认不自动删);建议 File Manager 配 OSS |
| 合规 | 改图不改变素材权利归属,页面提示商家确认可用性;去他人商标水印用于规避平台判重,需商家自担品牌合规责任(文案如实提示) |

## 11. 决策记录(2026-07-04 已拍板)

1. **视频二期**:✅ 已确认,按二期交付。
2. **图片规格**:用户对 1688 具体要求不确定 → 设计上改为**可配置平台预设**(见 8.5),默认值按 1688 官方规则初始化,规则变化只改配置不发版。
3. **成本护栏默认值**:✅ 已确认,日上限 200 张 / 单批 50 张。
4. **服务商**:✅ 复用 plugin-ai「LLM 服务」配置 Dashscope(百炼),媒体管线读取所选服务的 Key(见第 5 节)。
5. **选图会话(用户新增需求)**:✅ 预览编辑页选中图片 → 交给 AI 员工会话优化,交互定型于 §6.1;排期为二期 a(优先于视频 = 二期 b)。
6. **模型选型**:✅ 改图默认千问 qwen-image-edit,万相为备选(设置页换模型名即切换);视频用万相(见第 5 节)。

---

*本文档为设计稿,未实施任何代码;批准后按分期出实现计划。*
