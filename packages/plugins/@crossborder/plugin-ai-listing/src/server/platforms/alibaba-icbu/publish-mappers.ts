/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// 发布映射（Phase F）：把标准化 PublishPayload 映射成 /alibaba/icbu/product/listing/v2 的请求参数。
// 结构以官方文档页的 SDK 示例为准（openapi.alibaba.com，2025-06-11 版），实测踩过的坑：
//   1. sku_price 是对象 { price, currency }，传数字会被网关拒（InvalidParameter “null#null”）；
//   2. SKU 图不在 sku 级，而是嵌在 sale_attributes[].image.image_url（挂在颜色等属性值上）；
//   3. 商品属性 attributes 嵌在 category_info 里，不是 product_info 顶层；
//   4. ai_optimization_config 是与 product_info 平级的独立 API 参数，嵌进 product_info 平台读不到；
//   5. 即使开 keyword_optimization_enabled，实测仍报 B_KEYWORD_NOT_FOUND——keywords 必须显式给值；
//   6. sale_attributes 的 attribute_name 必须能对上类目定义的销售属性（attribute/get/v2），
//      对不上的维度要剔除，剔除后重复的 SKU 组合要合并（库存求和、价格取低）。

import type { PublishPayload, PublishVariant } from '../../publish/adapters';

// listing/v2 限制：product_image 最多 6 张，第一张为主图。
const MAX_IMAGES = 6;

// 平台售卖单位白名单外的值兜底为 Piece（listing/v2 的 unit 是枚举，乱传会被拒）。
const KNOWN_UNITS = new Set([
  'Piece',
  'Bag',
  'Pair',
  'Set',
  'Box',
  'Carton',
  'Meter',
  'Roll',
  'Kilogram',
  'Ton',
  'Pack',
  'Unit',
  'Dozen',
  'Gram',
  'Liter',
  'Sheet',
]);

// 常见中文规格维度名 → Alibaba.com 类目销售属性英文名（抓取来的 specAttrs 名是中文，类目定义是英文）。
export const CN_ATTR_NAME_MAP: Record<string, string> = {
  颜色: 'Color',
  色: 'Color',
  尺寸: 'Size',
  大小: 'Size',
  尺码: 'Size',
  规格: 'Specification',
  样式: 'Style',
  款式: 'Style',
  型号: 'Model',
  材质: 'Material',
  容量: 'Capacity',
};

// 类目销售属性（attribute/get/v2 的 sale_attributes 项的关键信息）。
export interface CategorySaleAttr {
  attributeId?: number;
  attributeName: string;
  required?: boolean;
  supportCustomValue?: boolean;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// 抓取回来的 SKU 图常带 _100x100 缩略后缀，发布时还原为原图。
export function stripThumbSuffix(url: string): string {
  return url.replace(/_\d+x\d+\.(jpg|jpeg|png|webp)$/i, '');
}

// 平台限制：属性值长度 ≤70（实测 B_ATTRIBUTE_INVALID）。超长的多为描述性长文本，已含在商品描述里，
// 直接剔除并记入 notes（截断会产生残句，不如不传）。
const ATTR_VALUE_MAX = 70;

// 属性字典 → attributes 数组（挂在 category_info 下）。值序列化为字符串，空值/超长值剔除。
export function toIcbuAttributes(attributes: Record<string, unknown>): {
  attrs: Array<Record<string, string>>;
  skipped: string[];
} {
  const attrs: Array<Record<string, string>> = [];
  const skipped: string[] = [];
  for (const [name, value] of Object.entries(attributes || {})) {
    if (value == null) continue;
    const v = typeof value === 'string' ? value.trim() : String(value);
    if (!v || !name.trim()) continue;
    if (v.length > ATTR_VALUE_MAX) {
      skipped.push(name.trim());
      continue;
    }
    attrs.push({ attribute_name: name.trim(), attribute_value: v });
  }
  return { attrs, skipped };
}

// 递归剔除 undefined/null/空数组/空对象，保证发出去的 JSON 干净（网关对 null 字段可能报参数无效）。
export function pruneEmpty(value: unknown): unknown {
  if (Array.isArray(value)) {
    const arr = value.map(pruneEmpty).filter((v) => v !== undefined);
    return arr.length ? arr : undefined;
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const p = pruneEmpty(v);
      if (p !== undefined) out[k] = p;
    }
    return Object.keys(out).length ? out : undefined;
  }
  if (value === undefined || value === null) return undefined;
  return value;
}

