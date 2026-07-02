/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// 抓取来源选择（Phase E）：真实平台 OpenAPI 优先、否则回退 mock。
// 决策：命中某平台且该平台真接入开关开（isRealEnabled）→ 用连接器真实抓取；开关开但未授权 → 明确报错
// （不静默回退 mock，免得掩盖“未连接/未加白名单”）；开关关 → 走原 mock adapter。
// 连接器错误（AppWhiteIpLimit / B_PRODUCT_NOT_FOUND 等）转成 AdapterError，让现有 capture 步骤统一处理并友好提示。

import type Plugin from '../plugin';
import { AdapterError, resolveAdapter, type CaptureAdapter } from '../adapters';
import { OpenApiError } from '../openapi/errors';
import { getValidAccessToken } from '../openapi/token-store';
import { findConnector, getConnector, isRealEnabled } from '../platforms/registry';

// 按链接域名判定 connector（与 resolveAdapter 的 mock 判定一致）。
function resolveConnectorId(url: string): string | undefined {
  let host = '';
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    host = '';
  }
  if (host.includes('alibaba.') || host.includes('1688.com') || host.includes('aliexpress.')) {
    return 'alibaba-icbu';
  }
  return undefined;
}

// 找该 connector 对应的、已连接的平台账号 id。多账号时优先「默认账号」（平台连接页可设），否则取第一个已连接的。
async function findConnectedAccountId(plugin: Plugin, connectorId: string): Promise<number | undefined> {
  const repo = plugin.app.db.getRepository('aiListingPlatformAccounts');
  const rows = (await repo.find({ filter: { authStatus: 'connected' }, sort: ['id'] })) as Array<
    Record<string, unknown>
  >;
  const candidates = rows.filter((r) => {
    const c = findConnector(String(r.platform ?? ''));
    return c && c.id === connectorId;
  });
  if (!candidates.length) return undefined;
  const preferred = candidates.find((r) => Boolean((r.settings as Record<string, unknown> | null)?.isDefault));
  return (preferred || candidates[0]).id as number;
}

// 解析抓取适配器：真接入开则返回连接器实现（保持 CaptureAdapter 形状，executeUrlCapture 无需改动其余逻辑），否则 mock。
export async function resolveCaptureAdapter(plugin: Plugin, url: string): Promise<CaptureAdapter> {
  const connectorId = resolveConnectorId(url);
  if (!connectorId || !isRealEnabled(connectorId)) {
    return resolveAdapter(url);
  }
  const connector = getConnector(connectorId);
  const fetchProduct = connector.fetchProduct;
  if (!fetchProduct) {
    // 声明了平台但抓取能力未实现 → 回退 mock。
    return resolveAdapter(url);
  }
  const accountId = await findConnectedAccountId(plugin, connectorId);
  if (accountId == null) {
    return {
      name: `${connectorId}-not-connected`,
      async fetchProductByUrl() {
        throw new AdapterError('OPENAPI_NOT_CONNECTED', '该平台尚未授权连接，请到「平台连接」页连接店铺', false);
      },
    };
  }
  return {
    name: `${connectorId}-real`,
    async fetchProductByUrl(u, options) {
      const token = await getValidAccessToken(plugin, accountId);
      try {
        return await fetchProduct(token, { url: u }, options);
      } catch (e) {
        if (e instanceof OpenApiError) throw new AdapterError(e.code, e.message, e.retryable);
        throw e;
      }
    },
  };
}
