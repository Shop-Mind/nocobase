/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// Alibaba.com ICBU 商品接口响应 → NormalizedProduct 的纯映射（Phase E）。
// 覆盖 /alibaba/icbu/product/get/v2（响应 product_info: basic_info / category_info / attributes / trade_info / logistics_info）。
// 纯函数、可单测；对缺字段容错，绝不抛（抓不到就给空/缺省），错误由调用层的网关调用负责。

import type {
  NormalizedCertificate,
  NormalizedLadderTier,
  NormalizedMedia,
  NormalizedProduct,
  NormalizedSku,
} from '../../adapters';

type Obj = Record<string, unknown>;

function asObj(v: unknown): Obj {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {};
}
function asArr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
function str(v: unknown): string | undefined {
  if (typeof v === 'string' && v.trim()) return v;
  if (typeof v === 'number') return String(v);
  return undefined;
}
function num(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return undefined;
}

// 价格：TIERED 取最低阶梯价；RANGE 取 min_price。
function extractPrice(price: Obj): { priceOriginal?: number; currencyOriginal?: string } {
  const currency = str(price.currency);
  const tiered = asArr(price.tiered_price)
    .map((t) => num(asObj(t).price))
    .filter((n): n is number => n != null);
  if (tiered.length) return { priceOriginal: Math.min(...tiered), currencyOriginal: currency };
  const range = asObj(price.range_price);
  const min = num(range.min_price);
  if (min != null) return { priceOriginal: min, currencyOriginal: currency };
  return { currencyOriginal: currency };
}

function mapSkus(skuInfo: unknown[]): NormalizedSku[] {
  return skuInfo.map((raw) => {
    const s = asObj(raw);
    const attrs = asArr(s.sale_attributes).map(asObj);
    const specName = attrs
      .map((a) => str(a.attribute_name))
      .filter(Boolean)
      .join('/');
    const specValue = attrs
      .map((a) => str(a.attribute_value_name) || str(a.attribute_value))
      .filter(Boolean)
      .join('/');
    // sku_price 可能是数字或对象；容错取数。
    const price = num(s.sku_price) ?? num(asObj(s.sku_price).price);
    return {
      sku: str(s.sku_code) || str(s.sku_id),
      specName: specName || undefined,
      specValue: specValue || undefined,
      priceOriginal: price,
      stock: num(s.inventory),
    };
  });
}

function mapImages(images: unknown[]): NormalizedMedia[] {
  return images
    .map((raw, i) => {
      const url = typeof raw === 'string' ? raw : str(asObj(raw).image_url) || str(asObj(raw).url);
      if (!url) return null;
      return { assetType: 'image' as const, sourceUrl: url, role: i === 0 ? 'main' : 'detail', sort: i };
    })
    .filter((m): m is NormalizedMedia => m != null);
}

// /alibaba/icbu/product/get/v2 响应 → NormalizedProduct。resp 为 callIop 返回的整包 json。
export function toNormalizedFromProductGetV2(
  resp: Obj,
  sourceUrl: string,
  fallbackProductId?: string,
): NormalizedProduct {
  const pi = asObj(resp.product_info ?? asObj(resp.result).product_info ?? resp);
  const basic = asObj(pi.basic_info);
  const category = asObj(pi.category_info);
  const trade = asObj(pi.trade_info);
  const price = extractPrice(asObj(trade.price));

  const attributes: Record<string, unknown> = {};
  for (const raw of asArr(pi.attributes)) {
    const a = asObj(raw);
    const name = str(a.attribute_name);
    const value = str(a.attribute_value);
    if (name && value) attributes[name] = value;
  }

  const images = asArr(basic.product_images).length ? asArr(basic.product_images) : asArr(basic.product_image);

  return {
    sourcePlatform: 'Alibaba.com',
    sourceProductId: str(basic.product_id) || fallbackProductId,
    sourceUrl,
    titleOriginal: str(basic.title) || '',
    descriptionOriginal: str(basic.description),
    priceOriginal: price.priceOriginal,
    currencyOriginal: price.currencyOriginal,
    stock: num(trade.inventory),
    categoryOriginal: str(category.category_name),
    attributesOriginal: Object.keys(attributes).length ? attributes : undefined,
    skus: mapSkus(asArr(trade.sku_info)),
    media: mapImages(images),
  };
}

