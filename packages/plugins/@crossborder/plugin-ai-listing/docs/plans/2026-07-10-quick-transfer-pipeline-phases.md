# 快速搬运流水线（Quick Transfer Pipeline）规划 — 一键 URL → 改图 → 上架草稿

> 2026-07-10 · 状态：**v2 已按用户拍板改为官方工作流编排**（v1 的「插件内 pipeline action」方案被用户否决，见 §3）· 权威 phase 拆分文档
> 用户诉求原话：「一键输入 URL，我就可以直接选改图，然后弄成上架草稿……能很快助力我们的电商运行快速搬运商品上架」；追问「是不是会使用当前项目的工作流」→ 用户选定**官方工作流可视化编排**。

---

## 1. 目标与北极星

**北极星指标：从粘贴 URL 到拿到平台上架草稿链接 ≤ 3 分钟（不改图 ≤ 1 分钟）。**

| | 现状 | 目标 |
|---|---|---|
| 页面跨度 | 4 个页面（抓取→信息处理→预览编辑→商品发布） | **1 个「快速搬运」页** |
| 手动操作 | 5 段（填 URL 提交 / 选商品选规则执行 / 编辑+标记审核 / 配发布+发布 / 看记录） | **3 步（贴 URL → 可选改图 → 点「生成草稿」）** |
| 衔接方式 | 全靠人工跨页点「下一步」跳转 | 服务端编排自动串联，人工只留业务必需卡点 |

**产品形态**：单页三步向导。
1. **输入**：贴 URL（或多行批量）＋预填好的默认店铺/规则/平台，点「开始搬运」；
2. **进行中**：流水线进度条（抓取→处理 自动跑完，约 10 秒），完成后停在**改图卡点**——页内直接嵌候选区改图/采纳，或点「跳过改图」；
3. **出草稿**：点「生成上架草稿」→ 自动审核确认+类目补齐+draft 发布 → 结果卡给出 `post.alibaba.com` 草稿链接，用户去平台后台确认上架。

---

## 2. 现状盘点（三份链路调研结论摘要）

### 2.1 三段服务端能力都已存在

| 段 | 入口 action | 关键事实 |
|---|---|---|
| 抓取 | `aiListingCapture:startUrlCapture`（capture/index.ts:181） | **同步**返回 `{taskId, productId}`；真实 ICBU 走 `/eco/buyer/product/description`（单品 1~5s）；落 `aiListingProducts/Skus/MediaAssets`，status=`captured`；媒体下载是后台 fire-and-forget，不阻塞 |
| 处理 | `aiListingProcessing:runRule`（processing/index.ts:295）→ `runJob` | 批量同步，纯规则引擎（几十 ms/商品）；写 `titleProcessed/priceTarget/ladderTarget/attributesProcessed/riskFlags`，status=`processed`；单条失败隔离 + `retry` |
| 发布 | `aiListingPublish:publish`（publish/index.ts:284） | 原生批量 + `strategy:'draft'`（默认，只进卖家草稿箱不真上架）；双层幂等（idempotencyKey + 同商品同店铺成功记录跳过）；真实草稿链=photobank 传图→schema→`/icbu/product/schema/add/draft`，返回草稿编辑 URL |

配套已有：`approveDraft` 是**可程序化的状态翻转**（唯一硬条件 titleFinal，且自动用 titleOriginal 清洗兜底）；`predictCategory` 可补类目（同平台搬运时 `categoryOriginalId` 直接兜底，可跳过）；`precheck` 提供 block/warn 清单；改图闭环 `aiListingMedia:candidates/generate/adopt`（AI 只产候选、采纳是人工动作）。

### 2.2 唯一缺口

- **抓取→处理之间零自动衔接**（grep 确认无任何 hook/工作流桥接），处理→审核→发布同样全人工跨页。
- 没有一个把 `productId` 从 URL 贯穿到草稿链接的编排层，也没有承载它的页面。

### 2.3 可复用的地基

- 任务三件套：`aiListingCaptureTasks` / `aiListingProcessingJobs` / **`aiListingTaskSteps`（taskType 多态，枚举已预留 capture/process/media/publish/import）** + 统一 tracing 字段（traceId/errorCode/retryable）。
- 异步作业骨架范例：`startStoreCapture`（建任务→立即返回 taskId→后台 `runItems().catch(markCrashed)`→前端轮询 `aiListingTasks:getProgress`）。
- 改图 UI 零成本复用：`window.__aiListingMediaKit.mount(container,{productId})`（嵌入式候选区）/ `window.__aiListingWorkshopKit.mount(container,{productId,assetIds})`（整页工坊）。
- 默认参数：`aiListingConfig.defaultPlatform/defaultRuleId`（设置页已有）+ 店铺 `settings.isDefault` —— 「零配置一键」的基础。

---

