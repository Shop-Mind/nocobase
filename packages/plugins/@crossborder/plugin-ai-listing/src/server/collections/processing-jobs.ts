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

// 信息处理任务表。任务类表，预留 traceId/errorCode/errorMessage/retryable/status/metadata。
export default defineCollection({
  dataCategory: 'business',
  name: 'aiListingProcessingJobs',
  title: 'Processing jobs',
  fields: [
    { type: 'uid', name: 'jobNo', interface: 'input', title: 'Job No.' },
    {
      type: 'belongsTo',
      name: 'rule',
      target: 'aiListingRules',
      foreignKey: 'ruleId',
      targetKey: 'id',
      interface: 'm2o',
      title: 'Rule',
    },
    { type: 'jsonb', name: 'productIds', interface: 'json', title: 'Product IDs' },
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
    { type: 'string', name: 'currentStage', interface: 'input', title: 'Current stage' },
    { type: 'integer', name: 'totalCount', interface: 'integer', title: 'Total count', defaultValue: 0 },
    { type: 'integer', name: 'successCount', interface: 'integer', title: 'Success count', defaultValue: 0 },
    { type: 'integer', name: 'failedCount', interface: 'integer', title: 'Failed count', defaultValue: 0 },
    { type: 'integer', name: 'progress', interface: 'integer', title: 'Progress', defaultValue: 0 },
    { type: 'jsonb', name: 'logs', interface: 'json', title: 'Logs' },
    ...tracingFields,
  ],
});
