# 设计文档：AI 员工集成（对齐官方 demo · jsBlock 内嵌原生 AI）

> 版本：v2（2026-06-30 重写）。取代 v1「原生页重构」方案。
> 触发：v1 把核心页改成原生区块 + 原生 `aiEmployee` 动作，实测「原生页 + AI」观感不佳、且强依赖把 code-first 集合暴露给 UI（db2cm 丢 interface、authoring 慢且易 fetch failed）。
> 产品负责人定调：**去掉原生页，保留现有 jsBlock 页，把「和官方 demo 一样的原生 AI 员工」集成进现有页**。
> 关联：`nocobase-ai-listing-prd-dev-design.md`（§6 AI 员工 / §7.7 权限 / §7.9 脱敏）、交付计划 §14（Phase 10 已据本文件重写）。

---

## 0. v1 → v2 变更摘要（务必先读）

| 项 | v1（废弃） | v2（本文件） |
|---|---|---|
| 页面 | 用原生 table/details/form **重建** 商品库/预览编辑/规则 | **保留现有 jsBlock 页**，不重建 |
| 集合暴露 | `uiManageable:true` + db2cm 把 4 集合塞进 UI 数据源 | **不暴露**（已回滚）；AI 读数走「上下文注入」或「只读查询 action」 |
| AI 载体 | 原生区块的 `type:"aiEmployee"` 动作 | jsBlock 内嵌 AI 面板（复刻原生右侧抽屉）+ 原生全局悬浮助手 |
| AI 模型 | plugin-ai 模型 | **同左：plugin-ai 同一套模型与员工**（DeepSeek 等，产品负责人给 Key） |
| 已回滚 | — | 原生页 `b7r6f5bx4e1`、4 集合 `uiManageable`、db2cm 元数据（60 fields+4 collections）全部删除，**数据零丢失**(17/26/33/3) |
| 保留 | — | 5 个专属员工 `lst-mira/rena/toby/lena/kai`（已建，沿用） |

---

## 1. 官方 demo 调研结论（2026-06-30 实地点击）

Demo：`https://anawzxt1rddw.v11.demo.nocobase.com`（admin@nocobase.com/admin123）。模块：Workbench / Customers / Orders / Projects / Tickets / Assets / Employees / Settings。

### 1.1 整体系统设计（布局/功能）
- **顶部导航 = 业务模块**；每个模块点进去是**左侧子菜单**，结构高度一致：`Dashboard(KPI 卡 + 趋势折线 + 分布饼图/环图 + 排行) → 若干数据列表页 → 一个 Guide 引导页`。
- 列表页 = 原生 Table：彩色状态 Tag、`Filter`/`Filter by status`、刷新、删除、`Merge`、`Add new`、行级 查看/编辑/删除。视觉干净、信息密度高。
- 工作台 Dashboard 用 KPI 数字卡 + ECharts 折线/饼图，指标卡顶部一行、图表两到三列。

### 1.2 AI 员工设计（**本项目重点**）
**A. 配置后台**（Settings → AI employees），Tab：`AI employees / LLM services / MCP settings / Knowledge base / Vector store / Data source / Settings`。
- 员工列表：avatar、username、nickname、position、enabled、Edit/Delete；`Business / Developer` 过滤；`+ New AI employee`。
- 单员工配置 Tab：`Profile`（username/nickname/position/avatar 选择器/bio/greeting）、`Role setting`（system prompt）、`Model settings`（绑定哪个 LLM）、`Skills`、`Tools`（General 共享工具 + Custom 工作流工具，可 `+ Add tool`）、`Knowledge Base`（RAG）。
- **内置通用员工** atlas(Team leader)/dex(Data organizer)/ellis(Email)/lexi(Translator)/vera(Research analyst)/viz(Insights analyst)/cole(NocoBase expert)；**外加业务专属员工（带前缀）** `demov2-sales-coach / demov2-quote-builder / demov2-support-triage / demov2-project-coach`。
  - 👉 **印证我们的做法**：官方也是「**新建带前缀的领域专属员工**」绑到各业务模块，与我们 `lst-` 前缀方案一致。
  - 例：`demov2-quote-builder` 昵称 Quote Assistant、职位「Quotation configuration specialist」、bio「Helps fill quotations: looks up product prices, suggests accessories, references past deals…」、greeting 任务式（"Hi, I'm Quote Assistant. Call me on a new quotation and I can: …"）。

