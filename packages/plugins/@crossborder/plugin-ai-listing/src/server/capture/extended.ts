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
import { AdapterError, enumerateStoreProducts, searchAlibabaProducts, type CaptureOptions } from '../adapters';
import { OpenApiError } from '../openapi/errors';
import { getValidAccessToken } from '../openapi/token-store';
import { findConnector, isRealEnabled } from '../platforms/registry';
import type Plugin from '../plugin';
import { findConnectedAccountId, resolveCaptureAdapter } from './real-capture';
import { captureOneToDraft, fail, getRepos, isValidHttpUrl, type CaptureRepos } from './shared';

// 逐条抓取并写任务明细：每条 URL 都写一条 aiListingTaskSteps，单条失败用 try/catch 隔离，不影响其它条；实时更新任务进度与成功/失败统计。
// 适配器按条 resolveCaptureAdapter 决策：真接入开关开且平台已授权 → 平台真实抓取，否则 mock（与 URL 抓取同一决策）。
async function runItems(
  plugin: Plugin,
  repos: CaptureRepos,
  taskId: number,
  traceId: string,
  urls: string[],
  options?: CaptureOptions,
) {
  let success = 0;
  let failed = 0;
  const results: Array<Record<string, unknown>> = [];
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    const t = Date.now();
    const adapter = await resolveCaptureAdapter(plugin, url);
    const r = await captureOneToDraft(repos, url, options, adapter);
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

  // 店铺抓取：分析店铺 -> 返回商品列表。店铺公开页有平台反爬（验证码拦截）、买家侧 OpenAPI 也没有「按店铺列商品」
  // 接口，因此真实通道是卖家侧 /alibaba/icbu/product/list 枚举「你已授权店铺」的商品（即搬运自己的店）；
  // 他人店铺请走 URL 抓取 / 关键词抓取。平台从链接域名自动识别，无需用户选择。
  captureResource?.addAction('analyzeStore', async (ctx: Context, next: Next) => {
    const traceId = ctx.reqId || `srv-${Date.now()}`;
    const values = (ctx.action?.params?.values || {}) as {
      storeUrl?: string;
      page?: number;
      pageSize?: number;
      subject?: string;
    };
    const { storeUrl } = values;
    try {
      if (!isValidHttpUrl(storeUrl)) {
        ctx.status = 400;
        ctx.body = fail('INVALID_STORE_URL', '请输入有效的店铺链接（需 http/https）', false, traceId);
        return await next();
      }
      const host = new URL(storeUrl).hostname.toLowerCase();
      const connector =
        host.includes('alibaba.') || host.includes('1688.com') ? findConnector('alibaba-icbu') : undefined;
      if (!connector) {
        ctx.status = 400;
        ctx.body = fail(
          'STORE_PLATFORM_UNSUPPORTED',
          '暂不支持该店铺链接所属平台，当前支持 Alibaba.com 店铺（如 xxx.en.alibaba.com）',
          false,
          traceId,
        );
        return await next();
      }
      if (!isRealEnabled(connector.id) || !connector.listOwnProducts) {
        // 真接入开关未开（演示环境）：保留 mock 枚举便于联调，并明确标注来源。
        const products = await enumerateStoreProducts(storeUrl);
        ctx.body = {
          ok: true,
          data: {
            storeUrl,
            platform: connector.label,
            total: products.length,
            page: 1,
            pageSize: products.length,
            products,
            source: 'mock',
            notice: '真实平台接入未开启，以下为演示数据',
          },
          warnings: [],
          errors: [],
          traceId,
        };
        return await next();
      }
      const accountId = await findConnectedAccountId(plugin, connector.id);
      if (accountId == null) {
        ctx.status = 400;
        ctx.body = fail(
          'OPENAPI_NOT_CONNECTED',
          '该平台尚未授权连接，请先到「平台连接」页授权店铺账号',
          false,
          traceId,
        );
        return await next();
      }
      const token = await getValidAccessToken(plugin, accountId);
      const pageData = await connector.listOwnProducts(token, {
        page: values.page,
        pageSize: values.pageSize,
        subject: values.subject,
      });
      const account = await db.getRepository('aiListingPlatformAccounts').findOne({ filterByTk: accountId });
      const storeName = String(account?.get('storeName') || account?.get('platform') || '已授权店铺');
      const products = pageData.products.map((p) => ({
        sourceProductId: p.productId,
        title: p.title,
        priceText: '',
        imageUrl: p.imageUrl,
        sourceUrl: p.detailUrl || `https://www.alibaba.com/product-detail/item_${p.productId}.html`,
        sourcePlatform: 'Alibaba.com',
        status: p.status,
        display: p.display,
      }));
      ctx.body = {
        ok: true,
        data: {
          storeUrl,
          platform: connector.label,
          total: pageData.total,
          page: pageData.page,
          pageSize: pageData.pageSize,
          products,
          source: 'seller_openapi',
          account: { id: accountId, name: storeName },
          notice: `阿里对店铺公开页有反爬拦截，已改用你授权店铺「${storeName}」的卖家接口列出在售商品（仅支持搬运自己的店铺；他人店铺请用 URL 抓取或关键词抓取）。`,
        },
        warnings: [],
        errors: [],
        traceId,
      };
    } catch (e) {
      const code = e instanceof AdapterError || e instanceof OpenApiError ? e.code : 'STORE_ANALYZE_FAILED';
      const retryable = e instanceof AdapterError || e instanceof OpenApiError ? e.retryable : true;
      ctx.body = fail(code, (e as Error)?.message || '店铺分析失败', retryable, traceId);
    }
    await next();
  });

  // 店铺抓取：对选中商品逐个抓取生成草稿。异步执行（选中量可能很大），立即返回 taskId，
  // 前端用 aiListingTasks:getProgress 轮询进度；每条明细逐一落 aiListingTaskSteps。
  captureResource?.addAction('startStoreCapture', async (ctx: Context, next: Next) => {
    const traceId = ctx.reqId || `srv-${Date.now()}`;
    const values = (ctx.action?.params?.values || {}) as {
      items?: Array<{ url?: string; productId?: string }>;
      storeUrl?: string;
      options?: CaptureOptions;
    };
    const urls = (values.items || [])
      .map((i) =>
        i.url && isValidHttpUrl(i.url)
          ? i.url
          : i.productId
            ? `https://www.alibaba.com/product-detail/item_${i.productId}.html`
            : '',
      )
      .filter(isValidHttpUrl);
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
    const markCrashed = async (e: unknown) => {
      app.logger.error(`[ai-listing] store capture task ${taskId} crashed: ${(e as Error)?.message || e}`);
      try {
        await repos.Tasks.update({ filterByTk: taskId, values: { status: 'failed' } });
      } catch {
        // 任务状态标记失败仅影响展示，忽略。
      }
    };
    runItems(plugin, repos, taskId, traceId, urls, values.options).catch(markCrashed);
    ctx.body = {
      ok: true,
      data: { taskId, taskNo: task.get('taskNo'), total: urls.length, async: true },
      warnings: [],
      errors: [],
      traceId,
    };
    await next();
  });

  // 粘贴链接预览：抓取前把每条链接的标题/主图/价格拉回来，供前端勾选后再抓（真实抓取管线不变）。
  // 只读不落库；4 路并发控制总时长；单条失败不影响其余（error 随条目回传，前端标红且不可选）。
  captureResource?.addAction('previewUrls', async (ctx: Context, next: Next) => {
    const traceId = ctx.reqId || `srv-${Date.now()}`;
    const values = (ctx.action?.params?.values || {}) as { urls?: string[]; options?: CaptureOptions };
    const all = [...new Set((values.urls || []).filter(isValidHttpUrl))];
    const urls = all.slice(0, 100);
    if (!urls.length) {
      ctx.status = 400;
      ctx.body = fail('NO_URLS', '请先粘贴商品链接', false, traceId);
      return await next();
    }
    type PreviewItem = {
      url: string;
      productId?: string;
      title?: string;
      image?: string;
      price?: number;
      currency?: string;
      moq?: number;
      error?: string;
    };
    const items: PreviewItem[] = new Array(urls.length);
    const options: CaptureOptions = {
      fields: ['basic', 'images'],
      language: values.options?.language,
      currency: values.options?.currency,
    };
    let cursor = 0;
    const worker = async () => {
      while (cursor < urls.length) {
        const i = cursor++;
        const url = urls[i];
        try {
          const adapter = await resolveCaptureAdapter(plugin, url);
          const product = await adapter.fetchProductByUrl(url, options);
          const image = (product.media || []).find((m) => m.assetType === 'image');
          items[i] = {
            url,
            productId: product.sourceProductId,
            title: product.titleOriginal,
            image: image?.sourceUrl,
            price: product.priceOriginal,
            currency: product.currencyOriginal,
            moq: product.moq,
          };
        } catch (e) {
          items[i] = { url, error: (e as Error)?.message || '拉取失败' };
        }
      }
    };
    await Promise.all(Array.from({ length: 4 }, worker));
    const okCount = items.filter((it) => !it.error).length;
    ctx.body = {
      ok: true,
      data: { items, total: items.length, okCount },
      warnings: all.length > urls.length ? [`链接过多，本次仅预览前 ${urls.length} 条（共 ${all.length} 条）`] : [],
      errors: [],
      traceId,
    };
    await next();
  });

  // 关键词搜索：买家侧 /eco/buyer/product/search 全网真实搜索（不限店铺——搬运他人商品的主通道）。
  // 真接入开关开且已授权 → 真实搜索（排序/价格区间接口不支持，服务端本地后处理）；否则 mock 并标注来源。
  captureResource?.addAction('searchKeyword', async (ctx: Context, next: Next) => {
    const traceId = ctx.reqId || `srv-${Date.now()}`;
    const v = (ctx.action?.params?.values || {}) as {
      keyword?: string;
      platform?: string;
      sort?: string;
      priceMin?: number;
      priceMax?: number;
      size?: number;
      page?: number;
      currency?: string;
    };
    try {
      const keyword = (v.keyword || '').trim();
      if (!keyword) {
        ctx.status = 400;
        ctx.body = fail('KEYWORD_REQUIRED', '请输入搜索关键词', false, traceId);
        return await next();
      }
      const connector = findConnector('alibaba-icbu');
      const accountId =
        connector && isRealEnabled(connector.id) && connector.searchProducts
          ? await findConnectedAccountId(plugin, connector.id)
          : undefined;
      if (connector && accountId != null && connector.searchProducts) {
        const token = await getValidAccessToken(plugin, accountId);
        const pageData = await connector.searchProducts(token, {
          keyword,
          page: v.page,
          pageSize: v.size,
          currency: v.currency || 'CNY',
          language: 'zh-CN',
        });
        // 排序/价格区间：买家搜索接口不支持，按返回结果本地后处理（价格取字符串中的首个数字，可能是区间下限）。
        const priceOf = (t?: string) => {
          const m = String(t ?? '').match(/[\d.]+/);
          return m ? Number(m[0]) : NaN;
        };
        let cards = pageData.products.map((p) => ({
          sourceProductId: p.productId,
          title: p.title,
          priceText: p.priceText || '',
          currency: p.currency,
          imageUrl: p.imageUrl,
          sourceUrl: p.detailUrl || `https://www.alibaba.com/product-detail/item_${p.productId}.html`,
          sourcePlatform: 'Alibaba.com',
        }));
        if (v.priceMin != null) cards = cards.filter((c) => !(priceOf(c.priceText) < Number(v.priceMin)));
        if (v.priceMax != null) cards = cards.filter((c) => !(priceOf(c.priceText) > Number(v.priceMax)));
        if (v.sort === 'price_asc' || v.sort === 'price_desc') {
          cards.sort((a, b) =>
            v.sort === 'price_asc'
              ? priceOf(a.priceText) - priceOf(b.priceText)
              : priceOf(b.priceText) - priceOf(a.priceText),
          );
        }
        ctx.body = {
          ok: true,
          data: {
            keyword,
            total: pageData.total,
            page: pageData.page,
            pageSize: pageData.pageSize,
            products: cards,
            source: 'buyer_openapi',
          },
          warnings: [],
          errors: [],
          traceId,
        };
        return await next();
      }
      const products = await searchAlibabaProducts({
        keyword,
        platform: v.platform,
        sort: v.sort,
        priceMin: v.priceMin,
        priceMax: v.priceMax,
        size: v.size,
        currency: v.currency,
      });
      ctx.body = {
        ok: true,
        data: {
          keyword,
          total: products.length,
          products,
          source: 'mock',
          notice: '真实平台接入未开启，以下为演示数据',
        },
        warnings: [],
        errors: [],
        traceId,
      };
    } catch (e) {
      const code = e instanceof AdapterError || e instanceof OpenApiError ? e.code : 'KEYWORD_SEARCH_FAILED';
      const retryable = e instanceof AdapterError || e instanceof OpenApiError ? e.retryable : true;
      ctx.status = e instanceof AdapterError && !e.retryable ? 400 : 200;
      ctx.body = fail(code, (e as Error)?.message || '关键词搜索失败', retryable, traceId);
    }
    await next();
  });

  // 制造商搜索（近似实现）：开放平台没有「工厂/制造商搜索」接口（网页端 alibaba.com/factory 未开放 API），
  // 用「关键词搜商品 → 逐条取供应商（并发 4 路单跳 description）→ 按公司归组」得到该关键词下的真实制造商列表，
  // 每家含它在搜索结果中的商品（可整厂勾选抓取）。覆盖范围 = 前 N 条搜索结果采样，不是全站厂商名录。
  captureResource?.addAction('searchManufacturers', async (ctx: Context, next: Next) => {
    const traceId = ctx.reqId || `srv-${Date.now()}`;
    const v = (ctx.action?.params?.values || {}) as { keyword?: string; size?: number };
    try {
      const keyword = (v.keyword || '').trim();
      if (!keyword) {
        ctx.status = 400;
        ctx.body = fail('KEYWORD_REQUIRED', '请输入搜索关键词', false, traceId);
        return await next();
      }
      const connector = findConnector('alibaba-icbu');
      if (!connector || !isRealEnabled(connector.id) || !connector.searchProducts || !connector.fetchSupplier) {
        ctx.status = 400;
        ctx.body = fail('REAL_NOT_ENABLED', '制造商归组需要真实平台接入（当前环境未开启）', false, traceId);
        return await next();
      }
      const accountId = await findConnectedAccountId(plugin, connector.id);
      if (accountId == null) {
        ctx.status = 400;
        ctx.body = fail(
          'OPENAPI_NOT_CONNECTED',
          '该平台尚未授权连接，请先到「平台连接」页授权店铺账号',
          false,
          traceId,
        );
        return await next();
      }
      const token = await getValidAccessToken(plugin, accountId);
      const sample = Math.min(Math.max(Number(v.size) || 20, 5), 40);
      const pageData = await connector.searchProducts(token, {
        keyword,
        page: 1,
        pageSize: sample,
        currency: 'CNY',
        language: 'zh-CN',
      });
      const cards = pageData.products;
      // 并发 4 路逐条取供应商；单条失败不影响整体（该商品归入「未识别供应商」）。
      const suppliers: Array<{ supplierName?: string; companyId?: string }> = new Array(cards.length);
      let cursor = 0;
      const fetchSupplier = connector.fetchSupplier.bind(connector);
      const worker = async () => {
        while (cursor < cards.length) {
          const i = cursor++;
          try {
            suppliers[i] = await fetchSupplier(token, cards[i].productId);
          } catch {
            suppliers[i] = {};
          }
        }
      };
      await Promise.all(Array.from({ length: 4 }, worker));
      const groups = new Map<
        string,
        { companyId?: string; supplierName: string; products: Array<Record<string, unknown>> }
      >();
      cards.forEach((c, i) => {
        const s = suppliers[i] || {};
        const key = s.companyId || s.supplierName || '__unknown__';
        const g = groups.get(key) || {
          companyId: s.companyId,
          supplierName: s.supplierName || '未识别供应商',
          products: [],
        };
        g.products.push({
          sourceProductId: c.productId,
          title: c.title,
          priceText: c.priceText || '',
          currency: c.currency,
          imageUrl: c.imageUrl,
          sourceUrl: c.detailUrl || `https://www.alibaba.com/product-detail/item_${c.productId}.html`,
          sourcePlatform: 'Alibaba.com',
        });
        groups.set(key, g);
      });
      const manufacturers = [...groups.values()].sort((a, b) => b.products.length - a.products.length);
      ctx.body = {
        ok: true,
        data: {
          keyword,
          sampled: cards.length,
          totalMatched: pageData.total,
          manufacturers,
          notice: `基于搜索结果前 ${cards.length} 条按供应商归组（全网共 ${pageData.total} 条相关商品）。开放平台无工厂搜索接口，暂不能枚举一家工厂的全部商品——想要某家更多商品，可用它的商品标题关键词继续搜索。`,
        },
        warnings: [],
        errors: [],
        traceId,
      };
    } catch (e) {
      const code = e instanceof AdapterError || e instanceof OpenApiError ? e.code : 'MANUFACTURER_SEARCH_FAILED';
      const retryable = e instanceof AdapterError || e instanceof OpenApiError ? e.retryable : true;
      ctx.body = fail(code, (e as Error)?.message || '制造商搜索失败', retryable, traceId);
    }
    await next();
  });

  // 关键词抓取：对选中结果逐个抓取生成草稿。
  captureResource?.addAction('startKeywordCapture', async (ctx: Context, next: Next) => {
    const traceId = ctx.reqId || `srv-${Date.now()}`;
    const values = (ctx.action?.params?.values || {}) as {
      items?: Array<{ url: string }>;
      keyword?: string;
      options?: CaptureOptions;
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
    const stats = await runItems(plugin, repos, taskId, traceId, urls, values.options);
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
        const v = (ctx.action?.params?.values || {}) as {
          urls?: string[];
          filename?: string;
          options?: CaptureOptions;
        };
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
            input: {
              count: urls.length,
              filename: typeof v.filename === 'string' ? v.filename.slice(0, 200) : undefined,
            },
            status: 'running',
            traceId,
            totalCount: urls.length,
            successCount: 0,
            failedCount: 0,
            progress: 0,
          },
        });
        const taskId = task.get('id');
        const stats = await runItems(plugin, repos, taskId, traceId, urls, v.options);
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
  app.acl.allow('aiListingCapture', 'previewUrls', 'loggedIn');
  app.acl.allow('aiListingCapture', 'searchKeyword', 'loggedIn');
  app.acl.allow('aiListingCapture', 'searchManufacturers', 'loggedIn');
  app.acl.allow('aiListingCapture', 'startKeywordCapture', 'loggedIn');
  app.acl.allow('aiListingBatchImport', 'parse', 'loggedIn');
  app.acl.allow('aiListingBatchImport', 'start', 'loggedIn');
}
