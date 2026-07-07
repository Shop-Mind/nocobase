# 创意工坊技术缺口补充调研(2026-07-07)

> 配套文档:`2026-07-07-alibaba-creative-workshop-research.md`(14 项功能 UI + 主要端点映射)。
> 本篇只补 6 个更深的技术细节:智能视频 / 推荐提示词 / 设置选区(mask) / 基础版·进阶版档位与 i豆 / 图片比例 / 图片改尺寸。
> 底层能力仍来自阿里云百炼(Model Studio / DashScope)+ 通义万相(wan/wanx)+ 通义千问(qwen-image / qwen-vl)+ 视觉智能开放平台(VIAPI imageseg)。
> 标注约定:【官方】= 有官方文档佐证;【推断】= 基于百炼/VIAPI 公开能力的合理推断,无独立官方文档。

---

## 一、智能视频(「智能图片 / 智能视频」两个 tab)

**结论:** 智能视频不是单一模型,而是「百炼视频生成端点 + VIAPI 模板视频」的产品化聚合。创意工坊里的视频能力可拆成 4 类,全部落到 DashScope 的 `video-synthesis` 异步端点(数字人/主图视频除外一部分走 VIAPI):

| 视频类型 | 输入 | 底层模型(百炼) | 说明 |
|---|---|---|---|
| 图生视频(首帧驱动) | **单图** + prompt | `wan2.2-i2v-*` / `wan2.6-i2v-flash` / `wan2.7-i2v` | 静态商品图→动态短视频,prompt 控制运镜/运动【官方】 |
| 首尾帧生视频 | **双图**(首帧+尾帧)+ prompt | `wan2.2` 系列(首尾帧) | 给起止画面,中间自动补帧【官方】 |
| 文生视频 | **纯文字** | 通义万相 wan/wanx **t2v** 系列 | 纯 prompt 出视频,支持 16:9 / 9:16 等比例【官方】 |
| 数字人 / 口播 | **单图 + 人声音频** | `wan2.2-s2v`(声驱动口型);低成本档 **EMO 悦动人像**;长视频(>20s、头动简单)**LivePortrait 灵动人像**;真人视频改口型 **VideoRetalk 声动人像** | 人物图/视频 + 音频→对口型说话/唱歌视频【官方】 |
| 主图视频 / 一键产品视频 | **商品 ID 或多张主图 + 文案** | **不是扩散 i2v**,而是 VIAPI「通用视频生成」(素材智能剪辑,即达摩院 **Alibaba Wood**) | 抽取商品图/关键词/属性,模板化剪辑合成主图短视频【官方,产品化封装】 |

**端点(图生/首尾帧/文生/数字人共用):**
`POST https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis`(北京);新加坡为 `https://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com/...`。异步:建任务 → 轮询 `GET /api/v1/tasks/{task_id}`。【官方】

**关键参数(wan2.x-i2v):** `media[].type` = `first_frame` / `last_frame` / `driving_audio` / `first_clip`;`resolution` = 720P / 1080P;`duration` 2–15s(默认 5);`prompt`(≤5000 字)/`negative_prompt`;`prompt_extend`、`watermark`、`seed`。输入图 JPEG/PNG/BMP/WEBP,边长 240–8000px,画面比 **1:8 ~ 8:1**,≤20MB;音频 WAV/MP3 2–30s。【官方】

**主图视频(ICBU)开放条件(供产品设计参考):** 金品会员;商品主图 ≥3 张且长宽 ≥500px、长宽比 <4:3;公司图 ≥2 张;主图+公司图+认证图 ≥8 张。【官方(ICBU 帮助)】

> 对我们的意义:「智能视频」若要做,最低成本先接 `wan2.x-i2v` 图生视频(复用现有「异步任务 + 公网 URL」管线,单图即可出货);数字人/主图模板视频是第二梯队(需音频或多素材)。

---

## 二、推荐提示词 / 点击图片自动生成提示词