**B. UI 上的三种入口**
1. **区块级 AI 按钮**：数据区块右上工具栏的**员工头像按钮**（紧挨 `Add new`）。点击 → 打开右侧 AI 抽屉，**预绑定该员工**。
2. **右侧 AI 抽屉（核心交互）**：宽约 420px，从右侧推开正文。含：员工 greeting；**预设任务按钮**（如 Customers 列表 Viz 的 `New vs returning trend / Customer segmentation / Owner workload check`）；**上下文 chip**（自动挂当前区块，如 `⊞ Table: Main > Customers ×`）；消息流；底部输入条（加上下文、附件、联网、**员工选择器**、**模型选择器 DeepSeek V4**、发送）。
3. **全局悬浮助手**：右下角头像按钮，**Atlas 调度员**（"Tell me what you need, and I'll route it to the right AI specialist"），可切换员工/模型，全 app 可用。

**C. AI 交互与输出**
- 点预设任务 = 发一条带上下文的 prompt；也可自由提问。
- AI **带工具**：General tools（含查数据/`dataQuery`）+ Custom tools（工作流）。Viz 实测会**多步推理**（"Thinking in progress" 可折叠）、**调用查询工具**（"Query data ✅✅✅"）、按关系路径 join。
- **输出**：流式 markdown（标题/加粗/列表/emoji）、可折叠思考、工具步骤、**内联生成 ECharts 图**、结尾给「Recommended Drills」可执行行动项。专业、像分析报告而非聊天堆叠。
- 模型默认 DeepSeek V4，可在输入条每次切换。

---

## 2. 我们系统的优化点（基于 demo）

| # | 优化点 | 现状 | 目标（对齐 demo） |
|---|---|---|---|
| O1 | **工作台 Dashboard** | jsBlock mock KPI | KPI 卡一行 + 趋势折线 + 状态分布饼图（抓取/处理/发布/审核），数据接真实聚合 |
| O2 | **列表视觉** | jsBlock 表格已不错 | 对齐：彩色状态 Tag、顶部筛选条、右上操作区，密度与留白对齐 demo |
| O3 | **AI 员工三入口** | 仅自定义 mock 按钮 | ① 区块级头像按钮 ② 右侧 AI 抽屉（greeting+任务+上下文+对话）③ 全局悬浮助手（Kai 调度） |
| O4 | **AI 输出质量** | 确定性 mock 文本 | 真模型(DeepSeek)流式 markdown + 结构化建议 + （进阶）内联图表 |
| O5 | **AI 读数据** | — | 上下文注入（jsBlock 当前数据）+ 只读查询 action；不开放写库 |
| O6 | **领域员工矩阵** | 5 员工已建 | 绑定到对应页（见 §4），greeting/任务式 prompt 对齐 demo 风格 |
| O7 | **知识库（可选）** | — | 平台规则/类目/禁售词入 Knowledge base，供 Rena/Lena 命中 |
| O8 | **Guide 引导页（可选）** | — | 每模块加一个「使用指引」页，降低上手成本（demo 每模块都有） |

---

## 3. 架构决策（v2）

### 3.1 核心原则
1. **不重建原生页**：商品库/预览编辑/信息处理/规则/发布 等**全部保留现有 jsBlock**。
2. **集成「和原生一样」的 AI**：复用 **plugin-ai 同一套员工与模型**（不另造模型层）。两条腿：
   - **全局悬浮助手（原生，零改造）**：plugin-ai 自带，开启后全 app 可用，调度员设为 `lst-kai`。覆盖「全局问答 + 转派」。
   - **区块级 AI（jsBlock 内嵌面板）**：在 jsBlock 内渲染一个**复刻原生右侧抽屉**的 AI 面板（员工头像按钮 → 抽屉：greeting + 预设任务 + 上下文 chip + 流式结果），点击调用**我们的只读 AI 服务 action**，该 action 内部用 `app.aiManager` 调 plugin-ai 已配置的同一模型；**未配模型时确定性 mock 兜底**。
