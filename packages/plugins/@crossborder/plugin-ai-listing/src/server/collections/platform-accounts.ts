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
  // uiManageable + titleField（快速搬运表单下拉）：db2cm 在 upgrade 时暴露到 UI 数据源，关联选择按名称显示。
  // 平台账号敏感列已有全局护栏：*Enc 密文对所有角色剥离、credentialRef 仅特权角色可见（见 acl/index.ts）。
  uiManageable: true,
  titleField: 'storeName',
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
    // OAuth token 加密落库（AES-256-GCM，密钥来自 env AI_LISTING_TOKEN_SECRET）。
    // 这两列是密文，ACL 对所有角色一律剥离，绝不下发前端（见 acl/index.ts ALWAYS_STRIP）。
    { type: 'text', name: 'accessTokenEnc', interface: 'textarea', title: 'Access token (encrypted)' },
    { type: 'text', name: 'refreshTokenEnc', interface: 'textarea', title: 'Refresh token (encrypted)' },
    // refresh_token 过期时间；超过它未刷新则需卖家重新授权（ICBU refresh 默认 5 天）。
    { type: 'date', name: 'refreshExpiresAt', interface: 'datetime', title: 'Refresh expires at' },
    // 授权账号标识（account_id / seller_id / country），非敏感，便于展示「已连接哪个卖家」。
    { type: 'string', name: 'accountUid', interface: 'input', title: 'Account UID' },
    { type: 'string', name: 'sellerId', interface: 'input', title: 'Seller ID' },
    { type: 'string', name: 'country', interface: 'input', title: 'Country' },
  ],
});
