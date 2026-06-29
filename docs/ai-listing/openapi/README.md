# Alibaba.com 开放平台接口中文参考库

> 来源：`https://openapi.alibaba.com/doc/api.htm`（官方 API Reference）。
> 抓取方式：浏览器自动化遍历文档树，逐个接口抽取。文档内容为英文，本参考库的功能说明、参数说明已整理为中文，参数名/类型/路径等技术标识保留英文。
> 用途：作为 `AI 上品助手` 对接 Alibaba.com 官方 OpenAPI（含上架草稿 v2）的接口字典，仅整理文档，不在阿里平台做任何写操作。

## 网关与签名（通用）

- 业务/系统网关：`https://openapi-api.alibaba.com/rest`（IOP/GOP）。
- 签名：IOP SDK 自动按 appKey/appSecret 计算（HMAC，sign_method 见各接口），并追加 `/rest`。
- 鉴权：除 System API 的 token 接口外，业务接口需传 `access_token`（即 `session`），由 OAuth 授权码换取。
- 时间戳：`timestamp` 使用 GMT+8（`yyyy-MM-dd HH:mm:ss`），允许最大 10 分钟误差。
- 调用方公网 IP 必须在应用 IP 白名单内，否则返回 `AppWhiteIpLimit`。

## 分类总览（共 8 类 / 85 个接口）

| # | 分类 | 接口数 | 文档 | 状态 |
|---|---|---|---|---|
| 1 | System API | 2 | [01-system-api.md](./01-system-api.md) | 已完成 |
| 2 | Product | 23 | [02-product.md](./02-product.md) | 已完成 |
| 3 | Product V2 | 14 | [03-product-v2.md](./03-product-v2.md) | 已完成 |
| 4 | Video | 4 | [04-video.md](./04-video.md) | 已完成 |
| 5 | Buyer - Partner Data Management | 4 | [05-buyer-partner-data-management.md](./05-buyer-partner-data-management.md) | 已完成 |
| 6 | Buyer - Product | 16 | [06-buyer-product.md](./06-buyer-product.md) | 已完成 |
| 7 | Buyer - Transaction & Fulfillment | 16 | [07-buyer-transaction-fulfillment.md](./07-buyer-transaction-fulfillment.md) | 已完成 |
| 8 | Seller - Transaction & Fulfillment | 6 | [08-seller-transaction-fulfillment.md](./08-seller-transaction-fulfillment.md) | 已完成 |

> 抓取进度：8/8 分类、85/85 接口已抽取详情并整理为中文（含参数表、响应表、错误码）。来源公开可见、无需登录。每个接口详情含「功能 / 请求参数 / 响应参数 / 错误码」，深层嵌套对象按要点归纳，技术标识保留英文。

## 接口清单（name + path）

### 1. System API
| 接口名 | path | 方法 |
|---|---|---|
| GenerateAccessToken | `/auth/token/create` | GET/POST |
| RefreshAccessToken | `/auth/token/refresh` | GET/POST |

### 2. Product
| 接口名 | path | 方法 |
|---|---|---|
| alibaba.icbu.category.get.new | `/icbu/product/category/get` | GET/POST |
| alibaba.icbu.category.id.mapping | `/alibaba/icbu/category/id/mapping` | GET/POST |
| alibaba.icbu.category.schema.level.get | `/icbu/product/schema/level/get` | GET/POST |
| alibaba.icbu.photobank.group.list | `/icbu/product/photobank/group/list` | GET/POST |
| alibaba.icbu.photobank.group.operate | `/icbu/product/photobank/group/operate` | GET/POST |
| alibaba.icbu.photobank.list | `/icbu/product/photobank/list` | GET/POST |
| alibaba.icbu.photobank.upload | `/alibaba/icbu/photobank/upload` | GET/POST |
| alibaba.icbu.product.batch.update.display | `/icbu/product/update/display` | GET/POST |
| alibaba.icbu.product.get | `/icbu/product/get` | GET/POST |
| alibaba.icbu.product.group.add | `/icbu/product/group/add` | GET/POST |
| alibaba.icbu.product.id.encrypt | `/alibaba/icbu/product/id/encrypt` | GET/POST |
| alibaba.icbu.product.inventory.get | `/icbu/product/inventory/get` | GET/POST |
| alibaba.icbu.product.inventory.update | `/icbu/product/inventory/update` | GET/POST |
| alibaba.icbu.product.list | `/alibaba/icbu/product/list` | GET/POST |
| alibaba.icbu.product.schema.add | `/icbu/product/schema/add` | GET/POST |
| alibaba.icbu.product.schema.add.draft | `/icbu/product/schema/add/draft` | GET/POST |
| alibaba.icbu.product.schema.get | `/alibaba/icbu/product/schema/get` | GET/POST |
| alibaba.icbu.product.schema.render | `/icbu/product/schema/render` | GET/POST |
| alibaba.icbu.product.schema.render.draft | `/icbu/product/schema/render/draft` | GET/POST |
| alibaba.icbu.product.schema.update | `/icbu/product/schema/update` | GET/POST |
| alibaba.icbu.product.score.get | `/icbu/product/score/get` | GET/POST |
| alibaba.icbu.product.type.available.get | `/icbu/product/other/available/get` | GET/POST |
| icbuproduct | `/icbu/product` | GET/POST |

