# 商品搬运工具：Phase 拆分与逐阶段验收计划

版本：v1.0  
日期：2026-06-29  
适用对象：产品负责人、样式验收人员、Claude/Codex 代码开发 Agent  
关联文档：

- `outputs/nocobase-ai-listing-prd-dev-design.md`
- `outputs/nocobase-ai-developer-official-guide.md`
- `outputs/nocobase-ai-listing-implementation-roadmap.md`

---

## 1. 使用方式

本文件用于把开发设计文档进一步拆成可交给 Claude 或 Codex 开发的 Phase。每个 Phase 都必须独立交付、独立验收。产品负责人完成样式和流程确认后，再进入下一个 Phase。

核心规则：

1. 每个 Phase 只能做当前范围内的功能，不顺手开发后续模块。
2. 每个 Phase 必须有可打开的页面、可读回的数据或可执行的 API。
3. 每个 Phase 完成后，先做功能验收，再做样式验收，再做问题修复。
4. 样式验收未通过时，不进入下一 Phase。
5. 真实发布、删除、批量修改、平台密钥、生产部署等高风险动作必须人工确认。
6. 后续开发 Agent 必须先读 `nocobase-ai-developer-official-guide.md`，再读本文件。
7. 每个 Phase 开始前必须声明要使用哪些 NocoBase 官方 skills，并先读取对应 `SKILL.md`。
8. 如果当前环境缺少某个官方 skill，必须在交付说明里写明缺失项和 fallback 做法。

推荐节奏：

```text
开发 Agent 完成 Phase
  -> 自测并输出验证结果
  -> 你进行样式/体验验收
  -> 记录问题清单
  -> 开发 Agent 修复
  -> 你确认通过
  -> 进入下一 Phase
```

每个 Phase 发给 Claude/Codex 时，建议固定加上这段前缀：

```text
请先阅读：
1. outputs/nocobase-ai-developer-official-guide.md
2. outputs/nocobase-ai-listing-prd-dev-design.md
3. outputs/nocobase-ai-listing-phase-delivery-plan.md 中当前 Phase

本次开发必须优先使用 NocoBase 官方 skills。请先判断本 Phase 需要哪些官方 skill，读取对应 SKILL.md 后再执行。
如果相关官方 skill 在当前环境不可用，请先说明缺失项和 fallback，不要直接凭经验改 NocoBase。
完成后必须在交付说明中列出：已读取的官方 skills、实际使用的官方 skills、未使用但相关的 skill 及原因。
```

---

## 2. Phase 总览

| Phase | 名称 | 目标 | 主要官方 skill / 技术 | 是否需要样式验收 |
|---|---|---|---|---|
| Phase 0 | 项目启动与环境确认 | 确认 NocoBase、Docker、插件开发路径 | `nocobase-env-manage` + `nocobase-plugin-manage` | 低 |
| Phase 1 | 数据模型与权限骨架 | 建立核心 collections、状态机、ACL | `nocobase-data-modeling` + `nocobase-acl-manage` | 低 |
| Phase 2 | 应用外壳与视觉基础 | 建左侧导航、路由、页面空态、统一布局 | `nocobase-ui-builder` + `nocobase-plugin-development` | 高 |
| Phase 3 | 工作台 Dashboard | 完成首页指标、快捷入口、最近任务 | `nocobase-ui-builder` + `nocobase-data-analysis` | 高 |
| Phase 4 | URL 抓取 MVP | 输入商品链接，生成商品草稿 | `nocobase-plugin-development` + OpenAPI/Crawl4AI adapter | 高 |
| Phase 5 | 商品抓取扩展 | 店铺抓取、关键词抓取、批量导入 | `nocobase-plugin-development` + worker/file parser | 高 |
| Phase 6 | 信息处理与规则管理 MVP | 规则选择、AI 建议字段、处理进度 | `nocobase-workflow-manage` + `nocobase-ai-employee` | 高 |
| Phase 7 | 预览编辑与人工审核 | 商品详情、图片预览、字段编辑、审核 | `nocobase-ui-builder` + custom preview block | 极高 |
| Phase 8 | 发布前校验与模拟发布 | 校验阻断项、模拟发布、发布记录 | `nocobase-workflow-manage` + publish adapter mock | 高 |
| Phase 9 | 商品库、发布记录、设置 | 主数据台账、历史追踪、平台账号状态 | `nocobase-ui-builder` + `nocobase-data-analysis` | 高 |
| Phase 10 | **AI 员工原生化集成**（独立阶段） | 集合暴露基座 + 接 LLM + 新建专属员工 + 关键页原生化绑定 + 全局助手（替换 6/7 的 jsBlock 规则页/预览编辑页） | `nocobase-ai-employee` + `nocobase-ui-builder`(ai-employee-actions) + `nocobase-data-modeling` + `plugin-ai` | 极高 |
| Phase 11 | Docker 部署与运维验收 | 阿里云 CentOS Docker 部署、日志、备份 | `nocobase-env-manage` + `nocobase-publish-manage` | 中 |
| Phase 12 | 回归与试运营准备 | 端到端回归、样式统一、试运营清单 | `nocobase-revision` + E2E/manual QA | 极高 |

> **关于 AI 员工（2026-06-30 定稿）**：对齐 NocoBase 官方演示的“原生 AI 员工”能力，**统一收敛为一个独立阶段 Phase 10**（内部六步：集合暴露 → 接 LLM → 新建专属员工 → 关键页原生化绑定 → 全局助手 → 知识库），不拆成多 phase、不散落各 phase。设计详见 `nocobase-ai-listing-native-ai-employees-design.md`。Phase 10 会**替换** Phase 6/7 的 jsBlock 规则页/预览编辑页为“原生 + 专属 AI 员工”版（数据不动）。Phase 8（发布前校验与模拟发布）按原序先行，不被 AI 员工阶段阻塞。

