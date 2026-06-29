# NocoBase AI 开发者官方文档导读与开发规范

版本：v1.1  
日期：2026-06-29  
适用对象：参与本项目的 AI 开发者、产品型开发 Agent、NocoBase 二开工程师  
主要依据：NocoBase 官方 AI、AI Builder、AI Employees、Workflow、FlowEngine、RunJS、Shared Components、Plugin Development 文档，以及 NocoBase 官方 `nocobase/skills` 仓库。

v1.1 更新：补充 AI 开发者任务契约、插件编码规约、工作流编排规约、AI 员工工具契约、数据模型/UI 规范、验证证据模板和常见失败恢复指南。

---

## 1. 文档目标

这份文档不是官方文档的搬运，而是给后续 AI 开发者使用的执行手册。

后续任何 AI 开发者接手 NocoBase 相关任务时，应先用本文件判断：

1. 当前需求应该走低代码配置、AI Builder、工作流、RunJS、AI 员工，还是插件开发。
2. 哪些能力可以直接使用官方 Skill，哪些必须写插件。
3. AI 员工能做什么、不能做什么，怎么配置角色、上下文、工具和权限。
4. 修改数据模型、界面、工作流、插件、权限、发布时分别有哪些安全边界。
5. 完成后应该如何验证、记录版本、交付给下一个开发者。

本项目的商品上架系统可以继续用 NocoBase 做一体化平台，但必须把“业务流程自动化”和“AI 员工协作”拆清楚：稳定规则交给数据模型、工作流和插件；需要判断、生成、改写、补全的部分才交给 AI 员工。

---

## 2. 开发路径选择表

### 2.1 官方 NocoBase Skills 优先规则

`https://github.com/nocobase/skills` 是 NocoBase 官方提供给 Claude Code、Codex、Cursor、OpenCode 等 AI Agent 使用的领域知识包，覆盖环境、数据建模、UI 配置、工作流、权限、插件开发、发布等任务。后续开发本项目时，必须优先使用这些官方 skills，而不是让通用编码 Agent 凭经验直接改 NocoBase。

需要特别区分两种同名概念：

| 概念 | 使用者 | 用途 |
|---|---|---|
| 官方 `nocobase/skills` | Claude、Codex、Cursor 等开发 Agent | 指导 Agent 如何开发、配置、检查 NocoBase 应用 |
| NocoBase AI Employees 里的 `Skills` | 产品内的 AI 员工 | 让业务 AI 员工拥有预置专业能力，目前主要是系统预置 |

执行规则：

1. 每个开发任务开始前，先判断任务属于哪个官方 skill 覆盖范围。
2. 能用官方 skill 处理的，必须先读对应 `SKILL.md`，再执行。
3. `nb init` 会自动安装 NocoBase skills；如果当前环境没有对应 skill，先说明缺失，再用官方文档和仓库内容做保守 fallback。
4. 官方仓库标注 skills 仍是 draft，具体命令以本地已安装 skill、`nb api ... --help` 和当前 NocoBase 版本为准。
5. 不要把所有任务都交给 `nocobase-plugin-development`。插件开发只是低代码能力不足时的后备路径。

### 2.2 官方 Skills 任务路由表

| 任务 | 优先官方 skill | 使用说明 |
|---|---|---|
| 环境初始化、启动、停止、升级、CLI 状态 | `nocobase-env-manage` | 只处理环境和生命周期，不做业务建模 |
| 建表、字段、关系、视图表、外部数据源字段 | `nocobase-data-modeling` | 写入前必须读集合/字段状态，优先 `nb api data-modeling` |
| v2 页面、菜单、区块、字段、按钮、弹窗、AI 员工按钮放置 | `nocobase-ui-builder` | 默认 UI 开发入口，走 Modern UI/flow-surfaces，不直接写内部 schema |
| 按设计稿/截图高度还原 NocoBase 页面 | `nocobase-prototype-repro` | 仅在明确要求“按原型/截图复刻”时使用，并做截图对比 |
| 工作流创建、修订、启用、诊断、执行记录 | `nocobase-workflow-manage` | 已执行版本先建 revision，节点和触发器按 CLI 帮助执行 |
| 角色、权限、用户角色、全局角色模式、权限风险 | `nocobase-acl-manage` | 高风险写操作必须 plan -> confirm -> apply -> readback |
| AI 员工创建、复用、工具、知识库、区块动作 | `nocobase-ai-employee` | 先判断是否真的需要 AI；确定性操作优先 UI/Workflow |
| 插件脚手架、服务端 API、ACL、client-v2 组件、i18n | `nocobase-plugin-development` | 只在低代码、工作流、AI 员工不足时启动 |
| 插件启用、停用、列表检查 | `nocobase-plugin-manage` | 只管插件状态，不写插件代码 |
| 备份、恢复、迁移发布 | `nocobase-publish-manage` | 生产环境必须先确认备份、回滚和目标实例 |
| 阶段性可恢复版本 | `nocobase-revision` | 每个可验证里程碑完成后保存，不替代 Git |
| 通知渠道、通知模板、通知测试 | `nocobase-notification-manage` | 处理发布成功/失败、任务完成等通知能力 |
| 业务数据统计、分组、指标核对 | `nocobase-data-analysis` | 查询统计时先确认数据源和 collection |
| 表达式、过滤条件、UID、计算函数参考 | `nocobase-utils` | 工作流表达式、联动规则、UID 生成时查权威参考 |
| YAML/DSL/Git 化整应用构建 | `nocobase-dsl-reconciler` | 仅在明确要求 DSL/YAML/提交到 Git 时使用，不作为默认 UI 开发路径 |

### 2.3 开发路径选择表

| 需求类型 | 优先路径 | 适合做什么 | 不适合做什么 |
|---|---|---|---|
| 安装、启动、升级、初始化环境 | AI Builder 环境管理 / `nb` CLI | 实例安装、升级、启动停止、多环境管理 | 业务功能开发 |
| 新建表、加字段、关系字段、视图表 | AI Builder 数据建模 | 普通表、树表、文件表、日历表、SQL 表、视图表、继承表，字段和关联关系 | 页面布局、权限、工作流 |
| 配置 v2 页面、区块、字段、按钮、联动 | AI Builder UI Builder | Modern UI 页面和区块搭建、字段/操作/布局微调 | ACL、数据建模、工作流编排、v1 页面 |
| 自动化流程、审批、任务状态流转 | Workflow | 触发器、节点、变量、执行记录、修订版本 | 未建好的数据模型、复杂插件 UI |
| 用 YAML 批量搭完整系统 | DSL Reconciler / 解决方案 | 一次性创建表、页面、仪表盘和图表 | 逐字段微调、权限、工作流、数据导入 |
| 启用或停用 NocoBase 插件 | Plugin Manage | 查看插件目录/状态、启用、停用、读回校验 | 写插件代码 |
| 跨环境交付 | Publish | 备份还原、迁移发布 | 未验证的开发中功能 |
| 阶段性可回滚版本 | Version Control | 完成一个可验证里程碑后保存版本 | 每改一个字段就存一次 |
| 深度二开、业务 API、专用组件 | Plugin Development | 前后端插件、集合、API、ACL、客户端区块/操作/路由 | 简单页面配置 |
| 页面内少量 JS 扩展 | RunJS | JS 区块、JS 字段、JS 操作，受限沙箱、`ctx` 上下文 | 后端任务、复杂业务服务 |
| 可视化低代码前端逻辑 | FlowEngine | Model + Flow，把前端组件逻辑配置化 | 替代后端工作流 |
| 业务角色智能协作 | AI Employees | 理解上下文、查询/分析/填写/生成、区块任务 | 无审核地执行高风险写操作 |
| 企业知识问答 | AI Knowledge Base | RAG 检索、企业文档、可追溯回答 | 实时业务状态同步 |

**默认判断原则：**

1. 能用数据模型表达的，先建模。
2. 能用工作流稳定执行的，不交给大模型临场判断。
3. 能用 NocoBase 现成页面配置的，不写插件。
4. 只有跨出低代码边界时，才进入插件开发。
5. AI 员工负责理解、生成、补全、解释、辅助填写，不默认拥有无限操作权。

---

## 3. 标准开发流程

所有 AI 开发者处理 NocoBase 任务时，按这个顺序执行：

1. **识别目标面**
   - 环境、数据模型、页面、工作流、权限、AI 员工、插件、发布，先归类。
   - 如果需求同时包含多类，按“数据模型 -> 权限 -> 页面 -> 工作流 -> AI 员工 -> 插件扩展 -> 发布”拆分。
   - 为每一类任务指定官方 `nocobase/skills` 中的优先 skill。

2. **读取当前状态**
   - 不凭空假设已有表、字段、页面、工作流、插件。
   - 对 NocoBase 已运行应用，应先读取现有数据源、集合、页面、插件、角色、工作流状态。

