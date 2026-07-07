# 阿里巴巴国际站「创意工坊」AI 生图能力对标报告(2026-07-07)

> 面向跨境 B2B(Alibaba.com / ICBU)。底层能力来自阿里云百炼(Model Studio / DashScope)+ 通义万相(wanx)+ 通义千问图像(qwen-image / qwen-mt-image)+ AI 试衣(OutfitAnyone/aitryon)。
> 创意工坊面向卖家的功能 = 这些模型的产品化封装。部分功能无官方独立文档,已标注「推断」。
> 来源见文末。此文为产品对标,指导我们场景库补全的优先级。

## 一、功能对标总表(官方 14 项)

| 创意工坊功能 | 官方用途(对一张商品图做什么) | 输入 | 疑似模型/端点 | 跨境价值 |
|---|---|---|---|---|
| 白底图生成 | 抠主体、换纯白底,产出合规主图 | 单图 | matting + `wanx2.1-imageedit` description_edit | **高** |
| 场景图生成 | 白底商品放进生活/使用场景(带光影) | 单图+可选场景词 | `qwen-image-edit` / `wan2.6-image` | **高** |
| 图片擦除 | 移除多余物体/文字/水印并补全 | 单图+mask | image-erase-completion / `wanx2.1-imageedit` remove_watermark | 中 |
| 商品换色 | 改商品颜色出 SKU 变体图 | 单图+mask或指令 | `description_edit_with_mask` / `qwen-image-edit` | 中 |
| 营销卖点图[新] | 合成带卖点文案/标签排版的营销图 | 商品图+卖点文案 | 创意海报 `wanx-poster-generation-v1` + 模板【推断】 | **高** |
| 图片翻译 | 图内文字→翻译,保留原版式 | 单图+目标语言 | `qwen-mt-image`(11+语言) | **高** |
| 高清 | 超分放大+提纹理降噪 | 单图 | `wanx2.1-imageedit` super_resolution / VIAPI | 中 |
| 模特图 | 虚拟模特穿戴/手持商品展示 | 图+mask 或 平铺服装+全身人像 | `wanx-virtualmodel`/`virtualmodel-v2`;`aitryon-plus` | **高** |
| 换材质[新] | 改材质/质感(木→金属、布→皮) | 单图+指令 | `qwen-image-edit`【推断】 | 中 |
| 指令生图[新] | 自然语言自由编辑(兜底) | 单/多图+指令 | `qwen-image-edit`(1–3图)/ `wan2.6-image` | 中-高 |
| 细节图 | 材质/工艺特写、局部放大 | 单图(可指定局部) | super_resolution+裁剪 / `qwen-image-edit`【推断】 | 中 |
| Logo定制 | 设计 Logo 或把 Logo 贴到商品 | 文字 或 商品图+Logo图 | `qwen-image` / `qwen-image-edit` 多图【推断】 | 低-中 |
| 生产流程图[新] | 生成工厂/生产流程信息图,建信任 | 步骤文字+可选实拍 | `wan2.6-image` 图文混排 / `qwen-image`【推断】 | 中 |
| 改尺寸[新] | 扩图/外补到目标比例尺寸 | 单图+目标尺寸 | `wanx2.1-imageedit` expand | 中-高 |

官方确认端点:`wanx2.1-imageedit`(function: stylization/description_edit/description_edit_with_mask/remove_watermark/expand/super_resolution/colorization/doodle,异步两步)、`wan2.6-image`(1–4图,enable_interleave 图文混排)、`qwen-mt-image`(图片翻译,需公网URL)、`qwen-image-edit(-plus/-max)`(1–3图+指令,支持 Base64/URL/OSS)、`wanx-virtualmodel`/`virtualmodel-v2`(单图+mask,图必须公网可访问且URL无中文)、`aitryon(-plus)`(平铺服装+全身人像)。

## 二、我们已覆盖 vs 待补

