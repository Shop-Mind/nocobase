/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { defineCollection } from '@nocobase/database';

// 系统配置表（Phase 9，设置页）。单例：固定 `scope='global'` 一行，存非敏感运营偏好。
// 绝不存任何密钥/凭证；平台凭证仍只在 env / 密钥服务，经 aiListingPlatformAccounts.credentialRef 引用。
export default defineCollection({
  dataCategory: 'business',
  name: 'aiListingConfig',
  title: 'System config',
  fields: [
    { type: 'string', name: 'scope', interface: 'input', title: 'Scope', defaultValue: 'global', unique: true },
    { type: 'string', name: 'defaultPlatform', interface: 'input', title: 'Default platform' },
    { type: 'bigInt', name: 'defaultRuleId', interface: 'integer', title: 'Default rule' },
    // 缺省库存（QT4）：>0 时快速搬运发布节点对无库存商品兜底写入该值；null/0 = 关闭（行为与历史一致）。
    { type: 'integer', name: 'defaultStock', interface: 'integer', title: 'Default stock' },
    { type: 'boolean', name: 'crawl4aiEnabled', interface: 'checkbox', title: 'Crawl4AI enabled', defaultValue: false },
    // OpenAPI 出口 IP 是否已加入平台白名单（运营侧事实开关，非密钥）。
    {
      type: 'boolean',
      name: 'openApiIpWhitelisted',
      interface: 'checkbox',
      title: 'OpenAPI IP whitelisted',
      defaultValue: false,
    },
  ],
});
