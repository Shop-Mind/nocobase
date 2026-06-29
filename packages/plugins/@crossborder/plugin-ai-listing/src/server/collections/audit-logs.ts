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

// 审计日志表。记录人 / AI 员工 / 系统对商品、规则、发布、账号等的字段级变更，供审计与 AI 失败解释使用。
export default defineCollection({
  dataCategory: 'business',
  name: 'aiListingAuditLogs',
  title: 'Audit logs',
  fields: [
    selectField('actorType', 'Actor type', [
      { value: 'user', label: 'User', color: 'blue' },
      { value: 'ai_employee', label: 'AI employee', color: 'purple' },
      { value: 'system', label: 'System', color: 'default' },
    ]),
    { type: 'string', name: 'actorId', interface: 'input', title: 'Actor ID' },
    { type: 'string', name: 'action', interface: 'input', title: 'Action' },
    selectField('resourceType', 'Resource type', [
      { value: 'product', label: 'Product', color: 'blue' },
      { value: 'rule', label: 'Rule', color: 'gold' },
      { value: 'publish', label: 'Publish', color: 'geekblue' },
      { value: 'account', label: 'Account', color: 'volcano' },
    ]),
    { type: 'bigInt', name: 'resourceId', interface: 'integer', title: 'Resource ID' },
    { type: 'string', name: 'fieldName', interface: 'input', title: 'Field name' },
    { type: 'jsonb', name: 'oldValue', interface: 'json', title: 'Old value' },
    { type: 'jsonb', name: 'newValue', interface: 'json', title: 'New value' },
    { type: 'text', name: 'reason', interface: 'textarea', title: 'Reason' },
    { type: 'string', name: 'traceId', interface: 'input', title: 'Trace ID' },
  ],
});
