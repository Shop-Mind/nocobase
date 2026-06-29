# 设计文档：原生 AI 员工集成（Native AI Employees）

> 状态：设计已与产品负责人确认方向（2026-06-29），待评审后进入实现计划（writing-plans）。
> 关联文档：`nocobase-ai-listing-prd-dev-design.md`（§6 AI 员工、§7.4 数据模型、§7.7 权限）、`nocobase-ai-listing-phase-delivery-plan.md`（新增 Native AI Track）、`nocobase-ai-developer-official-guide.md`。

## 1. 背景与目标

对齐官方 NocoBase 演示（`https://anawzxt1rddw.v11.demo.nocobase.com`）中的 AI 员工体验：

- **Customers 列表** 顶部 **Viz（Insights analyst）** 头像悬浮 + 任务按钮（Customer segmentation / New vs returning trend / Owner workload check）。
- **Customer Profile 详情** **Vera（Research analyst）** 头像 + 任务（Company background brief / Buying-signal scan / Competitive landscape）。
- **Edit 表单** **Dex（Data organizer）** + “Fill with demo data”（把建议**填进表单字段**，用户 Submit 才入库）。
- 全应用右下角 **全局悬浮 AI 助手**（Atlas 调度）。

目标：让 AI Listing 的核心页拥有同款“原生 AI 员工”——头像悬浮、角色化、自然语言任务、与当前 UI 上下文联动——而不是当前的自定义 mock 按钮。

## 2. 现状与根因

当前 Phase 0–7 的业务页面**全部是 jsBlock**，AI 能力是自定义 action 的确定性 mock。无法做出演示效果有两个根因：

| 根因 | 证据 | 影响 |
|---|---|---|
| **A. 集合是 code-first，不在 UI 数据源** | `collections:list` 仅返回 `users/roles`；12 张 `aiListing*` 集合在服务端内存可用（REST 正常）但客户端不可见 | 原生集合区块（table/details/form）无法绑定这些集合 → 原生 `aiEmployee` 动作无处可挂（动作必须挂在原生区块的 `actions`/`recordActions` 上） |
| **B. 无 LLM 模型后端** | `llmServices:list` 返回 `count:0` | 即使 `aiEmployees`（atlas/dex/lexi/viz/vera）存在，也无法真正生成；这正是当前用 mock 的原因 |

结论：要做出演示效果，必须补齐这两项——**把核心集合变成 UI 可管理** + **接入真实 LLM**。

## 3. 关键决策（已确认）

1. **LLM 后端**：产品负责人提供大模型 API Key（DeepSeek / 通义 / OpenAI / Claude 任一），由开发配置 `plugin-ai` 模型服务；未配置时回退确定性 mock。
2. **架构走向**：对核心页做**原生重构**（不是仅加全局助手）。
3. **原生化范围**：仅原生化 **AI 价值高**的页 —— **商品库、预览编辑/审核、规则管理**；**工作台、商品抓取、信息处理批量进度** 因属重交互/抓取流程，保留 jsBlock。

> 影响：本设计会**替换** Phase 6 的 jsBlock 规则页、Phase 7 的 jsBlock 预览编辑页，用“原生页 + 原生 AI 员工”版本重做。已抓取/已处理的业务数据不受影响。

## 4. 目标体验（三种范式映射）

| 演示范式 | 演示员工 | AI Listing 对应页 | 对应员工（复用内置） | 任务（示例） | 权限 |
|---|---|---|---|---|---|
| 列表级分析 | Viz | 商品库 / 预览编辑 列表工具栏 | **Viz** | 选品质量分析、批次成功率、风险词扫描 | 只读 `Allow`（出洞察，不写库） |
| 记录级研究 | Vera | 商品详情（记录动作） | **Vera** | 合规/平台规则背景、卖点研究、目标市场建议 | 只读 `Allow`（联网搜索可选） |
| 表单填充 | Dex | 商品编辑表单 | **Dex** | 优化标题、生成描述、补全参数 → **填进表单字段**（不入库） | 填表 = 用户 Submit 才保存（天然 `Ask`） |
| 全局助手 | Atlas | 全应用右下角 | **Atlas** 调度 | 自然语言提问，转派专家 | 跟随当前用户权限 |

## 5. 架构设计

### 5.1 原生化基座（Phase N1）
- 把 `aiListingProducts / aiListingSkus / aiListingMediaAssets / aiListingRules` 暴露给 client 主数据源（UI 可管理）：原表原数据不动，仅补 UI 集合/字段元数据（title、interface、枚举、关联）。
- **首步必须做可行性 spike**：先暴露 1 张集合，验证 ① 进入 `collections:list`、② 字段 interface 可读、③ 既有数据可在原生表格读写、④ 不破坏现有 jsBlock 页与 REST。spike 不通过则回退“混合方案”（新增原生承载页而非改造原集合）。
- 单元边界：基座只负责“集合可见 + 字段元数据正确”，不含任何 AI 逻辑。

