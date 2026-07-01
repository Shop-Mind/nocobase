# AI 商品搬运工具 · jsBlock 原生 AI 能力落地规划（Rollout Plan v1.0）

> 目标：把已验证的通用能力 **「点原生 AI 员工头像 → 原生抽屉对话 → AI 改本区块暂存数据 → 点『提交』才入库（受控 action + 审计）」** 从 Demo 页推广到各业务页面。
>
> 该能力已在 AI 员工 Demo 页（`sj8jgsbtzg7`）端到端验证通过（DeepSeek 真实调用 `jsBlockApplyPatch` 改暂存、提交入库、审计 `actorType=user`、原生头像转头动画）。本规划只做「应用」，不重造轮子。
>
> 铁律（贯穿所有 phase，不可破）：**AI 只读或只改「暂存」（内存 state），绝不直接写库；入库只发生在用户点「提交」时，走受控服务端 action + 逐字段审计；审核锁定字段不可改；不触发真实发布；模型 Key 仅服务端、不入日志/审计/前端。**

---

## 0. 术语与复用件（一次说清，后续 phase 直接引用）

- **通用 kit**：`window.__aiListingBlockKit`（`src/client-v2/ai/jsblock-ai.ts`）。方法：`register(key, api)` / `unregister(key)` / `applyPatch(key, patch)` / `openAI(key, {username, prompt})` / `getAvatar(username, options)`。
- **jsBlock 接入契约**：区块每次渲染 `kit.register(key, { title, getData, getSchema, applyPatch })`，卸载 `unregister`。
  - `getData()`：返回当前**暂存值**（从 ref 读，避免闭包过期）。
  - `getSchema()`：`[{ name, label, type, hint }]`，既用于渲染、喂给 AI，也用作 `applyPatch` 的**写白名单**。
  - `applyPatch(patch)`：只 `setState` 更新暂存，不写库。
- **前端工具** `jsBlockApplyPatch({ block, patch })`：定位 kit 中的区块，按白名单写暂存（未知字段忽略）。GENERAL/ALLOW/frontend，服务端 `invoke` 仅占位。
- **原生头像**：`kit.getAvatar(username, options)`（dicebear data URI）；常态 `{ mouth: undefined, mask: undefined }`（明亮），hover `{ mask: undefined, flip: true }`（转头）。
- **提交入库**：每页各自的**受控服务端 action**（带锁/权限/审计），前端「提交」按钮调用它，这是唯一写库口。
- **员工矩阵**：`lst-toby`（信息整理/文案）、`lst-mira`（选品分析）、`lst-rena`（合规市场研究）、`lst-lena`（发布助理）、`lst-kai`（搬运主管/调度）。
- **能力两种形态**：
  - **编辑型**（注册 `applyPatch` + 给 `jsBlockApplyPatch`）：对话改暂存 → 提交入库。用于「需要改数据」的页。
  - **只读型**（只 `openAI` 带只读上下文，不注册 `applyPatch`）：纯问答 + 读工具，不写。用于洞察/解释类页。

**每个 phase 的验收统一含**：① 头像转头 + 抽屉可选模型；② AI 真实调用工具改暂存并标「待提交」；③ 只有点提交才入库；④ 审计 `actorType=user`；⑤ 锁定/权限守卫生效；⑥ eslint 通过、相关 `__tests__` 通过；⑦ 浏览器截图为证。

---

## Phase 0 — 能力固化与提交（Foundation & Commit）

**目标**：把 Demo 阶段验证的通用件固化为可复用生产件并提交，给后续 phase 提供稳定地基与「一处接入」文档。

**范围**
- 提交现有未提交改动：`src/ai/tools/jsBlockApplyPatch.ts`、`src/client-v2/ai/jsblock-ai.ts`、`src/client-v2/components/assistant-bridge.ts`、`src/client/plugin.tsx`、`package.json`、**`src/server/assistant/tools.ts`（`_zod` 修复，关键——否则全局 AI 对话崩）**、`AGENTS.md`（已写规则）。
- 产出**接入配方文档** `docs/ai-listing/jsblock-ai-integration-recipe.md`：一页讲清「register / avatar+openAI / Submit」三步 + 最小可复制 jsBlock 模板。
- 核对 kit 的**通用性**：`openAI`/`jsBlockApplyPatch` 不绑死 review；任意页任意 key/员工可用。
- Demo 页保留为**参考样板**（顶部加一行说明「本页为能力样板，勿删」）。

**交付物**：一次提交（feat scope: plugin-ai-listing）；接入文档；模板 snippet。
**验收**：Demo 页仍完整可用；照文档可 5 分钟接入一个新 jsBlock。
**依赖/风险**：无新逻辑，纯固化；确保提交包含 `_zod` 修复。

