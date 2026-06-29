# Buyer - Transaction & Fulfillment（采购方-交易与履约）

面向采购/分销的运费试算、立即下单、支付、订单查询、物流跟踪、仓库与附件等接口。除特别说明外均需 `access_token`，时间字段多用 `America/Los_Angeles` 时区。

> 订单状态枚举详见官方文档 docId=131。下单链路：`/order/freight/calculate` 取 `vendor_code` → `/buynow/order/create` 创建订单得 `trade_id` → `/alibaba/dropshipping/order/pay` 支付 → `/alibaba/order/pay/result/query` 查支付结果 → `/order/logistics/tracking/get` 跟踪物流。

---

## Advanced Freight Cost Calculation（高级运费试算）

- **path**：`/order/freight/calculate`
- **方法**：GET/POST
- **功能**：基于收货地址与商品信息提供更精确的运费估算。

### 请求参数
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| e_company_id | String | 是 | 公司 ID，来自 `/eco/buyer/product/description` 返回的 eCompanyId |
| destination_country | String | 是 | 目的国，如 US |
| logistics_product_list[] | Object[] | 是 | 商品列表（product_id 必填、quantity 必填、sku_id 有则必填） |
| address | Object | 否 | 收货地址（address、city{code,name}、country{code,name}、province{code,name}、zip） |
| dispatch_location | String | 否 | 发货地，默认 CN |
| enable_distribution_waybill | Boolean | 否 | true 使用分销自提面单，默认 false |

### 响应参数
| 参数 | 类型 | 说明 |
|---|---|---|
| value[] | Object[] | 运费方案 |
| value[].trade_term | String | 贸易条款 |
| value[].delivery_time | String | 时效（天） |
| value[].fee | Object | 运费（amount、currency） |
| value[].shipping_type / vendor_name / vendor_code | String | 运输方式 / 服务商名 / 服务商码 |
| value[].dispatch_country / destination_country | String | 发货国 / 目的国 |
| value[].solution_biz_type | String | distributionWaybill 分销自提 / common 常规 |

### 错误码
无。

---

## Basic Freight Cost Estimation（基础运费试算）

- **path**：`/shipping/freight/calculate`
- **方法**：GET/POST
- **功能**：基于商品信息估算基础运费。

### 请求参数
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| destination_country | String | 是 | 目的国（ISO 3166-2） |
| product_id | Number | 是 | 商品 ID |
| quantity | Number | 是 | 数量 |
| zip_code | String | 否 | 目的邮编 |
| dispatch_location | String | 否 | 发货地，默认 CN |
| enable_distribution_waybill | Boolean | 否 | 分销自提面单，默认 false |

### 响应参数
同「Advanced Freight Cost Calculation」的 value[]（shipping_type、trade_term、dispatch_country、destination_country、vendor_code、vendor_name、fee{currency,amount}、delivery_time、solution_biz_type）。

### 错误码
无。

---

## Combined payment group query service（合并支付分组查询）

- **path**：`/order/merge/pay/query`
- **方法**：GET/POST
- **功能**：查询订单是否可合并支付及分组。

### 请求参数
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| order_ids | String[] | 是 | 需查询合并支付的订单号数组 |

### 响应参数
| 参数 | 类型 | 说明 |
|---|---|---|
| value.groups[] | Object[] | 支付分组 |
| groups[].group_code | String | 分组码（如 CN/MX） |
| groups[].can_merge_pay_order_items[] | Object[] | 可合并的订单项（order_id、can_merge_pay） |
| groups[].can_not_merge_pay_order_items[] | Object[] | 不可合并项（order_id、原因码/信息） |
| groups[].can_not_merge_pay_reason / _message | String | 整组不可合并原因码 / 信息 |

### 错误码
无。

---

## Create BuyNow Order（创建立即购买订单）

- **path**：`/buynow/order/create`
- **方法**：GET/POST
- **功能**：在 Alibaba.com 创建 BuyNow 订单，生成 order_id 供后续查询。

### 请求参数（要点）
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| channel_refer_id | String | 是 | 第三方 ISV 对应的订单号 |
| logistics_detail | Object | 是 | 物流详情 |
| logistics_detail.carrier_code | String | 是 | 用 `/order/freight/calculate` 的 vendor_code |
| logistics_detail.shipment_address | Object | 是 | 收货地址（address 必填、contact_person 必填、country 必填、country_code 必填 ISO3166 两字母、city/city_code、province/province_code、port/port_code、zip、telephone{area,country,number}、fax、alternate_address） |
| logistics_detail.dispatch_location | String | 否 | 发货地，与试算的 dispatch_country 一致 |
| product_list[] | Object[] | 是 | 商品列表（product_id 必填、quantity 必填、sku_id、properties 第三方平台名+订单号、remark） |
| attachments[] | Object[] | 否 | 附件（file_path、file_name、file_usage：DISTRIBUTION_WAY_BILL 分销自提面单 / COMMON 普通；service_provider_name、waybill_number） |
| enable_distribution_waybill | Boolean | 否 | 分销自提面单，默认 false |
| clearance_detail | Object | 否 | 清关信息（韩国需收货地址；business_taxpayer_id、business_name、clearancer、clearance_mobile_number、clearance_code、clearance_type） |

