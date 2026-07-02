/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// 抓取适配器层：把不同来源（Alibaba OpenAPI 优先、Crawl4AI 兜底）统一成 NormalizedProduct。
// 适配器只负责“取数 + 归一化”，不写库、不依赖 NocoBase ctx，便于单测与替换为真实实现。

// 阶梯价一档：min_quantity 起、max_quantity 止（-1 = 无上限）、单价 + 币种。搬运须保留完整阶梯，不能拍平成单价。
export interface NormalizedLadderTier {
  minQuantity?: number;
  maxQuantity?: number;
  price: number;
  currency?: string;
}

// SKU 销售属性一项（结构化）：属性名 / 值 / 值配图（色卡）。用于按维度（颜色/尺寸）做源站同款展示。
export interface NormalizedSkuAttr {
  name: string;
  value: string;
  image?: string;
}

export interface NormalizedSku {
  sku?: string;
  specName?: string;
  specValue?: string;
  specAttrs?: NormalizedSkuAttr[];
  imageUrl?: string;
  // 展示基准价：起订档（最小起订量那一档）单价，而非阶梯最低价。完整阶梯见 ladderPrice。
  priceOriginal?: number;
  ladderPrice?: NormalizedLadderTier[];
  unit?: string;
  stock?: number;
}

export interface NormalizedMedia {
  assetType: 'image' | 'video';
  sourceUrl: string;
  role?: 'main' | 'detail' | 'sku' | 'video';
  sort?: number;
}

// 供应商/店铺信息（来自 buyer description 响应的 supplier / eCompanyId，买家侧无独立店铺接口）。
export interface NormalizedShopInfo {
  supplierName?: string;
  companyId?: string;
}

// 商品证书（/eco/buyer/product/cert）。
export interface NormalizedCertificate {
  certName?: string;
  certNo?: string;
  certUrls?: string[];
}

export interface NormalizedProduct {
  sourcePlatform: string;
  sourceProductId?: string;
  sourceUrl: string;
  titleOriginal: string;
  descriptionOriginal?: string;
  // 装修 HTML 原文（descriptionOriginal 是清洗后的纯文本）。发布到自有店铺 / 富文本预览需要原始 HTML。
  descriptionHtmlOriginal?: string;
  priceOriginal?: number;
  currencyOriginal?: string;
  stock?: number;
  categoryOriginal?: string;
  attributesOriginal?: Record<string, unknown>;
  // 起订量（min_order_quantity）与源平台商品状态（如 PRODUCT_ONLINE）。
  moq?: number;
  statusOriginal?: string;
  shopInfo?: NormalizedShopInfo;
  // 贸易信息（wholesale_trade：unit_type/sale_type/handling_time/weight/package_size/volume/deliver_periods 等），
  // 平台字段差异大，按源结构归一成 plain object 存 jsonb。
  tradeInfo?: Record<string, unknown>;
  certifications?: NormalizedCertificate[];
  skus?: NormalizedSku[];
  media?: NormalizedMedia[];
  // 抓取过程中的非致命告警（如库存/证书接口单项失败），由任务步骤记录展示。
  captureWarnings?: string[];
}

export interface CaptureOptions {
  // 抓取内容选项：basic/images/sku/priceStock + shop(店铺信息)/attributes(关键属性)/inventory(实时库存)/cert(证书)
  // + productReviews(产品评价)/shopReviews(店铺评价，两者 Alibaba OpenAPI 均不提供，勾选会得到明确告警)。
  // 缺省全抓（评论除外，需显式勾选）；attributes/inventory/cert 各需额外一次接口调用。
  fields?: string[];
  // 抓取展示语言与币种（决定标题/描述语言与价格币种，与源页展示一致）。缺省 zh-CN / CNY。
  language?: string;
  currency?: string;
}

export interface CaptureAdapter {
  name: string;
  fetchProductByUrl(url: string, options?: CaptureOptions): Promise<NormalizedProduct>;
}

// 适配器统一错误：带错误码与是否可重试，供任务步骤与前端友好提示使用。
export class AdapterError extends Error {
  code: string;
  retryable: boolean;
  constructor(code: string, message: string, retryable = false) {
    super(message);
    this.name = 'AdapterError';
    this.code = code;
    this.retryable = retryable;
  }
}

