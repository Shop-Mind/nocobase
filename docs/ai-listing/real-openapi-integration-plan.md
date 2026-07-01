# 跨平台 OpenAPI 真接入方案（Alibaba.com 国际站为第一平台）

> 目标：把当前全 mock 的抓取/发布，逐步替换为**真实平台 OpenAPI 调用**；架构从第一天就按「多平台可插拔」设计（1688 国际=Alibaba.com ICBU、1688 国内、Lazada、拼多多、抖音…）。
>
> 落地方式：cloudflared 把公网域名 `xuanwu.space` 隧道到本机 `:13000`，让平台 OAuth 回调能打到本地；出站业务调用仍从本机公网 IP 发出（IP 白名单单独处理，见 §0.3）。
>
> 已知参数：AppKey `502870`；App Secret 待用户提供（只进 `.env`，永不进代码/日志/审计/前端）。已在 Alibaba 控制台登记回调：`https://xuanwu.space/nocobase-api/aiListingOpenApi:oauthCallback`。

---

## 0. 关键事实与约束（动手前必须先对齐）

### 0.1 网关与签名（IOP/GOP 家族，多平台共用）
- **业务/系统网关**：`https://openapi-api.alibaba.com/rest`。**不要**用文档示例里的 `https://auth.lazada.com/rest`（那是 Lazada 样例），Alibaba.com 应用用 lazada 域名会报 `InvalidAppKey`。
- **签名**：IOP 规范。`sign_method=sha256`，对「所有请求参数（含 `app_key`/`timestamp`/`sign_method` 与业务参数）按 key 字典序拼接，前后不加 API path（新版 `/rest` 网关）」做 `HMAC-SHA256(appSecret, concatenated)`，结果转大写 hex 填入 `sign`。**签名算法必须单测锁定**（§Phase B）。
- **timestamp**：毫秒时间戳或 `GMT+8 yyyy-MM-dd HH:mm:ss`（IOP 新网关用**毫秒时间戳**），允许最大 10 分钟误差。
- **鉴权**：除 `/auth/token/create|refresh` 外，业务接口都要带 `access_token`（IOP 参数名 `session` 或 `access_token`，以 SDK/联调为准）。
- **Lazada 复用**：Lazada 也是 IOP 家族、同一套签名，只是网关域名/授权域名不同 → IOP 传输核心一次写好，Lazada connector 只换 host + endpoint。**拼多多、抖音不是 IOP**，各自独立签名，走 connector 内部实现（§Phase H）。

### 0.2 回调路径与本应用 API 前缀不一致（必须处理）
- 本应用 `API_BASE_PATH=/api/`（见根 `.env`），但控制台登记的回调是 `/nocobase-api/aiListingOpenApi:oauthCallback`。cloudflared **不重写路径**，NocoBase 的 `/api/` 路由不会接住 `/nocobase-api/...` → 404。
- **采用方案（推荐）**：在插件 `load()` 里注册一条**原生 Koa 中间件**，精确匹配 `ctx.path === '/nocobase-api/aiListingOpenApi:oauthCallback'`。优点：与 `API_BASE_PATH` 解耦、天然公开（绕过 ACL，回调本就无登录态）、路径与控制台登记值逐字节一致。
- 备选：在控制台把回调改成 `https://xuanwu.space/api/aiListingOpenApi:oauthCallback`，然后用普通 NocoBase 公开 action。二选一即可，本方案默认走原生中间件。

### 0.3 IP 白名单（cloudflared 解决不了，单独处理）
- cloudflared 只解决**入站**（平台把回调打到本地）。**出站**业务调用仍从**本机公网 IP** 发出。
- Alibaba App 控制台「IP Whitelist」必须加入本机当前公网 IP，否则业务接口报 `AppWhiteIpLimit`（授权/换 token 一般不校验白名单，但业务接口校验）。
- 本机公网 IP 会变 → 每次变了要在控制台更新；`aiListingConfig.openApiIpWhitelisted` 已有布尔开关记录这个事实。**生产**用固定出口 IP 的服务器一次加白。

