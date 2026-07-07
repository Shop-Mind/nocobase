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
import { buildPublishPayload, PublishAdapterError, SUPPORTED_PLATFORMS } from './adapters';
import {
  listPlatformsMeta,
  predictCategoryWithAccount,
  queryTargetStatusWithAccount,
  resolvePublishTarget,
} from './real-publish';

// 发布速率（条/间隔）：真实平台发布逐条限速，避免触发平台 QPS 限制与风控（短时间大量发品易被判违规）。
// mock 发布不限速。safe=每 6s 一条（~10/分）、standard=每 2s 一条（~30/分）、fast=每 0.5s 一条（小批量用）。
const SPEED_DELAY_MS: Record<string, number> = { safe: 6000, standard: 2000, fast: 500 };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

// 店铺显示名：批次/进度展示用（「店铺 Alibaba 供应商号」而不是一串 storeId）。
async function resolveStoreName(db: any, storeId: unknown): Promise<string | null> {
  const id = Number(storeId);
  if (!id) return null;
  const account = await db.getRepository('aiListingPlatformAccounts').findOne({ filterByTk: id });
  return account ? account.get('storeName') || `店铺 #${id}` : null;
}

// 发布图集「采纳集优先」过滤:弃用资产（含被替换原图）与未采纳的 AI 候选不进发布;
// 已采纳候选（origin=ai_adopted）的 sourceUrl 即本地候选图地址，随 sort 顺序自然入列。
// JS 侧过滤而非 SQL $ne：历史行 discarded 可能为 NULL，SQL 三值逻辑会把它们误滤掉。
// 入参需已按 sort,id 排序;导出供单测。
export function selectPublishableMedia<T extends { get: (k: string) => unknown }>(all: T[]): T[] {
  return all.filter((m) => !m.get('discarded') && m.get('origin') !== 'ai_candidate');
}

// 发布视频位取图:采纳视频(finalSelected)优先;否则回退到非 AI 候选的历史视频(兼容会话工具旧产物);
// 未采纳的 AI 视频候选(origin=ai_candidate)绝不进发布(与图片同一铁律:AI 只产候选,采纳才写最终)。
export function selectPublishableVideo<T extends { get: (k: string) => unknown }>(videos: T[]): T | undefined {
  const alive = videos.filter((v) => !v.get('discarded'));
  return alive.find((v) => v.get('finalSelected')) || alive.find((v) => v.get('origin') !== 'ai_candidate');
}

// 读取单个商品的校验上下文（商品 + SKU + 媒体）。
async function loadProductContext(repos: PublishRepos, productId: number) {
  const product = await repos.Products.findOne({ filterByTk: productId });
  if (!product) return null;
  const skus = await repos.Skus.find({ filter: { productId }, sort: ['id'] });
  const all = await repos.Media.find({ filter: { productId, assetType: 'image' }, sort: ['sort', 'id'] });
  const media = selectPublishableMedia(all);
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
      categoryOriginalId: ctx.product.get('categoryOriginalId'),
      sourcePlatform: ctx.product.get('sourcePlatform'),
      attributes: ctx.product.get('attributesProcessed') || ctx.product.get('attributesOriginal'),
    },
    skus: ctx.skus.map((s: any) => ({
      sku: s.get('sku'),
      priceTarget: s.get('priceTarget'),
      stock: s.get('stock'),
    })),
    hasMainImage,
    imageCount: images.length,
    config: {
      targetPlatform: config.targetPlatform,
      targetStoreId: config.targetStoreId,
      categoryTargetId: config.categoryTargetId,
    },
  });
  return { ...result, images };
}

