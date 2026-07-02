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
import { callModel, parseJsonObject } from '../assistant/llm';
import { ALIBABA_TITLE_CN_LENGTH_HINT, ALIBABA_TITLE_RULES } from '../shared/title-rules';

// Phase 7 预览编辑与人工审核。核心约束：
// - 人工只编辑「最终字段」(titleFinal/descriptionFinal/priceTarget/listPriceTarget/stock/attributesProcessed/SKU)，写库 actorType=user。
// - AI 快捷按钮只写「建议字段」(*Processed)，actorType=ai_employee；最终字段由用户「采纳」时再写（建议 / Ask 后填表）。
// - 审核通过(status=reviewed)后关键字段锁定：saveFinal / AI 写入被拒，需先 rollbackReview 回退。
// - 每次人工/AI 字段变化都写 aiListingAuditLogs（变更记录）。

// 可进入预览编辑的状态：已处理 / 审核中 / 已审核 / 发布中 / 已发布 / 发布失败。
// 状态机闭环（用户要求：发布失败不能永远失败）：
//   processed/reviewing —编辑—> reviewing —标记审核—> reviewed —发布—> publishing —> published | publish_failed
//   publish_failed —直接编辑（saveFinal 自动回 reviewing）/ 直接重新标记审核—> 重新发布
//   published/卡死的 publishing —reopenForEdit 显式退回—> reviewing（平台已发布的商品不受影响，需在发布记录中处理）
const REVIEWABLE_STATUS = ['processed', 'reviewing', 'reviewed', 'publishing', 'published', 'publish_failed'];
// 编辑/AI 建议锁定的状态：已审核（防审后篡改）、发布中/已发布（需先显式退回）。发布失败不锁定——改完即可重走审核发布。
const LOCKED_STATUS = ['reviewed', 'publishing', 'published'];
// saveFinal 允许直接写入的状态（publish_failed 编辑后自动回 reviewing）。
const EDITABLE_STATUS = ['processed', 'reviewing', 'publish_failed'];

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

// 文案管家 Toby 人格（商品信息整理员）。AI「建议」由真实模型按此人格生成；铁律写进 system 防越权/夸大。
const TOBY_SYSTEM =
  '你是跨境电商商品搬运工具里的「文案管家 Toby」，商品信息整理员。职责：把源平台的商品信息改写为适合目标平台的标题/描述/参数建议。' +
  '要求：中文输出、简洁专业、贴合目标平台规范、突出品类关键词与真实卖点；' +
  '严禁使用「最/第一/国家级/包邮/正品保证/绝对」等夸大词、绝对化用语或平台违禁词；不得编造不存在的认证或功效。' +
  '你只产出「建议」供人工采纳，绝不替用户做最终决定。';

// 取商品上下文里可用的最佳标题（最终 > AI 处理 > 原始）。
function bestTitle(p: any): string {
  return cleanTitle(p.get('titleFinal') || p.get('titleProcessed') || p.get('titleOriginal') || '');
}

// 真模型失败 / 未配置时的确定性 mock 兜底（与历史行为一致，保证离线可用、永不报错）。
function mockTitle(p: any): string {
  const base = cleanTitle(p.get('titleProcessed') || p.get('titleOriginal') || '');
  const target = p.get('targetPlatform');
  return target ? `${base} | ${target} 适配款` : base;
}
function mockDescription(p: any): string {
  const title = bestTitle(p);
  const attrs = p.get('attributesProcessed') || {};
  const sell = Object.entries(attrs)
    .slice(0, 3)
    .map(([k, val]) => `${k}: ${val}`)
    .join('，');
  return `${title}。${sell ? `核心参数 ${sell}。` : ''}正品好物，现货速发，支持批量采购。`;
}
function mockAttributes(existing: Record<string, any>): { attrs: Record<string, any>; added: string[] } {
  const attrs = { ...existing };
  const defaults: Record<string, string> = { 适用季节: '四季', 货源类别: '现货', 发货地: '中国' };
  const added: string[] = [];
  for (const [k, val] of Object.entries(defaults)) {
    if (!(k in attrs)) {
      attrs[k] = val;
      added.push(k);
    }
  }
  return { attrs, added };
}

