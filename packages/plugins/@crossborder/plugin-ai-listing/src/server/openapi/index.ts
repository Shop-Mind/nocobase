/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// Phase C：OAuth 授权闭环。两个浏览器直达端点（公开，原生中间件在 SPA 兜底前拦截）：
//   GET /api/aiListingOpenApi:oauthStart    → 生成 state、302 跳 Alibaba 授权页
//   GET /api/aiListingOpenApi:oauthCallback → 校验 state、用 code 换 token、加密落库、渲染结果页
// 另有受控 action（登录态，供设置页）：aiListingOpenApi:status / disconnect（返回脱敏状态，绝不含 token）。
// 铁律：回调只处理 code→token→加密落库；日志/页面绝不显示 token/secret；HTML 结果页不引 SPA（隧道下 dev SPA 打不开无妨）。

import { randomBytes } from 'node:crypto';
import type { Context, Next } from '@nocobase/actions';
import type Plugin from '../plugin';
import { OpenApiError } from './errors';
import type { TokenBundle } from './oauth';
import { saveToken } from './token-store';
import { findConnector, getConnector, isRealEnabled } from '../platforms/registry';
import { SUPPORTED_PLATFORMS } from '../publish/adapters';
import { callModel, parseJsonObject } from '../assistant/llm';

// 通过注册表拿 Alibaba.com 连接器；接多平台时这里按 state/路径解析出对应平台即可。
const connector = getConnector('alibaba-icbu');

const PLATFORM = 'Alibaba.com';
// 浏览器直达端点放在 API 前缀下：dev 网关只把 /api/* 转发给 app（其它路径给前端 dev server），
// 故必须用 /api/... 才能被本原生中间件（在 dataSource/resourcer 之前）拦截。回调登记值需与此一致。
const START_PATH = '/api/aiListingOpenApi:oauthStart';
const CALLBACK_PATH = '/api/aiListingOpenApi:oauthCallback';
const STATE_TTL_MS = 10 * 60 * 1000;

// state → { 创建时间, 绑定的账号行 }。内存态，单进程；防 CSRF，一次性消费。dev 重启会清空（授权流程 <1 分钟，可接受）。
// accountId 由「平台连接」页发起授权时带上（oauthStart?accountId=N），让令牌精确写回那一行——多店铺互不覆盖。
const stateStore = new Map<string, { t: number; accountId?: number }>();

function issueState(accountId?: number): string {
  const now = Date.now();
  for (const [s, v] of stateStore) if (now - v.t > STATE_TTL_MS) stateStore.delete(s);
  const state = randomBytes(16).toString('hex');
  stateStore.set(state, { t: now, accountId });
  return state;
}

