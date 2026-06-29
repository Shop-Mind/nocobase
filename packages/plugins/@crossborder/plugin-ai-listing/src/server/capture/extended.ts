/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import type { Context, Next } from '@nocobase/actions';
import * as XLSX from 'xlsx';
import { AdapterError, enumerateStoreProducts, searchAlibabaProducts } from '../adapters';
import type Plugin from '../plugin';
import { captureOneToDraft, fail, getRepos, isValidHttpUrl, type CaptureRepos } from './shared';

// 逐条抓取并写任务明细：每条 URL 都写一条 aiListingTaskSteps，单条失败用 try/catch 隔离，不影响其它条；实时更新任务进度与成功/失败统计。
async function runItems(
  repos: CaptureRepos,
  taskId: number,
  traceId: string,
  urls: string[],
  options?: { fields?: string[] },
) {
  let success = 0;
  let failed = 0;
  const results: Array<Record<string, unknown>> = [];
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    const t = Date.now();
    const r = await captureOneToDraft(repos, url, options);
    if (r.ok) {
      success++;
      await repos.Steps.create({
        values: {
          taskType: 'capture',
          taskId,
          stepName: 'capture_item',
          status: 'success',
          traceId,
          inputSnapshot: { rowNo: i + 1, url },
          outputSnapshot: { productId: r.productId },
          durationMs: Date.now() - t,
        },
      });
    } else {
      failed++;
      await repos.Steps.create({
        values: {
          taskType: 'capture',
          taskId,
          stepName: 'capture_item',
          status: 'failed',
          traceId,
          errorCode: r.errorCode,
          errorMessage: r.errorMessage,
          retryable: r.retryable,
          inputSnapshot: { rowNo: i + 1, url },
          durationMs: Date.now() - t,
        },
      });
    }
    results.push({
      rowNo: i + 1,
      url,
      ok: r.ok,
      productId: r.productId,
      errorCode: r.errorCode,
      errorMessage: r.errorMessage,
      retryable: r.retryable,
    });
    await repos.Tasks.update({
      filterByTk: taskId,
      values: { successCount: success, failedCount: failed, progress: Math.round(((i + 1) / urls.length) * 100) },
    });
  }
  const status = failed === 0 ? 'success' : success === 0 ? 'failed' : 'partial_failed';
  await repos.Tasks.update({ filterByTk: taskId, values: { status, progress: 100 } });
  return { total: urls.length, success, failed, status, results };
}

// 从粘贴文本 / CSV 内容中解析出每行 URL（取每行第一个非空单元格/字段）。
function parseTextRows(content: string): string[] {
  return content
    .split(/\r?\n/)
    .map((line) => line.split(/[,\t]/)[0].trim())
    .filter((s) => s.length > 0);
}

