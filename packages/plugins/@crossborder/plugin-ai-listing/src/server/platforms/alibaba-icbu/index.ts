/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// Alibaba.com（1688 国际站 / ICBU）连接器。IOP 家族，走 openapi/ 传输层。
// OAuth 三方法 delegate 到 openapi/oauth（已真机验证）。fetchProduct 用 /alibaba/icbu/product/get/v2 拉真实商品。

import { parseAlibabaProductId } from '../../adapters';
import { callIop, callIopUpload } from '../../openapi/iop-client';
import { friendlyMessage, OpenApiError } from '../../openapi/errors';
import { buildAuthorizeUrl, exchangeCode, getIopConfig, refreshAccessToken } from '../../openapi/oauth';
import { PlatformConnector } from '../types';
import {
  applyInventoryToSkus,
  mapBuyerCertificates,
  mapBuyerInventory,
  mapBuyerKeyAttributes,
  toNormalizedFromBuyerDescription,
} from './mappers';
import { toIcbuListingRequest, type CategorySaleAttr } from './publish-mappers';
import { buildDraftXml, type PhotobankImage } from './schema-draft';

// 拉类目销售属性定义（发布前对齐 SKU 维度用）。读接口幂等，偶发 ServiceTimeout 自动重试。
async function fetchCategorySaleAttrs(
  cfg: ReturnType<typeof getIopConfig>,
  accessToken: string,
  categoryId: string,
): Promise<CategorySaleAttr[]> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 1200));
    try {
      const json = await callIop(cfg, {
        apiPath: '/alibaba/icbu/category/attribute/get/v2',
        httpMethod: 'POST',
        params: { category_id: Number(categoryId) },
        accessToken,
        timeoutMs: 45000,
      });
      const data = ((json.data ?? (json.result as Record<string, unknown>)?.data) as Record<string, unknown>) || {};
      const sale = (data.sale_attributes as Array<Record<string, unknown>>) || [];
      return sale
        .filter((a) => a && a.attribute_name)
        .map((a) => ({
          attributeId: a.attribute_id != null ? Number(a.attribute_id) : undefined,
          attributeName: String(a.attribute_name),
          required: Boolean(a.required),
          supportCustomValue: Boolean(a.support_custom_value),
        }));
    } catch (e) {
      lastError = e;
      if (!(e instanceof OpenApiError) || !e.retryable) throw e;
    }
  }
  throw lastError;
}

// 发布/草稿接口的业务错误藏在嵌套 result 里（result.success=false + msg_code 形如
// `isp.system-service-error:PUB_BIZCHECK_CAT_PUB_RESTRICT;`），网关层 assertIopOk 不感知——
// 这里解析出真实错误码并抛 OpenApiError（friendlyMessage 字典给运营中文原因与处理建议）。
// 真机踩坑：曾因漏解析把「类目不在经营范围」报成含糊的「平台未返回草稿商品 ID」。
function assertPublishResultOk(json: Record<string, unknown>): Record<string, unknown> {
  const result = (json.result as Record<string, unknown>) || {};
  if (result.success === false) {
    const rawCode = String(result.msg_code || '');
    const code = (rawCode.match(/[A-Z][A-Z0-9_]{3,}/g) || []).pop() || rawCode || 'PUBLISH_PLATFORM_ERROR';
    const friendly = friendlyMessage(code);
    throw new OpenApiError(code, friendly?.userMessage || String(result.message_info || '平台返回发布失败'), {
      retryable: friendly?.retryable ?? false,
      traceId: (result.trace_id || json.request_id) as string | undefined,
    });
  }
  return result;
}

// 单图上限 5MB（photobank.upload 限制）。
const PHOTOBANK_MAX_BYTES = 5 * 1024 * 1024;

