# AI Listing 系统优化文档 —— 对标 NocoBase 官方 Demo

> 调研日期：2026-06-30
> 调研对象：NocoBase 官方业务套件 Demo（`https://anawzxt1rddw.v11.demo.nocobase.com/admin/`）
> 对比基线：`@crossborder/plugin-ai-listing`（跨境商品搬运工作台，Phase 0–9 已交付，Phase 10 原生 AI 员工进行中）
> 调研方式：浏览器逐页点击，完整走查 Workbench / Customers / Orders / Tickets / Assets / Employees / Settings 七大模块及 AI 员工面板

---

## 0. 一句话结论

官方 Demo 的价值不在于"它是 CRM"，而在于它示范了一套**可复用的业务系统骨架与 AI 员工架构**：
模块级仪表盘 + 原生表格（彩色状态标签）+ 记录 360 抽屉 + 模块内引导页 + 主数据中心，
以及一套 **"编排者(Atlas) + 专家员工 + 右侧统一抽屉 + 数据上下文注入 + 技能/模型可选"** 的 AI 员工范式。

我们的搬运系统是垂直 SaaS，**不应照搬它的业务模块**，而应**移植它的设计模式与 AI 架构**到"搬运"这条业务主线上。下文给出 7 个方向、按优先级排序的具体优化点。

---

## 1. Demo 调研总结（我们要吸收的"做法"）

### 1.1 整体信息架构（IA）
- **顶部主导航**：Workbench（工作台/总览仪表盘）、Customers、Orders、Projects、Tickets、Assets、Employees、Settings。
- **每个模块 = 左侧二级导航 + 模块仪表盘 + 若干实体列表 + 一个 Guide(引导) 页**。例如：
  - Customers → Dashboard / Customers / Leads / Contacts / **Customers Guide**
  - Orders → Dashboard / New quotation / Quotations / Orders / Payments / Invoices / Products / **Orders Guide**
  - Tickets → Dashboard / Tickets / **Knowledge articles** / Guide
  - Assets → Dashboard / Assets / Vendors / Asset assignments / Asset returns / Asset maintenances
  - Employees → Dashboard / Employees / Onboarding / Offboarding / Leave requests / Positions
  - Settings → Customer/Ticket/Asset/Product **categories**（主数据/字典中心）
- **结论**：一个完整业务域的标准结构是 `总览仪表盘 → 实体列表(可下钻) → 引导页 → 主数据`。我们目前的 8 个页面是"线性流水线"，缺少模块化分组、引导页与主数据中心。