**结论:** 这是**图生文(image captioning / 图像理解)**,底层是**通义千问 VL 多模态**(`qwen-vl-max` / `qwen-vl-plus` / `qwen3-vl` 系列),**不是**一个独立的「看图出提示词」端点,而是用 VL 的多模态对话把商品图 + 一句指令喂进去,让模型输出 N 条场景描述。【官方能力,产品化封装为"推荐提示词"】

- **接口:** DashScope `MultiModalConversation.call()` 或 OpenAI 兼容 `chat.completions.create()`,`content` 里放 `{type:'image_url', image_url:{url}}` + `{type:'text', text:'为这张商品图产出 3 条适合摆拍/生活场景的英文描述'}`。模型返回类似「购物袋放在浅木色桌面、背景明亮落地窗…」的 3 条 prompt。【官方】
- **有无开放 API:** 有——就是 qwen-vl 多模态问答本身,能"看图出词";没有专门命名为 image-to-prompt 的端点。VL 能描述图像、识别物体/场景/位置,天然可产出摆拍场景描述。【官方】
- **易混淆:** 生图端点自带的 `prompt_extend`(默认 true)是「文 → 更好的文」的**提示词改写/扩写**(把用户简短 prompt 自动补细节,增 3–5s 耗时),与"看图出词"不是一回事,但产品上常串联:VL 看图出 3 条 → 用户选一条 → 生图时再 `prompt_extend` 精修。【官方】

> 落地建议:「推荐提示词」= 一次 qwen-vl 调用 + 固定 system 模板(限定输出 3 条、限定语种、限定电商摆拍风格),配额上比生图便宜很多,可默认在用户上传商品图后自动预取。

---

## 三、设置选区 / mask(换色、细节图、换材质的悬停选区工具)

**结论:** 「设置选区」= 前端交互产出一张**与原图等分辨率的二值 mask**(白=要编辑的区、黑=保留区),再把 mask 喂给百炼里"需要 mask"的编辑端点。mask 语义是官方硬约定,产出 mask 的交互有手动/自动两条路。【mask 契约:官方;交互实现:官方(VIAPI)+ 推断】

**A. 需要 mask 的百炼端点(官方):**
- `wanx2.1-imageedit` `function=description_edit_with_mask`:参数 `mask_image_url`,**分辨率必须与原图完全一致(512–4096px)**,支持 URL 或 `data:{mime};base64,{...}`;**白(255,255,255)=编辑、黑(0,0,0)=不变**。用于换色/换材质/局部替换等需精确框定范围的编辑。【官方】
- 图像擦除补全 `image-erase-completion`:输入原图 + **擦除区 mask** + **保留区 mask**,擦掉人/物/文字/水印并补背景。【官方】
- 局部重绘 `vary_region`(wanx):原图 + 涂抹 mask + prompt → 局部按语义重绘。【官方】

**B. 前端如何产出 mask(涂抹 / 框选 / 点选):**
1. **手动(最通用)——纯前端 canvas:** 用户涂抹/框选/套索,把画的区域渲染成"白底黑/黑底白"的二值图,导出为 base64 或上传得公网 URL,即 `mask_image_url`。这一步与百炼无关,是前端交互。【推断(实现)+官方(契约)】
2. **自动 / 点选——VIAPI 分割抠图(imageseg,SAM 式主体分割):** 用户"点一下商品"即自动生成主体 mask,再允许涂抹微调。可用端点:
   - `SegmentCommodity`(商品分割):`ReturnForm` 可取 `mask`(二值遮罩)/`crop`/`whiteBK`(白底图)——**返回的 mask 可直接当编辑 mask 用**;适用实景商品图,不支持卡通图。域名 `imageseg.cn-shanghai.aliyuncs.com`。【官方】
   - `SegmentCommonImage` / `SegmentHDCommonImage`(通用/高清分割):人/动物/食物/物品/家居等主体抠图。【官方】