// 把源站图片搬进卖家自己的图片银行：平台发布不接受外链图（即使是 alicdn，属别家卖家资产），
// 必须先经 photobank.upload 落自己图片银行，再用返回的 photobank_url 发布。
// 逐张处理：拉源图字节 → 上传 → 换 URL；单张失败保留原 URL 并记 notes（不阻断整单发布）。
async function uploadImagesToPhotobank(
  cfg: ReturnType<typeof getIopConfig>,
  accessToken: string,
  urls: string[],
  notes: string[],
  label = '主图',
): Promise<PhotobankImage[]> {
  const out: PhotobankImage[] = [];
  const failed: string[] = [];
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!resp.ok) throw new Error(`源图下载失败 HTTP ${resp.status}`);
      const buf = new Uint8Array(await resp.arrayBuffer());
      if (buf.byteLength > PHOTOBANK_MAX_BYTES) throw new Error('源图超过 5MB 上限');
      const ext = (url.match(/\.(jpe?g|png|webp)(?:_|$|\?)/i)?.[1] || 'jpg').toLowerCase();
      const fileName = `ai-listing-${Date.now()}-${i}.${ext === 'webp' ? 'jpg' : ext}`;
      const json = await callIopUpload(cfg, {
        apiPath: '/alibaba/icbu/photobank/upload',
        params: { file_name: fileName },
        accessToken,
        timeoutMs: 60000,
        file: { field: 'image_bytes', fileName, data: buf, contentType: ext === 'png' ? 'image/png' : 'image/jpeg' },
      });
      const result = (json.result as Record<string, unknown>) || {};
      const obj = ((result.response_object ?? json.response_object) as Record<string, unknown>) || {};
      const photobankUrl = (obj.photobank_url ?? result.photobank_url) as string | undefined;
      if (!photobankUrl) throw new Error(String(obj.error_msg || result.error_msg || '图片银行未返回 URL'));
      const fileId = obj.file_id ?? result.file_id;
      out.push({ url: photobankUrl, fileId: fileId != null ? String(fileId) : undefined });
    } catch (e) {
      failed.push(`第${i + 1}张（${(e as Error)?.message || e}）`);
      out.push({ url });
    }
  }
  if (failed.length) {
    notes.push(`${failed.length} 张${label}搬入图片银行失败，保留源链接（平台可能不展示）：${failed.join('；')}`);
  } else if (urls.length) {
    notes.push(`${urls.length} 张${label}已搬入图片银行`);
  }
  return out;
}

// 抓取到的视频常是 play.video.alibaba.com 播放页（302 跳 CDN 直链），video/upload 需要直链——先本地解析终链。
async function resolveDirectVideoUrl(videoUrl: string): Promise<string> {
  try {
    const head = await fetch(videoUrl, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(15000) });
    if (head.url) return head.url.replace(/^http:/, 'https:');
  } catch {
    // 解析失败就按原链接上传，交由平台侧兜底
  }
  return videoUrl;
}

// 视频银行上传（按 URL，无需传字节）：video/upload(video_path) → 异步 QUEUE 时按 req_id 轮询
// upload/result → COMPLETE 返回 video_id（草稿走 imageVideo 字段、正式发布走 relation 绑定）。
// ⚠️ Video 接口组需在开放平台控制台单独申请权限；开通后如仍统一报 10000002 illegal param，
// 是店铺侧视频银行/授权未就绪（重新授权店铺或在 myAlibaba 打开一次媒体中心后恢复）。
// 全程 best-effort：任何失败只记 notes，不阻断发布/草稿。
async function uploadVideoToBank(
  cfg: ReturnType<typeof getIopConfig>,
  accessToken: string,
  videoUrl: string,
  videoName: string,
  notes: string[],
): Promise<string | undefined> {
  try {
    const directUrl = await resolveDirectVideoUrl(videoUrl);
    const up = await callIop(cfg, {
      apiPath: '/alibaba/icbu/video/upload',
      httpMethod: 'POST',
      params: { video_path: directUrl, video_name: videoName.slice(0, 50) || 'product-video' },
      accessToken,
      timeoutMs: 60000,
    });
    let model = ((up.result as Record<string, unknown>)?.model ?? up.model ?? {}) as Record<string, unknown>;
    for (let i = 0; i < 12 && model.req_code === 'QUEUE'; i++) {
      await new Promise((resolve) => setTimeout(resolve, 4000));
      const res = await callIop(cfg, {
        apiPath: '/alibaba/icbu/video/upload/result',
        httpMethod: 'POST',
        params: { req_id: model.req_id },
        accessToken,
        timeoutMs: 30000,
      });
      model = ((res.result as Record<string, unknown>)?.model ?? res.model ?? {}) as Record<string, unknown>;
    }
    if (model.req_code === 'COMPLETE' && model.video_id) {
      notes.push('主图视频已上传视频银行');
      return String(model.video_id);
    }
    if (model.req_code === 'QUEUE') {
      notes.push('主图视频仍在平台转码队列（约 1 分钟内未完成），请稍后在编辑页确认或手动绑定');
    } else {
      notes.push(`主图视频上传失败（${model.req_code || '未知状态'}），请在编辑页手动上传`);
    }
  } catch (e) {
    const code = e instanceof OpenApiError ? e.code : '';
    notes.push(
      code === 'InsufficientPermission'
        ? '主图视频未上传：App 尚未开通 Video 接口组权限，请到开放平台控制台 API Permission 申请后自动生效'
        : `主图视频上传失败（${(e as Error)?.message || e}），请在编辑页手动上传`,
    );
  }
  return undefined;
}

