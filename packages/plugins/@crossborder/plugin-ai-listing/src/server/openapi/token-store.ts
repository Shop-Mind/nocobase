/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// 平台 token 的加密存取 + 过期前自动刷新。落库到 aiListingPlatformAccounts 的 *Enc 密文列。
// getValidAccessToken：距过期 <5 分钟则用 refresh_token 刷新并回写；refresh 也过期 → 置 expired 并要求重新授权。
// 并发去重：同一账号同时多次取 token 只发一次刷新（in-flight promise 缓存）。
// 铁律：明文 token 只在内存；日志绝不含 token；对外只返回 access_token 字符串给同进程调用方。

import type Plugin from '../plugin';
import { decryptSecret, encryptSecret } from './crypto';
import { OpenApiError } from './errors';
import { refreshAccessToken, TokenBundle } from './oauth';

const REFRESH_SKEW_MS = 5 * 60 * 1000;

// accountId → 正在进行的刷新 promise，避免并发重复刷新。
const inFlight = new Map<number, Promise<string>>();

function getRepo(plugin: Plugin) {
  return plugin.app.db.getRepository('aiListingPlatformAccounts');
}

// 把 TokenBundle 加密写入指定账号行（授权/刷新成功后调用）。
export async function saveToken(plugin: Plugin, accountId: number, bundle: TokenBundle): Promise<void> {
  const repo = getRepo(plugin);
  // settings 合并写：保留 isDefault（默认账号标记）等业务位，只覆盖授权元数据（整体覆盖会把重新授权的账号挤掉默认标记）。
  const existing = await repo.findOne({ filterByTk: accountId });
  const prevSettings = (existing?.get('settings') as Record<string, unknown>) || {};
  await repo.update({
    filterByTk: accountId,
    values: {
      accessTokenEnc: encryptSecret(bundle.accessToken),
      refreshTokenEnc: bundle.refreshToken ? encryptSecret(bundle.refreshToken) : null,
      expiresAt: bundle.expiresAt,
      refreshExpiresAt: bundle.refreshExpiresAt ?? null,
      accountUid: bundle.accountUid ?? bundle.account ?? null,
      sellerId: bundle.sellerId ?? null,
      country: bundle.country ?? null,
      authStatus: 'connected',
      // 非敏感授权元数据（账号身份），便于展示「连接的是哪个卖家」；绝不含 token。
      settings: {
        ...prevSettings,
        userId: bundle.userId ?? null,
        havanaId: bundle.havanaId ?? null,
        accountPlatform: bundle.accountPlatform ?? null,
        connectedAt: bundle.expiresAt.toISOString(),
      },
    },
  });
}

async function markExpired(plugin: Plugin, accountId: number): Promise<void> {
  await getRepo(plugin).update({ filterByTk: accountId, values: { authStatus: 'expired' } });
}

async function doRefresh(plugin: Plugin, accountId: number, refreshTokenEnc: string): Promise<string> {
  let bundle: TokenBundle;
  try {
    bundle = await refreshAccessToken(decryptSecret(refreshTokenEnc));
  } catch (e) {
    await markExpired(plugin, accountId);
    if (e instanceof OpenApiError) throw e;
    throw new OpenApiError('OPENAPI_NEEDS_REAUTH', '刷新令牌失败，请重新授权店铺');
  }
  await saveToken(plugin, accountId, bundle);
  return bundle.accessToken;
}

// 取有效 access_token：未过期直接解密返回；快过期则刷新；无法刷新 → 抛需重新授权。
export async function getValidAccessToken(plugin: Plugin, accountId: number): Promise<string> {
  const acc = await getRepo(plugin).findOne({ filterByTk: accountId });
  if (!acc?.accessTokenEnc) {
    throw new OpenApiError('OPENAPI_NOT_CONNECTED', '该店铺尚未授权连接');
  }
  const expiresAt = acc.expiresAt ? new Date(acc.expiresAt).getTime() : 0;
  if (Date.now() < expiresAt - REFRESH_SKEW_MS) {
    return decryptSecret(acc.accessTokenEnc);
  }
  // 需要刷新。
  if (!acc.refreshTokenEnc) {
    await markExpired(plugin, accountId);
    throw new OpenApiError('OPENAPI_NEEDS_REAUTH', '访问令牌已过期且无刷新令牌，请重新授权');
  }
  const refreshExpiresAt = acc.refreshExpiresAt ? new Date(acc.refreshExpiresAt).getTime() : 0;
  if (refreshExpiresAt && Date.now() > refreshExpiresAt) {
    await markExpired(plugin, accountId);
    throw new OpenApiError('OPENAPI_NEEDS_REAUTH', '刷新令牌已过期（超 5 天未刷新），请重新授权');
  }
  const existing = inFlight.get(accountId);
  if (existing) return existing;
  const p = doRefresh(plugin, accountId, acc.refreshTokenEnc).finally(() => inFlight.delete(accountId));
  inFlight.set(accountId, p);
  return p;
}
