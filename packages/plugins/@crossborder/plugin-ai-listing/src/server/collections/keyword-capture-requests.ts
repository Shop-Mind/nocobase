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

const PLATFORM_OPTIONS = [
  { value: 'alibaba', label: 'Alibaba.com', color: 'blue' },
  { value: '1688', label: '1688', color: 'orange' },
  { value: 'amazon', label: 'Amazon', color: 'gold' },
  { value: 'shopee', label: 'Shopee', color: 'volcano' },
];

// 关键词抓取请求表：原生 FormV2 提交后写入，关键词 jsBlock 读最新一条驱动 search→预览→勾选→抓取。uiManageable 同上。
export default defineCollection({
  dataCategory: 'business',
  name: 'aiListingKeywordCaptureRequests',
  title: '关键词抓取请求',
  uiManageable: true,
  createdBy: true,
  fields: [
    {
      type: 'string',
      name: 'keyword',
      interface: 'input',
      title: '关键词',
      uiSchema: {
        type: 'string',
        title: '关键词',
        'x-component': 'Input',
        'x-component-props': { placeholder: '输入搜索关键词，如 women dress / 连衣裙' },
      },
    },
    selectField('capturePlatform', '来源平台', PLATFORM_OPTIONS),
  ],
});
