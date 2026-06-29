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

// 抓取任务表。任务类表，预留 traceId/errorCode/errorMessage/retryable/status/metadata（status 见下，其余来自 tracingFields）。
export default defineCollection({
  dataCategory: 'business',
  name: 'aiListingCaptureTasks',
  title: 'Capture tasks',
  createdBy: true,
  fields: [
    { type: 'uid', name: 'taskNo', interface: 'input', title: 'Task No.' },
    selectField('captureType', 'Capture type', [
      { value: 'url', label: 'URL', color: 'blue' },
      { value: 'store', label: 'Store', color: 'cyan' },
      { value: 'keyword', label: 'Keyword', color: 'gold' },
      { value: 'batch', label: 'Batch', color: 'purple' },
    ]),
    { type: 'string', name: 'sourcePlatform', interface: 'input', title: 'Source platform' },
    { type: 'jsonb', name: 'input', interface: 'json', title: 'Input' },
    { type: 'jsonb', name: 'options', interface: 'json', title: 'Options' },
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
    { type: 'integer', name: 'progress', interface: 'integer', title: 'Progress', defaultValue: 0 },
    ...tracingFields,
  ],
});