**关于 SAM:** 百炼(Model Studio)本身**不直接暴露** SAM 那种点/框交互式分割;SAM 式"点选主体自动出 mask"的能力在阿里体系里走 **VIAPI imageseg**(或前端 canvas 手绘)。顺带一提——「白底图生成」本质就是 `SegmentCommodity` 的 `whiteBK` 返回形态。【推断映射】

> 落地建议:换色/换材质/细节图共用一套「选区组件」——默认调 `SegmentCommodity(mask)` 自动抠出主体做初始 mask,叠加 canvas 涂抹让用户加/减选区,最终产出等分辨率二值 mask 喂 `description_edit_with_mask`。这样点选(自动)+ 涂抹(手动)一套解决。

---

## 四、模型档位「基础版 / 进阶版」与 i豆 计费

**结论:** i豆是阿里国际站平台内的 **AI 消耗积分**(约 **¥0.2/豆,即 2 毛/豆**),把后端百炼/VIAPI 的"按张/按分辨率"计费**重新打包**成对卖家透明的抽象单位;「基础版/进阶版」是同一功能的两个质量档,进阶版调更高质模型/更高分辨率,耗豆更多。【i豆单价:官方口径(媒体/商家);档位→模型映射:推断】

**i豆(官方口径):**
- 文本类功能不耗豆;图片 / 视频 / 场景 / 数据类都耗豆。约 2 毛/豆,卖家需购买。【官方口径】
- 大促符合门槛商家可免费用 AI 生意助手并**赠 3000 点 i豆**。【官方】
- 会员分档影响赠送额度与权益:基础版「出口通 AI」、进阶版「金品诚企 AI」、尊享版「行业领袖」;部分高级 AI 功能(如主图视频)绑定金品会员。【官方】

**基础版 / 进阶版 → 模型档位(推断):**
- **基础版 ≈ 标准/快速档**:如 `wan2.x-image` 标准、`qwen-image`、`*-flash` / `turbo`,分辨率与推理步数较低,后端单价低 → 耗豆少。
- **进阶版 ≈ 高质档**:如 `wan2.x-image-pro`、`qwen-image-plus` / `qwen-image-max`、更高分辨率(2K–4K),后端单价高 → 耗豆多。

**用户给的耗豆数字如何解读(推断):**
- 白底 7、高清 3 —— 底层是**分割/超分**(`SegmentCommodity` / `super_resolution`),单步、便宜,故豆数最低。
- 场景 51 —— 底层是**高算力生图编辑**(`qwen-image-edit` / `wan` 场景合成),算力大、单价高,故最贵。
- 模特 17、卖点 17 —— 虚拟模特 / 海报合成,中等算力。
- 即 **i豆值 ≈ 该功能底层 DashScope/VIAPI 调用成本(按张或按分辨率档)× 平台加价系数**。卖家看不到底层模型名与调用张数,只看 i豆。

**i豆 与 DashScope 计费的关系(推断):**
DashScope 图像类基本**按张**计费(部分按分辨率档),例如 `image-out-painting` **¥0.18/张**、`wanx*-imageedit` 按张、`qwen-image` 按张/分辨率。平台把「一次功能 = 后端可能多次模型调用」的真实成本换算成整数 i豆并加价,做成统一计费口径。所以同一功能"基础版 vs 进阶版"的豆差 ≈ 后端标准档与高质档的价差。

---

## 五、图片比例(1:1 / 2:3 / 3:2 / 3:4 / 4:3 / 4:5 / 5:4 / 9:16 / 16:9 / 21:9)

**结论:** 百炼生图端点用 **`size="宽*高"`(像素,星号分隔)** 指定,而**不是** `aspect_ratio` 字段。前端选比例 → 换算成对应 `width*height` 字符串下发(超出固定档的比例走可自定义尺寸的模型)。【size 格式:官方;比例→像素换算:推断(前端/网关)】