// —— 买家/选品接口（搬运他人商品）——
// /eco/buyer/product/description 响应 result.result_data → NormalizedProduct。
// 结构：title / description(装修 HTML，内嵌详情图) / category / currency / min_order_quantity / main_image / images[] /
//   video_url / skus[]{ sku_id, seller_sku_id, unit, sku_attr_list[{attr_name_desc,attr_value_desc}],
//   ladder_price[{min_quantity,max_quantity,price,currency}] }。
// 库存/属性不在此接口（需 batch/inventory、batch/keyattributes 另取），此处留空。

// 从阶梯价数组归一化（保留完整档位；-1 表示无上限）。
function mapLadder(raw: unknown[]): NormalizedLadderTier[] {
  return raw
    .map((t): NormalizedLadderTier | null => {
      const o = asObj(t);
      const price = num(o.price);
      if (price == null) return null;
      return { minQuantity: num(o.min_quantity), maxQuantity: num(o.max_quantity), price, currency: str(o.currency) };
    })
    .filter((x): x is NormalizedLadderTier => x != null);
}

// 起订档单价：最小起订量那一档的价（而非全阶梯最低价），作为展示基准价。
function entryTierPrice(ladder: NormalizedLadderTier[]): number | undefined {
  if (!ladder.length) return undefined;
  return [...ladder].sort((a, b) => (a.minQuantity ?? 0) - (b.minQuantity ?? 0))[0].price;
}

// 从装修 HTML 里抽取详情图 URL（补全协议，去重，保序）。
function extractImageUrls(html: string): string[] {
  const urls: string[] = [];
  const re = /<img\b[^>]*?\bsrc=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    let u = m[1].trim();
    if (u.startsWith('//')) u = 'https:' + u;
    if (/^https?:\/\//i.test(u) && !urls.includes(u)) urls.push(u);
  }
  return urls;
}

// 解码常见 HTML 实体（含数字/十六进制），把 &#xA0; / &nbsp; 之类还原成可读字符。
function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&(?:apos|#39);/gi, "'")
    .replace(/&#(\d+);/g, (_m, d: string) => {
      try {
        return String.fromCodePoint(Number(d));
      } catch {
        return ' ';
      }
    })
    .replace(/&#x([0-9a-f]+);/gi, (_m, h: string) => {
      try {
        return String.fromCodePoint(parseInt(h, 16));
      } catch {
        return ' ';
      }
    });
}

// 表格区域单独清洗：单元格内的 br/p/div 等一律 → 空格（绝不换行，否则一行表格会被切成多行），
// 单元格边界 → ` | `，行边界 → 换行。
function cleanTableRegion(table: string): string {
  let s = table
    .replace(/<\/(?:td|th)>/gi, ' | ')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/?(?:p|div|span|font|li|h[1-6])[^>]*>/gi, ' ');
  s = s.replace(/<[^>]+>/g, '');
  return s;
}

// 把装修 HTML 清洗成“可读纯文本”：去 style/script/注释/图片（图片已单独抽为详情图），
// 表格先抠出来单独处理（单元格内换行标签 → 空格，表格行不被切断），其余块级标签换行，
// 解码实体，丢空行/空单元格，折叠多余空白。
function cleanDescriptionHtml(html: string): string {
  let s = html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<img[^>]*>/gi, ''); // 正文图片已作为详情图单独抽取，纯文本里去掉
  // 表格区域抽出 → 占位符，避免下方通用换行规则把单元格内容切行。
  const tables: string[] = [];
  s = s.replace(/<table[\s\S]*?<\/table>/gi, (m) => {
    tables.push(cleanTableRegion(m));
    return `\n\uE000T${tables.length - 1}\uE000\n`;
  });
  // 非表格区域：换行标签 → 换行；div/span/font 只是装修容器 → 空格。
  s = s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(?:div|span|font)[^>]*>/gi, ' ')
    .replace(/<\/(?:p|tr|li|h[1-6]|table|tbody|thead|td|th)>/gi, '\n');
  s = s.replace(/<[^>]+>/g, ''); // 去掉所有剩余标签
  s = s.replace(/\uE000T(\d+)\uE000/g, (_m, i: string) => tables[Number(i)] ?? '');
  s = decodeEntities(s);
  // 逐行清洗：折叠空白、去掉首尾分隔符、丢弃空行与只剩分隔符的行。
  const lines = s
    .split('\n')
    .map((line) =>
      line
        .replace(/[^\S\n]+/g, ' ')
        .replace(/(?:\s*\|\s*)+$/, '')
        .replace(/^(?:\s*\|\s*)+/, '')
        .trim(),
    )
    .filter((line) => line && line !== '|');
  return lines.join('\n');
}

