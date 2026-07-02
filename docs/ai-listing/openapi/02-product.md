# Product（商品发布与管理）

ICBU 商品类目、图片银行、商品发布（schema 流程）、库存、分组等接口。除特别说明外均需 `access_token`。

> 发布核心链路：`alibaba.icbu.product.schema.get`（取类目发布规则 XML）→ 按规则填充 XML → `alibaba.icbu.product.schema.add`（正式发布）或 `alibaba.icbu.product.schema.add.draft`（发布为草稿）。商品图片必须先用 `alibaba.icbu.photobank.upload` 上传到图片银行，外链图会被拒绝。

---

## alibaba.icbu.category.get.new

- **path**：`/icbu/product/category/get`
- **方法**：GET/POST
- **功能**：获取 Alibaba.com 类目树；传 `cat_id=0` 获取全部一级类目。

### 请求参数
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| cat_id | String | 是 | 类目 ID，传 0 获取全部一级类目 |

### 响应参数
| 参数 | 类型 | 说明 |
|---|---|---|
| result | Object | 响应对象 |
| response_msg | String | 响应信息 |
| result.result | Object | 数据对象 |
| category_id | Number | 类目唯一 ID |
| child_ids | Number[] | 当前类目的子类目 ID 列表 |
| leaf_category | Boolean | 是否叶子类目（只有叶子类目可发布商品） |
| name | String | 英文名 |
| level | Number | 类目层级 |
| cn_name | String | 中文名 |
| parent_ids | String | 当前类目的父类目 |
| success | Boolean | 是否成功 |
| response_code | String | 响应码 |

### 错误码
无。

---

## alibaba.icbu.category.id.mapping

- **path**：`/alibaba/icbu/category/id/mapping`
- **方法**：GET/POST
- **功能**：新旧类目/属性/属性值 ID 映射转换。

### 请求参数
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| attribute_id | Number | 否 | 属性 ID |
| cat_id | Number | 否 | 类目 ID |
| attribute_value_id | Number | 否 | 属性值 ID |
| convert_type | Number | 否 | 1-类目，2-属性，3-属性值 |

### 响应参数
| 参数 | 类型 | 说明 |
|---|---|---|
| result | Object | 结果 |
| mapping_result | Object | 映射后的 ID |
| success | Boolean | 是否成功 |
| response_code | String | 响应码 |
| response_msg | String | 响应信息 |

### 错误码
无。

---

## alibaba.icbu.category.schema.level.get

- **path**：`/icbu/product/schema/level/get`
- **方法**：GET/POST
- **功能**：返回层级属性的下级子属性。

### 请求参数
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| cat_id | Number | 是 | 类目 ID |
| xml | String | 是 | 层级属性 XML |
| language | String | 是 | 语言 |

### 响应参数
| 参数 | 类型 | 说明 |
|---|---|---|
| result | Object | 结果 |
| trace_id | String | 排障唯一 ID |
| data | String | 层级属性的下级属性结构 |
| success | Boolean | 是否成功 |
| message_info | String | 信息 |
| msg_code | String | 消息码 |

### 错误码
无。

---

## alibaba.icbu.photobank.group.list

- **path**：`/icbu/product/photobank/group/list`
- **方法**：GET/POST
- **功能**：获取图片银行分组信息。

### 请求参数
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| id | Number | 否 | 要查询的父分组 ID |

### 响应参数
| 参数 | 类型 | 说明 |
|---|---|---|
| result | Object | 调用结果 |
| groups | Object[] | 该分组下的子分组及自身 |
| name | String | 分组显示名 |
| id | Number | 分组唯一 ID |
| level1 | Number | 一级分组顺序 |
| level3 | Number | 二级分组顺序（原文如此） |
| level2 | Number | 三级分组顺序（原文如此） |
| error_code | String | 错误码 |
| error_msg | String | 错误信息 |

### 错误码
| 错误码 | 错误信息 | 解决方案 |
|---|---|---|
| EC_IMAGE_U_ARG_VP | aliId not exist | 会员信息无效，检查 accessToken |
| EC_IMAGE_L_ARG_RQ | query params is null. | 请求参数为空，需按文档传参 |

---

## alibaba.icbu.photobank.group.operate

- **path**：`/icbu/product/photobank/group/operate`
- **方法**：GET/POST
- **功能**：修改图片银行分组信息，包括新增、删除、重命名分组。

