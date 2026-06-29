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
import { AdapterError, resolveAdapter, type CaptureOptions, type NormalizedProduct } from '../adapters';
import { createProductDraft, fail, getRepos, isValidHttpUrl } from './shared';

// URL 抓取：创建抓取任务 -> 写任务步骤 -> 适配器取数 -> 归一化 -> 生成商品草稿。每步写入 aiListingTaskSteps（含 traceId/errorCode/retryable）。
export function setupCapture(plugin: Plugin): void {
  const { app } = plugin;
  const db = app.db;

  app.resourceManager.define({
    name: 'aiListingCapture',
    actions: {
      startUrlCapture: async (ctx: Context, next: Next) => {
        const traceId = ctx.reqId || `srv-${Date.now()}`;
        const values = (ctx.action?.params?.values || {}) as {
          url?: string;
          sourcePlatform?: string;
          options?: CaptureOptions;
        };
        const { url, sourcePlatform } = values;
        const options = values.options;

        if (!isValidHttpUrl(url)) {
          ctx.status = 400;
          ctx.body = fail('INVALID_URL', '请输入有效的商品链接（需以 http/https 开头）', false, traceId);
          return await next();
        }

        const repos = getRepos(db);
        const { Tasks, Steps } = repos;

        const adapter = resolveAdapter(url);
        const task = await Tasks.create({
          values: {
            captureType: 'url',
            sourcePlatform: sourcePlatform || adapter.name,
            input: { url, options },
            options: options || {},
            status: 'running',
            traceId,
            totalCount: 1,
            successCount: 0,
            failedCount: 0,
            progress: 0,
          },
        });
        const taskId = task.get('id');
        const taskNo = task.get('taskNo');

        const addStep = (stepName: string, status: string, extra: Record<string, unknown> = {}) =>
          Steps.create({ values: { taskType: 'capture', taskId, stepName, status, traceId, ...extra } });

        const failTask = async (code: string, message: string, retryable: boolean) => {
          await Tasks.update({
            filterByTk: taskId,
            values: {
              status: 'failed',
              failedCount: 1,
              progress: 100,
              errorCode: code,
              errorMessage: message,
              retryable,
            },
          });
        };

        // 步骤 1：解析链接
        let t = Date.now();
        await addStep('analyze_url', 'success', {
          inputSnapshot: { url },
          outputSnapshot: { adapter: adapter.name },
          durationMs: Date.now() - t,
        });

        // 步骤 2：获取详情（适配器）
        t = Date.now();
        let normalized: NormalizedProduct;
        try {
          normalized = await adapter.fetchProductByUrl(url, options);
        } catch (e) {
          const code = e instanceof AdapterError ? e.code : 'CAPTURE_FAILED';
          const retryable = e instanceof AdapterError ? e.retryable : true;
          const message = (e as Error)?.message || '抓取失败';
          await addStep('fetch_detail', 'failed', {
            errorCode: code,
            errorMessage: message,
            retryable,
            inputSnapshot: { url, adapter: adapter.name },
            durationMs: Date.now() - t,
          });
          await failTask(code, message, retryable);
          ctx.logger?.warn(`[ai-listing][${traceId}] url capture fetch failed`, { code, message, url });
          ctx.body = fail(code, message, retryable, traceId, { taskId, taskNo });
          return await next();
        }
        await addStep('fetch_detail', 'success', {
          outputSnapshot: {
            title: normalized.titleOriginal,
            skus: normalized.skus?.length || 0,
            media: normalized.media?.length || 0,
          },
          rawSnapshot: normalized,
          durationMs: Date.now() - t,
        });

        // 步骤 3：归一化（映射到商品字段）
        t = Date.now();
        const productValues = {
          sourcePlatform: normalized.sourcePlatform,
          sourceUrl: normalized.sourceUrl,
          sourceProductId: normalized.sourceProductId,
          titleOriginal: normalized.titleOriginal,
          descriptionOriginal: normalized.descriptionOriginal,
          priceOriginal: normalized.priceOriginal,
          currencyOriginal: normalized.currencyOriginal,
          stock: normalized.stock,
          categoryOriginal: normalized.categoryOriginal,
          attributesOriginal: normalized.attributesOriginal || {},
          status: 'captured',
          reviewStatus: 'pending',
        };
        await addStep('normalize', 'success', {
          outputSnapshot: { fields: Object.keys(productValues).length },
          durationMs: Date.now() - t,
        });

        // 步骤 4：保存商品草稿（+ SKU + 媒体）
        t = Date.now();
        try {
          const productId = await createProductDraft(repos, normalized);
          await addStep('save_product', 'success', {
            outputSnapshot: { productId, skus: normalized.skus?.length || 0, media: normalized.media?.length || 0 },
            durationMs: Date.now() - t,
          });
          await Tasks.update({
            filterByTk: taskId,
            values: { status: 'success', successCount: 1, progress: 100, metadata: { productId } },
          });
          ctx.body = { ok: true, data: { taskId, taskNo, productId }, warnings: [], errors: [], traceId };
        } catch (e) {
          const message = (e as Error)?.message || '保存商品草稿失败';
          await addStep('save_product', 'failed', {
            errorCode: 'SAVE_PRODUCT_FAILED',
            errorMessage: message,
            retryable: true,
            durationMs: Date.now() - t,
          });
          await failTask('SAVE_PRODUCT_FAILED', message, true);
          ctx.logger?.error(`[ai-listing][${traceId}] save product draft failed`, { message });
          ctx.status = 500;
          ctx.body = fail('SAVE_PRODUCT_FAILED', message, true, traceId, { taskId, taskNo });
        }
        await next();
      },
    },
  });

  app.resourceManager.define({
    name: 'aiListingTasks',
    actions: {
      getProgress: async (ctx: Context, next: Next) => {
        const traceId = ctx.reqId || `srv-${Date.now()}`;
        const params = ctx.action?.params || {};
        const id = (params.values && params.values.taskId) || params.taskId || params.filterByTk;
        if (!id) {
          ctx.status = 400;
          ctx.body = fail('INVALID_TASK_ID', '缺少 taskId', false, traceId);
          return await next();
        }
        const Tasks = db.getRepository('aiListingCaptureTasks');
        const Steps = db.getRepository('aiListingTaskSteps');
        const task = await Tasks.findOne({ filterByTk: id });
        if (!task) {
          ctx.status = 404;
          ctx.body = fail('TASK_NOT_FOUND', '任务不存在', false, traceId);
          return await next();
        }
        const steps = await Steps.find({ filter: { taskType: 'capture', taskId: id }, sort: ['id'] });
        ctx.body = { ok: true, data: { task, steps }, warnings: [], errors: [], traceId };
        await next();
      },
    },
  });

  app.acl.allow('aiListingCapture', 'startUrlCapture', 'loggedIn');
  app.acl.allow('aiListingTasks', 'getProgress', 'loggedIn');
}