- **已覆盖(9,方向正确)**:`white_bg` 白底 / `scene_gen` 场景 / `erase` 擦除 / `recolor` 换色 / `selling_point` 卖点 / `hd` 高清 / `expand` 改尺寸 / `material` 换材质 / `custom` 指令生图。
- **待补(5)**:`translate` 图片翻译 · `model_shot` 模特图 · `detail` 细节图 · `logo` Logo定制 · `process` 生产流程图。

## 三、待补功能实现建议

1. **图片翻译 `translate`** —— `qwen-mt-image`,单图异步,传商品图公网 URL + 目标语言(源/目标至少一端为中/英)。跨境刚需,现有场景库最缺的一块。
2. **模特图 `model_shot`** —— 通用/配饰走虚拟模特 `virtualmodel-v2`(单图+mask,需公网URL);服装走 AI 试衣 `aitryon-plus`(平铺服装+全身人像)。先接虚拟模特(门槛低覆盖广)。
3. **细节图 `detail`** —— 局部裁剪 + `super_resolution` 出高清特写(单图、可 Base64,不依赖公网URL);或 `qwen-image-edit` 指令「放大展示材质/工艺细节」。
4. **Logo定制 `logo`** —— ①从零设计=文生图 `qwen-image`(纯 prompt);②把已有 Logo 贴到商品=`qwen-image-edit` 多图(商品图+Logo图)。优先②。
5. **生产流程图 `process`** —— `qwen-image` / `wan2.6-image` 图文混排,步骤文字+可选实拍排成信息图。优先级最低。

## 四、给我们的落地建议(优先级)

1. **P0 先补「图片翻译」+「模特图」**:跨境 B2B 差异化最强,直接映射成熟端点(`qwen-mt-image` / `virtualmodel-v2`),集成成本可控。
2. **默认卡片排序对齐平台转化权重**:白底 → 场景图 → 模特图(服装) → 细节图 → 流程/Logo(信任类)。候选区默认最先生成、最突出的应是 `white_bg / scene_gen / model_shot`。
3. **统一「异步任务 + 公网 URL」基建**:百炼图像类几乎全是「建任务→轮询 task_id」,虚拟模特/翻译强制公网可访问、URL 无中文。建议商品图先落一个公网可访问对象存储(签名 URL),做成所有生图场景共享的前置管线。
4. **「指令生图」定位兜底 + 场景加速器**:`qwen-image-edit` 一套指令通道 + 预置 prompt 模板即可覆盖换色/换材质/细节图,不必每个细分各接端点。
5. **「营销卖点图 / 改尺寸」做成流程收尾**:改尺寸(expand)把生成图一键适配平台规格;卖点图在选定候选后叠加文案排版。形成「搬运→改图→套尺寸/卖点→发布」闭环。

## 关键来源

- 万相通用图像编辑 API(function 全列表):https://help.aliyun.com/zh/model-studio/wanx-image-edit-api-reference
- 万相 2.6(wan2.6-image):https://help.aliyun.com/zh/model-studio/wan-image-generation-api-reference
- Qwen-MT-Image 图片翻译:https://help.aliyun.com/zh/model-studio/qwen-mt-image-api
- Qwen-Image-Edit 指令编辑:https://help.aliyun.com/zh/model-studio/qwen-image-edit-api
- 虚拟模特:https://help.aliyun.com/zh/model-studio/virtual-model-api-details · AI 试衣:https://help.aliyun.com/zh/model-studio/aitryon-plus-api
- 图像擦除补全:https://help.aliyun.com/zh/model-studio/image-erase-completion-api-reference · 创意海报:https://help.aliyun.com/zh/model-studio/creative-poster-generation-overview
- Pic Copilot(阿里国际官方 AI 电商图工具):https://ai-bot.cn/sites/6245.html
- 阿里国际站 AI 生意助手上线通知(白底/场景/模特批量):https://onetouch.alibaba.com/moBasedata/public/news/content8b42a5fa-e0f9-42ee-be57-36c1acc86a78

> 营销卖点图/换材质/细节图/Logo定制/生产流程图 五项无官方独立技术文档,模型映射为基于百炼公开能力的合理推断(已标注);其余有官方文档佐证。
