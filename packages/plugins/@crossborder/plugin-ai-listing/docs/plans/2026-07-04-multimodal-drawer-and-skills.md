# 多模态 AI 员工抽屉 · 分阶段实施计划(v2,2026-07-04 重排)

> 方向(用户拍板):AI 员工抽屉 = 对话 + **直接选用生图模型出图** + 生成视频 + 上传技能;支持多种生成模型。
> 服务商 Key 统一在「LLM 服务」配置(Dashscope);状态列实时维护。

## Phase A — 生图模型直连对话(员工直接用生图模型)【已实施,待验收】

**内容**:plugin-ai Dashscope 提供商增加生成模型专用通道 `ImageGenChatModel`(`plugin-ai/src/server/llm-providers/common/image-gen.ts`,`dashscope.ts createModel` 按模型名分流):把员工管线的多条消息折叠为合规的"单 user 消息 + 列表 content"请求(带上附件图,支持 qwen-image-edit 改图);不绑工具;返回图转 markdown 单块流,复用现有会话/渲染管线。模型匹配 `qwen-image*/wan*t2i/wanx*`,可经环境变量 `AI_EMPLOYEE_IMAGE_GEN_MODELS`(正则)扩展任意模型名。
**验收**:抽屉模型选 `Qwen Image` → 说「800×800 白底陶瓷马克杯商品图」→ 回复气泡内直接显示图片;上传一张图 + 选 `qwen-image-edit` → 「去掉水印」→ 显示改后图;切回 DeepSeek 对话正常不受影响。
**已知限制**:直连出的图 URL 为服务商临时链接(有效期有限,气泡内有提示);要持久化/入资产库请走 Phase B 工具路径。生图模型无工具/追问能力,深度协作场景仍建议"对话模型+工具"。

## Phase B — 工具式生成(对话模型经工具出图/出视频,产物入库)【已实施,待验收】

**内容**:DashScope 媒体适配器(双协议:千问图像、万相视频)+ 服务层(`plugin-ai-listing/src/server/media/{providers,service}.ts`:Key 自动取 LLM 服务、日限额 图200/视频20、逐次审计、产物落 File Manager + mediaAssets)+ 3 个 AI 工具(生成图-同步≤120s-ASK / 生成视频-异步提交-ASK / 查任务-ALLOW)+ 抽屉 `<video>` 渲染白名单补丁。单测 5/5 通过,工具注册已验证。
**验收**:用**对话模型**(DeepSeek/qwen-max)说「生成白底商品图」→ 确认卡 → 气泡显示图;「做成短视频」→ 生成中 → 追问后气泡内可播放;mediaAssets/mediaJobs/审计表有记录;超日限额被拒。

## Phase A2 — 生成通道通用化(任何提供商/模型,换模型即用)【待实施,优先级最高】

**内容**(用户 2026-07-04 明确:不针对单一模型写,通用、可换模型):把 Phase A 的生成通道从 `dashscope.ts` 上提到 **LLMProvider 基类**(`plugin-ai/src/server/llm-providers/provider.ts`),三层通用抽象:
1. **能力声明**:`provider.getModelCapabilities(model) → { chat, imageOutput, videoOutput }`——基类给默认启发式(内置各家生成模型名单),提供商可覆盖,最终可被「LLM 服务」设置项覆盖(新模型零代码接入);
2. **通用生成 ChatModel**:`MediaGenChatModel`(provider 无关)负责消息折叠与结果块→markdown 的单块流输出;它只依赖 `provider.invokeMediaGeneration({model, prompt, images, kind})` 这一个接口;
3. **默认实现 + 按需覆盖**:基类给 OpenAI 兼容 chat/completions 的默认实现(覆盖 dashscope/openai/openrouter 等兼容端点的图像输出);协议不同的(如万相视频任务式 API、Gemini generateContent)由各提供商覆盖该方法。产物统一经 file-manager 持久化,解决临时链接过期。
**验收**:同一段代码不改动,分别选 qwen-image(dashscope)、gpt-image(openai)、以及设置里手工登记的任意新模型名,均能对话出图;视频模型选中后能出视频或明确引导;dashscope.ts 中 Phase A 的特化分支被移除。

## Phase C — 多模型/多服务商扩展【待实施】

**内容**:① 生图直连的模型清单管理:把匹配规则从正则升级为设置项(设置页可增删模型名/家族),覆盖新模型(如 Z-Image、可灵)无需发版;② 视频模型直连对话(万相视频不走兼容端点,需在 ImageGen 通道旁增加"提交+会话内轮询占位"方案,或引导走工具);③ 第二服务商(火山即梦)实现同一 `MediaProvider` 接口;④ 员工级模型设置联动(给"美工"员工限定生成模型范围)。
**验收**:设置页新增一个模型名后,抽屉选该模型即可直连出图;火山 Key 配置后切换服务商生成成功。

## Phase D — 技能上传与管理【待实施】

**内容**:`aiListingSkills` 资源(list/create/update/destroy/uploadMd;uploadMd 用 gray-matter 解析 SKILLS.md;名称强制 `lst-` 前缀防重启覆盖;tools 绑定校验;ACL 管理员);设置页「技能管理」Tab(列表/编辑抽屉/上传 .md);运行时零改动(已验证 skillsManager 读库)。
**验收**:上传「标题优化方法论」.md → 员工技能 Tab 出现 → 会话中员工 getSkill 加载并调用绑定工具 → 重启不丢;删除后消失。

## Phase E — Media Studio 页面(批量改图/采纳/发布)【待实施,原一期计划】

**内容**:预览编辑页媒体区(原图卡+变体条+多选批量+对比+采纳)、pHash 查重自检、发布链路"采纳集优先"、设置页护栏/规格预设。详见 [media-studio-phase1 计划](./2026-07-04-media-studio-phase1.md)(其 Task 1/3/4 已被 Phase B 覆盖,执行时按状态裁剪)。
**验收**:10 张主图批量"去水印+白底"→ 对比 → 采纳 → 发布用采纳集,pHash 达标,审计完整。

## 依赖与顺序

A、B 已落地(可并行验收)→ C/D 互相独立可并行 → E 依赖 B 的服务层。所有阶段共同前提:LLM 服务已配置启用的 Dashscope(百炼)Key。
