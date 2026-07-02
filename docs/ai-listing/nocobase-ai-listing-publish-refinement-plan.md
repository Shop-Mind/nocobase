# 发布链路精细化规划（Phase G 系列）

> 版本 v1.0 · 2026-07-02
> 依据：阿里国际站官方接入 wiki（alibabawork.yuque.com `org-wiki-alibabawork-uitq29/ohmqh3`，下称 wiki）全部 10 篇文档 + open.alibaba.com 文档中心，逐篇通读后按「对我们平台的价值 × 依赖关系」拆分为可独立执行、可独立验收的 phase。
> 现状基线：schema 草稿引擎已跑通（结构化详描 + 图片银行主图/详情图 + 类目预测 + 官方 multiComplex 格式 + 文本规则预检），真机成品草稿 10000044538133 / 10000044541091。

## 0. 文档结论速览（规划依据）

| 文档 | 对我们的关键信息 |
|---|---|
| 【交易/商机】商品发布接入文档 | 全字段 XML 格式权威（已用于草稿引擎重写）；发货期/物流属性/件重尺为必填组件；SKU 矩阵完整提交格式；version 参数（trade.1.1 全面交易化） |
| 质量分检测接入文档 | **`alibaba.icbu.quality.score.calculate`**：与发布同一份 XML，返回总分 + 六维度（类目/基本信息/交易/物流/通用服务/详情）逐项 error/warn/success + 整改理由 + **建议类目** |
| 商品API相关常见错误码说明 | 30+ 发布/编辑错误码及处理建议（含商品总量超限、草稿总量超限、类目经营范围、阶梯交期递增等） |
| 【新接口】商品更新接口使用文档 | `schema.update` **增量更新**（传什么改什么）；改详情需带 productDescType=2+superText（转义 HTML）；价格类型切换的字段联动；改 saleProp 必须同时提交 sku |
| 商品接口变动说明 | 2026-01-27 详描结构化开放（已接）；**2025-10-14 详情必填**（PUB_BIZCHECK_DESCRIPTION_IS_REQUIRED 的官方出处）；2025-01-15 组件下线清单（market/shippingTemplateId/marketPrice/marketMinOrderQuantity 等）；新增库存读写接口、发品能力查询、商品 ID 加解密 |
| 商品xml校验 | 官方仅提供 Java SDK（top-schema jar）本地解析校验 → 我们用 TS 校验层等价实现（已起步） |
| 【海外货】/【RTS/定制】发布文档、海外仓 SOP | 独立发品链路（publish_type / schema.add.light / check.overseas.admittance 准入 / 库存同步），按需后置 |

---

## Phase G1：发布前置检查中心（本地 schema 校验 + 平台质量分）

**目标**：把「发出去才知道错」变成「发之前就知道错在哪、怎么改」；同一份草稿 XML 复用平台质量分接口，产出可操作的整改报告。

### G1.1 本地 schema 规则校验扩展（schema-draft.ts 校验层已起步，补全）
- 规则覆盖：requiredRule（含 ladderPeriod/logisticsProperty 等组件级必填缺失提示）、maxLength/minLength（byte|character 已有）、min/maxValueRule、min/maxInputNumRule、选项合法性（singleCheck/multiCheck 值必须在 options 内，预防 `PUB_BIZCHECK_SALE_PROPERTY_VALEU_IS_NOT_EXPECT`）、图片数量（主图 ≤6 `CHK_IMAGE_FILE_COUNT_EXCEED`、详情图 ≤30/图集）、阶梯价与阶梯交期数量递增（`CHK_STEP_LADDER_PERIOD_VALUE_ERROR`）、SKU 价格 >0（`PUB_BIZCHECK_SKU_PRICE`）。
- 已下线组件黑名单（2025-01-15 变动）：market/shippingTemplateId(顶层)/marketPrice/marketMinOrderQuantity/paymentMethod/warehouseType —— 引擎绝不产出，校验层遇到即报。
- 产出结构化预检报告 `{level: block|warn, field, code, message, fix?}` 并入 publish 前置流程：block 项本地拦截不发（省一次真机失败），warn 项照发 + notes。
- **验收**：单测覆盖每类规则（构造违规 payload → 断言 block/warn/自动修正）；发布页勾选一个故意缺价商品 → 本地拦截并给出「哪个字段、什么规则、怎么改」；全部合法商品照常发布成功。