---

## 3. 全局样式验收标准

所有涉及页面的 Phase 都按以下标准验收：

| 项 | 验收标准 |
|---|---|
| 页面路径 | 使用 `/v2/` 路径，页面可刷新访问，无 404 |
| 左侧导航 | 当前菜单高亮正确，图标、文字、间距一致 |
| 页面标题 | 面包屑、标题、主操作按钮位置稳定 |
| 卡片与表格 | 圆角、阴影、边框、间距和设计稿风格一致 |
| 表单 | 输入框、选择器、按钮、必填提示、错误提示一致 |
| 状态标签 | 成功、失败、处理中、待处理颜色统一 |
| 空态 | 无数据时有清晰空态，不出现空白区域 |
| 加载态 | API 请求时有 loading，不闪烁、不误点 |
| 错误态 | 失败信息可读，可重试时显示重试入口 |
| 全局异常 | 自定义页面异常时显示友好错误态，不白屏 |
| 友好提示 | 错误提示说明发生了什么、下一步怎么做，并展示 `traceId` |
| 控制台 | 正常业务流无未处理 `Promise rejection`、React error overlay 或英文堆栈 |
| 响应式 | 至少验证 1440px 桌面宽度；重要页面再验证 1280px |
| 文案 | 中文清晰，不出现英文调试信息或未翻译 key |
| 数据一致性 | 表格数据和详情数据一致，刷新后不丢状态 |

建议每个 Phase 样式验收记录：

```markdown
## Phase X 样式验收记录

页面：
- /v2/...

通过项：
- ...

问题项：
- [ ] 问题描述，截图路径，期望效果

结论：
- 通过 / 修复后通过 / 不通过
```

### 3.1 日志与异常处理验收标准

所有 Phase 都必须检查日志和错误提示，不允许把异常处理留到上线前补。

| 项 | 验收标准 |
|---|---|
| `traceId` | 自定义 API、任务步骤、前端错误提示能看到同一个追踪编号 |
| 服务端日志 | 抓取、处理、发布、AI 工具调用有结构化日志，不记录密钥和 token |
| 任务明细 | worker/workflow 失败写入任务步骤，能看到错误码、错误摘要、是否可重试 |
| 前端请求 | 自定义 API 统一经过 `requestWithFriendlyError` 或同等封装 |
| 页面边界 | 每个 `/v2/ai-listing/...` 自定义页面有 `ListingPageErrorBoundary` 或同等局部错误边界 |
| 用户提示 | 运营看到的是中文友好说明、下一步动作、重试入口或管理员处理建议 |

### 3.2 官方 Skills 使用验收标准

每个 Phase 都必须把官方 skill 使用情况作为交付证据。

| 项 | 验收标准 |
|---|---|
| skill 路由 | 开发 Agent 明确本 Phase 属于哪些官方 skill 覆盖范围 |
| skill 读取 | 交付说明写明已读取的 `SKILL.md` |
| skill 优先 | 能用 `data-modeling`、`ui-builder`、`workflow-manage`、`ai-employee` 完成的，不提前进入插件开发 |
| 缺失说明 | 当前环境缺少官方 skill 时，写明缺失 skill、原因和 fallback |
| 读回证据 | 每个 skill 造成的 NocoBase 变更都有读回、执行记录或截图证据 |

---

## 4. Phase 0：项目启动与环境确认

### 4.1 目标

确认 NocoBase 项目、Docker 部署方式、插件开发位置和基础运行命令。此阶段不做业务页面。

### 4.2 开发范围

| 项 | 内容 |
|---|---|
| NocoBase 项目 | 确认项目根目录、版本、包管理器、数据库 |
| 插件名 | `@crossborder/plugin-ai-listing` |
| 运行方式 | 本地开发 + 后续 Docker Compose 部署 |
| 数据库 | PostgreSQL，目标连接为 `120.76.157.51:5432/nocobaseV2`，用户 `pgadmin`，密码只放私密 `.env` |
| 外部服务 | 外部 Postgres、Redis、Crawl4AI worker 预留 |
| OpenAPI | 确认 Alibaba.com OpenAPI 文档目录和凭证配置方式 |

### 4.3 交付物

- 环境检查结果。
- 插件骨架创建方案。
- Docker 服务规划草图。
- `.env` 配置项清单，不写真实密钥；`DB_PASSWORD` 只写占位。
- PostgreSQL Navicat 建库脚本和执行说明。

### 4.4 功能验收

- NocoBase 本地可启动。
- 可确认当前是否为 source install。
- 明确插件目录位置。
- 明确后续 Docker Compose 服务拆分：`nocobase-app`、`redis`、`crawl4ai-worker`；`postgres` 在生产中使用外部 PostgreSQL，必要时仅作为本地开发服务。

### 4.5 样式验收

此阶段没有正式页面，只需确认 NocoBase `/v2/admin/` 可访问。

### 4.6 交给 Claude/Codex 的任务提示词