const MOCK_NOTE = '当前未配置可用模型或模型调用失败，返回示例建议；配置模型后将由真实模型生成。';

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
        // 发布上下文：最近一次失败原因（发布失败的商品在编辑页直接看到「为什么失败」）+ 最近成功链接。
        const Records = db.getRepository('aiListingPublishRecords');
        const lastFailed = await Records.findOne({ filter: { productId: id, result: 'failed' }, sort: ['-id'] });
        const lastSuccess = await Records.findOne({ filter: { productId: id, result: 'success' }, sort: ['-id'] });
        const product = {
          id,
          status: p.get('status'),
          reviewStatus: p.get('reviewStatus'),
          sourcePlatform: p.get('sourcePlatform'),
          targetPlatform: p.get('targetPlatform'),
          sourceUrl: p.get('sourceUrl'),
          sourceProductId: p.get('sourceProductId'),
          categoryOriginal: p.get('categoryOriginal'),
          titleOriginal: p.get('titleOriginal'),
          titleProcessed: p.get('titleProcessed'),
          titleFinal: p.get('titleFinal'),
          descriptionOriginal: p.get('descriptionOriginal'),
          descriptionProcessed: p.get('descriptionProcessed'),
          descriptionFinal: p.get('descriptionFinal'),
          descriptionHtmlOriginal: p.get('descriptionHtmlOriginal'),
          priceOriginal: p.get('priceOriginal'),
          currencyOriginal: p.get('currencyOriginal'),
          priceTarget: p.get('priceTarget'),
          listPriceTarget: p.get('listPriceTarget'),
          stock: p.get('stock'),
          attributesOriginal: p.get('attributesOriginal') || {},
          attributesProcessed: p.get('attributesProcessed') || {},
          // 抓取全量信息：起订量/源平台状态/供应商/贸易信息/证书（预览编辑「尽可能展示所有抓取数据」）。
          moq: p.get('moq'),
          statusOriginal: p.get('statusOriginal'),
          shopInfo: p.get('shopInfo') || null,
          tradeInfo: p.get('tradeInfo') || null,
          certifications: p.get('certifications') || null,
          productReviews: p.get('productReviews') || null,
          shopReviews: p.get('shopReviews') || null,
          createdAt: p.get('createdAt'),
          locked: LOCKED_STATUS.includes(p.get('status')),
          lastPublishFailure: lastFailed
            ? {
                reason: lastFailed.get('failureReason'),
                errorCode: lastFailed.get('errorCode'),
                targetPlatform: lastFailed.get('targetPlatform'),
                at: lastFailed.get('createdAt'),
              }
            : null,
          publishUrl: lastSuccess ? lastSuccess.get('targetUrl') : null,
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
              specAttrs: s.get('specAttrs') || null,
              imageUrl: s.get('imageUrl'),
              unit: s.get('unit'),
              priceOriginal: s.get('priceOriginal'),
              ladderPrice: s.get('ladderPrice') || null,
              priceTarget: s.get('priceTarget'),
              stock: s.get('stock'),
            })),
            media: media.map((m: any) => ({
              id: m.get('id'),
              role: m.get('role'),
              assetType: m.get('assetType'),
              sourceUrl: m.get('sourceUrl'),
              sort: m.get('sort'),
              processStatus: m.get('processStatus'),
              processedFileId: m.get('processedFileId'),
              sourceFileId: m.get('sourceFileId'),
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
        const currentStatus = p.get('status');
        if (!EDITABLE_STATUS.includes(currentStatus)) {
          ctx.status = 409;
          const hint =
            currentStatus === 'reviewed'
              ? '该商品已审核，关键字段已锁定。请先「回退审核」再编辑。'
              : currentStatus === 'publishing'
                ? '该商品正在发布中，请等发布结束（成功/失败）后再编辑。'
                : currentStatus === 'published'
                  ? '该商品已发布。请先「退回编辑」再修改（平台上已发布的内容不受影响）。'
                  : `商品状态「${currentStatus}」不可编辑。`;
          ctx.body = fail('REVIEW_LOCKED', hint, true, traceId);
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
        // 一旦人工编辑，进入「审核中」（processed/reviewing/publish_failed 统一收敛——发布失败改完即回审核流，不会卡死在失败态）。
        patch.status = 'reviewing';
        if (currentStatus === 'publish_failed') patch.reviewStatus = 'pending';
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
        // 只允许从编辑流内的状态标记审核（publish_failed 可直接重新提审——失败原因在平台侧、本地无需改动时的快捷通道）。
        if (!EDITABLE_STATUS.includes(p.get('status'))) {
          ctx.status = 409;
          ctx.body = fail(
            'REVIEW_STATUS_INVALID',
            `商品状态「${p.get('status')}」不能标记审核。已发布/发布中的商品请先「退回编辑」。`,
            true,
            traceId,
          );
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

      // 退回编辑：把 已发布 / 发布失败 / 卡死的发布中 显式退回「审核中」，重新走 编辑→审核→发布。
      // 已发布商品退回只改本地状态，平台上已发布的草稿/商品不受影响；如需重新发布同一店铺，需在发布记录中删除原成功记录（幂等层按记录判重）。
      reopenForEdit: async (ctx: Context, next: Next) => {
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
        const status = p.get('status');
        const reopenable = ['publish_failed', 'published', 'publishing'];
        if (!reopenable.includes(status)) {
          ctx.status = 400;
          ctx.body = fail(
            'NOT_REOPENABLE',
            `商品状态「${status}」无需退回，可直接编辑或走「回退审核」。`,
            false,
            traceId,
          );
          return await next();
        }
        // 发布中：只有超过 5 分钟没有任何更新才允许解锁（视为卡死批次），避免和正在跑的发布互相打架。
        if (status === 'publishing') {
          const updatedAt = new Date(p.get('updatedAt')).getTime();
          if (Date.now() - updatedAt < 5 * 60 * 1000) {
            ctx.status = 409;
            ctx.body = fail(
              'PUBLISHING_IN_PROGRESS',
              '该商品正在发布中（5 分钟内有更新），请稍后再试。',
              true,
              traceId,
            );
            return await next();
          }
        }
        await Products.update({ filterByTk: id, values: { status: 'reviewing', reviewStatus: 'pending' } });
        await AuditLogs.create({
          values: {
            actorType: 'user',
            actorId: currentUserId(ctx),
            action: 'review.reopen',
            resourceType: 'product',
            resourceId: id,
            fieldName: 'status',
            oldValue: status,
            newValue: 'reviewing',
            reason:
              status === 'published'
                ? '已发布商品退回编辑（平台已发布内容不受影响）'
                : status === 'publishing'
                  ? '发布中卡死，人工解锁退回编辑'
                  : '发布失败退回编辑',
            traceId,
          },
        });
        const warnings =
          status === 'published'
            ? ['已退回编辑。如需重新发布到同一店铺，请先在发布页删除原成功记录（避免被幂等跳过）。']
            : [];
        ctx.body = { ok: true, data: { id, status: 'reviewing', from: status }, warnings, errors: [], traceId };
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
  app.acl.allow('aiListingReview', 'reopenForEdit', 'loggedIn');
  app.acl.allow('aiListingReview', 'changeLog', 'loggedIn');
}

// AI 快捷按钮（信息整理员 dex / 翻译助理 lexi 的代理）。只写「建议字段」*Processed，actorType=ai_employee。
// 用户在前端点「采纳」时才把建议写入最终字段（走 saveFinal，actorType=user）——即「建议 / Ask 后填表」。
function setupAiActions(plugin: Plugin): void {
  const { app } = plugin;
  const db = app.db;

  const guardLocked = (p: any) => LOCKED_STATUS.includes(p.get('status'));

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
        const target = p.get('targetPlatform') || '目标平台';
        const original = cleanTitle(p.get('titleProcessed') || p.get('titleOriginal') || '');
        const attrs = p.get('attributesProcessed') || p.get('attributesOriginal') || {};
        const userPrompt =
          `请为以下商品优化一个面向「${target}」的商品标题：\n` +
          `原始标题：${original || '（无）'}\n` +
          `已知参数：${JSON.stringify(attrs)}\n` +
          `必须严格遵守平台官方标题规范：${ALIBABA_TITLE_RULES}\n` +
          `要求：${ALIBABA_TITLE_CN_LENGTH_HINT}；突出核心品名与真实卖点，不堆砌关键词，不含夸大或违禁词。` +
          `只返回优化后的标题文本本身，不要解释、不要引号、不要换行。`;
        const llm = await callModel(plugin, [
          { role: 'system', content: TOBY_SYSTEM },
          { role: 'user', content: userPrompt },
        ]);
        const mock = llm == null;
        const suggestion = (mock ? mockTitle(p) : llm)
          .split('\n')[0]
          .replace(/^[\s"「『'"]+|[\s"」』'"]+$/g, '')
          .trim()
          .slice(0, 300);
        await Products.update({ filterByTk: id, values: { titleProcessed: suggestion } });
        await writeAudit(AuditLogs, [
          {
            actorType: 'ai_employee',
            actorId: 'lst-toby',
            action: 'ai.suggest_title',
            resourceType: 'product',
            resourceId: id,
            fieldName: 'titleProcessed',
            oldValue: p.get('titleProcessed'),
            newValue: suggestion,
            reason: mock ? 'AI 优化标题建议（示例·未接模型，待人工采纳）' : 'AI 优化标题建议（DeepSeek，待人工采纳）',
            traceId,
          },
        ]);
        ctx.body = {
          ok: true,
          data: { id, field: 'titleProcessed', suggestion, mock },
          warnings: mock ? [MOCK_NOTE] : [],
          errors: [],
          traceId,
        };
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
        const title = bestTitle(p);
        const target = p.get('targetPlatform') || '目标平台';
        const attrs = p.get('attributesProcessed') || p.get('attributesOriginal') || {};
        const userPrompt =
          `请为以下商品撰写一段面向「${target}」买家的商品描述：\n` +
          `标题：${title || '（无）'}\n` +
          `参数：${JSON.stringify(attrs)}\n` +
          `要求：结构化呈现（卖点 / 规格参数 / 适用场景），中文、200~400 字、不含夸大或违禁词。只返回描述正文，不要标题、不要解释。`;
        const llm = await callModel(plugin, [
          { role: 'system', content: TOBY_SYSTEM },
          { role: 'user', content: userPrompt },
        ]);
        const mock = llm == null;
        const suggestion = (mock ? mockDescription(p) : llm).trim().slice(0, 2000);
        await Products.update({ filterByTk: id, values: { descriptionProcessed: suggestion } });
        await writeAudit(AuditLogs, [
          {
            actorType: 'ai_employee',
            actorId: 'lst-toby',
            action: 'ai.suggest_description',
            resourceType: 'product',
            resourceId: id,
            fieldName: 'descriptionProcessed',
            oldValue: p.get('descriptionProcessed'),
            newValue: suggestion,
            reason: mock ? 'AI 生成描述建议（示例·未接模型，待人工采纳）' : 'AI 生成描述建议（DeepSeek，待人工采纳）',
            traceId,
          },
        ]);
        ctx.body = {
          ok: true,
          data: { id, field: 'descriptionProcessed', suggestion, mock },
          warnings: mock ? [MOCK_NOTE] : [],
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
        const existing = { ...(p.get('attributesProcessed') || p.get('attributesOriginal') || {}) };
        const title = bestTitle(p);
        const category = p.get('categoryOriginal') || p.get('categoryTargetId') || '';
        const userPrompt =
          `请补全以下商品常见但缺失的关键参数：\n` +
          `标题：${title || '（无）'}\n` +
          `类目：${category || '（未知）'}\n` +
          `已知参数：${JSON.stringify(existing)}\n` +
          `请按品类合理推断 颜色/材质/尺寸/适用场景/适用季节/产地 等常见参数。只返回一个 JSON 对象（键=参数名、值=参数值，全部中文），不要解释、不要代码块。`;
        const llm = await callModel(plugin, [
          { role: 'system', content: TOBY_SYSTEM },
          { role: 'user', content: userPrompt },
        ]);
        const parsed = parseJsonObject(llm);
        let attrs: Record<string, any>;
        let added: string[];
        let mock: boolean;
        if (parsed) {
          attrs = { ...existing };
          added = [];
          for (const [k, val] of Object.entries(parsed)) {
            if (!(k in attrs) && val != null && String(val).trim()) {
              attrs[k] = typeof val === 'object' ? JSON.stringify(val) : val;
              added.push(k);
            }
          }
          mock = false;
        } else {
          const fallback = mockAttributes(existing);
          attrs = fallback.attrs;
          added = fallback.added;
          mock = true;
        }
        await Products.update({ filterByTk: id, values: { attributesProcessed: attrs } });
        await writeAudit(AuditLogs, [
          {
            actorType: 'ai_employee',
            actorId: 'lst-toby',
            action: 'ai.complete_attributes',
            resourceType: 'product',
            resourceId: id,
            fieldName: 'attributesProcessed',
            oldValue: p.get('attributesProcessed'),
            newValue: attrs,
            reason: mock
              ? `AI 补全参数建议（示例·未接模型，新增 ${added.join('、') || '无'}）`
              : `AI 补全参数建议（DeepSeek，新增 ${added.join('、') || '无'}）`,
            traceId,
          },
        ]);
        ctx.body = {
          ok: true,
          data: { id, attributes: attrs, added, mock },
          warnings: mock ? [MOCK_NOTE] : [],
          errors: [],
          traceId,
        };
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