---

## Phase 1 — 预览编辑（旗舰：Toby 编辑 + Rena 合规只读）

**目标**：把三栏预览编辑页（`bska9eot90k`，jsBlock `um6v8ddxrz8`）的「详情编辑」接入**编辑型**能力，用对话式暂存编辑**替换**现有机械「AI 建议」按钮（保留「原始值参考」列与「变更记录」栏）。这是能力最核心的落地，直接对齐用户最初诉求。

**员工**：`lst-toby`（编辑：标题/描述/参数/价格/库存）；可切换 `lst-rena`（只读：合规/违禁词/市场检查，不写）。

**可编辑字段（编辑型）**：`titleFinal`、`descriptionFinal`、`attributesProcessed`、`priceTarget`、`listPriceTarget`、`stock`（含 SKU 目标价/库存）。

**提交 action**：复用 `aiListingReview:saveFinal`（已具：`reviewed→409` 锁定守卫、逐字段审计 `actorType=user`、`status→reviewing`）。`approveDraft` / `rollbackReview` 保留。

**UI 改造**
- 详情栏卡片右上放 **Toby 原生头像**（转头动画）+ 员工切换（Toby/Rena）。
- 字段区支持「待提交」黄标（对比 baseline）；顶部保留「原始值参考」；右侧保留「变更记录」（实时显示审计流，区分人工蓝/AI 紫/系统灰）。
- 去掉「优化标题/生成描述/补全参数」机械按钮（或降级为抽屉内的**预设任务**快捷入口，仍走 `openAI` + `jsBlockApplyPatch`）。
- 「保存/提交」按钮走 `saveFinal`；锁定商品提交返回 409 友好提示。

**接入要点**：`register(key, { getData: ()=>详情暂存, getSchema: ()=>三段+价格库存字段, applyPatch })`；`openAI` 注入「当前选中商品只读上下文 + 指示 Toby 用 `jsBlockApplyPatch`」。列表栏（Mira 选品）与三段参考列不动数据结构。

**验收**：选商品 → 点 Toby → 对话「标题改更适合 Lazada、补 2 条卖点、库存 500」→ 详情即时暂存 + 待提交 → 提交入库 + 审计；reviewed 锁定拒写；切 Rena 问「有无违禁词」只读回答不写库。
**风险**：三栏 jsBlock 结构较复杂，改动面较大；需与现有「采纳→最终值」手动路径兼容（可保留手动编辑 + AI 暂存并存）。

---

## Phase 2 — 商品发布（Lena 配置 + 只读解释）

**目标**：发布页（`tys37qjf3jz`，jsBlock `xhg7mdi12uv`）的「发布配置」接入**编辑型**能力：Lena 协助把平台/店铺/类目/运费/价格策略/速率填进配置暂存，提交=模拟发布（真实发布仍关闭）。并提供**只读型**解释（precheck 阻断项、失败原因）。

**员工**：`lst-lena`。

**可编辑字段**：`platform`、`storeAccount`、`category`、`shippingTemplate`、`priceStrategy`（加价率/固定价）、`stockStrategy`、`rateLimit`。

**提交 action**：`aiListingPublish:publish`（mock，含 precheck 闸门 + 两层幂等 + 记录）。发布配置暂存 → 提交触发对通过校验项的模拟发布。

**UI**：发布配置区右上 Lena 头像；配置字段「待提交」；待发布商品表 + precheck inline 阻断/警告保留；「模拟发布」= 提交。

**只读增强**：Lena 读上下文解释「为什么被阻断（缺类目/主图/标题非法）」「失败原因 + 下一步 + 是否可重试」。

**验收**：点 Lena → 「选 Shopee 店铺 A、类目 B、统一加价 20%」→ 配置暂存 → 提交 → 模拟发布 + 记录；点被阻断商品问原因 → 只读解释。
**风险**：发布是 mock（诚实标注）；配置字段多，需给 AI 清晰字段 schema 与取值域（店铺/类目枚举）。

---

## Phase 3 — 信息处理 + 规则管理（Toby/Dex 起草规则）

**目标**：
- **规则管理**（`0f6ilbvczpo`，jsBlock `rhtykyjnnvc`）：AI 辅助**起草规则**（条件/动作结构化）为暂存草稿，提交=受控创建/更新规则。
- **信息处理**（`bhgkujnjpe7`，jsBlock `pbhsj0txb8c`）：处理参数/单品建议暂存 → 提交（触发 `runRule` 或保存建议）。

