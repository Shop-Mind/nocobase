# Product V2（新版商品接口，JSON 化）

新版 ICBU 商品接口，使用结构化 JSON（而非旧版 XML schema），支持 AI 优化、类目预测、草稿状态查询、运费模板等。是「上架草稿 v2」推荐对接的接口集。除特别说明外均需 `access_token`。

> 与旧版对比：旧版 Product 走 `schema.get`→填 XML→`schema.add(.draft)`；新版 Product V2 直接传 JSON `product_info`，`/alibaba/icbu/product/listing/v2` 一步发布并可开启 AI 优化，发布后用 `/alibaba/icbu/product/status/get/v2` 查询是否为 `online/draft/failed/pending`。

---

## Category prediction（类目预测）

- **path**：`/alibaba/icbu/category/predict/v2`
- **方法**：GET/POST
- **功能**：结合文本分析（标题/描述关键词）与图像识别，自动推荐准确的商品类目。

### 请求参数
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| title | String | 是 | 商品标题 |
| description | String | 否 | 商品详细描述 |
| image | String | 否 | 商品图片 |

### 响应参数
| 参数 | 类型 | 说明 |
|---|---|---|
| result | Object | 预测结果 |
| data.category_path | String | 完整类目路径 |
| data.category_name | String | 叶子类目名 |
| data.category_id | Number | 叶子类目 ID |
| success | Boolean | 是否成功 |
| message | String | 失败时的详细信息 |
| msg_code | String | 失败错误码 |

### 错误码
| 错误码 | 错误信息 | 解决方案 |
|---|---|---|
| B_CATEGORY_PREDICT_FAIL | 类目预测失败 | 检查输入数据后重试 |

---

## Change listing status（修改上下架状态）

- **path**：`/alibaba/icbu/product/batch/update/status`
- **方法**：GET/POST
- **功能**：按 productId 批量将商品上架（online）或下架（offline）。

### 请求参数
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| product_id_list | Number[] | 是 | 需修改状态的商品 ID 列表 |
| action | String | 是 | `online` 上架 / `offline` 下架 |

### 响应参数
| 参数 | 类型 | 说明 |
|---|---|---|
| updated_product_ids | Number[] | 成功修改的商品 ID 列表 |
| success | Boolean | 全部成功为 true，否则 false |
| message / msg_code | String | 失败信息/错误码 |
| errors | Object[] | 失败商品的详细原因（product_id、message、msg_code） |

### 错误码
无。

---

## Create a new product listing（新建商品，支持 AI 优化）

- **path**：`/alibaba/icbu/product/listing/v2`
- **方法**：GET/POST
- **功能**：创建新商品，可开启 AI 配置自动优化标题、描述、关键词。

### 请求参数（`product_info` 结构）
顶层：`product_info`（必填）。其下分为 `basic_info`、`trade_info`、`logistics_info`、`ai_optimization_config`。

**basic_info（基础信息，必填）**
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| title | String | 是 | 商品名称 |
| description | String | 否 | 商品描述，可含重要特性、功能、售后政策；支持 HTML；描述中的图片会被去除 |
| keywords | String | 否 | 与商品高度相关的词组，多个用空格分隔 |
| language | String | 否 | 语言，推荐 en_US；非英文会被翻译；遵循 Java Locale 规范 |
| product_image | Object[] | 是 | 商品图片，第一张为主图，最多 6 张 |
| product_image[].image_url | String | 是 | 图片 URL；非 `//*.alicdn.com` 会自动处理；本地图片需先经 `alibaba.icbu.photobank.upload` 上传，单图最大 5MB |
| model_number | String | 否 | 商品唯一型号标识，可用于检索 |
| brand_name | String | 否 | 品牌名，可用于检索 |

**category_info（类目信息，可选）**
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| category_id | Number | 否 | Alibaba.com 叶子类目 ID；为空时系统按标题/描述/图片推荐类目 |
| category_name | String | 否 | 无 category_id 时可填自有类目名以更精确预测 |

**attributes（基础属性，可选，不影响价格）**
| 参数 | 类型 | 说明 |
|---|---|---|
| attribute_name / attribute_value | String | 属性名 / 属性值 |