### 请求参数
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| group_name | String | 否 | add 时为新分组名；rename 时为新名称；delete 时留空 |
| group_id | Number | 否 | 分组 ID |
| operation | String | 否 | add 新增 / delete 删除 / rename 重命名 |

### 响应参数
| 参数 | 类型 | 说明 |
|---|---|---|
| result | Object | 结果 |
| trace_id | String | 排障唯一 ID |
| success | Boolean | 是否成功 |
| photobank_group | Object | 图片银行分组信息 |
| name | String | 分组名 |
| id | Number | 分组 ID |
| level1/level2/level3 | Number | 分组层级 |
| error_code | String | 错误码 |
| error_msg | String | 错误信息 |

### 错误码
无。

---

## alibaba.icbu.photobank.list

- **path**：`/icbu/product/photobank/list`
- **方法**：GET/POST
- **功能**：分页查询图片银行中的图片。

### 请求参数
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| groupId | String | 是 | 图片银行分组 ID |
| currentPage | Number | 是 | 分页页码 |
| pageSize | Number | 是 | 每页图片数 |

### 响应参数
| 参数 | 类型 | 说明 |
|---|---|---|
| result | Object | 调用结果 |
| error_code | String | 错误码 |
| error_msg | String | 错误信息 |
| trace_id | String | 排障唯一 ID（报障时务必提供） |
| pagination_query_list | Object | 数据对象 |
| list | Object[] | 当前页图片列表 |
| gmt_modified | String | 图片修改时间 |
| owner_member_display_name | String | 图片所属者名称 |
| file_size | String | 图片文件大小 |
| reference_count | String | 该图片在商品详情中被引用的次数 |
| group_id | Number | 图片银行分组 ID |
| url | String | 可直接访问的图片 URL |
| id | String | 图片唯一 ID |
| file_name | String | 图片显示名 |

### 错误码
| 错误码 | 错误信息 | 解决方案 |
|---|---|---|
| -2 | Query Image Error | 查询图片时异常（超时/网络），可重试 |

---

## alibaba.icbu.photobank.upload

- **path**：`/alibaba/icbu/photobank/upload`
- **方法**：GET/POST
- **功能**：上传图片到图片银行。**发布商品的所有图片必须先经此接口上传**，返回的 `photobank_url` 用于商品发布。

### 请求参数
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| file_name | String | 是 | 文件名 |
| group_id | String | 否 | 分组 ID |
| image_bytes | byte[] | 是 | 图片字节内容（原图上限 5MB） |

### 响应参数
| 参数 | 类型 | 说明 |
|---|---|---|
| result | Object | 结果 |
| trace_id | String | 排障唯一 ID |
| response_object | Object | 响应对象 |
| file_id | Number | 图片唯一 ID |
| photobank_url | String | 图片 URL（用于发布商品） |
| file_name | String | 图片名 |
| error_code | String | 错误码 |
| error_msg | String | 错误信息 |

### 错误码
| 错误码 | 错误信息 | 解决方案 |
|---|---|---|
| SIZE_TOO_LARGE | SIZE_TOO_LARGE | 原图上限 5MB |
| FUNCTION_FORBIDDEN | FUNCTION_FORBIDDEN | 账号因风控被禁止上传，请联系开发者 |
| NOCAPACITY | NOCAPACITY | 图片银行容量已满，无法上传新图 |
| -2 | Upload Image Error | 上传图片时未预定义的错误 |

---

## alibaba.icbu.product.batch.update.display

- **path**：`/icbu/product/update/display`
- **方法**：GET/POST
- **功能**：批量操作商品上下架状态。

### 请求参数
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| new_display | String | 是 | on 上架 / off 下架 |
| product_id_list | Number[] | 是 | 商品 ID 列表 |

### 响应参数
| 参数 | 类型 | 说明 |
|---|---|---|
| result | Object | 结果 |
| fail_id_map | Object | 失败映射（错误码:商品 ID） |
| trace_id | String | 排障唯一 ID |
| error_code | String | 错误码 |
| error_msg | String | 错误信息 |

### 错误码
无。

---

## alibaba.icbu.product.get

- **path**：`/icbu/product/get`
- **方法**：GET/POST
- **功能**：根据加密后的商品 ID 获取商品详情。