### 1.2 模块仪表盘（每个模块都有）
- 顶部 6–10 个 **KPI 卡片**（数字 + 一行说明），且 KPI 是**业务可执行的**，不是装饰：
  - Orders：本月报价额、本月订单额、待审批、未付款订单、**应收账龄 30-60d / 60-90d / 90d+**。
  - Tickets：待我方处理、待他方、进行中、超期、**各优先级平均解决时长**。
  - Assets：在用/闲置/维修中/报废/**保修即将到期**。
- KPI 下面是 **ECharts 图**：趋势折线 / 占比环形 / 漏斗 / 排行条形图。
- Workbench 总览还有**可操作清单卡片**："My tasks"（按到期分组 + View 按钮）、"Overdue tickets"（带 All/Urgent/Assigned to me 分段筛选 + Load more）。
- **结论**：仪表盘不只是图表，要有"待办清单 + 一键跳转"。

### 1.3 列表与记录（原生区块的标准做法）
- **原生表格**：彩色状态标签（Customer type / Industry / Level / Status 都是 Tag），工具栏含 Filter、Filter by status、批量操作（如 **Merge 合并**）、Add new。
- **记录 360 抽屉**：点开一条 Customer，右侧大抽屉，顶部 Tab：`Customer Profile / Contacts / Leads / Quotations / Orders / Projects / Tickets / Mail / History`，正文分区块（Basic / Classification / Location / Notes）+ Edit。
- **结论**：一条核心记录应有"主信息 + 所有关联数据 Tab + 变更历史"的 360 视图。

### 1.4 模块内 Guide 引导页（很值得学）
- 每个模块带一个 Guide 页，用**编号步骤卡片**（1 选择 → 2 选保留记录 → 3 核对字段 → 4 执行合并）+ 底部 **Recommended sequence 步骤条** + 黄色警示框讲清"做什么、注意什么"。
- **结论**：对中小商家做"搬运怎么用"的在线引导，比文档手册有效得多。

### 1.5 平台级能力（顶栏）
- 通知中心(bell)、**工作流任务中心(check-circle，待办 5)**、版本控制(history)、站内信(mail)、**团队/多租户切换(Team A)**、UI 高亮编辑器(highlight)。
- **结论**：审批/通知/任务都走 NocoBase Workflow + 通知中心，不要自己造。

### 1.6 AI 员工面板（重点，见第 3 章详述）
- 右下角**悬浮头像** → 打开**右侧统一抽屉**。
- 默认是 **Atlas（Team leader 编排者）**："Tell me what you need, and I'll route it to the right AI specialist and coordinate the result." → **编排者 + 专家**模式。
- 完整花名册（11 个专家 + 编排者）：Atlas(队长) / Dex(数据整理) / Ellis(邮件) / Lexi(翻译) / Vera(研究分析) / Viz(洞察分析) / Cole(NocoBase 专家) / Sales Coach(销售赋能) / Quote Assistant(报价配置) / Support Triage(客服分诊) / Project Coach(项目管理)。
- 输入框工具条：**技能/上下文(appstore-add → "Pick block" 选区块 / "Data source" 选数据源)**、附件(paper-clip)、联网(global)、**员工选择(Atlas▾)**、**模型选择(DeepSeek V4 Flash▾)**、发送。
- 抽屉头部：新会话(+)、会话信息(info)、**调试(bug，看 prompt/trace)**、全屏、关闭、历史列表(menu-unfold)。
- **多入口**：除悬浮球外，列表工具栏、记录详情右上角都有同一个 AI 头像，可带当前上下文唤起。

---

## 2. 现状 vs Demo —— 差距对照表

| 维度 | 官方 Demo 做法 | 我们现状 | 差距/动作 |
|---|---|---|---|
| 信息架构 | 模块 = 仪表盘+列表+引导+主数据 | 8 个线性页面(Dashboard/Capture/Process/Preview/Publish/Products/Rules/History) | 重排为分组式二级导航 + 增 Guide + 主数据中心 (O3) |
| 仪表盘 | 真实聚合 KPI + ECharts + 可操作清单 | Dashboard 为 mock 结构 | 接真实聚合 + 加"待办清单"卡片 (O1) |
| 列表视觉 | 原生表格 + 彩色状态 Tag + 批量操作 | jsBlock 自绘，视觉不统一 | 状态全部 Tag 化 + 工具栏标准化 (O2) |
| 记录视图 | 360 抽屉(关联 Tab + History) | 无统一记录 360 | 商品 360 抽屉(源/SKU/媒体/处理/发布/审计 Tab) (O4) |
| 引导 | 模块内 Guide 步骤卡 | 无 | 加"搬运三步"引导页 (O5) |
| 主数据 | Settings 集中管理 categories | 分散 | Settings 集中：平台账号/类目映射/规则/运费模板 (O3) |
| 工作流 | Workflow 任务中心 + 审批 | 设计文档列为 future | 接 Workflow：捕获后自动处理/复核审批/发布门禁/失败重试 (O6) |
| **AI 编排** | **Atlas 编排者路由专家** | Kai 充当 dispatcher(扁平 5 员工) | **正式化"搬运主管"编排者** (O7) |
| **AI 上下文** | Pick block / Data source 显式注入 | AssistantBridge 传 {title,content} | **显式上下文注入(选记录/选清单)** (O7) |
| **AI 模型/技能** | 每会话可选模型 + 技能(appstore) | 仅 mock，无模型/技能选择 | 加模型选择 + 技能/工具框架 (O7) |
| **AI 会话管理** | 历史/新会话/调试/全屏 | 待补 | 复用 plugin-ai 原生抽屉即得 (O7) |
| AI 多入口 | 悬浮球 + 列表 + 记录头 | 设计中(避头像/悬浮) | 三入口落地 (O7) |
| 平台头部 | 通知/任务/版本/多租户 | — | 接通知中心 + 任务中心 (O6) |

> 正向确认：我们 Phase 10 v2 选择"保留 jsBlock + 用 AssistantBridge 唤起 plugin-ai 原生右侧抽屉"的方向，**与 Demo 的统一右抽屉范式一致**，方向正确，继续推进。

---

## 3. 【核心】AI 员工模块优化设计

这是用户最关心的部分。把 Demo 的 AI 范式落到"搬运"业务上。

### 3.1 采用"编排者 + 专家"双层架构（O7-A）
现状：Mira/Rena/Toby/Lena/Kai 五个扁平员工，Kai 当 dispatcher。
优化：把 **Kai 正式升级为"搬运主管 Atlas 型编排者"**，统一开场白与路由职责：
> "告诉我你要做什么，我来分配给合适的搬运专家并汇总结果。"

编排者职责：
1. 意图识别 → 路由到专家（选品分析→Mira，合规研究→Rena，信息整理→Toby，发布→Lena）。
2. 跨专家任务编排（如"把这批商品质检后整理标题再做发布预检"=Mira→Toby→Lena 串联）。
3. 汇总各专家结果，给用户单一结论。

### 3.2 花名册映射（对齐搬运业务主线）

| 员工 | 角色 | 对应业务阶段 | 预设任务（快捷指令） | 权限红线 |
|---|---|---|---|---|
| **Kai**(主管) | 搬运编排者 | 全局悬浮 | 路由 / 帮助 / 跨阶段编排 | 用户权限范围内 |
| **Mira** | 选品分析师 | 商品库 / 复核列表 | 质量分 / 成功率预测 / 风险扫描 | 只读分析 |
| **Rena** | 合规与市场研究员 | 复核详情 | 合规检查 / 卖点提炼 / 竞品市场 | 只读(未来接 RAG 知识库) |
| **Toby** | 商品信息整理员 | 复核表单 | 优化标题 / 生成描述 / 补全属性 | **仅填表单(用户 Submit 才入库)** |
| **Lena** | 发布助理 | 发布 / 历史 | 发布预检 / 失败解释 / 重试建议 | 只读(不直接真发布) |

> 可选扩展（对标 Demo 的 Support Triage / Quote Assistant）：未来若上客服或定价，再增"客服分诊""定价助手"，但**不要为凑数量而加**（遵循 AGENTS：避免过度抽象）。

### 3.3 数据上下文显式注入（O7-B，Demo 最强的一点）
Demo 的 "Pick block / Data source" 让 AI **被当前页面真实数据喂养**。落地：
- 在 AssistantBridge 增加上下文附加能力：
  - **选当前记录**：在商品库/复核详情唤起 Mira/Toby 时，把"当前商品(含源标题/属性/SKU/媒体/风险标记)"作为结构化上下文注入。
  - **选当前清单**：在商品库表格勾选 N 条 → Mira 做"批量质量分/风险扫描"。
- 约定上下文协议：`window.aiListingOpenAssistant(username, { scope:'record'|'selection'|'list', resource:'aiListingProducts', ids:[...], snapshot:{...} })`。
- 服务端 `aiListingAssistant:ask` 接收上下文 → 拼进 prompt（**只读快照，绝不回写**）。

### 3.4 技能/工具框架（O7-C）
对标 appstore-add。给员工配"技能"，技能 = 受控的服务端能力，**返回结构化结果**：
- Mira：`quality.score`（返回 {分数, 维度明细, 建议}）、`risk.scan`（返回 {风险项[], 等级}）。
- Toby：`title.optimize`、`desc.generate`、`attrs.fill`（**返回建议值，写入表单字段，不入库**）。
- Lena：`publish.precheck`（复用已有 `aiListingPublish:precheck`，返回 {blocked, issues[]}）。
- 技能调用一律走 `aiListing*` + 写 `aiListingAuditLogs`(actorType='ai_employee')。

### 3.5 模型选择与成本控制（O7-D）
- 输入框加模型下拉（对标 DeepSeek V4 Flash）：让用户在"快/省"与"强/贵"间选择。
- 默认走 `app.aiManager` 配置的模型；未配 Key 时回退 mock（现状已具备）。
- **API Key 永远服务端，不进前端/日志/审计**（现有红线，保持）。

### 3.6 会话管理与可观测（O7-E）
直接复用 plugin-ai 原生抽屉即可获得：新会话、历史列表、会话信息、**调试(bug)看 prompt/trace**、全屏。
我们额外补：每次 AI 交互写 `aiListingAuditLogs`，`traceId` 串联，便于复盘。

### 3.7 三入口落地（O7-F）
- **悬浮球(全局)** → Kai 编排者。
- **列表工具栏头像** → 商品库/复核列表 → Mira（带勾选上下文）。
- **记录详情头部头像** → 复核详情/表单 → Toby/Rena（带当前记录上下文）。
- 视觉与交互对齐 Demo：同一头像组件、同一右抽屉，避免每页自造面板。

### 3.8 与工作流联动（O7-G，进阶）
对标 Demo 任务中心：把 AI 员工做成 **Workflow 节点**：
- 捕获成功 → 自动触发 Toby 的"标题/属性整理"草稿（人工 Submit 前不入库）。
- 进入复核 → Mira 自动产出"质量分/风险"附在记录上。
- AI 产出的"待人工确认"项进入**任务中心**，对标 Demo 的 check-circle 待办。

---

## 4. UI / 视觉优化（O2）

1. **状态全部 Tag 化**：商品 status(13 态)、reviewStatus、发布 result、账号 authStatus 用彩色 Tag（语义色：进行中蓝、成功绿、失败红、阻塞橙、归档灰）。
2. **工具栏标准化**：列表统一 `Filter + 状态快筛 + 批量操作 + 主操作(右上)`，与 Demo 一致。
3. **仪表盘卡片化**：KPI 卡（数字 + 一行说明）+ 下方 ECharts，间距/圆角/阴影对齐 Demo（Antd v5 卡片）。
4. **空态与引导**：列表空态给"去捕获"按钮；错误态复用现有 `ListingPageErrorBoundary` + traceId（已具备，保持）。
5. **一致的头像与抽屉**：AI 入口统一组件，宽度/头部按钮(新会话/调试/全屏/关闭)对齐 Demo。

---

## 5. 功能设计优化（O1/O3/O4/O5）

- **O1 真实仪表盘**：`aiListingDashboard:summary` 从 mock 改真实聚合，KPI 建议：今日新捕获、待处理草稿、待复核、发布成功率(7d)、**发布失败待重试**、高风险商品数；并加"待办清单"卡片（待复核 Top / 失败待重试 Top，一键跳转）。
- **O3 二级导航 + 主数据中心**：把 8 页重排为分组：`总览 / 捕获 / 处理 / 复核 / 发布 / 商品库 / 历史`，并新增 **Settings**：平台账号、类目映射、处理规则、运费模板（对标 Demo 的 categories 主数据）。
- **O4 商品 360 抽屉**：一条商品打开抽屉，Tab：`概览 / 源信息 / SKU / 媒体 / 处理记录 / 发布记录 / 审计日志`（数据均已存在：products/skus/mediaAssets/taskSteps/publishRecords/auditLogs）。
- **O5 搬运引导页**：编号步骤卡："1 粘贴链接捕获 → 2 应用规则处理 → 3 复核与改写 → 4 预检发布"，底部步骤条 + 注意事项黄框。

---

## 6. 工作流优化（O6）

接 NocoBase Workflow（设计文档原列 future，建议至少落地以下 4 条）：
1. **捕获后自动处理**：capture 成功 → 触发默认规则 process（生成 processed 字段草稿）。
2. **复核审批流**：reviewed 前需指定角色审批（对标 Demo Orders 的 Pending approval）。
3. **发布门禁**：precheck blocked → 阻断发布并通知；通过 → 入发布队列。
4. **失败重试与通知**：publish/process 失败 → 通知中心 + 任务中心待办 + 一键重试。
> 全部走 NocoBase Workflow + 通知中心，不自造审批/通知层（遵循 AGENTS 的"不引入超出需求的抽象"）。

---

## 7. 落地路线图（按 ROI 排序）

| 阶段 | 优化项 | 价值 | 成本 | 依赖 |
|---|---|---|---|---|
| **P10 收尾(当前)** | O7-A 编排者 / O7-B 上下文注入 / O7-F 三入口 | AI 体验对标 Demo | 中 | plugin-ai 抽屉(已接) |
| **P10.1** | O7-C 技能框架 / O7-D 模型选择 / O7-E 审计可观测 | AI 产出结构化、可控成本 | 中 | LLM Key |
| **P11** | O1 真实仪表盘 / O2 状态 Tag 化 | 总览可用、视觉统一 | 低-中 | 聚合 API |
| **P11** | O4 商品 360 抽屉 / O5 引导页 | 复核效率、上手成本 | 中 | 现有数据 |
| **P12** | O3 导航重排 + 主数据中心 | IA 清晰、可维护 | 中 | — |
| **P12** | O6 工作流 + 通知/任务中心 | 自动化、闭环 | 中-高 | Workflow |

---

## 8. 风险与红线（保持现有约束）

1. AI **只读或填表单**，用户 Submit 才入库；已复核(approved)商品锁关键字段，禁止 AI 改写。
2. AI **不直接写最终字段 / 不删除 / 不真实发布**；写库类一律走 `aiListing*` 工具 + 审计。
3. **API Key 仅服务端**，不进前端、日志、审计、assistant 参数。
4. 所有操作写 `aiListingTaskSteps` / `aiListingAuditLogs` + `traceId`，保留可复盘能力。
5. **不照搬 Demo 的业务模块**（CRM/HR/ITAM 与搬运无关），只移植设计模式与 AI 架构；**不为凑数量加 AI 员工**。

---

## 附：本次完整走查清单（均已逐页点击确认）
- ✅ Workbench 总览仪表盘（KPI + 趋势/占比图 + My tasks + Overdue tickets 可操作清单）
- ✅ AI 员工面板（Atlas 编排者 + 11 专家 + 模型/技能/上下文/会话管理/调试/全屏）
- ✅ Customers（Dashboard / 列表彩色 Tag / Merge 批量 / 客户 360 抽屉 / Guide 引导）
- ✅ Orders（报价→订单→收款→发票→商品 全链路 + 应收账龄 KPI）
- ✅ Tickets（SLA KPI / 优先级解决时长 / Knowledge articles 知识库）
- ✅ Assets（采购→分配→归还→维修→报废 全生命周期 + 保修预警）
- ✅ Employees（入/离职 / 请假 / 岗位 HR 全流程）
- ✅ Settings（Customer/Ticket/Asset/Product categories 主数据中心）