### 5.2 真实 LLM 接入（Phase N2）
- 配置 `plugin-ai` 模型服务（provider + apiKey + baseURL + 模型名）；密钥经服务端配置，**不入审计、不入前端**。
- 为 dex/lexi/viz/vera 绑定该模型；保留“未配置 → 确定性 mock”兜底分支，保证可离线自测。
- 单元边界：LLM 接入只负责“模型可用 + 员工能调用”，与 UI 无耦合。

### 5.3 原生 AI 员工绑定（Phase N3）
- 用 `nocobase-ui-builder` 的 `flow-surfaces` 原生写法，在原生区块上挂 `type:"aiEmployee"` 动作（`settings.username/auto/workContext/tasks/style`），`workContext` 用 `{target:"self"}` 绑定当前区块/记录/表单。
- 商品库列表 → Viz（block `actions`）；商品详情 → Vera（`recordActions`）；编辑表单 → Dex（form `actions`，填表单字段）。
- 全局助手：开启 `plugin-ai` 的应用级 AI 助手。
- 员工 prompt/角色：用 `nocobase-ai-employee` 设计每个员工的 system/task prompt，约束到跨境电商搬运域。

### 5.4 安全约束保留（贯穿铁律，不可破）
- AI **只做**：只读分析/研究（不写库）、或把建议**填进表单输入框**（用户 Submit 才入库）。
- AI **绝不**：直接写最终字段、删除、真实发布。需要写库的建议走我们既有受控工具（`aiListing*` suggestion action，只写 `*Processed` + 审计）。
- 审核通过（`reviewed`）后关键字段锁定，AI 写入被拒。
- 所有 AI 产生的字段变化写 `aiListingAuditLogs`（actorType=ai_employee）。

### 5.5 数据流（编辑表单 Dex 为例）
```
用户在原生编辑表单点 Dex「优化标题」
  → AI 员工读取 workContext(self=当前表单/记录)
  → LLM 生成建议
  → 建议回填到表单的 title 输入框（前端，未入库）
  → 用户审阅/微调 → 点 Submit
  → 原生表单提交写库 + 触发审计（人工最终值）
```

## 6. 受影响的 Phase 与文档调整

在 `nocobase-ai-listing-phase-delivery-plan.md` 新增 **Native AI Track**（三阶段），并回标既有 Phase：

- **Phase N1 原生化基座（UI 可管理集合）** — 前置，含可行性 spike。
- **Phase N2 真实 LLM 接入** — 配模型服务 + 员工绑定模型 + mock 兜底。
- **Phase N3 原生 AI 员工绑定 + 关键页原生化** — 商品库/详情/编辑/规则 原生重建 + Viz/Vera/Dex/Atlas。
- **回标 Phase 6/7**：规则页、预览编辑页的 jsBlock 版被 N3 的“原生 + AI 员工”版替换（数据不动）。
- **Phase 10「AI 员工与知识库增强」** 收敛为 Native AI Track 的延续（知识库 RAG 作为 N3 之后的增强项），不再重复定义基础 AI 按钮。

## 7. 风险与缓解

| 风险 | 等级 | 缓解 |
|---|---|---|
| 集合无法干净暴露给 UI / 破坏既有页 | 高 | N1 首步 spike 单集合验证；不通过回退“混合：新增原生承载页” |
| 既有业务数据迁移丢失 | 中 | 只补 UI 元数据、不改表结构；spike 先在非关键集合验证读写 |
| LLM 成本/限流 | 中 | 任务 `autoSend=false`（人工触发）；可选小模型；mock 兜底 |
| 密钥泄露 | 高 | 密钥仅服务端配置，禁入审计/日志/前端（沿用 §7.9 脱敏铁律） |
| AI 越权写库/误发布 | 高 | 只读或填表单不入库；写库走受控 suggestion 工具 + 审计；审核锁定 |
| 重做 6/7 造成回归 | 中 | 原生页与旧 jsBlock 页并存切换，验收通过再下线旧页（守 G4 数据不破坏） |

## 8. 验收标准
- 商品库/详情/编辑页为原生区块，集合在 `collections:list` 可见、字段正确。
- LLM 配好后，Viz/Vera/Dex 能基于当前 UI 上下文真实生成；未配时 mock 兜底不报错。
- Dex 填表为“填字段不入库”，Submit 才保存并审计；审核锁定后 AI 写入被拒。
- 全局悬浮助手可用。
- 控制台无未处理 rejection / 英文堆栈；密钥不出现在任何日志/审计/前端。

## 9. 不在范围（本设计）
- 真实商品发布（Phase 8）。
- 知识库 RAG 深度建设（N3 之后增强）。
- 工作台/抓取/批量进度页的原生化（保留 jsBlock）。
- 媒体真实处理（仍占位）。