### 0.4 安全铁律（延续现有约定，不放松）
- App Secret / access_token / refresh_token **只在服务端**；token **落库前加密**（AES-256-GCM，密钥来自 env `AI_LISTING_TOKEN_SECRET`）。
- 日志/审计**脱敏**：只记 `msg_code`/`trace_id`/http 状态，绝不记 token、Secret、完整响应体。
- 前端只可见 `authStatus / storeName / expiresAt / country`，**永不**下发 token。
- 所有真实写操作（发布/改价/改库存/删除）走**受控 action + 审计 `actorType=user`**，沿用现有 publish 受控写口，AI 只暂存不写库。
- Secret 放**根 `.env`**（已确认 git-ignored），不要写进任何 `*.example` 或源码。

### 0.5 授权 URL（authorize endpoint）——需在控制台核对
- 这批文档只覆盖 `token/create`、`token/refresh`，**没有** authorize URL。GOP/ICBU 标准授权 URL 形如：
  `https://openapi-auth.alibaba.com/oauth/authorize?response_type=code&client_id=<appKey>&redirect_uri=<callback>&state=<state>&force_auth=true`
- **动手前**去控制台「Auth Management / 授权管理」确认真实 authorize 域名与参数名（不同平台不同），把结论回填到 `alibaba-icbu` connector 的 `oauth.authorizeBase`。**先按上面的模板联调，遇到 4xx 再据控制台修正。**

---

## 1. 目标架构（分层，一次写对，多平台可插拔）

```
src/server/
  openapi/                      # IOP 家族通用传输层（Alibaba.com / Lazada / AliExpress 复用）
    iop-client.ts               # 签名(HMAC-SHA256) + 网关请求 + 统一错误
    crypto.ts                   # AES-256-GCM 加解密 token（env: AI_LISTING_TOKEN_SECRET）
    token-store.ts              # 读写 aiListingPlatformAccounts；getValidAccessToken(accountId) 过期前自动刷新
    oauth.ts                    # buildAuthorizeUrl / exchangeCode / refreshToken（打 /auth/token/*）
    errors.ts                   # OpenApiError + msg_code → 运营友好中文提示 映射
  platforms/                    # 平台连接器（可插拔）
    types.ts                    # PlatformConnector 接口 + 能力枚举(capabilities)
    registry.ts                 # platform id → connector 注册表 + isRealEnabled(platform)
    alibaba-icbu/
      index.ts                  # connector：oauth 元信息 + fetchProduct + publish + queryStatus
      mappers.ts                # OpenAPI JSON ⇄ NormalizedProduct / PublishPayload 映射（纯函数，单测）
  resources/
    ai-listing-openapi.ts       # authorizeUrl / connectStore / disconnect / status（受控 action）+ 回调中间件装配
```

**接线点（改现有文件，不重写）**：
- `adapters/index.ts` `resolveAdapter()`：平台 real 开关开且有有效 token → 走 `connector.fetchProduct`；否则回退现有 mock（联调期可 mock/real 并存）。
- `publish/adapters.ts`：把 `REAL_PUBLISH_ENABLED`（全局布尔）升级为 `isRealEnabled(platform)`（按平台粒度）；`resolvePublishAdapter` 返回真实 connector 发布。

**PlatformConnector 接口（草案，Phase D 定稿）**：
```ts
export interface PlatformConnector {
  id: string;                                  // 'alibaba-icbu' | '1688-domestic' | 'lazada' | 'pdd' | 'douyin'
  label: string;
  family: 'iop' | 'custom';                     // iop 家族复用 iop-client；custom 自签名
  capabilities: Array<'oauth' | 'capture' | 'publish' | 'inventory' | 'price' | 'status'>;
  oauth?: { authorizeBase: string; scopes?: string[] };
  buildAuthorizeUrl(state: string): string;
  exchangeCode(code: string): Promise<TokenBundle>;
  refresh(refreshToken: string): Promise<TokenBundle>;
  fetchProduct?(accountId: number, ref: { productId?: string; url?: string }, opt?: CaptureOptions): Promise<NormalizedProduct>;
  publish?(accountId: number, payload: PublishPayload): Promise<PublishResult>;
  queryStatus?(accountId: number, targetProductId: string): Promise<'online' | 'draft' | 'failed' | 'pending'>;
}
```

