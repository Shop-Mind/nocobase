/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import type { Context, Next } from '@nocobase/actions';
import type { Model } from '@nocobase/database';
import type Plugin from '../plugin';
import { AdapterError, resolveAdapter, type CaptureOptions, type NormalizedProduct } from '../adapters';
import { createProductDraft, fail, getRepos, isValidHttpUrl } from './shared';

type UrlCaptureInput = { url?: string; sourcePlatform?: string; options?: CaptureOptions; traceId: string };
type UrlCaptureResult = {
  ok: boolean;
  status?: number;
  taskId?: number | string;
  taskNo?: string;
  productId?: number | string;
  code?: string;
  message?: string;
  retryable?: boolean;
};

// 在一次 URL 抓取中执行：建任务 -> 适配器取数 -> 归一化 -> 商品草稿，全程写任务步骤（含 traceId/errorCode/retryable）。
// 同时供 startUrlCapture action 与原生表单 afterCommit 钩子复用：返回结构化结果，不直接写 ctx。
export async function executeUrlCapture(plugin: Plugin, input: UrlCaptureInput): Promise<UrlCaptureResult> {
  const { app } = plugin;
  const db = app.db;
  const logger = app.logger;
  const { url, sourcePlatform, options, traceId } = input;

  if (!isValidHttpUrl(url)) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_URL',
      message: '请输入有效的商品链接（需以 http/https 开头）',
      retryable: false,
    };
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
      values: { status: 'failed', failedCount: 1, progress: 100, errorCode: code, errorMessage: message, retryable },
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
    logger?.warn(`[ai-listing][${traceId}] url capture fetch failed`, { code, message, url });
    return { ok: false, status: 200, code, message, retryable, taskId, taskNo };
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
    return { ok: true, taskId, taskNo, productId };
  } catch (e) {
    const message = (e as Error)?.message || '保存商品草稿失败';
    await addStep('save_product', 'failed', {
      errorCode: 'SAVE_PRODUCT_FAILED',
      errorMessage: message,
      retryable: true,
      durationMs: Date.now() - t,
    });
    await failTask('SAVE_PRODUCT_FAILED', message, true);
    logger?.error(`[ai-listing][${traceId}] save product draft failed`, { message });
    return { ok: false, status: 500, code: 'SAVE_PRODUCT_FAILED', message, retryable: true, taskId, taskNo };
  }
}

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

        const result = await executeUrlCapture(plugin, {
          url: values.url,
          sourcePlatform: values.sourcePlatform,
          options: values.options,
          traceId,
        });

        if (result.ok) {
          ctx.body = {
            ok: true,
            data: { taskId: result.taskId, taskNo: result.taskNo, productId: result.productId },
            warnings: [],
            errors: [],
            traceId,
          };
        } else {
          ctx.status = result.status ?? 500;
          ctx.body = fail(
            result.code ?? 'CAPTURE_FAILED',
            result.message ?? '抓取失败',
            result.retryable ?? true,
            traceId,
            {
              taskId: result.taskId,
              taskNo: result.taskNo,
            },
          );
        }
        await next();
      },

      // 只读：按 captureType 返回最近抓取记录，供各 Tab 的「抓取历史」jsBlock 在 handler 内刷新（沙箱里自定义 action 可经 ctx.request 调用）。
      listCaptureHistory: async (ctx: Context, next: Next) => {
        const traceId = ctx.reqId || `srv-${Date.now()}`;
        const values = (ctx.action?.params?.values || {}) as { captureType?: string; limit?: number };
        const limit = Math.min(Math.max(Number(values.limit) || 10, 1), 50);
        const Tasks = db.getRepository('aiListingCaptureTasks');
        const filter: Record<string, unknown> = {};
        if (values.captureType) {
          filter.captureType = values.captureType;
        }
        const rows = await Tasks.find({ filter, sort: ['-id'], limit });
        const data = rows.map((r) => ({
          id: r.get('id'),
          taskNo: r.get('taskNo'),
          captureType: r.get('captureType'),
          sourcePlatform: r.get('sourcePlatform'),
          input: r.get('input'),
          status: r.get('status'),
          traceId: r.get('traceId'),
          createdAt: r.get('createdAt'),
          metadata: r.get('metadata'),
        }));
        ctx.body = { ok: true, data, warnings: [], errors: [], traceId };
        await next();
      },

      // 只读：返回某类「抓取请求」最近一条（原生表单提交后写入），供 店铺/关键词 jsBlock 取最新输入驱动分析/搜索流程。
      latestCaptureRequest: async (ctx: Context, next: Next) => {
        const traceId = ctx.reqId || `srv-${Date.now()}`;
        const { kind } = (ctx.action?.params?.values || {}) as { kind?: string };
        const map: Record<string, string> = {
          store: 'aiListingStoreCaptureRequests',
          keyword: 'aiListingKeywordCaptureRequests',
        };
        const collectionName = kind ? map[kind] : undefined;
        if (!collectionName) {
          ctx.status = 400;
          ctx.body = fail('INVALID_KIND', '未知的抓取请求类型', false, traceId);
          return await next();
        }
        const repo = db.getRepository(collectionName);
        const row = await repo.findOne({ sort: ['-id'] });
        ctx.body = { ok: true, data: row ? row.toJSON() : null, warnings: [], errors: [], traceId };
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
  app.acl.allow('aiListingCapture', 'listCaptureHistory', 'loggedIn');
  app.acl.allow('aiListingCapture', 'latestCaptureRequest', 'loggedIn');
  app.acl.allow('aiListingTasks', 'getProgress', 'loggedIn');

  // 原生 FormV2「URL 抓取」表单（集合 aiListingUrlCaptureRequests）提交后，桥接为一次真实抓取：
  // 读 sourceUrl/capturePlatform/captureScope，在事务提交后异步触发 executeUrlCapture（建真实任务 + 抓取 + 商品草稿）。
  const platformLabels: Record<string, string> = {
    alibaba: 'Alibaba.com',
    '1688': '1688',
    amazon: 'Amazon',
    shopee: 'Shopee',
  };
  type HookOptions = { transaction?: { afterCommit?: (cb: () => void) => void } };
  db.on('aiListingUrlCaptureRequests.afterCreate', (model: Model, options: HookOptions) => {
    const url = model.get('sourceUrl') as string | undefined;
    if (!url) {
      return;
    }
    const platform = model.get('capturePlatform') as string | undefined;
    const scope = (model.get('captureScope') as string[] | undefined) || [];
    const traceId = `form-${model.get('id')}-${Date.now()}`;
    const runCapture = () =>
      executeUrlCapture(plugin, {
        url,
        sourcePlatform: platform ? platformLabels[platform] || platform : undefined,
        options: { fields: scope },
        traceId,
      }).catch(
        (e) =>
          app.logger?.error(`[ai-listing][${traceId}] form-triggered url capture failed`, {
            message: (e as Error)?.message,
          }),
      );
    if (options?.transaction?.afterCommit) {
      options.transaction.afterCommit(runCapture);
    } else {
      runCapture();
    }
  });
}
