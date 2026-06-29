/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { defineCollection } from '@nocobase/database';
import { selectField, tracingFields } from '../shared/tracing-fields';

// 媒体处理任务表。任务类表，预留 traceId/errorCode/errorMessage/retryable/status/metadata。
export default defineCollection({
  dataCategory: 'business',
  name: 'aiListingMediaJobs',
  title: 'Media jobs',
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
    {
      type: 'belongsTo',
      name: 'asset',
      target: 'aiListingMediaAssets',
      foreignKey: 'assetId',
      targetKey: 'id',
      interface: 'm2o',
      title: 'Asset',
    },
    selectField('jobType', 'Job type', [
      { value: 'remove_watermark', label: 'Remove watermark', color: 'gold' },
      { value: 'white_bg', label: 'White background', color: 'cyan' },
      { value: 'crop', label: 'Crop', color: 'blue' },
      { value: 'scene', label: 'Scene', color: 'purple' },
      { value: 'video', label: 'Video', color: 'magenta' },
    ]),
    selectField(
      'status',
      'Status',
      [
        { value: 'pending', label: 'Pending', color: 'default' },
        { value: 'running', label: 'Running', color: 'blue' },
        { value: 'success', label: 'Success', color: 'green' },
        { value: 'failed', label: 'Failed', color: 'red' },
      ],
      { defaultValue: 'pending' },
    ),
    { type: 'bigInt', name: 'inputFileId', interface: 'integer', title: 'Input file' },
    { type: 'bigInt', name: 'outputFileId', interface: 'integer', title: 'Output file' },
    { type: 'integer', name: 'durationMs', interface: 'integer', title: 'Duration (ms)' },
    ...tracingFields,
  ],
});