**员工**：`lst-toby`（文案/规则表达）；处理域可复用内置 `dex`。

**可编辑字段**：规则 `name` / `matchType` / `conditions[]` / `actions[]` / `enabled`；处理配置（默认规则/范围）。

**提交 action**：`aiListingProcessing:saveRule` / `toggleRule`（已具受控 + `rule.*` 审计）；处理走 `runRule`。

**关键**：规则是结构化对象，`jsBlockApplyPatch` 的 patch 需受 `getSchema()` 严格约束（枚举化 field/op/value），避免 AI 造出非法规则；提交前前端 + 服务端双校验。

**验收**：规则页点头像 → 「加一条：标题含『正品保证』则删除该词」→ 结构化规则草稿暂存 → 提交入库 → 列表出现新规则 + 审计。
**风险**：规则结构复杂，AI 生成结构化内容需强 schema 约束 + 校验；避免误改已启用规则（改动亦走暂存 + 提交）。

---

## Phase 4 — 商品库（Mira 批量/选品）

**目标**：商品库页（`8bubboricr8`，jsBlock `m44yubtnxn2`）接入**编辑型**能力：Mira 协助对选中的一批商品做字段批量暂存编辑（如目标平台/标签/优先级），提交=受控批量入库 + 审计。

**员工**：`lst-mira`。

**可编辑字段**：批量维度 `targetPlatform` / `tags` / `priority` / `stock`（或选中单品的可编辑字段）。

**提交 action**：**新增受控批量保存 action**（如 `aiListingLibrary:bulkSaveFields`，逐商品逐字段审计 `actorType=user`，跳过锁定项）。

**UI**：列表支持多选 → 头像 → 对话「把这些的目标平台设为 Lazada、优先级设高」→ 选中项字段暂存 + 待提交计数 → 提交批量入库。

**验收**：选 3 个商品 → 点 Mira → 批量改目标平台 → 暂存 → 提交 → 3 条记录更新 + 审计。
**风险**：批量语义（作用域=当前选中）需明确喂给 AI；审计量大；权限（哪些角色可批量改）。

---

## Phase 5 — 只读洞察页（工作台 / 发布记录：Mira/Lena/Kai）

**目标**：对**不需要改数据**的页，用能力的**只读型**：原生抽屉带只读上下文 + 读工具，纯问答/解释/建议，不注册 `applyPatch`、不给写工具。

**范围**
- **工作台**（`v7pulpv1jn6`，jsBlock `q0jseqh11av`）：Mira/Kai 解读 KPI + 待办，建议「今天优先处理/发布哪些」。
- **发布记录**（`oztcepxey0i`，jsBlock `ll9lt13qily`）：Lena 解释失败原因 + 重试建议（读记录上下文）。

**机制**：`openAI(key, { username, prompt })` 只注入只读上下文（当前页聚合数据/记录），系统消息明确「只读、不写、不发布」。可配读工具（如 `aiListingKnowledgeHit`、只读统计）。

**验收**：点头像 → 「本周哪些商品该优先发布？为什么这条发布失败？」→ 读数据回答，全程不写库。
**风险**：低（只读）；注意上下文数据量与脱敏（不带 credentialRef 等敏感字段）。

---

## Phase 6 — 打磨 / 横切 / 收尾提交（Cross-cutting & Finalize）

**目标**：一致性、健壮性、可交付。

**范围**
- **一致性**：各页员工头像（转头动画）与「待提交」UX 统一；抽屉预设任务文案统一；员工人格/铁律 system 一致。
- **多员工**：同一抽屉内可切换员工（Toby↔Rena↔Mira 等）；探索全局 Kai 调度（转派）。
- **i18n**：所有新增 UI 文案走 `t()`，补 `en-US`/`zh-CN`。
- **权限**：每个 submit action 补 ACL + 角色矩阵（谁能改/提交/发布）；只读页限制写工具。
- **审计一致**：所有入库统一 `actorType=user`（点提交者），AI 改暂存不产生入库审计。
- **测试**：工具白名单、submit 锁定守卫、审计写入的 `__tests__`（server 串行）。
- **清理**：Demo 页保留为样板或按需下线；移除临时诊断代码。
- **文档 + 提交**：更新交付文档 + 分 phase 提交（Conventional Commits）。

**验收**：全模块观感/行为一致；测试通过；提交完成；新装实例可复现（能力件为源码，UI 为 flow-surfaces/DB-resident 需另做导出——见「遗留」）。

---

## 汇总表

