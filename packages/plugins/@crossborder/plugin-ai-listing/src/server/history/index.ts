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

// 发布记录（Phase 9）：发布结果历史追踪。统计卡 + 筛选 + 目标链接 + 失败原因 + 重试 + 导出。
// 重试复用 Phase 8 的 aiListingPublish:retryFailed（按批次重试失败项）；本模块只做查询/聚合/导出。

function getRepos(db: any) {
  return {
    Records: db.getRepository('aiListingPublishRecords'),
    Batches: db.getRepository('aiListingPublishBatches'),
    Products: db.getRepository('aiListingProducts'),
  };
}

// 关键词（商品标题/ID/批次号）、状态(result)、平台、日期范围 → $and 过滤。
function buildFilter(
  v: { keyword?: string; result?: string; platform?: string; dateFrom?: string; dateTo?: string },
  batchIdsByNo: number[] | null,
): Record<string, unknown> {
  const and: unknown[] = [];
  if (v.result && ['success', 'failed'].includes(v.result)) and.push({ result: v.result });
  if (v.platform) and.push({ targetPlatform: v.platform });
  if (v.dateFrom) and.push({ createdAt: { $gte: v.dateFrom } });
  if (v.dateTo) and.push({ createdAt: { $lte: v.dateTo } });
  if (v.keyword && v.keyword.trim()) {
    const kw = v.keyword.trim();
    const or: unknown[] = [{ targetProductId: { $includes: kw } }];
    const asId = Number(kw);
    if (!Number.isNaN(asId)) or.push({ productId: asId });
    // 命中批次号的记录通过 batchId 集合纳入。
    if (batchIdsByNo && batchIdsByNo.length) or.push({ batchId: { $in: batchIdsByNo } });
    and.push({ $or: or });
  }
  return and.length ? { $and: and } : {};
}

// 关键词命中批次号 → 返回匹配的 batchId 列表（供 list/export 关键词过滤复用）。
async function resolveBatchIdsByNo(Batches: any, keyword?: string): Promise<number[] | null> {
  if (!keyword || !keyword.trim()) return null;
  const rows = await Batches.find({ filter: { batchNo: { $includes: keyword.trim() } }, fields: ['id'] });
  return rows.map((b: any) => b.get('id'));
}

const CSV_HEADERS = [
  'ID',
  '批次号',
  '商品ID',
  '商品标题',
  '目标平台',
  '结果',
  '目标商品ID',
  '目标链接',
  '失败原因',
  '错误码',
  '发布时间',
  'traceId',
];