export function setupPublish(plugin: Plugin): void {
  const { app } = plugin;
  const db = app.db;

  app.resourceManager.define({
    name: 'aiListingPublish',
    actions: {
      // 待发布商品池：已审核商品 + 主图 + 源/目标类目。platformsMeta 带每个平台的真实接入状态与已授权店铺。
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
            currencyOriginal: p.get('currencyOriginal'),
            stock: p.get('stock'),
            moq: p.get('moq'),
            categoryOriginal: p.get('categoryOriginal'),
            categoryOriginalId: p.get('categoryOriginalId'),
            categoryTargetId: p.get('categoryTargetId'),
            categoryTargetName: p.get('categoryTargetName'),
            status: p.get('status'),
            mainImage: main ? main.get('sourceUrl') : null,
          });
        }
        ctx.body = {
          ok: true,
          data: {
            products,
            total: products.length,
            platforms: SUPPORTED_PLATFORMS,
            platformsMeta: await listPlatformsMeta(plugin),
          },
          warnings: [],
          errors: [],
          traceId,
        };
        await next();
      },

      // 类目预测：用所选店铺账号调平台类目预测接口（标题+主图），把结果写回商品 categoryTargetId/Name。
      // 平台无预测能力（mock/未接入）时返回 predicted=false，发布时由平台按标题自动识别类目兜底。
      predictCategory: async (ctx: Context, next: Next) => {
        const traceId = ctx.reqId || `srv-${Date.now()}`;
        const v = (ctx.action?.params?.values || {}) as { productIds?: number[]; accountId?: number };
        const productIds = Array.isArray(v.productIds) ? v.productIds.map(Number).filter((n) => !Number.isNaN(n)) : [];
        const accountId = Number(v.accountId);
        if (!productIds.length || !accountId) {
          ctx.status = 400;
          ctx.body = fail('CATEGORY_PREDICT_PARAMS', '请选择商品并指定已授权的店铺账号', false, traceId);
          return await next();
        }
        const { Products, Media } = getRepos(db);
        const results = [];
        for (const pid of productIds) {
          const product = await Products.findOne({ filterByTk: pid });
          if (!product) {
            results.push({ productId: pid, ok: false, message: '商品不存在' });
            continue;
          }
          const title = product.get('titleFinal') || product.get('titleProcessed') || product.get('titleOriginal');
          const main = await Media.findOne({ filter: { productId: pid, role: 'main' } });
          try {
            const prediction = await predictCategoryWithAccount(plugin, accountId, {
              title,
              imageUrl: main ? main.get('sourceUrl') : undefined,
            });
            if (!prediction) {
              results.push({
                productId: pid,
                ok: false,
                predicted: false,
                message: '该平台暂无类目预测能力（发布时平台自动识别）',
              });
              continue;
            }
            const categoryTargetName = prediction.categoryPath || prediction.categoryName || null;
            await Products.update({
              filterByTk: pid,
              values: { categoryTargetId: prediction.categoryId, categoryTargetName },
            });
            results.push({
              productId: pid,
              ok: true,
              categoryId: prediction.categoryId,
              categoryName: categoryTargetName,
            });
          } catch (e) {
            const code = e instanceof PublishAdapterError ? e.code : 'CATEGORY_PREDICT_FAILED';
            results.push({ productId: pid, ok: false, code, message: (e as Error)?.message || '类目预测失败' });
          }
        }
        const okCount = results.filter((r) => r.ok).length;
        ctx.body = {
          ok: true,
          data: { results, okCount, failCount: results.length - okCount },
          warnings: okCount < results.length ? [`${results.length - okCount} 个商品类目预测失败`] : [],
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

      // 发布：对选中商品创建发布批次 + 逐条发布记录。仅校验通过的商品发布。
      // 真接入开关开且店铺已授权 → 真实平台发布（带发布速率限速）；否则 mock。
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

        let resolved;
        try {
          resolved = await resolvePublishTarget(plugin, config);
        } catch (e) {
          const code = e instanceof PublishAdapterError ? e.code : 'PUBLISH_TARGET_INVALID';
          ctx.status = 400;
          ctx.body = fail(code, (e as Error)?.message || '发布目标无效', false, traceId);
          return await next();
        }
        const { adapter, real } = resolved;
        const delayMs = real ? SPEED_DELAY_MS[config.speedMode || 'standard'] ?? SPEED_DELAY_MS.standard : 0;
        // 发布策略默认「草稿」：只进卖家后台草稿箱、人工审核后上架（用户要求的安全默认）；
        // immediate=直接上架（走平台审核）。真实平台不支持草稿接口时明确报错，不静默转直接上架。
        const strategy = config.strategy || 'draft';
        const useDraft = strategy === 'draft';
        if (useDraft && !adapter.publishDraft) {
          ctx.status = 400;
          ctx.body = fail(
            'PUBLISH_DRAFT_UNSUPPORTED',
            `平台「${config.targetPlatform}」暂不支持草稿发布`,
            false,
            traceId,
          );
          return await next();
        }
        const draftFn = adapter.publishDraft?.bind(adapter);
        const publishFn = useDraft && draftFn ? draftFn : adapter.publish.bind(adapter);
        const batch = await repos.Batches.create({
          values: {
            targetPlatform: config.targetPlatform,
            targetStoreId: config.targetStoreId,
            categoryTargetId: config.categoryTargetId,
            shippingTemplateId: config.shippingTemplateId,
            strategy,
            speedMode: config.speedMode || 'standard',
            status: 'running',
            totalCount: productIds.length,
            successCount: 0,
            failedCount: 0,
            traceId,
            metadata: { idempotencyKey: v.idempotencyKey || null, real, adapter: adapter.name, draft: useDraft },
          },
        });
        const batchId = batch.get('id');

        let success = 0;
        let failed = 0;
        let skipped = 0;
        let attempted = 0;
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

          // 发布速率：真实平台发布时，条与条之间按 speedMode 间隔，避免触发平台限流/风控。
          if (delayMs && attempted > 0) await sleep(delayMs);
          attempted++;
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
              categoryOriginalId: pctx.product.get('categoryOriginalId'),
              sourcePlatform: pctx.product.get('sourcePlatform'),
              attributesProcessed: pctx.product.get('attributesProcessed'),
              currencyOriginal: pctx.product.get('currencyOriginal'),
              moq: pctx.product.get('moq'),
              ladderTarget: pctx.product.get('ladderTarget'),
            },
            pctx.skus.map((s: any) => ({
              sku: s.get('sku'),
              priceTarget: s.get('priceTarget'),
              stock: s.get('stock'),
              specValue: s.get('specValue'),
              specAttrs: s.get('specAttrs'),
              imageUrl: s.get('imageUrl'),
              unit: s.get('unit'),
            })),
            pre.images,
            config,
          );
          const videoAsset = selectPublishableVideo(
            await repos.Media.find({ filter: { productId: pid, assetType: 'video' } }),
          );
          if (videoAsset) payload.videoUrl = videoAsset.get('sourceUrl') as string;
          try {
            const res = await publishFn(payload);
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
                metadata: { draft: useDraft },
              },
            });
            await repos.Products.update({ filterByTk: pid, values: { status: 'published' } });
            outcomes.push({
              productId: pid,
              result: 'success',
              draft: useDraft,
              targetProductId: res.targetProductId,
              targetUrl: res.targetUrl,
              draftPath: (res.responseSummary as any)?.draftPath,
              notes: (res.responseSummary as any)?.notes,
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
            real,
            draft: useDraft,
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
        let resolved;
        try {
          resolved = await resolvePublishTarget(plugin, config);
        } catch (e) {
          const code = e instanceof PublishAdapterError ? e.code : 'PUBLISH_TARGET_INVALID';
          ctx.status = 400;
          ctx.body = fail(code, (e as Error)?.message || '发布目标无效', false, traceId);
          return await next();
        }
        const { adapter, real } = resolved;
        const delayMs = real ? SPEED_DELAY_MS[batch.get('speedMode') || 'standard'] ?? SPEED_DELAY_MS.standard : 0;
        // 重试沿用原批次的发布策略（草稿批次重试仍发草稿）。
        const useDraft = (batch.get('strategy') || 'draft') === 'draft';
        if (useDraft && !adapter.publishDraft) {
          ctx.status = 400;
          ctx.body = fail(
            'PUBLISH_DRAFT_UNSUPPORTED',
            `平台「${config.targetPlatform}」暂不支持草稿发布`,
            false,
            traceId,
          );
          return await next();
        }
        const draftFn = adapter.publishDraft?.bind(adapter);
        const publishFn = useDraft && draftFn ? draftFn : adapter.publish.bind(adapter);
        let success = 0;
        let stillFailed = 0;
        let attempted = 0;
        // 同一商品可能有多条失败记录（多次重试叠加），只按商品去重重试一次；已有成功记录的商品跳过（防重复发布）。
        const retriedProducts = new Set<number>();
        for (const rec of failedRecords) {
          const pid = rec.get('productId');
          if (retriedProducts.has(pid)) continue;
          retriedProducts.add(pid);
          const succeeded = await repos.Records.findOne({
            filter: { productId: pid, targetStoreId: config.targetStoreId || null, result: 'success' },
          });
          if (succeeded) continue;
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
          if (delayMs && attempted > 0) await sleep(delayMs);
          attempted++;
          const payload = buildPublishPayload(
            {
              titleFinal: pctx.product.get('titleFinal'),
              titleProcessed: pctx.product.get('titleProcessed'),
              descriptionFinal: pctx.product.get('descriptionFinal'),
              descriptionProcessed: pctx.product.get('descriptionProcessed'),
              priceTarget: pctx.product.get('priceTarget'),
              stock: pctx.product.get('stock'),
              categoryTargetId: pctx.product.get('categoryTargetId'),
              categoryOriginalId: pctx.product.get('categoryOriginalId'),
              sourcePlatform: pctx.product.get('sourcePlatform'),
              attributesProcessed: pctx.product.get('attributesProcessed'),
              currencyOriginal: pctx.product.get('currencyOriginal'),
              moq: pctx.product.get('moq'),
              ladderTarget: pctx.product.get('ladderTarget'),
            },
            pctx.skus.map((s: any) => ({
              sku: s.get('sku'),
              priceTarget: s.get('priceTarget'),
              stock: s.get('stock'),
              specValue: s.get('specValue'),
              specAttrs: s.get('specAttrs'),
              imageUrl: s.get('imageUrl'),
              unit: s.get('unit'),
            })),
            pre.images,
            config,
          );
          const videoAsset = selectPublishableVideo(
            await repos.Media.find({ filter: { productId: pid, assetType: 'video' } }),
          );
          if (videoAsset) payload.videoUrl = videoAsset.get('sourceUrl') as string;
          try {
            const res = await publishFn(payload);
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
                metadata: { retryOf: rec.get('id'), draft: useDraft },
              },
            });
            await repos.Products.update({ filterByTk: pid, values: { status: 'published' } });
          } catch (e) {
            stillFailed++;
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
                metadata: { retryOf: rec.get('id') },
              },
            });
          }
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

      // 查询目标平台发布状态：真实发布后跟踪商品在平台侧是 online / pending（审核中）/ draft / failed。
      queryTargetStatus: async (ctx: Context, next: Next) => {
        const traceId = ctx.reqId || `srv-${Date.now()}`;
        const recordId = Number((ctx.action?.params?.values as any)?.recordId);
        if (!recordId) {
          ctx.status = 400;
          ctx.body = fail('NO_RECORD_ID', '缺少发布记录 recordId', false, traceId);
          return await next();
        }
        const repos = getRepos(db);
        const rec = await repos.Records.findOne({ filterByTk: recordId });
        if (!rec || !rec.get('targetProductId')) {
          ctx.status = 404;
          ctx.body = fail('RECORD_NOT_FOUND', '发布记录不存在或无目标商品 ID', false, traceId);
          return await next();
        }
        try {
          const res = await queryTargetStatusWithAccount(
            plugin,
            Number(rec.get('targetStoreId')),
            String(rec.get('targetProductId')),
          );
          if (res) {
            const values: Record<string, unknown> = {
              metadata: {
                ...(rec.get('metadata') || {}),
                platformStatus: res.status,
                platformStatusDesc: res.description,
              },
            };
            // 平台异步 bizcheck 判失败 → 把发布记录与商品状态同步为失败，运营可修复后走「重试失败项」。
            if (res.status === 'failed' && rec.get('result') === 'success') {
              values.result = 'failed';
              values.status = 'failed';
              values.failureReason = `平台审核失败：${res.description || '(平台未给出原因)'}`;
              values.retryable = true;
              await repos.Products.update({ filterByTk: rec.get('productId'), values: { status: 'publish_failed' } });
            }
            await repos.Records.update({ filterByTk: recordId, values });
          }
          ctx.body = {
            ok: true,
            data: { recordId, status: res?.status ?? null, description: res?.description },
            warnings: [],
            errors: [],
            traceId,
          };
        } catch (e) {
          const code = e instanceof PublishAdapterError ? e.code : 'STATUS_QUERY_FAILED';
          ctx.status = 400;
          ctx.body = fail(code, (e as Error)?.message || '平台状态查询失败', false, traceId);
        }
        await next();
      },

      // 发布进度：返回批次 + 发布记录明细（记录附商品标题/主图，批次附店铺名——批次要「人能看懂」）。
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
        const rows = await repos.Records.find({ filter: { batchId }, sort: ['id'] });
        const pids = [...new Set(rows.map((r: any) => r.get('productId')).filter(Boolean))] as number[];
        const titleById: Record<number, string> = {};
        const imageById: Record<number, string> = {};
        if (pids.length) {
          const products = await repos.Products.find({ filter: { id: { $in: pids } } });
          for (const p of products) {
            titleById[p.get('id')] =
              p.get('titleFinal') || p.get('titleProcessed') || p.get('titleOriginal') || `商品 #${p.get('id')}`;
          }
          const mains = await repos.Media.find({
            filter: { $and: [{ productId: { $in: pids } }, { role: 'main' }] },
            sort: ['id'],
          });
          for (const m of mains) {
            const pid = m.get('productId');
            if (imageById[pid] == null && m.get('sourceUrl')) imageById[pid] = m.get('sourceUrl');
          }
        }
        const records = rows.map((r: any) => ({
          ...r.toJSON(),
          productTitle: titleById[r.get('productId')] || `商品 #${r.get('productId')}`,
          productImage: imageById[r.get('productId')] || null,
        }));
        const storeName = await resolveStoreName(db, batch.get('targetStoreId'));
        ctx.body = {
          ok: true,
          data: { batch: { ...batch.toJSON(), storeName }, records },
          warnings: [],
          errors: [],
          traceId,
        };
        await next();
      },

      // 近期发布批次：跨平台/店铺的批次总览（时间 + 平台 + 店铺 + 策略 + 成败计数），发布页用它取代「看不懂的批次号」。
      listRecentBatches: async (ctx: Context, next: Next) => {
        const traceId = ctx.reqId || `srv-${Date.now()}`;
        const limit = Math.min(Math.max(Number((ctx.action?.params?.values as any)?.limit) || 8, 1), 30);
        const repos = getRepos(db);
        const rows = await repos.Batches.find({ sort: ['-id'], limit });
        const storeIds = [...new Set(rows.map((b: any) => Number(b.get('targetStoreId'))).filter(Boolean))];
        const storeNameById: Record<number, string> = {};
        if (storeIds.length) {
          const Accounts = db.getRepository('aiListingPlatformAccounts');
          const accounts = await Accounts.find({ filter: { id: { $in: storeIds } } });
          for (const a of accounts) storeNameById[a.get('id')] = a.get('storeName') || `店铺 #${a.get('id')}`;
        }
        // 每个批次附商品预览（标题+主图，最多 3 件）：批量取记录→去重商品→join 标题与主图，避免 N+1。
        const batchIds = rows.map((b: any) => b.get('id'));
        const productIdsByBatch: Record<number, number[]> = {};
        if (batchIds.length) {
          const recs = await repos.Records.find({
            filter: { batchId: { $in: batchIds } },
            fields: ['id', 'batchId', 'productId'],
            sort: ['id'],
          });
          for (const r of recs) {
            const bid = r.get('batchId');
            const pid = r.get('productId');
            if (!pid) continue;
            if (!productIdsByBatch[bid]) productIdsByBatch[bid] = [];
            if (!productIdsByBatch[bid].includes(pid)) productIdsByBatch[bid].push(pid);
          }
        }
        const allPids = [...new Set(Object.values(productIdsByBatch).flat())];
        const titleById: Record<number, string> = {};
        const imageById: Record<number, string> = {};
        if (allPids.length) {
          const products = await repos.Products.find({ filter: { id: { $in: allPids } } });
          for (const p of products) {
            titleById[p.get('id')] =
              p.get('titleFinal') || p.get('titleProcessed') || p.get('titleOriginal') || `商品 #${p.get('id')}`;
          }
          const mains = await repos.Media.find({
            filter: { $and: [{ productId: { $in: allPids } }, { role: 'main' }] },
            sort: ['id'],
          });
          for (const m of mains) {
            const pid = m.get('productId');
            if (imageById[pid] == null && m.get('sourceUrl')) imageById[pid] = m.get('sourceUrl');
          }
        }
        const batches = rows.map((b: any) => {
          const pids = productIdsByBatch[b.get('id')] || [];
          return {
            id: b.get('id'),
            batchNo: b.get('batchNo'),
            targetPlatform: b.get('targetPlatform'),
            targetStoreId: b.get('targetStoreId'),
            storeName: storeNameById[Number(b.get('targetStoreId'))] || null,
            strategy: b.get('strategy'),
            status: b.get('status'),
            totalCount: b.get('totalCount'),
            successCount: b.get('successCount'),
            failedCount: b.get('failedCount'),
            real: Boolean((b.get('metadata') || {}).real),
            createdAt: b.get('createdAt'),
            products: pids.slice(0, 3).map((pid) => ({
              id: pid,
              title: titleById[pid] || `商品 #${pid}`,
              mainImage: imageById[pid] || null,
            })),
            productTotal: pids.length,
          };
        });
        ctx.body = { ok: true, data: { batches }, warnings: [], errors: [], traceId };
        await next();
      },

      // 删除发布记录：失败记录随删；成功记录删除后该商品对同店铺的幂等跳过随之解除（用于平台侧草稿已删、需要重发的场景）。
      deleteRecord: async (ctx: Context, next: Next) => {
        const traceId = ctx.reqId || `srv-${Date.now()}`;
        const recordId = Number((ctx.action?.params?.values as any)?.recordId);
        if (!recordId) {
          ctx.status = 400;
          ctx.body = fail('NO_RECORD_ID', '缺少发布记录 recordId', false, traceId);
          return await next();
        }
        const repos = getRepos(db);
        const rec = await repos.Records.findOne({ filterByTk: recordId });
        if (!rec) {
          ctx.status = 404;
          ctx.body = fail('RECORD_NOT_FOUND', '发布记录不存在', false, traceId);
          return await next();
        }
        if (rec.get('status') === 'running') {
          ctx.status = 409;
          ctx.body = fail('RECORD_RUNNING', '该记录正在发布中，不能删除', true, traceId);
          return await next();
        }
        const wasSuccess = rec.get('result') === 'success';
        await repos.Records.destroy({ filterByTk: recordId });
        const AuditLogs = db.getRepository('aiListingAuditLogs');
        await AuditLogs.create({
          values: {
            actorType: 'user',
            actorId: String((ctx.state as any)?.currentUser?.id ?? 'unknown'),
            action: 'publish.delete_record',
            resourceType: 'publish_record',
            resourceId: recordId,
            oldValue: {
              productId: rec.get('productId'),
              result: rec.get('result'),
              targetProductId: rec.get('targetProductId'),
            },
            reason: '删除发布记录',
            traceId,
          },
        });
        ctx.body = {
          ok: true,
          data: { recordId, deleted: true },
          warnings: wasSuccess
            ? ['已删除一条成功记录：该商品对此店铺的重复发布保护已解除，请确认平台侧对应草稿/商品已处理。']
            : [],
          errors: [],
          traceId,
        };
        await next();
      },

      // 删除发布批次：批次 + 其全部记录一起删（进行中的批次不可删）。商品状态不动——它由记录之外的状态机管理。
      deleteBatch: async (ctx: Context, next: Next) => {
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
        if (batch.get('status') === 'running') {
          ctx.status = 409;
          ctx.body = fail('BATCH_RUNNING', '该批次正在发布中，不能删除', true, traceId);
          return await next();
        }
        const recordCount = await repos.Records.count({ filter: { batchId } });
        await repos.Records.destroy({ filter: { batchId } });
        await repos.Batches.destroy({ filterByTk: batchId });
        const AuditLogs = db.getRepository('aiListingAuditLogs');
        await AuditLogs.create({
          values: {
            actorType: 'user',
            actorId: String((ctx.state as any)?.currentUser?.id ?? 'unknown'),
            action: 'publish.delete_batch',
            resourceType: 'publish_batch',
            resourceId: batchId,
            oldValue: { batchNo: batch.get('batchNo'), records: recordCount },
            reason: '删除发布批次及其记录',
            traceId,
          },
        });
        ctx.body = {
          ok: true,
          data: { batchId, deleted: true, records: recordCount },
          warnings: [],
          errors: [],
          traceId,
        };
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
  app.acl.allow('aiListingPublish', 'listRecentBatches', 'loggedIn');
  app.acl.allow('aiListingPublish', 'deleteRecord', 'loggedIn');
  app.acl.allow('aiListingPublish', 'deleteBatch', 'loggedIn');
  app.acl.allow('aiListingPublish', 'predictCategory', 'loggedIn');
  app.acl.allow('aiListingPublish', 'queryTargetStatus', 'loggedIn');
}