```text
请先阅读 outputs/nocobase-ai-developer-official-guide.md、outputs/nocobase-ai-listing-prd-dev-design.md、outputs/nocobase-ai-listing-phase-delivery-plan.md。

执行 Phase 0：项目启动与环境确认。
不要写业务代码，不要创建真实发布逻辑。
请检查 NocoBase 项目根目录、版本、插件开发方式、Docker 部署依赖、数据库和 Redis 需求，并输出环境检查报告。
数据库目标使用 PostgreSQL：DB_DIALECT=postgres，DB_HOST=120.76.157.51，DB_PORT=5432，DB_DATABASE=nocobaseV2，DB_USER=pgadmin，DB_PASSWORD 只放私密 .env，不写入交付文档。
如果需要进入插件开发，必须先给出计划，等我确认后再运行脚手架命令。
```

---

## 5. Phase 1：数据模型与权限骨架

### 5.1 目标

建立核心业务数据模型，为后续页面、任务、工作流、AI 员工、审计提供稳定基础。

### 5.2 开发范围

核心 collections：

| Collection | 用途 |
|---|---|
| `aiListingProducts` | 商品主表 |
| `aiListingSkus` | SKU/规格 |
| `aiListingMediaAssets` | 图片/视频资产 |
| `aiListingCaptureTasks` | 抓取任务 |
| `aiListingTaskSteps` | 任务步骤与进度 |
| `aiListingRules` | 处理规则 |
| `aiListingProcessingJobs` | 信息处理任务 |
| `aiListingMediaJobs` | 媒体处理任务 |
| `aiListingPublishBatches` | 发布批次 |
| `aiListingPublishRecords` | 发布记录 |
| `aiListingPlatformAccounts` | 平台账号状态 |
| `aiListingAuditLogs` | 审计日志 |

### 5.3 技术实现

- 优先在插件内定义 collections，方便后续部署和迁移。
- 状态字段使用枚举。
- 商品、SKU、媒体、任务、发布记录建立明确关系。
- ACL 至少区分管理员、店铺管理员、运营、审核、只读观察者。
- AI 员工不作为普通 UI 登录用户，只能通过工具受控访问。

### 5.4 交付物

- collections 定义。
- 基础 ACL。
- 状态机字段。
- 示例数据或开发用 seed。
- 数据模型读回报告。

### 5.5 功能验收

- 所有 collections 可在 NocoBase 中看到。
- 商品与 SKU、媒体、任务步骤、发布记录关联正确。
- 能创建一条商品草稿和多个 SKU。
- 能创建一条抓取任务，并写入至少 3 条任务步骤。
- 普通运营不能访问平台凭证明文字段。

### 5.6 样式验收

此阶段主要是后台数据结构。只需要检查自动生成的基础表格是否可读，不要求接近设计稿。

### 5.7 交给 Claude/Codex 的任务提示词

```text
执行 Phase 1：数据模型与权限骨架。
请只实现 collections、关系、状态字段、基础 ACL 和开发样例数据。
不要开发复杂页面，不要接 OpenAPI，不要接 Crawl4AI。
完成后输出：collections 列表、关键字段、关系说明、ACL 说明、读回验证结果。
```

---

## 6. Phase 2：应用外壳与视觉基础

### 6.1 目标

搭建商品搬运工具的应用外壳，先让所有设计稿页面有稳定入口和统一视觉基础。

### 6.2 页面范围

| 页面 | 路径 |
|---|---|
| 工作台 | `/v2/ai-listing/dashboard` |
| 商品抓取 | `/v2/ai-listing/capture` |
| 信息处理 | `/v2/ai-listing/process` |
| 预览编辑 | `/v2/ai-listing/preview` |
| 商品发布 | `/v2/ai-listing/publish` |
| 商品库 | `/v2/ai-listing/products` |
| 规则管理 | `/v2/ai-listing/rules` |
| 发布记录 | `/v2/ai-listing/history` |
| 设置 | `/v2/admin/settings/ai-listing` |

### 6.3 技术实现

- 使用 `client-v2`。
- 路由懒加载。
- 不使用 `this.app.use()`。
- 不新增全局 React Provider。
- 在插件页面范围内建立 `ListingPageErrorBoundary`，防止单页异常导致白屏。
- 建立 `requestWithFriendlyError` 或同等请求封装，统一解析 `friendlyMessage`、`errorCode`、`traceId`、`retryable`。
- 普通页面可先用占位区块，但样式框架要确定。
- 统一导航、页面标题、卡片、表格、状态标签、按钮风格。

### 6.4 交付物

- 所有页面可访问。
- 左侧导航和菜单高亮。
- 页面空态和占位数据。
- 基础设计 token 或 CSS 约定。
- 插件范围内的页面错误边界组件。
- 自定义 API 请求错误封装工具和错误展示组件。
- 截图供样式验收。

### 6.5 功能验收

- 刷新任一 `/v2/ai-listing/...` 页面不 404。
- 页面切换无白屏。
- 设置页可打开。
- 多语言 key 不裸露。
- 手动模拟一个页面组件异常时，页面显示友好错误态，不出现整页白屏。
- 手动模拟一个 API 失败时，能看到中文错误、下一步动作和 `traceId`。

### 6.6 样式验收

重点检查：

- 左侧导航是否接近设计稿。
- 页面顶部间距、面包屑、标题是否统一。
- 卡片圆角、边框、阴影是否统一。
- 空态是否简洁，不像临时 demo。
- 1440px 下主体宽度和留白是否舒适。

### 6.7 交给 Claude/Codex 的任务提示词

```text
执行 Phase 2：应用外壳与视觉基础。
请只完成页面路由、导航、页面壳、统一卡片/表格/按钮/状态标签样式和空态。
不要实现真实抓取、AI、发布逻辑。
所有客户端代码必须在 src/client-v2，不使用 this.app.use() 或 React Provider。
请同时建立插件范围内的 ListingPageErrorBoundary 和 requestWithFriendlyError，用模拟异常验证页面不白屏，错误提示包含 traceId 和下一步动作。
完成后提供每个页面路径和截图说明，等待我做样式验收。
```

