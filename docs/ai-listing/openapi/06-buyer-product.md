# Buyer - Product（采购方-商品选品/查询）

面向采购/分销渠道的选品类接口：按 product_id 批量/单个查询 Alibaba.com 商品详情、库存、属性、证书；按关键词/图片搜索与推荐；跨境/海外本地货盘清单；渠道店铺批量导入与事件回传。除特别说明外均需 `access_token`。

> 通用约定：`country`/`ship_to_country` 用 ISO 3166-1 alpha-2（如 US）；`language` 用 IETF BCP 47（如 en-US、zh-CN）；`currency` 用 ISO 4217（如 USD）。多个商品详情接口共用同一套商品结构（wholesale_trade、skus、ladder_price 等）。

---

## Batch Get Product Description（批量查询商品详情）

- **path**：`/eco/buyer/product/batch/description`
- **方法**：GET
- **功能**：按 product_ids 批量获取 Alibaba 商品详情。

### 请求参数
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| param0.product_ids | Number[] | 是 | Alibaba 商品 ID 列表 |
| param0.country | String | 否 | 国家（ISO 3166-1 alpha-2） |
| param0.ship_to_country | String | 否 | 收货国（用于计算成本价） |
| param0.language | String | 否 | 语言（BCP 47） |
| param0.currency | String | 否 | 货币（ISO 4217） |

### 响应参数（要点）
| 参数 | 类型 | 说明 |
|---|---|---|
| data.resultData[] | Object[] | 成功查询的商品详情 |
| resultData[].product_id / title / description / detail_url | - | 商品基础信息 |
| resultData[].category / category_id | - | 类目 |
| resultData[].status | String | PRODUCT_ONLINE / PRODUCT_OFFLINE / PRODUCT_DELETE |
| resultData[].supplier / eCompanyId | String | 供应商公司名 / 公司 ID |
| resultData[].main_image / images / video_url | - | 主图 / 图片 / 视频 |
| resultData[].min_order_quantity / currency | - | 起订量 / 货币 |
| resultData[].wholesale_trade[] | Object[] | 批发信息（unit_type、sale_type normal/batch、price、handling_time、shipping_line_template_id、weight、package_size、volume、deliver_periods[]） |
| resultData[].skus[] | Object[] | SKU（sku_id、image、unit、status、ladder_price[]（min_quantity、max_quantity=-1 不限、price、currency）、sku_attr_list[]、成本价字段 total_origin_cost_price/total_discount_cost_price/cost_origin_price/cost_discount_price/shipping_fee） |
| data.failedItems[] | Object[] | 失败项（productId、errorCode 如 PRODUCT_NOT_FOUND、errorMsg） |
| success / message / code | - | 是否成功 / 信息 / 响应码 |

### 错误码
无（错误项在 failedItems 中）。

---

## Batch Get Product Inventory（批量查询商品库存）

- **path**：`/eco/buyer/product/batch/inventory`
- **方法**：GET
- **功能**：按 product_ids 批量获取 Alibaba 商品库存。

### 请求参数
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| query_req.product_ids | Number[] | 是 | 商品 ID 列表 |
| query_req.shipping_from | String | 否 | 发货国 |
| query_req.ship_to | String | 否 | 收货国 |

### 响应参数
| 参数 | 类型 | 说明 |
|---|---|---|
| data.result_data[] | Object[] | 商品库存（product_id、ship_from_list[]、inventory_list[]：shipping_from + 各 SKU inventory_list（sku_id、inventory_count、inventory_unit）） |
| data.failed_items[] | Object[] | 失败项（product_id、error_code、error_msg） |
| success / message / code | - | 是否成功 / 信息 / 响应码 |

### 错误码
无。

---

## Batch Get Product Keyattributes（批量查询商品关键属性）

- **path**：`/eco/buyer/product/batch/keyattributes`
- **方法**：GET
- **功能**：按 product_ids 批量获取 Alibaba 商品属性。

### 请求参数
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| query_req.product_ids | Number[] | 是 | 商品 ID 列表 |
| query_req.country | String | 否 | 国家 |
| query_req.ship_to_country | String | 否 | 收货国 |
| query_req.language | String | 否 | 语言 |
| query_req.currency | String | 否 | 货币 |

### 响应参数
| 参数 | 类型 | 说明 |
|---|---|---|
| data.resultData[] | Object[] | 成功项（productId、attributes[] 属性分组：type、attributes[]（id、name、values[]（id、name、verified 是否平台校验））） |
| data.failedItems[] | Object[] | 失败项（productId、errorCode、errorMsg） |
| success / message / code | - | 是否成功 / 信息 / 响应码 |

### 错误码
无。

---

## Channel Product Events（渠道商品事件回传）

- **path**：`/eco/buyer/product/events`
- **方法**：POST
- **功能**：从外部销售渠道回传商品上下架状态（ACTIVE/INACTIVE）和当前价格等事件。