| Phase | 页面 | 员工 | 形态 | 提交 action | 关键交付 |
|---|---|---|---|---|---|
| 0 | —（能力件） | — | — | — | 提交 + 接入文档 + 模板 |
| 1 | 预览编辑 ⭐ | Toby / Rena | 编辑 + 只读 | `aiListingReview:saveFinal` | 替换机械 AI 建议为对话暂存编辑 |
| 2 | 商品发布 | Lena | 编辑 + 只读 | `aiListingPublish:publish` | 发布配置暂存 → 模拟发布 |
| 3 | 规则管理 + 信息处理 | Toby / dex | 编辑 | `aiListingProcessing:saveRule` 等 | AI 起草结构化规则 → 提交 |
| 4 | 商品库 | Mira | 编辑（批量） | 新增 `bulkSaveFields` | 批量字段暂存 → 提交 |
| 5 | 工作台 + 发布记录 | Mira/Kai/Lena | 只读 | —（不写） | 洞察/失败解释/建议 |
| 6 | 全部 | 全员 | — | — | 一致性/权限/i18n/测试/提交 |

**建议执行顺序**：0 → 1（旗舰，验证范式）→ 2 → 3 → 4 → 5 → 6。每个 phase 独立可交付、独立验收、独立提交；先做完 Phase 1 拿到用户确认再批量推进其余。

## 遗留与前置

- **真实发布/爬虫仍为 mock**（Phase 2/4 诚实标注），本规划不含接真实平台。
- **UI 可移植性**：业务页/区块仍是 flow-surfaces（DB-resident），全新装需另做 UI 导出/DSL（独立事项，不在本规划内）。
- **模型前提**：DeepSeek/Anthropic 已配、5 员工已绑模型，能力可真跑。
- **提交前置**：Phase 0 必须先提交 `_zod` 修复，否则全局 AI 对话不可用。

---

## 交付完成状态（2026-07-01 全部完成）

Rollout 全部 6 个 phase 已交付并浏览器端到端验证通过（均在 `/admin/`，DeepSeek 真实调用）。

| Phase | 页面 / 内容 | 员工 | 形态 | 提交 |
|---|---|---|---|---|
| 0 | 能力固化 + 接入配方 + 样板 | — | — | `a0079cc1f5` |
| 1 | 预览编辑（对话改暂存 → saveFinal） | Toby 编辑 / Rena 只读 | 编辑+只读 | `d87efb2c39` |
| 2 | 商品发布（配置暂存 → 模拟发布）+ precheck/AI 一致性 | Lena | 编辑+只读 | `6eb14450ea` |
| 3 | 规则管理（结构化规则起草）+ 信息处理（选规则/勾商品/批量处理） | **Dex（新建专属员工）** | 编辑 | 无源码（DB-resident） |
| 4 | 商品库（批量字段编辑 → bulkSaveFields） | Mira | 编辑（批量） | `4f9d1e578f` |
| 5 | 工作台（KPI 洞察/待办/转派）+ 发布记录（失败解释/重试建议） | Kai/Mira · Lena | 只读 | 无源码（DB-resident） |
| 6 | 打磨：bulkSaveFields 单测、接入配方补全（getSystemContext/submitLabel/只读型/`/admin` 坑）、清理核查、本交付文档 | — | — | 待提交 |

**员工归属定稿（一页一域，不重叠）**：Toby 文案（预览编辑）· Dex 加工（规则/信息处理）· Mira 选品（商品库/工作台洞察）· Rena 合规（预览编辑只读）· Lena 发布（发布/发布记录）· Kai 全局调度（工作台）。

**能力件（源码，已提交）**：kit `window.__aiListingBlockKit`（register/openAI/applyPatch/getAvatar；JsBlockApi 支持 getData/getSchema/applyPatch/getSystemContext/submitLabel）+ 前端工具 `jsBlockApplyPatch` + assistant-bridge（openNativeAssistant/aiListingOpenAssistant）+ 真模型 `callModel` + 受控 action（saveFinal/publish/saveRule/runRule/**bulkSaveFields**）。

**关键约束（全程遵守）**：AI 只读或只改暂存（内存），入库只在用户点提交时走受控 action + 逐字段审计 `actorType=user`；锁定项跳过/拒写；不真实发布；模型 Key 仅服务端。**运营友好**：输入框预填只放自然口语，ID/工具名/结构走 `getSystemContext`（系统消息）。

**遗留**：真实发布/爬虫仍 mock；各业务页 UI 是 flow-surfaces DB-resident（全新装需另做 UI 导出/DSL）；细粒度角色 ACL 目前统一 `loggedIn`（留待 `nocobase-acl-manage` 细化）；jsBlock 沙箱内文案中文直写（用不了插件 locale ns，i18n 不适用于 DB-resident 区块）。