---

## 7. Phase 3：工作台 Dashboard

### 7.1 目标

完成设计稿中的工作台首页，让用户一进入系统就知道今天要处理什么。

### 7.2 开发范围

| 模块 | 内容 |
|---|---|
| KPI 卡片 | 今日抓取、待处理、已发布、发布成功率、待人工确认 |
| 快速入口 | URL 抓取、店铺抓取、关键词抓取、批量导入 |
| 平台连接状态 | Shopee、Lazada、Alibaba.com、Temu、TikTok Shop |
| 最近任务 | 任务名称、类型、进度、状态、创建时间 |
| 通知入口 | 凭证过期、发布失败、规则异常 |

### 7.3 技术实现

- 前端可先使用 mock 数据。
- 同步实现 `aiListingDashboard:summary` API，占位返回聚合统计。
- 后续再接真实任务和发布记录。

### 7.4 交付物

- Dashboard 页面。
- summary API。
- 最近任务列表。
- 平台连接状态列表。
- 快速入口跳转。

### 7.5 功能验收

- KPI 能从 API 或 mock API 渲染。
- 点击快速入口可跳到商品抓取页对应 tab。
- 最近任务点击可进入对应页面或展示占位详情。
- 平台连接状态能展示 connected/expired/disconnected。

### 7.6 样式验收

重点检查：

- KPI 卡片是否接近设计稿。
- 数字层级是否明显。
- 快速入口是否像真实工作台，不像普通按钮列表。
- 最近任务进度条和状态色是否统一。
- 页面第一屏是否完整，是否有过度空白。

### 7.7 交给 Claude/Codex 的任务提示词

```text
执行 Phase 3：工作台 Dashboard。
请实现工作台页面、KPI 卡片、快速入口、平台连接状态、最近任务和 summary API。
可以使用 mock 数据，但 API 结构要稳定，后续可替换为真实聚合。
不要开发抓取执行、信息处理、发布逻辑。
完成后提供页面路径、API 返回示例、样式截图说明。
```

---

## 8. Phase 4：URL 抓取 MVP

### 8.1 目标

完成第一条核心闭环的前半段：用户输入一个商品链接，系统创建抓取任务，抓取结构化数据，生成商品草稿。

### 8.2 开发范围

| 模块 | 内容 |
|---|---|
| URL 抓取表单 | 商品链接、来源平台、抓取内容选项 |
| 抓取历史 | 商品信息、来源平台、价格、库存、状态、抓取时间 |
| 抓取任务 | `aiListingCaptureTasks` |
| 任务步骤 | `aiListingTaskSteps` |
| 商品草稿 | `aiListingProducts`、`aiListingSkus`、`aiListingMediaAssets` |

### 8.3 技术实现

技术路线：

1. Alibaba.com 链接优先解析 `product_id`，走本地 OpenAPI 文档设计 adapter。
2. OpenAPI 不可用或字段不足时，使用 Crawl4AI 兜底抓公开页面。
3. Crawl4AI 不放在 NocoBase 主进程，预留 HTTP/Redis worker 调用方式。
4. MVP 可以先实现 mock adapter，再保留真实 OpenAPI/Crawl4AI adapter 接口。
5. 抓取 API 必须返回标准错误结构，任务步骤必须写入 `traceId`、`errorCode`、`retryable` 和错误摘要。

需要实现的 API：

| API | 用途 |
|---|---|
| `aiListingCapture:startUrlCapture` | 创建并启动 URL 抓取 |
| `aiListingTasks:getProgress` | 查询任务进度 |

### 8.4 交付物

- URL 抓取页面 tab。
- 抓取任务创建 API。
- 抓取任务进度。
- 成功生成商品草稿。
- 抓取失败可显示原因、错误码、重试入口和 `traceId`。

### 8.5 功能验收

- 输入合法 URL 后创建任务。
- 抓取任务从 pending 到 running 到 succeeded/failed。
- 成功后商品库出现草稿。
- 任务步骤记录至少包括：解析链接、获取详情、保存草稿。
- 失败时展示错误码、可读错误信息、下一步动作和 `traceId`。

### 8.6 样式验收

重点检查：

- URL 输入区是否接近设计稿。
- 平台选择按钮是否清晰。
- 抓取内容 checkbox 是否整齐。
- 抓取历史表格图片、标签、状态、操作是否美观。
- 任务进行中是否有 loading/progress，不是卡住。

### 8.7 交给 Claude/Codex 的任务提示词

```text
执行 Phase 4：URL 抓取 MVP。
请实现商品抓取页的 URL 抓取 tab、startUrlCapture API、任务状态、任务步骤、商品草稿生成。
Alibaba.com 采集优先按 OpenAPI adapter 设计，允许先 mock 返回；Crawl4AI 只作为兜底 adapter 接口预留，不要把浏览器运行在 NocoBase 主进程。
抓取失败必须落任务步骤日志并返回标准错误结构，前端要显示友好错误、重试入口和 traceId。
不要实现店铺抓取、关键词抓取、批量导入、信息处理和发布。
完成后提供：测试 URL、任务记录、任务步骤、生成商品草稿、失败示例、页面截图说明。
```

---

## 9. Phase 5：商品抓取扩展

### 9.1 目标

补齐商品抓取页的其他三种模式：店铺抓取、关键词抓取、批量导入。

### 9.2 开发范围