// 从 Alibaba.com / 1688 商品链接解析商品 ID：
// - Alibaba.com: .../product-detail/xxx_1600000000001.html 或 ?productId=...
// - 1688: https://detail.1688.com/offer/1039847623343.html?offerId=...
export function parseAlibabaProductId(url: string): string | undefined {
  const byQuery = url.match(/[?&](?:productId|offerId)=(\d{6,})/i);
  if (byQuery) return byQuery[1];
  const byPath =
    url.match(/\/offer\/(\d{6,})/i) ||
    url.match(/(\d{8,})\.html/i) ||
    url.match(/\/p\/(\d{6,})/i) ||
    url.match(/_(\d{8,})/);
  return byPath ? byPath[1] : undefined;
}

// Alibaba.com OpenAPI 适配器。
// TODO(real): 接入 Alibaba.com OpenAPI（如 alibaba.icbu.product.get），使用 ECS 出口 IP 白名单 + token 刷新；
// 当前为占位 mock，按 product_id 生成稳定结构，便于联调与后续无缝替换（参考目录待补：plugin-ai-listing-workbench/docs/openapi）。
export const alibabaOpenApiAdapter: CaptureAdapter = {
  name: 'alibaba-openapi',
  async fetchProductByUrl(url, options) {
    const productId = parseAlibabaProductId(url);
    if (!productId) {
      throw new AdapterError(
        'PRODUCT_ID_NOT_FOUND',
        '无法从链接解析 Alibaba 商品 ID，请检查链接是否为商品详情页',
        false,
      );
    }
    const wantImages = !options?.fields || options.fields.includes('images');
    const wantSkus = !options?.fields || options.fields.includes('skus');
    const platform = /1688\./i.test(url) ? '1688' : /aliexpress\./i.test(url) ? 'AliExpress' : 'Alibaba.com';
    return {
      sourcePlatform: platform,
      sourceProductId: productId,
      sourceUrl: url,
      titleOriginal: `Wholesale Product ${productId} - Cotton T-Shirt`,
      descriptionOriginal: `Mock description for Alibaba product ${productId}. High quality, MOQ 50pcs.`,
      priceOriginal: 3.5,
      currencyOriginal: 'USD',
      stock: 9999,
      categoryOriginal: "Apparel > Men's T-Shirts",
      attributesOriginal: { Material: 'Cotton', Brand: 'OEM', MOQ: '50' },
      skus: wantSkus
        ? [
            {
              sku: `${productId}-BLK-M`,
              specName: 'Color/Size',
              specValue: 'Black/M',
              priceOriginal: 3.5,
              stock: 3000,
            },
            {
              sku: `${productId}-WHT-L`,
              specName: 'Color/Size',
              specValue: 'White/L',
              priceOriginal: 3.8,
              stock: 2000,
            },
          ]
        : [],
      media: wantImages
        ? [
            {
              assetType: 'image',
              sourceUrl: `https://example-cdn/alibaba/${productId}/main.jpg`,
              role: 'main',
              sort: 0,
            },
            {
              assetType: 'image',
              sourceUrl: `https://example-cdn/alibaba/${productId}/detail1.jpg`,
              role: 'detail',
              sort: 1,
            },
          ]
        : [],
    };
  },
};

// Crawl4AI 兜底适配器（仅接口预留）。
// 重要：Crawl4AI/headless 浏览器绝不能跑在 NocoBase 主进程；真实实现应通过内网 HTTP/Redis 调用独立 worker 容器。
// 当前未配置 worker，直接返回可重试错误，避免误把浏览器拉进主进程。
export const crawl4aiAdapter: CaptureAdapter = {
  name: 'crawl4ai',
  async fetchProductByUrl() {
    throw new AdapterError(
      'CRAWL4AI_NOT_CONFIGURED',
      'Crawl4AI 兜底抓取服务未配置（应由独立 worker 容器提供），暂无法抓取该来源',
      true,
    );
  },
};

