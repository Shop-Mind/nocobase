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

// 图片 / 视频资产表。sourceFileId / processedFileId 指向 File Manager 的文件记录，后续阶段接入。
export default defineCollection({
  dataCategory: 'business',
  name: 'aiListingMediaAssets',
  title: 'Media assets',
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
    selectField('assetType', 'Asset type', [
      { value: 'image', label: 'Image', color: 'blue' },
      { value: 'video', label: 'Video', color: 'purple' },
    ]),
    { type: 'text', name: 'sourceUrl', interface: 'url', title: 'Source URL' },
    { type: 'bigInt', name: 'sourceFileId', interface: 'integer', title: 'Source file' },
    { type: 'bigInt', name: 'processedFileId', interface: 'integer', title: 'Processed file' },
    selectField('role', 'Role', [
      { value: 'main', label: 'Main', color: 'gold' },
      { value: 'detail', label: 'Detail', color: 'default' },
      { value: 'sku', label: 'SKU', color: 'cyan' },
      { value: 'video', label: 'Video', color: 'purple' },
    ]),
    { type: 'integer', name: 'sort', interface: 'integer', title: 'Sort' },
    selectField(
      'processStatus',
      'Process status',
      [
        { value: 'pending', label: 'Pending', color: 'default' },
        { value: 'running', label: 'Running', color: 'blue' },
        { value: 'success', label: 'Success', color: 'green' },
        { value: 'failed', label: 'Failed', color: 'red' },
      ],
      { defaultValue: 'pending' },
    ),
    { type: 'string', name: 'processType', interface: 'input', title: 'Process type' },
    { type: 'jsonb', name: 'meta', interface: 'json', title: 'Meta' },
  ],
});