**trade_info（价格、库存、SKU）**
| 参数 | 类型 | 说明 |
|---|---|---|
| price.price_type | String | TIERED 阶梯价 / RANGE 区间价（SKU 价在 sku_info 中设置） |
| price.currency | String | ISO 4217 货币码，推荐 USD，非 USD 自动换算 |
| price.tiered_price[] | Object[] | 阶梯价，如 `[{"quantity":1,"price":10.0},{"quantity":10,"price":8.5}]` |
| price.range_price | Object | 区间价 `{min_price, max_price}`（此类商品买家不可直接下单） |
| inventory | Number | SPU 级库存 |
| moq | Number | 最小起订量 |
| unit | String | 售卖单位（Piece、Bag、Pair、Kilogram 等） |
| sku_info[] | Object[] | SKU 列表，每个含 sale_attributes（颜色/尺寸等影响价格的销售属性）、sku_price、inventory、sku_code、image |

**logistics_info（物流）**
| 参数 | 类型 | 说明 |
|---|---|---|
| shipping_template_id | String | 运费模板 ID（需预先在卖家后台创建，可用「Query shipping templates」查询） |
| tiered_lead_time[] | Object[] | 按数量的交期，如 `[{"quantity":1,"lead_time":5}]` |
| dimension | Object | 单件包装尺寸 length/width/height（厘米） |
| weight | String | 总重量（千克，含商品+内包装） |
| desi | String | 体积重（仅土耳其） |

**ai_optimization_config（AI 优化，可选）**
| 参数 | 类型 | 说明 |
|---|---|---|
| title_optimization_enabled | Boolean | 开启标题 AI 优化 |
| description_optimization_enabled | Boolean | 开启描述 AI 优化（可提升 Alibaba.com 质量分） |
| keyword_optimization_enabled | Boolean | 开启关键词 AI 优化（未手填关键词时必须开启） |

### 响应参数
| 参数 | 类型 | 说明 |
|---|---|---|
| result.data | Number | 商品 ID（成功时返回） |
| success | Boolean | 是否成功 |
| message / msg_code | String | 失败信息/错误码 |
| trace_id | String | 排障 ID |

### 错误码
| 错误码 | 错误信息 | 解决方案 |
|---|---|---|
| S_COMMON_INTERNAL_ERROR | 系统错误 | 稍后重试或联系支持 |
| B_PRODUCT_PARAM_INVALID | 参数无效 | 提供合法输入后重试 |
| B_TITLE_NOT_FOUND | 缺少标题 | 补充标题 |
| B_PRICE_ALL_NULL | SPU 和 SKU 价格不能都为空 | 至少填一项 |
| B_MIN_PRICE_RANGE_INVALID | 最小价须小于最大价 | 修正区间价 |
| B_PRICE_SEQUENCE_INVALID | 价格序列无效 | 阶梯价须降序且不重复 |
| B_PRICE_SCALE_INVALID | 价格小数超 2 位 | 修正价格格式 |
| B_CONTAINS_INVALID_IMAGE | 图片 URL 无效 | 提供有效图片链接 |
| B_IMAGE_UPLOAD_FAILED | 所有图片上传失败 | 检查图片 |
| B_PRODUCT_INFO_TRANSLATION_FAILED | 翻译接口限流 | 稍后重试 |
| B_KEYWORD_NOT_FOUND | 缺少关键词 | 未填关键词时可开启关键词优化 |

---

## Delete draft（删除草稿）

- **path**：`/alibaba/icbu/draft/delete`
- **方法**：GET/POST
- **功能**：按 productId 批量删除草稿。

### 请求参数
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| product_id_list | Number[] | 是 | 待删除草稿 ID 列表 |

### 响应参数
| 参数 | 类型 | 说明 |
|---|---|---|
| deleted_draft_ids | Number[] | 成功删除的草稿 ID |
| success | Boolean | 全部成功为 true |
| message / msg_code | String | 失败信息/错误码 |
| errors | Object[] | 失败草稿详情（draft_id、message、msg_code） |

### 错误码
无。

---

## Delete product（删除商品）

- **path**：`/alibaba/icbu/product/delete`
- **方法**：GET/POST
- **功能**：按 productId 批量删除商品。

### 请求参数
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| product_id_list | Number[] | 是 | 待删除商品 ID 列表 |

### 响应参数
| 参数 | 类型 | 说明 |
|---|---|---|
| deleted_product_ids | Number[] | 成功删除的商品 ID |
| success | Boolean | 全部成功为 true |
| message / msg_code | String | 失败信息/错误码 |
| errors | Object[] | 失败商品详情（product_id、message、msg_code） |

### 错误码
无。

---

## Edit Product Inventory（编辑库存）

- **path**：`/icbu/product/edit-inventory`
- **方法**：GET/POST
- **功能**：更新 SPU 或 SKU 级库存。提供 SKU 库存时优先更新 SKU；只提供 inventory 时更新 SPU。两者不能同时处理。