**各端点支持范围(官方):**
| 模型 | size 格式 | 像素范围 | 默认 | 比例范围 |
|---|---|---|---|---|
| `qwen-image` | 自定义 `宽*高` | 512×512 ~ 2048×2048 | 按输入/1024²~2048² | 范围内任意比例 |
| `qwen-image-max` / `qwen-image-plus` | **仅 5 档固定** | 见下 | 1664×928(16:9) | 仅这 5 档 |
| `wan2.7-image-pro` | 简写或自定义 | 768×768 ~ 4096×4096(4K 仅纯文生图) | 2048×2048 | 1:8 ~ 8:1 |
| `wan2.7-image` | 简写或自定义 | 768×768 ~ 2048×2048 | 2048×2048 | 1:8 ~ 8:1 |
| `wan2.6-image` / `wan2.6-t2i` | 自定义 `宽*高` | 768~1280 / 1280~1440 | 1280×1280 | 1:4 ~ 4:1 |

**`qwen-image-max/plus` 的 5 个固定档(官方):** 1664×928(16:9)、1472×1104(4:3)、1328×1328(1:1)、1104×1472(3:4)、928×1664(9:16)。

**10 档比例映射(推断):**
- **直接命中 qwen-image-max 5 档:** 1:1 → 1328×1328、16:9 → 1664×928、9:16 → 928×1664、4:3 → 1472×1104、3:4 → 1104×1472。
- **需自定义 size(qwen-image 512–2048 或 wan 1:8~8:1)换算:** 2:3、3:2、4:5、5:4 —— 按目标比例在像素范围内取合适总量、边长对齐到 64 的倍数。
- **21:9 超宽:** 超出 qwen-image-max 固定档,须走 `wan`(比例范围 1:8~8:1 覆盖 21:9≈2.33:1)或 `qwen-image` 自定义 size。

> 落地建议:前端维护「比例 → size 字符串」映射表;命中固定档的用 qwen-image-max 稳出图,非固定档(2:3/3:2/4:5/5:4/21:9)统一走可自定义尺寸的 `qwen-image` 或 `wan`,并把边长归一到 64 的倍数以免被端点拒绝。

---

## 六、图片改尺寸(左栏最后一项)

**结论:** 大概率 = **扩图 / 外补(outpainting)**——把画布向外扩、AI 补内容,直到贴合目标平台比例/尺寸,而**非纯缩放**。和「改尺寸 = expand 扩图」基本是一回事,但官方有**两个**可选实现,其中带 `output_ratio` 的独立模型更贴「改到目标尺寸」的语义。【官方能力,产品化封装】

**候选实现(官方):**
1. `wanx2.1-imageedit` `function=expand`:上/下/左/右按比例外扩(`top_scale`/`bottom_scale`/`left_scale`/`right_scale`,如 1.5=扩到 1.5 倍),AI 补边。主研究文档已把「改尺寸」映射到这里。【官方】
2. **独立 `image-out-painting` 模型(更贴「改尺寸」):** 支持
   - `x_scale` / `y_scale`:按比例外扩(1.5=150%);
   - `left_offset` / `right_offset` / `top_offset` / `bottom_offset`:按像素分方向外扩;
   - **`output_ratio`:直接给目标比例(如 "4:3")** —— 正好对应"补到目标平台尺寸/比例";
   - `angle`:外扩前旋转。
   - 计费 **¥0.18/张**,目前**仅北京**地域;异步出图,URL 24h 有效。【官方】

**与"纯缩放/高清"的区分:**
- 纯放大清晰度、不改构图 = `super_resolution`(高清功能),不是"改尺寸"。
- 若"改尺寸"仅是把图缩放到平台像素门槛(如主图 ≥500px、长宽比 <4:3),那只是前端 resize;但从左栏与「扩图外补画布到目标尺寸」的语义看,**更可能是 outpainting 外补**,而非等比缩放。两种可能都列,倾向 outpainting。【推断】
- 要对齐的目标尺寸集 = 阿里国际站主图/详情规格(如主图 ≥500px、长宽比 <4:3 等)。【官方(ICBU 规格)】

