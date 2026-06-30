# Phase 10 交付报告：AI 员工原生化集成（jsBlock 内嵌原生 AI）

> 交付日期：2026-06-30 · 插件：`@crossborder/plugin-ai-listing` · 运行实例：本地 dev（PostgreSQL `nocobaseV2`，plugin-ai 已装）
> 设计依据：`nocobase-ai-listing-native-ai-employees-design.md`（v2）、`nocobase-ai-listing-phase-delivery-plan.md` §14
> 关键前置：产品负责人已在 `设置→AI employees→LLM services` 配好 **DeepSeek**（与 Anthropic）服务；知识库按「关键词/规则命中」兜底（本库无 pgvector，真 RAG 暂不可用）。

---

## 0. 总览：本阶段做了什么

| 子步骤（§14.2） | 状态 | 说明 |
|---|---|---|
| ① AI 服务层 `aiListingAssistant` | ✅ | roster/ask/**knowledgeHit**/**toolsCatalog** + 审计 + Key 脱敏 |
| ② 接入真实 LLM（DeepSeek） | ✅ | 5 员工 `modelSettings` 绑 `deepseek-v4-flash`，原生聊天框真实生成 |
| ③ 5 专属员工 + 工具 + 权限 | ✅ | `lst-mira/rena/toby/lena/kai`，4 个原生工具按矩阵绑定 |
| ④ 各页 AI 入口 | ✅（全局助手） | 原生全局悬浮助手覆盖全部 8 个 jsBlock 页；详见 §5 架构说明 |
| ⑤ 全局悬浮助手 | ✅ | plugin-ai 原生，零页面改造，5 员工可选 |
| ⑥ 知识库（RAG） | ✅（关键词/规则兜底） | 11 知识条目 + 13 违禁词 + 命中测试 8/8 通过 |

---

## 1. 交付物①：员工列表

| 昵称 | username | 职位 | 绑定模型 | 启用 | 角色边界 |
|---|---|---|---|---|---|
| 选品参谋 Mira | `lst-mira` | 选品分析师 | DeepSeek V4 Flash | ✅ | 只读分析 |
| 合规向导 Rena | `lst-rena` | 合规与市场研究员 | DeepSeek V4 Flash | ✅ | 只读研究（接知识库） |
| 文案管家 Toby | `lst-toby` | 商品信息整理员 | DeepSeek V4 Flash | ✅ | 只给建议、填表不入库 |
| 发布助理 Lena | `lst-lena` | 发布助理 | DeepSeek V4 Flash | ✅ | 只读（不触发真实发布） |
| 搬运主管 Kai | `lst-kai` | 搬运工作台主管 | DeepSeek V4 Flash | ✅ | 问答 + 转派，跟随用户权限 |

> 5 员工均在原生聊天框员工下拉中可选（截图 `local-emp-list.jpeg`），`modelSettings.enabled=true` 且 `models=[{llmService:"v_ry84xaapoqv", model:"deepseek-v4-flash"}]`。
> 配置落地方式：`nb api resource update --resource aiEmployees --filter-by-tk <username>`。

## 2. 交付物②：工具列表（plugin-ai 原生工具，员工聊天框可真实调用）

注册位置：`src/server/assistant/tools.ts` → `registerAssistantTools()` → plugin-ai `toolsManager.registerTools`（dev 日志确认 `已注册 4 个 AI 工具到 plugin-ai`）。

| 工具名 | 标题 | 入参 | 出参 | 实现 |
|---|---|---|---|---|
| `aiListingKnowledgeHit` | 知识库命中 | `{query, platform?, topK?}` | `{count, hits[]}` | `matchKnowledge` |
| `aiListingBannedWordScan` | 违禁/风险词扫描 | `{text}` | `{count, words[]}` | `scanBannedWords` |
| `aiListingProductStats` | 商品状态统计（只读） | `{}` | `{total, byStatus}` | `aiListingProducts` 聚合 |
| `aiListingFieldSuggest` | 字段优化建议（不入库） | `{productId, field}` | `{value, writeBack:false}` | 只读读 + 生成建议 |