### 请求参数
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| product_get_request | Object | 是 | 请求对象 |
| productId | Number | 是 | 商品 ID |

### 响应参数（主要字段）
返回完整商品信息，主要字段如下（嵌套对象只列关键项）：

| 参数 | 类型 | 说明 |
|---|---|---|
| trace_id | String | 排障 ID |
| subject | String | 商品标题 |
| description | String | 商品详情描述 |
| language | String | 语言 |
| keywords | String[] | 关键词 |
| group_id | Number | 分组 ID |
| category_id | Number | 类目 ID |
| product_type | String | 商品类型（sourcing 询盘 / wholesale 批发） |
| status | String | 商品状态 |
| display | String | 上下架 |
| gmt_modified | String | 修改时间 |
| main_image | Object | 主图（images 图片 URL 列表、watermark 水印、watermark_position center/bottom 等） |
| product_sku | Object | SKU 定义：skus[]（sku_id、sku_code、sku_attributes[]、inventory_dtolist[] 库存、bulk_discount_prices[] 阶梯价等） |
| attributes | Object[] | 商品属性（attribute_id、attribute_name、value_id、value_name 等） |
| wholesale_trade | Object | 批发交易信息（price 价格、price_type、unit_type 单位、min_order_quantity 起订量、weight、volume、package_size、handling_time、shipping_line_template_id 运费模板、deliver_periods[] 交期、rts 是否现货等） |
| sourcing_trade | Object | 询盘交易信息（fob_min_price/fob_max_price、fob_currency、min_order_quantity_sourcing、supply_quantity、delivery_time、delivery_port、payment_methods[]、packaging_desc 等） |
| custom_info | Object | 定制信息（custom_type、custom_contents[]、min_order_quantity_custom 等） |
| pc_detail_url | String | PC 端详情页 URL |
| owner_member | Number | 所属账号 ID |
| owner_member_display_name | String | 所属者名称 |
| smart_edit | Boolean | 是否智能编辑 |

### 错误码
无。

---

## alibaba.icbu.product.group.add

- **path**：`/icbu/product/group/add`
- **方法**：GET/POST
- **功能**：创建新的商品分组。

### 请求参数
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| group_name | String | 是 | 分组名 |
| parent_group_id | Number | 是 | 父分组 ID；创建一级分组时传 -1 |

### 响应参数
| 参数 | 类型 | 说明 |
|---|---|---|
| product_group | Object | 创建的分组对象 |
| children_id_list | Number[] | 子分组列表 |
| group_name | String | 分组名 |
| group_id | Number | 分组唯一 ID |
| parent_id | Number | 父分组 ID |
| error_code | String | 错误码 |
| error_msg | String | 错误信息 |

### 错误码
| 错误码 | 错误信息 | 解决方案 |
|---|---|---|
| PARENT_GROUP_IS_NOT_EXIST | PARENT_GROUP_IS_NOT_EXIST | 父分组不存在 |
| ERROR_INSERT_DUPLICATE_NAME | ERROR_INSERT_DUPLICATE_NAME | 分组名不可重复 |
| LEVEL1_GROUP_COUNT_LIMIT | LEVEL1_GROUP_COUNT_LIMIT | 一级分组最多 50 个 |
| ERROR_INSERT_SUBGROUP_EXCEED_LIMIT | ERROR_INSERT_SUBGROUP_EXCEED_LIMIT | 一/二/三级分组合计最多 5000 个 |

---

## alibaba.icbu.product.id.encrypt

- **path**：`/alibaba/icbu/product/id/encrypt`
- **方法**：GET/POST
- **功能**：加密商品 ID。

### 请求参数
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| language | String | 是 | 语言 |
| product_id | Number | 是 | 未加密的商品 ID |

### 响应参数
| 参数 | 类型 | 说明 |
|---|---|---|
| secret_id | String | 加密后的商品 ID |
| error_code | String | 错误码 |
| error_msg | String | 错误信息 |

### 错误码
无。

---

## alibaba.icbu.product.inventory.get

- **path**：`/icbu/product/inventory/get`
- **方法**：GET/POST
- **功能**：获取商品库存信息。

### 请求参数
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| product_id | Number | 是 | 商品 ID |
| language | String | 是 | 语言 |

