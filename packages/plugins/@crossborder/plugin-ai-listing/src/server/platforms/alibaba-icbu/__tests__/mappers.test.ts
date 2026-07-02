/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { describe, it, expect } from 'vitest';
import {
  toNormalizedFromProductGetV2,
  toNormalizedFromBuyerDescription,
  mapBuyerKeyAttributes,
  mapBuyerInventory,
  applyInventoryToSkus,
  mapBuyerCertificates,
} from '../mappers';

const SAMPLE = {
  product_info: {
    basic_info: {
      product_id: 1600000001,
      title: 'Wholesale Cotton T-Shirt',
      description: 'High quality, MOQ 50pcs.',
      product_images: [{ image_url: '//img.alicdn.com/main.jpg' }, { image_url: '//img.alicdn.com/d1.jpg' }],
    },
    category_info: { category_id: 123, category_name: "Apparel > Men's T-Shirts" },
    attributes: [
      { attribute_name: 'Material', attribute_value: 'Cotton' },
      { attribute_name: 'Brand', attribute_value: 'OEM' },
    ],
    trade_info: {
      moq: 50,
      unit: 'Piece',
      inventory: 9999,
      price: {
        price_type: 'TIERED',
        currency: 'USD',
        tiered_price: [
          { quantity: 1, price: 3.5 },
          { quantity: 100, price: 3.0 },
        ],
      },
      sku_info: [
        {
          sku_id: 11,
          sku_code: 'BLK-M',
          sku_price: 3.5,
          inventory: 3000,
          sale_attributes: [
            { attribute_name: 'Color', attribute_value: 'Black' },
            { attribute_name: 'Size', attribute_value: 'M' },
          ],
        },
      ],
    },
  },
  success: true,
};

describe('toNormalizedFromProductGetV2', () => {
  it('完整响应 → 正确归一化（含最低阶梯价、属性、SKU、主图/详情图）', () => {
    const n = toNormalizedFromProductGetV2(SAMPLE, 'https://www.alibaba.com/product-detail/x_1600000001.html');
    expect(n.sourcePlatform).toBe('Alibaba.com');
    expect(n.sourceProductId).toBe('1600000001');
    expect(n.titleOriginal).toBe('Wholesale Cotton T-Shirt');
    expect(n.descriptionOriginal).toBe('High quality, MOQ 50pcs.');
    expect(n.priceOriginal).toBe(3.0); // 取最低阶梯价
    expect(n.currencyOriginal).toBe('USD');
    expect(n.stock).toBe(9999);
    expect(n.categoryOriginal).toBe("Apparel > Men's T-Shirts");
    expect(n.attributesOriginal).toEqual({ Material: 'Cotton', Brand: 'OEM' });
    expect(n.skus).toEqual([
      { sku: 'BLK-M', specName: 'Color/Size', specValue: 'Black/M', priceOriginal: 3.5, stock: 3000 },
    ]);
    expect(n.media).toEqual([
      { assetType: 'image', sourceUrl: '//img.alicdn.com/main.jpg', role: 'main', sort: 0 },
      { assetType: 'image', sourceUrl: '//img.alicdn.com/d1.jpg', role: 'detail', sort: 1 },
    ]);
  });

  it('RANGE 区间价 → 取 min_price', () => {
    const resp = {
      product_info: {
        basic_info: { product_id: 2, title: 'X' },
        trade_info: { price: { price_type: 'RANGE', currency: 'USD', range_price: { min_price: 2.5, max_price: 5 } } },
      },
    };
    const n = toNormalizedFromProductGetV2(resp, 'u');
    expect(n.priceOriginal).toBe(2.5);
    expect(n.currencyOriginal).toBe('USD');
  });

  it('product_info 嵌在 result 下也能解析', () => {
    const resp = { result: { product_info: { basic_info: { product_id: 9, title: 'Y' } } } };
    const n = toNormalizedFromProductGetV2(resp, 'u');
    expect(n.sourceProductId).toBe('9');
    expect(n.titleOriginal).toBe('Y');
  });

  it('缺字段容错：空响应不抛，给缺省 + fallbackProductId', () => {
    const n = toNormalizedFromProductGetV2({}, 'https://x/y.html', '77');
    expect(n.sourcePlatform).toBe('Alibaba.com');
    expect(n.sourceProductId).toBe('77');
    expect(n.titleOriginal).toBe('');
    expect(n.priceOriginal).toBeUndefined();
    expect(n.skus).toEqual([]);
    expect(n.media).toEqual([]);
    expect(n.attributesOriginal).toBeUndefined();
  });

  it('图片为纯字符串数组也能映射', () => {
    const resp = { product_info: { basic_info: { product_id: 3, title: 'Z', product_images: ['//a.jpg'] } } };
    const n = toNormalizedFromProductGetV2(resp, 'u');
    expect(n.media).toEqual([{ assetType: 'image', sourceUrl: '//a.jpg', role: 'main', sort: 0 }]);
  });
});

