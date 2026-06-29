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
import { writeAudit, type AuditEntry } from '../processing/audit';

// Phase 7 预览编辑与人工审核。核心约束：
// - 人工只编辑「最终字段」(titleFinal/descriptionFinal/priceTarget/listPriceTarget/stock/attributesProcessed/SKU)，写库 actorType=user。
// - AI 快捷按钮只写「建议字段」(*Processed)，actorType=ai_employee；最终字段由用户「采纳」时再写（建议 / Ask 后填表）。
// - 审核通过(status=reviewed)后关键字段锁定：saveFinal / AI 写入被拒，需先 rollbackReview 回退。
// - 每次人工/AI 字段变化都写 aiListingAuditLogs（变更记录）。

// 可进入预览编辑的状态：已处理 / 审核中 / 已审核（已审核为只读，需回退后编辑）。
const REVIEWABLE_STATUS = ['processed', 'reviewing', 'reviewed'];

interface ReviewRepos {
  Products: any;
  Skus: any;
  Media: any;
  AuditLogs: any;
}
function getRepos(db: any): ReviewRepos {
  return {
    Products: db.getRepository('aiListingProducts'),
    Skus: db.getRepository('aiListingSkus'),
    Media: db.getRepository('aiListingMediaAssets'),
    AuditLogs: db.getRepository('aiListingAuditLogs'),
  };
}

function currentUserId(ctx: Context): string {
  return String((ctx.state as any)?.currentUser?.id ?? 'unknown');
}

// 去批发噪声词，标题清洗（与处理引擎一致的确定性 mock）。
function cleanTitle(raw: string): string {
  return raw
    .replace(/\b(wholesale|oem|moq\s*\d+\s*pcs?)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s*-\s*$/, '')
    .trim();
}

