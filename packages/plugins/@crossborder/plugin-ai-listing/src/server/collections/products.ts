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

// 商品主表。原始 / AI 处理 / 最终字段三段分离（标题、描述、参数），让 AI 写建议、人工定最终，互不覆盖。
export default defineCollection({
  dataCategory: 'business',
  name: 'aiListingProducts',
  title: 'Products',
  createdBy: true,
  updatedBy: true,
  fields: [
    { type: 'uid', name: 'productNo', interface: 'input', title: 'Product No.' },
    { type: 'string', name: 'sourcePlatform', interface: 'input', title: 'Source platform' },
    { type: 'text', name: 'sourceUrl', interface: 'url', title: 'Source URL' },
    { type: 'string', name: 'sourceProductId', interface: 'input', title: 'Source product ID' },
    { type: 'string', name: 'targetPlatform', interface: 'input', title: 'Target platform' },
    { type: 'bigInt', name: 'targetStoreId', interface: 'integer', title: 'Target store' },

    { type: 'string', name: 'titleOriginal', interface: 'input', title: 'Title (original)' },
    { type: 'string', name: 'titleProcessed', interface: 'input', title: 'Title (AI processed)' },
    { type: 'string', name: 'titleFinal', interface: 'input', title: 'Title (final)' },
    { type: 'text', name: 'descriptionOriginal', interface: 'textarea', title: 'Description (original)' },
    { type: 'text', name: 'descriptionProcessed', interface: 'textarea', title: 'Description (AI processed)' },
    { type: 'text', name: 'descriptionFinal', interface: 'textarea', title: 'Description (final)' },

    { type: 'decimal', name: 'priceOriginal', interface: 'number', title: 'Price (original)' },
    { type: 'string', name: 'currencyOriginal', interface: 'input', title: 'Currency (original)' },
    { type: 'decimal', name: 'priceTarget', interface: 'number', title: 'Price (target)' },
    { type: 'decimal', name: 'listPriceTarget', interface: 'number', title: 'List price (target)' },
    { type: 'integer', name: 'stock', interface: 'integer', title: 'Stock' },

    { type: 'string', name: 'categoryOriginal', interface: 'input', title: 'Category (source)' },
    { type: 'string', name: 'categoryTargetId', interface: 'input', title: 'Category (target)' },
    { type: 'jsonb', name: 'attributesOriginal', interface: 'json', title: 'Attributes (original)' },
    { type: 'jsonb', name: 'attributesProcessed', interface: 'json', title: 'Attributes (processed)' },
    { type: 'jsonb', name: 'riskFlags', interface: 'json', title: 'Risk flags' },

    selectField(
      'status',
      'Status',
      [
        { value: 'draft', label: 'Draft', color: 'default' },
        { value: 'capturing', label: 'Capturing', color: 'blue' },
        { value: 'captured', label: 'Captured', color: 'cyan' },
        { value: 'processing', label: 'Processing', color: 'gold' },
        { value: 'processed', label: 'Processed', color: 'lime' },
        { value: 'process_failed', label: 'Process failed', color: 'red' },
        { value: 'reviewing', label: 'Reviewing', color: 'orange' },
        { value: 'reviewed', label: 'Reviewed', color: 'green' },
        { value: 'publishing', label: 'Publishing', color: 'geekblue' },
        { value: 'published', label: 'Published', color: 'green' },
        { value: 'publish_failed', label: 'Publish failed', color: 'red' },
        { value: 'archived', label: 'Archived', color: 'default' },
      ],
      { defaultValue: 'draft' },
    ),
    selectField('reviewStatus', 'Review status', [
      { value: 'pending', label: 'Pending', color: 'default' },
      { value: 'reviewed', label: 'Reviewed', color: 'green' },
      { value: 'rejected', label: 'Rejected', color: 'red' },
    ]),

    {
      type: 'hasMany',
      name: 'skus',
      target: 'aiListingSkus',
      foreignKey: 'productId',
      interface: 'o2m',
      title: 'SKUs',
    },
    {
      type: 'hasMany',
      name: 'mediaAssets',
      target: 'aiListingMediaAssets',
      foreignKey: 'productId',
      interface: 'o2m',
      title: 'Media assets',
    },
  ],
});
