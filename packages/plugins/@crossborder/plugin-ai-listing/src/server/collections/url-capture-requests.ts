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

// 平台选项（与 store/keyword 请求表共用）。
const PLATFORM_OPTIONS = [
  { value: 'alibaba', label: 'Alibaba.com', color: 'blue' },
  { value: '1688', label: '1688', color: 'orange' },
  { value: 'amazon', label: 'Amazon', color: 'gold' },
  { value: 'shopee', label: 'Shopee', color: 'volcano' },
];

// URL 抓取请求表：原生 FormV2 表单提交后写入，afterCommit 钩子据此触发一次真实抓取（见 capture/index.ts）。
// uiManageable=true 让 data-source-main 的 db2cm 在 install/enable/upgrade 时把本表暴露到 UI 数据源（原生表单可绑定），
// db2cm 为「不存在才创建」且会拷贝下方 interface/uiSchema/enum，故全新装即带完整字段类型、无需回填。
export default defineCollection({
  dataCategory: 'business',
  name: 'aiListingUrlCaptureRequests',
  title: 'URL 抓取请求',
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
          placeholder: '粘贴 Alibaba.com / 1688 商品详情页链接，如 https://detail.1688.com/offer/xxx.html',
        },
      },
    },
    selectField('capturePlatform', '来源平台', PLATFORM_OPTIONS),
    // 展示语言与币种：决定抓到的标题/描述语言与价格币种，与源页展示对齐（中文站页面选中文·人民币）。
    selectField(
      'captureLocale',
      '语言与币种',
      [
        { value: 'zh-CNY', label: '中文 · 人民币 ¥', color: 'red' },
        { value: 'en-USD', label: 'English · 美元 $', color: 'blue' },
      ],
      { defaultValue: 'zh-CNY' },
    ),
    {
      type: 'array',
      name: 'captureScope',
      interface: 'checkboxGroup',
      title: '抓取内容',
      defaultValue: ['basic', 'images', 'sku', 'priceStock', 'shop', 'attributes', 'inventory'],
      uiSchema: {
        type: 'array',
        title: '抓取内容',
        'x-component': 'Checkbox.Group',
        enum: [
          { value: 'basic', label: '基本信息', color: 'blue' },
          { value: 'images', label: '图片', color: 'cyan' },
          { value: 'sku', label: 'SKU', color: 'green' },
          { value: 'priceStock', label: '价格库存', color: 'gold' },
          // 扩展抓取项：店铺信息随详情返回；关键属性/实时库存/证书各需额外一次接口调用。
          { value: 'shop', label: '店铺信息', color: 'purple' },
          { value: 'attributes', label: '关键属性', color: 'geekblue' },
          { value: 'inventory', label: '实时库存', color: 'orange' },
          { value: 'cert', label: '证书', color: 'magenta' },
          // 评论两项：Alibaba 买家 OpenAPI 无评论接口，勾选会在任务步骤里得到明确告警；真实抓取待爬虫 worker。
          { value: 'productReviews', label: '产品评价', color: 'volcano' },
          { value: 'shopReviews', label: '店铺评价', color: 'lime' },
        ],
      },
    },
  ],
});