---

## 2. Phase 规划（每个 Phase：目标 / 改动 / 可执行步骤 / 调试验证 / 验收 / 回滚）

> 依赖顺序：A（隧道）→ B（传输+token 存储）→ C（OAuth 闭环）→ D（连接器抽象）→ E（抓取真接入）→ F（发布真接入）→ G（灰度加固）→ H（扩平台）。A 不需要 Secret，可立即做；B 起需要 Secret。

---

### Phase A — cloudflared 隧道：公网回调可达本地（不需 Secret，先做）

**目标**：`https://xuanwu.space/...` 的请求能稳定打到本机 `http://localhost:13000`；先用一个健康检查路径验证隧道通。

**前提**：`xuanwu.space` 已托管在用户的 Cloudflare 账号（NS 指向 Cloudflare）。cloudflared 已安装（`/usr/local/bin/cloudflared` 已确认）。

**可执行步骤**（登录/授权是交互式，请用 `! ` 前缀在会话里跑）：
1. 登录（浏览器授权选择 `xuanwu.space` 这个 zone）：
   `! cloudflared tunnel login`
2. 建命名隧道（记下生成的 tunnel UUID 与凭证 json 路径）：
   `! cloudflared tunnel create nocobase-local`
3. 绑 DNS（把 `xuanwu.space` 指向该隧道）：
   `! cloudflared tunnel route dns nocobase-local xuanwu.space`
4. 写 ingress 配置 `~/.cloudflared/config.yml`（我可代写，见下）。
5. 起隧道（前台先跑，联调期可留着）：
   `! cloudflared tunnel run nocobase-local`

**`~/.cloudflared/config.yml`（我可代生成）**：
```yaml
tunnel: nocobase-local
credentials-file: /Users/wuzhixuan/.cloudflared/<TUNNEL-UUID>.json
ingress:
  - hostname: xuanwu.space
    service: http://localhost:13000
  - service: http_status:404
```

**调试/验证**：
- 本机先起 NocoBase（`:13000` 可访问）。
- 隧道跑起来后，外网访问 `https://xuanwu.space/api/__health`（或任一已知 GET）应回到本地。若 502 → NocoBase 没起或端口不对；若 1033/1016 → DNS 未指向隧道，重跑步骤 3。
- **注意**：回调路径 `/nocobase-api/...` 在 Phase C 才由中间件接住；Phase A 只验证「域名→本地」链路通即可。

**验收**：外网 curl `https://xuanwu.space/...` 能收到本地 NocoBase 响应（哪怕是 404 JSON，只要是 NocoBase 发的就算通）。

**回滚**：`Ctrl-C` 停 `cloudflared tunnel run`；删 DNS：`cloudflared tunnel route dns` 反操作或在 Cloudflare 面板删 CNAME。

---

### Phase B — IOP 传输核心 + 凭证/Token 加密存储（需 Secret）

**目标**：把「签名→打网关→解析→错误映射」和「token 加密落库/读取/自动刷新」写成可单测的核心；此时还不接 OAuth 页面，仅用脚本验证 `token/create`（拿一个手动授权码）能换到 token。

