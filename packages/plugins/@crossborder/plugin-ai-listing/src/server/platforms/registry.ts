/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// 平台连接器注册表（Phase D）。接新平台 = 实现一个 PlatformConnector + 在 REGISTRY 加一行 + 在
// PLATFORM_TO_ID 里把它的展示名映射过来。上层（oauth resource、抓取/发布 adapter）只认 getConnector。

import { OpenApiError } from '../openapi/errors';
import { alibabaIcbuConnector } from './alibaba-icbu';
import { PlatformConnector } from './types';

const REGISTRY: Record<string, PlatformConnector> = {
  [alibabaIcbuConnector.id]: alibabaIcbuConnector,
};

// 数据库里 aiListingPlatformAccounts.platform 存的是展示名（如 'Alibaba.com'），映射到 connector id。
const PLATFORM_TO_ID: Record<string, string> = {
  'Alibaba.com': 'alibaba-icbu',
  '1688 国际站': 'alibaba-icbu',
  '1688 国际': 'alibaba-icbu',
};

// 按 connector id 或平台展示名取 connector；未支持则抛清晰错误。
export function getConnector(idOrPlatform: string): PlatformConnector {
  const id = REGISTRY[idOrPlatform] ? idOrPlatform : PLATFORM_TO_ID[idOrPlatform];
  const connector = id ? REGISTRY[id] : undefined;
  if (!connector) {
    throw new OpenApiError('PLATFORM_NOT_SUPPORTED', `暂不支持的平台：${idOrPlatform}`);
  }
  return connector;
}

export function findConnector(idOrPlatform: string): PlatformConnector | undefined {
  const id = REGISTRY[idOrPlatform] ? idOrPlatform : PLATFORM_TO_ID[idOrPlatform];
  return id ? REGISTRY[id] : undefined;
}

export function listConnectors(): PlatformConnector[] {
  return Object.values(REGISTRY);
}

// 真接入灰度开关：env AI_LISTING_REAL_<ID>（连字符转下划线、大写）为 true 才走真实平台调用；
// 默认 false → 上层回退 mock。注意：开关为真仍需该店铺已授权（getValidAccessToken 会校验连接态）。
export function isRealEnabled(connectorId: string): boolean {
  const key = `AI_LISTING_REAL_${connectorId.toUpperCase().replace(/-/g, '_')}`;
  return /^true$/i.test(String(process.env[key] ?? '').trim());
}
