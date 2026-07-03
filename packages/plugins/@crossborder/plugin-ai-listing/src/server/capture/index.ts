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
import { AdapterError, type CaptureOptions, type NormalizedProduct } from '../adapters';
import { resolveCaptureAdapter } from './real-capture';
import { createProductDraft, fail, getRepos, isValidHttpUrl } from './shared';
import { downloadProductMedia } from '../media/download';

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
  // 真接入开关开且平台已授权 → 走连接器真实抓取；否则 mock（resolveCaptureAdapter 内部决策）。
  const adapter = await resolveCaptureAdapter(plugin, url);
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
      // 补充端点（关键属性/库存/证书）的单项失败告警：不阻塞主详情，但要可见。
      warnings: normalized.captureWarnings?.length ? normalized.captureWarnings : undefined,
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
    categoryOriginalId: normalized.categoryOriginalId,
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
    // 媒体真实下载（主图/详情图/视频落存储）在后台异步进行，不阻塞抓取返回；完成后写 download_media 步骤。
    downloadProductMedia(plugin, Number(productId), { traceId, taskId, Steps }).catch(
      (e) =>
        logger?.warn(`[ai-listing][${traceId}] background media download failed`, { message: (e as Error)?.message }),
    );
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
      // 每条记录附带产出商品的标题/主图/状态（metadata.productId 关联），让历史列表一眼看出「抓的是什么商品」。
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
        // 多商品任务（店铺/关键词/批量）不写 metadata.productId：从成功步骤取第一个产出商品做代表 + 产出计数。
        const multiTaskIds = rows
          .filter((r) => !Number((r.get('metadata') || {}).productId))
          .map((r) => Number(r.get('id')));
        const firstPidByTask: Record<number, number> = {};
        const productCountByTask: Record<number, number> = {};
        if (multiTaskIds.length) {
          const Steps = db.getRepository('aiListingTaskSteps');
          const steps = await Steps.find({
            filter: {
              taskType: 'capture',
              taskId: { $in: multiTaskIds },
              stepName: 'capture_item',
              status: 'success',
            },
            sort: ['id'],
          });
          for (const s of steps) {
            const tid = Number(s.get('taskId'));
            const pid = Number((s.get('outputSnapshot') || {}).productId);
            if (Number.isInteger(pid) && pid > 0) {
              if (firstPidByTask[tid] == null) firstPidByTask[tid] = pid;
              productCountByTask[tid] = (productCountByTask[tid] || 0) + 1;
            }
          }
        }
        // 批量取产出商品（标题/状态）与主图，避免 N+1。
        const productIds = [
          ...new Set(
            rows
              .map((r) => Number((r.get('metadata') || {}).productId) || firstPidByTask[Number(r.get('id'))] || 0)
              .filter((n) => Number.isInteger(n) && n > 0),
          ),
        ];
        const productById: Record<number, { id: number; title: string; status: string; mainImage: string | null }> = {};
        if (productIds.length) {
          const Products = db.getRepository('aiListingProducts');
          const Media = db.getRepository('aiListingMediaAssets');
          const products = await Products.find({ filter: { id: { $in: productIds } } });
          const mains = await Media.find({
            filter: { $and: [{ productId: { $in: productIds } }, { role: 'main' }] },
            sort: ['id'],
          });
          const mainByPid: Record<number, string> = {};
          for (const m of mains) {
            const pid = m.get('productId');
            if (mainByPid[pid] == null && m.get('sourceUrl')) mainByPid[pid] = m.get('sourceUrl');
          }
          for (const p of products) {
            const pid = p.get('id');
            productById[pid] = {
              id: pid,
              title: p.get('titleFinal') || p.get('titleProcessed') || p.get('titleOriginal') || '（未命名）',
              status: p.get('status'),
              mainImage: mainByPid[pid] || null,
            };
          }
        }
        const data = rows.map((r) => {
          const tid = Number(r.get('id'));
          const pid = Number((r.get('metadata') || {}).productId) || firstPidByTask[tid] || 0;
          return {
            id: r.get('id'),
            taskNo: r.get('taskNo'),
            captureType: r.get('captureType'),
            sourcePlatform: r.get('sourcePlatform'),
            input: r.get('input'),
            status: r.get('status'),
            errorMessage: r.get('errorMessage'),
            traceId: r.get('traceId'),
            createdAt: r.get('createdAt'),
            metadata: r.get('metadata'),
            product: productById[pid] || null,
            productTotal: productCountByTask[tid] || (productById[pid] ? 1 : 0),
          };
        });
        ctx.body = { ok: true, data, warnings: [], errors: [], traceId };
        await next();
      },

      // 删除抓取历史记录：删任务 + 关联任务步骤（不动产出的商品，商品在商品库单独管理）。
      deleteTask: async (ctx: Context, next: Next) => {
        const traceId = ctx.reqId || `srv-${Date.now()}`;
        const ids = ((ctx.action?.params?.values || {}) as { taskIds?: Array<number | string> }).taskIds;
        const taskIds = Array.isArray(ids)
          ? [...new Set(ids.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n > 0))]
          : [];
        if (!taskIds.length) {
          ctx.status = 400;
          ctx.body = fail('NO_TASK_IDS', '请先选择要删除的抓取记录', false, traceId);
          return await next();
        }
        const Tasks = db.getRepository('aiListingCaptureTasks');
        const Steps = db.getRepository('aiListingTaskSteps');
        const running = await Tasks.count({ filter: { id: { $in: taskIds }, status: 'running' } });
        if (running) {
          ctx.status = 409;
          ctx.body = fail('TASK_RUNNING', '有抓取任务正在进行中，请等它结束后再删除', true, traceId);
          return await next();
        }
        await Steps.destroy({ filter: { taskType: 'capture', taskId: { $in: taskIds } } });
        const deleted = await Tasks.destroy({ filter: { id: { $in: taskIds } } });
        ctx.body = {
          ok: true,
          data: { deleted: Number(deleted) || taskIds.length },
          warnings: [],
          errors: [],
          traceId,
        };
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
  app.acl.allow('aiListingCapture', 'deleteTask', 'loggedIn');
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
    // 语言与币种独立字段（对齐官方站的分开设置）；兼容旧的合并字段 captureLocale（zh-CNY / en-USD）。
    const locale = (model.get('captureLocale') as string | undefined) || 'zh-CNY';
    const [localeLanguage, localeCurrency] = locale === 'en-USD' ? ['en-US', 'USD'] : ['zh-CN', 'CNY'];
    const language = (model.get('captureLanguage') as string | undefined) || localeLanguage;
    const currency = (model.get('captureCurrency') as string | undefined) || localeCurrency;
    const traceId = `form-${model.get('id')}-${Date.now()}`;
    const runCapture = () =>
      executeUrlCapture(plugin, {
        url,
        sourcePlatform: platform ? platformLabels[platform] || platform : undefined,
        options: { fields: scope, language, currency },
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