3. **选择开发路径**
   - 先读对应官方 skill 的 `SKILL.md`。
   - 微调已有页面：UI Builder。
   - 微调字段和关系：Data Modeling。
   - 自动化业务流程：Workflow。
   - 新能力突破低代码边界：Plugin Development。
   - 角色化 AI 协作：AI Employees + UI Builder 绑定任务。
   - 大规模 YAML 初始搭建：DSL Reconciler，但该能力官方提示仍在测试中。

4. **先设计，再执行**
   - 涉及插件脚手架、数据删除、权限变更、发布迁移、高风险工作流，应先输出方案并等待确认。
   - 普通页面字段调整可以边查边改，但必须读回校验。

5. **实现后读回验证**
   - 数据模型：验证表、字段、关联两端状态。
   - 页面：验证页面可见、区块可见、操作可触发。
   - 工作流：验证启用状态、节点链、触发器、执行记录。
   - AI 员工：验证模型、角色提示词、技能、工具权限、区块任务。
   - 插件：验证编译、启用、API、ACL、前端加载。

6. **阶段性交付**
   - 完成一个可用里程碑后，再创建可恢复版本。
   - 版本说明只写完成结果，不写密钥、Token、内部账号等敏感信息。

---

## 4. AI Builder 使用规范

### 4.1 环境管理

环境管理用于 NocoBase 实例安装、初始化、升级、启动、停止、多环境管理。常见命令包括：

- `nb env list`
- `nb env add`
- `nb init --ui`
- `nb upgrade`
- `nb app stop`
- `nb app start`

使用边界：

- 适合处理“装一下 NocoBase”“启动项目”“升级实例”“初始化环境”。
- 不负责业务页面、数据表、工作流、权限或插件开发。
- 环境变更前要确认目标实例和当前环境，避免误操作生产环境。

本项目目标数据库：

| 配置项 | 值 | 要求 |
|---|---|---|
| `DB_DIALECT` | `postgres` | 固定使用 PostgreSQL |
| `DB_HOST` | `120.76.157.51` | 外部 PostgreSQL 地址 |
| `DB_PORT` | `5432` | PostgreSQL 默认端口 |
| `DB_DATABASE` | `nocobaseV2` | 数据库名包含大写 `V`，SQL 中必须写成 `"nocobaseV2"` |
| `DB_USER` | `pgadmin` | NocoBase 连接用户 |
| `DB_PASSWORD` | 私密 `.env` 填写 | 不写入文档、Git、交付说明、截图或日志 |
| `DB_STORAGE` | `storage/db/nocobase-dev.sqlite` | 仅 SQLite 使用，PostgreSQL 下忽略 |
| `TZ` | `Asia/Shanghai` | 应用和容器统一时区 |

开发 Agent 必须遵守：

1. `.env.example` 和 `.env.production.example` 中 `DB_PASSWORD` 只能写占位符。
2. 生产和联调默认连接外部 PostgreSQL，不默认切回 SQLite。
3. Docker Compose 中的 `postgres` 服务只作为本地开发可选项，不覆盖外部数据库配置。
4. 建库脚本必须提醒使用者连接到默认维护库，例如 `postgres`，并以有建库权限的用户执行。

### 4.2 数据建模

数据建模 Skill 用于自然语言创建和管理 NocoBase 数据表，支持：

- 创建、修改、删除数据表。
- 普通表、树表、文件表、日历表、SQL 表、视图表、继承表。
- 添加、修改、删除字段。
- 内置字段类型、关系字段、插件扩展字段类型。
- 基于现有模型增加新模块。

开发规范：

- 先确认目标数据源已配置。
- 建表时不要手动指定 `id`, `createdAt`, `createdBy`, `updatedAt`, `updatedBy` 等系统字段，官方说明这些由服务端自动生成。
- 修改关联关系前，先检查外键和反向字段，再决定修改还是删除重建。
- 每次变更后必须读回校验集合、字段、关系状态。
- 不用数据建模 Skill 做页面布局、ACL、工作流编排。

对商品上架系统的建议：

- 商品、SKU、图片、视频、平台账号、规则、抓取任务、发布记录都应先建成清晰集合。
- “AI 处理结果”不要只放一个大 JSON 字段，应拆出可审核字段，例如标题、卖点、价格、类目、属性、图片状态、发布校验状态。

### 4.3 UI Builder

UI Builder 用于创建和编辑 v2 Modern UI 页面、区块、字段、操作、布局、联动。

适合：

- 新建菜单页、列表页、表单页、详情页、仪表盘。
- 添加表格区块、表单区块、筛选区块、操作按钮。
- 修改字段展示、区块布局、操作联动。
- 把 AI 员工入口绑定到区块 Actions。

不适合：

- 设计数据模型。
- 配置 ACL。
- 编排工作流。
- 处理 v1 页面。
- 处理页面错误根因分析。

开发规范：

- 页面先按业务主流程组织，不要把所有操作塞进一个列表。
- 对“商品上架”类产品，建议页面按：抓取 -> 信息处理 -> 预览编辑 -> 发布 -> 商品库 -> 规则 -> 发布记录。
- 所有 AI 员工任务入口应绑定到具体区块或具体记录，减少用户每次重新描述上下文。

### 4.4 Workflow

工作流用于可视化编排自动化业务流程。官方工作流由触发器和节点组成：

- 触发器：数据表事件、定时任务、操作前事件、操作后事件、自定义操作事件、审批、Webhook。
- 节点：AI 节点、流程控制、计算、数据操作、人工处理、HTTP 请求、JavaScript 脚本、通知、邮件、响应等。
- 高级能力：变量、执行记录、版本管理、高级选项。

适合：

- 商品抓取完成后自动进入信息处理。
- AI 处理结束后自动生成待审核商品。
- 审核通过后自动进入发布队列。
- 发布失败后自动记录原因并触发重试或人工修复。
- 调用外部 API、平台 API、图片处理服务。

不适合：

- 在数据模型不稳定时先写复杂工作流。
- 把大模型当成确定性事务引擎。
- 在没有权限设计的情况下执行跨表写入。

工作流开发规范：

- 每条工作流只负责一个明确业务目标。
- 复杂流程拆成多个子流，避免一个流程塞满所有节点。
- 重要节点要保留执行记录和错误信息。
- 启用前先确认版本，修改后读回校验节点链。
- 对失败重试、幂等、重复发布要明确处理策略。

### 4.5 DSL Reconciler / 解决方案

官方将“解决方案 Skill”定义为从 YAML 配置文件批量搭建应用，一次性创建数据表、页面、仪表盘和图表。官方同时提示该功能仍在测试中，稳定性有限。

适合：

- 初始搭建整套 CRM、工单、进销存、商品搬运系统原型。
- 用 `structure.yaml` 批量建表和页面。
- 用 `enhance.yaml` 配置弹窗和表单。
- 自动生成仪表盘 KPI 和图表。

不适合：

- 逐字段微调。
- 数据迁移或数据导入。
- 配置权限和工作流。

项目规范：

- 只有当用户明确要求 YAML、DSL、可提交到 Git、`cli push` 或整套应用搭建时，才使用 DSL Reconciler。
- 已有系统的微调，优先走 Data Modeling 或 UI Builder。
- 使用 DSL 变更后要确认增量更新不会破坏已有数据。

### 4.6 Plugin Manage

插件管理 Skill 用于查看、启用、停用 NocoBase 插件，并读回校验操作结果。

适合：

- 查看当前有哪些插件及启用状态。
- 启用某个插件。
- 停用某个插件。

注意：

- 部分插件启用后需要重启应用。
- 插件管理不等于插件开发。
- 停用插件前要确认是否影响已有页面、字段类型、工作流节点或 AI 员工能力。

### 4.7 Publish

发布管理用于跨环境发布，主要有两条路径：

- 备份还原：适合完整覆盖。
- 迁移发布：适合同步策略可控的增量发布。

规范：

- 发布前必须确认源环境和目标环境。
- 发布前需要有备份。
- 生产发布前必须有功能验收记录。
- 涉及数据覆盖时必须人工确认。

### 4.8 Version Control

版本控制用于在完成并验证一个有意义阶段后创建可恢复版本。

适合保存版本的时机：

- 完成一组数据模型并验证。
- 完成一个页面模块并可访问。
- 完成一个工作流并通过测试执行。
- 完成一个插件功能并启用验证。
- 完成一次发布前检查。

不适合：

- 每个字段改动都保存。
- 未验证就保存。
- 版本说明包含密钥、账号、Token、内部 URL。

---

## 5. AI Employees 使用规范

### 5.1 AI 员工定位

AI Employees 是 NocoBase 深度集成在业务系统中的智能体能力。它可以感知页面、区块、数据结构与选中内容，也可以调用技能和工具完成查询、分析、填写、配置、生成等任务。

