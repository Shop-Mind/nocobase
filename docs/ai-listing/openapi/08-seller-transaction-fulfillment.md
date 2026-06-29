# Seller - Transaction & Fulfillment（卖家-交易与履约）

卖家侧发货回传与 GGS 物流下单/批次/运力查询接口。均需 `access_token`。

> 发货回传：先用 `alibaba.seller.order.shipping.channels` 取承运商 code、`alibaba.order.picture.upload` 取附件 file_path，再调用单笔/多笔发货接口。GGS 物流下单链路：createBatchOrder 建批次 → queryCarrier 查运力 → placeorder 下单。

---

## Ggs Order Multi Shipping（多笔发货）

- **path**：`/alibaba/order/v2/multi/shipping`
- **方法**：GET/POST
- **功能**：GGS 订单多笔发货回传。

### 请求参数
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| param_multi_shipping_create_request.requests[] | Object[] | 是 | 发货请求列表 |
| requests[].shipping_request | Object | 是 | 发货请求 |
| shipping_request.trade_id | String | 是 | 信保单号 |
| shipping_request.service_provider | String | 是 | 承运商（code 由 alibaba.seller.order.shipping.channels 获取） |
| shipping_request.tracking_number | String | 是 | 物流单号 |
| shipping_request.logistics_type | String | 是 | 物流类型（EXPRESS 或 POST） |
| shipping_request.contact_mobile | String | 否 | 手机号后 4 位 |
| shipping_request.attachments[] | Object[] | 否 | 物流凭证（file_name、file_path 由 alibaba.order.picture.upload 获取） |
| shipping_request.goods[] | Object[] | 是 | 发货商品（quantity、product_id 即 sku Id、trade_id） |

### 响应参数
| 参数 | 类型 | 说明 |
|---|---|---|
| voucher_ids | Number[] | 成功创建的物流凭证 ID |

### 错误码
| 错误码 | 错误信息 | 解决方案 |
|---|---|---|
| 402 | invalidate request | 参数缺失或不符合规范 |
| 402 | tradeId/serviceProvider/trackingNumber must not be null | 对应字段必填 |
| 402 | logisticsType must equals EXPRESS or POST | 物流类型须为 EXPRESS 或 POST |
| 403 | this is not your order or you are not the admin account | 非本账号订单或非主账号 |
| 404 | order not exist | 订单不存在，检查 tradeId |
| 500 | system error | 系统错误 |

---

## Ggs one Order Shipping（单笔发货）

- **path**：`/alibaba/v2/order/shipping`
- **方法**：GET/POST
- **功能**：GGS 订单单笔发货回传。

### 请求参数
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| shipping_request.trade_id | String | 是 | 信保单号 |
| shipping_request.service_provider | String | 是 | 承运商 code |
| shipping_request.logistics_type | String | 是 | 物流类型（EXPRESS / POST） |
| shipping_request.tracking_number | String | 是 | 物流单号 |
| shipping_request.contact_mobile | String | 否 | 手机号后 4 位 |
| shipping_request.attachments[] | Object[] | 否 | 物流凭证（file_name、file_path） |

### 响应参数
| 参数 | 类型 | 说明 |
|---|---|---|
| voucher_id | Number | 成功创建的物流凭证 ID |

### 错误码
同「Ggs Order Multi Shipping」（402/403/404/500）。

---

## alibaba ggs create batch order（创建批次单）

- **path**：`/alibaba/ggs/logistic/createBatchOrder`
- **方法**：GET/POST
- **功能**：创建物流批次单。

### 请求参数
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| param_query.trade_id | String | 是 | 信保单号 |
| param_query.ali_id | Number | 是 | aliId |

### 响应参数
| 参数 | 类型 | 说明 |
|---|---|---|
| result.data[].batch_id | String | 批次单号 |
| result.success / error_code / error_message | - | 是否成功 / 错误码 / 信息 |

### 错误码
无。

---

## alibaba ggs place logistic order（GGS 物流下单）

- **path**：`/alibaba/ggs/logistic/placeorder`
- **方法**：GET/POST
- **功能**：GGS 物流下单对外开放接口。

### 请求参数（要点，`paramn_query`）
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| trade_id | String | 是 | 信保单号 |
| carrier_code | String | 否 | 承运商编码 |
| package_list[] | Object[] | 是 | 包裹信息（length/width/height cm、weight kg、quantity） |
| consignor_address | Object | 是 | 发货人地址（contact{phone_code,mobile_no,email,contact_person,company_name_cn,company_name_en}、address{country{name,code},province{name,code},address}） |
| consignee_address | Object | 是 | 收货人地址（结构同发货人） |
| seller | Object | 是 | 卖家（admin_ali_id、ali_id） |
| admin_ali_id / ali_id | Number | 是 | 管理员 / 下单人 aliId |
| destination_country_code / destination_province_code / destination_zip_code | String | 是 | 目的地国家/省份/邮编编码 |
| origin_country_code / origin_province_code / origin_zip_code | String | 是 | 发货地国家/省份/邮编编码 |
| sp_service_code / service_code | String | 是 | 服务商服务编码 / 服务 code |
| cargo_list[] | Object[] | 是 | 货品（name_cn、name_en、amount、quantity、currency、declaration_value 申报金额） |
| shipping_cost | Object | 是 | 运费（cost{amount,currency}、charge_items[]{code,name,currency,sales_amount}） |

### 响应参数
| 参数 | 类型 | 说明 |
|---|---|---|
| result.data.logistic_no | String | 阿里物流单号 |
| result.success / error_code / error_message | - | 是否成功 / 错误码 / 信息 |

### 错误码
无。

---

## alibaba ggs query carrier（运力查询）

- **path**：`/alibaba/ggs/logistic/queryCarrier`
- **方法**：GET/POST
- **功能**：查询运力（承运线路、预估时效与运费）。

### 请求参数
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| paramn_query.trade_country | String | 是 | 租户国家编码 |
| paramn_query.trade_id | String | 是 | 信保单号 |
| paramn_query.ali_id | Number | 是 | 阿里 Id |
| paramn_query.admin_ali_id | Number | 是 | 主账号阿里 Id |
| paramn_query.shipping_batch_id | Number | 是 | 批次 Id |

### 响应参数
| 参数 | 类型 | 说明 |
|---|---|---|
| result.data[] | Object[] | 运力（carrier_code 运力线名称、estimate_delivery_time 预估时效、estimated_freight 预估运费、freight_currency 币种） |
| result.success / error_code / error_message | - | 是否成功 / 错误码 / 信息 |

### 错误码
无。

---

## alibaba ggs query logistic order list（物流订单列表）

- **path**：`/alibaba/ggs/logistic/queryLogisticOrderList`
- **方法**：GET/POST
- **功能**：分页查询物流订单列表。

### 请求参数
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| param_query.ali_id | Number | 是 | 登录 id |
| param_query.admin_ali_id | Number | 是 | 主账号 id |
| param_query.page_size | Number | 是 | 每页大小 |
| param_query.page_no | Number | 是 | 当前页码 |
| param_query.key_word | String | 否 | 通用搜索（物流订单号、信保订单号、产品名称） |

### 响应参数
| 参数 | 类型 | 说明 |
|---|---|---|
| result.data.data_list[] | Object[] | 物流订单（order_no 物流订单号、trade_id 信保单号、service_code、status_name、status、cargo_desc） |
| result.data.page_size / current_page | String | 分页 |
| result.success / error_code / error_message | - | 是否成功 / 错误码 / 信息 |

### 错误码
无。
