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
import { runPrecheck, type PrecheckIssue } from './precheck';
import { buildPublishPayload, PublishAdapterError, resolvePublishAdapter, SUPPORTED_PLATFORMS } from './adapters';

// 仅「已审核」商品进入待发布池；发布成功→published，校验不通过→保持 reviewed（修复后可重发）。
const PUBLISHABLE_STATUS = new Set(['reviewed']);

interface PublishConfig {
  targetPlatform?: string;
  targetStoreId?: number;
  categoryTargetId?: string;
  shippingTemplateId?: string;
  strategy?: string;
  speedMode?: string;
}

interface PublishRepos {
  Batches: any;
  Records: any;
  Products: any;
  Skus: any;
  Media: any;
}
function getRepos(db: any): PublishRepos {
  return {
    Batches: db.getRepository('aiListingPublishBatches'),
    Records: db.getRepository('aiListingPublishRecords'),
    Products: db.getRepository('aiListingProducts'),
    Skus: db.getRepository('aiListingSkus'),
    Media: db.getRepository('aiListingMediaAssets'),
  };
}

// 读取单个商品的校验上下文（商品 + SKU + 媒体）。
async function loadProductContext(repos: PublishRepos, productId: number) {
  const product = await repos.Products.findOne({ filterByTk: productId });
  if (!product) return null;
  const skus = await repos.Skus.find({ filter: { productId }, sort: ['id'] });
  const media = await repos.Media.find({ filter: { productId, assetType: 'image' }, sort: ['sort', 'id'] });
  return { product, skus, media };
}

// 对单个商品跑校验，返回 issues + 归一化数据。
function precheckProduct(ctx: { product: any; skus: any[]; media: any[] }, config: PublishConfig) {
  const images = ctx.media.map((m: any) => m.get('sourceUrl')).filter(Boolean);
  const hasMainImage = ctx.media.some((m: any) => m.get('role') === 'main') || images.length > 0;
  const result = runPrecheck({
    product: {
      titleFinal: ctx.product.get('titleFinal'),
      titleProcessed: ctx.product.get('titleProcessed'),
      priceTarget: ctx.product.get('priceTarget'),
      stock: ctx.product.get('stock'),
      categoryTargetId: ctx.product.get('categoryTargetId'),
    },
    skus: ctx.skus.map((s: any) => ({
      sku: s.get('sku'),
      priceTarget: s.get('priceTarget'),
      stock: s.get('stock'),
    })),
    hasMainImage,
    imageCount: images.length,
    config: { targetStoreId: config.targetStoreId, categoryTargetId: config.categoryTargetId },
  });
  return { ...result, images };
}

