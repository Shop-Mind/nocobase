/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// Alibaba.com ICBU OAuth：拼授权 URL、用 code 换 token、用 refresh_token 刷新。
// 授权 URL（官方 server-side OAuth2.0）：https://oauth.alibaba.com/authorize?response_type=code&client_id=<appKey>
//   &redirect_uri=<callback>&state=<state>&view=web&sp=ICBU
// token 端点走 IOP 网关：/auth/token/create（code→token）、/auth/token/refresh（refresh_token→新 token）。
// 铁律：本模块出入参与日志绝不含 token/secret 明文；TokenBundle 只在内存传递给 token-store 加密落库。

import { callIop, IopConfig } from './iop-client';
import { OpenApiError } from './errors';

export interface TokenBundle {
  accessToken: string;
  refreshToken?: string;
  expiresAt: Date; // access_token 过期时间（由 expires_in 推算）
  refreshExpiresAt?: Date; // refresh_token 过期时间（由 refresh_expires_in 推算）
  account?: string;
  accountUid?: string;
  country?: string;
  sellerId?: string;
  userId?: string;
  havanaId?: string;
  accountPlatform?: string;
}

// 取第一个非空值：先查顶层，再查 user_info。seller_id/user_id/havana_id 视平台区域可能在顶层或 user_info 内
// （参照生产 Java 版 AlibabaToken.fromResponse 的 firstText 逻辑）。
function firstText(
  primary: Record<string, unknown>,
  fallback: Record<string, unknown>,
  ...fields: string[]
): string | undefined {
  for (const node of [primary, fallback]) {
    if (!node || typeof node !== 'object') continue;
    for (const f of fields) {
      const v = node[f];
      if (typeof v === 'string' && v.trim()) return v;
      if (typeof v === 'number') return String(v);
    }
  }
  return undefined;
}

export function getIopConfig(): IopConfig {
  const appKey = process.env.ALIBABA_ICBU_APP_KEY;
  const appSecret = process.env.ALIBABA_ICBU_APP_SECRET;
  if (!appKey || !appSecret) {
    throw new OpenApiError('OPENAPI_NOT_CONFIGURED', '缺少 ALIBABA_ICBU_APP_KEY / APP_SECRET');
  }
  return { appKey, appSecret, gateway: process.env.ALIBABA_ICBU_GATEWAY || undefined };
}

// 拼授权 URL。state 由调用方生成并校验，防 CSRF。
export function buildAuthorizeUrl(state: string): string {
  const appKey = process.env.ALIBABA_ICBU_APP_KEY;
  const redirectUri = process.env.ALIBABA_OAUTH_CALLBACK_URL;
  if (!appKey) throw new OpenApiError('OPENAPI_NOT_CONFIGURED', '缺少 ALIBABA_ICBU_APP_KEY');
  if (!redirectUri) throw new OpenApiError('OPENAPI_NOT_CONFIGURED', '缺少 ALIBABA_OAUTH_CALLBACK_URL');
  // ICBU Open Platform（openapi.alibaba.com 新体系，与 openapi-api.alibaba.com/rest 网关配套）的授权页。
  // 注意：旧的 oauth.alibaba.com/authorize 是另一套体系，对本 appKey 报 param-appkey.not.exists。
  const base = process.env.ALIBABA_OAUTH_AUTHORIZE_BASE || 'https://openapi-auth.alibaba.com/oauth/authorize';
  // 参照生产 Java 版验证过的最小参数集：response_type / redirect_uri / client_id / state（不带 view/sp）。
  const q = new URLSearchParams({
    response_type: 'code',
    client_id: appKey,
    redirect_uri: redirectUri,
    state,
  });
  return `${base}?${q.toString()}`;
}

function toTokenBundle(json: Record<string, unknown>): TokenBundle {
  const accessToken = json.access_token as string | undefined;
  if (!accessToken) {
    throw new OpenApiError('OPENAPI_TOKEN_EXCHANGE_FAILED', (json.message as string) || '未返回 access_token');
  }
  const now = Date.now();
  const userInfo = (json.user_info as Record<string, unknown>) || {};
  const expiresIn = Number(json.expires_in ?? 0);
  const refreshExpiresIn = Number(json.refresh_expires_in ?? 0);
  return {
    accessToken,
    // refresh_expires_in===0 表示不可刷新 → 不保留 refresh_token（参照 Java canRefresh）。
    refreshToken: refreshExpiresIn === 0 ? undefined : (json.refresh_token as string) || undefined,
    expiresAt: new Date(now + expiresIn * 1000),
    refreshExpiresAt: refreshExpiresIn > 0 ? new Date(now + refreshExpiresIn * 1000) : undefined,
    account: (json.account as string) || undefined,
    accountUid: (json.account_id as string) || undefined,
    country: (json.country as string) || firstText(json, userInfo, 'country'),
    sellerId: firstText(json, userInfo, 'seller_id'),
    userId: firstText(json, userInfo, 'user_id', 'user_nick'),
    havanaId: firstText(json, userInfo, 'havana_id'),
    accountPlatform: (json.account_platform as string) || undefined,
  };
}

export async function exchangeCode(code: string): Promise<TokenBundle> {
  const json = await callIop(getIopConfig(), { apiPath: '/auth/token/create', params: { code } });
  return toTokenBundle(json);
}

export async function refreshAccessToken(refreshToken: string): Promise<TokenBundle> {
  const json = await callIop(getIopConfig(), {
    apiPath: '/auth/token/refresh',
    params: { refresh_token: refreshToken },
  });
  return toTokenBundle(json);
}
