/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { defineCollection } from '@nocobase/database';
import { selectField } from '../shared/tracing-fields';

// SKU / 变体表。归属商品，可选关联一张 SKU 图片资产。
export default defineCollection({
  dataCategory: 'business',
  name: 'aiListingSkus',
  title: 'SKUs',
  fields: [
    {
      type: 'belongsTo',
      name: 'product',
      target: 'aiListingProducts',
      foreignKey: 'productId',
      targetKey: 'id',
      interface: 'm2o',
      title: 'Product',
    },
    { type: 'string', name: 'sku', interface: 'input', title: 'SKU' },
    { type: 'string', name: 'specName', interface: 'input', title: 'Spec name' },
    { type: 'string', name: 'specValue', interface: 'input', title: 'Spec value' },
    // 结构化销售属性：[{ name, value, image? }]（如 颜色=灰色+色卡图、尺寸=8*10cm），供源站同款“色卡+按钮”维度展示。
    { type: 'jsonb', name: 'specAttrs', interface: 'json', title: 'Spec attributes' },
    // SKU 主图 URL（源站）。imageAsset 关联留给后续媒体处理，展示直接用该 URL。
    { type: 'text', name: 'imageUrl', interface: 'url', title: 'SKU image URL' },
    { type: 'string', name: 'unit', interface: 'input', title: 'Unit' },
    { type: 'decimal', name: 'priceOriginal', interface: 'number', title: 'Price (original)' },
    // 完整阶梯价：[{ minQuantity, maxQuantity(-1=无上限), price, currency }]。priceOriginal 为起订档价（展示基准）。
    { type: 'jsonb', name: 'ladderPrice', interface: 'json', title: 'Ladder price' },
    { type: 'decimal', name: 'priceTarget', interface: 'number', title: 'Price (target)' },
    { type: 'integer', name: 'stock', interface: 'integer', title: 'Stock' },
    {
      type: 'belongsTo',
      name: 'imageAsset',
      target: 'aiListingMediaAssets',
      foreignKey: 'imageAssetId',
      targetKey: 'id',
      interface: 'm2o',
      title: 'SKU image',
    },
    selectField(
      'status',
      'Status',
      [
        { value: 'active', label: 'Active', color: 'green' },
        { value: 'inactive', label: 'Inactive', color: 'default' },
      ],
      { defaultValue: 'active' },
    ),
  ],
});
