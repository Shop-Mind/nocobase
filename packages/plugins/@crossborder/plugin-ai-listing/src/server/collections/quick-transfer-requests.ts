/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { defineCollection } from '@nocobase/database';

// 快速搬运请求表：原生 FormV2 表单提交即建一行，工作流「快速搬运流水线」以 collection 触发（新增记录）接管全链
// （抓取 → 信息处理 → 改图人工卡点 → 提审 → 发布草稿）。与 aiListingUrlCaptureRequests（afterCreate 钩子只桥接抓取）互不干扰。
// uiManageable=true：db2cm 在 install/enable/upgrade 时把本表暴露到 UI 数据源，原生表单可绑定（AI 员工 formFiller 可填）。
export default defineCollection({
  dataCategory: 'business',
  name: 'aiListingQuickTransferRequests',
  title: '快速搬运请求',
  uiManageable: true,
  createdBy: true,
  fields: [
    {
      type: 'text',
      name: 'sourceUrl',
      interface: 'url',
      title: '商品链接',
      uiSchema: {
        type: 'string',
        title: '商品链接',
        'x-component': 'Input.URL',
        'x-component-props': {
          placeholder: '粘贴 Alibaba.com 商品详情页链接，提交后工作流自动抓取并处理',
        },
      },
    },
    {
      type: 'bigInt',
      name: 'ruleId',
      interface: 'integer',
      title: '处理规则 ID',
      uiSchema: {
        type: 'number',
        title: '处理规则 ID（留空用默认规则）',
        'x-component': 'InputNumber',
      },
    },
    {
      type: 'bigInt',
      name: 'targetStoreId',
      interface: 'integer',
      title: '目标店铺 ID',
      uiSchema: {
        type: 'number',
        title: '目标店铺 ID（留空用默认店铺）',
        'x-component': 'InputNumber',
      },
    },
    {
      type: 'boolean',
      name: 'skipMedia',
      interface: 'checkbox',
      title: '跳过改图直出草稿',
      uiSchema: {
        type: 'boolean',
        title: '跳过改图直出草稿',
        'x-component': 'Checkbox',
      },
    },
  ],
});
