/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// Phase C：OAuth 授权闭环。两个浏览器直达端点（公开，原生中间件在 SPA 兜底前拦截）：
//   GET /nocobase-api/aiListingOpenApi:oauthStart    → 生成 state、302 跳 Alibaba 授权页
//   GET /nocobase-api/aiListingOpenApi:oauthCallback → 校验 state、用 code 换 token、加密落库、渲染结果页
// 另有受控 action（登录态，供设置页）：aiListingOpenApi:status / disconnect（返回脱敏状态，绝不含 token）。
// 铁律：回调只处理 code→token→加密落库；日志/页面绝不显示 token/secret；HTML 结果页不引 SPA（隧道下 dev SPA 打不开无妨）。

import { randomBytes } from 'node:crypto';
import type { Context, Next } from '@nocobase/actions';
import type Plugin from '../plugin';
import { OpenApiError } from './errors';
import { buildAuthorizeUrl, exchangeCode, TokenBundle } from './oauth';
import { saveToken } from './token-store';

const PLATFORM = 'Alibaba.com';
// 浏览器直达端点放在 API 前缀下：dev 网关只把 /api/* 转发给 app（其它路径给前端 dev server），
// 故必须用 /api/... 才能被本原生中间件（在 dataSource/resourcer 之前）拦截。回调登记值需与此一致。
const START_PATH = '/api/aiListingOpenApi:oauthStart';
const CALLBACK_PATH = '/api/aiListingOpenApi:oauthCallback';
const STATE_TTL_MS = 10 * 60 * 1000;

// state → 创建时间。内存态，单进程；防 CSRF，一次性消费。dev 重启会清空（授权流程 <1 分钟，可接受）。
const stateStore = new Map<string, number>();

function issueState(): string {
  const now = Date.now();
  for (const [s, t] of stateStore) if (now - t > STATE_TTL_MS) stateStore.delete(s);
  const state = randomBytes(16).toString('hex');
  stateStore.set(state, now);
  return state;
}

function consumeState(state: unknown): boolean {
  if (typeof state !== 'string' || !stateStore.has(state)) return false;
  const t = stateStore.get(state) as number;
  stateStore.delete(state);
  return Date.now() - t <= STATE_TTL_MS;
}

function resultPage(ok: boolean, lines: string[]): string {
  const color = ok ? '#16a34a' : '#dc2626';
  const title = ok ? '✅ 店铺授权成功' : '❌ 授权失败';
  const items = lines.map((l) => `<li>${l}</li>`).join('');
  return `<!doctype html><html lang="zh"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${title}</title></head>
<body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f6f7f9;margin:0;padding:48px">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:28px 32px;box-shadow:0 2px 12px rgba(0,0,0,.06)">
<h2 style="color:${color};margin:0 0 12px">${title}</h2>
<ul style="line-height:1.9;color:#333;padding-left:20px">${items}</ul>
<p style="color:#888;margin-top:20px">可关闭本页，回到后台设置页查看连接状态。</p>
<a href="http://localhost:13000/admin/" style="display:inline-block;margin-top:8px;color:#2563eb">返回本地后台</a>
</div></body></html>`;
}

// 授权成功后定位/创建对应平台账号行，把 token 写进去。单店铺按 platform 匹配；有 sellerId 时按 (platform,sellerId) 精确匹配。
async function resolveAccountId(plugin: Plugin, bundle: TokenBundle): Promise<number> {
  const repo = plugin.app.db.getRepository('aiListingPlatformAccounts');
  let acc = bundle.sellerId ? await repo.findOne({ filter: { platform: PLATFORM, sellerId: bundle.sellerId } }) : null;
  if (!acc) acc = await repo.findOne({ filter: { platform: PLATFORM } });
  if (!acc) {
    acc = await repo.create({
      values: {
        platform: PLATFORM,
        storeName: bundle.account || bundle.sellerId || PLATFORM,
        authStatus: 'disconnected',
      },
    });
  }
  return acc.id as number;
}

function sanitizeAccount(row: Record<string, unknown>): Record<string, unknown> {
  const expiresAt = row.expiresAt ? new Date(row.expiresAt as string) : null;
  const soon = expiresAt ? expiresAt.getTime() - Date.now() < 24 * 3600 * 1000 : false;
  return {
    id: row.id,
    platform: row.platform,
    storeName: row.storeName,
    authStatus: row.authStatus,
    country: row.country ?? null,
    sellerId: row.sellerId ?? null,
    accountUid: row.accountUid ?? null,
    expiresAt: row.expiresAt ?? null,
    refreshExpiresAt: row.refreshExpiresAt ?? null,
    expiringSoon: row.authStatus === 'connected' && soon,
    // 绝不外泄 accessTokenEnc/refreshTokenEnc/credentialRef。
  };
}

