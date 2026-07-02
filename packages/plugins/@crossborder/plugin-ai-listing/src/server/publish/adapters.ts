/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// 发布适配器层（PRD §8.4）。把目标平台 payload 发布到平台并归一化结果。
// 适配器只负责“发布调用 + 归一化结果”，不写库、不依赖 ctx，便于替换为真实实现。
//
// ⚠️ 本阶段（Phase 8）只做 mock：REAL_PUBLISH_ENABLED=false，真实平台发布只保留接口、绝不启用。
// 真实接入（Product V2 / 各平台 OpenAPI）需先满足店铺授权 + 幂等 + 限速 + IP 白名单，再打开开关。

export const REAL_PUBLISH_ENABLED = false;

// 目标平台标准化 payload（PRD §8.4）。
export interface PublishVariant {
  sku?: string;
  price?: number;
  stock?: number;
  spec?: string;
  // 结构化销售属性（颜色/尺寸等，来自抓取的 specAttrs），真实平台发布 SKU 需要。
  attrs?: Array<{ name: string; value: string }>;
  imageUrl?: string;
}

export interface PublishPayload {
  storeId?: number;
  categoryId?: string;
  title?: string;
  description?: string;
  price?: number;
  stock?: number;
  images: string[];
  variants: PublishVariant[];
  attributes: Record<string, unknown>;
  shippingTemplateId?: string;
  // 真实平台发布补充信息：定价币种（非 USD 平台自动换算）、关键词、起订量、售卖单位。
  currency?: string;
  keywords?: string;
  moq?: number;
  unit?: string;
  // 商品主视频源 URL（发布后经视频银行上传并绑定为主图视频）。
  videoUrl?: string;
}

export interface PublishResult {
  targetProductId: string;
  targetUrl: string;
  // 只保留平台响应摘要（状态码/requestId/错误码），不落完整响应体（§7.9 脱敏）。
  responseSummary: Record<string, unknown>;
}

// 发布适配器统一错误：带错误码与是否可重试。
export class PublishAdapterError extends Error {
  code: string;
  retryable: boolean;
  constructor(code: string, message: string, retryable = true) {
    super(message);
    this.name = 'PublishAdapterError';
    this.code = code;
    this.retryable = retryable;
  }
}

export interface PublishAdapter {
  name: string;
  platform: string;
  publish(payload: PublishPayload): Promise<PublishResult>;
  // 发布为草稿（人工审核后上架）。真实连接器实现时走平台草稿接口；mock 生成草稿样式的假结果。
  publishDraft?(payload: PublishPayload): Promise<PublishResult>;
}

// 各平台 mock 适配器：生成稳定结构的发布结果，便于联调与后续无缝替换为真实实现。
function makeMockAdapter(platform: string, host: string): PublishAdapter {
  return {
    name: `${platform.toLowerCase()}-mock`,
    platform,
    async publish(payload) {
      if (REAL_PUBLISH_ENABLED) {
        // 占位：真实实现走此分支（OAuth + 平台 OpenAPI + 幂等 + 限速）。当前永不进入。
        throw new PublishAdapterError('REAL_PUBLISH_DISABLED', '真实平台发布未启用（仅模拟发布）', false);
      }
      // mock：不调用真实平台，按 storeId + 标题哈希生成确定性目标商品 ID。
      const seed = `${payload.storeId || 0}-${(payload.title || '').length}-${payload.price ?? 0}`;
      const targetProductId = `${platform.toUpperCase()}-${seed.replace(/[^a-zA-Z0-9]/g, '')}`;
      return {
        targetProductId,
        targetUrl: `https://www.${host}/item/${targetProductId}.html`,
        responseSummary: { ok: true, platform, platformRequestId: `mock-${targetProductId}`, mock: true },
      };
    },
    async publishDraft(payload) {
      const res = await this.publish(payload);
      return {
        ...res,
        targetUrl: `https://seller.${host}/drafts/${res.targetProductId}`,
        responseSummary: { ...res.responseSummary, draft: true },
      };
    },
  };
}

const ADAPTERS: Record<string, PublishAdapter> = {
  // Alibaba.com（1688 国际站）：已有真实连接器（platforms/alibaba-icbu），真接入开关开且店铺已授权时
  // 由 real-publish.ts 解析为真实 adapter；这里的 mock 仅作开关关/未授权时的兜底与联调。
  'Alibaba.com': makeMockAdapter('Alibaba.com', 'alibaba.com'),
  Lazada: makeMockAdapter('Lazada', 'lazada.com'),
  Shopee: makeMockAdapter('Shopee', 'shopee.com'),
  Temu: makeMockAdapter('Temu', 'temu.com'),
  TikTokShop: makeMockAdapter('TikTokShop', 'tiktok.com'),
};

// 支持的目标平台（供前端发布配置下拉）。
export const SUPPORTED_PLATFORMS = Object.keys(ADAPTERS);

// 按目标平台选择发布适配器；未知平台回退 Lazada mock 并在调用方告警。
export function resolvePublishAdapter(platform?: string): PublishAdapter {
  if (platform && ADAPTERS[platform]) return ADAPTERS[platform];
  return ADAPTERS.Lazada;
}

// 发布前生成目标平台 payload（PRD §8.4）。媒体只取图片 URL，变体取 SKU 目标价/库存 + 结构化销售属性。
export function buildPublishPayload(
  product: Record<string, any>,
  skus: Array<Record<string, any>>,
  images: string[],
  config: { targetStoreId?: number; categoryTargetId?: string; shippingTemplateId?: string },
): PublishPayload {
  return {
    storeId: config.targetStoreId,
    categoryId: config.categoryTargetId || product.categoryTargetId,
    title: product.titleFinal || product.titleProcessed,
    description: product.descriptionFinal || product.descriptionProcessed,
    price: product.priceTarget != null ? Number(product.priceTarget) : undefined,
    stock: product.stock != null ? Number(product.stock) : undefined,
    images,
    variants: skus.map((s) => ({
      sku: s.sku,
      price: s.priceTarget != null ? Number(s.priceTarget) : undefined,
      stock: s.stock != null ? Number(s.stock) : undefined,
      spec: s.specValue,
      attrs: Array.isArray(s.specAttrs)
        ? s.specAttrs
            .filter((a: any) => a && a.name && a.value)
            .map((a: any) => ({ name: String(a.name), value: String(a.value) }))
        : undefined,
      imageUrl: s.imageUrl || undefined,
    })),
    attributes: (product.attributesProcessed || {}) as Record<string, unknown>,
    shippingTemplateId: config.shippingTemplateId,
    currency: product.currencyOriginal || undefined,
    moq: product.moq != null ? Number(product.moq) : undefined,
    unit: skus.find((s) => s.unit)?.unit || undefined,
  };
}