// 把 SKU 规格维度对齐到类目销售属性：维度名（中文）翻译后匹配类目定义，匹配不上的维度剔除；
// 剔除后组合重复的 SKU 合并（库存求和、价格取低、保留首个 sku_code 与图）。
// 返回 notes 记录被剔除的维度与合并数量，随发布结果回传给运营，不做静默截断。
export function alignVariantsToSaleAttrs(
  variants: PublishVariant[],
  saleAttrs: CategorySaleAttr[],
): { variants: PublishVariant[]; notes: string[] } {
  const notes: string[] = [];
  const byName = new Map<string, CategorySaleAttr>();
  for (const a of saleAttrs) byName.set(a.attributeName.toLowerCase(), a);
  const matchName = (name: string): string | undefined => {
    const direct = byName.get(name.toLowerCase());
    if (direct) return direct.attributeName;
    const translated = CN_ATTR_NAME_MAP[name.trim()];
    if (translated && byName.get(translated.toLowerCase())) return translated;
    return undefined;
  };

  const droppedDims = new Set<string>();
  const merged = new Map<string, PublishVariant>();
  for (const v of variants) {
    const attrs = (v.attrs || [])
      .map((a) => {
        const name = matchName(a.name);
        if (!name) {
          droppedDims.add(a.name);
          return null;
        }
        return { name, value: a.value };
      })
      .filter((a): a is { name: string; value: string } => a !== null);
    if (!attrs.length) continue;
    const key = attrs.map((a) => `${a.name}=${a.value}`).join('|');
    const existed = merged.get(key);
    if (!existed) {
      merged.set(key, { ...v, attrs });
    } else {
      existed.stock = (existed.stock ?? 0) + (v.stock ?? 0);
      if (v.price != null && (existed.price == null || v.price < existed.price)) existed.price = v.price;
    }
  }
  const out = [...merged.values()];
  if (droppedDims.size) {
    notes.push(`规格维度「${[...droppedDims].join('、')}」在目标类目无对应销售属性，已并入描述不作为 SKU 维度`);
  }
  if (out.length && out.length < variants.length) {
    notes.push(`SKU 按类目销售属性合并：${variants.length} → ${out.length}（库存求和、价格取低档）`);
  }
  if (!out.length && variants.length) {
    notes.push('所有 SKU 规格维度都无法对齐类目销售属性，本次按 SPU（无 SKU）发布');
  }
  return { variants: out, notes };
}

export interface IcbuListingRequest {
  // 与 product_info 平级的两个顶层 API 参数。
  product_info: Record<string, unknown>;
  ai_optimization_config: Record<string, unknown>;
  notes: string[];
}

