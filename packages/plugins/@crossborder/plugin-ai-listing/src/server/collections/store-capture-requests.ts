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

// 店铺抓取请求表：原生 FormV2 提交后写入，店铺 jsBlock 读最新一条驱动 analyze→预览→勾选→抓取。uiManageable 同上。
export default defineCollection({
  dataCategory: 'business',
  name: 'aiListingStoreCaptureRequests',
  title: '店铺抓取请求',
  uiManageable: true,
  createdBy: true,
  fields: [
    {
      type: 'text',
      name: 'storeUrl',
      interface: 'url',
      title: '店铺链接',
      uiSchema: {
        type: 'string',
        title: '店铺链接',
        'x-component': 'Input.URL',
        'x-component-props': { placeholder: '粘贴 Alibaba.com 店铺/供应商链接' },
      },
    },
    selectField('capturePlatform', '来源平台', PLATFORM_OPTIONS),
  ],
});