### 3. Product V2
| 接口名 | path | 方法 |
|---|---|---|
| Category prediction | `/alibaba/icbu/category/predict/v2` | GET/POST |
| Change listing status | `/alibaba/icbu/product/batch/update/status` | GET/POST |
| Create a new product listing | `/alibaba/icbu/product/listing/v2` | GET/POST |
| Delete draft | `/alibaba/icbu/draft/delete` | GET/POST |
| Delete product | `/alibaba/icbu/product/delete` | GET/POST |
| Edit Product Inventory | `/icbu/product/edit-inventory` | GET/POST |
| Edit Product Price | `/icbu/product/edit-price` | GET/POST |
| Edit product information | `/alibaba/icbu/product/update/v2` | GET/POST |
| Get Category Information | `/alibaba/icbu/category/get/v2` | GET/POST |
| Get Product Information | `/alibaba/icbu/product/get/v2` | GET/POST |
| Query Category Attributes | `/alibaba/icbu/category/attribute/get/v2` | GET/POST |
| Query Product List | `/alibaba/icbu/product/search/v2` | GET/POST |
| Query product listing status | `/alibaba/icbu/product/status/get/v2` | GET/POST |
| Query shipping templates | `/alibaba/icbu/product/list/shipping/templates` | GET/POST |

### 4. Video
| 接口名 | path | 方法 |
|---|---|---|
| alibaba.icbu.video.query | `/alibaba/icbu/video/query` | GET/POST |
| alibaba.icbu.video.relation.product.main | `/alibaba/icbu/video/relation/product/main` | GET/POST |
| alibaba.icbu.video.upload | `/alibaba/icbu/video/upload` | GET/POST |
| alibaba.icbu.video.upload.result | `/alibaba/icbu/video/upload/result` | GET/POST |

### 5. Buyer - Partner Data Management
| 接口名 | path | 方法 |
|---|---|---|
| Remove Product | `/eco/buyer/item/delete` | PUT |
| Retrieve Products Information | `/eco/buyer/item/query` | GET |
| Update Product | `/eco/buyer/item/update` | POST |
| Upload Product | `/eco/buyer/item/add` | POST |

### 6. Buyer - Product
| 接口名 | path | 方法 |
|---|---|---|
| Batch Get Product Description | `/eco/buyer/product/batch/description` | GET |
| Batch Get Product Inventory | `/eco/buyer/product/batch/inventory` | GET |
| Batch Get Product Keyattributes | `/eco/buyer/product/batch/keyattributes` | GET |
| Channel Product Events | `/eco/buyer/product/events` | POST |
| Channel Store Products Batch Import By EcoId | `/eco/buyer/product/channel/batch-import` | POST |
| Cross-Border Product List | `/eco/buyer/crossborder/product/check` | GET |
| Get Product Certificates | `/eco/buyer/product/cert` | GET |
| Get Product Description | `/eco/buyer/product/description` | GET |
| Get Product Key Attributes | `/eco/buyer/product/keyattributes` | GET |
| Get item inventory | `/eco/buyer/product/inventory` | GET |
| Local Product List | `/eco/buyer/local/product/check` | GET |
| Local Product List - Regular Fulfillment | `/eco/buyer/localregular/product/check` | GET |
| Product Image Search | `/eco/buyer/item/rec/image` | GET |
| Product List | `/eco/buyer/product/check` | GET |
| Product Search | `/eco/buyer/product/search` | GET |
| Product Search & Recommendation | `/eco/buyer/item/rec` | GET |

### 7. Buyer - Transaction & Fulfillment
| 接口名 | path | 方法 |
|---|---|---|
| Advanced Freight Cost Calculation | `/order/freight/calculate` | GET/POST |
| Basic Freight Cost Estimation | `/shipping/freight/calculate` | GET/POST |
| Combined payment group query service | `/order/merge/pay/query` | GET/POST |
| Create BuyNow Order | `/buynow/order/create` | GET/POST |
| Logistics Tracking | `/order/logistics/tracking/get` | GET/POST |
| Oversea admittance check api | `/icbu/check/overseas/admittance` | GET/POST |
| alibaba dropshipping order pay | `/alibaba/dropshipping/order/pay` | GET/POST |
| alibaba fund query api | `/alibaba/order/fund/query` | GET/POST |
| alibaba ggs seller warehouse list | `/alibaba/ggs/warehouse/list` | GET/POST |
| alibaba order attachment upload | `/alibaba/order/attachment/upload` | GET/POST |
| alibaba order cancel | `/alibaba/order/cancel` | GET/POST |
| alibaba order get | `/alibaba/order/get` | GET/POST |
| alibaba order list | `/alibaba/order/list` | GET/POST |
| alibaba order pay result query | `/alibaba/order/pay/result/query` | GET/POST |
| alibaba seller warehouse list | `/warehouse/list` | GET/POST |
| order logistics info query api | `/order/logistics/query` | GET/POST |

### 8. Seller - Transaction & Fulfillment
| 接口名 | path | 方法 |
|---|---|---|
| Ggs Order Multi Shipping | `/alibaba/order/v2/multi/shipping` | GET/POST |
| Ggs one Order Shipping | `/alibaba/v2/order/shipping` | GET/POST |
| alibaba ggs create batch order | `/alibaba/ggs/logistic/createBatchOrder` | GET/POST |
| alibaba ggs place logistic order | `/alibaba/ggs/logistic/placeorder` | GET/POST |
| alibaba ggs query carrier | `/alibaba/ggs/logistic/queryCarrier` | GET/POST |
| alibaba ggs query logistic order list | `/alibaba/ggs/logistic/queryLogisticOrderList` | GET/POST |