### G1.2 平台质量分接入（quality.score.calculate）
- connector 新增 `calculateQualityScore(token, catId, xml)`：复用 buildDraftXml 产出的同一份 XML；解析平铺返回（`productQuality_score` 总分 + `productQuality_dataSource_N_*` 六维度逐项 text/type/code/reason，reason 内含建议类目）。
- 服务端新 action `aiListingPublish:qualityScore`（productId → 组 XML → 调分 → 返回结构化报告；写入 products 新列 qualityScore/qualityReport jsonb 供列表展示）。
- 发布页：商品表加「质量分」列（色阶 Tag），点开抽屉看六维度报告；「建议类目」一键采纳（写 categoryTargetId/Name，复用现有类目回写逻辑）。
- 可选策略开关：低于阈值（如 3.0）时发布确认框内醒目警告（不强制拦截——草稿本来就要人工审）。
- **验收**：对产品 3 调分返回总分与维度报告；报告里的建议类目一键采纳后字段更新；发布页列/抽屉渲染正确；接口失败（超时/权限）不阻断发布只降级提示。

### G1.3 错误码字典扩充
- `openapi/errors.ts` friendlyMessage 表并入 wiki 错误码清单（30+ 条：商品/草稿总量超限、类目经营范围/调整中、审核中勿重复提交、顶展/明星展播锁定、促销锁定、信保权限等），每条带「处理建议」。
- 发布记录页失败原因 → 友好文案 + 建议动作（已有 UI 骨架，换数据源即可）。
- **验收**：单测断言代表性错误码映射；人为构造一次 `PUB_BIZCHECK_CAT_PUB_RESTRICT` 类错误（或 mock）→ 记录页显示中文原因与建议。

**依赖**：无（纯增量）。**估算**：后端 1.5 天 + 页面 0.5 天。

---

## Phase G2：视频全链路接入（用户点名，最高优先级之一）

**目标**：主图视频/详情视频随草稿自动带入，正式品可绑定，已有草稿可补挂。

**现状**：代码已就绪（`uploadVideoToBank` 302 直链解析 → video/upload → upload/result 轮询 → 草稿走 XML `imageVideo` 字段、正式品走 relation/product/main）；**卡点在账号侧**：Video 权限组开通后网关已放行，但视频后端对所有 Video 接口统一返回 `10000002 illegal param error`（换参数/换视频源/刷新 token 均无效）→ 判定店铺侧视频银行/授权未就绪。

### 执行步骤
1. **账号侧解锁（需用户操作）**：① 平台账号页**重新授权店铺**（重走 OAuth，旧 token 刷新无效）；② 登录 myAlibaba 打开一次「媒体中心/视频银行」，确认能看到视频列表。
2. 真机重测：video/query 能列出视频 → video/upload 产品 3 源视频（play.video.alibaba.com 302 → CDN 直链）→ COMPLETE 拿 video_id。
3. 草稿链路验证：新发草稿 XML 带 `imageVideo`，编辑页确认主图视频占位出现；`detailVideo`（详情视频，≤10min/500MB）如有素材一并带入。
4. **存量草稿补挂**：10000044538133 / 10000044541091 由于草稿池不可用 relation/schema.update——直接删旧重发（引擎自动带视频），或留给编辑页人工挂（二选一，按用户偏好）。
5. 视频结果落 notes + 发布记录（已有），媒体资产表记录 video_id 避免重复上传（同 URL 幂等）。