3. **AI 读数据**：不暴露集合给 UI。AI 上下文来自两处：① jsBlock 当前已加载的数据（随 action 入参传入）；② 我们提供的**只读查询 action**（如 `aiListingLibrary:list`）。AI **绝不写库**。

### 3.2 为什么这样（而非纯原生 aiEmployee 动作）
- 原生 `aiEmployee` 动作必须挂在原生区块上 → 要暴露集合 → db2cm 丢 interface + authoring 不稳 + 观感差。已验证不划算。
- jsBlock 内嵌面板：UI 完全可控（贴合 demo 抽屉），又能复用 plugin-ai 的真实模型与员工人格 →「**功能和原生差不多、AI 和原生一样**」。
- 全局悬浮助手是 plugin-ai app 级组件，与页面类型无关，jsBlock 页同样浮现 → 直接拿来用。

### 3.2bis 接入 plugin-ai **原生 AI 面板**（首选目标 · 已验证可行 + 踩坑记录）

> 产品负责人要求：jsBlock 页的「AI 员工」按钮要打开**与官方 demo 一模一样的原生右侧面板**（DeepSeek 模型选择器、上下文 chip、流式对话、会话历史），而不是我们自建的 Drawer。**结论：支持，做一个适配器即可。** 自建 Drawer（§3.4）降级为「原生未就绪」兜底。

**可行性依据（已查证）**
- `@nocobase/plugin-ai/client-v2` **已 export**：`useChatBoxStore` / `useChatBoxActions`(含 `triggerTask`) / `useChatMessagesStore`(含 `addContextItems`) / `useAIConfigRepository`(取员工) / `avatars`(头像 dataURI) / `AIEmployeeProfileCard`。
- **现成范例**：官方 `packages/plugins/@nocobase/plugin-data-visualization/src/client-v2/flow/components/DaraButton.tsx`——在自定义组件里 `triggerTask({ aiEmployee, tasks })` 即打开原生右侧抽屉；`addContextItems({type,uid,title,content})` 挂上下文；`tasks[].message.{user,system,workContext}`、`autoSend:false`。
- chat-box 是 **zustand store**（`create`+`createSelectors`），其 setter（`setOpen/setCurrentEmployee/setModel`、`triggerTask`）**可在 React 外调用**。
- jsBlock 沙箱**可访问 `window`**（`flow-engine/src/flowContext.ts` 的 `browserGlobals.window=window`）→ 可用 window 作为「jsBlock → 原生」桥。

**适配器实现（3 件套）**
1. **client-v2 bridge 组件** `src/client-v2/components/AssistantBridge.tsx`：`import { useAIConfigRepository, useChatBoxActions } from '@nocobase/plugin-ai/client-v2'`；用 ref 持有最新 `employees/triggerTask`；`useEffect` 在 `window.aiListingOpenAssistant(username, {title,content})` 暴露一个稳定函数——按 username 取员工对象、组该员工的 `tasks[]`（user 末尾拼接「当前页只读上下文」）、调 `triggerTask({aiEmployee, tasks})` 打开原生面板。渲染 `null`。
2. **jsBlock 按钮**：`onClick` 调 `window.aiListingOpenAssistant('lst-mira', { title:'商品库', content: JSON.stringify(当前页只读数据) })`；返回 false/异常时回退自建 Drawer（§3.4）。
3. **package.json**：加 `@nocobase/plugin-ai` 到 peerDependencies（与 data-visualization 一致）。

**⚠️ 踩坑（务必避开）— 2026-06-30 实测**
- **不要用 `this.app.addProvider(AssistantBridge)` 在最外层全局挂载**：它把 bridge 包在 **plugin-ai 的 React context 之外**，`useAIConfigRepository/useChatBoxActions` 取不到 context 直接抛错 → **整个 client app 白屏崩溃**（工作台/商品库全部 `Loading...` 不出）。已 revert 恢复。
- **正确做法**：① bridge 必须渲染在 **plugin-ai providers 之内**（参 DaraButton 挂在原生容器内的位置，或确认我们的 provider 在 plugin-ai context 内层再挂）；② **务必用 ErrorBoundary 包住 bridge**，`getDerivedStateFromError` 渲染 `null`，保证「即使拿不到 AI context 也只静默降级、永不崩 app」；③ bridge 失败时 jsBlock 自动回退自建 Drawer。