**改动/新增**：
- `openapi/iop-client.ts`：`signRequest(params, secret)`、`callIop({ path, params, accessToken? })`、超时/重试（幂等 GET 才重试）、把 `{ success:false, msg_code, message, trace_id }` 或 IOP `code!=0` 统一抛 `OpenApiError`。
- `openapi/crypto.ts`：`encrypt(plain)/decrypt(enc)`，AES-256-GCM，key = `scrypt(env.AI_LISTING_TOKEN_SECRET)`；密文格式 `v1:<iv>:<tag>:<cipher>`（base64）。
- `openapi/token-store.ts`：
  - `saveToken(accountId, bundle)`：加密写 `accessTokenEnc/refreshTokenEnc/expiresAt/refreshExpiresAt/country/accountUid`，`authStatus='connected'`。
  - `getValidAccessToken(accountId)`：读→解密→若 `expiresAt` 剩余 < 5 分钟则用 refresh_token 刷新并回写；refresh 也过期 → 置 `authStatus='expired'` 并抛需重新授权错误。
- `openapi/oauth.ts`：`exchangeCode(code)`、`refreshToken(rt)` → 调 `callIop('/auth/token/create'|'/auth/token/refresh')`，解析 §01 文档字段（`access_token/refresh_token/expires_in/refresh_expires_in/account/country/user_info`）为 `TokenBundle`。
- **DB 字段**（加到 `collections/platform-accounts.ts`，新列启动 `yarn nocobase upgrade` 自动同步，无需迁移文件）：
  `accessTokenEnc(text) refreshTokenEnc(text) refreshExpiresAt(date) accountUid(string) sellerId(string) country(string)`。保留现有 `credentialRef`（改注释为“兼容旧引用，真实 token 走 *Enc 字段”）。
- **env（根 `.env`，git-ignored）**：`ALIBABA_ICBU_APP_KEY=502870`、`ALIBABA_ICBU_APP_SECRET=<用户给>`、`AI_LISTING_TOKEN_SECRET=<随机32+字节>`、`ALIBABA_OAUTH_CALLBACK_URL=https://xuanwu.space/nocobase-api/aiListingOpenApi:oauthCallback`。

**调试/验证**：
- **签名单测**（最关键，先锁死）：`iop-client.test.ts` 用固定 params + 假 secret 断言 `sign` 期望值；用官方「签名示例」或先跑通一次真实调用反推固定向量。
- **crypto 单测**：`decrypt(encrypt(x)) === x`；篡改密文/换 key 抛错。
- **换 token 冒烟**：控制台手动完成一次授权拿到一次性 `code`（浏览器里授权→回调页 URL 上的 `code`，Phase C 前可手工复制），跑一个临时脚本 `callIop('/auth/token/create',{code})` → 应返回 token。失败看 `msg_code`：`InvalidAppKey`（网关域名错）、`invalid_code`（code 过期，重取）、时间戳误差（校本机时钟）。
- **token-store 冒烟**：`saveToken` 后 DB 里是密文（肉眼不可读）；`getValidAccessToken` 能解出且过期自动刷新（把 `expiresAt` 改到过去验证刷新分支）。

**验收**：签名/crypto 单测过；能用真实 `code` 换到 token 并加密落库；`getValidAccessToken` 过期自动刷新成功。

**回滚**：这些是新增文件+新增列，不影响现有 mock 流程；删文件/清列即可。

---

### Phase C — OAuth 授权闭环 + 设置页「连接店铺」（需 Secret，依赖 A、B）

**目标**：运营在设置页点「连接 Alibaba.com 店铺」→ 跳授权 → 平台回调 `xuanwu.space` → 中间件换 token 落库 → 回到设置页显示「已连接 / 过期时间 / 国家」。全程 token 不下发前端。

**改动/新增**：
- `resources/ai-listing-openapi.ts`：
  - action `authorizeUrl`（受控，登录态）：生成 `state`（存短期缓存/一次性）→ 返回 `connector.buildAuthorizeUrl(state)`，前端 `window.location` 跳转。
  - **回调中间件**（在插件 `load()` 里 `this.app.use(...)`，精确匹配 `ctx.path==='/nocobase-api/aiListingOpenApi:oauthCallback'`）：校验 `state` → `oauth.exchangeCode(code)` → 找/建对应 `aiListingPlatformAccounts` 行 → `saveToken` → 302 回 `/admin/...设置页?connected=1`。异常 → 302 回设置页带 `?error=<code>`，页面用 §errors 映射提示。
  - action `status`：返回该平台各店铺的 `{ storeName, authStatus, expiresAt, country }`（**不含 token**）。
  - action `disconnect`：清 token 字段、`authStatus='disconnected'`，审计 `actorType=user`。