| 模式 | 内容 |
|---|---|
| 店铺抓取 | 店铺 URL、分析店铺、商品列表、筛选、选中抓取 |
| 关键词抓取 | 关键词、平台、排序、价格区间、结果卡片、选中抓取 |
| 批量导入 | CSV/Excel 上传、文本粘贴、模板下载、导入历史 |

### 9.3 技术实现

- OpenAPI 优先。
- Crawl4AI 只作为公开页面兜底。
- 批量导入使用 File Manager + 服务端解析。
- 批量任务必须显式创建任务明细，不依赖 collection event 批量触发。
- 每条 URL 都写 `aiListingTaskSteps`。

### 9.4 交付物

- 店铺抓取 tab。
- 关键词抓取 tab。
- 批量导入 tab。
- 导入模板。
- 导入历史。
- 批量任务明细。

### 9.5 功能验收

- 店铺分析结果可展示并可选择商品。
- 关键词搜索结果以卡片展示。
- 批量文件可解析，错误行可提示。
- 批量任务展示成功/失败统计。
- 单条失败不影响其他条。

### 9.6 样式验收

重点检查：

- 四个 tab 风格统一。
- 关键词商品卡片接近设计稿。
- 上传区域清晰，不像系统默认裸组件。
- 导入历史成功/失败数字颜色清楚。
- 分页、筛选、批量按钮不拥挤。

### 9.7 交给 Claude/Codex 的任务提示词

```text
执行 Phase 5：商品抓取扩展。
请补齐店铺抓取、关键词抓取、批量导入三个 tab。
OpenAPI 优先，Crawl4AI 只做公开页面兜底接口。批量导入需要任务明细和失败统计。
不要开发信息处理、预览编辑、发布逻辑。
完成后提供三个 tab 的页面路径/截图、批量导入样例、任务明细读回结果。
```

---

## 10. Phase 6：信息处理与规则管理 MVP

### 10.1 目标

让用户可以选择处理规则，对商品草稿进行标题、描述、价格、字段映射和媒体任务处理，并看到处理进度。

### 10.2 开发范围

| 模块 | 内容 |
|---|---|
| 规则卡片 | Shopee -> Lazada、Amazon -> Temu、通用处理 |
| 待处理商品 | 商品表格、状态、原始价格、抓取时间 |
| 批量处理 | 选中商品后启动处理 |
| 处理进度 | 参数替换、图片处理、视频处理、信息存档 |
| 规则管理基础 | 规则 CRUD、启用/禁用、映射表 |

### 10.3 技术实现

- Workflow 编排处理流程。
- AI Employees 生成标题、描述、属性建议。
- AI 写入优先写建议字段，不直接覆盖最终字段。
- 规则执行写审计日志。
- 媒体处理可先做任务占位，不必接真实去水印。

### 10.4 交付物

- 信息处理页面。
- 规则管理基础页面。
- 处理 workflow。
- AI 建议字段。
- 审计日志。

### 10.5 功能验收

- 可选择规则。
- 可批量启动处理。
- 商品状态进入 processing/processed/process_failed。
- AI 建议字段和最终字段分离。
- 审计日志记录字段变化。

### 10.6 样式验收

重点检查：

- 规则卡片是否清晰表达规则能力。
- 待处理商品表格是否易扫描。
- 处理进度条和阶段状态是否直观。
- 媒体处理明细是否接近增强版设计稿。
- 失败态是否有明确修复入口。

### 10.7 交给 Claude/Codex 的任务提示词

```text
执行 Phase 6：信息处理与规则管理 MVP。
请实现规则选择、待处理商品、批量处理、处理进度、基础规则管理和审计日志。
AI 员工只能写建议字段或需要 Ask 后写最终字段。
媒体处理先做任务结构和状态，不要求真实去水印/白底图。
不要开发预览编辑和发布。
完成后提供 workflow 执行记录、审计日志样例、页面截图说明。
```

---

## 11. Phase 7：预览编辑与人工审核

### 11.1 目标

完成最关键的人机协作页面：运营可以查看 AI 处理后的商品，编辑最终字段，审核通过后进入发布前校验。

### 11.2 开发范围

| 模块 | 内容 |
|---|---|
| 左侧商品列表 | 搜索、状态筛选、平台筛选、批量选择 |
| 右侧详情 | 图片、标题、价格、库存、SKU、描述、参数 |
| 图片预览 | 主图、缩略图、切换 |
| 字段编辑 | 标题、价格、库存、SKU、描述、参数 |
| 变更记录 | AI 修改、人工修改、旧值、新值、原因 |
| 审核标记 | 标记已审核、取消审核 |
| 模式 | PC 端、移动端、对比模式 |

### 11.3 技术实现

- UI Builder 详情/编辑表单 + 自定义预览区块。
- AI Employee action：优化标题、补全参数、生成描述、发布前检查。
- 审核通过后关键字段默认锁定。
- 回退审核要写审计日志。

### 11.4 交付物

- 预览编辑页面。
- 图片预览组件。
- 字段编辑表单。
- 审核操作。
- 变更记录。
- AI 快捷按钮。

### 11.5 功能验收

- 能从左侧选择商品并加载右侧详情。
- 修改字段后保存成功。
- 变更记录完整。
- 点击审核通过后状态进入 reviewed。
- 审核后再次编辑需要回退或提示。

### 11.6 样式验收

这是最高优先级样式验收页面。重点检查：

- 左右布局是否接近设计稿。
- 商品图片比例、缩略图、选中态是否美观。
- 标题、价格、库存、SKU 表格层级是否清楚。
- 编辑按钮、AI 标签、已审核标签是否不干扰阅读。
- 描述和参数区块是否易读。
- PC/移动/对比模式切换是否稳定。