**硬前提（与自建面板相同）**
- 原生面板要**真聊天**必须有配置好的 LLM 模型：当前 `llmServices=0`，面板能打开但发不出消息。需在 `设置 → AI employees → LLM services` 配 provider+model（demo 用 DeepSeek）并给 5 员工 `Model settings` 绑定（步骤②，待 API Key）。

**取舍**：原生面板 = 视觉/交互 100% 对齐 demo、复用原生流式/工具/会话；代价是依赖 plugin-ai 内部 export 与正确挂载点。自建 Drawer（§3.4）= 完全可控、可离线 mock，但观感不如原生。**首选原生面板，自建 Drawer 兜底**。

### 3.3 AI 服务层（服务端，新增）
`src/server/assistant/index.ts` 定义 `aiListingAssistant` 资源：
- `roster`：返回 5 员工（username/nickname/position/avatar 数据URI/greeting/tasks-by-page）供 jsBlock 渲染面板。
- `ask`：入参 `{ username, taskKey?, prompt?, context }` →
  1. 读员工 `about`(role prompt) + 该 task 的 system/user 模板；
  2. 组 messages：system = 员工 about + 安全铁律；user = 任务提示 + 序列化 context（只含本页只读数据）；
  3. **有模型**（`llmServices` 有配置）→ `app.aiManager` 取 provider/model 调用（流式或一次性）；**无模型** → 按 (员工,taskKey,context) 返回确定性 mock；
  4. 返回 `{ ok, data:{ text, suggestions?, mock, employee }, traceId }`。**只读**，绝不写业务字段。
  - Toby「填表」：返回 `suggestions`（field→value），由 jsBlock 填进输入框，用户 Submit 才存（沿用 Phase 7 既有受控 saveFinal + 审计）。
  - 每次调用写 `aiListingAuditLogs`（actorType=ai_employee，action `ai.assist`，记 employee/taskKey/traceId，**不记密钥/不记模型 Key**）。
- 安全：`aiManager` 用的 `llmServices` 配置里的 apiKey 只在服务端；assistant action 的入参/出参/日志**绝不含 Key**。

### 3.4 jsBlock AI 面板组件（前端，新增可复用片段）
- 头像按钮（员工 avatar 数据URI）置于 jsBlock 卡片右上。
- 点击 → antd `Drawer`（右侧，width 420，mask=false 贴合原生「推开」观感）。
- Drawer 内：员工头部（头像+昵称+职位）、greeting、**预设任务按钮组**、上下文摘要 chip（如「当前列表 N 条 / 当前商品 #id」）、消息区（渲染 markdown：用 `ctx.libs` 里可用的渲染；mock/真模型都走同一渲染）、底部输入 + 发送。
- 调 `ctx.request('aiListingAssistant:ask', {...})`，loading/错误走统一友好提示（errorCode+traceId+下一步）。
- 复用：抽成一个 `renderAssistant(ctx, { employee, tasks, getContext, onAdopt })` 函数，各页传不同 employee/tasks/context。

---

## 4. AI 员工矩阵与页面绑定（v2）

| 员工 | username | 职位 | 绑定页(jsBlock) | 入口 | 预设任务 | 权限 |
|---|---|---|---|---|---|---|
| 选品参谋 Mira | `lst-mira` | 选品分析师 | 商品库 / 预览编辑列表 | 区块头像 | 选品质量、批次成功率、风险词扫描 | 只读 |
| 合规向导 Rena | `lst-rena` | 合规与市场研究员 | 预览编辑·商品详情 | 区块头像 | 平台合规/类目规则、卖点研究、目标市场 | 只读（可接知识库） |
| 文案管家 Toby | `lst-toby` | 商品信息整理员 | 预览编辑·编辑表单 | 区块头像 | 优化标题/生成描述/补全参数 → **填表不入库** | 填表（Submit 才存） |
| 发布助理 Lena | `lst-lena` | 发布助理 | 商品发布 / 发布记录 | 区块头像 | 发布前检查、失败解释、重试建议 | 只读（不触发真实发布） |
| 搬运主管 Kai | `lst-kai` | 工作台主管 | 全局悬浮助手 | 右下角 | 自由问答 + 转派 Mira/Rena/Toby/Lena | 跟随用户权限 |

