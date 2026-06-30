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
export interface PublishPayload {
  storeId?: number;
  categoryId?: string;
  title?: string;
  description?: string;
  price?: number;
  stock?: number;
  images: string[];
  variants: Array<{ sku?: string; price?: number; stock?: number; spec?: string }>;
  attributes: Record<string, unknown>;
  shippingTemplateId?: string;
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
  };
}

const ADAPTERS: Record<string, PublishAdapter> = {
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

// 发布前生成目标平台 payload（PRD §8.4）。媒体只取图片 URL，变体取 SKU 目标价/库存。
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
    })),
    attributes: (product.attributesProcessed || {}) as Record<string, unknown>,
    shippingTemplateId: config.shippingTemplateId,
  };
}