**验收**：video/query 返回列表；新发草稿编辑页可见主图视频；重复发布同商品不重复上传视频（复用 video_id）；账号未就绪时发布不受阻、note 说明原因。
**依赖**：用户完成账号侧两步。**估算**：账号解锁后 0.5 天（代码已备，主要是真机验证+幂等补强）。

---

## Phase G3：SKU 矩阵与交易/物流信息全量直写

**目标**：草稿打开即是「可直接提交」的完整度——逐 SKU 价格/库存矩阵、发货期、物流属性、件重尺全部带入，运营只剩核对。

- **SKU 矩阵**（官方 demo 格式）：`sku` multiComplex，每 SKU 一个 `<complex-values>`：`props` multiInput（`<value propValueId propId propName propValueName>propId:propValueId</value>`，自定义值用负数 id 与 saleProp 一致）+ `skuStock`（`srcValue="0" warehouseCode="CN_LOCAL_01"`，新发 srcValue=0）+ `price`（scPrice=SKU 价时生效）+ `skuOuterId`（用我们的 sku 编码）。
  - 支持两维销售属性（颜色×尺寸）：saleProp 两个维度都写（自定义负数编号去重），SKU 行按笛卡尔组合中实际存在的写。
  - 定价策略：SKU 售价用预览编辑页已定的 priceTarget（无则按阶梯价首档折算 + note）。
- **发货期 ladderPeriod**（必填组件）：阶梯交期与阶梯价起订量对齐（官方要求一致 + 递增），默认 `quantity=moq, day=7`（可在发布配置覆盖）。
- **物流属性 logisticsProperty**（必填）：从 schema options 匹配「普货 general_cargo_0」，匹配不上取第一项 + note。
- **件重尺 pkgWeight/pkgMeasure**：抓取数据有单件重量/尺寸才写（毛重与长宽高必须成组），无则留人工 + note。
- **version 显式传参**：schema/get 与 add/draft 带 `version=trade.1.1`（全面交易化），避免平台切版时行为漂移。
- **验收**：重发产品 3 → 编辑页 SKU 矩阵每行价格/库存与系统一致、发货期/物流属性已选；单测断言 XML 片段；schema 无对应字段的类目自动跳过不报错。

**依赖**：无（G1 的选项合法性校验可先行保护）。**估算**：1.5–2 天（SKU props 编号与 saleProp 对齐是细活）。

---

## Phase G4：平台商品运维（增量更新 / 库存同步 / 能力探测）

**目标**：发布不是终点——商品库里改价、改库存、改标题、改详情能直接推到平台已发布商品，形成「系统为主、平台为镜像」的运维闭环。

- `schema.update` 增量更新（官方：传什么改什么）：connector 新增 `updateProduct(token, productId, catId, partialXml)`；首期支持标题 / 价格（阶梯价/SKU 价，注意价格类型联动：FOB↔阶梯↔SKU 价切换需按文档带联动字段）/ 详情（productDescType=2 + 转义 superText）/ SKU（编辑必须带 skuId；改 saleProp 必须同时提交 sku）。
- 库存专用轻接口：`product.sku.inventory.get` / `product.inventory.update`（比整单 update 安全，做「库存同步」按钮/定时）。
- `product.type.available.get` 发品能力探测：授权时查询商家可发类型（询盘/交易/半托管），发布页据此隐藏不可用策略，预防 `PUB_BIZCHECK_POST_TYPE_CONFIRM`/`PUB_BIZCHECK_PRIVILEGE_REQUIRED`。
- 商品库/发布记录页：已发布商品行加「推送更新 / 同步库存」操作（走审计，actorType=user）。
- **注意**：仅对**已上架商品**可用（草稿池对 update 系接口不可见，真机已验证）；促销/顶展锁定等错误码给友好提示（G1.3 字典）。
- **验收**：对一个已上架测试品：系统改价 → 平台商品页价格变化；改库存 → inventory.get 读回一致；锁定类错误显示友好原因；全程审计留痕。

