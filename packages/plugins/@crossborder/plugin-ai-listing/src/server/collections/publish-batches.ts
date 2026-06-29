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

// 发布批次表。任务类表，预留 traceId/errorCode/errorMessage/retryable/status/metadata。
export default defineCollection({
  dataCategory: 'business',
  name: 'aiListingPublishBatches',
  title: 'Publish batches',
  fields: [
    { type: 'uid', name: 'batchNo', interface: 'input', title: 'Batch No.' },
    { type: 'string', name: 'targetPlatform', interface: 'input', title: 'Target platform' },
    { type: 'bigInt', name: 'targetStoreId', interface: 'integer', title: 'Target store' },
    { type: 'string', name: 'categoryTargetId', interface: 'input', title: 'Target category' },
    { type: 'string', name: 'shippingTemplateId', interface: 'input', title: 'Shipping template' },
    selectField(
      'strategy',
      'Strategy',
      [
        { value: 'immediate', label: 'Immediate', color: 'green' },
        { value: 'scheduled', label: 'Scheduled', color: 'gold' },
        { value: 'draft', label: 'Draft', color: 'default' },
      ],
      { defaultValue: 'draft' },
    ),
    selectField(
      'speedMode',
      'Speed mode',
      [
        { value: 'standard', label: 'Standard', color: 'blue' },
        { value: 'fast', label: 'Fast', color: 'volcano' },
        { value: 'safe', label: 'Safe', color: 'green' },
      ],
      { defaultValue: 'standard' },
    ),
    selectField(
      'status',
      'Status',
      [
        { value: 'pending', label: 'Pending', color: 'default' },
        { value: 'running', label: 'Running', color: 'blue' },
        { value: 'success', label: 'Success', color: 'green' },
        { value: 'partial_failed', label: 'Partial failed', color: 'orange' },
        { value: 'failed', label: 'Failed', color: 'red' },
      ],
      { defaultValue: 'pending' },
    ),
    { type: 'integer', name: 'totalCount', interface: 'integer', title: 'Total count', defaultValue: 0 },
    { type: 'integer', name: 'successCount', interface: 'integer', title: 'Success count', defaultValue: 0 },
    { type: 'integer', name: 'failedCount', interface: 'integer', title: 'Failed count', defaultValue: 0 },
    { type: 'date', name: 'scheduledAt', interface: 'datetime', title: 'Scheduled at' },
    {
      type: 'hasMany',
      name: 'records',
      target: 'aiListingPublishRecords',
      foreignKey: 'batchId',
      interface: 'o2m',
      title: 'Publish records',
    },
    ...tracingFields,
  ],
});