在本项目里，AI 员工应被设计为“角色化业务同事”，而不是泛聊天机器人。

建议角色：

| AI 员工 | 适合任务 | 关键能力 |
|---|---|---|
| 商品情报员 | 识别商品链接、提取卖点、判断是否适合搬运 | Web 抓取结果理解、竞品分析 |
| 信息清洗员 | 标题翻译、属性补全、类目建议、违规词检查 | Data query、Form filler、文本生成 |
| 媒体处理员 | 图片/视频处理状态解释、失败原因归因 | 文件上下文、处理任务工具 |
| 发布助理 | 发布前校验、失败修复建议、重试策略 | 工作流工具、平台规则知识库 |
| 规则顾问 | 解释平台规则、建议价格和字段映射 | 知识库、规则表查询 |

### 5.2 快速开始配置

最小可用路径：

1. 配置至少一个 LLM 服务。
2. 启用至少一个 AI 员工。
3. 打开会话并开始协作。
4. 按需开启联网搜索和快捷任务。

LLM 服务支持 OpenAI、Gemini、Claude、DeepSeek、Qwen、Kimi、Ollama 等。配置项包括 Provider、Title、API Key、Base URL、Enabled Models。配置后应先 Test flight。

### 5.3 内置 AI 员工

官方 AI Employees 目录列出内置员工：

- Atlas：团队领导
- Viz：洞察分析师
- Dex：数据整理专家
- Ellis：电子邮件专家
- Lexi：翻译助理
- Vera：研究分析师
- Nathan：前端工程师
- Lina：本地化工程师
- Dara：数据可视化专家

规范：

- 能复用内置员工时先复用。
- 业务强相关角色再新建自定义员工。
- 自定义员工要清楚写明职责范围、禁止事项、输出格式和可调用工具。

### 5.4 新建 AI 员工

自定义 AI 员工需要配置：

- `Username`：唯一标识。
- `Nickname`：显示名称。
- `Position`：岗位描述。
- `Avatar`：头像。
- `Bio`：简介。
- `About me`：系统提示词。
- `Greeting message`：会话欢迎语。
- `Role setting`：身份、目标、边界、输出风格。
- `Skills`：技能权限。
- 知识库配置：启用后可绑定企业知识。

Role setting 至少包含：

- 角色定位与职责范围。
- 任务处理原则和回答结构。
- 禁止事项。
- 信息边界。
- 语气风格。
- 是否允许修改表单数据。
- 什么时候必须请用户确认。

### 5.5 模型配置

默认情况下，AI 员工可使用所有已启用的 LLM 服务和模型。也可以给单个员工配置专用模型。

建议：

- 高稳定业务流程：固定模型。
- 成本敏感任务：使用低成本模型。
- 翻译、视觉、多模态、代码生成等专项任务：使用专项模型。
- 不同员工不要无差别共享高权限模型和高成本模型。

### 5.6 上下文与区块绑定

AI 员工可以把页面区块作为上下文。快捷任务还支持在区块 Actions 上绑定 AI 员工，让用户一键开始任务。

快捷任务配置项：

- `Title`：任务标题。
- `Background`：作为系统提示词的任务背景。
- `Default user message`：默认用户消息。
- `Work context`：默认发送的上下文。
- `Skills`：使用预设技能或自定义选择技能。
- `Tools`：使用预设工具或自定义选择工具。
- `Send default user message automatically`：是否点击后自动发送。

项目建议：

- 在“待处理商品”区块绑定“信息清洗员”。
- 在“预览编辑”区块绑定“发布助理”和“规则顾问”。
- 在“发布失败记录”区块绑定“发布修复员”。
- 每个任务默认带上当前记录、平台、目标店铺、规则模板、失败原因。

### 5.7 Skills 与 Tools 的区别

**Skills** 是专业领域知识指南，指导 AI 员工如何使用多个工具处理专业任务。官方说明当前技能不支持自定义，仅由系统预置。

通用技能包括：

- Data metadata：获取系统数据模型、数据表和字段元数据。
- Data query：查询数据表，支持过滤、聚合等。
- Business analysis report：基于业务数据生成分析报告。
- Document search：搜索和读取预置文档，主要用于编写 JS 代码等。

专属技能包括：

- Data modeling：数据建模技能，属于 Orin。
- Frontend developer：编写和测试前端区块 JS 代码，属于 Nathan。

**Tools** 定义 AI 员工能做什么。工具分为：

- General tools：所有员工共享。
- Employee-specific tools：员工专属。
- Custom tools：通过工作流 `AI employee event` 触发器自定义。

工具权限：

- `Ask`：调用前询问确认。
- `Allow`：允许直接调用。

强制规范：

- 涉及数据修改、发布、删除、批量导入、跨权限查询的工具默认 `Ask`。
- 只读查询、建议生成、图表生成可根据风险配置 `Allow`。
- 高风险工具必须写清楚权限来源、操作范围和审计记录。

### 5.8 MCP 接入

AI 员工可以接入遵循 MCP 的服务，使用 MCP 提供的工具完成任务。

MCP 支持：

- Stdio。
- HTTP Streamable。
- HTTP SSE。

配置项：

- 名字：唯一标识。
- 标题：展示名称。
- 描述：功能说明。
- Stdio：命令、参数、环境变量。
- HTTP：URL、请求头。
- 可用性测试。
- 工具权限：`Ask` / `Allow`。

注意：

- Stdio 命令需要部署服务器环境支持。
- Docker 镜像通常只支持 Node.js / npx 等 Node 环境命令。
- 接入外部 MCP 前必须确认数据边界和凭证安全。

### 5.9 Knowledge Base / RAG

AI 知识库插件为 AI 员工提供 RAG 检索能力。RAG 通过检索增强生成，将企业文档、专业领域文档等内容召回并注入 LLM 上下文。

适合：

- 平台发布规则。
- 类目属性说明。
- 违禁词和合规规则。
- 商品标题规范。
- 物流、退货、售后政策。
- 内部 SOP。

知识库相关目录包括：

- 向量数据库。
- 向量存储。
- 知识库。
- 文档管理。
- 分段管理。
- 命中测试。
- 设置。
- RAG。
- External 知识库插件开发。

规范：

- 知识库内容要有来源和更新时间。
- 平台规则类知识要定期更新。
- 关键回答应带出依据，避免 AI 自行编造规则。
- 命中测试是上线前必做项。

### 5.10 AI 员工权限

官方文档明确区分两类数据访问：

1. 系统内置数据查询工具：遵循当前用户的数据权限。
2. 工作流自定义业务工具：由工作流业务逻辑控制，可能不受当前用户权限限制。

安全规范：

- 默认使用遵循用户权限的系统内置工具。
- 只有明确业务需求时，才用工作流自定义工具突破用户权限。
- SQL Execution 等高权限工具仅授权给管理员或高级分析师。
- 自定义 SQL 工具应限制只读 `SELECT`，并限制可访问表和字段。
- 敏感任务放到特定区块，通过页面权限和任务可见性隔离。

多层防护：

- AI 员工访问层：控制哪些角色可使用员工。
- 任务可见性层：控制任务出现在哪些区块。
- 工具授权层：工作流中验证用户身份和权限。
- 数据访问层：用用户权限或业务逻辑控制数据范围。
- 审计层：记录 AI 员工的数据访问和工具调用行为。

---

## 6. 插件开发规范

### 6.1 什么时候写插件

只有以下情况才进入插件开发：

- 现有 NocoBase 配置能力无法满足。
- 需要专用后端 API 或复杂业务服务。
- 需要自定义资源、事件、命令行、定时任务。
- 需要自定义客户端区块、字段、操作、路由。
- 需要封装可复用业务能力，供多个页面或项目复用。
- 需要扩展工作流触发器或节点。

不要因为“写代码更熟”就跳过低代码能力。

### 6.2 插件基础结构

NocoBase 是微内核架构，核心负责插件生命周期、依赖管理和基础能力封装，业务功能以插件提供。

典型插件结构：

```text
plugin-hello/
├─ package.json
├─ client-v2.js
├─ server.js
└─ src/
   ├─ client-v2/
   └─ server/
```

目录约定：

- `packages/plugins`：本地开发插件，优先级最高。
- `storage/plugins`：已编译插件，例如上传或发布的插件。

生命周期：

- create：创建插件模板。
- pull：拉取插件包。
- enable：首次启用会注册和初始化。
- disable：停用插件。
- remove：卸载插件。

### 6.3 插件开发硬规则

本项目对 NocoBase 插件开发采用以下硬规则：