- 设置页（jsBlock）：加「连接店铺」按钮（调 `authorizeUrl` 后跳转）、连接状态卡片（调 `status`）、「断开」按钮。沿用现有 jsBlock 受控 action 模式。

**调试/验证**：
- A 的隧道必须在跑。点「连接店铺」→ 观察是否跳到授权页；授权后浏览器是否回到 `xuanwu.space/nocobase-api/...`；本地服务日志是否进回调中间件、`exchangeCode` 是否成功。
- 常见坑：`redirect_uri` 与控制台登记**逐字节一致**（含大小写、`:`、末尾无斜杠）；`state` 失配（缓存过期/多标签）→ 放宽有效期或换 DB 存 state；回调 302 目标要回 `/admin/`（原生 ChatBox/桌面在此）。
- 回调中间件里**绝不**把 `code`/token 打进日志。

**验收**：一次点击完成授权→回调→落库→设置页显示「已连接」；刷新后 `status` 稳定；`disconnect` 后变「未连接」。

**回滚**：移除中间件装配与 action；已落库 token 手动清空。现有流程不受影响。

---

### Phase D — 平台连接器抽象 + 注册表（承前启后，代码整理）

**目标**：把 Phase B/C 里 Alibaba 专有逻辑收敛进 `platforms/alibaba-icbu/`，对外只暴露 `PlatformConnector`；`registry.ts` 提供 `getConnector(platform)` 与 `isRealEnabled(platform)`（读 env/`aiListingConfig`），为多平台与灰度铺路。

**改动/新增**：
- `platforms/types.ts`：定稿 `PlatformConnector`、`TokenBundle`、`CaptureOptions`（复用 `adapters/index.ts` 的 `NormalizedProduct`/`PublishPayload`，避免重复类型）。
- `platforms/registry.ts`：`const REGISTRY = { 'alibaba-icbu': alibabaIcbuConnector }`；`isRealEnabled(platform)` = env 开关 `AI_LISTING_REAL_<PLATFORM>=true` 且该店铺 `authStatus==='connected'`。
- `platforms/alibaba-icbu/index.ts`：实现接口，内部调 `openapi/*`。`oauth.exchangeCode/refresh` 从 Phase B 迁入这里（薄封装）。
- 把 Phase C 的 resource 改为「按 `platform` 参数从 registry 取 connector」，不再硬编码 Alibaba。

**调试/验证**：Phase C 的授权闭环改走 registry 后仍全绿（回归）；`getConnector('unknown')` 抛清晰错误。

**验收**：授权闭环回归通过；新增平台只需在 registry 加一行即可被 resource/adapters 识别。

**回滚**：抽象是纯重构，git revert 即可。

---

### Phase E — Alibaba.com 抓取接真实（依赖 D）

**目标**：把「贴 Alibaba 商品链接/ID → 抓取」从 mock 换成真实 OpenAPI；产出现有 `NormalizedProduct`，下游预览/加工/发布不改。

**用哪个接口**（按可得性择一，mappers 里适配）：
- 卖家自有商品：`/alibaba/icbu/product/get/v2`（§03，返回 basic_info/category_info/attributes/logistics_info/trade_info，结构最全）。
- 买家选品（搬运他人货盘）：`/eco/buyer/product/batch/description`（§06，含 wholesale_trade/skus/ladder_price/成本价），配 `/eco/buyer/product/search`（关键词搜）、`/eco/buyer/product/batch/inventory`、`/eco/buyer/product/batch/keyattributes`。
- 类目/属性辅助：`/alibaba/icbu/category/get/v2`、`/alibaba/icbu/category/attribute/get/v2`。