### 11.7 交给 Claude/Codex 的任务提示词

```text
执行 Phase 7：预览编辑与人工审核。
请重点还原设计稿交互和视觉层级，完成左侧商品列表、右侧商品详情、图片预览、字段编辑、变更记录、审核操作和 AI 快捷按钮。
AI 按钮只做建议或 Ask 后填表，不能直接发布。
不要开发真实发布。
完成后提供多个商品样例、编辑记录、审核状态变化、页面截图说明，等待我做重点样式验收。
```

---

## 12. Phase 8：发布前校验与模拟发布

### 12.1 目标

完成发布链路 MVP：发布前校验、模拟发布、发布进度、发布记录。

### 12.2 开发范围

| 模块 | 内容 |
|---|---|
| 发布配置 | 目标平台、目标店铺、类目、运费模板、发布策略、速率 |
| 待发布商品 | 商品、目标价格、库存、校验状态 |
| 发布前校验 | 类目、图片、标题、价格、库存、SKU、合规 |
| 模拟发布 | mock adapter 生成发布结果 |
| 发布进度 | 成功、发布中、失败、等待中 |
| 发布记录 | 目标链接、失败原因、重试 |

### 12.3 技术实现

- `aiListingPublish:precheck`
- `aiListingPublish:publish`
- Workflow 编排发布前校验和模拟发布。
- Product V2 / 平台真实 API 只做接口设计，不默认启用。
- 发布动作必须幂等。

### 12.4 交付物

- 商品发布页面。
- 发布前校验 API。
- 模拟发布 adapter。
- 发布记录。
- 失败重试占位。

### 12.5 功能验收

- 未设置类目时校验失败。
- 图片缺失时校验失败。
- 校验通过后才能模拟发布。
- 模拟发布生成发布记录。
- 重复点击不会重复创建记录。

### 12.6 样式验收

重点检查：

- 发布配置区是否清晰。
- 待发布商品表格是否易读。
- 校验状态标签是否醒目。
- 发布进度条是否符合设计稿。
- 失败原因展示是否不拥挤。

### 12.7 交给 Claude/Codex 的任务提示词

```text
执行 Phase 8：发布前校验与模拟发布。
请实现商品发布页面、发布配置、发布前校验、模拟发布、发布进度和发布记录。
真实平台发布只保留 adapter 接口，不启用真实发布。
发布必须幂等，失败原因必须可读。
完成后提供校验失败样例、校验成功样例、模拟发布记录、页面截图说明。
```

---

## 13. Phase 9：商品库、发布记录、设置

### 13.1 目标

补齐运营日常管理页面：商品库、发布记录、设置。

### 13.2 开发范围

| 页面 | 内容 |
|---|---|
| 商品库 | 统计卡、搜索筛选、列表/卡片视图、状态、发布链接 |
| 发布记录 | 统计卡、筛选、目标链接、失败原因、重试、导出 |
| 设置 | 平台账号状态、默认平台、默认规则、Crawl4AI 开关、OpenAPI 状态 |

### 13.3 技术实现

- UI Builder 表格/详情优先。
- 复杂链接聚合和导出可用插件 API。
- 平台账号只展示授权状态，不展示密钥。
- OpenAPI IP 白名单和 token 过期状态需要提示。

### 13.4 交付物

- 商品库页面。
- 发布记录页面。
- 设置页。
- 导出报告占位或 MVP。
- 平台连接状态。

### 13.5 功能验收

- 商品可按状态、平台、批次搜索。
- 发布记录可按状态、平台、日期搜索。
- 失败项可进入重试流程或占位。
- 设置页能展示 OpenAPI/Crawl4AI 状态。

### 13.6 样式验收

重点检查：

- 商品库表格/卡片是否接近设计稿。
- 发布记录失败原因是否易读。
- 设置页不要像裸配置表，要有分组和说明。
- 筛选区域不要拥挤。

### 13.7 交给 Claude/Codex 的任务提示词

```text
执行 Phase 9：商品库、发布记录、设置。
请使用 UI Builder 优先实现商品库、发布记录和设置页；复杂导出/链接聚合可用插件 API。
平台账号页只展示授权状态，不展示密钥。
完成后提供页面路径、筛选测试、状态展示、设置页截图说明。
```

---

## 14. Phase 10：AI 员工原生化集成（独立阶段）

> 本阶段把全程的“自定义 mock AI 按钮”升级为**对齐 NocoBase 官方演示的原生 AI 员工**（头像悬浮 + 自然语言任务 + 与当前 UI 上下文联动 + 全局助手）。完整设计见 `nocobase-ai-listing-native-ai-employees-design.md`。
> **作为一个独立 phase 一次性交付**，内部含「基座 → 接模型 → 新建专属员工 → 关键页原生化绑定 → 全局助手 → 知识库」六个有序子步骤；不再拆成多个 phase，也不散落到各 phase。

### 14.1 目标

让商品库 / 预览编辑 / 规则等核心页拥有真正可用的“原生 AI 员工”，保持权限与审计边界，**不复用内置员工、不做真实发布**。

### 14.2 开发范围（六个有序子步骤，单阶段交付）

