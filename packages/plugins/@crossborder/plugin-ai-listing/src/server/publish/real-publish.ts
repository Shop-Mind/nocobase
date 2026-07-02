/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// 发布目标解析（Phase F）：真实平台 OpenAPI 优先、否则回退 mock。决策与 real-capture 一致：
// 命中平台且真接入开关开（isRealEnabled）→ 用「所选店铺账号」的 OAuth token 走连接器真实发布；
// 开关开但店铺未授权 → 明确报错（不静默回退 mock，避免「以为发出去了」）；开关关 → 走 mock adapter。
//
// 发布到谁的店铺：targetStoreId 就是 aiListingPlatformAccounts 的行 id——即「平台连接」页里授权过的
// 卖家账号。服务端用该账号的 access_token 调平台接口，商品落到该授权账号名下的店铺，与前端展示一致。

import type Plugin from '../plugin';
import { OpenApiError } from '../openapi/errors';
import { getValidAccessToken } from '../openapi/token-store';
import { findConnector, isRealEnabled } from '../platforms/registry';
import type { PlatformConnector } from '../platforms/types';
import { PublishAdapterError, resolvePublishAdapter, SUPPORTED_PLATFORMS, type PublishAdapter } from './adapters';

export interface ResolvedPublishAdapter {
  adapter: PublishAdapter;
  // 是否真实平台发布（决定是否施加发布间隔、前端如何提示）。
  real: boolean;
  connector?: PlatformConnector;
  accountId?: number;
}

interface AccountRow {
  id: number;
  platform?: string;
  storeName?: string;
  sellerId?: string;
  accountUid?: string;
  authStatus?: string;
}

async function loadAccount(plugin: Plugin, accountId?: number): Promise<AccountRow | null> {
  if (accountId == null) return null;
  const repo = plugin.app.db.getRepository('aiListingPlatformAccounts');
  const row = await repo.findOne({ filterByTk: accountId });
  if (!row) return null;
  return {
    id: row.get('id'),
    platform: row.get('platform'),
    storeName: row.get('storeName'),
    sellerId: row.get('sellerId'),
    accountUid: row.get('accountUid'),
    authStatus: row.get('authStatus'),
  };
}

// 解析发布 adapter。真接入开关开时校验店铺账号（存在 / 已连接 / 平台匹配），全部通过才返回真实 adapter。
export async function resolvePublishTarget(
  plugin: Plugin,
  config: { targetPlatform?: string; targetStoreId?: number },
): Promise<ResolvedPublishAdapter> {
  const platform = config.targetPlatform || '';
  const connector = findConnector(platform);
  if (!connector || !isRealEnabled(connector.id) || !connector.publish) {
    return { adapter: resolvePublishAdapter(platform), real: false };
  }

  const account = await loadAccount(plugin, config.targetStoreId);
  if (!account) {
    throw new PublishAdapterError(
      'PUBLISH_STORE_NOT_CONNECTED',
      '所选店铺不存在，请在发布配置里选择已授权的店铺',
      false,
    );
  }
  const accountConnector = findConnector(String(account.platform ?? ''));
  if (!accountConnector || accountConnector.id !== connector.id) {
    throw new PublishAdapterError(
      'PUBLISH_STORE_PLATFORM_MISMATCH',
      `所选店铺属于「${account.platform}」，与目标平台「${platform}」不一致`,
      false,
    );
  }
  if (account.authStatus !== 'connected') {
    throw new PublishAdapterError(
      'PUBLISH_STORE_NOT_CONNECTED',
      `店铺「${account.storeName || account.id}」未授权或授权已过期，请到「平台连接」页重新授权`,
      false,
    );
  }

  const publishFn = connector.publish.bind(connector);
  const draftFn = connector.publishDraft ? connector.publishDraft.bind(connector) : undefined;
  const adapter: PublishAdapter = {
    name: `${connector.id}-real`,
    platform,
    async publish(payload) {
      const token = await getValidAccessToken(plugin, account.id);
      try {
        return await publishFn(token, payload);
      } catch (e) {
        if (e instanceof OpenApiError) throw new PublishAdapterError(e.code, e.message, e.retryable);
        throw e;
      }
    },
    publishDraft: draftFn
      ? async (payload) => {
          const token = await getValidAccessToken(plugin, account.id);
          try {
            return await draftFn(token, payload);
          } catch (e) {
            if (e instanceof OpenApiError) throw new PublishAdapterError(e.code, e.message, e.retryable);
            throw e;
          }
        }
      : undefined,
  };
  return { adapter, real: true, connector, accountId: account.id };
}