export function setupReview(plugin: Plugin): void {
  const { app } = plugin;
  const db = app.db;

  app.resourceManager.define({
    name: 'aiListingReview',
    actions: {
      // 左侧商品列表：按状态/平台/关键词筛选已处理商品，返回轻量字段 + 主图。
      list: async (ctx: Context, next: Next) => {
        const traceId = ctx.reqId || `srv-${Date.now()}`;
        const v = (ctx.action?.params?.values || {}) as {
          keyword?: string;
          status?: string;
          platform?: string;
        };
        const filter: Record<string, unknown> = {};
        const and: unknown[] = [{ status: { $in: REVIEWABLE_STATUS } }];
        if (v.status && REVIEWABLE_STATUS.includes(v.status)) and.push({ status: v.status });
        if (v.platform) and.push({ $or: [{ sourcePlatform: v.platform }, { targetPlatform: v.platform }] });
        if (v.keyword && v.keyword.trim()) {
          const kw = v.keyword.trim();
          and.push({
            $or: [
              { titleOriginal: { $includes: kw } },
              { titleProcessed: { $includes: kw } },
              { titleFinal: { $includes: kw } },
            ],
          });
        }
        (filter as any).$and = and;
        const { Products, Media } = getRepos(db);
        const rows = await Products.find({ filter, sort: ['-id'], limit: 200 });
        const products = [];
        for (const p of rows) {
          const pid = p.get('id');
          const main = await Media.findOne({ filter: { productId: pid, role: 'main' } });
          products.push({
            id: pid,
            title: p.get('titleFinal') || p.get('titleProcessed') || p.get('titleOriginal'),
            sourcePlatform: p.get('sourcePlatform'),
            targetPlatform: p.get('targetPlatform'),
            priceTarget: p.get('priceTarget'),
            stock: p.get('stock'),
            status: p.get('status'),
            reviewStatus: p.get('reviewStatus'),
            mainImage: main ? main.get('sourceUrl') : null,
          });
        }
        ctx.body = { ok: true, data: { products, total: products.length }, warnings: [], errors: [], traceId };
        await next();
      },

      // 右侧详情：三段字段（原始/AI建议/最终）+ SKU + 媒体。
      detail: async (ctx: Context, next: Next) => {
        const traceId = ctx.reqId || `srv-${Date.now()}`;
        const id = Number((ctx.action?.params?.values as any)?.id ?? (ctx.action?.params as any)?.id);
        if (!id) {
          ctx.status = 400;
          ctx.body = fail('NO_PRODUCT_ID', '缺少商品 id', false, traceId);
          return await next();
        }
        const { Products, Skus, Media } = getRepos(db);
        const p = await Products.findOne({ filterByTk: id });
        if (!p) {
          ctx.status = 404;
          ctx.body = fail('PRODUCT_NOT_FOUND', '商品不存在', false, traceId);
          return await next();
        }
        const skus = await Skus.find({ filter: { productId: id }, sort: ['id'] });
        const media = await Media.find({ filter: { productId: id }, sort: ['sort', 'id'] });
        const product = {
          id,
          status: p.get('status'),
          reviewStatus: p.get('reviewStatus'),
          sourcePlatform: p.get('sourcePlatform'),
          targetPlatform: p.get('targetPlatform'),
          titleOriginal: p.get('titleOriginal'),
          titleProcessed: p.get('titleProcessed'),
          titleFinal: p.get('titleFinal'),
          descriptionOriginal: p.get('descriptionOriginal'),
          descriptionProcessed: p.get('descriptionProcessed'),
          descriptionFinal: p.get('descriptionFinal'),
          priceOriginal: p.get('priceOriginal'),
          currencyOriginal: p.get('currencyOriginal'),
          priceTarget: p.get('priceTarget'),
          listPriceTarget: p.get('listPriceTarget'),
          stock: p.get('stock'),
          attributesOriginal: p.get('attributesOriginal') || {},
          attributesProcessed: p.get('attributesProcessed') || {},
          locked: p.get('status') === 'reviewed',
        };
        ctx.body = {
          ok: true,
          data: {
            product,
            skus: skus.map((s: any) => ({
              id: s.get('id'),
              sku: s.get('sku'),
              specName: s.get('specName'),
              specValue: s.get('specValue'),
              priceOriginal: s.get('priceOriginal'),
              priceTarget: s.get('priceTarget'),
              stock: s.get('stock'),
            })),
            media: media.map((m: any) => ({
              id: m.get('id'),
              role: m.get('role'),
              assetType: m.get('assetType'),
              sourceUrl: m.get('sourceUrl'),
            })),
          },
          warnings: [],
          errors: [],
          traceId,
        };
        await next();
      },

      // 保存最终字段（人工编辑）。审核后锁定：status=reviewed 时拒绝，需先回退。逐字段写审计。
      saveFinal: async (ctx: Context, next: Next) => {
        const traceId = ctx.reqId || `srv-${Date.now()}`;
        const v = (ctx.action?.params?.values || {}) as {
          id?: number;
          values?: Record<string, any>;
          skus?: Array<{ id: number; priceTarget?: number; stock?: number }>;
        };
        const id = Number(v.id);
        if (!id) {
          ctx.status = 400;
          ctx.body = fail('NO_PRODUCT_ID', '缺少商品 id', false, traceId);
          return await next();
        }
        const { Products, Skus, AuditLogs } = getRepos(db);
        const p = await Products.findOne({ filterByTk: id });
        if (!p) {
          ctx.status = 404;
          ctx.body = fail('PRODUCT_NOT_FOUND', '商品不存在', false, traceId);
          return await next();
        }
        if (p.get('status') === 'reviewed') {
          ctx.status = 409;
          ctx.body = fail('REVIEW_LOCKED', '该商品已审核，关键字段已锁定。请先「回退审核」再编辑。', true, traceId);
          return await next();
        }
        const actorId = currentUserId(ctx);
        const editable = [
          'titleFinal',
          'descriptionFinal',
          'priceTarget',
          'listPriceTarget',
          'stock',
          'attributesProcessed',
        ];
        const incoming = v.values || {};
        const patch: Record<string, unknown> = {};
        const audits: AuditEntry[] = [];
        for (const field of editable) {
          if (!(field in incoming)) continue;
          const oldValue = p.get(field);
          const newValue = incoming[field];
          if (JSON.stringify(oldValue) === JSON.stringify(newValue)) continue;
          patch[field] = newValue;
          audits.push({
            actorType: 'user',
            actorId,
            action: 'edit.final',
            resourceType: 'product',
            resourceId: id,
            fieldName: field,
            oldValue: oldValue ?? null,
            newValue,
            reason: '人工编辑最终字段',
            traceId,
          });
        }
        // 一旦人工编辑，进入「审核中」（从 processed/reviewing 起）。
        patch.status = 'reviewing';
        await Products.update({ filterByTk: id, values: patch });

        // SKU 编辑（目标价 / 库存）。
        let skuChanges = 0;
        for (const su of v.skus || []) {
          const sid = Number(su.id);
          if (!sid) continue;
          const srow = await Skus.findOne({ filterByTk: sid });
          if (!srow || srow.get('productId') !== id) continue;
          const sPatch: Record<string, unknown> = {};
          for (const f of ['priceTarget', 'stock'] as const) {
            if (su[f] === undefined) continue;
            const ov = srow.get(f);
            if (JSON.stringify(ov) === JSON.stringify(su[f])) continue;
            sPatch[f] = su[f];
            audits.push({
              actorType: 'user',
              actorId,
              action: 'edit.sku',
              resourceType: 'product',
              resourceId: id,
              fieldName: `sku#${sid}.${f}`,
              oldValue: ov ?? null,
              newValue: su[f],
              reason: '人工编辑 SKU',
              traceId,
            });
          }
          if (Object.keys(sPatch).length) {
            await Skus.update({ filterByTk: sid, values: sPatch });
            skuChanges++;
          }
        }
        await writeAudit(AuditLogs, audits);
        ctx.body = {
          ok: true,
          data: { id, changed: audits.length, skuChanges, status: 'reviewing' },
          warnings: [],
          errors: [],
          traceId,
        };
        await next();
      },

      // 标记已审核：status -> reviewed，关键字段锁定。要求最终标题已填（否则提示先采纳/填写）。
      approveDraft: async (ctx: Context, next: Next) => {
        const traceId = ctx.reqId || `srv-${Date.now()}`;
        const id = Number((ctx.action?.params?.values as any)?.id);
        if (!id) {
          ctx.status = 400;
          ctx.body = fail('NO_PRODUCT_ID', '缺少商品 id', false, traceId);
          return await next();
        }
        const { Products, AuditLogs } = getRepos(db);
        const p = await Products.findOne({ filterByTk: id });
        if (!p) {
          ctx.status = 404;
          ctx.body = fail('PRODUCT_NOT_FOUND', '商品不存在', false, traceId);
          return await next();
        }
        if (p.get('status') === 'reviewed') {
          ctx.body = { ok: true, data: { id, status: 'reviewed', already: true }, warnings: [], errors: [], traceId };
          return await next();
        }
        const titleFinal = p.get('titleFinal');
        if (!titleFinal || !String(titleFinal).trim()) {
          ctx.status = 400;
          ctx.body = fail('REVIEW_TITLE_REQUIRED', '请先填写或采纳「最终标题」再标记审核通过。', true, traceId);
          return await next();
        }
        await Products.update({ filterByTk: id, values: { status: 'reviewed', reviewStatus: 'reviewed' } });
        await AuditLogs.create({
          values: {
            actorType: 'user',
            actorId: currentUserId(ctx),
            action: 'review.approve',
            resourceType: 'product',
            resourceId: id,
            fieldName: 'status',
            oldValue: p.get('status'),
            newValue: 'reviewed',
            reason: '人工审核通过，关键字段锁定',
            traceId,
          },
        });
        ctx.body = { ok: true, data: { id, status: 'reviewed' }, warnings: [], errors: [], traceId };
        await next();
      },

      // 回退审核：reviewed -> reviewing，解锁编辑。写审计。
      rollbackReview: async (ctx: Context, next: Next) => {
        const traceId = ctx.reqId || `srv-${Date.now()}`;
        const id = Number((ctx.action?.params?.values as any)?.id);
        if (!id) {
          ctx.status = 400;
          ctx.body = fail('NO_PRODUCT_ID', '缺少商品 id', false, traceId);
          return await next();
        }
        const { Products, AuditLogs } = getRepos(db);
        const p = await Products.findOne({ filterByTk: id });
        if (!p) {
          ctx.status = 404;
          ctx.body = fail('PRODUCT_NOT_FOUND', '商品不存在', false, traceId);
          return await next();
        }
        if (p.get('status') !== 'reviewed') {
          ctx.status = 400;
          ctx.body = fail('NOT_REVIEWED', '当前商品未处于已审核状态，无需回退。', false, traceId);
          return await next();
        }
        await Products.update({ filterByTk: id, values: { status: 'reviewing', reviewStatus: 'pending' } });
        await AuditLogs.create({
          values: {
            actorType: 'user',
            actorId: currentUserId(ctx),
            action: 'review.rollback',
            resourceType: 'product',
            resourceId: id,
            fieldName: 'status',
            oldValue: 'reviewed',
            newValue: 'reviewing',
            reason: '回退审核，解锁编辑',
            traceId,
          },
        });
        ctx.body = { ok: true, data: { id, status: 'reviewing' }, warnings: [], errors: [], traceId };
        await next();
      },

      // 变更记录：返回该商品的审计日志（AI/人工/系统，旧值/新值/原因/时间）。
      changeLog: async (ctx: Context, next: Next) => {
        const traceId = ctx.reqId || `srv-${Date.now()}`;
        const id = Number((ctx.action?.params?.values as any)?.id ?? (ctx.action?.params as any)?.id);
        if (!id) {
          ctx.status = 400;
          ctx.body = fail('NO_PRODUCT_ID', '缺少商品 id', false, traceId);
          return await next();
        }
        const { AuditLogs } = getRepos(db);
        const rows = await AuditLogs.find({
          filter: { resourceType: 'product', resourceId: id },
          sort: ['-id'],
          limit: 100,
        });
        const logs = rows.map((r: any) => ({
          id: r.get('id'),
          actorType: r.get('actorType'),
          actorId: r.get('actorId'),
          action: r.get('action'),
          fieldName: r.get('fieldName'),
          oldValue: r.get('oldValue'),
          newValue: r.get('newValue'),
          reason: r.get('reason'),
          traceId: r.get('traceId'),
          createdAt: r.get('createdAt'),
        }));
        ctx.body = { ok: true, data: { logs }, warnings: [], errors: [], traceId };
        await next();
      },
    },
  });

  setupAiActions(plugin);

  app.acl.allow('aiListingReview', 'list', 'loggedIn');
  app.acl.allow('aiListingReview', 'detail', 'loggedIn');
  app.acl.allow('aiListingReview', 'saveFinal', 'loggedIn');
  app.acl.allow('aiListingReview', 'approveDraft', 'loggedIn');
  app.acl.allow('aiListingReview', 'rollbackReview', 'loggedIn');
  app.acl.allow('aiListingReview', 'changeLog', 'loggedIn');
}