## 3. 方案选型（v2：用户拍板 = 官方工作流编排）

2026-07-10 用户在三个形态里选定 **「官方工作流可视化编排」**：主链用 NocoBase plugin-workflow 引擎跑，用户可以在工作流页看到流程定义（画布节点）与每次执行的逐节点记录，并能调整流程（换规则、开关卡点、加通知节点等）。

原 v1 推荐（插件内 `aiListingPipeline` 编排 action）作废；其两条反对理由的化解方式：
- 「节点要为每段写自定义 instruction」→ 接受这笔开发量，这正是可视化带来的价值；plugin-ai 已有 `llm`/`ai-employee` 自定义节点的完整先例（服务端 `workflow.registerInstruction` + 客户端注册），照抄范式即可。
- 「javascript 节点够不着插件服务」→ 已实证（ScriptInstruction 在 worker 线程跑 QuickJS/vm 沙箱，无 app 访问），所以**不用** javascript 节点，四段能力各写一个薄封装 instruction，内部直调既有服务函数。

| 形态 | 结论 |
|---|---|
| **官方工作流编排（选定）** | 自定义 4 个业务节点 + 官方 manual 人工节点做改图卡点 + collection 触发；流程可视、可配、执行记录逐节点可查 |
| 插件内 pipeline action（v1 推荐） | 作废，但其「服务函数抽取」工作原样保留（instruction 也需要） |
| AI 员工对话驱动 | 仍在 backlog（QB1）；将来对话工具触发的就是这条工作流 |

### 3.1 工作流结构（新 workflow `wf_quick_transfer`）

```
[collection 触发] aiListingQuickTransferRequests 新增一行(sourceUrl/ruleId/storeId/skipMedia)
      │
      ▼
[节点1 quickCapture]   自定义节点：executeUrlCapture(url) → {productId, captureTaskId}
      ▼
[节点2 quickProcess]   自定义节点：runJob(productId, ruleId) → processed
      ▼
[节点3 condition]      官方条件节点：skipMedia == true ?
      ├─ 否 ▶ [节点4 manual 人工节点]  官方节点：待办「改图/采纳完成后确认继续」
      │        （用户此时在预览编辑/创意工坊改图采纳；提交待办 → 工作流恢复）
      ▼
[节点5 quickApprove]   自定义节点：approveDraft(productId)（titleFinal 自动兜底）
      ▼
[节点6 quickPublishDraft] 自定义节点：publish(productIds=[productId], strategy='draft',
                          targetStoreId, idempotencyKey=execution.id) → {draftUrl}
```

- **改图卡点 = 官方 manual 节点**：原生待办中心、暂停/恢复、指派人全部现成；铁律不破——AI 只产候选，采纳在预览编辑/工坊里仍是用户显式动作，manual 节点只是「我改完了，继续」的闸门。
- **发布草稿也在人工闸门之后**，即草稿创建经过了用户确认（提交待办）；`skipMedia=true` 的直通模式是用户在提交表单时显式勾选的，同样构成显式授权。
- 执行可视化 = 官方执行记录页（每节点状态/输入输出/报错），失败节点带 errorCode，重试用官方重试能力 + 各段自身幂等。
- 既有 `wf_product_publish`（发布批次终态通知）不动，与本工作流天然衔接。

---

## 4. 总体设计（v2 工作流版）

### 4.1 自定义工作流节点（src/server/workflow/instructions/）

四个薄封装 instruction，内部直调既有服务函数（照抄 plugin-ai 的 `llm` 节点范式，`workflow.registerInstruction(type, class)`）：

| 节点 type | 封装的服务函数 | config | 输出（供下游变量引用） |
|---|---|---|---|
| `listing-capture` | `executeUrlCapture(plugin, {url, sourcePlatform, options, traceId})` | url 来源变量（默认取触发行 sourceUrl） | `{ productId, captureTaskId }` |
| `listing-process` | `runJob`（从 `aiListingProcessing:runRule` 闭包提为导出函数） | ruleId（默认取触发行 ruleId → aiListingConfig.defaultRuleId） | `{ processingJobId, status }` |
| `listing-approve` | approveDraft 服务化（从 review action 闭包提取，titleFinal 自动兜底逻辑不变） | 无 | `{ productId, status:'reviewed' }` |
| `listing-publish-draft` | publish 服务化（单商品 + strategy 固定 'draft'） | targetStoreId（默认取触发行 → isDefault 店铺） | `{ draftId, draftUrl, publishBatchId }` |

- 各节点失败 → `JOB_STATUS.ERROR` + errorCode/message（执行记录节点上直接可见），可用官方重试；发布节点幂等键 = 执行 id，重跑不重复建草稿。
- 客户端注册（画布渲染 + 配置表单）：照抄 plugin-ai 客户端 workflow 注册链路，节点归入新分组「AI 商品搬运」。
- 改图卡点、跳过分支用**官方节点**（manual / condition），零自定义。