1. 客户端代码放在 `src/client-v2/`。
2. 客户端从 `@nocobase/client-v2` 导入 `Plugin`。
3. v2 页面路径使用 `/v2/` 前缀。
4. 不使用 `this.app.use()`。
5. 不随意新增 React Provider。
6. 大型组件使用 lazy component loader。
7. 服务端资源使用 `resourceManager`。
8. 服务端 API 必须配置 ACL。
9. 数据结构使用 `defineCollection` 或官方集合机制。
10. i18n 使用 `zh-CN.json` / `en-US.json`。
11. 不在 `load()` 中写入业务数据。
12. 脚手架、迁移、删除、权限变更前必须先确认方案。

### 6.4 插件与商品上架系统的关系

建议插件边界：

- `plugin-ai-listing-core`：商品、SKU、媒体、任务、规则、发布记录集合。
- `plugin-ai-listing-capture`：URL/店铺/关键词/批量导入抓取 API 和任务。
- `plugin-ai-listing-processing`：AI 处理、图片处理、规则替换、状态机。
- `plugin-ai-listing-publish`：平台发布、重试、发布记录、失败诊断。
- `plugin-ai-listing-ui`：高度定制的前端区块和操作。

如果早期 MVP 能通过 NocoBase 配置完成，则先少写插件；等流程验证后再插件化稳定能力。

---

## 7. Workflow 与 AI 工具编排

### 7.1 内置工作流优先

工作流内置能力能覆盖大部分自动化：

- 审批。
- 数据同步。
- 提醒。
- 数据创建/更新/删除。
- HTTP 请求。
- JavaScript 脚本。
- 人工处理。
- 条件、循环、并行、子流程。
- AI 对话、结构化输出、多模态对话。
- AI 员工节点。
- AI 知识库节点。

### 7.2 什么时候扩展工作流

官方工作流开发文档说明，内置触发器和节点不可能覆盖所有场景，因此可以扩展触发器类型和节点类型。

适合扩展：

- 平台商品发布节点。
- 商品抓取完成触发器。
- 图片处理完成触发器。
- 平台回调 Webhook 标准化触发器。
- 自定义合规校验节点。

不适合扩展：

- 一次性业务临时流程。
- 本可用 HTTP 请求节点完成的外部调用。
- 本可用 JS 节点完成的轻量转换。

### 7.3 AI 员工工具化

把工作流暴露成 AI 员工 Custom tool 时：

- 工作流触发器使用 `AI employee event`。
- 工具描述要写清楚用途、输入、输出、限制。
- 修改类工具默认 `Ask`。
- 查询类工具优先遵循用户权限。
- 如工作流工具突破用户权限，必须写明业务理由和访问范围。
- 工具输出应结构化，便于 AI 员工解释和后续处理。

---

## 8. RunJS、FlowEngine、Shared Components

### 8.1 RunJS

RunJS 是 JS 区块、JS 字段、JS 操作的 JavaScript 执行环境。它运行在受限沙箱，支持：

- top-level `await`。
- `ctx.importAsync()` 导入 ESM。
- `ctx.requireAsync()` 导入 UMD/AMD。
- `ctx.render()` 容器内渲染。
- 全局变量：`window`, `document`, `navigator`, `ctx`。

适合：

- 页面局部动态展示。
- 简单前端计算。
- 临时原型 JS 操作。
- 用 `ctx` 调用上下文能力。

不适合：

- 后端长期任务。
- 复杂权限逻辑。
- 核心业务服务。
- 大规模数据处理。

### 8.2 FlowEngine

FlowEngine 是 NocoBase 2.0 的前端无代码/低代码引擎。核心概念：

- Model：管理组件属性、状态、渲染方式、Flow、事件分发和生命周期。
- Flow：服务于 Model 的逻辑流，把属性或事件逻辑拆解为有序 Step。

使用建议：

- 当组件逻辑需要可视化配置、可复用、可编排时，再考虑 FlowEngine。
- 普通业务页面优先用 UI Builder 和现有区块。
- 插件组件需要暴露给低代码配置时，再深入 FlowModel。

### 8.3 Shared Components

client-v2 公共组件可在插件页面、设置页、表单中复用。

常用组件入口：

- 表单容器：`DialogFormLayout`, `DrawerFormLayout`。
- 表单字段：`RemoteSelect`, `JsonTextArea`, `PasswordInput`, `VariableInput`, `VariableTextArea`, `TypedVariableInput`。
- 筛选：`CollectionFilter`, `CollectionFilterPanel`。
- 表格：`Table`, `SortableRow`, `SortHandle`。
- 图标：`Icon`。
- 扩展注册：`createFormRegistry`。

建议：

- 设置页、弹窗、抽屉、筛选、拖拽表格优先查 Shared Components。
- 普通输入框、按钮、提示信息直接用 Antd。

---

## 9. 安全与审计红线

### 9.1 AI Agent 权限

官方安全文档强调：AI Agent 没有额外权限，权限来自 API Key 绑定角色或 OAuth 当前用户角色。默认推荐 OAuth。

规范：

- 不给 AI Agent 绑定 root/admin。
- API Key 使用最小角色权限。
- 默认使用 OAuth 当前用户权限。
- 高风险操作必须有人类确认。
- 启用请求日志和审计日志。

### 9.2 高风险操作清单

以下操作必须人工确认：

- 删除表、字段、关系。
- 批量删除数据。
- 发布到真实店铺。
- 批量发布商品。
- 启用高权限工具。
- 修改 ACL。
- 生产环境发布。
- 备份还原覆盖。
- 执行动态 SQL。
- 修改插件生命周期状态。

### 9.3 AI 员工工具权限

默认策略：

- 只读查询：可考虑 `Allow`，仍需遵循用户权限。
- 修改表单：`Ask`。
- 创建/更新/删除记录：`Ask`。
- 发布商品：`Ask`。
- SQL 执行：仅管理员，且尽量只读。
- 跨权限统计：仅通过审核过的工作流模板。

### 9.4 日志与全局异常处理

所有 NocoBase AI 开发任务都必须把“可定位、可恢复、用户可理解”作为基础要求。不能只把错误打印到控制台，也不能把后端异常原样抛给运营人员。

服务端日志要求：

- 自定义 API、workflow 节点、worker job、AI 员工工具都要输出结构化日志。
- 日志字段至少包含：`traceId`、`taskId`、`productId`、`workflowKey`、`userId`、`actorType`、`action`、`durationMs`、`status`、`errorCode`。
- 禁止记录平台密钥、OAuth token、Cookie、完整账号凭证、包含敏感字段的原始请求体。
- 外部平台响应可记录 `statusCode`、`requestId`、`errorCode`、摘要信息，不直接落完整敏感 payload。
- workflow/worker 失败必须同步写入任务明细表，例如 `aiListingTaskSteps`，必要时再写入审计表，例如 `aiListingAuditLogs`。

API 错误返回统一结构：

```json
{
  "ok": false,
  "data": null,
  "warnings": [],
  "errors": [
    {
      "code": "CAPTURE_PAGE_BLOCKED",
      "message": "Page extraction failed with anti-bot challenge",
      "friendlyMessage": "当前商品页暂时无法自动抓取，请稍后重试，或改用手动补充。",
      "field": "sourceUrl",
      "recoverable": true,
      "retryable": true
    }
  ],
  "traceId": "trc_..."
}
```

前端异常处理要求：

- NocoBase 插件不能通过 `this.app.use()` 或全局 React Provider 包裹整个应用。
- 自定义 `client-v2` 页面要在页面根组件内使用局部 `ErrorBoundary`，例如 `ListingPageErrorBoundary`，防止单页白屏。
- 自定义 API 请求统一走 `requestWithFriendlyError`，负责解析 `friendlyMessage`、`traceId`、`retryable`，并转换为页面可展示的错误对象。
- 表单字段错误用字段级错误提示；业务错误用 `Alert`、`message` 或 `notification`；页面级致命错误用友好错误页。
- 错误文案必须说明三件事：发生了什么、用户可以怎么处理、支持排查用的 `traceId`。
- 正常业务流不得在浏览器控制台出现未处理的 `Promise rejection` 或 React error overlay。

推荐前端错误展示文案结构：

```text
抓取失败
当前商品页暂时无法自动抓取。你可以稍后重试，或切换为手动补充商品信息。
错误编号：CAPTURE_PAGE_BLOCKED
追踪编号：trc_20260629_xxx
```

---

## 10. 本项目的推荐技术路线

结合“新手电商人员快速上架商品”的目标，建议路线如下：

### 10.1 MVP 阶段

优先使用 NocoBase 配置和少量插件：

1. Data Modeling 建商品、SKU、媒体、平台账号、规则、任务、发布记录。
2. UI Builder 搭建设计稿里的主要页面。
3. Workflow 编排抓取、处理、审核、发布、重试。
4. AI Employees 负责标题改写、属性补全、类目建议、发布失败解释。
5. Knowledge Base 放平台规则、类目规则、标题规范。
6. Plugin Development 只做抓取、平台 API、图片处理、发布这类低代码无法稳定覆盖的能力。