function mapBuyerSkus(skuInfo: unknown[]): NormalizedSku[] {
  return skuInfo.map((raw) => {
    const s = asObj(raw);
    const attrs = asArr(s.sku_attr_list).map(asObj);
    const specName = attrs
      .map((a) => str(a.attr_name_desc))
      .filter(Boolean)
      .join('/');
    const specValue = attrs
      .map((a) => str(a.attr_value_desc))
      .filter(Boolean)
      .join('/');
    // 结构化销售属性（名/值/值配图），供“颜色色卡 + 尺寸按钮”式维度展示；attr_value_image 是 100x100 色卡缩略图。
    const specAttrs = attrs
      .map((a) => {
        const name = str(a.attr_name_desc);
        const value = str(a.attr_value_desc);
        if (!name || !value) return null;
        return { name, value, image: str(a.attr_value_image) };
      })
      .filter((x): x is { name: string; value: string; image?: string } => x != null);
    const ladder = mapLadder(asArr(s.ladder_price));
    return {
      sku: str(s.seller_sku_id) || str(s.sku_id),
      specName: specName || undefined,
      specValue: specValue || undefined,
      specAttrs: specAttrs.length ? specAttrs : undefined,
      imageUrl: str(s.image),
      priceOriginal: entryTierPrice(ladder),
      ladderPrice: ladder.length ? ladder : undefined,
      unit: str(s.unit),
      stock: undefined,
    };
  });
}

export function toNormalizedFromBuyerDescription(
  resp: Obj,
  sourceUrl?: string,
  fallbackProductId?: string,
): NormalizedProduct {
  const rd = asObj(asObj(resp.result).result_data ?? asObj(resp.data).resultData ?? resp);
  const skus = mapBuyerSkus(asArr(rd.skus));

  // 商品展示价：所有 SKU 起订档价里的最低（“起步价”），不是全阶梯最低价。
  const entryPrices = skus.map((s) => s.priceOriginal).filter((n): n is number => n != null);
  const priceOriginal = entryPrices.length ? Math.min(...entryPrices) : undefined;
  const currency = str(rd.currency) || skus.find((s) => s.ladderPrice?.length)?.ladderPrice?.[0]?.currency;

  // 主图（画廊）：main_image + images[]，去重，全部标 role=main。
  const gallery: string[] = [];
  const main = str(rd.main_image);
  if (main) gallery.push(main);
  for (const u of asArr(rd.images)) {
    const url = typeof u === 'string' ? u : str(asObj(u).url) || str(asObj(u).image_url);
    if (url && !gallery.includes(url)) gallery.push(url);
  }
  const media: NormalizedMedia[] = gallery.map((url, i) => ({
    assetType: 'image',
    sourceUrl: url,
    role: 'main',
    sort: i,
  }));

  // 详情图：从装修 HTML 抽取，排除已在主图里的，标 role=detail。
  const rawDesc = str(rd.description) || '';
  for (const url of extractImageUrls(rawDesc).filter((u) => !gallery.includes(u))) {
    media.push({ assetType: 'image', sourceUrl: url, role: 'detail', sort: media.length });
  }

  // 视频。
  const video = str(rd.video_url);
  if (video) media.push({ assetType: 'video', sourceUrl: video, role: 'video', sort: media.length });

  // 供应商/店铺：description 响应自带 supplier(公司名) + eCompanyId(公司 ID)，买家侧没有独立“店铺详情”接口。
  const supplierName = str(rd.supplier);
  const companyId = str(rd.eCompanyId) || str(rd.e_company_id);
  const shopInfo = supplierName || companyId ? { supplierName, companyId } : undefined;

  // 贸易信息：wholesale_trade（unit_type/sale_type/handling_time/weight/package_size/volume/deliver_periods…），
  // 平台专有结构直接按 jsonb 保留，展示层按需取用。
  const trade = asObj(rd.wholesale_trade);
  const tradeInfo = Object.keys(trade).length ? trade : undefined;

  return {
    sourcePlatform: 'Alibaba.com',
    sourceProductId: str(rd.product_id) || fallbackProductId,
    sourceUrl: sourceUrl || str(rd.detail_url) || '',
    titleOriginal: str(rd.title) || '',
    descriptionOriginal: rawDesc ? cleanDescriptionHtml(rawDesc) : undefined,
    descriptionHtmlOriginal: rawDesc || undefined,
    priceOriginal,
    currencyOriginal: currency,
    stock: undefined, // 实时库存需另调 /eco/buyer/product/inventory（见 mapBuyerInventory）
    categoryOriginal: str(rd.category),
    categoryOriginalId: str(rd.category_id) || undefined,
    attributesOriginal: undefined, // 关键属性需另调 /eco/buyer/product/keyattributes（见 mapBuyerKeyAttributes）
    moq: num(rd.min_order_quantity),
    statusOriginal: str(rd.status),
    shopInfo,
    tradeInfo,
    skus,
    media,
  };
}