### 响应参数
| 参数 | 类型 | 说明 |
|---|---|---|
| result | Object | 结果 |
| trace_id | String | 排障 ID |
| data_list | Object[] | 库存数据（sku_id、inventory_code、inventory 库存数、sku_outer_id） |
| success | Boolean | 是否成功 |
| message_info | String | 信息 |
| msg_code | String | 消息码 |

### 错误码
无。

---

## alibaba.icbu.product.inventory.update

- **path**：`/icbu/product/inventory/update`
- **方法**：GET/POST
- **功能**：更新库存信息。

### 请求参数
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| product_id | Number | 是 | 商品 ID |
| inventory_list | Object[] | 是 | 待更新库存列表 |
| operate | String | 是 | plus 增 / sub 减 |
| inventory_code | String | 是 | 库存编码 |
| inventory | Number | 是 | 库存数 |
| sku_id | Number | 是 | SKU ID |

### 响应参数
| 参数 | 类型 | 说明 |
|---|---|---|
| result | Object | 结果 |
| trace_id | String | 排障 ID |
| data | String | 数据 |
| success | Boolean | 是否成功 |
| message_info | String | 信息 |
| msg_code | String | 消息码 |

### 错误码
无。

---

## alibaba.icbu.product.list

- **path**：`/alibaba/icbu/product/list`
- **方法**：GET/POST
- **功能**：按类目 ID 和商品名查询商品概要，按修改时间倒序返回，支持分页（每页最多 30 条）。

### 请求参数
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| current_page | Number | 否 | 当前页 |
| subject | String | 否 | 商品标题 |
| page_size | Number | 否 | 每页条数 |
| gmt_modified_from | String | 否 | 修改时间起 |
| gmt_modified_to | String | 否 | 修改时间止 |
| group_id1/group_id2/group_id3 | Number | 否 | 分组 ID（一/二/三级） |
| id | Number | 否 | 商品 ID |
| category_id | Number | 否 | 类目 ID |

### 响应参数（主要字段）
| 参数 | 类型 | 说明 |
|---|---|---|
| result | Object | 结果 |
| trace_id | String | 排障 ID |
| curr_page | Number | 当前页 |
| total_item | Number | 结果总数 |
| page_size | Number | 每页条数 |
| products | Object[] | 商品详情列表（id、subject、keywords[]、category_id、product_type sourcing/wholesale、status、display Y/N、main_image、pc_detail_url、rts 是否现货、gmt_create/gmt_modified 等） |
| error_code | String | 错误码 |
| error_msg | String | 错误信息 |

### 错误码
无。

---

## alibaba.icbu.product.schema.add

- **path**：`/icbu/product/schema/add`
- **方法**：GET/POST
- **功能**：按类目发布规则提交填充好的 XML，正式发布商品。（注意：官方文档此条参数表展示有误，实际入参应为 `cat_id` + `xml` + `language`，与 `schema.add.draft` 一致；请以 `schema.get` 返回的字段规则为准。）

### 请求参数（实际）
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| cat_id | Number | 是 | 发布商品的类目 ID（须为叶子类目） |
| xml | String | 是 | 按 schema.get 规则填充的商品数据 XML |
| language | String | 是 | 语言 |

> 文档原始展示的参数表（current_page/subject/page_size 等）与查询接口雷同，疑为文档拷贝错误，集成时以发布草稿接口 `schema.add.draft` 的参数与 `schema.get` 的字段规则为准。

### 响应参数
| 参数 | 类型 | 说明 |
|---|---|---|
| result | Object | 发布结果 |
| trace_id | String | 排障 ID |
| product_id | Number | 商品 ID |
| success | Boolean | 是否成功 |
| message_info | String | 信息 |
| msg_code | String | 消息码 |

### 错误码
参见 `schema.add.draft` / `schema.update` 的错误码（类目非叶子、公司资料待审、字段必填/长度/范围校验等）。

---

## alibaba.icbu.product.schema.add.draft

- **path**：`/icbu/product/schema/add/draft`
- **方法**：GET/POST
- **功能**：ICBU 商品**发布草稿**入口。提交类目 ID 和填充好的 XML，创建为草稿（不直接上架），适用于「上架草稿 v2」。

### 请求参数
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| param_product_top_publish_request | Object | 是 | 请求对象 |
| cat_id | Number | 是 | 类目 ID（须为叶子类目） |
| xml | String | 是 | 待发布商品的详细信息（按 schema.get 规则填充） |
| language | String | 是 | 语言 |

