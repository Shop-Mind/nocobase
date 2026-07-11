/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import type { Context, Next } from '@nocobase/actions';
import type Plugin from '../plugin';
import { fail } from '../capture/shared';
import { SUPPORTED_PLATFORMS } from '../publish/adapters';

// 设置（Phase 9）：平台账号授权状态（脱敏，不展示密钥）、默认平台/规则、Crawl4AI 开关、OpenAPI 状态。
// 安全：① 绝不返回 credentialRef / 任何密钥；② OpenAPI token 过期、IP 白名单缺失给友好提示（§7.9 / 错误码 OPENAPI_TOKEN_EXPIRED）。

const EXPIRING_SOON_DAYS = 7;
// 走 OpenAPI 的来源平台（其余平台为爬虫/合作 API，不涉及 OpenAPI token）。
const OPENAPI_PLATFORMS = ['Alibaba.com', 'Alibaba', '1688', 'AliExpress'];

function getRepos(db: any) {
  return {
    Accounts: db.getRepository('aiListingPlatformAccounts'),
    Config: db.getRepository('aiListingConfig'),
    Rules: db.getRepository('aiListingRules'),
  };
}

// 取单例配置行（不存在则创建默认行）。
async function loadConfig(Config: any) {
  let row = await Config.findOne({ filter: { scope: 'global' } });
  if (!row) {
    row = await Config.create({ values: { scope: 'global' } });
  }
  return row;
}

// 平台账号脱敏：仅暴露授权状态相关字段，剥离 credentialRef 等敏感引用。
function sanitizeAccount(a: any) {
  const expiresAt = a.get('expiresAt');
  const authStatus = a.get('authStatus');
  let expiringSoon = false;
  if (expiresAt) {
    const days = (new Date(expiresAt).getTime() - Date.now()) / 86400000;
    expiringSoon = days >= 0 && days <= EXPIRING_SOON_DAYS;
  }
  return {
    id: a.get('id'),
    platform: a.get('platform'),
    storeName: a.get('storeName'),
    authStatus,
    expiresAt,
    expiringSoon,
    expired: authStatus === 'expired',
  };
}