### 4.2 触发 collection `aiListingQuickTransferRequests`（UI 托管）

字段：`sourceUrl(url)`、`ruleId(select)`、`targetStoreId(select)`、`skipMedia(checkbox)`、`note`。原生 FormV2 可绑（= AI 员工 formFiller 可填，与商品抓取页同范式）；工作流 collection 触发（新增一行时）。与既有 `aiListingUrlCaptureRequests`（只桥接抓取的 afterCreate 钩子）互不干扰。

### 4.3 用户动线（全部官方 UI，先不新建业务页）

1. 「快速搬运」表单（原生 FormV2，放商品抓取页新 tab 或独立页）填 URL 提交 → 工作流触发；
2. 「工作流 → 执行记录」看逐节点进度（抓取/处理节点秒级过）；
3. 不勾 skipMedia 时停在 manual 待办：「改图完成后确认继续」——用户去预览编辑/创意工坊改图采纳（既有动线），回待办点提交 → 工作流恢复；
4. approve + publishDraft 自动跑完，执行记录/发布记录里拿草稿链接（post.alibaba.com）。
5. （Q2 起）表单旁给「查看我的搬运待办/执行」快捷入口，弱化找页面的成本。

### 4.4 关键工程决策

- **服务函数抽取**（instruction 的前置）：runJob、approveDraft、publish 三处从 action 闭包提为可导出函数，action 行为不变、加回归单测——这部分工作与 v1 方案完全相同。
- **precheck 缺口自动补齐**：titleFinal→approveDraft 自动兜底（现成）；类目→同平台 categoryOriginalId 兜底，跨平台在 publish 节点内自动 predictCategory；stock 缺省策略（aiListingConfig.defaultStock，可选）。
- **媒体时序**：处理不依赖媒体下载；photobank 支持 http 源 URL 与本地相对路径双分支（已修复）——后台媒体下载不构成流水线阻塞点。
- **审计**：各段沿用自身审计与 taskSteps；工作流执行记录天然多一层逐节点审计。manual 待办提交人 = 「确认继续」的真实操作者。
- **与 wf_product_publish 的关系**：发布节点落 PublishBatches 终态后自然触发既有通知工作流，无需改动。

## 5. 已完成基建（2026-07-11，commit 90d3449b53，E2E 已真实跑通）

Demo 验收通过（用户：「我觉得很完美了」）。已落地并提交：

- **服务化抽取**（行为不变，原单测 16+8+3+28 全绿）：`runProcessingForProducts` / `approveProductDraft` / `runPublishBatch` 从 action 闭包提为导出函数，action 变薄壳。
- **4 个自定义工作流节点**（服务端注册 + v1/v2 画布注册 + i18n）：`listingCapture` / `listingProcess` / `listingApprove` / `listingPublishDraft`；发布节点 strategy 锁 `draft`、幂等键=执行 id；规则兜底链（config → aiListingConfig.defaultRuleId → 首条启用规则）、店铺兜底链（config → isDefault → 首家 connected）。
- **触发集合** `aiListingQuickTransferRequests`（uiManageable：sourceUrl/ruleId/targetStoreId/skipMedia）。
- **工作流实例** `快速搬运流水线（URL→改图→上架草稿）` id=374711387553792（本地建，共库）：数据表事件 → 抓取 → 处理 → manual 人工卡点 → 提审 → 发布草稿；画布路径 `/admin/settings/workflow/workflows/<id>`。
- **E2E 实证**：真实 URL → 39s 到人工卡点 →（卡点期间 saveFinal 补库存）→ 提交待办 → 真实 Alibaba 草稿（图片银行 6 主图+15 详情图）。失败路径同样验证过（PUBLISH_STOCK_INVALID 在执行记录节点上直读）。
- Demo 数据已净零清理；工作流定义保留。

**执行约束（用户明示）**：① 既有功能已测试稳定，一律不动（只增不改）；② QT1–QT5 全部验收完成前**不打包发布生产**。

## 6. 剩余 Phase 拆分（QT1–QT6，可执行/可测/可验收）

### QT1 — 触发入口：商品抓取页「快速搬运」tab
- **范围**：商品抓取页（canonical 25bklerklud）新增第 5 个 tab「快速搬运」（不动现有 4 个 tab）：上方原生 FormV2 绑 `aiListingQuickTransferRequests`（4 字段 + 提交）+ Kai aiEmployee 按钮（AI 代填，商品抓取页同范式）；下方 jsBlock「搬运看板」：最近请求 + 对应执行状态（executions:list 按 workflowId）+ 待办直达 + 草稿链接列 + 刷新。
- **改动**：幂等建页脚本 `docs/plans/scripts/create-quick-transfer-tab.js`（add-tab → add-block 原生表单[resourceInit+fieldPath] → add-action 挂 Kai → add-block jsBlock；商品抓取页 enableTabs 已为 true）；jsBlock 真源 `docs/jsblocks/quick-transfer-board.js`。
- **测试/验收**：表单提交 → 工作流执行启动（看板 6s 内出现新执行）；AI 填表可用；现有 URL/店铺/关键词/批量 4 tab 零回归（逐个打开+提交冒烟）。