// 发布页元数据：每个平台是否真实接入 + 名下店铺账号列表（含授权状态），供「目标平台/目标店铺」下拉。
export async function listPlatformsMeta(plugin: Plugin) {
  const repo = plugin.app.db.getRepository('aiListingPlatformAccounts');
  const rows = (await repo.find({ sort: ['id'] })) as Array<Record<string, any>>;
  return SUPPORTED_PLATFORMS.map((platform) => {
    const connector = findConnector(platform);
    const real = Boolean(connector && isRealEnabled(connector.id) && connector.publish);
    const accounts = rows
      .filter((r) => {
        const c = findConnector(String(r.platform ?? ''));
        return c && connector ? c.id === connector.id : String(r.platform) === platform;
      })
      .map((r) => {
        // 授权状态按「令牌事实」核定（与平台连接页一致）：无令牌一律未连接，防早期演示行伪装已授权。
        const hasToken = Boolean(r.accessTokenEnc || r.refreshTokenEnc);
        const refreshAt = r.refreshExpiresAt ? new Date(r.refreshExpiresAt as string) : null;
        let authStatus = String(r.authStatus || 'disconnected');
        if (!hasToken) authStatus = 'disconnected';
        else if (authStatus === 'connected' && refreshAt && refreshAt.getTime() < Date.now()) authStatus = 'expired';
        return {
          id: r.id,
          storeName: r.storeName || `${platform} 店铺 #${r.id}`,
          sellerId: r.sellerId || null,
          accountUid: r.accountUid || null,
          authStatus,
          isDefault: Boolean((r.settings as Record<string, unknown> | null)?.isDefault),
        };
      })
      // 默认账号排最前：发布页下拉预选它，多店铺时一眼看到主账号。
      .sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
    return { value: platform, label: connector?.label || platform, real, accounts };
  });
}

// 查询目标平台上的商品发布状态（online/draft/failed/pending）。返回 null 表示该平台无状态查询能力。
export async function queryTargetStatusWithAccount(plugin: Plugin, accountId: number, targetProductId: string) {
  const account = await loadAccount(plugin, accountId);
  if (!account || account.authStatus !== 'connected') {
    throw new PublishAdapterError('PUBLISH_STORE_NOT_CONNECTED', '店铺未授权，无法查询平台发布状态', false);
  }
  const connector = findConnector(String(account.platform ?? ''));
  if (!connector || !isRealEnabled(connector.id) || !connector.queryStatus) return null;
  const token = await getValidAccessToken(plugin, account.id);
  try {
    return await connector.queryStatus(token, targetProductId);
  } catch (e) {
    if (e instanceof OpenApiError) throw new PublishAdapterError(e.code, e.message, e.retryable);
    throw e;
  }
}

// 用已授权账号做类目预测。返回 null 表示该平台无真实类目预测能力（走平台发布时自动预测兜底）。
export async function predictCategoryWithAccount(
  plugin: Plugin,
  accountId: number,
  input: { title: string; description?: string; imageUrl?: string },
) {
  const account = await loadAccount(plugin, accountId);
  if (!account || account.authStatus !== 'connected') {
    throw new PublishAdapterError('PUBLISH_STORE_NOT_CONNECTED', '店铺未授权，无法调用平台类目预测', false);
  }
  const connector = findConnector(String(account.platform ?? ''));
  if (!connector || !isRealEnabled(connector.id) || !connector.predictCategory) return null;
  const token = await getValidAccessToken(plugin, account.id);
  try {
    return await connector.predictCategory(token, input);
  } catch (e) {
    if (e instanceof OpenApiError) throw new PublishAdapterError(e.code, e.message, e.retryable);
    throw e;
  }
}