1. **原生化基座**：把 `aiListingProducts/Skus/MediaAssets/Rules` 暴露给 client 主数据源（原生区块可绑定）。**首步做单集合可行性 spike**：验证进入 `collections:list`、字段可读、原生表格可读写既有数据、不破坏现有 jsBlock 页与 REST；不通过则回退“混合：新增原生承载页”。
2. **接入真实 LLM**：用产品负责人提供的 API Key 配置 `plugin-ai` 模型服务；保留“无模型→确定性 mock”兜底。密钥仅服务端，禁入日志/审计/前端。
3. **新建专属 AI 员工**（不复用内置 dex/lexi/viz/vera，username 用 `lst-` 前缀）：

   | 员工 | username | 职位 | 绑定 | 任务 | 权限 |
   |---|---|---|---|---|---|
   | 选品参谋 Mira | `lst-mira` | 选品分析师 | 商品库/预览编辑 列表 | 选品质量、批次成功率、风险词扫描 | 只读 `Allow` |
   | 合规向导 Rena | `lst-rena` | 合规与市场研究员 | 商品详情 记录动作 | 合规/平台规则、卖点研究、目标市场 | 只读 `Allow`（可联网） |
   | 文案管家 Toby | `lst-toby` | 商品信息整理员 | 编辑表单 | 优化标题/生成描述/补全参数→**填表单不入库** | Ask（Submit 才存） |
   | 发布助理 Lena | `lst-lena` | 发布助理 | 发布/发布记录页 | 发布前检查、失败解释、重试建议 | 只读 `Allow`（不触发真实发布） |
   | 搬运主管 Kai | `lst-kai` | 搬运工作台主管 | 全局悬浮助手 | 自然语言提问、转派以上专属员工 | 跟随用户权限 |

4. **关键页原生化 + 绑定**：用原生 table/details/form 重建 商品库、预览编辑/审核、规则管理（**替换 Phase 6/7 的 jsBlock 规则页/预览编辑页**，数据不动，验收通过后下线旧页）；用 `ai-employee-actions` 把上表员工挂到对应区块的 `actions`/`recordActions`。
5. **全局助手**：开启 `plugin-ai` 应用级悬浮助手，调度员设为 Kai。
6. **知识库（RAG，可选增强）**：平台规则 / 类目 / 标题规范 / 禁售词入 Knowledge Base，供 Rena/Lena 命中引用。

### 14.3 技术实现

- `nocobase-data-modeling`（集合暴露/元数据）、`plugin-ai`（模型服务）、`nocobase-ai-employee`（`aiEmployees:create` 新建专属员工 + prompt/工具）、`nocobase-ui-builder` 的 `ai-employee-actions`（`type:"aiEmployee"`，`workContext:{target:"self"}`，`tasks[]`）。
- **安全约束（不可破）**：AI 只读分析/研究，或把建议**填进表单字段**（用户 Submit 才入库）；绝不直接写最终字段/删除/真实发布；需写库的建议走受控 `aiListing*` suggestion 工具（只写 `*Processed` + 审计）；审核锁定（`reviewed`）后 AI 写入被拒；所有 AI 字段变化写 `aiListingAuditLogs`（actorType=ai_employee）。

### 14.4 交付物

- 暴露后的核心集合（UI 可管理）+ spike 结论；可用 LLM 模型服务（mock 兜底）。
- 5 个专属 AI 员工配置。
- 原生 商品库/预览编辑/规则 页 + 原生 AI 员工动作绑定 + 全局助手。
- 知识库文档（可选）；工具权限表；测试对话/任务记录。

### 14.5 功能验收

- 核心集合在 `collections:list` 可见、字段正确；原生页可列出并编辑既有商品。
- LLM 配好后专属员工能基于当前 UI 上下文真实生成；未配时 mock 兜底不报错。
- Toby 填表为“填字段不入库”，Submit 才保存并审计；审核锁定后 AI 写入被拒；Allow 查询不越权。
- 全局助手可用，Kai 能转派。
- AI 工具失败返回标准错误码 + friendlyMessage + traceId，审计可查；密钥不出现在任何日志/审计/前端。

### 14.6 样式验收

- 头像悬浮、任务按钮、上下文联动、整体视觉层级对齐官方演示。
- AI 按钮位置自然不喧宾夺主；输出结果可读、不像聊天日志堆叠；建议值与最终值区分明确；Ask 确认文案清晰。

### 14.7 交给 Claude/Codex 的任务提示词

```text
执行 Phase 10：AI 员工原生化集成（独立阶段，一次交付）。
按六步有序推进：① 集合暴露基座（先单集合 spike，验证数据不丢、不破坏现有页，不通过则回退混合方案）；② 用产品负责人的 API Key 配 plugin-ai 模型服务（含 mock 兜底，密钥不入任何日志/审计/前端）；③ 新建专属 AI 员工 Mira/Rena/Toby/Lena/Kai（不复用内置，lst- 前缀，带领域化 prompt/avatar）；④ 用原生区块重建商品库/预览编辑/规则页（替换 Phase 6/7 jsBlock，数据不动），挂原生 aiEmployee 动作；⑤ 开全局助手由 Kai 调度；⑥ 平台规则知识库（可选）。
铁律：AI 只读或填表单不入库（Submit 才存），写库走受控建议工具并审计，审核锁定后 AI 不可改，不做真实发布。
完成后提供：集合暴露/ spike 结论、员工列表、原生页与 AI 任务测试、多商品/审核/审计样例、页面截图说明。
```

---

## 15. Phase 11：Docker 部署与运维验收

### 15.1 目标

完成阿里云 CentOS Docker 部署准备，验证无可视化环境下 NocoBase、Crawl4AI worker、数据库、Redis 可运行。

### 15.2 开发范围

| 模块 | 内容 |
|---|---|
| Docker Compose | NocoBase、Redis、Crawl4AI worker；Postgres 生产优先使用外部实例 |
| 环境变量 | OpenAPI、外部 PostgreSQL、Redis、AI 模型、Crawl4AI 内网地址 |
| Crawl4AI | headless Chromium、并发限制、超时、截图 |
| OpenAPI | ECS 出口 IP 白名单、token 刷新 |
| 日志 | 任务日志、失败截图、API traceId |
| 备份 | 数据库备份和恢复说明 |