> 落地建议:「改尺寸」用 `image-out-painting` 的 `output_ratio` 直接产出平台合规比例(1:1 / 4:3 等),作为"搬运→改图→套尺寸→发布"闭环的收尾步;`wanx2.1-imageedit` expand 作为备选(比例参数更细但无 `output_ratio` 直给)。

---

## 关键来源

**智能视频**
- 万相 2.7 图生视频 API(模型/media/resolution/duration/端点):https://www.alibabacloud.com/help/zh/model-studio/image-to-video-general-api-reference
- 万相图生视频(首帧)指南:https://help.aliyun.com/zh/model-studio/image-to-video-guide
- 万相首尾帧生视频 API:https://help.aliyun.com/zh/model-studio/image-to-video-by-first-and-last-frame-api-reference
- 万相-数字人 wan2.2-s2v(含 EMO / LivePortrait / VideoRetalk 选型):https://help.aliyun.com/zh/model-studio/wan-s2v-overview/ · https://help.aliyun.com/zh/model-studio/wan-s2v-api
- VIAPI 通用视频生成(素材智能剪辑,主图视频/Alibaba Wood):https://help.aliyun.com/zh/viapi/developer-reference/api-universal-video-generation
- 通义万相文生/图生视频(免费上线):https://zhuanlan.zhihu.com/p/28481808438
- ICBU 智能生成产品视频操作与门槛:https://www.cifnews.com/article/59539

**推荐提示词(图生文)**
- Qwen-VL / Qwen3-VL 视觉理解(多模态,MultiModalConversation):https://help.aliyun.com/zh/model-studio/vision
- 文生图 prompt_extend(提示词改写):https://help.aliyun.com/zh/model-studio/text-to-image

**设置选区 / mask**
- 万相通用图像编辑 API(`description_edit_with_mask` 的 mask 契约、function 全列表):https://help.aliyun.com/zh/model-studio/wanx-image-edit-api-reference
- 图像擦除补全(擦除 mask + 保留 mask):https://help.aliyun.com/zh/model-studio/image-erase-completion-api-reference
- 局部重绘 vary_region:https://help.aliyun.com/zh/model-studio/vary-region
- VIAPI 商品分割 SegmentCommodity(ReturnForm=mask/crop/whiteBK):https://help.aliyun.com/zh/viapi/developer-reference/api-i8iw3k
- VIAPI 通用分割 SegmentCommonImage:https://help.aliyun.com/zh/viapi/developer-reference/api-k8cs8t

**基础版/进阶版 与 i豆**
- 百炼计费规则(按张/按分辨率):https://help.aliyun.com/zh/model-studio/product-billing · 模型价格:https://help.aliyun.com/zh/model-studio/model-pricing
- i豆政策与单价(2 毛/豆、大促赠 3000)、会员分档:https://waimao.host/t/topic/354 · https://zhuanlan.zhihu.com/p/1948479338086393454
- 免费会员 vs 付费会员(出口通/金品诚企/行业领袖):https://supplier.alibaba.com/activity/new-member/PX002CQ5L.htm

**图片比例**
- qwen-image / wan 文生图 size 与固定档:https://help.aliyun.com/zh/model-studio/text-to-image · https://help.aliyun.com/zh/model-studio/qwen-image-api

**图片改尺寸 / 扩图**
- 图像画面扩展 image-out-painting(x_scale/y_scale/offset/output_ratio,¥0.18/张,仅北京):https://help.aliyun.com/zh/model-studio/image-expansion
- 万相通用图像编辑 expand:https://help.aliyun.com/zh/model-studio/wanx-image-edit-api-reference

> 标注「推断」项:基础版/进阶版↔模型档位映射、i豆↔DashScope 计费换算、比例↔像素换算与前端产 mask 交互、图片改尺寸倾向 outpainting —— 均为基于百炼/VIAPI 公开能力的合理推断,无独立官方文档直接确认;其余均有官方文档佐证。
