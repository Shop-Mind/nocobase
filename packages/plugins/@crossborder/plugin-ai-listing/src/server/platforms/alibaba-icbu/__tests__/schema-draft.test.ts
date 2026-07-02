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
import { buildDraftXml, fieldsBetween, parseSchemaFields } from '../schema-draft';

// 迷你版类目规则 XML（结构与真实 schema/get 返回一致：必填材质单选、必填自定义颜色销售属性、售卖单位）。
const SCHEMA_XML =
  '<itemSchema>' +
  '<field id="icbuCatProp" name="Product feature" type="complex">' +
  '<field id="p-100" name="material" type="singleCheck"><rules><rule name="requiredRule" value="true"/></rules>' +
  '<options><option displayName="Polyester" value="1"/><option displayName="Microfiber Fabrics" value="2"/></options></field>' +
  '<field id="p-101" name="style" type="multiCheck"><rules><rule name="requiredRule" value="true"/></rules>' +
  '<options><option displayName="Fashion" value="9"/></options></field>' +
  '</field>' +
  '<field id="saleProp" name="Sales Property" type="complex">' +
  '<field id="p-200" name="color" type="multiCheck"><rules><rule name="requiredRule" value="true"/>' +
  '<rule name="valueAttributeRule" value="inputValue" desc="输入属性值"/></rules>' +
  '<options><option displayName="Gray" value="55"/></options></field>' +
  '</field>' +
  '<field id="sku" name="SKU" type="multiComplex"></field>' +
  '<field id="priceUnit" name="Unit" type="singleCheck">' +
  '<options><option displayName="Bag/Bags" value="1"/><option displayName="Piece/Pieces" value="4"/></options></field>' +
  '<field id="productTitle" name="商品名称" type="input"><rules>' +
  '<rule name="maxLengthRule" value="128" exProperty="include" unit="byte"/>' +
  '<rule name="regexRule" value="\\w+(?:[\\-+.]\\w+)*@\\w+(?:[\\-.]\\w+)*\\.\\w+(?:[\\-.]\\w+)*" exProperty="not include"/>' +
  '</rules></field>' +
  '<field id="productKeywords" name="Product keywords" type="complex">' +
  '<field id="productKeywords_0" name="Product keywords" type="input"><rules>' +
  '<rule name="maxLengthRule" value="384" exProperty="include" unit="byte"/>' +
  '</rules></field></field>' +
  '<field id="productDescType" name="Product description" type="singleCheck">' +
  '<options><option displayName="智能编辑" value="1"/><option displayName="普通编辑" value="2"/></options></field>' +
  '<field id="detailImage" name="Details of the picture" type="multiComplex"><rules><rule name="requiredRule" value="true"/></rules>' +
  '<field id="gallery" name="gallery" type="singleCheck">' +
  '<options><option displayName="Scene image" value="200"/><option displayName="Detail shot" value="300"/></options></field>' +
  '<field id="images" name="images" type="multiComplex"></field>' +
  '</field>' +
  '<field id="textDesc" name="Product Highlights" type="input"></field>' +
  '<field id="imageVideo" name="Product Video" type="singleCheck"></field>' +
  '</itemSchema>';

const PAYLOAD: PublishPayload = {
  categoryId: '201726906',
  title: '超细纤维拉绳袋',
  description: '产品特点\n材料 | 超细纤维',
  price: 8.12,
  currency: 'CNY',
  stock: 28000,
  moq: 100,
  unit: 'Bag',
  images: ['https://sc04.alicdn.com/kf/main.jpg_100x100.jpg', 'https://sc04.alicdn.com/kf/a.jpg'],
  variants: [
    {
      sku: 'a',
      attrs: [
        { name: '颜色', value: '灰色' },
        { name: '尺寸', value: '8cm' },
      ],
      imageUrl: 'https://sc04.alicdn.com/kf/gray.jpg_100x100.jpg',
    },
    {
      sku: 'b',
      attrs: [
        { name: '颜色', value: '灰色' },
        { name: '尺寸', value: '10cm' },
      ],
    },
    {
      sku: 'c',
      attrs: [
        { name: '颜色', value: '蓝色' },
        { name: '尺寸', value: '8cm' },
      ],
    },
  ],
  attributes: { 材质: '超细纤维', 产地: '中国' },
};

describe('parseSchemaFields / fieldsBetween', () => {
  it('平铺解析字段与选项，按位置归属父块', () => {
    const fields = parseSchemaFields(SCHEMA_XML);
    const cat = fieldsBetween(fields, 'icbuCatProp', 'saleProp');
    expect(cat.map((f) => f.id)).toEqual(['p-100', 'p-101']);
    expect(cat[0].required).toBe(true);
    expect(cat[0].options).toHaveLength(2);
    const sale = fieldsBetween(fields, 'saleProp', 'sku');
    expect(sale.map((f) => f.id)).toEqual(['p-200']);
    expect(sale[0].customInput).toBe(true);
  });
});