export function setupOpenApi(plugin: Plugin): void {
  const { app } = plugin;

  // 浏览器直达的公开端点（在 dataSource / SPA 兜底之前拦截，按精确路径匹配，与 API_BASE_PATH 解耦）。
  app.use(
    async (ctx: Context, next: Next) => {
      if (ctx.path === START_PATH) {
        ctx.withoutDataWrapping = true;
        try {
          const state = issueState();
          ctx.redirect(buildAuthorizeUrl(state));
        } catch (e) {
          const err = e as OpenApiError;
          ctx.status = 200;
          ctx.type = 'html';
          ctx.body = resultPage(false, [`无法发起授权：${err.message}`, `错误码：${err.code || 'UNKNOWN'}`]);
        }
        return;
      }

      if (ctx.path === CALLBACK_PATH) {
        ctx.withoutDataWrapping = true;
        ctx.type = 'html';
        ctx.status = 200;
        const { code, state, error, error_description: errDesc } = ctx.query as Record<string, string>;
        if (error) {
          ctx.body = resultPage(false, [`平台返回授权错误：${error}`, errDesc || '']);
          return;
        }
        if (!code) {
          ctx.body = resultPage(false, ['回调缺少授权码 code']);
          return;
        }
        if (!consumeState(state)) {
          ctx.body = resultPage(false, ['授权会话已过期或非法（state 校验失败）', '请回后台重新发起「连接店铺」']);
          return;
        }
        try {
          const bundle = await exchangeCode(code);
          const accountId = await resolveAccountId(plugin, bundle);
          await saveToken(plugin, accountId, bundle);
          ctx.logger?.info?.('[ai-listing] oauth connected', {
            platform: PLATFORM,
            accountId,
            country: bundle.country,
            sellerId: bundle.sellerId,
            expiresAt: bundle.expiresAt?.toISOString(),
          });
          ctx.body = resultPage(true, [
            `平台：${PLATFORM}`,
            `卖家：${bundle.sellerId || bundle.account || '（未返回）'}`,
            `国家：${bundle.country || '（未返回）'}`,
            `令牌到期：${bundle.expiresAt?.toLocaleString?.() || bundle.expiresAt}`,
          ]);
        } catch (e) {
          const err = e as OpenApiError;
          ctx.logger?.warn?.('[ai-listing] oauth exchange failed', { code: err.code, traceId: err.traceId });
          ctx.body = resultPage(false, [`换取令牌失败：${err.message}`, `错误码：${err.code || 'UNKNOWN'}`]);
        }
        return;
      }

      await next();
    },
    { tag: 'aiListingOauth', after: 'bodyParser', before: 'dataSource' },
  );

  // 受控 action（登录态）：设置页读连接状态 / 断开。
  app.resourceManager.define({
    name: 'aiListingOpenApi',
    actions: {
      async status(ctx: Context, next: Next) {
        const repo = plugin.app.db.getRepository('aiListingPlatformAccounts');
        const rows = await repo.find({ filter: { platform: PLATFORM } });
        ctx.body = {
          authorizeStartUrl: START_PATH,
          accounts: (rows as Record<string, unknown>[]).map(sanitizeAccount),
        };
        await next();
      },
      async disconnect(ctx: Context, next: Next) {
        const { id } = ctx.action.params.values || ctx.action.params || {};
        const repo = plugin.app.db.getRepository('aiListingPlatformAccounts');
        const acc = id
          ? await repo.findOne({ filterByTk: id })
          : await repo.findOne({ filter: { platform: PLATFORM } });
        if (acc) {
          await repo.update({
            filterByTk: acc.id,
            values: {
              accessTokenEnc: null,
              refreshTokenEnc: null,
              expiresAt: null,
              refreshExpiresAt: null,
              authStatus: 'disconnected',
            },
          });
        }
        ctx.body = { ok: true };
        await next();
      },
    },
  });
  app.acl.allow('aiListingOpenApi', ['status', 'disconnect'], 'loggedIn');
}