### 10.2 稳定阶段

当业务流程跑通后：

1. 把高频流程固化为插件 API。
2. 把可复用 UI 固化为 client-v2 区块。
3. 把 AI 员工任务绑定到区块和记录。
4. 把发布前校验做成工作流节点。
5. 把失败重试和错误归因做成标准流程。
6. 把规则管理做成可导入、可版本化的配置。

### 10.3 不建议的路线

- 一开始就全部写成独立 SaaS，不利用 NocoBase 的数据模型、权限、页面、工作流。
- 让 AI 员工直接全自动发布，不经过校验和确认。
- 把平台规则只写进提示词，不做知识库和规则表。
- 把所有商品处理结果塞进一个 JSON 字段，导致不可筛选、不可审核、不可追溯。
- 没有任务状态机，靠人工判断每条商品到了哪一步。

---

## 11. 开发前检查清单

每次开始开发前，AI 开发者必须检查：

- 是否明确目标环境。
- 是否确认当前任务应使用哪些官方 NocoBase skills。
- 是否已经读取对应官方 skill 的 `SKILL.md`。
- 是否读取了当前数据模型。
- 是否知道目标页面属于 v2 Modern UI。
- 是否明确需要低代码配置还是插件开发。
- 是否识别了权限影响。
- 是否存在生产数据风险。
- 是否需要工作流执行记录。
- 是否需要 AI 员工工具调用确认。
- 是否需要知识库来源更新。
- 是否需要结构化日志、标准错误码和 `traceId`。
- 是否已有页面级友好异常处理和 API 请求错误封装。
- 是否需要版本控制快照。

---

## 12. 交付验收清单

数据模型：

- 表存在。
- 字段类型正确。
- 关联两端正确。
- 系统字段由服务端生成。
- 示例数据可正常读写。

页面：

- 菜单可见。
- 页面可打开。
- 区块可加载。
- 筛选、分页、操作按钮可用。
- AI 员工入口显示在正确区块。
- API 失败时有中文友好提示、下一步动作和 `traceId`。
- 页面组件异常时显示错误态，不白屏。

工作流：

- 触发器正确。
- 节点链正确。
- 变量引用正确。
- 启用状态正确。
- 至少有一次测试执行记录。
- 失败路径有错误码、错误摘要、`traceId` 和重试策略。

AI 员工：

- LLM 服务可用。
- 员工已启用。
- Role setting 明确。
- Skills 和 Tools 配置正确。
- 高风险工具为 `Ask`。
- 区块任务可触发。
- 知识库命中测试通过。
- 工具调用失败时有友好错误，且不泄露内部堆栈或平台密钥。

插件：

- 服务端编译通过。
- 客户端加载通过。
- API 有 ACL。
- i18n 完整。
- 自定义 API 统一返回 `ok/data/warnings/errors/traceId`。
- 服务端日志包含 `traceId`、`taskId`、`action`、`durationMs`、`status`、`errorCode`。
- 插件启用后读回校验。
- 需要重启时已说明。

发布：

- 有备份。
- 有版本说明。
- 有回滚方案。
- 源环境和目标环境确认。
- 敏感信息未写入版本说明。

---

## 13. 给后续 AI 开发者的标准提示词

可直接复制给后续 AI 开发者：

```text
你是本项目的 NocoBase AI 开发者。开始前请先阅读 outputs/nocobase-ai-developer-official-guide.md。

本次任务请先判断属于哪类开发路径：环境管理、数据建模、UI Builder、Workflow、AI Employees、RunJS、FlowEngine、插件开发、插件管理、发布或版本控制。

请遵守以下规则：
1. 不凭空假设现有数据模型、页面、工作流或插件，先读取当前状态。
2. 先判断并读取对应官方 NocoBase skill：env-manage、data-modeling、ui-builder、workflow-manage、acl-manage、ai-employee、plugin-development、plugin-manage、publish-manage、revision、data-analysis、utils 等。
3. 能用 NocoBase 配置解决的，不优先写插件。
4. 涉及插件脚手架、ACL、数据删除、发布、生产环境、备份还原、高风险工具，先输出方案并等待确认。
5. AI 员工只负责理解、分析、生成、填写和辅助决策；稳定流程交给数据模型、工作流和插件。
6. 高风险 AI 工具默认 Ask；只读工具也要遵循用户权限。
7. 插件开发必须使用 client-v2，客户端代码在 src/client-v2，服务端 API 配 ACL，不使用 this.app.use() 和随意新增 Provider。
8. 自定义 API、workflow、worker、AI 工具必须有结构化日志、标准错误码和 traceId；前端必须有友好错误态，不允许白屏或英文堆栈。
9. 完成后读回校验，并说明验证结果。
```

---

## 14. AI 开发者任务契约

后续每个 AI 开发者接到任务时，必须先把自然语言需求转换成任务契约。任务契约是开发前的“共同语言”，避免 AI 直接动手改错环境、错表、错页面或错插件。

### 14.1 标准任务契约模板

```yaml
task:
  title: "一句话目标"
  business_goal: "这个功能解决什么业务问题"
  scope:
    include:
      - "本次必须做的内容"
    exclude:
      - "本次明确不做的内容"
  target:
    nocobase_root: "NocoBase 项目根目录"
    app_url: "目标实例地址，必须确认是否为开发环境"
    ui_mode: "v2 Modern UI"
    plugin: "涉及插件名，没有则写 none"
    collections:
      - "涉及集合名"
    pages:
      - "涉及页面或菜单"
    workflows:
      - "涉及工作流"
  official_skills:
    required:
      - "本次必须读取和使用的官方 NocoBase skill"
    optional:
      - "可能需要但不一定使用的官方 NocoBase skill"
    not_used_reason:
      - "未使用某个看似相关 skill 的原因"
  risks:
    data_mutation: "none|read|create|update|delete|publish"
    permission_change: true
    production_impact: false
    external_api: true
  observability:
    trace_id_required: true
    error_codes:
      - "需要覆盖的错误码"
    frontend_error_state: "页面级|表单级|行级|none"
  acceptance:
    - "可验证验收点 1"
    - "可验证验收点 2"
  evidence:
    - "需要读回的命令或页面"
    - "需要截图或执行记录的位置"
```

### 14.2 任务拆分原则

一个任务如果同时包含数据模型、页面、工作流、AI 员工和插件开发，不要混在一个步骤里实现。推荐拆成：

1. 数据模型任务：只建表、字段、关系、索引、基础 ACL。
2. 页面任务：只搭页面、区块、字段、操作、筛选、弹窗。
3. 工作流任务：只处理触发器、节点链、变量、执行记录。
4. AI 员工任务：只处理员工角色、提示词、知识库、工具、区块快捷任务。
5. 插件任务：只处理低代码无法完成的 API、任务队列、平台适配、专用组件。
6. 验收任务：只做读回、执行、截图、日志、异常路径确认。

### 14.3 开发前必须读回的状态

| 任务类型 | 必读状态 | 不允许的做法 |
|---|---|---|
| 数据建模 | 数据源、集合、字段、关联、现有数据量 | 直接按猜测新增同名字段 |
| UI 页面 | v2 页面、菜单、区块、字段元数据、当前用户权限 | 修改 v1 页面或直接写内部 schema |
| 工作流 | 工作流列表、目标工作流详情、节点、版本执行次数 | 已执行版本上直接改节点 |
| AI 员工 | 已启用员工、模型、技能、工具、知识库、目标区块 | 为确定性按钮强行创建 AI 员工 |
| 插件 | 项目类型、插件目录、package、已启用插件、NocoBase 版本 | 跳过方案确认直接脚手架 |
| 发布 | 源环境、目标环境、备份、迁移记录、版本说明 | 无备份覆盖目标环境 |

### 14.4 交接给下一个 AI 开发者的信息

每次完成后，必须留下：

- 改了哪些文件、集合、页面、工作流、员工或插件。
- 关键业务决策，例如“发布先用模拟发布，不接真实店铺”。
- 验证证据，例如读回结果、测试执行 ID、页面路径、截图路径。
- 未完成项和原因。
- 下一步建议，只写和当前目标直接相关的内容。

---

## 15. 商品上架系统的 NocoBase 落地蓝图

本项目目标是“新手电商人员给一个商品链接，就能快速生成可发布商品”。NocoBase 应作为业务中台和 AI 协作平台，而不是只当后台表单。

### 15.1 能力分层