### 15.3 技术实现

- Crawl4AI 独立容器。
- PostgreSQL 优先连接外部实例 `120.76.157.51:5432/nocobaseV2`；Compose 内 `postgres` 服务只作为本地开发可选项。
- 不安装桌面、VNC、X11。
- Chromium 使用 headless。
- 配置 `shm_size`。
- 内网通信，不暴露 Crawl4AI 公网端口。

### 15.4 交付物

- Docker Compose 文件。
- `.env.example`。
- `.env.production.example`，其中 `DB_PASSWORD` 必须使用占位，不写真实密码。
- 部署说明。
- 健康检查。
- 回滚说明。

### 15.5 功能验收

- `docker compose up` 后服务可启动。
- NocoBase `/v2/admin/` 可访问。
- NocoBase 能连接外部 PostgreSQL 数据库 `"nocobaseV2"`。
- Crawl4AI worker health check 正常。
- 抓取任务能调用 worker。
- 数据库备份命令可用。
- 容器日志能按 `traceId` 检索一次抓取失败，前端提示中的 `traceId` 与后端日志一致。

### 15.6 样式验收

只需要确认部署后页面样式未丢失，静态资源加载正常。

### 15.7 交给 Claude/Codex 的任务提示词

```text
执行 Phase 11：Docker 部署与运维验收。
请为阿里云 CentOS Docker 部署准备 docker-compose、.env.example、Crawl4AI worker 服务、健康检查、日志和备份说明。
不要暴露 Crawl4AI 到公网，不要写真实密钥。
数据库使用外部 PostgreSQL：DB_DIALECT=postgres，DB_HOST=120.76.157.51，DB_PORT=5432，DB_DATABASE=nocobaseV2，DB_USER=pgadmin。DB_PASSWORD 只放私密 .env，不写入文档或提交记录。
需要考虑 /dev/shm、并发限制、超时、失败截图、OpenAPI IP 白名单。
请验证一次失败任务的 traceId 可以从前端提示追到 NocoBase 日志、worker 日志和任务步骤。
完成后提供部署步骤和健康检查结果。
```

---

## 16. Phase 12：回归与试运营准备

### 16.1 目标

在试运营前完成端到端回归、样式统一、权限检查、失败路径检查。

### 16.2 回归范围

| 链路 | 验收 |
|---|---|
| URL 抓取成功 | 生成商品草稿 |
| URL 抓取失败 | 有失败原因和重试 |
| 批量导入 | 成功/失败统计正确 |
| 信息处理 | AI 建议字段和审计正确 |
| 预览编辑 | 人工编辑和审核正确 |
| 发布前校验失败 | 阻止发布 |
| 模拟发布成功 | 写发布记录 |
| 发布失败解释 | AI 可解释失败原因 |
| 权限 | 运营、审核、管理员、只读角色正确 |
| 样式 | 设计稿核心页面统一 |

### 16.3 交付物

- 端到端测试记录。
- 样式问题清单。
- 权限测试记录。
- 已知问题列表。
- 试运营操作手册。

### 16.4 样式终验

重点页面：

1. 工作台
2. 商品抓取
3. 信息处理
4. 预览编辑
5. 商品发布
6. 商品库
7. 规则管理
8. 发布记录

终验标准：

- 页面整体观感一致。
- 没有明显错位、遮挡、溢出。
- 表格、卡片、按钮、状态标签统一。
- 中文文案完整。
- 常见错误态可读。

### 16.5 交给 Claude/Codex 的任务提示词

```text
执行 Phase 12：回归与试运营准备。
请基于前面所有 Phase 做端到端回归、权限检查、失败路径检查和样式问题修复。
不要新增大功能，只修复影响试运营的问题。
完成后输出测试记录、样式问题修复清单、权限验证记录、已知问题和试运营操作手册。
```

---

## 17. 每个 Phase 的通用交付格式

开发 Agent 每完成一个 Phase，必须按以下格式交付：

```markdown
# Phase X 交付说明

## 完成内容
- ...

## 修改文件
- ...

## 页面路径
- /v2/...

## API / Workflow
- ...

## 官方 Skills 使用
- 已读取：
- 已使用：
- 未使用但相关的 skill 及原因：
- fallback：

## 日志与异常处理
- traceId：
- 错误码：
- 前端友好错误态：
- 服务端/任务日志：

## 数据模型变化
- ...

## 自测结果
- 正常路径：
- 异常路径：
- 权限：

## 样式验收建议
- 建议重点看：
- 已知偏差：

## 风险和未完成项
- ...
```

---

## 18. Phase 推进门禁

| 门禁 | 说明 |
|---|---|
| G1 功能自测通过 | 开发 Agent 自己跑通当前 Phase 核心路径 |
| G2 样式验收通过 | 产品负责人确认页面观感和设计稿方向一致 |
| G3 问题清单关闭 | 当前 Phase P0/P1 级问题已修复 |
| G4 数据不破坏 | 新 Phase 不破坏前面 Phase 的数据和页面 |
| G5 高风险确认 | 发布、删除、密钥、生产部署等动作已人工确认 |
| G6 日志与异常通过 | 当前 Phase 的日志、错误码、友好提示和 traceId 已验证 |
| G7 官方 skill 证据通过 | 当前 Phase 已说明并验证官方 skills 使用情况 |

不满足门禁时，不进入下一 Phase。
