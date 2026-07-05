# AI 员工插件优化方案(v1 评审稿)

> 懂店 ShopMind · AI 商品搬运工具
> 日期:2026-07-04 · 范围:`@nocobase/plugin-ai` + `@crossborder/plugin-ai-listing` · **状态:待评审,零代码改动**

基于三路证据写成:NocoBase 官方文档(docs.nocobase.com/cn/ai-employees)、本地 `plugin-ai 2.2.0-alpha.4` 源码逐行分析、Accio Work 竞品调研。本文档只做规划,**未修改任何代码**;每一项优化均需批准后再实施。

---

## 目录

1. [四个问题的直接结论](#1-四个问题的直接结论)
2. [现状盘点](#2-现状盘点)
3. [三个关键机制澄清](#3-三个关键机制澄清源码证据)
4. [差距分析 A:没用足的官方原生能力](#4-差距分析-a没用足的官方原生能力)
5. [差距分析 B:对比 Accio Work](#5-差距分析-b对比-accio-work)
6. [优化路线图(P0 / P1 / P2,共 14 项)](#6-优化路线图)
7. [不做清单(Non-goals)](#7-不做清单non-goals)
8. [附录:证据与文件索引](#8-附录证据与文件索引)

---

## 1. 四个问题的直接结论

### Q1:AI 员工怎么用?

使用链路是「配 LLM 服务 → 启用员工 → 三个入口对话」。

- **管理端**(`设置 → AI 员工`)按员工配置六件事:员工资料、人物设定(系统提示词,支持当前用户/语言/时间等变量)、模型设置(员工级专属模型范围)、技能权限、工具权限、知识库(专业版)。
- **终端用户三个入口**:
  1. 页面右下角浮动助手(默认由主管 Atlas 接待并转派);
  2. 区块 `Actions → AI employees` 把员工头像挂到区块上,并可用 **Edit tasks** 配置一键预设任务;
  3. 特定场景专属入口(如 JS 区块里的 Nathan)。
- **会话能力**:选区块作为上下文、传附件、开联网搜索,模型偏好按员工记忆,历史会话可查。
- **权限**:角色权限里可控制每个角色能用哪些员工。

### Q2:为什么截图里的工具"完全不能配置"?官方能配吗?

**官方的通用工具同样不能增删——这是设计而非故障。** 工具分三级作用域:

- **通用工具(GENERAL)**:强制全员共享,界面只做只读展示(权限开关在源码里是 `disabled` 的);
- **员工专属工具(SPECIFIED)**:只能由代码绑定给内置员工;
- **自定义工具(CUSTOM)**:才是可增删、可设权限的那一类,来自「AI 员工事件」类型的工作流。

截图里自定义工具区"暂无数据",是因为系统里还没有创建任何该类型的工作流——建一条,"+添加工具"就有候选了。

另外:截图里知识库命中/违禁词扫描/读取商品等 5 个工具是**我们自己的插件以 GENERAL 作用域注册的**,所以它们才出现在"全员共享"区且不可按员工分配——这是我们代码的选择,可以改(见 P0-1)。

真正的"按需勾选工具"官方入口在**任务级**:快捷任务(Edit tasks)和工作流 AI 员工节点里,技能/工具都有 Preset / Customer 两档,Customer 即勾选子集。

### Q3:"技能"和 skill(Claude 生态的 Agent Skills)是一回事吗?

**机制上本质相同,开放度不同。**

- NocoBase 的技能存在 `aiSkills` 表,来源是插件代码里的 `SKILLS.md` 文件(front-matter 声明名称/描述/绑定工具,正文是领域指南)。
- 运行时系统提示词里只注入每个技能的「名称:描述」一行摘要,技能绑定的工具初始并不参与对话;当模型判断需要时调用「技能加载(getSkill)」工具,才把正文载入上下文并激活配套工具——这正是 Anthropic Agent Skills 的"渐进式披露"。
- 区别:NocoBase 目前**不支持在界面上自定义技能**,只能系统预置;但插件可以用代码添加(loadAI 会扫描 `src/ai/skills/**/SKILLS.md`),这是我们可以利用的扩展点(见 P0-2)。
- 与"工具"的关系:工具是单个可执行函数,技能是「一段领域方法论 + 一组延迟加载的工具」。

### Q4:和 Accio Work 差多少?

产品范式不同:Accio Work 是**目标驱动的自主执行平台**(一句话目标 → 动态编排多 agent 并行跑长链任务、7×24 后台任务、IM 远程指挥、文件级交付物),NocoBase AI 员工是**会话驱动的业务系统内助手**(单员工单轮工具调用、人在回路)。

最大代差在执行范式、异步任务、交付物形态、持久记忆四项;我们的相对优势是私域数据单一事实源、权限边界清晰、改动可审计。

结论:**不追"全自主",借鉴六点**——任务计划可视化、后台任务+通知闭环、记忆持久化、"记住选择"式渐进放权、流程固化为技能、文件级交付物。详见第 5 节。

---

## 2. 现状盘点

### 2.1 官方 plugin-ai 能力地图(本地版本 2.2.0-alpha.4,与 2.x 文档同代)

| 能力域 | 官方形态 |
|---|---|
| 员工管理 | 员工资料 / 人物设定(变量) / 模型设置(员工级) / 技能权限 / 工具权限 / 知识库(专业版);内置 9+ 员工(Atlas 主管、Viz、Dex、Ellis、Lexi、Vera、Nathan、Lina、Dara、Orin) |
| 对话入口 | 右下角浮动助手(Atlas 协调转派)、区块 Actions 挂员工、专属场景入口;选区块上下文、附件、联网搜索、按员工模型偏好 |
| 快捷任务 | 页面级/区块级预设任务:Title / Background(系统提示词)/ 默认消息 / Work context / 技能与工具 Preset\|Customer 子集 / 自动发送 |
| 工具体系 | GENERAL(全员共享)/ SPECIFIED(代码绑定内置员工)/ CUSTOM(工作流「AI 员工事件」触发器生成,可增删+设 询问/允许);MCP 工具(Stdio/HTTP,逐工具设权限,默认全局共享) |
| 技能体系 | SKILLS.md → aiSkills 表;系统提示词挂摘要,getSkill 按需加载正文+激活工具;内置:数据元数据、数据查询、业务分析报告、文档搜索、数据建模(Orin)、前端开发(Nathan) |
| 工作流 | LLM 节点(对话/多模态/结构化输出)、AI 员工节点(选员工/模型/操作人/技能工具子集/结构化输出/**审批 Human\|AI decision**)、AI 员工事件触发器(→自定义工具)、后台任务表 aiWorkflowTasks(审批状态机,会话内 Approve/Revise/Reject 卡片) |
| 知识库(专业版+) | RAG:Local/Readonly/External 三类,PGVector 向量库,员工级 Top K / Score / 引用提示词 |
| 权限 | 角色 → 可用员工;数据查询工具遵循用户数据权限;工作流工具权限独立于用户权限 |

### 2.2 本项目(plugin-ai-listing)当前的集成方式

- **员工**:5 个 lst-* 员工(Mira 选品 / Rena 合规 / Toby 文案 / Lena 发布 / Kai 主管)由数据库播种;人格 PERSONA 与预设任务 TASKS **硬编码**在 `src/server/assistant/index.ts`,不走员工配置。
- **双对话通道并存**:① 自建 `aiListingAssistant:ask`(直调 LLM + mock 兜底,无原生会话/工具循环/审计卡片);② 原生 plugin-ai 抽屉(经 assistant-bridge / `__aiListingBlockKit.openAI`)。功能重复、体验不一致。
- **工具**:5 个搬运工具(知识库命中、违禁词扫描、商品状态统计、读取商品、写入 AI 建议)全部以 `scope: 'GENERAL'` 注册(`src/server/assistant/tools.ts`)→ 全员共享、不可按员工分配;代码里的 EMPLOYEE_TOOLS 员工→工具映射**并未生效**,只用于展示。另有前端工具 jsBlockApplyPatch(改暂存数据,Submit 才入库,模式正确)。
- **知识库**:本地关键词匹配(matchKnowledge / scanBannedWords),非向量 RAG。
- **安全铁律(保留)**:AI 只读或只写建议列;唯一入库路径是业务 Submit(`saveFinal`)+ 审计,与官方 formFiller 哲学一致。

---

## 3. 三个关键机制澄清(源码证据)

这三条决定了后面所有优化的做法,均已在本地源码验证。

### 3.1 工具三级作用域——"能不能配"由作用域决定

| 作用域 | 来源 | 员工编辑抽屉里的表现 | 运行时 |
|---|---|---|---|
| **GENERAL** 通用工具 | 代码 `defineTools`(loader 扫描 `src/ai/tools/**`);MCP 工具也默认归此类 | 只读列表;权限开关渲染为 `disabled`(EmployeesPage.tsx:752-757)→ **官方也不可增删** | `listTools({scope:'GENERAL'})` 无条件注入**每个员工**的每次会话(ai-employee.ts:1368) |
| **SPECIFIED** 员工专属 | 代码绑定(如 Atlas 的转派/查询员工三件套) | 仅 `builtIn` 员工显示,只读;普通新建员工看不到也加不了 | 经员工 `skillSettings.tools` 白名单挂载 |
| **CUSTOM** 自定义工具 | 「AI 员工事件」类型工作流,动态注册为 `workflowCaller-<key>`,入参 schema 由工作流 parameters 生成 | **可增删、可设 询问/允许**(写入 skillSettings.tools[].autoCall);"+添加工具"下拉只列已存在的该类工具,没有则置灰/暂无数据 | 调用即触发工作流,取执行输出回传模型 |

> **对截图现象的完整解释**:「通用工具」区那 5 个业务工具是我们自己注册成 GENERAL 的,落进了"天生不可配置"的区;「自定义工具」区空是因为还没建过 ai-employee 类型工作流。两件事叠加,造成"整页都不能配置"的观感。

### 3.2 技能 = 渐进式披露的「领域指南 + 延迟工具组」

- 定义文件:`src/ai/skills/<name>/SKILLS.md`(front-matter:scope/name/description/tools;正文 = 提示词 content),启动时落库 aiSkills。
- 运行时:系统提示词 `<skills>` 段只列「name: description」;技能自带工具从初始 binding 中剔除;模型调用 `getSkill` 后才注入正文并激活工具(ai-employee.ts:1444-1466)。
- 结论:与 Anthropic Agent Skills 同构;UI 不可自定义,但**插件代码可自由新增技能**——这是我们最重要的合法扩展点之一。

### 3.3 员工也可以"代码定义"

loadAI 同样扫描 `src/ai/ai-employees/*`(index.ts + prompt.md,并自动发现同目录 skills/ 与 tools/)。内置员工 Atlas 就是这么定义的。**这意味着 lst-* 员工可以从"数据库播种 + 硬编码人格"迁移为官方员工包结构**,人格、专属工具、专属技能全部随代码走,升级/部署可复现。

---

## 4. 差距分析 A:没用足的官方原生能力

| 官方能力 | 我们现状 | 优化方向 |
|---|---|---|
| 代码定义员工包(ai-employees/ 目录) | DB 播种 + PERSONA 硬编码 | **P0-1** 员工包化迁移 |
| SPECIFIED 员工专属工具 | 5 个业务工具全挂 GENERAL 污染全员 | **P0-1** 改 SPECIFIED 按员工绑定 |
| 技能(SKILLS.md 渐进加载) | 未定义任何自有技能 | **P0-2** 沉淀 2 个搬运领域技能 |
| 快捷任务(Edit tasks,工具子集) | TASKS 硬编码在自建接口里 | **P0-3** 迁移到原生任务 |
| 自定义工具(工作流) | 零条 ai-employee 工作流,"暂无数据" | **P0-4** 打样 1 条,打通可配置闭环 |
| 员工级模型设置 / 角色可用性 | 未配置(全员全模型、全角色可见) | **P0-5** 治理项,纯配置 |
| 原生会话(流式/工具循环/历史/审批卡) | 与自建 ask 通道并存 | **P1-6** 合并通道 |
| Atlas 式子代理转派 | Kai 只会"口头转派" | **P1-7** 绑定转派工具 |
| 工作流 LLM/员工节点 + 结构化输出 + 审批 | 未使用,优化靠逐条聊天 | **P1-8** 批量优化管道 |
| RAG 知识库(专业版+) | 关键词匹配 | **P1-9** 视授权情况二选一 |
| 技能 UI 配置 | 官方无界面(仅代码 SKILLS.md);但运行时读 aiSkills 表 | **P1-10** 自建技能管理页,写库即生效 |

---

## 5. 差距分析 B:对比 Accio Work

Accio Work(阿里国际站,2026-03 发布,1000 万+ MAU):零代码企业 AI 员工队伍。逐维对比:

| 维度 | Accio Work | 我们(NocoBase AI 员工) | 判断 |
|---|---|---|---|
| 执行范式 | 目标驱动:动态编排多 agent 并行,自主跑长链任务(30 分钟建站、68 家报价分析) | 会话驱动:单员工单轮工具调用,人在回路 | **最大代差**,但也是定位差异,不必照抄 |
| 异步长任务 | 7×24 Automations 定时任务、子代理后台跑、IM 渠道(微信/钉钉/Telegram)推送与远程指挥 | 会话同步进行,离开页面即止;有 aiWorkflowTasks 基础未用 | 可用 workflow + 通知管理补齐(P2-10) |
| 交付物 | 文件级成品:报告/Excel/PPT/主图/视频/整站/开发信 | 文本回复 + 受控写入业务字段(建议列/暂存区) | 可补"报告导出"类工具(P2-11) |
| 工具面 | 本地文件、终端、浏览器自动化、48+ 连接器、平台数据直连 | 受控白名单工具 + MCP 可扩展 | 宽一个数量级;我们胜在边界清晰。MCP 是我们的正规扩口 |
| 记忆/个性化 | Memory.md 持久记忆、技能固化与市场变现 | 员工配置 + usersAiEmployees 用户级提示词(未用) | 激活用户级记忆(P2-12) |
| 人机协作 | 默认自主、高风险审批;四级权限(自动/每次问/记住选择/拒绝) | 默认确认(ASK/ALLOW 两档)+ 业务 Submit 兜底 | 哲学相反;"记住选择"值得借鉴(P2-13) |
| 数据根基 | 阿里 10 亿商品/5000 万供应商交易数据 | 客户私域业务库(单一事实源) | 各有其长;私域准确性是我们的卖点 |

> **定位判断**:Accio Work 是通用执行平台,我们是「嵌在商家业务系统里的受控数字同事」。差异化打法:**不追全自主,把"可审计的人机协作"做成体验优势**,同时按 P2 三项吸收它的任务/记忆/交付物能力。

---

## 6. 优化路线图

14 项,按优先级分三档。改动面均已标注;**全部待批准,批准哪项做哪项。**

### P0 —— 立即可做,低风险,全部落在本插件内(约 1–2 周)

#### P0-1 员工包化迁移:lst-* 员工 + 工具改官方结构(解决问题 2)

把 5 个员工迁到 `src/ai/ai-employees/lst-*/`(index.ts + prompt.md,人格出硬编码);5 个业务工具从 GENERAL 改 **SPECIFIED**,按员工目录绑定(选品工具只给 Mira、写建议只给 Toby……)。效果:工具出现在"员工专属工具"区、不再全员共享;EMPLOYEE_TOOLS 映射真正生效;会话系统提示词变短。

- **改动面**:仅 plugin-ai-listing(tools.ts 拆分重排 + 新增员工目录 + 清理 DB 播种逻辑)
- **验收**:编辑抽屉里各员工专属工具正确分组;非搬运员工(Atlas/Viz 等)会话中不再出现搬运工具
- **风险**:已有 aiEmployees 行与代码注册的合并行为需在 staging 验证(内置员工更新时仅保留 workflowCaller-* 旧绑定)

#### P0-2 沉淀搬运领域技能(SKILLS.md × 2)

把平台规则/标题规范/违禁词方法论写成两个技能:`listing-optimization`(绑定 读取商品/写入建议/违禁词扫描)与 `compliance-check`(绑定 知识库命中/违禁词扫描)。技能出现在"技能"Tab,模型按需 getSkill 加载,方法论沉淀为代码资产——这就是 Accio"流程固化为技能"的我们版本。

- **改动面**:仅 plugin-ai-listing(新增 src/ai/skills/*/SKILLS.md)
- **验收**:技能 Tab 出现两个技能;对话中模型能触发 getSkill 并调用其绑定工具完成一次标题优化

#### P0-3 预设任务原生化(Edit tasks 取代 TASKS 硬编码)

用区块级快捷任务重建 12 个预设任务(Title/Background/默认消息/Work context/工具 Customer 子集),挂到商品列表、预览编辑、发布批次三个区块。任务级工具勾选顺带满足"按场景限制工具"的诉求。

- **改动面**:纯 UI 配置为主;后续再删自建 TASKS(归入 P1-6)
- **验收**:区块员工头像浮窗与开场白中出现任务,点击即执行且自动携带区块上下文

#### P0-4 自定义工具打样(打通"可配置"闭环)

建 1 条「AI 员工事件」工作流,如「批量违禁词整改建议」(入参:商品 ID 列表 → 循环扫描 → 汇总建议),在工具 Tab 挂给 Mira/Rena 并设为"询问"。从此"自定义工具"区不再是摆设,团队掌握"业务动作 → 员工工具"的标准通道。

- **改动面**:纯配置(工作流 + 员工工具挂载),零代码
- **验收**:"+添加工具"出现候选;会话中调用触发工作流并回传结果;权限"询问"时出现确认卡

#### P0-5 治理三件套(纯配置)

- 模型设置:5 个员工绑定专用模型(DeepSeek),避免误选高价/不可用模型;
- 角色权限:按角色收敛可用员工(运营看业务员工,开发才见开发员工);
- 数据清理:清掉 aiEmployees.skillSettings 里已删除工具(aiListingFieldSuggest)的残留引用。

### P1 —— 结构性改进(约 2–4 周)

#### P1-6 对话通道合并:退役自建 ask,统一走原生会话

jsBlock 面板全部经 assistant-bridge 打开原生抽屉;`aiListingAssistant:ask/roster` 降级为"未配模型时的演示兜底"或直接删除。收益:流式输出、历史会话、工具确认卡、审计一致性,消除两套体验。

- **改动面**:plugin-ai-listing(前端面板改造 + 服务端接口收敛)
- **风险**:依赖 P0-3 完成任务迁移,否则预设任务无处安放

#### P1-7 Kai 升级为真主管(子代理转派)

给 lst-kai 绑定 Atlas 同款 SPECIFIED 工具(dispatch-sub-agent-task / list-ai-employees / get-ai-employee),使"转派"从话术变成真实的子代理调用——这是 Accio"多 agent 协作"在官方框架内的现成实现。

- **改动面**:plugin-ai-listing(员工包内声明工具绑定);需验证子代理会话在非内置员工间的行为

#### P1-8 批量优化管道(工作流 LLM 节点 + 结构化输出 + 人工审批)

"勾选 50 个商品 → 一键批量优化标题/描述"走异步工作流:循环 LLM 节点(结构化输出写入建议列)→ AI 员工节点审批(Human decision,审批人会话里 Approve/Revise/Reject)→ 批量写建议。把最高频的重复劳动从"逐条聊天"解放出来,是对 Accio 异步执行范式的最小可行对标。

- **改动面**:工作流配置为主,可能需少量服务端动作支持批量写建议列
- **验收**:50 条商品批量跑完,建议列全部落库且有审计;审批卡可用

#### P1-9 知识库升级:关键词 → RAG(二选一)

- 方案 A(有专业版授权):接官方 RAG(PGVector + 向量存储),平台规则文档入库,员工 Knowledge base Tab 启用。
- 方案 B(无授权):保留关键词匹配,但把知识条目结构化扩充 + 在工具里加同义词/拼音容错,成本低见效快。

**需要确认授权情况后定案。**

#### P1-10 技能可配置化:自建"技能管理"页(新发现,可行)

官方 UI 虽然不提供技能编辑,但源码证实 **技能运行时完全读数据库**:`DefaultSkillsManager` 启动落库后进入 database 模式,`getSkills`/`listSkills` 直接查 `aiSkills` 表(`core/ai/src/skills-manager/index.ts:34-55`),`registerSkills` 启动后也是直接 upsert 数据库(:57-62)。因此在本插件内做一个"技能管理"设置页(CRUD aiSkills:名称/描述/正文 content/绑定工具 tools/scope),**写入即生效,无需改上游**。运营就能自己沉淀"标题优化方法论""类目合规清单"这类技能,这正是 Accio"流程固化为技能"的可配置版。

- **改动面**:仅 plugin-ai-listing(设置页 + aiSkills 资源的受控写接口)
- **注意**:每次服务重启,loader 会按名称 upsert 覆盖"代码定义"的同名技能——自定义技能必须用独立命名空间(如 `lst-` 前缀),避免与代码技能重名;绑定的工具名必须真实存在
- **验收**:页面新建技能后,员工会话系统提示词出现其摘要,getSkill 能加载正文并激活绑定工具;重启后自定义技能不丢失

### P2 —— Accio 对标项(远期,均可独立立项)

#### P2-10 后台任务 + 通知闭环

定时工作流产出「选品日报 / 发布失败摘要」,经通知管理(站内信/邮件)推送,点击回到会话继续追问。对标 Accio Automations + Channels 的最小闭环。

#### P2-11 文件级交付物

新增"导出分析报告"工具(Excel/PDF,经文件管理器存储),让 Mira 的分析从聊天气泡变成可下载、可转发的成品。

#### P2-12 用户级记忆

激活 usersAiEmployees.prompt(官方已有的每用户个性化提示词):让运营各自沉淀"我的类目、我的目标市场、我的文案偏好",员工越用越懂人。

#### P2-13 "记住选择"式渐进放权

在 ASK/ALLOW 之外增加"本会话记住我的选择"。**涉及上游 plugin-ai 改动**(确认卡与权限判定),建议以向官方提 issue/PR 的方式推进,不 fork。

---

## 7. 不做清单(Non-goals)

- **不 fork/魔改 plugin-ai** 去解锁"通用工具增删"——作用域语义是官方设计,正确姿势是 SPECIFIED + CUSTOM + 任务子集(P0-1/3/4 已覆盖同等诉求)。
- **不追全自主执行**(浏览器自动化、本地终端、无人值守写库)——与"受控、可审计"的产品定位冲突,发布动作永远由业务 Submit 触发。
- **不自建向量引擎**——RAG 要么用官方专业版,要么维持轻量关键词方案(P1-9 二选一)。
- **暂不做技能市场/多租户分发**——单实例阶段收益不足。

---

## 8. 附录:证据与文件索引

### 官方文档(docs.nocobase.com/cn/ai-employees)

features/tools(工具三分类与权限)· features/skills(技能定义与清单)· features/task(快捷任务与 Preset/Customer)· features/model-settings · features/mcp · workflow/nodes/employee/configuration 与 /approval · knowledge-base/rag · permission · configuration/admin-configuration。

AI 员工为社区版+(付费授权),AI 知识库为专业版+。

### 本地源码关键位置

| 事实 | 位置 |
|---|---|
| 员工编辑抽屉(5 Tab)与工具三分组渲染;通用工具权限开关 disabled;"+添加工具"仅列已有 CUSTOM 工具 | `plugin-ai/src/client-v2/pages/EmployeesPage.tsx`(651–871) |
| GENERAL 工具无条件注入全员;skillSettings.tools 白名单;技能懒加载剔除逻辑 | `plugin-ai/src/server/ai-employees/ai-employee.ts`(1364–1466) |
| 工作流 → CUSTOM 工具(workflowCaller-*) | `plugin-ai/src/server/tools/workflow-caller.ts`(106–129) |
| 技能加载工具 getSkill;SKILLS.md 加载器;员工包加载器 | `plugin-ai/src/ai/tools/getSkill.ts`;`core/ai/src/loader/{skills,employee}.ts`;`core/server/src/plugin.ts:214-263` |
| Atlas 的 SPECIFIED 工具绑定范式(P0-1 / P1-7 参照) | `plugin-ai/src/ai/ai-employees/atlas/index.ts`(22–37) |
| 本项目:5 工具 GENERAL 注册、EMPLOYEE_TOOLS 未生效、PERSONA/TASKS 硬编码、自建 ask 通道 | `plugin-ai-listing/src/server/assistant/{tools.ts,index.ts}` |

### Accio Work 主要来源

官方:accio.com · seller.alibaba.com/pages/accio_work · PR Newswire 发布通稿(2026-03)。媒体/评测:digitalcommerce360 · Forbes · Nikkei Asia · 36氪 · 腾讯新闻 · thesoftwarescout 等(定价各来源口径不一,引用需注明时点)。

---

*本文档不含任何已实施的代码改动;逐项批准后排期执行。*
