/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { describe, expect, it } from 'vitest';
import type { PublishPayload } from '../../../publish/adapters';
import {
  alignVariantsToSaleAttrs,
  pruneEmpty,
  stripThumbSuffix,
  toIcbuAttributes,
  toIcbuListingRequest,
  type CategorySaleAttr,
} from '../publish-mappers';

const SALE_ATTRS: CategorySaleAttr[] = [
  { attributeId: 191284983, attributeName: 'Color', required: true, supportCustomValue: true },
];

const BASE_PAYLOAD: PublishPayload = {
  storeId: 3,
  categoryId: '201726906',
  title: '婚礼派对饰品定制浮雕超细纤维拉绳袋',
  description: '产品特点\n材料 | 超细纤维',
  price: 8.12,
  stock: 28000,
  images: [
    'https://sc04.alicdn.com/kf/main.jpg',
    'https://sc04.alicdn.com/kf/a.jpg',
    'https://sc04.alicdn.com/kf/b.jpg',
    'https://sc04.alicdn.com/kf/c.jpg',
    'https://sc04.alicdn.com/kf/d.jpg',
    'https://sc04.alicdn.com/kf/e.jpg',
    'https://sc04.alicdn.com/kf/overflow.jpg',
  ],
  variants: [
    {
      sku: 'sku-gray-s',
      price: 8.12,
      stock: 1000,
      spec: '灰色/8 * 8cm',
      attrs: [
        { name: '颜色', value: '灰色' },
        { name: '尺寸', value: '8 * 8cm' },
      ],
      imageUrl: 'https://sc04.alicdn.com/kf/gray.jpg_100x100.jpg',
    },
    {
      sku: 'sku-gray-m',
      price: 7.9,
      stock: 1000,
      spec: '灰色/8 * 10cm',
      attrs: [
        { name: '颜色', value: '灰色' },
        { name: '尺寸', value: '8 * 10cm' },
      ],
      imageUrl: 'https://sc04.alicdn.com/kf/gray.jpg_100x100.jpg',
    },
    {
      sku: 'sku-blue-s',
      price: 8.12,
      stock: 500,
      spec: '蓝色/8 * 8cm',
      attrs: [
        { name: '颜色', value: '蓝色' },
        { name: '尺寸', value: '8 * 8cm' },
      ],
      imageUrl: 'https://sc04.alicdn.com/kf/blue.jpg_100x100.jpg',
    },
    // 无结构化销售属性的 SKU 不进 sku_info（平台要求 SKU 必须带销售属性）。
    { sku: 'no-attrs', price: 9, stock: 10, spec: 'x' },
  ],
  attributes: { 材质: '超细纤维', 产地: '中国', 空值属性: '' },
  shippingTemplateId: 'tpl-1',
  currency: 'CNY',
  moq: 100,
  unit: 'Bag',
};

describe('stripThumbSuffix', () => {
  it('去掉 _100x100 缩略后缀', () => {
    expect(stripThumbSuffix('https://a.com/x.jpg_100x100.jpg')).toBe('https://a.com/x.jpg');
    expect(stripThumbSuffix('https://a.com/x.jpg')).toBe('https://a.com/x.jpg');
  });
});

describe('toIcbuAttributes', () => {
  it('字典转数组并剔除空值；超 70 字符的值剔除并记入 skipped（平台 B_ATTRIBUTE_INVALID 限制）', () => {
    const { attrs, skipped } = toIcbuAttributes({
      材质: '超细纤维',
      空: '',
      也空: null as unknown as string,
      颜色: '库存许多不同的颜色，如黑色白色黄色红色蓝色灰色米色绿色棕色紫色，定制染料的最小起订量颜色是五百米，还可以按客户要求定制更多颜色，支持来样定做以及潘通色卡指定颜色',
    });
    expect(attrs).toEqual([{ attribute_name: '材质', attribute_value: '超细纤维' }]);
    expect(skipped).toEqual(['颜色']);
  });
});

describe('pruneEmpty', () => {
  it('递归剔除 undefined/null/空对象/空数组，保留 false 与 0', () => {
    expect(pruneEmpty({ a: undefined, b: null, c: {}, d: [], e: false, f: 0, g: { h: undefined, i: 'x' } })).toEqual({
      e: false,
      f: 0,
      g: { i: 'x' },
    });
  });
});

