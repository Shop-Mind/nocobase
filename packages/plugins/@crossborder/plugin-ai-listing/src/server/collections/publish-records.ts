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

// 发布记录表。任务类表，预留 traceId/errorCode/errorMessage/retryable/status/metadata。
// `result` 为业务结果，`status` 为执行状态；失败原因复用 tracingFields.errorMessage。
export default defineCollection({
  dataCategory: 'business',
  name: 'aiListingPublishRecords',
  title: 'Publish records',
  fields: [
    {
      type: 'belongsTo',
      name: 'batch',
      target: 'aiListingPublishBatches',
      foreignKey: 'batchId',
      targetKey: 'id',
      interface: 'm2o',
      title: 'Publish batch',
    },
    {
      type: 'belongsTo',
      name: 'product',
      target: 'aiListingProducts',
      foreignKey: 'productId',
      targetKey: 'id',
      interface: 'm2o',
      title: 'Product',
    },
    { type: 'string', name: 'targetPlatform', interface: 'input', title: 'Target platform' },
    { type: 'bigInt', name: 'targetStoreId', interface: 'integer', title: 'Target store' },
    selectField('result', 'Result', [
      { value: 'success', label: 'Success', color: 'green' },
      { value: 'failed', label: 'Failed', color: 'red' },
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
    { type: 'string', name: 'targetProductId', interface: 'input', title: 'Target product ID' },
    { type: 'text', name: 'targetUrl', interface: 'url', title: 'Target URL' },
    { type: 'text', name: 'failureReason', interface: 'textarea', title: 'Failure reason' },
    { type: 'jsonb', name: 'requestPayload', interface: 'json', title: 'Request payload' },
    { type: 'jsonb', name: 'responsePayload', interface: 'json', title: 'Response payload' },
    { type: 'date', name: 'publishedAt', interface: 'datetime', title: 'Published at' },
    ...tracingFields,
  ],
});