// 正式发布路径：上传视频银行后用 relation/product/main 绑定为商品主视频。
async function uploadAndBindVideo(
  cfg: ReturnType<typeof getIopConfig>,
  accessToken: string,
  videoUrl: string,
  videoName: string,
  productId: string,
  notes: string[],
): Promise<void> {
  const videoId = await uploadVideoToBank(cfg, accessToken, videoUrl, videoName, notes);
  if (!videoId) return;
  try {
    await callIop(cfg, {
      apiPath: '/alibaba/icbu/video/relation/product/main',
      httpMethod: 'POST',
      params: { video_id: Number(videoId), product_id: Number(productId) },
      accessToken,
      timeoutMs: 30000,
    });
    notes.push('主图视频已绑定商品');
  } catch (e) {
    notes.push(`主图视频已上传但绑定失败（${(e as Error)?.message || e}），请在编辑页手动关联`);
  }
}

export const alibabaIcbuConnector: PlatformConnector = {
  id: 'alibaba-icbu',
  label: 'Alibaba.com（1688 国际站）',
  family: 'iop',
  capabilities: ['oauth', 'capture', 'publish', 'status'],

  buildAuthorizeUrl,
  exchangeCode,
  refresh: refreshAccessToken,

  // 抓取（搬运他人商品）：从链接/ID 解析 product_id → /eco/buyer/product/description（买家选品接口，GET）→ 归一化。
  // 按抓取选项补充调用 keyattributes（关键属性）/ inventory（实时库存）/ cert（证书）——每个都是独立 GET，
  // 单项失败只记入 captureWarnings、不影响主详情落库。店铺信息（supplier/eCompanyId）已含在 description 响应里。
  // 注意：product/get/v2 只查“自己店铺”的商品，搬运别家须走 buyer 组。accessToken 由上层解析好传入；
  // 网关错误（AppWhiteIpLimit / InsufficientPermission / PRODUCT_NOT_FOUND 等）以 OpenApiError 抛出。
  async fetchProduct(accessToken, ref, options) {
    const productId = ref.productId || (ref.url ? parseAlibabaProductId(ref.url) : undefined);
    if (!productId) {
      throw new OpenApiError('PRODUCT_ID_NOT_FOUND', '无法从链接解析 Alibaba 商品 ID，请检查是否为商品详情页链接');
    }
    const cfg = getIopConfig();
    const pid = Number(productId);
    // 语言/币种与源页展示对齐（默认中文 + 人民币，标题/描述语言与价格币种随之）。
    const language = options?.language || 'zh-CN';
    const currency = options?.currency || 'CNY';
    const country = language.startsWith('zh') ? 'CN' : 'US';
    const json = await callIop(cfg, {
      apiPath: '/eco/buyer/product/description',
      httpMethod: 'GET',
      params: { query_req: { product_id: pid, language, currency } },
      accessToken,
    });
    const normalized = toNormalizedFromBuyerDescription(json, ref.url, productId);

    // 缺省（未传 fields）全抓（评论除外，需显式勾选），与 CaptureOptions 约定一致。
    const wants = (key: string) => !options?.fields || options.fields.includes(key);
    const warnings: string[] = [];

    if (wants('attributes')) {
      try {
        const attrJson = await callIop(cfg, {
          apiPath: '/eco/buyer/product/keyattributes',
          httpMethod: 'GET',
          params: { query_req: { product_id: pid, country } },
          accessToken,
        });
        const attrs = mapBuyerKeyAttributes(attrJson);
        if (Object.keys(attrs).length) normalized.attributesOriginal = attrs;
      } catch (e) {
        warnings.push(`关键属性获取失败：${(e as Error)?.message || e}`);
      }
    }

    if (wants('inventory')) {
      try {
        const invJson = await callIop(cfg, {
          apiPath: '/eco/buyer/product/inventory',
          httpMethod: 'GET',
          params: { inv_req: { product_id: pid, shipping_from: 'CN' } },
          accessToken,
        });
        const inventory = mapBuyerInventory(invJson);
        if (inventory.total > 0 || Object.keys(inventory.bySkuId).length) {
          applyInventoryToSkus(normalized.skus || [], inventory);
          normalized.stock = inventory.total;
        }
      } catch (e) {
        warnings.push(`实时库存获取失败：${(e as Error)?.message || e}`);
      }
    }

    if (wants('cert')) {
      try {
        const certJson = await callIop(cfg, {
          apiPath: '/eco/buyer/product/cert',
          httpMethod: 'GET',
          params: { req: { product_id: pid } },
          accessToken,
        });
        const certs = mapBuyerCertificates(certJson);
        if (certs.length) normalized.certifications = certs;
      } catch (e) {
        warnings.push(`证书获取失败：${(e as Error)?.message || e}`);
      }
    }

    // 评论：Alibaba 买家 OpenAPI 没有产品评价/店铺评价接口（06-buyer-product 全组核对过），
    // 勾选时给出明确告警而非静默忽略；真实抓取需接入独立爬虫 worker 后由其填充。
    if (options?.fields?.includes('productReviews')) {
      warnings.push('产品评价：Alibaba OpenAPI 未提供评论接口，本次未抓取（需接入爬虫服务后支持）');
    }
    if (options?.fields?.includes('shopReviews')) {
      warnings.push('店铺评价：Alibaba OpenAPI 未提供店铺评分/评价接口，本次未抓取（需接入爬虫服务后支持）');
    }

    if (warnings.length) normalized.captureWarnings = warnings;
    return normalized;
  },

  // 发布（Phase F）：标准化 payload → listing/v2 请求（product_info 与 ai_optimization_config 两个顶层参数）。
  // 有类目且有 SKU 时先拉类目销售属性做维度对齐（对不上的维度剔除、组合去重），对齐说明随结果回传。
  // 成功返回平台商品 ID；商品先进平台审核（pending/draft），用 queryStatus 跟踪是否 online。
  async publish(accessToken, payload) {
    const cfg = getIopConfig();
    let saleAttrs: CategorySaleAttr[] | undefined;
    const notes: string[] = [];
    if (payload.categoryId && (payload.variants || []).some((v) => v.attrs?.length)) {
      try {
        saleAttrs = await fetchCategorySaleAttrs(cfg, accessToken, String(payload.categoryId));
      } catch (e) {
        notes.push(`类目销售属性获取失败（${(e as Error)?.message || e}），SKU 维度未对齐类目定义直接提交`);
      }
    }
    const mainImages = await uploadImagesToPhotobank(cfg, accessToken, (payload.images || []).slice(0, 6), notes);
    // 详情图（主图之外的图片）也搬图片银行，并内嵌进描述——详情要求图片必须来自图片银行。
    const detailImages = await uploadImagesToPhotobank(
      cfg,
      accessToken,
      (payload.images || []).slice(6, 21),
      notes,
      '详情图',
    );
    const descriptionWithImages = [payload.description || '', ...detailImages.map((d) => `<img src="${d.url}"/>`)]
      .filter(Boolean)
      .join('\n');
    const req = toIcbuListingRequest(
      { ...payload, images: mainImages.map((m) => m.url), description: descriptionWithImages },
      saleAttrs,
    );
    notes.push(...req.notes);
    const json = await callIop(cfg, {
      apiPath: '/alibaba/icbu/product/listing/v2',
      httpMethod: 'POST',
      params: { product_info: req.product_info, ai_optimization_config: req.ai_optimization_config },
      accessToken,
      timeoutMs: 60000,
    });
    const result = assertPublishResultOk(json);
    const targetProductId = result.data ?? json.data;
    if (targetProductId == null || targetProductId === '') {
      throw new OpenApiError('PUBLISH_NO_PRODUCT_ID', '平台发布成功但未返回商品 ID，请到卖家后台确认', {
        traceId: (json.trace_id || json.request_id) as string | undefined,
      });
    }
    if (payload.videoUrl) {
      await uploadAndBindVideo(
        cfg,
        accessToken,
        payload.videoUrl,
        payload.title || 'product-video',
        String(targetProductId),
        notes,
      );
    }
    return {
      targetProductId: String(targetProductId),
      // Alibaba.com 商品详情 URL 只认结尾数字 ID，slug 任意；新发商品在平台审核通过并上架前该链接可能暂 404。
      targetUrl: `https://www.alibaba.com/product-detail/item_${targetProductId}.html`,
      responseSummary: {
        platform: 'Alibaba.com',
        success: json.success !== false,
        traceId: (json.trace_id || json.request_id) as string | undefined,
        notes: notes.length ? notes : undefined,
      },
    };
  },

  // 草稿发布（默认策略，schema 引擎）：photobank 上传主图/详情图 →（有视频则先上传视频银行拿 video_id）→
  // schema/get 取类目规则 → buildDraftXml（官方接入文档格式：complex-value 包装 + 结构化详描
  // detailImage/textDesc + fileId 主图 + 色卡 + imageVideo）→ schema/add/draft 创建草稿。
  // 草稿不上架、不触发平台审核，人工在编辑页确认后提交。
  // 对比 listing/v2 引擎：schema 能带结构化详描（listing/v2 的 description 平台侧必丢）；
  // 代价是标题/描述保持中文（编辑页有一键翻译/优化）、价格按估算汇率折 USD。
  async publishDraft(accessToken, payload) {
    if (!payload.categoryId) {
      throw new OpenApiError('PUBLISH_CATEGORY_REQUIRED', '草稿发布需要目标类目：请先为商品设置或 AI 预测类目');
    }
    const cfg = getIopConfig();
    const notes: string[] = [];
    const mainImages = await uploadImagesToPhotobank(cfg, accessToken, (payload.images || []).slice(0, 6), notes);
    const detailImages = await uploadImagesToPhotobank(
      cfg,
      accessToken,
      (payload.images || []).slice(6, 21),
      notes,
      '详情图',
    );
    if ((payload.images || []).length > 21) {
      notes.push(
        `共 ${payload.images.length} 张图，超出主图 6 + 详情图 15 的携带上限，其余 ${
          payload.images.length - 21
        } 张未带入`,
      );
    }

    // 取类目发布规则 XML（读接口，偶发 ServiceTimeout 自动重试）。
    let schemaXml: string | undefined;
    let lastError: unknown;
    for (let attempt = 0; attempt < 3 && !schemaXml; attempt++) {
      if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 1200));
      try {
        const json = await callIop(cfg, {
          apiPath: '/alibaba/icbu/product/schema/get',
          httpMethod: 'POST',
          params: { cat_id: Number(payload.categoryId), language: 'en_US' },
          accessToken,
          timeoutMs: 60000,
        });
        const data = json.data ?? (json.result as Record<string, unknown>)?.data;
        if (typeof data === 'string' && data.includes('<itemSchema')) schemaXml = data;
        else throw new OpenApiError('SCHEMA_GET_BAD_RESPONSE', '平台未返回类目发布规则');
      } catch (e) {
        lastError = e;
        if (!(e instanceof OpenApiError) || !e.retryable) throw e;
      }
    }
    if (!schemaXml) throw lastError;

    // 视频先上传视频银行拿 video_id，随草稿 XML 的 imageVideo 字段一并写入（草稿池商品 relation 接口不适用）。
    const videoId = payload.videoUrl
      ? await uploadVideoToBank(cfg, accessToken, payload.videoUrl, payload.title || 'product-video', notes)
      : undefined;

    const built = buildDraftXml(payload, schemaXml, {
      mainImages,
      detailImages: detailImages.map((d) => d.url),
      videoId,
    });
    notes.push(...built.notes);
    const json = await callIop(cfg, {
      apiPath: '/icbu/product/schema/add/draft',
      httpMethod: 'POST',
      params: {
        param_product_top_publish_request: { cat_id: Number(payload.categoryId), xml: built.xml, language: 'en_US' },
      },
      accessToken,
      timeoutMs: 60000,
    });
    const result = assertPublishResultOk(json);
    const draftId = result.product_id ?? json.product_id;
    if (draftId == null || draftId === '') {
      throw new OpenApiError('PUBLISH_NO_PRODUCT_ID', '平台未返回草稿商品 ID', {
        traceId: (result.trace_id || json.request_id) as string | undefined,
      });
    }
    notes.push('标题保持中文，编辑页可一键翻译/优化；必填属性「风格」等请人工确认后提交上架');
    return {
      targetProductId: String(draftId),
      // 每个草稿都有独立编辑页（pubAction=draft）。
      targetUrl: `https://post.alibaba.com/product/publish.htm?itemId=${draftId}&pubAction=draft`,
      responseSummary: {
        platform: 'Alibaba.com',
        draft: true,
        draftPath: '点开链接直达该草稿编辑页（或：卖家后台 → 商品管理列表 → 对应商品「编辑」）',
        success: true,
        traceId: (result.trace_id || json.request_id) as string | undefined,
        notes,
      },
    };
  },

  // 查询发布状态：online（已上架）/ draft（草稿）/ failed（发布失败）/ pending（平台审核中）。
  // ⚠️ listing/v2 返回商品 ID 只代表「提交成功」，平台随后异步 bizcheck，真正成败以本接口为准；
  // failed 时 status_desc 带具体原因（如 PUB_BIZCHECK_DESCRIPTION_IS_REQUIRED）。
  async queryStatus(accessToken, targetProductId) {
    const cfg = getIopConfig();
    const json = await callIop(cfg, {
      apiPath: '/alibaba/icbu/product/status/get/v2',
      httpMethod: 'POST',
      params: { product_id: Number(targetProductId) },
      accessToken,
      timeoutMs: 45000,
    });
    // 实测响应嵌套为 { result: { data: { status, status_desc } } }（文档写的是 data.*）。
    const result = (json.result as Record<string, unknown>) || {};
    const data = ((result.data ?? json.data) as Record<string, unknown>) || {};
    const status = String(data.status || '').toLowerCase();
    const description = (data.status_desc as string) || undefined;
    if (status === 'online' || status === 'draft' || status === 'failed' || status === 'pending') {
      return { status, description };
    }
    throw new OpenApiError('PUBLISH_STATUS_UNKNOWN', `平台返回未知发布状态：${status || '(空)'}`);
  },

  // 类目预测：标题（+描述/主图）→ /alibaba/icbu/category/predict/v2 → Alibaba.com 叶子类目。
  // 用于「发布类目与源商品对齐」：抓取只有源站类目文案，目标平台类目 ID 靠这里预测。
  // 实测：带 image 时平台图像识别链路高概率 ServiceTimeout（内部 RPC 超时），纯标题很稳。
  // 策略：第 1 次带图（预测更准），失败则降级纯标题再试 2 次；读操作幂等，重试安全。
  async predictCategory(accessToken, input) {
    const cfg = getIopConfig();
    let json: Record<string, unknown> | undefined;
    let lastError: unknown;
    for (let attempt = 0; attempt < 3 && !json; attempt++) {
      if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 1200));
      try {
        json = await callIop(cfg, {
          apiPath: '/alibaba/icbu/category/predict/v2',
          httpMethod: 'POST',
          params: {
            title: input.title,
            description: input.description || undefined,
            image: attempt === 0 ? input.imageUrl || undefined : undefined,
          },
          accessToken,
          timeoutMs: 45000,
        });
      } catch (e) {
        lastError = e;
        if (!(e instanceof OpenApiError) || !e.retryable) throw e;
      }
    }
    if (!json) throw lastError;
    // 响应兼容两种嵌套：{ result: { data: {...} } } 或 { data: {...} }。
    const result = (json.result as Record<string, unknown>) || {};
    const data = ((result.data ?? json.data) as Record<string, unknown>) || {};
    const categoryId = data.category_id ?? data.categoryId;
    if (categoryId == null || categoryId === '') {
      throw new OpenApiError('CATEGORY_PREDICT_EMPTY', '平台未能预测出类目，请手动选择发布类目');
    }
    return {
      categoryId: String(categoryId),
      categoryName: (data.category_name ?? data.categoryName) as string | undefined,
      categoryPath: (data.category_path ?? data.categoryPath) as string | undefined,
    };
  },
};