describe('alignVariantsToSaleAttrs', () => {
  it('中文维度名翻译匹配类目销售属性；对不上的维度剔除并按剩余组合合并（库存求和、价格取低）', () => {
    const { variants, notes } = alignVariantsToSaleAttrs(BASE_PAYLOAD.variants.slice(0, 3), SALE_ATTRS);
    // 尺寸维度被剔除后：灰色 ×2 合并，蓝色 ×1 保留。
    expect(variants).toHaveLength(2);
    const gray = variants.find((v) => v.attrs?.[0].value === '灰色');
    expect(gray?.attrs).toEqual([{ name: 'Color', value: '灰色' }]);
    expect(gray?.stock).toBe(2000);
    expect(gray?.price).toBe(7.9);
    expect(notes.join('；')).toContain('尺寸');
    expect(notes.join('；')).toContain('3 → 2');
  });

  it('全部维度都对不上时返回空（上层按 SPU 发布）', () => {
    const { variants, notes } = alignVariantsToSaleAttrs(
      [{ sku: 'a', attrs: [{ name: '香型', value: '茉莉' }] }],
      SALE_ATTRS,
    );
    expect(variants).toHaveLength(0);
    expect(notes.join('')).toContain('SPU');
  });
});

describe('toIcbuListingRequest', () => {
  it('完整映射：sku_price 为对象、SKU 图挂销售属性、attributes 嵌 category_info、ai 配置独立', () => {
    const req = toIcbuListingRequest(BASE_PAYLOAD, SALE_ATTRS);
    const info = req.product_info as Record<string, any>;
    expect(info.basic_info.title).toBe(BASE_PAYLOAD.title);
    expect(info.basic_info.description).toBe('<p>产品特点</p><p>材料 | 超细纤维</p>');
    expect(info.basic_info.language).toBe('zh_CN');
    // 实测 keywords 必填：未手填时从标题兜底。
    expect(info.basic_info.keywords).toBeTruthy();
    // 图片最多 6 张，第一张为主图。
    expect(info.basic_info.product_image).toHaveLength(6);
    expect(info.basic_info.product_image[0].image_url).toBe('https://sc04.alicdn.com/kf/main.jpg');
    // 商品属性嵌在 category_info 里（官方示例形状）。
    expect(info.category_info.category_id).toBe('201726906');
    expect(info.category_info.attributes).toEqual([
      { attribute_name: '材质', attribute_value: '超细纤维' },
      { attribute_name: '产地', attribute_value: '中国' },
    ]);
    expect(info.attributes).toBeUndefined();
    expect(info.trade_info.price).toEqual({
      price_type: 'TIERED',
      currency: 'CNY',
      tiered_price: [{ quantity: 100, price: 8.12 }],
    });
    expect(info.trade_info.inventory).toBe(28000);
    expect(info.trade_info.unit).toBe('Bag');
    // 维度对齐后 3 个带属性 SKU → 2 个 Color SKU。
    expect(info.trade_info.sku_info).toHaveLength(2);
    const gray = info.trade_info.sku_info[0];
    // sku_price 是对象 { price, currency }（传数字会被网关拒）。
    expect(gray.sku_price).toEqual({ price: 7.9, currency: 'CNY' });
    expect(gray.inventory).toBe(2000);
    // SKU 图挂在第一个销售属性上，且去缩略后缀。
    expect(gray.sale_attributes).toEqual([
      { attribute_name: 'Color', attribute_value: '灰色', image: { image_url: 'https://sc04.alicdn.com/kf/gray.jpg' } },
    ]);
    expect(info.logistics_info.shipping_template_id).toBe('tpl-1');
    // ai_optimization_config 是与 product_info 平级的独立参数。
    expect(req.ai_optimization_config).toEqual({
      title_optimization_enabled: false,
      description_optimization_enabled: false,
      keyword_optimization_enabled: true,
    });
    expect(req.notes.length).toBeGreaterThan(0);
  });

  it('无类目 ID 时不传 category_info（平台自动预测）；未知单位兜底 Piece', () => {
    const req = toIcbuListingRequest({ ...BASE_PAYLOAD, categoryId: undefined, unit: '袋' });
    const info = req.product_info as Record<string, any>;
    expect(info.category_info).toBeUndefined();
    expect(info.trade_info.unit).toBe('Piece');
  });

  it('手填关键词时关闭关键词 AI 优化', () => {
    const req = toIcbuListingRequest({ ...BASE_PAYLOAD, keywords: 'drawstring bag microfiber' });
    const info = req.product_info as Record<string, any>;
    expect(info.basic_info.keywords).toBe('drawstring bag microfiber');
    expect(req.ai_optimization_config.keyword_optimization_enabled).toBe(false);
  });
});
