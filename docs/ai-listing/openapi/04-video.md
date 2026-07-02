# Video（视频）

商家视频银行的上传、查询与绑定商品主视频。除特别说明外均需 `access_token`。

> 视频上传是异步的：`alibaba.icbu.video.upload` 提交后若 `req_code=QUEUE` 表示处理中，需用 `alibaba.icbu.video.upload.result` 按 `req_id` 轮询结果（req_id 24 小时过期），完成后得到 `video_id`，再用 `alibaba.icbu.video.relation.product.main` 绑定为商品主视频。

---

## alibaba.icbu.video.query

- **path**：`/alibaba/icbu/video/query`
- **方法**：GET/POST
- **功能**：获取商家名下的视频列表。

### 请求参数
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| current_page | Number | 是 | 当前页 |
| page_size | Number | 是 | 每页条数 |
| video_id | Number | 否 | 视频 ID |

### 响应参数
| 参数 | 类型 | 说明 |
|---|---|---|
| result.model | Object | 数据实体 |
| current_page / page_size / total_count | Number | 分页信息 |
| list | Object[] | 视频列表 |
| list[].video_id | Number | 视频 ID |
| list[].video_url | String | 视频资源 URL |
| list[].cover_url | String | 视频封面 URL |
| list[].duration | Number | 时长 |
| list[].file_size | Number | 文件大小（字节） |
| list[].publish_time | Number | 发布时间（毫秒） |
| list[].quality | String | 清晰度等级 |
| list[].status | String | 状态，approved 表示审核通过合法 |
| list[].title | String | 标题 |
| list[].video_height / video_width | Number | 视频高/宽（像素） |
| msg_code / msg_info | String | 错误码/信息 |

### 错误码
无。

---

## alibaba.icbu.video.relation.product.main

- **path**：`/alibaba/icbu/video/relation/product/main`
- **方法**：GET/POST
- **功能**：将视频绑定为商品主视频。

### 请求参数
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| video_id | Number | 是 | 视频 ID |
| product_id | Number | 是 | 商品 ID |

### 响应参数
| 参数 | 类型 | 说明 |
|---|---|---|
| model | Boolean | 是否成功 |
| msg_code / msg_info | String | 错误码/信息 |

### 错误码
无。

---

## alibaba.icbu.video.upload

- **path**：`/alibaba/icbu/video/upload`
- **方法**：GET/POST
- **功能**：按视频 URL 上传视频到视频银行（异步）。

### 请求参数
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| video_path | String | 是 | 视频源 URL |
| video_name | String | 是 | 视频名 |
| video_cover | String | 否 | 视频封面 |

### 响应参数
| 参数 | 类型 | 说明 |
|---|---|---|
| result.model.req_id | String | 请求 ID |
| result.model.video_id | String | 视频 ID |
| result.model.req_code | String | COMPLETE / QUEUE / FAIL；QUEUE 表示处理中，需用 upload.result 按 req_id 查询 |
| msg_code / msg_info | String | 错误码/信息 |

### 错误码
无。

---

## alibaba.icbu.video.upload.result

- **path**：`/alibaba/icbu/video/upload/result`
- **方法**：GET/POST
- **功能**：按 req_id 查询视频上传结果。

### 请求参数
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| req_id | String | 是 | 请求 ID（24 小时后过期） |

### 响应参数
| 参数 | 类型 | 说明 |
|---|---|---|
| result.model.req_code | String | COMPLETE / QUEUE / FAIL；COMPLETE 时 video_id 可用 |
| result.model.req_id | String | 请求 ID |
| result.model.video_id | String | 视频 ID |
| msg_code / msg_info | String | 错误码/信息 |

### 错误码
无。

---

## 真机备注（2026-07-02）

- App 的 Video 接口组权限开通后，网关不再报 `InsufficientPermission`；但若店铺侧视频银行/授权未就绪，
  **所有 Video 组接口**（upload / upload.result / query / relation.product.main）会统一返回业务错误
  `{"msg_code":"10000002","msg_info":"illegal param error"}`（与参数无关）。处理：让商家重新授权应用
  （旧 token 刷新无效），并在 myAlibaba 媒体中心打开一次视频银行页面后重试。
- `video_path` 必须是可直接下载的直链：`play.video.alibaba.com/global/play/*.mp4` 是 302 跳转页，
  需先本地解析重定向取 CDN 终链（gv.videocdn.alibaba.com/...）再传。
- 草稿商品绑定视频不用 relation 接口，直接在 schema.add.draft 的 XML 里填 `imageVideo`=video_id。