**改动/新增**：
- `platforms/alibaba-icbu/mappers.ts`：`toNormalizedFromProductGetV2(resp)`、`toNormalizedFromBuyerDescription(item)` → `NormalizedProduct`（title/description/price/currency/stock/category/attributes/skus/media 全映射；SKU 从 `sku_info[]`/`skus[]`，图片从 `product_images`/`images`/`main_image`，价格取 tiered/ladder 首档）。**纯函数 + 单测**（喂官方响应样例）。
- `platforms/alibaba-icbu/index.ts` `fetchProduct`：`parseAlibabaProductId(url)` → `getValidAccessToken` → `callIop(get/v2 或 buyer/description)` → mapper。
- `adapters/index.ts` `resolveAdapter`：host 命中 alibaba 且 `isRealEnabled('alibaba-icbu')` → 返回一个 delegating adapter 调 connector；否则现有 mock。**保留 mock 作为 fallback**，联调期用 env 切换。

**调试/验证**：
- 先用**只读**接口（`product/get/v2`）联调，风险最低。
- `AI_LISTING_REAL_ALIBABA-ICBU=false` 时全走 mock（回归）；置 `true` 且已连接店铺时走真实。
- 真实调用失败逐个看 `msg_code`：`B_PRODUCT_NOT_FOUND`（ID 不对/非自有）、`AppWhiteIpLimit`（§0.3 加白名单）、`IllegalAccessToken`（token 失效→触发刷新/重新授权）。
- mapper 单测覆盖：无 SKU、区间价、多图、缺字段容错。

**验收**：真实链接/ID 抓到真数据并正确映射为 `NormalizedProduct`；mock/real 可 env 切换；mapper 单测全绿。

**回滚**：env 关 real → 秒回 mock。

---

### Phase F — Alibaba.com 发布接真实（依赖 E，最高风险，最后做）

**目标**：把「模拟发布」换成 `/alibaba/icbu/product/listing/v2` 真实发布；发布前补齐类目/属性/运费模板/图片上传；发布后轮询状态。**默认关闭**，逐店铺灰度开。

**发布链路（编排在 connector.publish 内）**：
1. 类目：`category/predict/v2`（无 category_id 时预测）或用户已选 → 拿 `category_id`。
2. 必填属性：`category/attribute/get/v2` 取 required 属性 → 校验 `PublishPayload.attributes` 是否补齐（沿用现有 precheck `PUBLISH_ATTRIBUTES_MISSING`）。
3. 图片：非 alicdn 图先 `alibaba.icbu.photobank.upload`（§02）上传拿平台图 URL（最多 6 张，单图≤5MB）。
4. 运费模板：`product/list/shipping/templates` 取 `template_id`（发布必填 `shipping_template_id`）。
5. 发布：`product/listing/v2` 传 `product_info{ basic_info, category_info, attributes, trade_info(price/inventory/sku_info/moq/unit), logistics_info }`，返回 `result.data`=商品 ID。
6. 状态：`product/status/get/v2` 轮询 `online/draft/failed/pending`，回写 `aiListingPublishRecords`。

**改动/新增**：
- `platforms/alibaba-icbu/mappers.ts`：`toListingV2Payload(PublishPayload)`（映射价格 TIERED/RANGE、SKU sale_attributes、logistics）。
- `platforms/alibaba-icbu/index.ts` `publish` + `queryStatus`。
- `publish/adapters.ts`：`REAL_PUBLISH_ENABLED`（全局）→ `isRealEnabled(platform)`（按平台）；真实分支调 connector.publish。
- **幂等**：发布前生成 `idempotencyKey`（productId+store+内容 hash），DB 记「进行中/已成功」防重复发布；失败可重试，成功不重发。
- **限速**：per-store 令牌桶/最小间隔，避免触发平台限流。