### 响应参数
| 参数 | 类型 | 说明 |
|---|---|---|
| value.trade_id | String | 订单号 |
| value.pay_url | String | 订单详情/支付 URL |

### 错误码
无。

---

## Logistics Tracking（物流跟踪）

- **path**：`/order/logistics/tracking/get`
- **方法**：GET/POST
- **功能**：跟踪已下单订单的物流更新。

### 请求参数
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| trade_id | Number | 是 | 订单 ID |

### 响应参数
| 参数 | 类型 | 说明 |
|---|---|---|
| tracking_list[] | Object[] | 物流跟踪列表 |
| tracking_list[].carrier | String | 承运商 |
| tracking_list[].tracking_number / tracking_url | String | 运单号 / 跟踪链接 |
| tracking_list[].current_event_code | String | 最新物流事件码 |
| tracking_list[].event_list[] | Object[] | 事件（event_code、event_location、event_time、event_name） |

### 错误码
无。

---

## Oversea admittance check api（海外仓准入检查）

- **path**：`/icbu/check/overseas/admittance`
- **方法**：GET/POST
- **功能**：检查用户在 Alibaba 平台的海外仓准入状态。

### 请求参数
无。

### 响应参数
| 参数 | 类型 | 说明 |
|---|---|---|
| result.response | Boolean | 海外仓准入状态 |
| result.exception / error_code / error_message | String | 异常 / 错误码 / 错误信息 |

### 错误码
无。

---

## alibaba dropshipping order pay（一件代发订单支付）

- **path**：`/alibaba/dropshipping/order/pay`
- **方法**：GET/POST
- **功能**：一件代发订单支付。

### 请求参数
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| param_order_pay_request.order_id_list | Number[] | 是 | 待支付订单号，最多 10 |
| param_order_pay_request.payment_method | String | 是 | CREDIT_CARD / PAYPAL |
| 其余 | - | 否 | user_agent、is_pc、accept_language、user_ip、screen_resolution、isv_drop_shipper_registration_time（风控用） |

### 响应参数
| 参数 | 类型 | 说明 |
|---|---|---|
| value.pay_url | String | 支付 URL |
| value.status | String | UNPAY 未支付 / PAYING 支付中(约1分钟) / PAY_SUCCESS 成功 / PAY_FAILED 失败 |
| value.reason_code / reason_message | String | 失败原因码 / 信息 |

### 错误码
无。

---

## alibaba fund query api（资金查询）

- **path**：`/alibaba/order/fund/query`
- **方法**：GET/POST
- **功能**：查询订单资金（如支付交易费）。

### 请求参数
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| e_trade_id | String | 是 | 订单 ID |
| data_select | String | 是 | 数据选择器，如 payment transaction fee |

### 响应参数
| 参数 | 类型 | 说明 |
|---|---|---|
| value.payment_transaction_fee | Object | 支付交易费（currency、amount） |

### 错误码
无。

---

## alibaba ggs seller warehouse list（GGS 卖家仓库列表）

- **path**：`/alibaba/ggs/warehouse/list`
- **方法**：GET/POST
- **功能**：查询 GGS 卖家仓库列表。

### 请求参数
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| product_id | Number | 是 | 商品 ID |
| page_size | Number | 是 | 每页条数 |
| current_page | Number | 是 | 当前页 |

### 响应参数
| 参数 | 类型 | 说明 |
|---|---|---|
| result.data[] | Object[] | 仓库（id、warehouse_code、warehouse_name、warehouse_type、warehouse_status active/inactive、warehouse_address/province/city/country、zip_code、warehouse_contact、warehouse_phone_number、ali_member_id、gmt_create/gmt_modified、deleted） |
| result.total / total_page / page_size / current_page | Number | 分页 |
| result.success / code / message | - | 是否成功 / 码 / 信息 |

### 错误码
无。

---

## alibaba order attachment upload（订单附件上传）

- **path**：`/alibaba/order/attachment/upload`
- **方法**：GET/POST
- **功能**：上传订单附件。

### 请求参数
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| data | byte[] | 是 | 文件字节数组 |
| file_name | String | 是 | 文件名（支持 jpg/png/pdf/doc，≤5M） |

### 响应参数
| 参数 | 类型 | 说明 |
|---|---|---|
| value | String | 生成的附件 filepath |

### 错误码
无。

---

## alibaba order cancel（取消订单）

- **path**：`/alibaba/order/cancel`
- **方法**：GET/POST
- **功能**：取消订单。

### 请求参数
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| trade_id | String | 是 | 订单 ID |