export function setupSettings(plugin: Plugin): void {
  const { app } = plugin;
  const db = app.db;

  app.resourceManager.define({
    name: 'aiListingSettings',
    actions: {
      // 设置总览：平台状态（脱敏）+ 默认参数 + Crawl4AI/OpenAPI 状态 + 友好提示。
      overview: async (ctx: Context, next: Next) => {
        const traceId = ctx.reqId || `srv-${Date.now()}`;
        const { Accounts, Config, Rules } = getRepos(db);
        const accountRows = await Accounts.find({ sort: ['id'] });
        const accounts = accountRows.map(sanitizeAccount);

        const config = await loadConfig(Config);
        const ruleRows = await Rules.find({ sort: ['-id'], limit: 100 });
        const rules = ruleRows.map((r: any) => ({ id: r.get('id'), name: r.get('name'), enabled: r.get('enabled') }));
        const defaultRuleId = config.get('defaultRuleId');
        const defaultRule = rules.find((r: any) => String(r.id) === String(defaultRuleId)) || null;

        // OpenAPI 状态：token 过期 = 任一 OpenAPI 来源平台账号 authStatus=expired；IP 白名单 = 运营侧事实开关。
        const openApiAccounts = accounts.filter((a: any) => OPENAPI_PLATFORMS.includes(a.platform));
        const tokenExpired = openApiAccounts.some((a: any) => a.expired);
        const ipWhitelisted = !!config.get('openApiIpWhitelisted');
        const openApiHints: Array<{ level: 'info' | 'warning' | 'error'; code?: string; message: string }> = [];
        if (tokenExpired) {
          openApiHints.push({
            level: 'error',
            code: 'OPENAPI_TOKEN_EXPIRED',
            message: '平台授权已过期，请到对应平台账号重新授权后再继续抓取/发布。',
          });
        }
        if (!ipWhitelisted) {
          openApiHints.push({
            level: 'warning',
            code: 'OPENAPI_IP_NOT_WHITELISTED',
            message: '服务器出口 IP 未加入平台 OpenAPI 白名单，调用将被拒绝；请联系管理员在平台后台加白后开启此开关。',
          });
        }
        if (!openApiHints.length) {
          openApiHints.push({
            level: 'info',
            message: 'OpenAPI 适配器当前为 mock 模式，结构对齐真实端点，未接入生产凭证。',
          });
        }

        ctx.body = {
          ok: true,
          data: {
            accounts,
            config: {
              defaultPlatform: config.get('defaultPlatform') || null,
              defaultRuleId: defaultRuleId || null,
              defaultStock: Number(config.get('defaultStock')) || null,
              crawl4aiEnabled: !!config.get('crawl4aiEnabled'),
              openApiIpWhitelisted: ipWhitelisted,
            },
            rules,
            defaultRule,
            platformOptions: SUPPORTED_PLATFORMS,
            crawl4ai: {
              enabled: !!config.get('crawl4aiEnabled'),
              configured: false,
              hint: 'Crawl4AI 兜底抓取需独立 worker 容器提供，绝不在主进程运行；当前未配置 worker，开启后仅生效于已接入环境。',
            },
            openApi: {
              mode: 'mock',
              tokenExpired,
              ipWhitelisted,
              hints: openApiHints,
            },
          },
          warnings: [],
          errors: [],
          traceId,
        };
        await next();
      },

      // 保存运营偏好（非敏感）：默认平台/默认规则/Crawl4AI 开关/IP 白名单事实开关。
      saveConfig: async (ctx: Context, next: Next) => {
        const traceId = ctx.reqId || `srv-${Date.now()}`;
        const v = (ctx.action?.params?.values || {}) as {
          defaultPlatform?: string;
          defaultRuleId?: number | null;
          defaultStock?: number | null;
          crawl4aiEnabled?: boolean;
          openApiIpWhitelisted?: boolean;
        };
        if (v.defaultPlatform && !SUPPORTED_PLATFORMS.includes(v.defaultPlatform)) {
          ctx.status = 400;
          ctx.body = fail('INVALID_DEFAULT_PLATFORM', '默认平台不在支持列表内', false, traceId);
          return await next();
        }
        if (v.defaultStock !== undefined && v.defaultStock !== null) {
          const n = Number(v.defaultStock);
          if (!Number.isInteger(n) || n < 0 || n > 999999) {
            ctx.status = 400;
            ctx.body = fail('INVALID_DEFAULT_STOCK', '缺省库存必须是 0-999999 的整数（0 = 关闭）', false, traceId);
            return await next();
          }
        }
        const { Config } = getRepos(db);
        const config = await loadConfig(Config);
        const patch: Record<string, unknown> = {};
        if (v.defaultPlatform !== undefined) patch.defaultPlatform = v.defaultPlatform || null;
        if (v.defaultRuleId !== undefined) patch.defaultRuleId = v.defaultRuleId || null;
        if (v.defaultStock !== undefined) patch.defaultStock = Number(v.defaultStock) || null;
        if (v.crawl4aiEnabled !== undefined) patch.crawl4aiEnabled = !!v.crawl4aiEnabled;
        if (v.openApiIpWhitelisted !== undefined) patch.openApiIpWhitelisted = !!v.openApiIpWhitelisted;
        await Config.update({ filterByTk: config.get('id'), values: patch });
        ctx.body = { ok: true, data: { saved: true, ...patch }, warnings: [], errors: [], traceId };
        await next();
      },
    },
  });

  // 总览只读：登录用户可看；保存配置同样登录可用（细粒度「仅管理员可改」留待 nocobase-acl-manage）。
  app.acl.allow('aiListingSettings', 'overview', 'loggedIn');
  app.acl.allow('aiListingSettings', 'saveConfig', 'loggedIn');
}

// 幂等播种平台账号示例（仅授权状态，credentialRef 仅为引用占位，不含明文密钥）。在 install() 调用。
export async function seedPlatformAccounts(plugin: Plugin): Promise<void> {
  const Accounts = plugin.app.db.getRepository('aiListingPlatformAccounts');
  const existing = await Accounts.count();
  if (existing > 0) return;
  const now = Date.now();
  const seeds = [
    { platform: 'Shopee', storeName: 'Shopee 旗舰店', authStatus: 'connected', daysToExpire: 60 },
    { platform: 'Lazada', storeName: 'Lazada 主店', authStatus: 'expired', daysToExpire: -2 },
    { platform: 'Alibaba.com', storeName: 'Alibaba 供应账号', authStatus: 'connected', daysToExpire: 5 },
    { platform: 'Temu', storeName: '', authStatus: 'disconnected', daysToExpire: null },
    { platform: 'TikTokShop', storeName: '', authStatus: 'disconnected', daysToExpire: null },
  ];
  for (const s of seeds) {
    await Accounts.create({
      values: {
        platform: s.platform,
        storeName: s.storeName,
        authStatus: s.authStatus,
        credentialRef: `secretref://${s.platform.toLowerCase()}`,
        expiresAt: s.daysToExpire == null ? null : new Date(now + s.daysToExpire * 86400000),
      },
    });
  }
}