describe('buildDraftXml', () => {
  const MEDIA = {
    mainImages: [
      { url: 'https://photobank.alicdn.com/main.jpg', fileId: '441' },
      { url: 'https://photobank.alicdn.com/a.jpg' },
    ],
    detailImages: ['https://photobank.alicdn.com/d1.jpg', 'https://photobank.alicdn.com/d2.jpg'],
    videoId: '6000123456789',
  };

  it('官方格式：complex-value 包装、主图带 fileId、色卡 img、结构化详描、价格折算', () => {
    const { xml, notes } = buildDraftXml(PAYLOAD, SCHEMA_XML, MEDIA);
    // 材质：超细纤维 → Microfiber Fabrics(2)，complex-value 包装（不是 <fields>）
    expect(xml).toContain(
      '<field id="icbuCatProp" type="complex"><complex-value><field id="p-100" type="singleCheck"><value>2</value></field>',
    );
    expect(xml).not.toContain('<fields>');
    // 风格无匹配 → 第一项 + note
    expect(notes.join('；')).toContain('style');
    // 颜色自定义值（去重后 2 个，负数编号），灰色带色卡图
    expect(xml).toContain('<value img="https://sc04.alicdn.com/kf/gray.jpg" inputValue="灰色">-1</value>');
    expect(xml).toContain('inputValue="蓝色">-2</value>');
    // 主图：图片银行 URL + fileId 属性
    expect(xml).toContain(
      '<field id="scImages_0" type="input"><value fileId="441">https://photobank.alicdn.com/main.jpg</value></field>',
    );
    expect(xml).toContain(
      '<field id="scImages_1" type="input"><value>https://photobank.alicdn.com/a.jpg</value></field>',
    );
    // 单位 Bag → 1
    expect(xml).toContain('<field id="priceUnit" type="singleCheck"><value>1</value></field>');
    // 价格折算：8.12 CNY / 7.2 = 1.13 USD，ladderPrice complex-value 嵌套
    expect(xml).toContain('<field id="price" type="input"><value>1.13</value></field>');
    expect(notes.join('；')).toContain('USD');
    // 无运费模板 → 买卖双方协商物流
    expect(xml).toContain('<value>freightNegotiation</value>');
  });

  it('结构化详描：detailImage 官方 multiComplex 格式（重复 complex-values）+ textDesc 卖点，不设 productDescType/superText', () => {
    const { xml, notes } = buildDraftXml(PAYLOAD, SCHEMA_XML, MEDIA);
    // detailImage：一个图集实例（细节图 300），images 子 multiComplex 每张图一个 complex-values（无 complex-value 包装）
    expect(xml).toContain(
      '<field id="detailImage" type="multiComplex"><complex-values><field id="images" type="multiComplex">' +
        '<complex-values><field id="imageURL" type="input"><value>https://photobank.alicdn.com/d1.jpg</value></field></complex-values>' +
        '<complex-values><field id="imageURL" type="input"><value>https://photobank.alicdn.com/d2.jpg</value></field></complex-values>' +
        '</field><field id="gallery" type="singleCheck"><value displayName="Detail shot">300</value></field></complex-values></field>',
    );
    expect(xml).not.toContain('<complex-values><complex-value>');
    // 卖点：描述纯文本化后写入 textDesc
    expect(xml).toContain('<field id="textDesc" type="input"><value>产品特点 材料 | 超细纤维</value></field>');
    // 结构化详描不与普通编辑字段混用
    expect(xml).not.toContain('superText');
    expect(xml).not.toContain('productDescType');
    // 主图视频 video_id 直填 imageVideo
    expect(xml).toContain('<field id="imageVideo" type="singleCheck"><value>6000123456789</value></field>');
    expect(notes.join('；')).toContain('详情图已随草稿写入结构化详描');
  });

  it('关键词只有一组 productKeywords_0，多词换行分隔并按 384 字节截断', () => {
    const { xml } = buildDraftXml({ ...PAYLOAD, keywords: 'dust bag, drawstring bag; 拉绳袋' }, SCHEMA_XML, MEDIA);
    expect(xml).toContain(
      '<field id="productKeywords" type="complex"><complex-value>' +
        '<field id="productKeywords_0" type="input"><value>dust bag\ndrawstring bag\n拉绳袋</value></field>' +
        '</complex-value></field>',
    );
    expect(xml).not.toContain('productKeywords_1');
  });

  it('标题按 schema rule 预检：超 128 字节截断并剔除邮箱', () => {
    const longTitle = `联系 seller@example.com 超细纤维拉绳束口袋${'超长标题填充'.repeat(20)}`;
    const { xml, notes } = buildDraftXml({ ...PAYLOAD, title: longTitle }, SCHEMA_XML, MEDIA);
    const m = xml.match(/<field id="productTitle" type="input"><value>([^<]*)<\/value>/);
    if (!m) throw new Error('未输出 productTitle');
    expect(m[1]).not.toContain('seller@example.com');
    expect(Buffer.byteLength(m[1], 'utf8')).toBeLessThanOrEqual(128);
    expect(notes.join('；')).toContain('已自动截断');
  });

  it('无 media 时不输出 scImages/detailImage/imageVideo，仍可产出合法 XML', () => {
    const { xml } = buildDraftXml(PAYLOAD, SCHEMA_XML);
    expect(xml).not.toContain('scImages_0');
    expect(xml).not.toContain('detailImage');
    expect(xml).not.toContain('imageVideo');
    expect(xml).toContain('<field id="productTitle" type="input">');
  });
});