### 响应参数
| 参数 | 类型 | 说明 |
|---|---|---|
| result | Object | 发布结果 |
| trace_id | String | 排障 ID |
| product_id | Number | 草稿商品 ID |
| success | Boolean | 是否成功 |
| message_info | String | 信息 |
| msg_code | String | 消息码 |

### 错误码
| 错误码 | 错误信息 | 解决方案 |
|---|---|---|
| CHK_CAT_NOT_LEAF | The category is not a leaf category | 只有叶子类目可发布商品 |
| PUB_BIZCHECK_CAT_ID_NOTEXIST | CatId can't be null | 发布时必须传类目 ID |
| PUB_BIZCHECK_CAT_DATA_NOTEXIST | 请重新编辑并调整商品类目 | 所选类目无效，请更换类目 |
| PUB_BIZCHECK_ASSURANCE_ACCOUNT_REQUIRED | 账号无法发布批发商品 | 未开通 Trade Assurance 不能发布现货 |
| PUB_BIZCHECK_TEMPLATE_OWNER_ERROR | 运费模板不属于你的账号 | 只能用自己账号下的运费模板 |
| PUB_BIZCHECK_SUSPICIOUS | 因违规禁止发布 | 账号因侵权/违规被临时关闭，联系开发者 |
| PUB_BIZCHECK_AUDITING_COMPANY_INFO | 公司资料审核通过后方可展示新品 | 发布前需在公司主页完善公司信息 |
| CHK_BASIC_MULTIPLEOF | 输入值不在指定范围 | multiSelect 类型须使用 option 子字段中的值 |
| CHK_BASIC_ONEOF | 输入值不在指定范围 | 须使用 option 子字段中的值 |
| CHK_BASIC_MIN_LENGTH | 不能少于 {0} 字符 | 字段有最小长度限制 |
| CHK_BASIC_MAX_LENGTH | 不能多于 {0} 字符 | 字段有最大长度限制 |
| CHK_STEP_CATEGORY_QUALITY_MINSIZE_ERROR | 该类目和单位下起订量不得少于 {0} | 起订量受类目和 priceUnit 字段限制 |
| CHK_BASIC_REQUIRED | 该字段必填 | schema 中必填字段必须填写，不可置空 |

### 真机修正（2026-07-02，官方《【交易/商机】商品发布接入文档》对照验证）

1. **multiComplex 提交格式**：每个数据实例一个 `<complex-values>` 节点、字段直接挂在其中（官方 demo 格式）。
   写成 `<complex-values><complex-value>…</complex-value></complex-values>` 会被平台**静默丢弃整个字段**（不报错）——
   这就是此前「草稿商详写不进去」的真正根因。complex 类型仍是 `<complex-value>` 包装。
2. **结构化详描草稿可写**：顶层字段 `detailImage`（产品图片，按图集分组：150 尺寸图/200 场景图/300 细节图/350 其他）、
   `textDesc`（卖点 ≤2000 字符）、`companyDesc`/`companyFaqDesc`/`companyImage` 均可随 `schema.add.draft` 落库
   （render.draft 与编辑页均确认）。使用结构化详描时**不要设置** `productDescType`/`superText`（那是普通编辑字段）。
   detailImage 的 imageURL 必须是图片银行 URL；细节图（300）支持每图 `generalText` 配文（≤500）。
3. **关键词**：`productKeywords` 实际只有一组 `productKeywords_0`（≤384 字节，禁 `[;:,，]`），多个词用换行 `\n`
   分隔（官方 demo 格式）；`productKeywords_1/2` 会被静默丢弃。
4. **主图视频**：`imageVideo`（主图视频）/`detailVideo`（详情视频）为 singleCheck，值＝视频银行 `video_id` 直填。
5. **标题字符集**：en_US 类目 `productTitle` 的 regexRule 把非 ASCII（全部中文）判非法——平台草稿实际接受中文标题，
   本地预检不要按该规则清洗（会把标题洗成空串），只提示待编辑页翻译。

---

## alibaba.icbu.product.schema.get

- **path**：`/alibaba/icbu/product/schema/get`
- **方法**：GET/POST
- **功能**：获取 ICBU 商品发布的页面规则与填写字段（XML），适用于新发商品。是发布流程第一步。