**依赖**：需要至少 1 个已上架商品做真机验收（可用低敏测试品）。**估算**：2 天。

---

## Phase G5：发布页与 AI 员工体验精细化

**目标**：把 G1–G4 的能力用「运营顺手」的方式装进页面。

- 发布页：质量分列 + 报告抽屉（G1.2）；预检报告内联展示（block 红/warn 黄，替代目前纯文字）；批量「先算分再发布」流程引导；草稿成功横幅带「待人工步骤清单」（核对 USD 价格/选风格/可选公司图 FAQ——由 notes 自动生成）。
- 发布记录页：错误码友好化（G1.3）+「查看质量报告」+ 一键重发。
- Lena（发布助理）AI 上下文升级：注入质量报告与预检结果 → 可对话解释「为什么这项 warn、怎么改」，整改建议可一键回填（走既有 jsBlockApplyPatch staged 机制，Submit 才落库）。
- **验收**：浏览器过一遍完整发布流：选品 → 算分 → 看报告 → 采纳建议类目 → 发布草稿 → 成功横幅步骤清单 → 记录页状态/报告可回看；Lena 能就报告内容问答并回填建议。

**依赖**：G1（数据源）。**估算**：1–1.5 天（jsBlock + Lena 上下文）。

---

## Phase G6（可选，按业务需要再排期）：多场景发品

- **海外现货/海外仓**（SOP 文档）：`check.overseas.admittance` 准入探测 → 海外货 schema 链路（overseasCountry 字段）→ `schema.add.light` 轻发布 → 库存同步；发布页平台策略增加「海外仓」场景。
- **RTS/定制品**：publish_type 区分询盘品/下单品/RTS，字段集差异大（付款方式/发货港口/快递信息/定制服务），需单独 schema 适配。
- **半托管**：platformLogisticsServices + semiManagedPeriod（≤7 天），前提商家开通半托管。
- **关税 HsCode**（政策性）：tariffsHsCode 组件（cgs/hkgs 可交易品必填），预留字段与校验。
- **验收**（届时细化）：每场景一个真机草稿/发布样品 + 对应预检规则。

---

## 执行顺序与里程碑

```
G2 视频（账号侧解锁后立即，0.5d）
G1 检查中心（G1.1 本地校验 → G1.2 质量分 → G1.3 错误码，2d）
G3 SKU/物流全量直写（2d）
G5 页面与 Lena 体验（1.5d）
G4 平台商品运维（2d，需上架测试品）
G6 多场景（可选，另行排期）
```

- 每个 phase 独立提交（commit 粒度=phase），提交前门禁不变：eslint --fix 通过、`yarn test` 插件套件全绿、diff 无密钥。
- 真机验证一律走正式发布链路（HTTP action），测试草稿用后即删（draft/delete），店铺原有 631 个商品绝不触碰。
- 平台 openapi 网关不稳（ServiceTimeout 常见）：所有新接口调用带重试 + 降级 note，绝不因外围能力（质量分/视频）阻断发布主链路。

## 风险与开放问题

1. **视频账号侧**：若重新授权 + 打开媒体中心后仍 10000002，需平台工单（附 traceId，如 `0babf64117829966414815966`）。
2. **质量分接口权限（已真机探测，2026-07-02）**：`alibaba.icbu.quality.score.calculate` 在网关上按 7 种路径惯例全部 `InvalidApiPath` —— 该接口对本 App 尚未开放（官方公告为「分 ISV 陆续开放」）。需在开放平台控制台申请该接口组 / Contact us 工单（同 Video 权限流程，AppKey 503006）；开通前 G1.2 页面功能自动降级隐藏，G1.1 本地校验与 G1.3 错误码字典不受影响可先行。
3. **schema.update 真机行为**：文档称增量更新，但价格类型联动细节多，G4 用测试品先行、逐字段扩量。
4. **version=trade.1.1**：显式传参前先真机对比有无差异（避免与当前隐式版本行为不一致）。