### 请求参数
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| query_req.events[] | Object[] | 是 | 事件列表 |
| events[].ali_product_id | Number | 是 | Alibaba 商品 ID |
| events[].event_type | String | 是 | PRODUCT_LISTED / PRODUCT_DELISTED / ORDER_PLACED |
| events[].channel | String | 否 | 渠道标识（大写），如 TKS/SHOPIFY/MERCADO/TEMU/AMAZON/WALMART/SHEIN |
| events[].channel_store_id | String | 否 | 渠道店铺 ID |
| events[].body | Object | 否 | 事件消息体（自由 JSON） |

### 响应参数
| 参数 | 类型 | 说明 |
|---|---|---|
| result.result_data | Object | 成功接收的事件数 |
| result.result_code / result_message | String | 结果码 / 信息 |

### 错误码
无。

---

## Channel Store Products Batch Import By EcoId（按 EcoId 批量导入渠道店铺）

- **path**：`/eco/buyer/product/channel/batch-import`
- **方法**：POST
- **功能**：按 ecologyId 异步批量将商品导入渠道店铺。

### 请求参数
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| query_req.ecology_type | String | 是 | 渠道标识（大写），如 WIX/SHOPIFY/MERCADO |
| query_req.product_ids | Number[] | 是 | Alibaba 商品 ID 列表，最多 100 |
| query_req.language | String | 是 | 语言（BCP 47） |
| query_req.ecology_store_id | String | 否 | 渠道站点 ID |
| query_req.ecology_instance_id | String | 否 | 渠道实例 ID |

### 响应参数
| 参数 | 类型 | 说明 |
|---|---|---|
| result.result_data | Object | pending_count 待导入数、site_id |
| result.result_code | Number | 结果码 |
| result.success / result_message | - | 成功标志 / 信息 |

### 错误码
无。

---

## Cross-Border Product List（跨境货盘清单）

- **path**：`/eco/buyer/crossborder/product/check`
- **方法**：GET
- **功能**：返回 Alibaba.com 上具有跨境库存的商品清单。

### 请求参数
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| param0.size | Number | 是 | 每页数量，最大 300 |
| param0.index | Number | 是 | 页码，从 0 开始 |

### 响应参数
| 参数 | 类型 | 说明 |
|---|---|---|
| result.result_data | Number[] | Alibaba.com 商品 ID 列表 |
| result.result_code / result_msg | String | 结果码 / 信息 |

### 错误码
无。

---

## Get Product Certificates（查询商品证书）

- **path**：`/eco/buyer/product/cert`
- **方法**：GET
- **功能**：按 product_id 获取 Alibaba 商品证书。

### 请求参数
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| req.product_id | Number | 是 | 商品 ID |

### 响应参数
| 参数 | 类型 | 说明 |
|---|---|---|
| result.result_data[] | Object[] | 证书信息（cert_name 名称、cert_no 编号、cert_urls[] 链接） |
| result.result_code / result_msg | String | 结果码 / 信息 |

### 错误码
无。

---

## Get Product Description（查询单个商品详情）

- **path**：`/eco/buyer/product/description`
- **方法**：GET
- **功能**：按 product_id 获取单个 Alibaba 商品详情（结构同批量详情接口的单条）。

### 请求参数
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| query_req.product_id | Number | 是 | 商品 ID |
| query_req.country | String | 否 | 国家 |
| query_req.ship_to_country | String | 否 | 收货国（计算成本价） |
| query_req.language | String | 否 | 语言 |
| query_req.currency | String | 否 | 货币 |

### 响应参数
result.result_data 为商品详情，字段同「Batch Get Product Description」单条结构：product_id、title、description、detail_url、category/category_id、status、supplier/eCompanyId、main_image/images/video_url、min_order_quantity、currency、wholesale_trade（unit_type、sale_type、price、handling_time、shipping_line_template_id、weight、package_size、volume、deliver_periods[]、mode_id 型号）、skus[]（image、unit、ladder_price[]、sku_attr_list[]、成本价字段）。

### 错误码
无。

---

## Get Product Key Attributes（查询单个商品关键属性）

- **path**：`/eco/buyer/product/keyattributes`
- **方法**：GET
- **功能**：按 product_id 获取关键属性。

### 请求参数
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| query_req.product_id | Number | 是 | 商品 ID |
| query_req.country | String | 是 | 国家码（ISO 3166-1 alpha-2） |

### 响应参数
| 参数 | 类型 | 说明 |
|---|---|---|
| result.result_data.attributes[] | Object[] | 关键属性分组（type、attributes[]（name、values[]（value）） |
| result.result_code / result_msg | String | 结果码 / 信息 |

### 错误码
无。

---

## Get item inventory（查询单个商品库存）

- **path**：`/eco/buyer/product/inventory`
- **方法**：GET
- **功能**：按 product_id 和发货地查询商品库存。

### 请求参数
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| inv_req.product_id | Number | 是 | 商品 ID |
| inv_req.shipping_from | String | 否 | 发货国码（大写，US/UK/CN/CA/AU... 推荐 CN） |
| inv_req.ship_to | String | 否 | 收货国 |