| 层级 | 负责能力 | NocoBase 实现 |
|---|---|---|
| 数据层 | 商品、SKU、媒体、任务、规则、平台账号、发布记录 | Collections + Relations + ACL |
| 流程层 | 抓取、处理、审核、发布、重试、失败归因 | Workflow + 插件服务 |
| AI 层 | 标题改写、属性补全、类目建议、描述生成、失败解释 | AI Employees + Tools + Knowledge Base |
| 插件层 | URL 抓取、平台 API、图片处理、队列、发布适配器 | Plugin Development |
| 页面层 | 工作台、抓取、处理、预览编辑、发布、商品库、规则、历史 | UI Builder + client-v2 定制区块 |
| 审计层 | 谁让 AI 改了什么、谁发布了什么、失败原因 | 审计表 + Workflow executions + 日志 |

### 15.2 设计稿页面与开发路径映射

| 页面 | 优先实现方式 | 需要插件的部分 | AI 员工入口 |
|---|---|---|---|
| 工作台 | UI Builder 仪表盘 + JSBlock/图表 | 汇总指标 API 可后置插件化 | 任务调度、异常解释 |
| 商品抓取 | UI Builder 表单 + 插件 API | URL/店铺/关键词抓取、批量解析 | 抓取策略建议 |
| 信息处理 | 表格 + 工作流批量操作 | 图片处理、字段标准化服务 | 标题/参数/描述处理 |
| 预览编辑 | 详情页 + 编辑表单 + 自定义预览区块 | 图片对比、平台预览组件 | 表单填写、合规建议 |
| 商品发布 | 表格 + 工作流发布按钮 | 平台发布适配器、限速、重试 | 发布前校验、失败修复 |
| 商品库 | 表格/卡片 + 筛选 | 多平台发布链接聚合 | 商品诊断 |
| 规则管理 | 普通 CRUD 页面 | 规则导入/导出可插件化 | 规则解释、规则生成 |
| 发布记录 | 表格 + 详情弹窗 | 错误码归一化 | 失败原因解释 |

### 15.3 MVP 必须闭环的链路

第一阶段不要追求一次覆盖所有平台，必须先闭环：

```text
单个商品 URL
  -> 抓取原始数据
  -> 标准化商品草稿
  -> AI 处理标题/描述/参数/图片
  -> 人工预览编辑
  -> 发布前校验
  -> 模拟发布或单平台发布
  -> 发布记录和失败原因
```

MVP 验收标准：

- 新手只输入链接就能看到商品草稿。
- 商品草稿字段可编辑，且能看出哪些字段由 AI 修改。
- 发布前必须能发现类目未选、图片缺失、价格异常等错误。
- 发布动作必须有记录，失败时能看到明确原因。
- AI 员工只能辅助填写和建议，不能绕过人工确认直接发布。

---

## 16. 插件编码规约

插件是本项目二开的核心承载，但不能把所有能力都塞进插件。只有当 NocoBase 配置、工作流或 RunJS 不足以稳定实现时，才进入插件开发。

### 16.1 插件开发启动门槛

启动插件开发前必须确认：

- 当前目录是 NocoBase 项目根目录，`package.json` 能证明包含 NocoBase 服务端。
- 明确插件名，例如 `@crossborder/plugin-ai-listing`。
- 明确这是源代码开发环境还是 create-nocobase-app 环境。
- 明确本次是新插件、已有插件增量，还是拆分插件。
- 输出功能方案并获得确认后，才能运行 `yarn pm create` 或改现有插件。

### 16.2 推荐单插件结构

早期建议先使用一个业务插件，降低跨插件依赖复杂度：

```text
packages/plugins/@crossborder/plugin-ai-listing/
├─ package.json
├─ src/
│  ├─ server/
│  │  ├─ plugin.ts
│  │  ├─ collections/
│  │  ├─ resources/
│  │  ├─ services/
│  │  ├─ jobs/
│  │  ├─ workflows/
│  │  ├─ acl/
│  │  └─ migrations/
│  ├─ client-v2/
│  │  ├─ plugin.tsx
│  │  ├─ routes/
│  │  ├─ pages/
│  │  ├─ blocks/
│  │  ├─ actions/
│  │  ├─ components/
│  │  └─ locales/
│  └─ locale/
│     ├─ zh-CN.json
│     └─ en-US.json
```

稳定后再按职责拆成 `core`、`capture`、`processing`、`publish`、`ui`。

### 16.3 服务端代码规则

服务端应遵守：

- 集合定义集中放在 `src/server/collections/`。
- API 通过 `resourceManager` 注册，不直接散落在插件 `load()`。
- 复杂业务逻辑放 `services/`，资源层只做参数校验、权限上下文和调用服务。
- 长耗时任务放 `jobs/` 或工作流，不阻塞 HTTP 请求。
- 平台适配器要抽象接口，例如 `publishAdapters/lazada.ts`。
- 每个写操作必须写入审计或任务步骤表。
- 外部平台密钥不进入日志，不进入版本说明，不放前端。
- `load()` 不做数据库写入；初始化数据放 `install()` 或迁移。

### 16.4 客户端代码规则

客户端应遵守：

- 只写 `src/client-v2/`，不写 `src/client/`。
- `Plugin` 从 `@nocobase/client-v2` 导入。
- 页面路径和用户访问说明都使用 `/v2/`。
- 不使用 `this.app.use()`。
- 不新增全局 React Provider。
- 页面组件、区块、设置页采用 lazy loader。
- 通用表格、筛选、抽屉、远程选择优先用 Shared Components。
- 客户端只做交互和展示，不保存平台密钥，不做越权发布。

### 16.5 插件 API 设计约定

API 命名建议：

| API | 用途 |
|---|---|
| `aiListingCapture:startUrlCapture` | 单链接抓取 |
| `aiListingCapture:startStoreCapture` | 店铺抓取 |
| `aiListingCapture:startKeywordCapture` | 关键词抓取 |
| `aiListingTasks:getProgress` | 查询任务进度 |
| `aiListingProcessing:runRule` | 对商品执行处理规则 |
| `aiListingProducts:approveDraft` | 审核商品草稿 |
| `aiListingPublish:precheck` | 发布前校验 |
| `aiListingPublish:publish` | 发布或模拟发布 |
| `aiListingPublish:retryFailed` | 重试失败项 |

返回结构统一：

```json
{
  "ok": true,
  "data": {},
  "warnings": [],
  "errors": [],
  "traceId": "string"
}
```

失败时必须包含可解释错误：

```json
{
  "ok": false,
  "errors": [
    {
      "code": "CATEGORY_MISSING",
      "message": "发布类目未选择",
      "field": "targetCategoryId",
      "recoverable": true
    }
  ],
  "traceId": "string"
}
```

### 16.6 插件验收命令与证据

插件开发完成后至少提供：

- 脚手架或文件变更列表。
- 启用状态：`yarn pm enable <plugin-name>` 的结果。
- 服务端 API 读写测试结果。
- ACL 验证：普通用户不能调用管理员 API。
- v2 页面或设置页路径。
- 客户端无白屏、无 404、无 i18n 缺失。
- 关键路径执行记录，例如抓取任务 ID、发布记录 ID。

---

## 17. Workflow 编排规约

工作流负责稳定、可审计、可重试的流程，不负责大模型自由发挥。

### 17.1 工作流创建原则

- 新工作流默认 `enabled: false`。
- 触发器类型是创建时关键决策，不可猜测。
- 节点必须按顺序创建，不能并发创建节点。
- 每个节点创建后读回 `id` 和 `key`。
- 变量引用使用节点 `key`，不使用节点数字 `id`。
- 已执行过的工作流版本必须先创建 revision，再编辑。
- 启用工作流前必须让用户确认。

### 17.2 商品上架核心工作流

| 工作流 | 触发 | 节点链 |
|---|---|---|
| 单 URL 抓取 | 手动按钮 / 插件 API | 创建任务 -> 调用抓取服务 -> 标准化 -> 保存草稿 -> 更新状态 |
| 批量导入抓取 | 文件上传后 / 手动按钮 | 解析文件 -> 循环 URL -> 子流程抓取 -> 汇总成功失败 |
| 商品信息处理 | 手动按钮 / 状态变更 | 查询草稿 -> 应用规则 -> AI 结构化输出 -> 图片处理 -> 保存处理结果 |
| 发布前校验 | 手动按钮 | 校验字段 -> 校验媒体 -> 校验类目 -> 校验价格库存 -> 输出错误清单 |
| 商品发布 | 人工确认按钮 | 限速 -> 调用平台发布 -> 写发布记录 -> 失败重试计划 |
| 失败诊断 | 发布失败后 | 归一错误码 -> AI 解释 -> 推荐修复动作 -> 通知用户 |

### 17.3 工作流节点设计要求

每个节点必须写清：

- 输入变量来自哪里。
- 输出变量给哪个下游使用。
- 失败是否可重试。
- 失败时是否中断整条流程。
- 是否写任务步骤记录。
- 是否需要人工处理。

### 17.4 工作流验收证据

每条工作流交付时必须提供：

