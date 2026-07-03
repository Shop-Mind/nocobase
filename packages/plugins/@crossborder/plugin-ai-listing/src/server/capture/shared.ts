/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import {
  AdapterError,
  resolveAdapter,
  type CaptureAdapter,
  type CaptureOptions,
  type NormalizedProduct,
} from '../adapters';

// 统一失败信封（PRD §7.5）。
export function fail(code: string, message: string, recoverable: boolean, traceId: string, data?: unknown) {
  return { ok: false, data, warnings: [], errors: [{ code, message, recoverable }], traceId };
}

export function isValidHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export interface CaptureRepos {
  Tasks: ReturnType<any>;
  Steps: ReturnType<any>;
  Products: ReturnType<any>;
  Skus: ReturnType<any>;
  Media: ReturnType<any>;
}

// 获取抓取相关 repository 集合。
export function getRepos(db: any): CaptureRepos {
  return {
    Tasks: db.getRepository('aiListingCaptureTasks'),
    Steps: db.getRepository('aiListingTaskSteps'),
    Products: db.getRepository('aiListingProducts'),
    Skus: db.getRepository('aiListingSkus'),
    Media: db.getRepository('aiListingMediaAssets'),
  };
}

// 把归一化商品写成草稿（+ SKU + 媒体），返回 productId。各抓取方式（url/store/keyword/batch）共用。
export async function createProductDraft(repos: CaptureRepos, normalized: NormalizedProduct): Promise<number> {
  const product = await repos.Products.create({
    values: {
      sourcePlatform: normalized.sourcePlatform,
      sourceUrl: normalized.sourceUrl,
      sourceProductId: normalized.sourceProductId,
      titleOriginal: normalized.titleOriginal,
      descriptionOriginal: normalized.descriptionOriginal,
      descriptionHtmlOriginal: normalized.descriptionHtmlOriginal,
      priceOriginal: normalized.priceOriginal,
      currencyOriginal: normalized.currencyOriginal,
      stock: normalized.stock,
      categoryOriginal: normalized.categoryOriginal,
      categoryOriginalId: normalized.categoryOriginalId,
      attributesOriginal: normalized.attributesOriginal || {},
      moq: normalized.moq,
      statusOriginal: normalized.statusOriginal,
      shopInfo: normalized.shopInfo || null,
      tradeInfo: normalized.tradeInfo || null,
      certifications: normalized.certifications || null,
      status: 'captured',
      reviewStatus: 'pending',
    },
  });
  const productId = product.get('id');
  for (const s of normalized.skus || []) {
    await repos.Skus.create({
      values: {
        productId,
        sku: s.sku,
        specName: s.specName,
        specValue: s.specValue,
        specAttrs: s.specAttrs ?? null,
        imageUrl: s.imageUrl,
        unit: s.unit,
        priceOriginal: s.priceOriginal,
        ladderPrice: s.ladderPrice ?? null,
        stock: s.stock,
        status: 'active',
      },
    });
  }
  for (const m of normalized.media || []) {
    await repos.Media.create({
      values: {
        productId,
        assetType: m.assetType,
        sourceUrl: m.sourceUrl,
        role: m.role,
        sort: m.sort,
        processStatus: 'pending',
      },
    });
  }
  return productId;
}

export interface CaptureItemResult {
  url: string;
  ok: boolean;
  productId?: number;
  errorCode?: string;
  errorMessage?: string;
  retryable?: boolean;
}

// 单条 URL 抓取到草稿：取数（OpenAPI 优先 / Crawl4AI 兜底）→ 建草稿。失败抛出标准化结果，不写步骤（由调用方写步骤）。
// adapter 由调用方传入（通常来自 resolveCaptureAdapter，真接入开关开则走平台真实抓取）；不传则回退 mock resolveAdapter。
export async function captureOneToDraft(
  repos: CaptureRepos,
  url: string,
  options?: CaptureOptions,
  adapterOverride?: CaptureAdapter,
): Promise<CaptureItemResult> {
  if (!isValidHttpUrl(url)) {
    return { url, ok: false, errorCode: 'INVALID_URL', errorMessage: '链接无效（需 http/https）', retryable: false };
  }
  const adapter = adapterOverride ?? resolveAdapter(url);
  try {
    const normalized = await adapter.fetchProductByUrl(url, options);
    const productId = await createProductDraft(repos, normalized);
    return { url, ok: true, productId };
  } catch (e) {
    const errorCode = e instanceof AdapterError ? e.code : 'CAPTURE_FAILED';
    const retryable = e instanceof AdapterError ? e.retryable : true;
    return { url, ok: false, errorCode, errorMessage: (e as Error)?.message || '抓取失败', retryable };
  }
}