### QT2 — skipMedia 条件分支（工作流新版本）+ 建链脚本固化
- **范围**：已执行的工作流版本被引擎锁定 → `workflows:revision` 复制新版 → 新版在处理节点后加官方 condition 节点（basic 引擎判 `{{$context.data.skipMedia}}`）：真分支直通提审、假分支走 manual 卡点 → 切换启用新版。把建链固化为幂等脚本 `docs/plans/scripts/create-quick-transfer-workflow.js`（进版本库，支持从零重建/生产重放；分支节点 branchIndex 语义照 plugin-workflow 约定）。
- **测试/验收**：skipMedia=true 一条龙无待办直达草稿；false 停待办；两分支执行记录画布正确显示走向。

### QT3 — 待办体验：改图卡点直达
- **范围**：manual 节点 config 增强：待办标题模板带商品名；schema 渲染商品摘要（标题/主图/价格）+「去预览编辑改图」「去创意工坊」链接（携 productId，工坊回跳）；任务中心（/admin/workflow/tasks）与页面待办区块入口确认可用。
- **测试/验收**：从待办一键直达改图页，改完回待办提交，工作流继续；待办卡片信息完整可读。

### QT4 — 健壮性与缺省值
- **范围**：① 发布重试语义：`runPublishBatch` 幂等层①改为只短路**成功**批次（失败批次放行真重试；publish action 行为回归单测护住）；② `aiListingConfig.defaultStock` 缺省库存（设置页加项，发布节点 precheck 前兜底写入，默认关闭——关闭时行为与现状完全一致）；③ 同 URL 防重（触发入口查同 URL 非终态执行给提示）；④ 节点 errorCode → 中文指引映射（执行记录 result 携带 nextAction）。
- **测试/验收**：单测覆盖幂等新语义 + defaultStock 开/关两态；失败执行重跑能真重试；无库存商品在开启缺省时直通草稿。

### QT5 — 批量与看板升级
- **范围**：表单支持多行 URL 粘贴（逐行建请求行=逐行独立执行，publish 限速已内置）；看板升级：按请求聚合执行状态/失败原因/重跑按钮/草稿链接/耗时；批量场景防重与并发观测。
- **测试/验收**：一次贴 10 条（含 1 条坏链）：9 成功 1 失败可单独重跑，看板全程可跟踪。

### QT6 — 整体验收 + 上线发布（**须用户发话才打包**）
- **范围**：E2E 脚本固化 `docs/plans/scripts/verify-qt-workflow.js`（gate/skip 两分支，净零清理）；全量回归（既有 4 页动线 + 全部单测）；打包 v2-slim-00x（slim-increment 流程 + compose up 后 nginx reload 铁律 + 全插件前端包 200 + 浏览器探针零报错验收）；生产侧确认：workflow 定义共库已在、新表由容器启动 upgrade 自动同步、生产跑通一条真实搬运。
- **验收**：生产环境从「贴 URL」到「草稿链接」完整可用，既有功能零回归。

## 7. 风险与对策

| 风险 | 对策 |
|---|---|
| 抓取/草稿链依赖 Alibaba 授权 token 过期（refresh 5 天） | run 入口先查 `authStatus`，过期直接 failed 并给「去平台连接页重授权」CTA（token-store 自动刷新已有） |
| 大批量同步发布拖长请求 | Leg B 单商品同步；批量场景逐 run 串行触发（Q3 节流） |
| runJob 当前是 action 内闭包 | Q0 重构为导出函数，加回归单测保证 `aiListingProcessing:runRule` 行为不变 |
| 用户重复点「开始搬运」重复建商品 | 同 URL 非终态 run 查重提示 + publish 幂等键双保险 |
| 生产部署 | 走 slim-increment 流程；**compose up 后必须 nginx reload**；上线验收=全插件前端包 200 + 浏览器探针零报错 |

## 8. 与铁律/权限的关系（不变式）

- AI 只产候选（origin=ai_candidate），采纳/弃用是用户显式动作（audit actorType=user）——改图卡点原样保留；
- 真实对外发布（含草稿创建）由用户点击触发，pipeline 不自动执行 Leg B；
- 只做 `strategy:'draft'`；直接上架仍走商品发布页；
- API Key/token 永不出服务端；新 action 全部 loggedIn ACL，敏感字段（credentialRef 等）沿用剥离中间件。