export function setupPublish(plugin: Plugin): void {
  const { app } = plugin;
  const db = app.db;

  app.resourceManager.define({
    name: 'aiListingPublish',
    actions: {
      // 待发布商品池：已审核商品 + 主图。
      listPublishable: async (ctx: Context, next: Next) => {
        const traceId = ctx.reqId || `srv-${Date.now()}`;
        const { Products, Media } = getRepos(db);
        const rows = await Products.find({
          filter: { status: { $in: [...PUBLISHABLE_STATUS] } },
          sort: ['-id'],
          limit: 200,
        });
        const products = [];
        for (const p of rows) {
          const pid = p.get('id');
          const main = await Media.findOne({ filter: { productId: pid, role: 'main' } });
          products.push({
            id: pid,
            title: p.get('titleFinal') || p.get('titleProcessed') || p.get('titleOriginal'),
            targetPlatform: p.get('targetPlatform'),
            priceTarget: p.get('priceTarget'),
            stock: p.get('stock'),
            categoryTargetId: p.get('categoryTargetId'),
            status: p.get('status'),
            mainImage: main ? main.get('sourceUrl') : null,
          });
        }
        ctx.body = {
          ok: true,
          data: { products, total: products.length, platforms: SUPPORTED_PLATFORMS },
          warnings: [],
          errors: [],
          traceId,
        };
        await next();
      },

      // 发布前校验：对选中商品逐个校验，返回 ready + issues（只读，不写库）。
      precheck: async (ctx: Context, next: Next) => {
        const traceId = ctx.reqId || `srv-${Date.now()}`;
        const v = (ctx.action?.params?.values || {}) as { productIds?: number[]; config?: PublishConfig };
        const productIds = Array.isArray(v.productIds) ? v.productIds.map(Number).filter((n) => !Number.isNaN(n)) : [];
        if (!productIds.length) {
          ctx.status = 400;
          ctx.body = fail('NO_PRODUCTS_SELECTED', '请先选择要校验的商品', false, traceId);
          return await next();
        }
        const config = v.config || {};
        const repos = getRepos(db);
        const results = [];
        let blockedCount = 0;
        for (const pid of productIds) {
          const pctx = await loadProductContext(repos, pid);
          if (!pctx) {
            results.push({
              productId: pid,
              ready: false,
              issues: [{ level: 'block', code: 'PRODUCT_NOT_FOUND', field: 'id', message: '商品不存在' }],
            });
            blockedCount++;
            continue;
          }
          const r = precheckProduct(pctx, config);
          if (!r.ready) blockedCount++;
          results.push({
            productId: pid,
            title: pctx.product.get('titleFinal') || pctx.product.get('titleProcessed'),
            ready: r.ready,
            issues: r.issues,
          });
        }
        ctx.body = {
          ok: true,
          data: { results, total: productIds.length, readyCount: productIds.length - blockedCount, blockedCount },
          warnings: blockedCount ? [`${blockedCount} 个商品未通过校验，无法发布`] : [],
          errors: [],
          traceId,
        };
        await next();
      },

      // 模拟发布：对选中商品创建发布批次 + 逐条发布记录。仅校验通过的商品发布（mock adapter）。
      // 幂等：① idempotencyKey 命中已存在批次则直接返回（防重复点击）；② 同商品+同店铺已有成功记录则跳过（防重复发布）。
      publish: async (ctx: Context, next: Next) => {
        const traceId = ctx.reqId || `srv-${Date.now()}`;
        const v = (ctx.action?.params?.values || {}) as {
          productIds?: number[];
          config?: PublishConfig;
          idempotencyKey?: string;
        };
        const productIds = Array.isArray(v.productIds) ? v.productIds.map(Number).filter((n) => !Number.isNaN(n)) : [];
        const config = v.config || {};
        if (!productIds.length) {
          ctx.status = 400;
          ctx.body = fail('NO_PRODUCTS_SELECTED', '请先选择要发布的商品', false, traceId);
          return await next();
        }
        if (!config.targetPlatform || !SUPPORTED_PLATFORMS.includes(config.targetPlatform)) {
          ctx.status = 400;
          ctx.body = fail('PUBLISH_PLATFORM_REQUIRED', '请选择目标平台', false, traceId);
          return await next();
        }
        const repos = getRepos(db);

        // 幂等层 ①：idempotencyKey 命中近期批次则直接返回该批次（防重复点击重复建批次/记录）。
        if (v.idempotencyKey) {
          const recent = await repos.Batches.find({ sort: ['-id'], limit: 50 });
          const dup = recent.find((b: any) => (b.get('metadata') || {}).idempotencyKey === v.idempotencyKey);
          if (dup) {
            ctx.body = {
              ok: true,
              data: {
                batchId: dup.get('id'),
                batchNo: dup.get('batchNo'),
                idempotent: true,
                status: dup.get('status'),
              },
              warnings: ['重复提交已忽略，返回已存在的发布批次'],
              errors: [],
              traceId,
            };
            return await next();
          }
        }

        const adapter = resolvePublishAdapter(config.targetPlatform);
        const batch = await repos.Batches.create({
          values: {
            targetPlatform: config.targetPlatform,
            targetStoreId: config.targetStoreId,
            categoryTargetId: config.categoryTargetId,
            shippingTemplateId: config.shippingTemplateId,
            strategy: config.strategy || 'immediate',
            speedMode: config.speedMode || 'standard',
            status: 'running',
            totalCount: productIds.length,
            successCount: 0,
            failedCount: 0,
            traceId,
            metadata: { idempotencyKey: v.idempotencyKey || null },
          },
        });
        const batchId = batch.get('id');

        let success = 0;
        let failed = 0;
        let skipped = 0;
        const outcomes = [];
        for (const pid of productIds) {
          const pctx = await loadProductContext(repos, pid);
          if (!pctx) {
            failed++;
            await repos.Records.create({
              values: {
                batchId,
                productId: pid,
                targetPlatform: config.targetPlatform,
                targetStoreId: config.targetStoreId,
                result: 'failed',
                status: 'failed',
                failureReason: '商品不存在',
                errorCode: 'PRODUCT_NOT_FOUND',
                retryable: false,
                traceId,
              },
            });
            outcomes.push({ productId: pid, result: 'failed', errorCode: 'PRODUCT_NOT_FOUND' });
            continue;
          }
          const status = pctx.product.get('status');

          // 幂等层 ②：同商品 + 同店铺已有成功记录则跳过，不重复发布、不重复建记录。
          const existed = await repos.Records.findOne({
            filter: { productId: pid, targetStoreId: config.targetStoreId || null, result: 'success' },
          });
          if (existed || status === 'published') {
            skipped++;
            outcomes.push({ productId: pid, result: 'skipped', reason: '已发布（幂等跳过）' });
            continue;
          }
          if (!PUBLISHABLE_STATUS.has(status)) {
            failed++;
            await repos.Records.create({
              values: {
                batchId,
                productId: pid,
                targetPlatform: config.targetPlatform,
                targetStoreId: config.targetStoreId,
                result: 'failed',
                status: 'failed',
                failureReason: `商品状态「${status}」不可发布，仅已审核(reviewed)可发布`,
                errorCode: 'PRODUCT_NOT_PUBLISHABLE',
                retryable: false,
                traceId,
              },
            });
            outcomes.push({ productId: pid, result: 'failed', errorCode: 'PRODUCT_NOT_PUBLISHABLE' });
            continue;
          }

          // 校验通过后才能模拟发布（要求 #5）。
          const pre = precheckProduct(pctx, config);
          if (!pre.ready) {
            failed++;
            const blocks = pre.issues.filter((i: PrecheckIssue) => i.level === 'block');
            await repos.Records.create({
              values: {
                batchId,
                productId: pid,
                targetPlatform: config.targetPlatform,
                targetStoreId: config.targetStoreId,
                result: 'failed',
                status: 'failed',
                failureReason: blocks.map((b) => b.message).join('；'),
                errorCode: blocks[0]?.code || 'PUBLISH_PRECHECK_FAILED',
                retryable: true,
                traceId,
                metadata: { issues: pre.issues },
              },
            });
            outcomes.push({ productId: pid, result: 'failed', errorCode: blocks[0]?.code });
            continue;
          }

          // 模拟发布（mock adapter，不接真实平台）。
          await repos.Products.update({ filterByTk: pid, values: { status: 'publishing' } });
          const payload = buildPublishPayload(
            {
              titleFinal: pctx.product.get('titleFinal'),
              titleProcessed: pctx.product.get('titleProcessed'),
              descriptionFinal: pctx.product.get('descriptionFinal'),
              descriptionProcessed: pctx.product.get('descriptionProcessed'),
              priceTarget: pctx.product.get('priceTarget'),
              stock: pctx.product.get('stock'),
              categoryTargetId: pctx.product.get('categoryTargetId'),
              attributesProcessed: pctx.product.get('attributesProcessed'),
            },
            pctx.skus.map((s: any) => ({
              sku: s.get('sku'),
              priceTarget: s.get('priceTarget'),
              stock: s.get('stock'),
              specValue: s.get('specValue'),
            })),
            pre.images,
            config,
          );
          try {
            const res = await adapter.publish(payload);
            success++;
            await repos.Records.create({
              values: {
                batchId,
                productId: pid,
                targetPlatform: config.targetPlatform,
                targetStoreId: config.targetStoreId,
                result: 'success',
                status: 'success',
                targetProductId: res.targetProductId,
                targetUrl: res.targetUrl,
                requestPayload: { ...payload, images: payload.images.length, variants: payload.variants.length },
                responsePayload: res.responseSummary,
                publishedAt: new Date(),
                traceId,
              },
            });
            await repos.Products.update({ filterByTk: pid, values: { status: 'published' } });
            outcomes.push({
              productId: pid,
              result: 'success',
              targetProductId: res.targetProductId,
              targetUrl: res.targetUrl,
            });
          } catch (e) {
            failed++;
            const code = e instanceof PublishAdapterError ? e.code : 'PUBLISH_FAILED';
            const retryable = e instanceof PublishAdapterError ? e.retryable : true;
            await repos.Products.update({ filterByTk: pid, values: { status: 'publish_failed' } });
            await repos.Records.create({
              values: {
                batchId,
                productId: pid,
                targetPlatform: config.targetPlatform,
                targetStoreId: config.targetStoreId,
                result: 'failed',
                status: 'failed',
                failureReason: (e as Error)?.message || '发布失败',
                errorCode: code,
                retryable,
                traceId,
              },
            });
            outcomes.push({ productId: pid, result: 'failed', errorCode: code });
          }
          await repos.Batches.update({
            filterByTk: batchId,
            values: {
              successCount: success,
              failedCount: failed,
              progress: Math.round(((success + failed + skipped) / productIds.length) * 100),
            },
          });
        }

        // 全部被幂等跳过（无真实发布、无失败）→ skipped；skipped 不在 wf_product_publish 触发条件内，
        // 不会误触发「发布完成」审计。否则按 成功/失败/部分失败 归档。
        const status =
          success === 0 && failed === 0
            ? 'skipped'
            : failed === 0
              ? 'success'
              : success === 0
                ? 'failed'
                : 'partial_failed';
        // 终态 update 命中 wf_product_publish 触发条件（仅终态触发）。
        await repos.Batches.update({
          filterByTk: batchId,
          values: { status, progress: 100, successCount: success, failedCount: failed },
        });
        ctx.logger?.info(`[ai-listing][${traceId}] publish batch ${batchId} done`, {
          batchId,
          success,
          failed,
          skipped,
          status,
        });
        ctx.body = {
          ok: true,
          data: {
            batchId,
            batchNo: batch.get('batchNo'),
            total: productIds.length,
            success,
            failed,
            skipped,
            status,
            outcomes,
          },
          warnings: failed ? [`${failed} 个商品发布失败，可在发布记录中查看原因并重试`] : [],
          errors: [],
          traceId,
        };
        await next();
      },

      // 重试失败项：对批次内失败记录的商品重新发布，追加新记录（不覆盖原失败记录，§8.4）。
      retryFailed: async (ctx: Context, next: Next) => {
        const traceId = ctx.reqId || `srv-${Date.now()}`;
        const batchId = Number((ctx.action?.params?.values as any)?.batchId);
        if (!batchId) {
          ctx.status = 400;
          ctx.body = fail('NO_BATCH_ID', '缺少发布批次 batchId', false, traceId);
          return await next();
        }
        const repos = getRepos(db);
        const batch = await repos.Batches.findOne({ filterByTk: batchId });
        if (!batch) {
          ctx.status = 404;
          ctx.body = fail('BATCH_NOT_FOUND', '发布批次不存在', false, traceId);
          return await next();
        }
        const failedRecords = await repos.Records.find({ filter: { batchId, result: 'failed' } });
        const config: PublishConfig = {
          targetPlatform: batch.get('targetPlatform'),
          targetStoreId: batch.get('targetStoreId'),
          categoryTargetId: batch.get('categoryTargetId'),
          shippingTemplateId: batch.get('shippingTemplateId'),
        };
        const adapter = resolvePublishAdapter(config.targetPlatform);
        let success = 0;
        let stillFailed = 0;
        for (const rec of failedRecords) {
          const pid = rec.get('productId');
          const pctx = await loadProductContext(repos, pid);
          if (!pctx) {
            stillFailed++;
            continue;
          }
          const pre = precheckProduct(pctx, config);
          if (!pre.ready) {
            stillFailed++;
            const blocks = pre.issues.filter((i: PrecheckIssue) => i.level === 'block');
            await repos.Records.create({
              values: {
                batchId,
                productId: pid,
                targetPlatform: config.targetPlatform,
                targetStoreId: config.targetStoreId,
                result: 'failed',
                status: 'failed',
                failureReason: blocks.map((b) => b.message).join('；'),
                errorCode: blocks[0]?.code || 'PUBLISH_PRECHECK_FAILED',
                retryable: true,
                traceId,
                metadata: { retryOf: rec.get('id') },
              },
            });
            continue;
          }
          const payload = buildPublishPayload(
            {
              titleFinal: pctx.product.get('titleFinal'),
              priceTarget: pctx.product.get('priceTarget'),
              stock: pctx.product.get('stock'),
              categoryTargetId: pctx.product.get('categoryTargetId'),
              attributesProcessed: pctx.product.get('attributesProcessed'),
            },
            pctx.skus.map((s: any) => ({
              sku: s.get('sku'),
              priceTarget: s.get('priceTarget'),
              stock: s.get('stock'),
              specValue: s.get('specValue'),
            })),
            pre.images,
            config,
          );
          const res = await adapter.publish(payload);
          success++;
          await repos.Records.create({
            values: {
              batchId,
              productId: pid,
              targetPlatform: config.targetPlatform,
              targetStoreId: config.targetStoreId,
              result: 'success',
              status: 'success',
              targetProductId: res.targetProductId,
              targetUrl: res.targetUrl,
              responsePayload: res.responseSummary,
              publishedAt: new Date(),
              traceId,
              metadata: { retryOf: rec.get('id') },
            },
          });
          await repos.Products.update({ filterByTk: pid, values: { status: 'published' } });
        }
        const total = batch.get('totalCount') || 0;
        const newSuccess = (batch.get('successCount') || 0) + success;
        const newFailed = Math.max(0, (batch.get('failedCount') || 0) - success);
        const newStatus = newFailed === 0 ? 'success' : newSuccess === 0 ? 'failed' : 'partial_failed';
        await repos.Batches.update({
          filterByTk: batchId,
          values: { successCount: newSuccess, failedCount: newFailed, status: newStatus },
        });
        ctx.body = {
          ok: true,
          data: { batchId, retried: failedRecords.length, success, stillFailed, total },
          warnings: stillFailed ? [`仍有 ${stillFailed} 个商品发布失败`] : [],
          errors: [],
          traceId,
        };
        await next();
      },

      // 发布进度：返回批次 + 发布记录明细。
      getBatchProgress: async (ctx: Context, next: Next) => {
        const traceId = ctx.reqId || `srv-${Date.now()}`;
        const params = ctx.action?.params || {};
        const batchId = (params.values && params.values.batchId) || (params as any).batchId || params.filterByTk;
        if (!batchId) {
          ctx.status = 400;
          ctx.body = fail('NO_BATCH_ID', '缺少 batchId', false, traceId);
          return await next();
        }
        const repos = getRepos(db);
        const batch = await repos.Batches.findOne({ filterByTk: batchId });
        if (!batch) {
          ctx.status = 404;
          ctx.body = fail('BATCH_NOT_FOUND', '发布批次不存在', false, traceId);
          return await next();
        }
        const records = await repos.Records.find({ filter: { batchId }, sort: ['id'] });
        ctx.body = { ok: true, data: { batch, records }, warnings: [], errors: [], traceId };
        await next();
      },
    },
  });

  // ACL：登录用户可校验/发布/重试/查询（细粒度「仅审核通过且角色受限可发布」留待 nocobase-acl-manage 细化）。
  app.acl.allow('aiListingPublish', 'listPublishable', 'loggedIn');
  app.acl.allow('aiListingPublish', 'precheck', 'loggedIn');
  app.acl.allow('aiListingPublish', 'publish', 'loggedIn');
  app.acl.allow('aiListingPublish', 'retryFailed', 'loggedIn');
  app.acl.allow('aiListingPublish', 'getBatchProgress', 'loggedIn');
}