### 请求参数
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| product_id | Number | 是 | 商品 ID |
| sku_inventory | Object[] | 否 | SKU 实时库存键值（key=SKU ID，value=库存数 ≥0），如 `{"12345":100,"12346":50}` |
| sku_inventory[].sku_id | Number | 否 | SKU ID |
| sku_inventory[].inventory | Number | 否 | SKU 库存 |
| inventory | Number | 否 | SPU 级实时库存；与 sku_inventory 不能都为空 |

### 响应参数
| 参数 | 类型 | 说明 |
|---|---|---|
| result.data | Object | 结果（为 null） |
| success | Boolean | 是否成功 |
| message / msg_code | String | 失败信息/错误码 |

### 错误码
| 错误码 | 错误信息 | 解决方案 |
|---|---|---|
| B_INVENTORY_ALL_NULL | SPU 和 SKU 库存不能都为空 | 至少填一项 |
| B_INVENTORY_CONFLICT | 不能同时处理 SPU 和 SKU 库存 | 二选一 |

---

## Edit Product Price（编辑价格）

- **path**：`/icbu/product/edit-price`
- **方法**：GET/POST
- **功能**：更新 SPU 或 SKU 级价格。只提供 SKU 价时更新指定 SKU；只提供 price 时更新 SPU。

### 请求参数
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| product_id | Number | 是 | 商品 ID |
| price.price_type | String | 否 | TIERED 阶梯 / RANGE 区间 |
| price.currency | String | 否 | 仅 USD |
| price.tiered_price[] | Object[] | 否 | 阶梯价（quantity、price） |
| price.range_price | Object | 否 | 区间价（min_price、max_price） |
| sku_price[] | Object[] | 否 | SKU 价（sku_id、price） |

### 响应参数
| 参数 | 类型 | 说明 |
|---|---|---|
| result.data | Object | 结果（为 null） |
| success | Boolean | 是否成功 |
| message / msg_code | String | 失败信息/错误码 |

### 错误码
| 错误码 | 错误信息 | 解决方案 |
|---|---|---|
| B_PRICE_ALL_NULL | SPU 和 SKU 价不能都为空 | 至少填一项 |
| B_PRICE_CONFLICT | 不能同时处理 SPU 和 SKU 价 | 二选一 |

---

## Edit product information（编辑商品信息）

- **path**：`/alibaba/icbu/product/update/v2`
- **方法**：GET/POST
- **功能**：按 productId 编辑商品信息。结构与「Create a new product listing」的 `product_info` 基本一致（basic_info / category_info / attributes / trade_info / logistics_info），但 `product_id` 必填，`category_name` 在更新时会被忽略。仅传入字段被更新。

### 请求参数（要点）
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| product_info | Object | 是 | 商品信息（结构同 listing/v2） |
| product_info.basic_info.product_id | Number | 是 | 商品 ID |
| 其余 | - | 否 | title、description、keywords、language、product_image[]、model_number、category_info、attributes[]、trade_info（price/inventory/sku_info/moq/unit）、logistics_info（shipping_template_id/tiered_lead_time/dimension/weight/desi） |

### 响应参数
| 参数 | 类型 | 说明 |
|---|---|---|
| result.data | String | 无数据返回 |
| success | Boolean | 是否成功 |
| message / msg_code | String | 失败信息/错误码 |

### 错误码
无。

---

## Get Category Information（查询类目）

- **path**：`/alibaba/icbu/category/get/v2`
- **方法**：GET/POST
- **功能**：查询 Alibaba.com 类目。`parent_category_id` 为空查一级类目，传入则查其子类目。

### 请求参数
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| parent_category_id | Number | 否 | 父类目 ID；传入则查子类目 |

### 响应参数
| 参数 | 类型 | 说明 |
|---|---|---|
| data | Object[] | 类目数据 |
| data[].category_id | Number | 类目 ID |
| data[].category_name | String | 类目名 |
| data[].leaf_category | String | true 叶子类目（可挂商品）/ false 有子类目 |
| data[].level | Number | 层级 1/2/3/4 |
| success | Boolean | 是否成功 |
| message / msg_code | String | 失败信息/错误码（BUSINESS_CATEGORY_NOT_EXIST：类目不存在） |

### 错误码
无。

---

## Get Product Information（查询商品详情）

- **path**：`/alibaba/icbu/product/get/v2`
- **方法**：GET/POST
- **功能**：按 product_id 或 sku_id 查询商品信息。

### 请求参数
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| product_id | Number | 否 | 商品 ID |
| sku_id | Number | 否 | SKU ID |

