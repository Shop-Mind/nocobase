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
    { type: 'decimal', name: 'priceOriginal', interface: 'number', title: 'Price (original)' },
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