> 员工已建（avatar/bio/about/greeting 已写入，`modelSettings.enabled=false`）。本阶段补：每员工 greeting/task 文案对齐 demo 风格；模型在步骤②绑定。

---

## 5. 安全铁律（贯穿，不可破）

1. AI **只做**：只读分析/研究、或把建议**填进表单输入框**（用户 Submit 才入库）。
2. AI **绝不**：直接写最终字段、删除、真实发布。需写库的建议走既有受控 `aiListing*` suggestion 工具（只写 `*Processed` + 审计）。
3. 审核通过(`reviewed`)后关键字段锁定，AI 写入被拒（沿用 Phase 7）。
4. 所有 AI 字段变化与每次 AI 调用写 `aiListingAuditLogs`（actorType=ai_employee）。
5. **模型 API Key 只在服务端 `llmServices`**，绝不进日志/审计/前端/assistant 出入参。

---

## 6. Phase 10 实施子步骤（v2，可据此重写代码）

> 顺序可分轮交付；②依赖产品负责人 API Key。

1. **AI 服务层**：`src/server/assistant/index.ts`（`aiListingAssistant:roster/ask`）+ 接 `app.aiManager`（真模型）+ 确定性 mock 兜底 + 审计 + 安全脱敏。
2. **接入真实 LLM**：用 API Key 在 `Settings → AI employees → LLM services` 配 provider(DeepSeek/通义/OpenAI/Claude)+model；给 5 员工 `Model settings` 绑该模型；保留 mock 兜底。
3. **jsBlock AI 面板组件**：可复用 `renderAssistant(...)`（头像按钮 + 右侧 Drawer + 任务 + 上下文 + 流式结果 + 友好错误）。
4. **各页接入**：商品库(Mira)、预览编辑列表(Mira)+详情(Rena)+编辑表单(Toby 填表)、发布/发布记录(Lena)。
5. **全局悬浮助手**：开启 plugin-ai app 级助手，调度员 `lst-kai`。
6. **（可选）知识库**：平台规则/类目/禁售词入 Knowledge base，绑 Rena/Lena。
7. **（可选）系统优化**：工作台真实聚合 + ECharts（O1）、各模块 Guide 页（O8）。

---

## 7. 验收标准（v2）
- 现有 jsBlock 页不动、数据零丢失；无原生页残留、`collections:list` 干净（仅 users/roles）。
- 每个目标页有 AI 头像入口 → 右侧抽屉（greeting+预设任务+上下文+对话），观感贴近 demo。
- 配好模型后，员工基于当前页上下文真实生成（DeepSeek 等）；未配时 mock 兜底不报错。
- Toby 填表为「填字段不入库」，Submit 才保存并审计；审核锁定后 AI 写入被拒。
- 全局悬浮助手可用，Kai 可转派。
- AI 调用失败返回 errorCode+friendlyMessage+traceId，审计可查；**Key 不出现在任何日志/审计/前端**。

## 8. 不在范围
- 真实商品发布（Phase 8 已 mock）。
- 媒体真实处理（仍占位）。
- 把业务集合暴露给 UI 做原生页（v1 方案，已废弃）。

## 9. 风险与缓解
| 风险 | 缓解 |
|---|---|
| jsBlock 沙箱内能否优雅渲染 markdown/流式 | 优先一次性返回 + antd Typography 渲染；流式作为增强，不行则降级整段返回 |
| 无模型时观感「假」 | mock 输出结构化、标注「示例(未接模型)」，接 Key 后无缝切真 |
| AI 越权写库 | 只读或填表不入库；写库走受控工具+审计；审核锁定 |
| 模型成本/限流 | 任务非自动发送（点按触发）；可选小模型；mock 兜底 |
| 密钥泄露 | Key 仅服务端 llmServices；脱敏铁律 §5.5 |