### 响应参数
| 参数 | 类型 | 说明 |
|---|---|---|
| result.result_ship_from_list | String | 所有可发货国 |
| result.result_data[] | Object[] | 库存数据（shipping_from、inventory_list[]（sku_id、inventory_count、inventory_unit）） |
| result.result_code / result_msg | String | 结果码 / 信息 |

### 错误码
无。

---

## Local Product List（海外本地货盘清单）

- **path**：`/eco/buyer/local/product/check`
- **方法**：GET
- **功能**：返回 Alibaba.com 上具有海外（本地）库存的商品清单。

### 请求参数
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| req.size | Number | 是 | 每页数量，最大 300 |
| req.index | Number | 是 | 页码，从 0 开始 |

### 响应参数
| 参数 | 类型 | 说明 |
|---|---|---|
| result.result_data | Number[] | 商品 ID 列表 |
| result.result_code / result_msg | String | 结果码 / 信息 |

### 错误码
无。

---

## Local Product List - Regular Fulfillment（海外本地货盘-常规履约）

- **path**：`/eco/buyer/localregular/product/check`
- **方法**：GET
- **功能**：返回具有海外库存的商品清单（常规履约）。请求/响应同上「Local Product List」。

### 错误码
无。

---

## Product Image Search（按商品图搜索）

- **path**：`/eco/buyer/item/rec/image`
- **方法**：GET
- **功能**：用合作伙伴提交的 Item ID 进行以图搜品。

### 请求参数
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| recReq.item_id | Number | 是 | 唯一 item id |
| recReq.size | Number | 是 | 每页条数 |
| recReq.index | Number | 是 | 页码 |

### 响应参数
| 参数 | 类型 | 说明 |
|---|---|---|
| result.result_data.products[] | Object[] | 商品（product_id、price、permalink、image（main_image、multi_image[]）） |
| result.result_data.pagination | Object | current、page_count、page_size、total_product_count |
| result.result_code / result_msg | String | 结果码 / 信息 |

### 错误码
无。

---

## Product List（货盘清单，按类型）

- **path**：`/eco/buyer/product/check`
- **方法**：GET
- **功能**：返回 Alibaba.com 商品清单，含美国/墨西哥本地及中国跨境等，按 product_type 区分。

### 请求参数
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| query_req.size | Number | 是 | 每页数量，最大 300 |
| query_req.index | Number | 是 | 页码，从 0 开始 |
| query_req.product_type | String | 是 | 商品类型枚举：localregular/crossborder/mxlocal/eu_local/US_GGS_48H/US_CGS_Normal 等（详见原文众多枚举） |

### 响应参数
| 参数 | 类型 | 说明 |
|---|---|---|
| result.result_data | Number[] | 商品 ID 列表 |
| result.result_total | Number | 结果总数 |
| result.result_code / result_msg | String | 结果码 / 信息 |

### 错误码
无。

---

## Product Search（关键词搜索商品）

- **path**：`/eco/buyer/product/search`
- **方法**：GET
- **功能**：在 Alibaba.com 上按关键词搜索商品。

### 请求参数
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| param0.keyword | String | 是 | 搜索关键词 |
| param0.size | Number | 是 | 每页数量，最大 50 |
| param0.index | Number | 是 | 页码，从 1 开始 |
| param0.productType | String | 否 | 商品类型枚举（US_CGS_48H/crossborder/alibaba_picks 等） |
| param0.shipToCountry | String | 否 | 收货国（ISO alpha-2） |
| param0.shipFrom | String | 否 | 发货国（US/CN/IN/DE/ES/IT/VN/MX） |
| param0.language | String | 否 | 语言 |
| param0.currency | String | 否 | 货币 |

### 响应参数
| 参数 | 类型 | 说明 |
|---|---|---|
| data.products[] | Object[] | 商品（product_id、title、price、permalink、image（main_image、multi_image[]）） |
| data.pagination | Object | current、page_count、page_size、total_product_count |
| code / message | String | 响应码 / 信息 |

### 错误码
| 错误码 | 错误信息 | 解决方案 |
|---|---|---|
| 400 | Parameter format is error! | 参数类型/枚举/缺字段错误，按契约校验 |
| 500 | system error | 服务器异常，稍后重试或带 trace ID 联系支持 |

---

## Product Search & Recommendation（搜索与推荐）

- **path**：`/eco/buyer/item/rec`
- **方法**：GET
- **功能**：用 Item ID 基于上传数据生成搜索与推荐结果。

### 请求参数
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| recReq.item_id | Number | 是 | 唯一 item id |
| recReq.size | Number | 是 | 每页条数 |
| recReq.index | Number | 是 | 页码 |
| recReq.type | Number | 是 | 推荐类型：1 按主图搜 / 2 相似推荐 / 3 热销 |

### 响应参数
| 参数 | 类型 | 说明 |
|---|---|---|
| result.result_data.products[] | Object[] | 商品（product_id、price、permalink、image（main_image、multi_image[]）） |
| result.result_data.pagination | Object | current、page_count、page_size、total_product_count |
| result.result_code / result_msg | String | 结果码 / 信息 |

### 错误码
无。
