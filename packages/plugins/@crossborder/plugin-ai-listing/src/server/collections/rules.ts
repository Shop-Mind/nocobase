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

// 处理规则表。承载翻译 / 价格 / 字段映射 / 媒体处理配置与 AI 提示词模板。
export default defineCollection({
  dataCategory: 'business',
  // uiManageable + titleField（快速搬运表单下拉）：db2cm 在 upgrade 时暴露到 UI 数据源，关联选择按规则名显示。
  uiManageable: true,
  titleField: 'name',
  name: 'aiListingRules',
  title: 'Rules',
  updatedBy: true,
  fields: [
    { type: 'string', name: 'ruleCode', interface: 'input', title: 'Rule code' },
    { type: 'string', name: 'name', interface: 'input', title: 'Name' },
    selectField('ruleType', 'Rule type', [
      { value: 'info', label: 'Info', color: 'blue' },
      { value: 'image', label: 'Image', color: 'gold' },
      { value: 'video', label: 'Video', color: 'purple' },
    ]),
    { type: 'string', name: 'sourcePlatform', interface: 'input', title: 'Source platform' },
    { type: 'string', name: 'targetPlatform', interface: 'input', title: 'Target platform' },
    { type: 'boolean', name: 'enabled', interface: 'checkbox', title: 'Enabled', defaultValue: true },
    { type: 'jsonb', name: 'config', interface: 'json', title: 'Config' },
    { type: 'jsonb', name: 'mappingRows', interface: 'json', title: 'Mapping rows' },
    { type: 'text', name: 'promptTemplate', interface: 'textarea', title: 'Prompt template' },
  ],
});