// 按链接选择适配器：Alibaba.com 优先走 OpenAPI；其它来源走 Crawl4AI 兜底接口。
export function resolveAdapter(url: string): CaptureAdapter {
  let host = '';
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    host = '';
  }
  // Alibaba 系（Alibaba.com 国际站、1688 国内站、AliExpress）走 OpenAPI adapter；其它来源走 Crawl4AI 兜底。
  if (host.includes('alibaba.') || host.includes('1688.com') || host.includes('aliexpress.')) {
    return alibabaOpenApiAdapter;
  }
  return crawl4aiAdapter;
}

// 搜索/店铺结果卡片（对齐 OpenAPI search 的 products[] 结构）。
export interface SearchCard {
  sourceProductId: string;
  title: string;
  priceText: string;
  currency?: string;
  imageUrl?: string;
  sourceUrl: string;
  sourcePlatform: string;
}

export interface KeywordSearchParams {
  keyword: string;
  platform?: string;
  sort?: 'price_asc' | 'price_desc' | string;
  priceMin?: number;
  priceMax?: number;
  size?: number;
  index?: number;
  shipTo?: string;
  currency?: string;
}

// 关键词搜索：对齐 Alibaba.com OpenAPI `/eco/buyer/product/search`（keyword,size≤50,index 从 1）。
// TODO(real): 调用真实 OpenAPI，data.products[{product_id,title,price,permalink,image}] 映射为 SearchCard。当前 mock。
export async function searchAlibabaProducts(params: KeywordSearchParams): Promise<SearchCard[]> {
  const kw = (params.keyword || '').trim();
  if (!kw) throw new AdapterError('KEYWORD_REQUIRED', '请输入搜索关键词', false);
  const size = Math.min(params.size || 8, 50);
  const base = 1700000000000;
  let cards: SearchCard[] = Array.from({ length: size }).map((_, i) => {
    const id = String(base + i);
    return {
      sourceProductId: id,
      title: `${kw} - Wholesale Item ${i + 1}`,
      priceText: (1 + i * 0.5).toFixed(2),
      currency: params.currency || 'USD',
      imageUrl: `https://example-cdn/alibaba/${id}/main.jpg`,
      sourceUrl: `https://www.alibaba.com/product-detail/${kw.replace(/\s+/g, '-')}_${id}.html`,
      sourcePlatform: 'Alibaba.com',
    };
  });
  if (params.priceMin != null) cards = cards.filter((c) => Number(c.priceText) >= (params.priceMin as number));
  if (params.priceMax != null) cards = cards.filter((c) => Number(c.priceText) <= (params.priceMax as number));
  if (params.sort === 'price_asc') cards.sort((a, b) => Number(a.priceText) - Number(b.priceText));
  if (params.sort === 'price_desc') cards.sort((a, b) => Number(b.priceText) - Number(a.priceText));
  return cards;
}

// 店铺商品枚举：Alibaba.com 买家侧 OpenAPI 无“按店铺 URL 列商品”，必须由 Crawl4AI 抓公开店铺页拿 product_id 列表（mock）。
// 真实实现由独立 Crawl4AI worker 完成，绝不在主进程跑浏览器；拿到 product_id 后仍走 OpenAPI description 取详情。
export async function enumerateStoreProducts(storeUrl: string): Promise<SearchCard[]> {
  if (!storeUrl) throw new AdapterError('STORE_URL_REQUIRED', '请输入店铺链接', false);
  let host = '';
  try {
    host = new URL(storeUrl).hostname;
  } catch {
    throw new AdapterError('INVALID_STORE_URL', '店铺链接无效（需 http/https）', false);
  }
  const base = 1800000000000;
  return Array.from({ length: 6 }).map((_, i) => {
    const id = String(base + i);
    return {
      sourceProductId: id,
      title: `Store ${host} - Product ${i + 1}`,
      priceText: (2 + i).toFixed(2),
      currency: 'USD',
      imageUrl: `https://example-cdn/alibaba/${id}/main.jpg`,
      sourceUrl: `https://www.alibaba.com/product-detail/store-item_${id}.html`,
      sourcePlatform: 'Alibaba.com',
    };
  });
}