### 响应参数
| 参数 | 类型 | 说明 |
|---|---|---|
| value | Object | 成功 |

### 错误码
无。

---

## alibaba order get（订单详情）

- **path**：`/alibaba/order/get`
- **方法**：GET/POST
- **功能**：获取订单详情。

### 请求参数
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| e_trade_id | String | 是 | 订单 ID |
| data_select | String | 否 | 数据选择器（statusAction、draft_role、snapshot_product，多个英文逗号/分隔） |
| language | String | 否 | 多语言 |

### 响应参数（要点，value 对象）
| 参数 | 类型 | 说明 |
|---|---|---|
| trade_id / trade_status | String | 订单号 / 状态（见 docId=131） |
| seller / buyer | Object | 买卖双方（immutable_eid 加密 ID、full_name） |
| order_products[] | Object[] | 商品项（product_id、name、unit_price{amount,currency}、quantity、unit、product_image、sku_id、sku_code、model_number、sku_attributes[]、shipment_date、item_status） |
| product_total_amount / total_amount / balance_amount / advance_amount / adjust_amount / discount_amount | Object | 各类金额（amount、currency） |
| shipment_fee / shipment_insurance_fee / vat_amount / duty_amount | Object | 运费/保险/增值税/关税（amount、currency） |
| pay_step | String | ADVANCE / BALANCE / FULL |
| trade_term / shipment_method / fulfillment_channel | String | 贸易条款 / 运输方式 / 履约渠道 |
| carrier | Object | 承运商（code、name） |
| shipping_address | Object | 收货地址（country、country_code、province、city、address、alternate_address、zip、port、contact_person、mobile{area,country,number}、telephone） |
| attachments[] | Object[] | 附件（file_name、url、service_provider_name、waybill_number、file_usage） |
| create_date | Object | 创建时间（format_date、timestamp） |
| dropshipping / draft_role / export_service_type / semi_manage / nation / tags | - | 其他标识 |
| status_action | Object | 实时状态与可执行动作（actions[]：value、name、render_name） |

### 错误码
无。

---

## alibaba order list（订单列表）

- **path**：`/alibaba/order/list`
- **方法**：GET/POST
- **功能**：查询订单列表。

### 请求参数
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| role | String | 是 | seller / buyer，默认 buyer |
| start_page | Number | 否 | 默认 0 |
| page_size | Number | 否 | 默认 10，最大 100 |
| modified_date_start / modified_date_end | Object | 否 | 修改时间区间（date_str `yyyy-MM-dd HH:mm:ss`、date_timestamp，时区 America/Los_Angeles） |
| create_date_start / create_date_end | Object | 否 | 创建时间区间（同上） |
| sales_man_login_id | String | 否 | 业务员登录 ID |
| status | String | 否 | 订单状态（见 docId=131） |

### 响应参数
| 参数 | 类型 | 说明 |
|---|---|---|
| value.order_list[] | Object[] | 订单（trade_id、trade_status、create_date{format_date,timestamp}、modify_date） |
| value.total_count | Number | 总记录数 |

### 错误码
无。

---

## alibaba order pay result query（订单支付结果查询）

- **path**：`/alibaba/order/pay/result/query`
- **方法**：GET/POST
- **功能**：查询订单支付结果。

### 请求参数
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| trade_id | Number | 是 | 订单 ID |

### 响应参数
| 参数 | 类型 | 说明 |
|---|---|---|
| value.status | String | UNPAY / PAYING / PAY_SUCCESS / PAY_FAILED |
| value.pay_url | String | 支付 URL |
| value.reason_code / reason_message | String | 失败原因码 / 信息 |
| value.trade_id | String | 订单 ID |

### 错误码
无。

---

## alibaba seller warehouse list（卖家仓库列表）

- **path**：`/warehouse/list`
- **方法**：GET/POST
- **功能**：查询卖家仓库列表。

### 请求参数
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| product_id | Number | 是 | 商品 ID |
| country_code | String | 否 | 国家码 |
| current_page | Number | 否 | 当前页 |

### 响应参数
| 参数 | 类型 | 说明 |
|---|---|---|
| response.records[] | Object[] | 仓库（warehouse_id、name、country、country_code、state、city、address、zip_code） |
| response.total / page_size / current_page | Number | 分页 |

### 错误码
无。

---

## order logistics info query api（订单物流信息查询）

- **path**：`/order/logistics/query`
- **方法**：GET/POST
- **功能**：查询订单物流信息。

### 请求参数
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| trade_id | String | 是 | 订单 ID |
| data_select | String | 否 | 传 logistic_order 时查快递运单号 |

### 响应参数
| 参数 | 类型 | 说明 |
|---|---|---|
| value.logistic_status | String | 发货状态 |
| value.shipment_date | Object | 实际发货时间（format_date、timestamp） |
| value.shipping_order_list[] | Object[] | 运单（voucher、tracking_number、logistics_type、service_provider） |

### 错误码
无。