- 工作流名称、key、启用状态。
- 触发器类型和配置摘要。
- 节点列表、顺序、关键节点配置。
- 至少一次测试执行记录。
- 失败路径是否能定位到节点和错误。
- 如果涉及 AI 节点，说明模型输入、结构化输出和失败兜底。

---

## 18. AI 员工与工具契约

AI 员工应是“带上下文和工具的业务角色”，不是直接替代工作流和权限系统。

### 18.1 本项目推荐 AI 员工

| 员工 | 面向用户 | 主要任务 | 可用工具 |
|---|---|---|---|
| 商品抓取助理 | 运营 | 判断来源平台、解释抓取失败、建议抓取范围 | 查询任务、启动抓取 Ask |
| 信息处理助理 | 运营 | 标题改写、属性补全、描述生成、卖点提炼 | 表单填写 Ask、规则查询 Allow |
| 类目合规助理 | 运营/主管 | 类目建议、禁售词检查、平台规则解释 | 知识库检索 Allow、校验工具 Ask |
| 发布助理 | 运营 | 发布前检查、失败解释、重试建议 | 发布前校验 Allow、发布 Ask |
| 数据分析助理 | 主管 | 发布成功率、失败原因、商品处理效率分析 | 只读统计 Allow |

### 18.2 AI 员工使用边界

适合交给 AI：

- 从杂乱商品页面中提炼标题、规格、卖点。
- 根据平台规则给出类目和属性建议。
- 将失败错误转成运营能理解的话。
- 辅助填写表单，并等待人确认。
- 总结批量任务结果和异常。

不适合交给 AI：

- 直接决定是否真实发布。
- 绕过 ACL 查询用户无权访问的数据。
- 长期维护状态机。
- 直接保存核心字段且没有审计。
- 处理平台密钥、付款、财务或高风险数据。

### 18.3 Custom tool 设计模板

每个工具必须可被 AI 读懂，也必须可被工程验证：

```yaml
tool:
  name: "publish_precheck"
  displayName: "发布前校验"
  permission: "Allow"
  trigger: "AI employee event"
  input_schema:
    productId: "number, required"
    targetPlatform: "string, required"
    targetStoreId: "number, required"
  output_schema:
    pass: "boolean"
    errors: "array"
    warnings: "array"
    suggestedFixes: "array"
  safety:
    mutates_data: false
    requires_human_confirm: false
    acl: "current user can read product and store"
```

修改类工具默认：

```yaml
permission: "Ask"
safety:
  mutates_data: true
  requires_human_confirm: true
  audit_required: true
```

### 18.4 表单填写规范

AI 员工可以帮助修改表单数据，但必须遵守：

- 优先写入“建议值”或“AI 草稿字段”，再由用户确认。
- 如果直接填表，必须让用户看见变化。
- 核心字段要记录来源：`manual`、`ai`、`rule`、`platform`。
- 批量填写前展示影响范围。
- 发布相关字段必须经过发布前校验。

### 18.5 AI 员工验收证据

交付 AI 员工时必须提供：

- 员工名称、角色、是否启用。
- 使用的模型范围。
- 绑定的 Knowledge Base。
- Skills/Tools 列表和 Ask/Allow 权限。
- 绑定在哪个页面、区块、按钮或快捷任务。
- 一次真实上下文测试：输入、员工输出、工具调用、结果。

---

## 19. 数据模型规约

数据模型必须支撑流程状态、人工审核、AI 修改、发布追溯，不能只为了当前页面好看。

### 19.1 核心集合建议

| 集合 | 说明 |
|---|---|
| `aiListingProducts` | 商品主表，存最终可审核草稿 |
| `aiListingSkus` | SKU 规格、价格、库存、图片 |
| `aiListingMediaAssets` | 图片、视频、处理前后文件、处理状态 |
| `aiListingCaptureTasks` | 抓取任务，单 URL、店铺、关键词、批量导入统一记录 |
| `aiListingTaskSteps` | 任务步骤明细，便于进度条和失败诊断 |
| `aiListingRules` | 信息替换、价格、图片、类目等规则 |
| `aiListingPlatformAccounts` | 平台账号和店铺配置，密钥只存服务端安全位置 |
| `aiListingPublishRecords` | 发布记录、目标链接、错误码、重试次数 |
| `aiListingAuditLogs` | AI 修改、人工审核、发布动作审计 |

### 19.2 字段设计原则

- 原始抓取数据和标准化商品数据分开。
- AI 输出和人工确认数据分开。
- 商品、SKU、媒体、发布记录不要塞在一个 JSON 字段里。
- 状态字段使用枚举，并写清状态机。
- 价格要保留来源币种、目标币种、汇率、加价策略。
- 图片要保留原图、处理后图、处理类型、处理结果。
- 外部平台 ID 和内部 ID 分开。

### 19.3 状态机最低要求

商品状态建议：

```text
captured
  -> processing
  -> processed
  -> review_required
  -> approved
  -> publishing
  -> published
  -> publish_failed
```

任务状态建议：

```text
pending -> running -> succeeded
                  -> partial_failed
                  -> failed
                  -> cancelled
```

状态变化必须记录：

- 操作人或触发来源。
- 上一个状态和新状态。
- 时间。
- 失败原因。
- 关联工作流执行或任务步骤。

---

## 20. UI Builder 与页面规约

页面要服务新手运营的连续工作流，而不是只展示数据表。

### 20.1 页面操作设计

每个页面操作必须明确：

- 操作对象：单条记录、多条记录、当前区块、全局任务。
- 操作性质：只读、更新、批量、发布、高风险。
- 执行方式：内置操作、JS 操作、工作流、插件 API、AI 员工。
- 操作结果：页面刷新、进度条、任务记录、错误弹窗、通知。

### 20.2 页面区块规范

- 工作台：指标卡、最近任务、平台连接状态、异常任务。
- 商品抓取：输入区、来源平台、抓取内容、历史记录。
- 信息处理：规则选择、待处理商品、进度、媒体处理明细。
- 预览编辑：左侧商品列表、右侧预览/编辑、AI 建议入口。
- 商品发布：发布配置、待发布列表、发布前校验、发布进度。
- 商品库：状态筛选、平台链接、失败重试、导出。
- 规则管理：规则分组、平台筛选、导入导出、启用停用。
- 发布记录：状态、错误原因、重试、目标链接、批次。

### 20.3 AI 员工按钮放置规则

- 记录详情页：放“优化标题”“补全参数”“生成描述”“发布前检查”。
- 列表批量操作：放“批量处理建议”“批量失败解释”，避免直接批量写入。
- 发布页：放“解释失败”“生成修复步骤”，真实发布按钮保持人工操作。
- 规则页：放“解释规则”“生成规则草案”，规则启用仍需人工确认。

### 20.4 页面验收证据

页面任务完成后必须提供：

- 页面路径，必须是 `/v2/`。
- 菜单位置。
- 区块列表。
- 关键字段和按钮列表。
- 至少一个正常操作测试结果。
- 至少一个错误态或空态说明。

---

## 21. 测试与验证模板

开发完成后，不要只说“已完成”，要给证据。

### 21.1 验证报告模板

```markdown
## 验证报告

目标：本次实现的功能目标

环境：
- NocoBase 项目：
- 应用地址：
- 插件：
- 页面：

变更：
- 数据模型：
- 页面：
- 工作流：
- AI 员工：
- 插件文件：

验证：
1. 数据读回：
   - 命令/页面：
   - 结果：
2. 正常路径：
   - 输入：
   - 输出：
3. 异常路径：
   - 输入：
   - 输出：
4. 权限：
   - 角色：
   - 结果：

遗留问题：
- none 或具体问题
```

### 21.2 商品上架端到端测试样例

```text
样例 1：单 URL 抓取成功
输入：一个支持平台的商品链接
期望：创建抓取任务、生成商品草稿、媒体入库、状态 captured/processed

样例 2：URL 抓取失败
输入：不支持平台或失效链接
期望：任务失败，错误码可读，AI 可解释失败原因

样例 3：AI 信息处理
输入：已抓取商品
期望：标题、描述、参数产生 AI 建议，人工可确认或回滚

样例 4：发布前校验失败
输入：缺少类目的商品
期望：校验失败，不允许进入真实发布，提示缺失字段

样例 5：模拟发布成功
输入：校验通过商品
期望：写入发布记录，状态 published 或 simulated_published
```

### 21.3 最低自动化测试建议

- 服务端 API：抓取任务创建、任务进度查询、发布前校验。
- 数据模型：商品-SKU-媒体-发布记录关系。
- 工作流：成功执行和失败执行。
- 权限：普通运营、主管、管理员三个角色。
- 插件客户端：页面打开、按钮触发、错误提示。

---

## 22. 常见失败与恢复指南

### 22.1 插件不显示

排查顺序：