function csvCell(value: unknown): string {
  const s = value == null ? '' : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function setupHistory(plugin: Plugin): void {
  const { app } = plugin;
  const db = app.db;

  app.resourceManager.define({
    name: 'aiListingHistory',
    actions: {
      // 统计卡片：总发布次数 / 成功 / 失败 / 今日（PRD §5.8）。
      stats: async (ctx: Context, next: Next) => {
        const traceId = ctx.reqId || `srv-${Date.now()}`;
        const { Records } = getRepos(db);
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        const total = await Records.count();
        const success = await Records.count({ filter: { result: 'success' } });
        const failed = await Records.count({ filter: { result: 'failed' } });
        const today = await Records.count({ filter: { createdAt: { $gte: startOfToday.toISOString() } } });
        ctx.body = {
          ok: true,
          data: {
            cards: [
              { key: 'total', label: '总发布次数', count: total },
              { key: 'success', label: '发布成功', count: success },
              { key: 'failed', label: '发布失败', count: failed },
              { key: 'today', label: '今日发布', count: today },
            ],
          },
          warnings: [],
          errors: [],
          traceId,
        };
        await next();
      },

      // 列表：筛选 + 分页 + 关联商品标题/批次号。
      list: async (ctx: Context, next: Next) => {
        const traceId = ctx.reqId || `srv-${Date.now()}`;
        const v = (ctx.action?.params?.values || {}) as {
          keyword?: string;
          result?: string;
          platform?: string;
          dateFrom?: string;
          dateTo?: string;
          page?: number;
          pageSize?: number;
        };
        const page = Math.max(1, Number(v.page) || 1);
        const pageSize = Math.min(50, Math.max(1, Number(v.pageSize) || 10));
        const { Records, Batches, Products } = getRepos(db);
        const batchIdsByNo = await resolveBatchIdsByNo(Batches, v.keyword);
        const filter = buildFilter(v, batchIdsByNo);
        const total = await Records.count({ filter });
        // 表底汇总条：按「除结果外的当前筛选」统计成功/失败数（点 chip 可切换结果筛选）。
        const chipBase = buildFilter({ ...v, result: undefined }, batchIdsByNo);
        const chipAnd = ((chipBase as Record<string, unknown>).$and as unknown[]) || [];
        const resultCounts = {
          success: await Records.count({ filter: { $and: [...chipAnd, { result: 'success' }] } }),
          failed: await Records.count({ filter: { $and: [...chipAnd, { result: 'failed' }] } }),
        };
        const rows = await Records.find({ filter, sort: ['-id'], offset: (page - 1) * pageSize, limit: pageSize });

        // 批量取商品标题、批次号，避免 N+1。
        const pids = [...new Set(rows.map((r: any) => r.get('productId')).filter(Boolean))] as number[];
        const bids = [...new Set(rows.map((r: any) => r.get('batchId')).filter(Boolean))] as number[];
        const products = pids.length ? await Products.find({ filter: { id: { $in: pids } } }) : [];
        const batches = bids.length ? await Batches.find({ filter: { id: { $in: bids } } }) : [];
        const titleById: Record<number, string> = {};
        for (const p of products) titleById[p.get('id')] = p.get('titleFinal') || p.get('titleProcessed') || '';
        const noById: Record<number, string> = {};
        for (const b of batches) noById[b.get('id')] = b.get('batchNo');

        const items = rows.map((r: any) => ({
          id: r.get('id'),
          batchId: r.get('batchId'),
          batchNo: noById[r.get('batchId')] || null,
          productId: r.get('productId'),
          productTitle: titleById[r.get('productId')] || '（商品已移除）',
          targetPlatform: r.get('targetPlatform'),
          result: r.get('result'),
          targetProductId: r.get('targetProductId'),
          targetUrl: r.get('targetUrl'),
          failureReason: r.get('failureReason'),
          errorCode: r.get('errorCode'),
          retryable: r.get('retryable'),
          publishedAt: r.get('publishedAt'),
          createdAt: r.get('createdAt'),
          traceId: r.get('traceId'),
        }));
        ctx.body = {
          ok: true,
          data: { items, total, page, pageSize, resultCounts },
          warnings: [],
          errors: [],
          traceId,
        };
        await next();
      },

      // 导出（MVP）：按筛选导出 CSV（base64，前端 data URI 下载，含失败原因/错误码/traceId）。
      export: async (ctx: Context, next: Next) => {
        const traceId = ctx.reqId || `srv-${Date.now()}`;
        const v = (ctx.action?.params?.values || {}) as {
          keyword?: string;
          result?: string;
          platform?: string;
          dateFrom?: string;
          dateTo?: string;
        };
        const { Records, Batches, Products } = getRepos(db);
        const batchIdsByNo = await resolveBatchIdsByNo(Batches, v.keyword);
        const filter = buildFilter(v, batchIdsByNo);
        const rows = await Records.find({ filter, sort: ['-id'], limit: 1000 });
        const pids = [...new Set(rows.map((r: any) => r.get('productId')).filter(Boolean))] as number[];
        const bids = [...new Set(rows.map((r: any) => r.get('batchId')).filter(Boolean))] as number[];
        const products = pids.length ? await Products.find({ filter: { id: { $in: pids } } }) : [];
        const batches = bids.length ? await Batches.find({ filter: { id: { $in: bids } } }) : [];
        const titleById: Record<number, string> = {};
        for (const p of products) titleById[p.get('id')] = p.get('titleFinal') || p.get('titleProcessed') || '';
        const noById: Record<number, string> = {};
        for (const b of batches) noById[b.get('id')] = b.get('batchNo');

        const lines = [CSV_HEADERS.join(',')];
        for (const r of rows) {
          lines.push(
            [
              r.get('id'),
              noById[r.get('batchId')] || '',
              r.get('productId'),
              titleById[r.get('productId')] || '',
              r.get('targetPlatform'),
              r.get('result'),
              r.get('targetProductId'),
              r.get('targetUrl'),
              r.get('failureReason'),
              r.get('errorCode'),
              r.get('publishedAt'),
              r.get('traceId'),
            ]
              .map(csvCell)
              .join(','),
          );
        }
        const csv = lines.join('\n');
        const base64 = Buffer.from(`\uFEFF${csv}`, 'utf8').toString('base64');
        ctx.body = {
          ok: true,
          data: { filename: `publish-history-${Date.now()}.csv`, base64, count: rows.length },
          warnings: rows.length >= 1000 ? ['导出上限 1000 条，请缩小筛选范围获取完整数据'] : [],
          errors: [],
          traceId,
        };
        await next();
      },
    },
  });

  app.acl.allow('aiListingHistory', 'stats', 'loggedIn');
  app.acl.allow('aiListingHistory', 'list', 'loggedIn');
  app.acl.allow('aiListingHistory', 'export', 'loggedIn');
}
