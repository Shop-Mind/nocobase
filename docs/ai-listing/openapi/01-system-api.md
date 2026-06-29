# System API（系统接口）

OAuth 令牌相关接口。token 网关：`https://openapi-api.alibaba.com/rest`（IOP SDK 自动追加 `/rest`）。

> 注意：官方文档示例里把端点写成 `https://auth.lazada.com/rest`，那是 Lazada 示例。Alibaba.com 应用（如 appKey `502870`）必须使用 `https://openapi-api.alibaba.com/rest`，否则报 `InvalidAppKey`。

---

## GenerateAccessToken

- **path**：`/auth/token/create`
- **方法**：GET/POST
- **是否授权**：不需要 access_token（用授权码换取）
- **功能**：用 OAuth 授权回调拿到的一次性授权码 `code` 换取 `access_token` 和 `refresh_token`（首次授权）。

### 请求参数
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| code | String | 是 | OAuth 授权码，示例 `0_100132_2DL4DV3jcU1UOT7WGI1A4rY91`，一次性、快速过期 |
| uuid | String | 否 | 当前无效字段，请勿使用 |

### 响应参数
| 参数 | 类型 | 说明 |
|---|---|---|
| expires_in | Number | access_token 有效期（秒） |
| account_id | String | 账号 ID；允许为空，若 `account_platform=seller_center` 则 `account_id=null` |
| country | String | 国家 ID（sg 新加坡、my 马来西亚、ph 菲律宾、th 泰国、id 印尼、vn 越南） |
| account_platform | String | 账号平台 |
| access_token | String | 访问令牌 |
| account | String | 用户账号（登录用户） |
| refresh_expires_in | String | refresh_token 有效期（秒） |
| refresh_token | String | 刷新令牌，当 `refresh_expires_in>0` 时用于刷新 access_token |
| user_info | Object | 国家/用户详情对象 |
| user_info.country | String | 国家 ID |
| user_info.seller_id | String | 卖家 ID |
| user_info.user_id | String | 用户 ID |
| user_info.loginId | String | 登录 ID |

### 错误码
无（文档未列出）。

---

## RefreshAccessToken

- **path**：`/auth/token/refresh`
- **方法**：GET/POST
- **是否授权**：不需要 access_token（用 refresh_token 刷新）
- **功能**：刷新 access_token，返回新的 access_token / refresh_token 及有效期。

### 请求参数
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| refresh_token | String | 是 | 刷新令牌 |

### 响应参数
| 参数 | 类型 | 说明 |
|---|---|---|
| expires_in | Number | access_token 有效期（秒） |
| account_id | String | 账号 ID；允许为空，若 `account_platform=seller_center` 则 `account_id=null` |
| country | String | 国家 ID |
| account_platform | String | 账号平台（seller_center） |
| access_token | String | 访问令牌 |
| account | String | 用户账号（登录用户） |
| refresh_expires_in | Number | refresh_token 有效期（秒） |
| refresh_token | String | 刷新令牌，当 `refresh_expires_in>0` 时用于刷新 access_token |
| user_info | Object | 国家/用户详情对象 |
| user_info.country | String | 国家 ID |
| user_info.seller_id | String | 卖家 ID |
| user_info.user_id | String | 用户 ID |
| user_info.loginId | String | 登录 ID |

### 错误码
无（文档未列出）。