// —— 补充抓取端点（每个一次独立 GET 调用，单项失败不影响主详情）——

// /eco/buyer/product/keyattributes 响应 → 扁平属性表。
// 结构：result.result_data.attributes[]{ type, attributes[]{ name, values[]{ value } } }；
// 同名属性跨分组冲突时以「分组type·name」为键消歧，多值用「, 」连接。
export function mapBuyerKeyAttributes(resp: Obj): Record<string, string> {
  const rd = asObj(asObj(resp.result).result_data ?? asObj(resp.data).resultData ?? resp);
  const out: Record<string, string> = {};
  for (const groupRaw of asArr(rd.attributes)) {
    const group = asObj(groupRaw);
    const groupType = str(group.type);
    for (const attrRaw of asArr(group.attributes)) {
      const attr = asObj(attrRaw);
      const name = str(attr.name);
      if (!name) continue;
      const values = asArr(attr.values)
        .map((v) => str(asObj(v).value) ?? str(v))
        .filter((s): s is string => !!s);
      if (!values.length) continue;
      const key = name in out && groupType ? `${groupType}·${name}` : name;
      out[key] = values.join(', ');
    }
  }
  return out;
}

// /eco/buyer/product/inventory 响应 → 每 SKU 库存 + 合计。
// 结构：result.result_data[]{ shipping_from, inventory_list[]{ sku_id, inventory_count, inventory_unit } }。
export interface BuyerInventory {
  bySkuId: Record<string, number>;
  total: number;
  shipFrom: string[];
  unit?: string;
}
export function mapBuyerInventory(resp: Obj): BuyerInventory {
  const result = asObj(resp.result);
  const list = asArr(result.result_data ?? asObj(resp.data).resultData ?? []);
  const bySkuId: Record<string, number> = {};
  const shipFrom: string[] = [];
  let unit: string | undefined;
  for (const raw of list) {
    const entry = asObj(raw);
    const from = str(entry.shipping_from);
    if (from && !shipFrom.includes(from)) shipFrom.push(from);
    for (const invRaw of asArr(entry.inventory_list)) {
      const inv = asObj(invRaw);
      const skuId = str(inv.sku_id);
      const count = num(inv.inventory_count);
      if (!skuId || count == null) continue;
      // 多发货地时同 SKU 库存累加。
      bySkuId[skuId] = (bySkuId[skuId] ?? 0) + count;
      unit = unit || str(inv.inventory_unit);
    }
  }
  const total = Object.values(bySkuId).reduce((a, b) => a + b, 0);
  return { bySkuId, total, shipFrom, unit };
}

// 把每 SKU 库存合并进归一化 SKU（sku 字段是 seller_sku_id「productId_skuId」或 sku_id，按后缀/相等匹配）。
export function applyInventoryToSkus(skus: NormalizedSku[], inventory: BuyerInventory): void {
  for (const s of skus) {
    if (!s.sku) continue;
    for (const [skuId, count] of Object.entries(inventory.bySkuId)) {
      if (s.sku === skuId || s.sku.endsWith(`_${skuId}`)) {
        s.stock = count;
        break;
      }
    }
  }
}

// /eco/buyer/product/cert 响应 → 证书列表。结构：result.result_data[]{ cert_name, cert_no, cert_urls[] }。
export function mapBuyerCertificates(resp: Obj): NormalizedCertificate[] {
  const result = asObj(resp.result);
  const list = asArr(result.result_data ?? asObj(resp.data).resultData ?? []);
  return list
    .map((raw): NormalizedCertificate | null => {
      const c = asObj(raw);
      const certName = str(c.cert_name);
      const certNo = str(c.cert_no);
      const certUrls = asArr(c.cert_urls)
        .map((u) => str(u))
        .filter((s): s is string => !!s);
      if (!certName && !certNo && !certUrls.length) return null;
      return { certName, certNo, certUrls };
    })
    .filter((c): c is NormalizedCertificate => c != null);
}