1. 确认访问 `/v2/admin/`，不是旧的 `/admin/`。
2. 确认插件已 `yarn pm enable <plugin-name>`。
3. 确认 `package.json` 插件元信息正确。
4. 确认客户端代码在 `src/client-v2/`。
5. 确认设置页或路由使用 lazy loader。

### 22.2 工作流没有触发

排查顺序：

1. 工作流是否启用。
2. 触发器集合和操作是否正确。
3. 条件是否过窄。
4. 节点链是否完整。
5. 最近执行记录是否有失败 job。

### 22.3 AI 员工没有改表单

排查顺序：

1. 是否绑定了正确区块上下文。
2. 是否启用了 Form filler 或对应工具。
3. 工具权限是否为 `Ask` 且用户确认了。
4. 员工提示词是否要求输出结构化字段。
5. 当前用户是否有修改该记录权限。

### 22.4 抓取或发布接口失败

排查顺序：

1. 平台链接是否支持。
2. 平台账号是否连接且未过期。
3. 限流或验证码是否触发。
4. 错误码是否已归一化。
5. 是否写入任务步骤和发布记录。

### 22.5 页面白屏或按钮无响应

排查顺序：

1. 浏览器控制台错误。
2. `/v2/` 路由是否正确。
3. 区块绑定的集合字段是否存在。
4. JS/RunJS 是否压缩成难读单行导致错误。
5. 客户端是否引用了 v1 包或内部 schema。

---

## 23. 可复用提示词模板

### 23.1 插件开发提示词

```text
请作为 NocoBase 插件开发者执行本任务。

先确认 NocoBase 项目根目录、插件名、现有插件状态和本次功能边界。
在输出方案并获得确认前，不要运行 yarn pm create，不要修改插件文件。

硬规则：
- 客户端只写 src/client-v2
- Plugin 从 @nocobase/client-v2 导入
- 不使用 this.app.use()
- 不新增 React Provider
- 服务端 API 使用 resourceManager 并配置 ACL
- i18n 至少提供 zh-CN 和 en-US
- 完成后读回验证并说明 /v2/ 页面路径
```

### 23.2 工作流开发提示词

```text
请作为 NocoBase Workflow 开发者执行本任务。

先读取目标工作流、节点、版本执行次数和相关集合字段。
如果是新工作流，默认 enabled=false，节点按顺序创建，创建后读回 id 和 key。
如果已有版本执行过，先创建 revision，再编辑新版本。
不要并发创建节点，不要用节点 id 写变量引用，要使用节点 key。
启用工作流前必须让我确认。
```

### 23.3 AI 员工配置提示词

```text
请作为 NocoBase AI Employees 配置者执行本任务。

先判断是否真的需要 AI 员工：确定性 CRUD、字段赋值、简单按钮优先用 UI Builder 或 Workflow。
如果需要 AI 员工，先复用合适员工；没有 70% 匹配时再创建专用员工。
工具权限：只读可 Allow，修改/发布/删除默认 Ask。
AI 员工只能辅助填写、建议、解释和生成，不允许绕过人工确认直接真实发布。
完成后说明员工、模型、知识库、工具、Ask/Allow、绑定页面和测试结果。
```

### 23.4 页面开发提示词

```text
请作为 NocoBase UI Builder 开发者执行本任务。

目标是 v2 Modern UI。先读取集合字段、页面、菜单和已有区块。
页面开发优先使用 UI Builder 和 flow-surfaces，不直接写内部 schema。
AI 员工按钮只能使用公开的 aiEmployee action 配置。
完成后提供 /v2/ 页面路径、菜单位置、区块列表、按钮列表和读回验证。
```

---

## 24. 官方来源索引

核心 AI 与 AI Builder：

- https://github.com/nocobase/skills
- https://docs.nocobase.com/cn/ai/
- https://docs.nocobase.com/cn/ai-builder/workflow
- https://docs.nocobase.com/cn/ai-builder/ui-builder
- https://docs.nocobase.com/cn/ai-builder/data-modeling
- https://docs.nocobase.com/cn/ai-builder/env-bootstrap
- https://docs.nocobase.com/cn/ai-builder/security
- https://docs.nocobase.com/cn/ai-builder/dsl-reconciler
- https://docs.nocobase.com/cn/ai-builder/plugin-manage
- https://docs.nocobase.com/cn/ai-builder/publish
- https://docs.nocobase.com/cn/ai-builder/version-control
- https://docs.nocobase.com/cn/ai-dev

AI Employees 主目录：

- https://docs.nocobase.com/cn/ai-employees
- https://docs.nocobase.com/cn/ai-employees/quick-start
- https://docs.nocobase.com/cn/ai-employees/features/llm-service
- https://docs.nocobase.com/cn/ai-employees/features/enable-ai-employee
- https://docs.nocobase.com/cn/ai-employees/features/model-settings
- https://docs.nocobase.com/cn/ai-employees/features/collaborate
- https://docs.nocobase.com/cn/ai-employees/features/pick-block
- https://docs.nocobase.com/cn/ai-employees/features/web-search
- https://docs.nocobase.com/cn/ai-employees/features/skills
- https://docs.nocobase.com/cn/ai-employees/features/tools
- https://docs.nocobase.com/cn/ai-employees/features/mcp
- https://docs.nocobase.com/cn/ai-employees/features/task
- https://docs.nocobase.com/cn/ai-employees/features/new-ai-employees
- https://docs.nocobase.com/cn/ai-employees/permission
- https://docs.nocobase.com/cn/ai-employees/file-manager

AI Employees 内置员工：

- https://docs.nocobase.com/cn/ai-employees/built-in/
- https://docs.nocobase.com/cn/ai-employees/built-in/atlas
- https://docs.nocobase.com/cn/ai-employees/built-in/viz
- https://docs.nocobase.com/cn/ai-employees/built-in/dex
- https://docs.nocobase.com/cn/ai-employees/built-in/ellis
- https://docs.nocobase.com/cn/ai-employees/built-in/lexi
- https://docs.nocobase.com/cn/ai-employees/built-in/vera
- https://docs.nocobase.com/cn/ai-employees/built-in/nathan
- https://docs.nocobase.com/cn/ai-employees/built-in/lina
- https://docs.nocobase.com/cn/ai-employees/built-in/dara

AI Knowledge Base：

- https://docs.nocobase.com/cn/ai-employees/knowledge-base/
- https://docs.nocobase.com/cn/ai-employees/knowledge-base/vector-database
- https://docs.nocobase.com/cn/ai-employees/knowledge-base/vector-store
- https://docs.nocobase.com/cn/ai-employees/knowledge-base/knowledge-base/
- https://docs.nocobase.com/cn/ai-employees/knowledge-base/knowledge-base/documents
- https://docs.nocobase.com/cn/ai-employees/knowledge-base/knowledge-base/segments
- https://docs.nocobase.com/cn/ai-employees/knowledge-base/knowledge-base/hit-tests
- https://docs.nocobase.com/cn/ai-employees/knowledge-base/knowledge-base/settings
- https://docs.nocobase.com/cn/ai-employees/knowledge-base/rag
- https://docs.nocobase.com/cn/ai-employees/knowledge-base/dev/external-knowledge-base

AI Workflow Nodes：

- https://docs.nocobase.com/cn/ai-employees/workflow/nodes/llm/chat
- https://docs.nocobase.com/cn/ai-employees/workflow/nodes/llm/multimodal-chat
- https://docs.nocobase.com/cn/ai-employees/workflow/nodes/llm/structured-output
- https://docs.nocobase.com/cn/ai-employees/workflow/nodes/employee/configuration
- https://docs.nocobase.com/cn/ai-employees/workflow/nodes/employee/approval
- https://docs.nocobase.com/cn/ai-employees/workflow/nodes/knowledge/
- https://docs.nocobase.com/cn/ai-employees/workflow/nodes/knowledge/create-document
- https://docs.nocobase.com/cn/ai-employees/workflow/nodes/knowledge/update-document
- https://docs.nocobase.com/cn/ai-employees/workflow/nodes/knowledge/delete-document
- https://docs.nocobase.com/cn/ai-employees/workflow/nodes/knowledge/retrieve-document

AI Employees 实践：

- https://docs.nocobase.com/cn/ai-employees/scenarios/business-report
- https://docs.nocobase.com/cn/ai-employees/scenarios/viz-crm
- https://docs.nocobase.com/cn/ai-employees/scenarios/localization-hy-mt
- https://docs.nocobase.com/cn/ai-employees/configuration/prompt-engineering-guide

Workflow / FlowEngine / RunJS / 插件开发：

- https://docs.nocobase.com/cn/workflow
- https://docs.nocobase.com/cn/workflow/development
- https://docs.nocobase.com/cn/flow-engine
- https://docs.nocobase.com/cn/runjs
- https://docs.nocobase.com/cn/shared-components
- https://docs.nocobase.com/cn/plugin-development
