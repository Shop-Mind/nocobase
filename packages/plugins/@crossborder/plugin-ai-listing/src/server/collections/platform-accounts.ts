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

// 平台账号表。`credentialRef` 仅是指向密钥保管处（env / 密钥服务）的引用，绝不存明文密钥，
// 且通过 ACL 仅允许管理员读取（运营/审核/只读角色不授予该字段权限）。
export default defineCollection({
  dataCategory: 'business',
  name: 'aiListingPlatformAccounts',
  title: 'Platform accounts',
  fields: [
    { type: 'string', name: 'platform', interface: 'input', title: 'Platform' },
    { type: 'string', name: 'storeName', interface: 'input', title: 'Store name' },
    selectField(
      'authStatus',
      'Auth status',
      [
        { value: 'connected', label: 'Connected', color: 'green' },
        { value: 'expired', label: 'Expired', color: 'gold' },
        { value: 'disconnected', label: 'Disconnected', color: 'red' },
      ],
      { defaultValue: 'disconnected' },
    ),
    // 凭证引用，敏感字段：不明文展示，仅管理员可读。
    { type: 'string', name: 'credentialRef', interface: 'input', title: 'Credential ref' },
    { type: 'date', name: 'expiresAt', interface: 'datetime', title: 'Expires at' },
    { type: 'jsonb', name: 'settings', interface: 'json', title: 'Settings' },
  ],
});