function consumeState(state: unknown): { ok: boolean; accountId?: number } {
  if (typeof state !== 'string' || !stateStore.has(state)) return { ok: false };
  const v = stateStore.get(state) as { t: number; accountId?: number };
  stateStore.delete(state);
  return { ok: Date.now() - v.t <= STATE_TTL_MS, accountId: v.accountId };
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

// 授权成功后定位/创建对应平台账号行，把 token 写进去。优先级（多店铺互不覆盖）：
// ① 发起授权时显式绑定的账号行（oauthStart?accountId=）→ ② (platform,sellerId) 精确匹配 →
// ③ 同平台的「未绑卖家的占位行」（新增平台链接后还没授权过的行）→ ④ 新建一行。
// 绝不再兜底「同平台第一行」——那会让第二家店的授权覆盖第一家的令牌。
async function resolveAccountId(plugin: Plugin, bundle: TokenBundle, boundAccountId?: number): Promise<number> {
  const repo = plugin.app.db.getRepository('aiListingPlatformAccounts');
  if (boundAccountId) {
    const bound = await repo.findOne({ filterByTk: boundAccountId });
    if (bound) return bound.id as number;
  }
  if (bundle.sellerId) {
    const bySeller = await repo.findOne({ filter: { platform: PLATFORM, sellerId: bundle.sellerId } });
    if (bySeller) return bySeller.id as number;
  }
  const rows = (await repo.find({ filter: { platform: PLATFORM }, sort: ['id'] })) as Array<Record<string, any>>;
  const placeholder = rows.find((r) => !r.sellerId && r.authStatus !== 'connected');
  if (placeholder) return placeholder.id as number;
  const created = await repo.create({
    values: {
      platform: PLATFORM,
      storeName: bundle.account || bundle.sellerId || PLATFORM,
      authStatus: 'disconnected',
    },
  });
  return created.id as number;
}

// settings.companyProfile → 规范化 {companyDesc, faqs}（历史数据/半截数据都收敛成安全形状）。
function readCompanyProfile(settings: unknown): { companyDesc: string; faqs: Array<{ q: string; a: string }> } {
  const p = ((settings as Record<string, unknown>)?.companyProfile || {}) as {
    companyDesc?: unknown;
    faqs?: unknown;
  };
  return {
    companyDesc: typeof p.companyDesc === 'string' ? p.companyDesc : '',
    faqs: (Array.isArray(p.faqs) ? p.faqs : [])
      .map((f: any) => ({ q: String(f?.q || ''), a: String(f?.a || '') }))
      .filter((f) => f.q || f.a),
  };
}

// 模型不可用时的确定性示例模板（占位表述，绝不编造事实；用户核对修改后再保存）。
function mockCompanyProfile(
  storeName: string,
  categories: string[],
): { companyDesc: string; faqs: Array<{ q: string; a: string }> } {
  const name = storeName || 'Our company';
  const cats = categories.length ? categories.join(', ') : 'a wide range of products';
  return {
    companyDesc:
      `${name} is a professional supplier specializing in ${cats}. ` +
      'We provide OEM & ODM services covering custom sizes, materials, colors and logo printing. ' +
      'Every order goes through strict quality inspection before shipment, and our team supports flexible ' +
      'packaging and shipping solutions for B2B buyers worldwide. We are committed to reliable lead times, ' +
      'responsive communication and long-term cooperation with our customers.',
    faqs: [
      {
        q: 'Can I get samples before placing a bulk order?',
        a: 'Yes. Samples are available; sample cost and shipping depend on the product and your location, and are usually refundable against a bulk order.',
      },
      {
        q: 'Do you support OEM / ODM customization?',
        a: 'Yes. We support custom sizes, materials, colors and logo printing. Please share your design or requirements for a quotation.',
      },
      {
        q: 'What is your lead time?',
        a: 'Lead time depends on quantity and customization. Typically samples take a few days and bulk orders take 1-3 weeks after confirmation.',
      },
      {
        q: 'What are your payment terms?',
        a: 'We commonly accept T/T (30% deposit, balance before shipment) and other methods supported by Alibaba.com Trade Assurance.',
      },
      {
        q: 'How will my order be shipped?',
        a: 'We support sea, air and express shipping. We will recommend the most cost-effective solution based on your quantity and destination.',
      },
    ],
  };
}

function sanitizeAccount(row: Record<string, unknown>): Record<string, unknown> {
  // access_token 有效期短（约 1 天）且会自动刷新，不据它提示；真正需要用户重新授权的信号是
  // refresh_token 即将过期（超期未刷新才需重新授权）。故 expiringSoon 基于 refreshExpiresAt。
  const refreshAt = row.refreshExpiresAt ? new Date(row.refreshExpiresAt as string) : null;
  const soon = refreshAt ? refreshAt.getTime() - Date.now() < 24 * 3600 * 1000 : false;
  // 状态按「令牌事实」核定，不直接信 authStatus 字段（早期演示种子行写过 connected/expired 但从未持有令牌）：
  // 无任何令牌 → 未连接；标记已连接但 refresh 已过期 → 授权过期。保证页面上的授权状态永远真实。
  const hasToken = Boolean(row.accessTokenEnc || row.refreshTokenEnc);
  let authStatus = String(row.authStatus || 'disconnected');
  if (!hasToken) authStatus = 'disconnected';
  else if (authStatus === 'connected' && refreshAt && refreshAt.getTime() < Date.now()) authStatus = 'expired';
  return {
    id: row.id,
    platform: row.platform,
    storeName: row.storeName,
    authStatus,
    country: row.country ?? null,
    sellerId: row.sellerId ?? null,
    accountUid: row.accountUid ?? null,
    expiresAt: row.expiresAt ?? null,
    refreshExpiresAt: row.refreshExpiresAt ?? null,
    expiringSoon: row.authStatus === 'connected' && soon,
    isDefault: Boolean((row.settings as Record<string, unknown> | null)?.isDefault),
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
          const accountId = Number((ctx.query as Record<string, string>).accountId);
          const state = issueState(Number.isInteger(accountId) && accountId > 0 ? accountId : undefined);
          ctx.redirect(connector.buildAuthorizeUrl(state));
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
        const stateResult = consumeState(state);
        if (!stateResult.ok) {
          ctx.body = resultPage(false, ['授权会话已过期或非法（state 校验失败）', '请回后台重新发起「连接店铺」']);
          return;
        }
        try {
          const bundle = await connector.exchangeCode(code);
          const accountId = await resolveAccountId(plugin, bundle, stateResult.accountId);
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

  // 账号变更审计（actorType=user：新增/改名/删除/设默认都是用户操作）。
  const auditAccount = async (
    ctx: Context,
    action: string,
    resourceId: number,
    oldValue: unknown,
    newValue: unknown,
    reason: string,
  ) => {
    await plugin.app.db.getRepository('aiListingAuditLogs').create({
      values: {
        actorType: 'user',
        actorId: String((ctx.state as any)?.currentUser?.id ?? 'unknown'),
        action,
        resourceType: 'platform_account',
        resourceId,
        oldValue,
        newValue,
        reason,
        traceId: ctx.reqId || `srv-${Date.now()}`,
      },
    });
  };

  // 受控 action（登录态）：平台连接页读状态 / 账号增删改 / 设默认 / 断开。
  app.resourceManager.define({
    name: 'aiListingOpenApi',
    actions: {
      // 全平台账号总览：所有平台的账号行（脱敏）+ 平台元数据（是否支持 OAuth 授权 / 真实接入）。
      async status(ctx: Context, next: Next) {
        const repo = plugin.app.db.getRepository('aiListingPlatformAccounts');
        const rows = await repo.find({ sort: ['id'] });
        const platforms = SUPPORTED_PLATFORMS.map((p) => {
          const c = findConnector(p);
          return {
            value: p,
            label: c?.label || p,
            oauthSupported: Boolean(c && typeof c.buildAuthorizeUrl === 'function'),
            real: Boolean(c && isRealEnabled(c.id)),
          };
        });
        ctx.body = {
          authorizeStartUrl: START_PATH,
          accounts: (rows as Record<string, unknown>[]).map(sanitizeAccount),
          platforms,
        };
        await next();
      },

      // 新增平台链接（账号占位行）：先建行再点「授权」绑定令牌。该平台首个账号自动设为默认。
      async createAccount(ctx: Context, next: Next) {
        const v = (ctx.action.params.values || {}) as { platform?: string; storeName?: string };
        const platform = String(v.platform || '').trim();
        const storeName = String(v.storeName || '').trim();
        if (!platform || !SUPPORTED_PLATFORMS.includes(platform)) {
          ctx.status = 400;
          ctx.body = { ok: false, message: `平台无效，取值之一：${SUPPORTED_PLATFORMS.join(' / ')}` };
          return await next();
        }
        if (!storeName) {
          ctx.status = 400;
          ctx.body = { ok: false, message: '请填写店铺名称（用于在各处下拉里辨认这个账号）' };
          return await next();
        }
        const repo = plugin.app.db.getRepository('aiListingPlatformAccounts');
        const siblings = await repo.count({ filter: { platform } });
        const created = await repo.create({
          values: { platform, storeName, authStatus: 'disconnected', settings: { isDefault: siblings === 0 } },
        });
        await auditAccount(ctx, 'account.create', created.id, null, { platform, storeName }, '新增平台链接');
        ctx.body = { ok: true, id: created.id, isDefault: siblings === 0 };
        await next();
      },

      // 改名：店铺名称只是本系统的展示标识，随时可改。
      async updateAccount(ctx: Context, next: Next) {
        const v = (ctx.action.params.values || {}) as { id?: number; storeName?: string };
        const id = Number(v.id);
        const storeName = String(v.storeName || '').trim();
        if (!id || !storeName) {
          ctx.status = 400;
          ctx.body = { ok: false, message: '缺少账号 id 或店铺名称' };
          return await next();
        }
        const repo = plugin.app.db.getRepository('aiListingPlatformAccounts');
        const acc = await repo.findOne({ filterByTk: id });
        if (!acc) {
          ctx.status = 404;
          ctx.body = { ok: false, message: '账号不存在' };
          return await next();
        }
        const old = acc.get('storeName');
        await repo.update({ filterByTk: id, values: { storeName } });
        await auditAccount(ctx, 'account.rename', id, old, storeName, '修改店铺显示名称');
        ctx.body = { ok: true };
        await next();
      },

      // 删除账号行：令牌一并删除；历史发布记录/批次保留（店铺名将显示为「店铺 #id」）。
      async deleteAccount(ctx: Context, next: Next) {
        const id = Number((ctx.action.params.values || ({} as any)).id);
        if (!id) {
          ctx.status = 400;
          ctx.body = { ok: false, message: '缺少账号 id' };
          return await next();
        }
        const repo = plugin.app.db.getRepository('aiListingPlatformAccounts');
        const acc = await repo.findOne({ filterByTk: id });
        if (!acc) {
          ctx.status = 404;
          ctx.body = { ok: false, message: '账号不存在' };
          return await next();
        }
        await repo.destroy({ filterByTk: id });
        await auditAccount(
          ctx,
          'account.delete',
          id,
          { platform: acc.get('platform'), storeName: acc.get('storeName'), authStatus: acc.get('authStatus') },
          null,
          '删除平台账号（历史发布记录保留）',
        );
        ctx.body = { ok: true };
        await next();
      },

      // 设默认账号（按平台唯一）：抓取等「不显式选店铺」的功能用默认账号；发布页下拉也会预选它。
      async setDefaultAccount(ctx: Context, next: Next) {
        const id = Number((ctx.action.params.values || ({} as any)).id);
        if (!id) {
          ctx.status = 400;
          ctx.body = { ok: false, message: '缺少账号 id' };
          return await next();
        }
        const repo = plugin.app.db.getRepository('aiListingPlatformAccounts');
        const acc = await repo.findOne({ filterByTk: id });
        if (!acc) {
          ctx.status = 404;
          ctx.body = { ok: false, message: '账号不存在' };
          return await next();
        }
        const platform = acc.get('platform');
        const siblings = await repo.find({ filter: { platform } });
        for (const s of siblings) {
          const settings = { ...(s.get('settings') || {}), isDefault: s.get('id') === id };
          await repo.update({ filterByTk: s.get('id'), values: { settings } });
        }
        await auditAccount(ctx, 'account.set_default', id, null, { platform }, '设为该平台默认账号');
        ctx.body = { ok: true };
        await next();
      },

      // ── 公司介绍 + FAQ（账号级，存 settings.companyProfile；发布草稿时自动写入结构化详描）──
      async getCompanyProfile(ctx: Context, next: Next) {
        const id = Number((ctx.action.params.values || ({} as any)).id);
        const repo = plugin.app.db.getRepository('aiListingPlatformAccounts');
        const acc = id ? await repo.findOne({ filterByTk: id }) : null;
        if (!acc) {
          ctx.status = 404;
          ctx.body = { ok: false, message: '账号不存在' };
          return await next();
        }
        ctx.body = { ok: true, profile: readCompanyProfile(acc.get('settings')) };
        await next();
      },

      async saveCompanyProfile(ctx: Context, next: Next) {
        const v = (ctx.action.params.values || {}) as {
          id?: number;
          companyDesc?: string;
          faqs?: Array<{ q?: string; a?: string }>;
        };
        const id = Number(v.id);
        const repo = plugin.app.db.getRepository('aiListingPlatformAccounts');
        const acc = id ? await repo.findOne({ filterByTk: id }) : null;
        if (!acc) {
          ctx.status = 404;
          ctx.body = { ok: false, message: '账号不存在' };
          return await next();
        }
        // 按官方 rule 收敛：介绍 ≤2000 字符；FAQ ≤8 对，Q ≤150 / A ≤500；空对丢弃。
        const companyDesc = String(v.companyDesc || '')
          .trim()
          .slice(0, 2000);
        const faqs = (Array.isArray(v.faqs) ? v.faqs : [])
          .map((f) => ({
            q: String(f?.q || '')
              .trim()
              .slice(0, 150),
            a: String(f?.a || '')
              .trim()
              .slice(0, 500),
          }))
          .filter((f) => f.q && f.a)
          .slice(0, 8);
        const settings = { ...(acc.get('settings') || {}), companyProfile: { companyDesc, faqs } };
        await repo.update({ filterByTk: id, values: { settings } });
        await auditAccount(
          ctx,
          'account.company_profile',
          id,
          null,
          { companyDescLength: companyDesc.length, faqCount: faqs.length },
          '保存公司介绍/FAQ（发布草稿时随结构化详描写入 companyDesc/companyFaqDesc）',
        );
        ctx.body = { ok: true, profile: { companyDesc, faqs } };
        await next();
      },

      // AI 一键生成公司介绍 + FAQ：只生成返回给前端预览，不落库（用户点「保存」才写 settings）。
      // 铁律：不虚构成立年份/认证/产能等具体事实——要点由用户在 brief 里给，缺失就用中性表述。
      async generateCompanyProfile(ctx: Context, next: Next) {
        const v = (ctx.action.params.values || {}) as { id?: number; brief?: string };
        const id = Number(v.id);
        const repo = plugin.app.db.getRepository('aiListingPlatformAccounts');
        const acc = id ? await repo.findOne({ filterByTk: id }) : null;
        if (!acc) {
          ctx.status = 404;
          ctx.body = { ok: false, message: '账号不存在' };
          return await next();
        }
        const storeName = String(acc.get('storeName') || '').trim();
        const brief = String(v.brief || '')
          .trim()
          .slice(0, 1000);
        // 主营品类参考：取最近商品的源类目（单商家系统，商品即本店经营方向）。
        const products = await plugin.app.db
          .getRepository('aiListingProducts')
          .find({ sort: ['-id'], limit: 30, fields: ['categoryOriginal'] });
        const categories: string[] = [
          ...new Set<string>(
            (products as Array<{ get: (k: string) => unknown }>)
              .map((p) => String(p.get('categoryOriginal') || '').trim())
              .filter((s) => s.length > 0),
          ),
        ].slice(0, 5);
        const userPrompt = [
          `为 Alibaba.com 国际站卖家「${storeName || '本店'}」生成结构化商详的公司介绍与 FAQ。`,
          `主营品类参考：${categories.join('、') || '（暂无，按通用外贸供应商写）'}`,
          `卖家提供的要点：${brief || '（未提供。写通用介绍，突出定制能力/品控/交付，不要编造细节）'}`,
          '要求：',
          '1. companyDesc：英文公司介绍，120~200 词，面向 B2B 买家，涵盖主营产品、定制能力（OEM/ODM）、品控与交付；',
          '   严禁编造具体成立年份、认证证书、产能/员工数字——卖家要点里没有的事实一律用中性表述。',
          '2. faqs：4~6 条英文 FAQ（起订量/样品/交期/付款/物流/定制），问题 ≤150 字符、回答 ≤500 字符；',
          '   涉及具体数字（如样品费、交期天数）用区间或「depends on quantity」类表述，不要编造确定数字。',
          '只返回 JSON：{"companyDesc":"...","faqs":[{"q":"...","a":"..."}]}，不要解释。',
        ].join('\n');
        // 75s 超时：默认模型是思考型（DeepSeek v4），生成整段介绍+FAQ 常超过 callModel 默认 20s。
        const llm = await callModel(
          plugin,
          [
            { role: 'system', content: '你是跨境电商 B2B 文案助手，输出务实、专业、无夸大词的英文内容。' },
            { role: 'user', content: userPrompt },
          ],
          75000,
        );
        const parsed = parseJsonObject(llm);
        const mock = !parsed;
        const raw = parsed || mockCompanyProfile(storeName, categories);
        const profile = {
          companyDesc: String((raw as any).companyDesc || '')
            .trim()
            .slice(0, 2000),
          faqs: (Array.isArray((raw as any).faqs) ? ((raw as any).faqs as Array<{ q?: string; a?: string }>) : [])
            .map((f) => ({
              q: String(f?.q || '')
                .trim()
                .slice(0, 150),
              a: String(f?.a || '')
                .trim()
                .slice(0, 500),
            }))
            .filter((f) => f.q && f.a)
            .slice(0, 8),
        };
        ctx.body = {
          ok: true,
          profile,
          mock,
          ...(mock ? { message: '当前未配置可用模型或模型调用失败，返回示例模板；请核对修改后再保存。' } : {}),
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
  app.acl.allow(
    'aiListingOpenApi',
    [
      'status',
      'disconnect',
      'createAccount',
      'updateAccount',
      'deleteAccount',
      'setDefaultAccount',
      'getCompanyProfile',
      'saveCompanyProfile',
      'generateCompanyProfile',
    ],
    'loggedIn',
  );
}