**调试/验证**：
- 全程 `isRealEnabled` 默认 false；开单个测试店铺灰度。
- 先发**草稿**（若接口支持 draft 态）验证链路，再放开正式发布。
- 逐错误码映射运营提示（§03 错误码表：`B_TITLE_NOT_FOUND`/`B_PRICE_ALL_NULL`/`B_CONTAINS_INVALID_IMAGE`…）。
- 发布后 `status/get/v2` 轮询直到 `online/failed`；`failed` 落 `status_desc`。

**验收**：测试店铺能真实发布出一条商品并轮询到 `online`；重复点击不产生重复商品（幂等）；错误有运营友好提示。

**回滚**：`isRealEnabled=false` 立即回 mock；已发布商品用 `product/delete` 或平台后台处理。

---

### Phase G — 灰度、可观测、加固（贯穿，收口）

- **开关矩阵**：`AI_LISTING_REAL_<PLATFORM>` + 每店铺 `authStatus` 双条件；`aiListingConfig` 暴露只读开关状态给设置页。
- **脱敏日志/审计**：统一走 `openapi/errors.ts`，只记 `msg_code/trace_id/http/耗时`；加一条 CI/lint 检查禁止 `console.log(token|secret)`。
- **重试/超时/熔断**：GET 幂等接口指数退避重试；写接口不自动重试（靠幂等键）；连续失败熔断并置店铺 `expired`。
- **错误码字典**：`errors.ts` 维护 `msg_code → { userMessage(zh/en), retryable, action }`，前端统一渲染。
- **时钟**：容器/本机 NTP 校时，避免签名 timestamp 误差。
- **IP 白名单自检**：启动或定时探测出口公网 IP，与 `openApiIpWhitelisted` 比对，变了提醒去控制台更新。

---

### Phase H — 扩平台样板（架构验证，按需推进）

- **1688 国内**：ICBU 之外的 1688 开放平台（不同 appKey/网关/授权域），多为 IOP 家族 → 复用 `iop-client`，新建 `platforms/1688-domestic/`，换 host+endpoint+mapper。
- **Lazada**：IOP 家族，授权域 `auth.lazada.com`、网关 `api.lazada.com/rest`，签名一致 → connector 只配 host+endpoint。
- **拼多多 / 抖音**：**非 IOP**，各自签名（拼多多 MD5 pop 签名、抖音 open api 签名）→ `family:'custom'`，在各自 connector 内实现 `signRequest`，不走 iop-client。
- 每加一个平台：`platforms/<id>/` + `registry.ts` 加一行 + 控制台登记各自回调（同一 `xuanwu.space` 隧道，路径按 `platform` 区分，如 `.../oauthCallback?platform=lazada`）。

---

## 3. 立即可做 vs 待 Secret

| 现在就能做（不需 Secret） | 待用户给 App Secret 后 |
|---|---|
| Phase A cloudflared 隧道（登录/建隧道/DNS/config/验证域名→本地） | Phase B 起：签名/crypto/token-store、换 token 冒烟 |
| 骨架文件与接口签名（`openapi/*`、`platforms/*` 空实现 + 类型 + 单测桩） | Phase C 授权闭环真实联调 |
| DB 新列（platform-accounts）、env 键位占位（值留空） | Phase E/F 抓取/发布真接入 |

---

## 4. 给用户的下一步

1. **确认可以开始 Phase A**：我需要你用 `! cloudflared tunnel login` 完成浏览器授权（选 `xuanwu.space` zone），其余（create/route dns/config.yml/run）我可代写代跑。
2. **确认 authorize URL**（§0.5）：去控制台「Auth Management」核对真实授权域名与参数名，回给我。
3. **准备 App Secret**：Phase B 开始时给我，我只写进根 `.env`（已确认 git-ignored）。
4. **确认本机公网 IP 加白名单**（§0.3）：控制台「IP Whitelist」加当前公网 IP。

> 铁律不变：Secret/token 只在服务端且加密落库、日志审计脱敏、前端永不见 token、真实写操作走受控 action + `actorType=user` 审计、AI 只暂存不写库。