**员工 ↔ 工具矩阵**（`EMPLOYEE_TOOLS`，已写入各员工 `skillSettings.tools`）：

| 员工 \ 工具 | knowledgeHit | bannedScan | productStats | fieldSuggest |
|---|:--:|:--:|:--:|:--:|
| Mira | ✅ | ✅ | ✅ | |
| Rena | ✅ | ✅ | | |
| Toby | | ✅ | | ✅ |
| Lena | ✅ | | ✅ | |
| Kai | ✅ | | ✅ | |

## 3. 交付物③：权限表

| 维度 | 规则 |
|---|---|
| 工具访问级别 | knowledgeHit/bannedScan/productStats = **只读 ALLOW**（自动调用）；fieldSuggest = **建议 ASK**（提示「不入库」） |
| AI 写库 | **禁止**。Toby 只给建议值，用户在表单 Submit 才存（沿用 Phase 7 受控 saveFinal + 审计） |
| 真实发布 | **禁止**。Lena 仅发布前检查/失败解释/重试建议 |
| 审核锁定 | `reviewed` 后关键字段锁定，AI 写入被拒（沿用 Phase 7） |
| 服务端 ACL | `aiListingAssistant:roster/ask/knowledgeHit/toolsCatalog` 均 `allow(..., 'loggedIn')` |
| 审计 | 每次 `ai.assist` 写 `aiListingAuditLogs`（actorType=`ai_employee`，记 employee/taskKey/traceId） |
| 密钥脱敏 | 模型 Key 仅服务端 `llmServices`，**绝不进**日志/审计/前端/assistant 出入参 |

> 程序内可读清单：`GET aiListingAssistant:toolsCatalog` → `{employeeTools, catalog}`（`TOOL_CATALOG` 含 access/permission）。

## 4. 交付物④：知识库命中测试

实现：`src/server/assistant/knowledge.ts`（11 结构化条目：平台规则/类目/标题规范/违禁词/市场 + 13 违禁词）。
命中方式：关键词/规则匹配 + 平台过滤 + 打分排序（接口与出参对齐未来向量检索，便于无缝升级真 RAG）。

**自动化测试**：`src/server/assistant/__tests__/knowledge.test.ts` —— `yarn test` **8/8 通过**：

| 用例 | 断言 | 结果 |
|---|---|---|
| Shopee 标题规范 | 命中 `kb-shopee-title` | ✅ |
| platform=amazon 过滤 | 命中 amazon、**不**命中 shopee 专属 | ✅ |
| 类目必填属性 | 通用条目命中（不被平台过滤） | ✅ |
| 主图/媒体规范 | 命中 `kb-image-rule` | ✅ |
| 打分降序 | hits 按 score 降序 | ✅ |
| 违禁词（中） | 命中 最/正品保证/清仓/秒杀 | ✅ |
| 违禁词（英） | 命中 cheapest/best price/guaranteed | ✅ |
| 空输入 | 返回空 | ✅ |

**真实链路验证**（截图 `local-mira-reply.jpeg`）：在原生聊天框选 Mira，问「Shopee 标题规范？扫描标题：全网最便宜女士连衣裙包邮正品保证」→ DeepSeek **真实调用** `aiListingKnowledgeHit`（返回 Shopee ≤100 字符/结构/合规要点）+ `aiListingBannedWordScan`（命中「最便宜」「包邮」「正品保证」3 处并给原因），输出结构化「规范 + 扫描 + 修改建议」。

## 5. 交付物⑤：页面按钮截图说明

截图目录：`docs/ai-listing/phase10-screenshots/`