// PublishPayload → listing/v2 请求参数。
// - 价格：SPU 用 TIERED 单档（quantity=MOQ），SKU 价为对象 { price, currency }；币种非 USD 平台自动换算。
// - 类目：categoryId 为空时不传 category_info（商品属性也随之省略），平台按标题/描述/图自动预测类目。
// - 关键词：实测必须显式提供；未给时从标题截取兜底，并同时开启平台关键词优化。
// - saleAttrs 提供时先做 SKU 维度对齐（见 alignVariantsToSaleAttrs）。
export function toIcbuListingRequest(payload: PublishPayload, saleAttrs?: CategorySaleAttr[]): IcbuListingRequest {
  const notes: string[] = [];
  const images = (payload.images || []).slice(0, MAX_IMAGES).map((u) => ({ image_url: stripThumbSuffix(u) }));
  if ((payload.images || []).length > MAX_IMAGES) {
    notes.push(`图片超过平台上限，仅取前 ${MAX_IMAGES} 张（共 ${(payload.images || []).length} 张）`);
  }
  const price = payload.price != null && payload.price > 0 ? round2(payload.price) : undefined;
  const currency = payload.currency || 'USD';
  const moq = payload.moq != null && payload.moq > 0 ? Math.round(payload.moq) : 1;
  const unit = payload.unit && KNOWN_UNITS.has(payload.unit) ? payload.unit : 'Piece';

  let variants = (payload.variants || []).filter((v) => Array.isArray(v.attrs) && v.attrs.length > 0);
  if (saleAttrs && variants.length) {
    const aligned = alignVariantsToSaleAttrs(variants, saleAttrs);
    variants = aligned.variants;
    notes.push(...aligned.notes);
  }

  const skuInfo = variants.map((v) => ({
    sku_code: v.sku,
    sku_price: v.price != null && v.price > 0 ? { price: round2(v.price), currency } : undefined,
    inventory: v.stock != null && v.stock >= 0 ? Math.round(v.stock) : undefined,
    sale_attributes: (v.attrs || []).map((a, idx) => ({
      attribute_name: a.name,
      attribute_value: a.value,
      // SKU 图挂在第一个销售属性值上（官方示例形状：sale_attributes[].image.image_url）。
      image: idx === 0 && v.imageUrl ? { image_url: stripThumbSuffix(v.imageUrl) } : undefined,
    })),
  }));

  // 实测 keywords 必填（B_KEYWORD_NOT_FOUND）：未提供时从标题取前几个词兜底 + 开平台关键词优化。
  const keywords = payload.keywords || (payload.title || '').slice(0, 30);

  const categoryAttrs = toIcbuAttributes(payload.attributes || {});
  if (payload.categoryId && categoryAttrs.skipped.length) {
    notes.push(`属性「${categoryAttrs.skipped.join('、')}」值超过平台 70 字符上限，未随属性上传（内容已在描述中）`);
  }

  // 描述转标准富文本：逐行包 <p>（空行跳过）。比裸 <br/> 更接近平台编辑器产出的 HTML，
  // 降低平台侧描述处理/翻译环节把内容判空的概率（实测 bizcheck 报过 DESCRIPTION_IS_REQUIRED）。
  const descriptionHtml = payload.description
    ? payload.description
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => `<p>${line}</p>`)
        .join('')
    : undefined;

  const productInfo = {
    basic_info: {
      title: payload.title,
      description: descriptionHtml,
      keywords,
      // 输入语言按内容实际语言声明（本工具默认中文抓取/编辑），非英文由平台自动翻译成站点语言。
      language: 'zh_CN',
      product_image: images,
    },
    category_info: payload.categoryId
      ? { category_id: String(payload.categoryId), attributes: categoryAttrs.attrs }
      : undefined,
    trade_info: {
      price: price
        ? {
            price_type: 'TIERED',
            currency,
            tiered_price: [{ quantity: moq, price }],
          }
        : undefined,
      inventory: payload.stock != null && payload.stock > 0 ? Math.round(payload.stock) : undefined,
      moq,
      unit,
      sku_info: skuInfo,
    },
    logistics_info: payload.shippingTemplateId ? { shipping_template_id: payload.shippingTemplateId } : undefined,
  };
  const aiConfig = {
    title_optimization_enabled: false,
    description_optimization_enabled: false,
    keyword_optimization_enabled: !payload.keywords,
  };
  return {
    product_info: (pruneEmpty(productInfo) as Record<string, unknown>) || {},
    ai_optimization_config: aiConfig,
    notes,
  };
}
