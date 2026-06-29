/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { CollectionOptions } from '@nocobase/database';

// 任务相关表的统一追踪/错误骨架字段。与每张任务表自身的 `status` 枚举一起，构成 PRD 要求的六个预留字段：
// traceId / errorCode / errorMessage / retryable / status / metadata。`status` 因各表枚举不同，由各表单独定义。
export const tracingFields: CollectionOptions['fields'] = [
  {
    type: 'string',
    name: 'traceId',
    interface: 'input',
    title: 'Trace ID',
  },
  {
    type: 'string',
    name: 'errorCode',
    interface: 'input',
    title: 'Error code',
  },
  {
    type: 'text',
    name: 'errorMessage',
    interface: 'textarea',
    title: 'Error message',
  },
  {
    type: 'boolean',
    name: 'retryable',
    interface: 'checkbox',
    title: 'Retryable',
    defaultValue: false,
  },
  {
    type: 'jsonb',
    name: 'metadata',
    interface: 'json',
    title: 'Metadata',
  },
];

// 构造一个带 i18n 标题与颜色标签的本地下拉选择字段，便于自动生成的表格直接可读。
export function selectField(
  name: string,
  title: string,
  options: Array<{ value: string; label: string; color?: string }>,
  extra: Record<string, unknown> = {},
): CollectionOptions['fields'][number] {
  return {
    type: 'string',
    name,
    interface: 'select',
    title,
    uiSchema: {
      type: 'string',
      title,
      'x-component': 'Select',
      enum: options.map((o) => ({ color: 'default', ...o })),
    },
    ...extra,
  };
}