| 截图 | 说明 |
|---|---|
| `local-workbench.jpeg` | 工作台 jsBlock 页，**右下角原生 AI 悬浮按钮**（与官方 demo 同款），全部 8 页均浮现 |
| `local-ai-panel.jpeg` | 点击后打开**原生右侧 AI 抽屉**：员工选择器 + 模型选择器（DeepSeek V4）+ 上下文/附件/联网/新会话/历史/调试/全屏 |
| `local-emp-list.jpeg` | 员工下拉含我们的 5 个专属员工（选品参谋 Mira / 合规向导 Rena / …）与内置员工并列 |
| `local-mira-reply.jpeg` | 选 Mira（自动切 DeepSeek V4 Flash）→ 真实生成 + 两个工具命中，输出 Shopee 规范、违禁词扫描、修改建议 |

**架构说明（为何是「全局悬浮助手」而非每页区块头像按钮）**：
- 现有 8 个业务页是 **jsBlock**（v2 定调，保留不重建）。plugin-ai 的聊天框由 **FlowModel(`AIEmployeeButtonModel`)** 驱动，而非 React Provider —— 这正是设计文档里 `app.addProvider(AssistantBridge)` 白屏的根因（挂到了 FlowEngine context 之外）。
- jsBlock 是单一自渲染块，**没有原生 action 容器**，原生 `aiEmployee` 快捷动作（`nb api flow-surfaces add-action`）需挂在原生数据块的 `actions/recordActions` 上。
- 因此 **jsBlock 架构下正确的 AI 入口 = 原生全局悬浮助手**：零页面改造、全页可用、5 员工可选、真实模型 + 工具。`AssistantBridge.tsx` 保持不挂载（避免白屏），作为「将来若改原生块」的兜底保留。
- **可选增强（未做，避免扰动在跑页面）**：若要每页专属头像按钮，可在各页 jsBlock 旁新增一个原生 `actionPanel` 块承载对应员工的 `aiEmployee` 快捷动作（商品库→Mira、预览编辑→Toby/Rena、发布→Lena）。需 1 次 `flow-surfaces` 写入/页，建议确认后再做。

---

## 6. 修改文件清单

| 文件 | 变更 |
|---|---|
| `src/server/assistant/knowledge.ts` | 新增：知识条目 + 违禁词 + `matchKnowledge`/`scanBannedWords` |
| `src/server/assistant/tools.ts` | 新增：4 个原生工具 + `EMPLOYEE_TOOLS`/`TOOL_CATALOG` + `registerAssistantTools` |
| `src/server/assistant/index.ts` | 新增：`knowledgeHit`/`toolsCatalog` action + ACL + 调 `registerAssistantTools` |
| `src/server/assistant/__tests__/knowledge.test.ts` | 新增：知识库命中测试（8 用例） |
| 运行实例（nb api，非源码） | 5 员工 `modelSettings` 绑 DeepSeek + `skillSettings.tools` 绑工具 |

## 7. 自测与验收
- `yarn test .../knowledge.test.ts` → 8/8 通过。
- dev server 热更无错，日志 `已注册 4 个 AI 工具到 plugin-ai`。
- 浏览器：5 员工可选、选 Mira 自动切 DeepSeek V4 Flash、真实生成 + 2 工具命中（截图为证）。
- `yarn eslint --fix` touched 文件通过。
- 安全：AI 全程只读/给建议；审计写入；Key 未出现在任何前端/日志/审计/出入参。

## 8. 遗留与下一步（可选）
1. **每页专属头像按钮**：如需，按 §5 末「可选增强」加原生 actionPanel + aiEmployee 快捷动作（确认后做）。
2. **全局助手默认调度员设为 Kai**：当前默认 Atlas（内置 Team leader，职责相同）；plugin-ai 无「默认员工」设置项，如需强制可后续定制。
3. **真 RAG 升级**：本库无 pgvector；接入外部向量库 + embedding 后，`matchKnowledge` 可在不改调用方的前提下替换为向量检索。
4. **工作台真实聚合 + Guide 引导页**（O1/O8，来自优化文档），属系统优化，非本阶段必交。
