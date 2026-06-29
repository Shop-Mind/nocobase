# Buyer - Partner Data Management（采购方-合作伙伴数据管理）

供合作伙伴（渠道/店铺 ISV）向 Alibaba.com 提交、查询、更新、删除其商品数据。除特别说明外均需 `access_token`。

> 这是「渠道商品对接」类接口（item = 渠道/店铺商品），`item_id` 由 Upload 接口生成，用于后续查询/更新/删除。与卖家发布商品的 Product/Product V2 不同。

---

## Remove Product（删除商品）

- **path**：`/eco/buyer/item/delete`
- **方法**：PUT
- **功能**：删除此前共享给 Alibaba.com 的商品信息。

### 请求参数
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| deleteReq | Object | 是 | 请求对象 |
| deleteReq.item_id | Number | 是 | 商品唯一 ID |

### 响应参数
| 参数 | 类型 | 说明 |
|---|---|---|
| result.result_data | Object | 结果数据 |
| result.result_code | String | 结果码 |
| result.result_msg | String | 结果信息 |

### 错误码
无。

---

## Retrieve Products Information（查询商品信息）

- **path**：`/eco/buyer/item/query`
- **方法**：GET
- **功能**：按分页查询合作伙伴提交给 Alibaba.com 的商品数据。

### 请求参数
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| queryReq | Object | 是 | 请求对象 |
| queryReq.size | Number | 是 | 每页条数 |
| queryReq.index | Number | 是 | 页码 |

### 响应参数
| 参数 | 类型 | 说明 |
|---|---|---|
| result.result_code | String | 结果码 |
| result.result_data.items[] | Object[] | 商品列表 |
| items[].item_id | Number | Alibaba 内唯一商品 ID |
| items[].isv_item_id | String | 渠道（店铺）商品 ID |
| items[].isv_category_id / isv_category | String | 渠道类目 ID / 描述 |
| items[].title / description | String | 标题 / 描述 |
| items[].price / original_price | String | 售价 / 原价 |
| items[].available_quantity / sold_quantity | String | 可售 / 已售数量 |
| items[].permalink | String | 永久链接 |
| items[].main_image_url / image_urls[] | String | 主图 / 图片列表 |
| items[].currency | String | 货币（ISO） |
| items[].variations[] | Object[] | 变体（variation_id、isv_variation_id、price、original_price、available_quantity、sold_quantity、image_urls[]） |
| result.result_data.pagination | Object | 分页（current、page_count、page_size、total_product_count） |
| result.result_msg | String | 结果信息 |

### 错误码
无。

---

## Update Product（更新商品）

- **path**：`/eco/buyer/item/update`
- **方法**：POST
- **功能**：更新此前共享给 Alibaba.com 的商品详情。

### 请求参数
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| updateReq | Object | 是 | 请求对象 |
| updateReq.item | Object | 是 | 待更新的渠道商品信息 |
| item.item_id | Number | 是 | 由 ADD/SEARCH 获得的唯一商品 ID |
| item.title / description | String | 否 | 标题 / 描述 |
| item.price / original_price | String | 否 | 售价 / 原价 |
| item.available_quantity / sold_quantity | String | 否 | 可售 / 已售数量 |
| item.image_urls[] / main_image_url | String | 否 | 图片 / 主图 |
| item.permalink | String | 否 | 永久链接 |
| item.extra | Object | 否 | 额外键值信息 |
| item.variations[] | Object[] | 否 | 变体（无 variation_id 即新增变体；含 price、original_price、available_quantity、sold_quantity、image_urls[]） |

### 响应参数
| 参数 | 类型 | 说明 |
|---|---|---|
| result.result_data | Object | 结果数据 |
| result.result_code / result_msg | String | 结果码 / 信息 |

### 错误码
无。

---

## Upload Product（上传商品）

- **path**：`/eco/buyer/item/add`
- **方法**：POST
- **功能**：向 Alibaba.com 提交商品数据，生成 Item ID 供后续查询。

### 请求参数
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| insertReq | Object | 是 | 请求对象 |
| insertReq.item | Object | 是 | 渠道商品信息 |
| item.title | String | 是 | 标题 |
| item.description | String | 是 | 描述 |
| item.language | String | 是 | 语言（ISO） |
| item.price | String | 是 | 售价（无变体时必填） |
| item.main_image_url | String | 是 | 主图（用于搜索） |
| item.isv_item_id | String | 否 | 渠道商品 ID |
| item.available_quantity | String | 否 | 可售数量（无变体时必填） |
| item.original_price / sold_quantity | String | 否 | 原价 / 已售数量 |
| item.isv_category_id / isv_category | String | 否 | 渠道类目 ID / 描述 |
| item.currency | String | 否 | 货币（ISO） |
| item.image_urls[] | String[] | 否 | 图片列表 |
| item.permalink | String | 否 | 永久链接 |
| item.extra | Object | 否 | 额外键值信息 |
| item.variations[] | Object[] | 否 | 变体（available_quantity、price、original_price、image_urls[]、isv_variation_id、sold_quantity 等） |

### 响应参数
| 参数 | 类型 | 说明 |
|---|---|---|
| result.result_data | Object | 添加成功后返回商品唯一 ID，用于后续查询和推荐 |
| result.result_code / result_msg | String | 结果码 / 信息 |

### 错误码
无。