### 请求参数
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| cat_id | Number | 是 | 类目 ID |
| language | String | 是 | 语言 |

### 响应参数
| 参数 | 类型 | 说明 |
|---|---|---|
| result | Object | 结果 |
| trace_id | String | 排障 ID |
| data | String | 发布规则 XML（含各字段 id、type、是否必填、长度/正则规则等） |
| success | Boolean | 是否成功 |
| message_info | String | 信息 |
| msg_code | String | 消息码 |

### 错误码
无。

---

## alibaba.icbu.product.schema.render

- **path**：`/icbu/product/schema/render`
- **方法**：GET/POST
- **功能**：渲染已有商品数据（用于编辑已发布商品场景）。

### 请求参数
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| render_request | Object | 是 | 请求对象 |
| cat_id | Number | 是 | 类目 ID |
| product_id | Number | 是 | 商品 ID |
| language | String | 是 | 语言 |

### 响应参数
| 参数 | 类型 | 说明 |
|---|---|---|
| result | Object | 响应 |
| trace_id | String | 唯一 ID |
| data | String | 页面数据 |
| success | Boolean | 是否成功 |
| msg | String | 信息 |
| msg_code | String | 消息码 |

### 错误码
| 错误码 | 错误信息 | 解决方案 |
|---|---|---|
| PUB_BIZCHECK_PRODUCT_NOT_EDITABLE | 该商品不可编辑 | 商品在待审状态，审核后才可编辑 |
| PUB_BIZCHECK_CAT_DATA_NOTEXIST | 请重新编辑并调整类目 | 所选类目无效 |
| PUB_BIZCHECK_NOT_PRODUCT_OWNER | 不能修改/删除他人商品 | 商品不属于该账号 |
| PUB_BIZCHECK_SUSPICIOUS | 因违规禁止发布 | 账号被临时关闭，联系开发者 |
| PUB_BIZCHECK_AUDITING_COMPANY_INFO | 公司资料审核后方可展示新品 | 需完善公司信息 |
| PUB_BIZCHECK_PRODUCT_STATUS_INVALID | 商品状态无效 | 无法获取已删除/待审商品 |

---

## alibaba.icbu.product.schema.render.draft

- **path**：`/icbu/product/schema/render/draft`
- **方法**：GET/POST
- **功能**：查询单个草稿商品对应数据，适用于编辑单个草稿商品场景。

### 请求参数
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| cat_id | Number | 是 | 类目 ID |
| product_id | Number | 是 | 商品 ID |
| language | String | 是 | 语言 |

### 响应参数
| 参数 | 类型 | 说明 |
|---|---|---|
| result | Object | 结果 |
| trace_id | String | 排障 ID |
| data | String | 商品详细信息 |
| success | Boolean | 是否成功 |
| message_info | String | 信息 |
| msg_code | String | 消息码 |

### 错误码
| 错误码 | 错误信息 | 解决方案 |
|---|---|---|
| PUB_BIZCHECK_PRODUCT_NOT_EDITABLE | 该商品不可编辑 | 待审状态，审核后可编辑 |
| PUB_BIZCHECK_NOT_PRODUCT_OWNER | 不能修改/删除他人商品 | 商品不属于该账号 |
| PUB_BIZCHECK_SUSPICIOUS | 因违规禁止发布 | 账号被临时关闭，联系开发者 |
| PUB_BIZCHECK_AUDITING_COMPANY_INFO | 公司资料审核后方可展示新品 | 需完善公司信息 |
| PUB_BIZCHECK_PRODUCT_STATUS_INVALID | 商品状态无效 | 无法获取已删除/待审商品 |

---

## alibaba.icbu.product.schema.update

- **path**：`/icbu/product/schema/update`
- **方法**：GET/POST
- **功能**：增量更新，仅更新传入字段，其他字段保持不变。

### 请求参数
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| cat_id | Number | 是 | 商品类目 ID |
| product_id | Number | 是 | 待更新商品 ID |
| xml | String | 是 | 待更新字段 |
| language | String | 是 | 语言 |

### 响应参数
| 参数 | 类型 | 说明 |
|---|---|---|
| result | Object | 完整结果 |
| trace_id | String | 排障 ID（重要） |
| product_id | Number | 已更新的商品 ID |
| success | Boolean | 是否成功 |
| message_info | String | 返回信息 |
| msg_code | String | 返回码 |

