# NocoBase 官方 Demo 设计参考(v11 业务套件)

> 实地考察记录:2026-07-03,逐模块浏览 https://a5f70hvyraen.v11.demo.nocobase.com/admin/(admin@nocobase.com / admin123)。
> 目的:为「AI 商品搬运工具」的页面设计提供对标范式。截图存于会话 scratchpad `demo/` 目录(workbench-top/bottom、orders-1/list/detail、projects-dash、tickets-dash、customers-list/detail)。

## 1. 全局信息架构

- **顶部水平导航 = 业务模块**:Workbench / Customers / Orders / Projects / Tickets / Assets / Employees / Settings。每个模块是一个独立业务域。
- **模块内左侧边栏固定三段式**:
  1. `Dashboard`(模块仪表板,永远第一项);
  2. 业务实体页(如 Orders 模块:New quotation / Quotations / Orders / Payments / Invoices / Products);
  3. `<模块> Guide`(使用指南,永远最后一项)。
- 对照我们:「AI 商品搬运工具」是单模块多页面,当前结构(工作台→抓取→处理→预览→发布→商品库→规则→记录→连接)已符合"流程即导航";可补一个「使用指南」页收尾。

## 2. 仪表板设计语言(所有模块高度一致)

### 2.1 KPI 指标卡
- 结构:**灰色小标题 + 特大数字(可带单位后缀)+ 一行灰色业务口径说明**。说明句是点睛之笔——每个数字都能被新用户读懂。
  - 例:`Open tasks 138 — Active project tasks.`;`Overdue 90d+ $15,699,360 — Unpaid value aging beyond 90 days.`
- 指标选取非常"业务":
  - Workbench(跨模块汇总):Open tasks / Due today / Overdue tickets / Follow-up customers / Order $ this month / Leave days this month;
  - Orders:本月报价额、本月订单额、待审批数、已接受报价数、未回款订单数、**应收账龄分桶(30-60d / 60-90d / 90d+)**;
  - Tickets:总量、Waiting on us / Waiting on others(责任方视角)、进行中、**超 SLA 数**、本月解决数、**按优先级的平均解决天数**;
  - Projects:项目总数/进行中/延期/本月完成 + 任务四态(in progress / to do / pending review / due today)。
- 每行 4 张,超过一行就换行(2×4 常见)。

### 2.2 图表区(ECharts 风格)
- **趋势折线**:平滑曲线 + 淡色面积填充 + 圆点标记;按月粒度;金额类 y 轴直接写千分位。
- **分布图**:实心饼(状态分布)与环形 donut(资产/任务状态)混用;标签外置 `name %`。
- **横向条形**:排名(客户订单金额 Top N)与优先级分布。
- **人员柱状**:Task owner workload / Owner ticket workload——按人聚合的工作量,柱顶标数值。
- 布局:一行 3 张卡(lg=8/8/8 或 10/8/6),高度约 240–300px。

### 2.3 行动区(仪表板不只是看,还能干活)
- **My tasks**:个人待办卡片列表,「按截止时间分组」(Later/Today…),卡片=标题+所属项目+优先级 Tag+状态 Tag+Due 日期+右侧 `View`;卡右上角计数徽标。
- **Overdue tickets**:标签页过滤(All / Urgent only / Assigned to me)+ 卡片(标题+客户·负责人+优先级+状态+**`134d late` 逾期天数 Tag**+Due 日期+View)+ 底部 `Load more`。
- 精髓:仪表板每个条目都带 **View 直达入口**,数字可下钻。

## 3. 列表页范式(Orders / Customers 一致)

- 左上 `Filter` 按钮(复合筛选);右上工具条:**快捷状态下拉(Filter by status)+ 刷新 + 删除 + 特殊批量操作(如 Merge)+ `+ Add new` + AI 员工头像**。
- 列设计:单据号/名称为**蓝色链接**(进详情);状态类字段全部彩色 Tag,一行可并存多个独立状态列(订单状态/付款状态/发货状态/币种各一列各自配色)。
- **表格底部汇总条(非常值得抄)**:`All [60 rows] [Order value: $134.76M] Avg $2.25M`,后面跟**按状态计数的 chips**(confirmed 18 / draft 10 / pending 10 / delivering 9 / completed 8 / cancelled 3 / void 2;Payment: paid 36 / unpaid 18 / partial 6)。一眼掌握全表盘面,还兼当图例。
- 分页:右下 `Total 31 items` + 页码 + 每页条数。

## 4. 详情页范式