const BUYER_SAMPLE = {
  result: {
    result_msg: 'request success',
    result_data: {
      detail_url: 'https://www.alibaba.com/product-detail/x_50148840.html',
      main_image: 'https://img/main.jpg',
      images: ['https://img/main.jpg', 'https://img/d1.jpg'],
      title: 'Stainless Steel Meat Thermometer',
      description:
        '<div data-host="9" data-magic-global="x" style="a"><style>.magic{color:red}</style>' +
        '<div><div></div></div><img src="//img/detail1.jpg" data-x="1" style="w"><img src="https://img/detail1.jpg">' +
        '<table><tbody><tr><td><div>Material</div></td><td><div>Microfiber</div></td><td></td></tr>' +
        // 单元格内含 <p>/<br>：值被换行标签打断也必须保持在同一行（真实装修 HTML 常见）。
        '<tr><td>Colors</td><td><p>black white</p><br><p>( MOQ 500 meter )</p></td></tr></tbody></table>' +
        '<p>MOQ&#xA0;500&#xFF09;</p></div>',
      category: 'Household Thermometers',
      category_id: 100004782,
      product_id: 50148840,
      currency: 'USD',
      min_order_quantity: 5,
      status: 'PRODUCT_ONLINE',
      supplier: 'Jiangxi Unipack Bags Co., Ltd.',
      eCompanyId: 'ec-889900',
      wholesale_trade: { unit_type: 'Piece', sale_type: 'wholesale', handling_time: 7 },
      video_url: 'https://play.video/3277118',
      skus: [
        {
          sku_id: 76567137,
          seller_sku_id: '50148840_76567137',
          unit: 'Piece',
          image: 'https://img/sku1.jpg',
          sku_attr_list: [
            {
              attr_name_desc: 'color',
              attr_value_desc: 'Light Grey',
              attr_value_image: 'https://img/sku1_100x100.jpg',
            },
            { attr_name_desc: 'size', attr_value_desc: '8*10cm', attr_value_image: '' },
          ],
          ladder_price: [
            { min_quantity: 1, max_quantity: 99, price: 2, currency: 'USD' },
            { min_quantity: 100, max_quantity: 999, price: 1.8, currency: 'USD' },
            { min_quantity: 1000, max_quantity: -1, price: 1.4, currency: 'USD' },
          ],
        },
      ],
    },
  },
};

describe('toNormalizedFromBuyerDescription（搬运他人商品）', () => {
  it('买家详情 → 归一化：起订档价 + 完整阶梯、SKU 销售属性、主图/详情图拆分、视频、描述清洗', () => {
    const n = toNormalizedFromBuyerDescription(BUYER_SAMPLE, 'https://src/url');
    expect(n.sourcePlatform).toBe('Alibaba.com');
    expect(n.sourceProductId).toBe('50148840');
    expect(n.sourceUrl).toBe('https://src/url');
    expect(n.titleOriginal).toBe('Stainless Steel Meat Thermometer');
    expect(n.priceOriginal).toBe(2); // 起订档价（min_quantity=1 那档），不是全阶梯最低 1.4
    expect(n.currencyOriginal).toBe('USD');
    expect(n.categoryOriginal).toBe('Household Thermometers');
    expect(n.skus).toEqual([
      {
        sku: '50148840_76567137',
        specName: 'color/size',
        specValue: 'Light Grey/8*10cm',
        // 结构化销售属性（含色卡图），供“颜色色卡 + 尺寸按钮”维度展示；空 image 归一为 undefined。
        specAttrs: [
          { name: 'color', value: 'Light Grey', image: 'https://img/sku1_100x100.jpg' },
          { name: 'size', value: '8*10cm', image: undefined },
        ],
        imageUrl: 'https://img/sku1.jpg',
        priceOriginal: 2, // 起订档
        ladderPrice: [
          { minQuantity: 1, maxQuantity: 99, price: 2, currency: 'USD' },
          { minQuantity: 100, maxQuantity: 999, price: 1.8, currency: 'USD' },
          { minQuantity: 1000, maxQuantity: -1, price: 1.4, currency: 'USD' },
        ],
        unit: 'Piece',
        stock: undefined,
      },
    ]);
    // 主图：main_image 与 images[0] 去重 → 2 张 role=main；详情图：从装修 HTML 抽 1 张（两个 img 去重）role=detail；再 1 视频
    expect(n.media).toEqual([
      { assetType: 'image', sourceUrl: 'https://img/main.jpg', role: 'main', sort: 0 },
      { assetType: 'image', sourceUrl: 'https://img/d1.jpg', role: 'main', sort: 1 },
      { assetType: 'image', sourceUrl: 'https://img/detail1.jpg', role: 'detail', sort: 2 },
      { assetType: 'video', sourceUrl: 'https://play.video/3277118', role: 'video', sort: 3 },
    ]);
    // 描述清洗为可读纯文本：去 style/图片、表格→`Label | Value`（单元格内 <p>/<br> 不切行）、
    // 解码实体（&#xA0;→空格、&#xFF09;→）），丢空行
    expect(n.descriptionOriginal).toBe('Material | Microfiber\nColors | black white ( MOQ 500 meter )\nMOQ 500）');
    // 装修 HTML 原文完整保留（发布/富文本预览用）。
    expect(n.descriptionHtmlOriginal).toContain('<table>');
    // 全量信息：起订量 / 源平台状态 / 供应商（店铺）/ 贸易信息。
    expect(n.moq).toBe(5);
    expect(n.statusOriginal).toBe('PRODUCT_ONLINE');
    expect(n.shopInfo).toEqual({ supplierName: 'Jiangxi Unipack Bags Co., Ltd.', companyId: 'ec-889900' });
    expect(n.tradeInfo).toEqual({ unit_type: 'Piece', sale_type: 'wholesale', handling_time: 7 });
  });

  it('缺 sourceUrl 时退回 detail_url；空响应不抛', () => {
    expect(toNormalizedFromBuyerDescription(BUYER_SAMPLE).sourceUrl).toBe(
      'https://www.alibaba.com/product-detail/x_50148840.html',
    );
    const empty = toNormalizedFromBuyerDescription({}, 'u', '9');
    expect(empty.sourceProductId).toBe('9');
    expect(empty.titleOriginal).toBe('');
    expect(empty.skus).toEqual([]);
    expect(empty.media).toEqual([]);
    expect(empty.shopInfo).toBeUndefined();
    expect(empty.tradeInfo).toBeUndefined();
  });
});

