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

// 任务步骤明细表。抓取/处理/媒体/发布/导入各类任务都把每一步写入此表，用于展示进度与失败原因。
// taskId 为多态关联（按 taskType 指向不同任务表），骨架阶段用 taskType + taskId 标量保存，不建强外键。
export default defineCollection({
  dataCategory: 'business',
  name: 'aiListingTaskSteps',
  title: 'Task steps',
  fields: [
    selectField('taskType', 'Task type', [
      { value: 'capture', label: 'Capture', color: 'blue' },
      { value: 'process', label: 'Process', color: 'gold' },
      { value: 'media', label: 'Media', color: 'purple' },
      { value: 'publish', label: 'Publish', color: 'geekblue' },
      { value: 'import', label: 'Import', color: 'cyan' },
    ]),
    { type: 'bigInt', name: 'taskId', interface: 'integer', title: 'Task ID' },
    {
      type: 'belongsTo',
      name: 'product',
      target: 'aiListingProducts',
      foreignKey: 'productId',
      targetKey: 'id',
      interface: 'm2o',
      title: 'Product',
    },
    { type: 'string', name: 'stepName', interface: 'input', title: 'Step name' },
    { type: 'text', name: 'sourceUrl', interface: 'url', title: 'Source URL' },
    selectField(
      'status',
      'Status',
      [
        { value: 'pending', label: 'Pending', color: 'default' },
        { value: 'running', label: 'Running', color: 'blue' },
        { value: 'success', label: 'Success', color: 'green' },
        { value: 'failed', label: 'Failed', color: 'red' },
        { value: 'skipped', label: 'Skipped', color: 'default' },
      ],
      { defaultValue: 'pending' },
    ),
    { type: 'jsonb', name: 'inputSnapshot', interface: 'json', title: 'Input snapshot' },
    { type: 'jsonb', name: 'outputSnapshot', interface: 'json', title: 'Output snapshot' },
    { type: 'jsonb', name: 'rawSnapshot', interface: 'json', title: 'Raw snapshot' },
    { type: 'integer', name: 'durationMs', interface: 'integer', title: 'Duration (ms)' },
    ...tracingFields,
  ],
});