### 响应参数（`product_info` 主要字段）
| 参数 | 类型 | 说明 |
|---|---|---|
| basic_info | Object | product_id、title、keywords、description、product_images[]、language、create_timestamp、last_modified_timestamp、owner_ali_id、model_number |
| basic_info.status | String | online 在线 / offline 下架 / deleted 已删 |
| basic_info.audit_status | String | approved 审核通过 / pending 待审 / rejected 驳回 |
| category_info | Object | category_id、category_name（全路径，以 / 分隔） |
| attributes[] | Object[] | attribute_name、attribute_value |
| logistics_info | Object | shipping_template_id、weight、desi、dimension（length/width/height）、tiered_lead_time[] |
| trade_info | Object | moq、unit、price（price_type、currency、range_price、tiered_price）、inventory、sku_info[]（sku_id、sku_code、sku_price、inventory、sale_attributes[]、image） |
| success | Boolean | 是否成功 |
| message / msg_code | String | 失败信息/错误码（B_PRODUCT_PARAM_INVALID、B_PRODUCT_NOT_FOUND、S_PRODUCT_SEARCH_ERROR） |

### 错误码
无（错误码在 msg_code 中返回）。

---

## Query Category Attributes（查询类目属性）

- **path**：`/alibaba/icbu/category/attribute/get/v2`
- **方法**：GET/POST
- **功能**：按类目 ID 查询类目属性，含普通属性和 SKU 销售属性。发布商品前用于获取必填属性。

### 请求参数
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| category_id | Number | 是 | Alibaba.com 叶子类目 ID（可由 alibaba.icbu.category.get.new 获取） |

### 响应参数
| 参数 | 类型 | 说明 |
|---|---|---|
| data.category_attributes[] | Object[] | 普通属性（描述商品特征，不影响交易参数） |
| data.sale_attributes[] | Object[] | 销售属性（影响 SKU/价格/库存，如颜色、尺寸） |
| 每项属性 | - | attribute_id、attribute_name、required 是否必填、support_custom_value 是否可自定义值、support_multi_value 是否多值、attribute_value_list[]（attribute_value_id、attribute_value_name） |
| success | Boolean | 是否成功 |
| message / msg_code | String | 失败信息/错误码 |

### 错误码
无。

---

## Query Product List（查询商品列表）

- **path**：`/alibaba/icbu/product/search/v2`
- **方法**：GET/POST
- **功能**：按 model_number 或 sku_code 查询商品，可能返回多条。

### 请求参数
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| page_index | Number | 否 | 页码 |
| page_size | Number | 否 | 每页条数，最大 20 |
| model_number | String | 否 | 商品型号 |
| sku_code | String | 否 | SKU 编码 |

### 响应参数
| 参数 | 类型 | 说明 |
|---|---|---|
| product_info[] | Object[] | 商品信息列表，结构同「Get Product Information」 |
| page | Object | page_index、total_item、total_page、page_size |
| success | Boolean | 是否成功 |
| message / msg_code | String | 失败信息/错误码 |

### 错误码
| 错误码 | 错误信息 | 解决方案 |
|---|---|---|
| B_PRODUCT_PARAM_INVALID | 参数无效 | 提供合法输入 |
| B_PRODUCT_NOT_FOUND | 商品未找到 | - |
| S_PRODUCT_SEARCH_ERROR | 搜索服务不可用 | - |

---

## Query product listing status（查询商品发布状态）

- **path**：`/alibaba/icbu/product/status/get/v2`
- **方法**：GET/POST
- **功能**：查询商品发布状态：online / draft / failed / pending。「上架草稿 v2」可用此判断是否已成草稿。

### 请求参数
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| product_id | Number | 是 | 商品 ID |

### 响应参数
| 参数 | 类型 | 说明 |
|---|---|---|
| data.status | String | online / draft / failed / pending |
| data.status_desc | String | 失败时的状态描述 |
| success | Boolean | 是否成功 |
| message / msg_code | String | 失败信息/错误码 |

### 错误码
无。

---

## Query shipping templates（查询运费模板）

- **path**：`/alibaba/icbu/product/list/shipping/templates`
- **方法**：GET/POST
- **功能**：查询运费模板信息（含模板 ID 和名称）。

### 请求参数
无。

### 响应参数
| 参数 | 类型 | 说明 |
|---|---|---|
| template_info_list[] | Object[] | 运费模板列表（template_id、template_name） |
| success | Boolean | 是否成功 |
| message / msg_code | String | 失败信息/错误码 |

### 错误码
无。