describe('补充抓取端点映射（关键属性 / 库存 / 证书）', () => {
  it('mapBuyerKeyAttributes：分组属性拍平，多值连接，跨组同名用「组·名」消歧', () => {
    const resp = {
      result: {
        result_data: {
          attributes: [
            {
              type: 'Key attributes',
              attributes: [
                { name: 'Material', values: [{ value: 'Microfiber' }] },
                { name: 'Use', values: [{ value: 'Gift' }, { value: 'Jewelry' }] },
              ],
            },
            { type: 'Other attributes', attributes: [{ name: 'Material', values: [{ value: 'Cloth' }] }] },
          ],
        },
      },
    };
    expect(mapBuyerKeyAttributes(resp)).toEqual({
      Material: 'Microfiber',
      Use: 'Gift, Jewelry',
      'Other attributes·Material': 'Cloth',
    });
    expect(mapBuyerKeyAttributes({})).toEqual({});
  });

  it('mapBuyerInventory + applyInventoryToSkus：按 sku_id 汇总并回填到 seller_sku_id 结尾匹配的 SKU', () => {
    const resp = {
      result: {
        result_data: [
          {
            shipping_from: 'CN',
            inventory_list: [
              { sku_id: 76567137, inventory_count: 120, inventory_unit: 'Piece' },
              { sku_id: 76567138, inventory_count: 80, inventory_unit: 'Piece' },
            ],
          },
          { shipping_from: 'US', inventory_list: [{ sku_id: 76567137, inventory_count: 30 }] },
        ],
      },
    };
    const inv = mapBuyerInventory(resp);
    expect(inv.bySkuId).toEqual({ '76567137': 150, '76567138': 80 });
    expect(inv.total).toBe(230);
    expect(inv.shipFrom).toEqual(['CN', 'US']);
    expect(inv.unit).toBe('Piece');

    const skus = [{ sku: '50148840_76567137' }, { sku: '76567138' }, { sku: 'no-match' }];
    applyInventoryToSkus(skus, inv);
    expect(skus[0].stock).toBe(150);
    expect(skus[1].stock).toBe(80);
    expect(skus[2].stock).toBeUndefined();
  });

  it('mapBuyerCertificates：证书列表映射，全空项丢弃；空响应给 []', () => {
    const resp = {
      result: {
        result_data: [
          { cert_name: 'CE', cert_no: 'CE-2024-001', cert_urls: ['https://cert/ce.pdf'] },
          { cert_name: null, cert_no: null, cert_urls: [] },
        ],
      },
    };
    expect(mapBuyerCertificates(resp)).toEqual([
      { certName: 'CE', certNo: 'CE-2024-001', certUrls: ['https://cert/ce.pdf'] },
    ]);
    expect(mapBuyerCertificates({})).toEqual([]);
  });
});