export function setupCaptureExtended(plugin: Plugin): void {
  const { app } = plugin;
  const db = app.db;

  // 把扩展 action 挂到已 define 的 aiListingCapture 资源上（registerActionHandlers 不会给已有资源新增 action）。
  const captureResource = app.resourceManager.getResource('aiListingCapture');

  // 店铺抓取：分析店铺 -> 返回商品列表（OpenAPI 买家侧无按店铺列商品，走 Crawl4AI 枚举公开页，当前 mock）。
  captureResource?.addAction('analyzeStore', async (ctx: Context, next: Next) => {
    const traceId = ctx.reqId || `srv-${Date.now()}`;
    const { storeUrl } = (ctx.action?.params?.values || {}) as { storeUrl?: string };
    try {
      if (!isValidHttpUrl(storeUrl)) {
        ctx.status = 400;
        ctx.body = fail('INVALID_STORE_URL', '请输入有效的店铺链接（需 http/https）', false, traceId);
        return await next();
      }
      const products = await enumerateStoreProducts(storeUrl);
      ctx.body = {
        ok: true,
        data: { storeUrl, total: products.length, products },
        warnings: [],
        errors: [],
        traceId,
      };
    } catch (e) {
      const code = e instanceof AdapterError ? e.code : 'STORE_ANALYZE_FAILED';
      const retryable = e instanceof AdapterError ? e.retryable : true;
      ctx.body = fail(code, (e as Error)?.message || '店铺分析失败', retryable, traceId);
    }
    await next();
  });

  // 店铺抓取：对选中商品逐个抓取生成草稿。
  captureResource?.addAction('startStoreCapture', async (ctx: Context, next: Next) => {
    const traceId = ctx.reqId || `srv-${Date.now()}`;
    const values = (ctx.action?.params?.values || {}) as {
      items?: Array<{ url: string }>;
      storeUrl?: string;
      options?: { fields?: string[] };
    };
    const urls = (values.items || []).map((i) => i.url).filter(isValidHttpUrl);
    if (!urls.length) {
      ctx.status = 400;
      ctx.body = fail('NO_ITEMS_SELECTED', '请先选择要抓取的商品', false, traceId);
      return await next();
    }
    const repos = getRepos(db);
    const task = await repos.Tasks.create({
      values: {
        captureType: 'store',
        sourcePlatform: 'Alibaba.com',
        input: { storeUrl: values.storeUrl, count: urls.length },
        status: 'running',
        traceId,
        totalCount: urls.length,
        successCount: 0,
        failedCount: 0,
        progress: 0,
      },
    });
    const taskId = task.get('id');
    const stats = await runItems(repos, taskId, traceId, urls, values.options);
    ctx.body = {
      ok: true,
      data: { taskId, taskNo: task.get('taskNo'), ...stats },
      warnings: [],
      errors: [],
      traceId,
    };
    await next();
  });

  // 关键词搜索：OpenAPI /eco/buyer/product/search（mock）。
  captureResource?.addAction('searchKeyword', async (ctx: Context, next: Next) => {
    const traceId = ctx.reqId || `srv-${Date.now()}`;
    const v = (ctx.action?.params?.values || {}) as {
      keyword?: string;
      platform?: string;
      sort?: string;
      priceMin?: number;
      priceMax?: number;
      size?: number;
      currency?: string;
    };
    try {
      const products = await searchAlibabaProducts({
        keyword: v.keyword || '',
        platform: v.platform,
        sort: v.sort,
        priceMin: v.priceMin,
        priceMax: v.priceMax,
        size: v.size,
        currency: v.currency,
      });
      ctx.body = {
        ok: true,
        data: { keyword: v.keyword, total: products.length, products },
        warnings: [],
        errors: [],
        traceId,
      };
    } catch (e) {
      const code = e instanceof AdapterError ? e.code : 'KEYWORD_SEARCH_FAILED';
      const retryable = e instanceof AdapterError ? e.retryable : true;
      ctx.status = e instanceof AdapterError && !e.retryable ? 400 : 200;
      ctx.body = fail(code, (e as Error)?.message || '关键词搜索失败', retryable, traceId);
    }
    await next();
  });

  // 关键词抓取：对选中结果逐个抓取生成草稿。
  captureResource?.addAction('startKeywordCapture', async (ctx: Context, next: Next) => {
    const traceId = ctx.reqId || `srv-${Date.now()}`;
    const values = (ctx.action?.params?.values || {}) as {
      items?: Array<{ url: string }>;
      keyword?: string;
      options?: { fields?: string[] };
    };
    const urls = (values.items || []).map((i) => i.url).filter(isValidHttpUrl);
    if (!urls.length) {
      ctx.status = 400;
      ctx.body = fail('NO_ITEMS_SELECTED', '请先选择要抓取的商品', false, traceId);
      return await next();
    }
    const repos = getRepos(db);
    const task = await repos.Tasks.create({
      values: {
        captureType: 'keyword',
        sourcePlatform: 'Alibaba.com',
        input: { keyword: values.keyword, count: urls.length },
        status: 'running',
        traceId,
        totalCount: urls.length,
        successCount: 0,
        failedCount: 0,
        progress: 0,
      },
    });
    const taskId = task.get('id');
    const stats = await runItems(repos, taskId, traceId, urls, values.options);
    ctx.body = {
      ok: true,
      data: { taskId, taskNo: task.get('taskNo'), ...stats },
      warnings: [],
      errors: [],
      traceId,
    };
    await next();
  });

  // 批量导入：解析 + 开始（显式逐行建任务明细，不依赖 collection event）。
  app.resourceManager.define({
    name: 'aiListingBatchImport',
    actions: {
      // 解析 CSV/Excel/文本 -> 行列表（标注有效/错误行）。
      parse: async (ctx: Context, next: Next) => {
        const traceId = ctx.reqId || `srv-${Date.now()}`;
        const v = (ctx.action?.params?.values || {}) as { content?: string; base64?: string; filename?: string };
        let rawUrls: string[] = [];
        try {
          if (v.base64) {
            // Excel(.xlsx)：服务端用 xlsx 解析，取每行第一个单元格。
            const buf = Buffer.from(v.base64, 'base64');
            const wb = XLSX.read(buf, { type: 'buffer' });
            const sheet = wb.Sheets[wb.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, blankrows: false });
            rawUrls = rows.map((r) => String((r && r[0]) ?? '').trim()).filter((s) => s.length > 0);
          } else if (typeof v.content === 'string') {
            rawUrls = parseTextRows(v.content);
          } else {
            ctx.status = 400;
            ctx.body = fail('NO_INPUT', '请粘贴文本或上传 CSV/Excel 文件', false, traceId);
            return await next();
          }
        } catch (e) {
          ctx.status = 400;
          ctx.body = fail('PARSE_FAILED', (e as Error)?.message || '文件解析失败', false, traceId);
          return await next();
        }
        // 跳过疑似表头（第一行不是 URL 时丢弃）。
        if (rawUrls.length && !isValidHttpUrl(rawUrls[0]) && /url|链接|link/i.test(rawUrls[0])) {
          rawUrls = rawUrls.slice(1);
        }
        const rows = rawUrls.map((url, i) => ({
          rowNo: i + 1,
          url,
          valid: isValidHttpUrl(url),
          error: isValidHttpUrl(url) ? undefined : '链接无效（需 http/https）',
        }));
        const validCount = rows.filter((r) => r.valid).length;
        ctx.body = {
          ok: true,
          data: { rows, total: rows.length, validCount, invalidCount: rows.length - validCount },
          warnings: [],
          errors: [],
          traceId,
        };
        await next();
      },

      // 开始批量导入：显式逐行建任务明细，单行失败隔离，汇总成功/失败统计。
      start: async (ctx: Context, next: Next) => {
        const traceId = ctx.reqId || `srv-${Date.now()}`;
        const v = (ctx.action?.params?.values || {}) as { urls?: string[]; options?: { fields?: string[] } };
        const urls = (v.urls || []).filter(isValidHttpUrl);
        if (!urls.length) {
          ctx.status = 400;
          ctx.body = fail('NO_VALID_URLS', '没有可导入的有效链接', false, traceId);
          return await next();
        }
        const repos = getRepos(db);
        const task = await repos.Tasks.create({
          values: {
            captureType: 'batch',
            sourcePlatform: 'Alibaba.com',
            input: { count: urls.length },
            status: 'running',
            traceId,
            totalCount: urls.length,
            successCount: 0,
            failedCount: 0,
            progress: 0,
          },
        });
        const taskId = task.get('id');
        const stats = await runItems(repos, taskId, traceId, urls, v.options);
        ctx.body = {
          ok: true,
          data: { taskId, taskNo: task.get('taskNo'), ...stats },
          warnings: [],
          errors: [],
          traceId,
        };
        await next();
      },
    },
  });

  app.acl.allow('aiListingCapture', 'analyzeStore', 'loggedIn');
  app.acl.allow('aiListingCapture', 'startStoreCapture', 'loggedIn');
  app.acl.allow('aiListingCapture', 'searchKeyword', 'loggedIn');
  app.acl.allow('aiListingCapture', 'startKeywordCapture', 'loggedIn');
  app.acl.allow('aiListingBatchImport', 'parse', 'loggedIn');
  app.acl.allow('aiListingBatchImport', 'start', 'loggedIn');
}