### 错误码（主要）
| 错误码 | 错误信息 | 解决方案 |
|---|---|---|
| CHK_CAT_NOT_LEAF | 类目非叶子 | 只有叶子类目可发布 |
| PUB_BIZCHECK_DESCRIPTION_IMAGE_SOURCE_ERROR | 详情描述只能插入图片银行中的图片 | 发布前先用 photobank.upload 上传图片 |
| PUB_BIZCHECK_PRODUCT_NOT_EDITABLE | 商品不可编辑 | 待审状态，审核后可编辑 |
| PUB_BIZCHECK_CAT_ID_NOTEXIST | 类目 ID 不能为空 | 请传类目 ID |
| PUB_BIZCHECK_PRODUCT_SKU_INVALID | SKU 数据不完整 | 每个 SKU 的属性和值需互不相同，不可重复 |
| PUB_BIZCHECK_NOT_PRODUCT_OWNER | 不能修改/删除他人商品 | 商品不属于该账号 |
| CHK_BASIC_REQUIRED | 字段必填 | schema 必填字段必须填写 |
| CHK_STEP_LADDER_PERIOD_VALUE_ERROR | 交期数量须从小到大 | 阶梯价数量须由小到大形成正确阶梯 |
| CHK_RTS_MIN_ORDER_PERIOD_MAX_THAN_15_ERROR | 起订量周期不能超过 15 天 | 现货商品须遵守平台规则 |
| CHK_VIDEO_PRODUCT_LINK_LIMIT | 视频绑定商品数超限 | 一个视频最多用于 20 个商品主图（scImages） |
| CHK_DETAIL_VIDEO_PRODUCT_LINK_LIMIT | 详情视频绑定商品数超限 | 一个视频最多用于 200 个商品详情（superText） |
| PUB_BIZCHECK_PROPERTY_CUSTOM_ITEMS_LIMIT | 自定义属性数超限 | 自定义属性最多 10 个 |
| PUB_BIZCHECK_SUSPICIOUS_CATEGORY | 类目未通过资质校验 | 特殊类目需上传资质 |

---

## alibaba.icbu.product.score.get

- **path**：`/icbu/product/score/get`
- **方法**：GET/POST
- **功能**：查询商品质量分。

### 请求参数
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| product_id | Number | 是 | 商品 ID |

### 响应参数
| 参数 | 类型 | 说明 |
|---|---|---|
| result | Object | 结果 |
| trace_id | String | 排障 ID |
| final_score | String | 商品分数 |
| boutique_tag | Number | 精品标签：1 精品 / 2 普通 / 3 低质 / 4 优质 |
| error_code | String | 错误码 |
| error_msg | String | 错误信息 |

### 错误码
无。

---

## alibaba.icbu.product.type.available.get

- **path**：`/icbu/product/other/available/get`
- **方法**：GET/POST
- **功能**：查询商家在某类目下的发布权限。

### 请求参数
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| cat_id | Number | 是 | 类目 ID |
| language | String | 是 | 语言 |

### 响应参数
| 参数 | 类型 | 说明 |
|---|---|---|
| result | Object | 结果 |
| data.supportPostWholeSale | Boolean | 是否支持发布批发商品 |
| data.supportPostSourcing | Boolean | 是否支持发布询盘商品 |
| success | Boolean | 是否成功 |
| message_info | String | 信息 |
| msg_code | String | 消息码 |
| trace_id | String | 排障 ID |

### 错误码
无。

---

## icbuproduct

- **path**：`/icbu/product`
- **方法**：GET/POST
- **功能**：获取 ICBU 商品发布页面规则与字段，适用于新发商品（与 schema.get 类似的渲染规则获取）。

### 请求参数
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| param_publish_get_request | Object | 是 | 商品渲染请求 |
| cat_id | Number | 是 | 类目 ID |
| language | String | 是 | 语言，支持 en、zh |

### 响应参数
| 参数 | 类型 | 说明 |
|---|---|---|
| result | Object | 结果对象 |
| trace_id | String | 排障 ID |
| data | Object | ICBU 商品发布规则 |
| success | Boolean | 是否成功 |
| msg | String | 错误信息 |
| msg_code | String | 错误码 |

### 错误码
无。