// AI 快捷按钮（信息整理员 dex / 翻译助理 lexi 的代理）。只写「建议字段」*Processed，actorType=ai_employee。
// 用户在前端点「采纳」时才把建议写入最终字段（走 saveFinal，actorType=user）——即「建议 / Ask 后填表」。
function setupAiActions(plugin: Plugin): void {
  const { app } = plugin;
  const db = app.db;

  const guardLocked = (p: any) => p.get('status') === 'reviewed';

  app.resourceManager.getResource('aiListingReview') &&
    (() => {
      const res = app.resourceManager.getResource('aiListingReview');

      // 优化标题：写 titleProcessed 建议。
      res?.addAction('aiSuggestTitle', async (ctx: Context, next: Next) => {
        const traceId = ctx.reqId || `srv-${Date.now()}`;
        const id = Number((ctx.action?.params?.values as any)?.id);
        const { Products, AuditLogs } = getRepos(db);
        const p = id ? await Products.findOne({ filterByTk: id }) : null;
        if (!p) {
          ctx.status = 404;
          ctx.body = fail('PRODUCT_NOT_FOUND', '商品不存在', false, traceId);
          return await next();
        }
        if (guardLocked(p)) {
          ctx.status = 409;
          ctx.body = fail('REVIEW_LOCKED', '已审核商品已锁定，请先回退审核再使用 AI。', true, traceId);
          return await next();
        }
        const base = cleanTitle(p.get('titleProcessed') || p.get('titleOriginal') || '');
        const target = p.get('targetPlatform');
        const suggestion = target ? `${base} | ${target} 适配款` : base;
        await Products.update({ filterByTk: id, values: { titleProcessed: suggestion } });
        await writeAudit(AuditLogs, [
          {
            actorType: 'ai_employee',
            actorId: 'lexi',
            action: 'ai.suggest_title',
            resourceType: 'product',
            resourceId: id,
            fieldName: 'titleProcessed',
            oldValue: p.get('titleProcessed'),
            newValue: suggestion,
            reason: 'AI 优化标题建议（待人工采纳到最终标题）',
            traceId,
          },
        ]);
        ctx.body = { ok: true, data: { id, field: 'titleProcessed', suggestion }, warnings: [], errors: [], traceId };
        await next();
      });

      // 生成描述：写 descriptionProcessed 建议。
      res?.addAction('aiSuggestDescription', async (ctx: Context, next: Next) => {
        const traceId = ctx.reqId || `srv-${Date.now()}`;
        const id = Number((ctx.action?.params?.values as any)?.id);
        const { Products, AuditLogs } = getRepos(db);
        const p = id ? await Products.findOne({ filterByTk: id }) : null;
        if (!p) {
          ctx.status = 404;
          ctx.body = fail('PRODUCT_NOT_FOUND', '商品不存在', false, traceId);
          return await next();
        }
        if (guardLocked(p)) {
          ctx.status = 409;
          ctx.body = fail('REVIEW_LOCKED', '已审核商品已锁定，请先回退审核再使用 AI。', true, traceId);
          return await next();
        }
        const title = cleanTitle(p.get('titleFinal') || p.get('titleProcessed') || p.get('titleOriginal') || '');
        const attrs = p.get('attributesProcessed') || {};
        const sell = Object.entries(attrs)
          .slice(0, 3)
          .map(([k, val]) => `${k}: ${val}`)
          .join('，');
        const suggestion = `${title}。${sell ? `核心参数 ${sell}。` : ''}正品好物，现货速发，支持批量采购。`;
        await Products.update({ filterByTk: id, values: { descriptionProcessed: suggestion } });
        await writeAudit(AuditLogs, [
          {
            actorType: 'ai_employee',
            actorId: 'lexi',
            action: 'ai.suggest_description',
            resourceType: 'product',
            resourceId: id,
            fieldName: 'descriptionProcessed',
            oldValue: p.get('descriptionProcessed'),
            newValue: suggestion,
            reason: 'AI 生成描述建议（待人工采纳）',
            traceId,
          },
        ]);
        ctx.body = {
          ok: true,
          data: { id, field: 'descriptionProcessed', suggestion },
          warnings: [],
          errors: [],
          traceId,
        };
        await next();
      });

      // 补全参数：在 attributesProcessed 上补常见缺失键。
      res?.addAction('aiCompleteAttributes', async (ctx: Context, next: Next) => {
        const traceId = ctx.reqId || `srv-${Date.now()}`;
        const id = Number((ctx.action?.params?.values as any)?.id);
        const { Products, AuditLogs } = getRepos(db);
        const p = id ? await Products.findOne({ filterByTk: id }) : null;
        if (!p) {
          ctx.status = 404;
          ctx.body = fail('PRODUCT_NOT_FOUND', '商品不存在', false, traceId);
          return await next();
        }
        if (guardLocked(p)) {
          ctx.status = 409;
          ctx.body = fail('REVIEW_LOCKED', '已审核商品已锁定，请先回退审核再使用 AI。', true, traceId);
          return await next();
        }
        const attrs = { ...(p.get('attributesProcessed') || {}) };
        const defaults: Record<string, string> = { 适用季节: '四季', 货源类别: '现货', 发货地: '中国' };
        const added: string[] = [];
        for (const [k, val] of Object.entries(defaults)) {
          if (!(k in attrs)) {
            attrs[k] = val;
            added.push(k);
          }
        }
        await Products.update({ filterByTk: id, values: { attributesProcessed: attrs } });
        await writeAudit(AuditLogs, [
          {
            actorType: 'ai_employee',
            actorId: 'dex',
            action: 'ai.complete_attributes',
            resourceType: 'product',
            resourceId: id,
            fieldName: 'attributesProcessed',
            oldValue: p.get('attributesProcessed'),
            newValue: attrs,
            reason: `AI 补全参数建议（新增 ${added.join('、') || '无'}）`,
            traceId,
          },
        ]);
        ctx.body = { ok: true, data: { id, attributes: attrs, added }, warnings: [], errors: [], traceId };
        await next();
      });

      // 发布前检查：只读，返回阻断项/警告，不写库、不发布（真实发布属 Phase 8）。
      res?.addAction('aiPrecheck', async (ctx: Context, next: Next) => {
        const traceId = ctx.reqId || `srv-${Date.now()}`;
        const id = Number((ctx.action?.params?.values as any)?.id);
        const { Products, Media } = getRepos(db);
        const p = id ? await Products.findOne({ filterByTk: id }) : null;
        if (!p) {
          ctx.status = 404;
          ctx.body = fail('PRODUCT_NOT_FOUND', '商品不存在', false, traceId);
          return await next();
        }
        const issues: Array<{ level: 'block' | 'warn'; field: string; message: string }> = [];
        if (!p.get('titleFinal') || !String(p.get('titleFinal')).trim()) {
          issues.push({ level: 'block', field: 'titleFinal', message: '最终标题未填写' });
        }
        const price = Number(p.get('priceTarget'));
        if (!price || Number.isNaN(price) || price <= 0) {
          issues.push({ level: 'block', field: 'priceTarget', message: '目标售价无效（需大于 0）' });
        }
        if (!p.get('descriptionFinal') || !String(p.get('descriptionFinal')).trim()) {
          issues.push({ level: 'warn', field: 'descriptionFinal', message: '最终描述为空，建议补充' });
        }
        const mainImg = await Media.findOne({ filter: { productId: id, role: 'main' } });
        if (!mainImg) issues.push({ level: 'warn', field: 'mainImage', message: '缺少主图' });
        const ready = issues.filter((i) => i.level === 'block').length === 0;
        ctx.body = { ok: true, data: { id, ready, issues }, warnings: [], errors: [], traceId };
        await next();
      });
    })();

  app.acl.allow('aiListingReview', 'aiSuggestTitle', 'loggedIn');
  app.acl.allow('aiListingReview', 'aiSuggestDescription', 'loggedIn');
  app.acl.allow('aiListingReview', 'aiCompleteAttributes', 'loggedIn');
  app.acl.allow('aiListingReview', 'aiPrecheck', 'loggedIn');
}