### 4.1 订单详情(流程型对象)——最值得借鉴
- **页级 Tab**:Order details / Invoices / Payments / Quotation / Mail / Approvals——主对象 + 关联单据 + 沟通 + 审批。
- 主体左栏:
  - 头部摘要卡:类型 Tag(`Sales order`)+ 大标题(Order Summary)+ 一句话副标题(Confirmed for Cardinal Health)+ 右侧关键字段小表(单号/日期/币种/制单人/来源报价单);
  - `Bill to`(客户/联系人/邮箱/电话/地址)与 `Order summary`(各状态+**大号高亮 Grand total**)双栏;
  - `Order items` 行项目表(条目+配置+数量+单价+小计);
  - `Payment progress` / `Invoice progress` 进度区(空态友好)。
- **右侧「Order workflow」生命周期面板(核心范式)**:
  - 顶部当前状态 Tag;
  - 关键状态摘要小表(单号/当前阶段/付款/开票/发货);
  - `How it works` 一段说明:"所有阶段按顺序列出,当前阶段高亮禁用,其它阶段可直接点击流转";
  - **Lifecycle steps:1. Draft → 2. Pending confirmation → 3. Confirmed → 4. Delivering → 5. Completed → 6. Cancelled(红)→ 7. Void**,每个阶段一颗按钮,当前阶段置灰,点击即流转;
  - `Other actions`(Refresh 等)。
  - 这就是"状态机可视化+可操作"的标准答案。

### 4.2 客户详情(主数据对象)—— 360° 视图
- 大抽屉 + **Tab:Customer Profile / Contacts / Leads / Quotations / Orders / Projects / Tickets / Mail / History**——一个客户关联的所有业务对象都挂在它名下。
- Profile 页按**分区标题 + 两栏字段**排版:Basic Information / Classification & Ownership / Location & Contact / Notes;关联字段(Category/Owner/Country)是可点链接;右上 `Edit` + AI 头像。

## 5. 其他值得注意的细节

- 每个模块自带 **Guide 页**(新手指南),降低交付后培训成本。
- AI 员工头像常驻:列表工具条、详情右上角都有,与我们的 jsBlock AI 范式一致。
- 空态都有友好文案与图标;`Load more` 代替长分页用于卡片流。
- 徽标数字(顶栏消息/审批/任务角标)让"有活要干"随处可见。

## 6. 映射到 AI 商品搬运工具的落地清单

| Demo 范式 | 我们的落地 | 状态 |
| --- | --- | --- |
| KPI 卡带业务口径说明 | 工作台 6 张 KPI 已加说明句 | ✅ 已做(2026-07-03) |
| 趋势折线 + 分布环形 + 成功率环形 | 工作台 近14天抓取/发布趋势 + 状态分布 + 发布结果(ECharts) | ✅ 已做 |
| 仪表板条目可下钻(View) | 最近任务「查看」→ 任务详情抽屉(商品+步骤/记录+失败原因) | ✅ 已做 |
| My tasks 按组待办卡 | 待办:待审核商品 N / 发布失败商品 N,分组卡片+直达按钮 | 🔜 建议 |
| 逾期概念(`134d late`) | 抓取后超 N 天未处理、失败超 N 天未重试的提示 Tag | 🔜 建议 |
| 列表底部汇总条 + 状态 chips | 商品库列表底部:共 N 件 · 状态计数 chips;发布记录同理 | 🔜 建议(优先) |
| 多状态彩 Tag 独立成列 | 商品库/发布页已有;可拆「审核状态」独立列 | ✅ 大体已有 |
| 右侧生命周期面板(当前态高亮+可点流转) | 预览编辑右上按钮组 → 升级为「商品生命周期」侧栏:已抓取→已处理→审核中→已审核→发布中→已发布/失败,当前态高亮,合法流转可点(重跑处理/标记审核/回退/退回编辑),附 How it works 说明 | 🔜 建议(最有价值) |
| 详情页页级 Tab + 360° 关联 | 商品库详情抽屉 → 可演进为 Tab:档案 / SKU / 媒体 / 发布记录 / 变更历史(changeLog 已有接口) | 🔜 建议 |
| 头部摘要卡(类型 Tag+大标题+关键字段表) | 商品详情/预览编辑头部可统一为此样式 | 🔜 建议 |
| 模块 Guide 页 | 新增「使用指南」菜单页(markdown 渲染现有 docs 摘要) | 🔜 建议 |
| 行项目表(条目+数量+单价+小计) | 预览编辑 SKU 表已同构 | ✅ 已有 |

> 优先级建议:① 预览编辑生命周期侧栏(直接解决"商品现在能做什么"的认知负担);② 商品库/发布记录底部汇总条;③ 工作台待办分组卡;④ 使用指南页。
