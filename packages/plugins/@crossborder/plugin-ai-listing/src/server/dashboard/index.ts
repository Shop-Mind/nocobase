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

// 工作台聚合返回结构（PRD §7.5 统一信封）。真实聚合：基于 aiListing* 集合统计，无 mock。
export interface DashboardSummary {
  kpis: {
    todayCaptured: number;
    pendingProcess: number;
    published: number;
    publishSuccessRate: number; // 0~1
    awaitingReview: number;
  };
  // 商品状态分布（全量），供工作台画状态漏斗/分布条。
  statusDistribution: Array<{ status: string; count: number }>;
  // 媒体资产：总数 / 已下载原图（sourceFileId 非空）。
  mediaStats: { total: number; downloaded: number };
  // 近 14 天趋势（抓取入库商品数 / 发布成功数），供工作台折线图。
  trends: Array<{ date: string; captured: number; published: number }>;
  // 发布结果计数（成功/失败记录），供成功率环形图。
  publishStats: { success: number; failed: number };
  // 我的待办（官方 demo「My tasks」范式）：按下一步动作分组的商品清单，每组 top5 + 总数。
  todos: Array<{
    key: 'toReview' | 'publishFailed' | 'toProcess';
    label: string;
    count: number;
    items: Array<{ id: number; title: string; mainImage: string | null; status: string; updatedAt: string }>;
  }>;
  quickEntries: Array<{ key: string; title: string; target: string; tab: string }>;
  platforms: Array<{ platform: string; status: 'connected' | 'expired' | 'disconnected'; storeName?: string }>;
  recentTasks: Array<{
    id: number;
    name: string;
    type: 'capture' | 'process' | 'media' | 'publish' | 'import';
    status: 'pending' | 'running' | 'success' | 'partial_failed' | 'failed' | string;
    progress: number;
    createdAt: string;
    // 商品预览（最多 3 件）：让「最近任务」一眼看出这次处理/抓取/发布的是什么货。
    products: Array<{ id: number; title: string; mainImage: string | null }>;
    productTotal: number;
    // 发布任务补充：店铺名 + 策略（草稿/上架）。
    storeName?: string | null;
    strategy?: string | null;
  }>;
  notifications: Array<{ id: number; level: 'info' | 'warning' | 'error'; type: string; message: string }>;
}

const PRODUCT_STATUSES = [
  'draft',
  'capturing',
  'captured',
  'processing',
  'processed',
  'process_failed',
  'reviewing',
  'reviewed',
  'publishing',
  'published',
  'publish_failed',
  'archived',
];

// 抓取任务名：按类型 + 输入拼一个可读名称。
function captureTaskName(row: Record<string, unknown>): string {
  const type = String(row.captureType ?? 'url');
  const input = (row.input ?? {}) as Record<string, unknown>;
  const label: Record<string, string> = {
    url: 'URL 抓取',
    store: '店铺抓取',
    keyword: '关键词抓取',
    batch: '批量导入',
  };
  let hint = '';
  if (typeof input.url === 'string') {
    try {
      hint = ` - ${new URL(input.url).hostname}`;
    } catch {
      hint = '';
    }
  } else if (typeof input.keyword === 'string') {
    hint = ` - ${input.keyword}`;
  }
  return `${label[type] || '抓取'}${hint}（#${row.taskNo ?? row.id}）`;
}

// 真实聚合：商品状态分布、今日抓取、发布成功率、平台连接、最近任务（抓取/处理/发布合并）、真实通知。
async function buildSummary(plugin: Plugin, trendDays = 14): Promise<DashboardSummary> {
  const db = plugin.app.db;
  const Products = db.getRepository('aiListingProducts');
  const CaptureTasks = db.getRepository('aiListingCaptureTasks');
  const ProcessingJobs = db.getRepository('aiListingProcessingJobs');
  const PublishBatches = db.getRepository('aiListingPublishBatches');
  const PublishRecords = db.getRepository('aiListingPublishRecords');
  const Accounts = db.getRepository('aiListingPlatformAccounts');
  const Media = db.getRepository('aiListingMediaAssets');

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const todayIso = startOfToday.toISOString();

  const statusCounts = await Promise.all(
    PRODUCT_STATUSES.map(async (status) => ({ status, count: await Products.count({ filter: { status } }) })),
  );
  const byStatus = Object.fromEntries(statusCounts.map((s) => [s.status, s.count])) as Record<string, number>;

  const [todayCaptured, pubSuccess, pubFailed, mediaTotal, mediaDownloaded] = await Promise.all([
    Products.count({ filter: { createdAt: { $gte: todayIso } } }),
    PublishRecords.count({ filter: { result: 'success' } }),
    PublishRecords.count({ filter: { result: 'failed' } }),
    Media.count(),
    Media.count({ filter: { sourceFileId: { $notEmpty: true } } }),
  ]);
  const pubDenominator = pubSuccess + pubFailed;

  // 近 14 天趋势：抓取入库商品（按 createdAt）/ 发布成功记录（按 createdAt）。数据量小，取回后按天归并。
  const trendStart = new Date();
  trendStart.setHours(0, 0, 0, 0);
  trendStart.setDate(trendStart.getDate() - (trendDays - 1));
  const dayKey = (v: unknown) => {
    const d = new Date(v as string);
    return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const [trendProducts, trendPublished] = await Promise.all([
    Products.find({ filter: { createdAt: { $gte: trendStart.toISOString() } }, fields: ['id', 'createdAt'] }),
    PublishRecords.find({
      filter: { $and: [{ createdAt: { $gte: trendStart.toISOString() } }, { result: 'success' }] },
      fields: ['id', 'createdAt'],
    }),
  ]);
  const capturedByDay: Record<string, number> = {};
  for (const p of trendProducts)
    capturedByDay[dayKey(p.get('createdAt'))] = (capturedByDay[dayKey(p.get('createdAt'))] ?? 0) + 1;
  const publishedByDay: Record<string, number> = {};
  for (const p of trendPublished)
    publishedByDay[dayKey(p.get('createdAt'))] = (publishedByDay[dayKey(p.get('createdAt'))] ?? 0) + 1;
  const trends: DashboardSummary['trends'] = [];
  for (let i = 0; i < trendDays; i++) {
    const d = new Date(trendStart);
    d.setDate(trendStart.getDate() + i);
    const key = dayKey(d);
    trends.push({ date: key, captured: capturedByDay[key] ?? 0, published: publishedByDay[key] ?? 0 });
  }

  // 最近任务：抓取任务 + 处理批次 + 发布批次 各取最新 5，合并按创建时间倒序取 8。
  const [captureRows, processRows, publishRows] = await Promise.all([
    CaptureTasks.find({ sort: ['-id'], limit: 5 }),
    ProcessingJobs.find({ sort: ['-id'], limit: 5 }),
    PublishBatches.find({ sort: ['-id'], limit: 5 }),
  ]);

  // 每个任务关联的商品 id：抓取=metadata.productId；处理=job.productIds；发布=批次记录去重。
  const capturePids = new Map<number, number[]>();
  for (const r of captureRows) {
    const pid = Number(((r.get('metadata') as Record<string, unknown>) || {}).productId);
    capturePids.set(Number(r.get('id')), Number.isInteger(pid) && pid > 0 ? [pid] : []);
  }
  const processPids = new Map<number, number[]>();
  for (const r of processRows) {
    const ids = ((r.get('productIds') as number[]) || []).map(Number).filter((n) => Number.isInteger(n) && n > 0);
    processPids.set(Number(r.get('id')), ids);
  }
  const publishPids = new Map<number, number[]>();
  const batchIds = publishRows.map((r: any) => Number(r.get('id')));
  if (batchIds.length) {
    const recs = await PublishRecords.find({
      filter: { batchId: { $in: batchIds } },
      fields: ['id', 'batchId', 'productId'],
      sort: ['id'],
    });
    for (const rec of recs) {
      const bid = Number(rec.get('batchId'));
      const pid = Number(rec.get('productId'));
      if (!pid) continue;
      const list = publishPids.get(bid) || [];
      if (!list.includes(pid)) list.push(pid);
      publishPids.set(bid, list);
    }
  }
  // 批量取商品标题 + 主图，避免 N+1。
  const allPids = [...new Set([...capturePids.values(), ...processPids.values(), ...publishPids.values()].flat())];
  const titleById: Record<number, string> = {};
  const imageById: Record<number, string> = {};
  if (allPids.length) {
    const products = await Products.find({ filter: { id: { $in: allPids } } });
    for (const p of products) {
      titleById[p.get('id')] =
        p.get('titleFinal') || p.get('titleProcessed') || p.get('titleOriginal') || `商品 #${p.get('id')}`;
    }
    const mains = await Media.find({
      filter: { $and: [{ productId: { $in: allPids } }, { role: 'main' }] },
      sort: ['id'],
    });
    for (const m of mains) {
      const pid = m.get('productId');
      if (imageById[pid] == null && m.get('sourceUrl')) imageById[pid] = m.get('sourceUrl');
    }
  }
  const previewOf = (pids: number[]) =>
    pids
      .slice(0, 3)
      .map((pid) => ({ id: pid, title: titleById[pid] || `商品 #${pid}`, mainImage: imageById[pid] || null }));

  // 发布批次的店铺名映射。
  const storeIds = [...new Set(publishRows.map((r: any) => Number(r.get('targetStoreId'))).filter(Boolean))];
  const storeNameById: Record<number, string> = {};
  if (storeIds.length) {
    const storeRows = await Accounts.find({ filter: { id: { $in: storeIds } } });
    for (const a of storeRows) storeNameById[a.get('id')] = a.get('storeName') || `店铺 #${a.get('id')}`;
  }

  const recentTasks = [
    ...captureRows.map((r: any) => {
      const pids = capturePids.get(Number(r.get('id'))) || [];
      return {
        id: Number(r.get('id')),
        name: captureTaskName(r.toJSON()),
        type: 'capture' as const,
        status: String(r.get('status') ?? 'pending'),
        progress: Number(r.get('progress') ?? 0),
        createdAt: new Date(r.get('createdAt')).toISOString(),
        products: previewOf(pids),
        productTotal: pids.length,
      };
    }),
    ...processRows.map((r: any) => {
      const pids = processPids.get(Number(r.get('id'))) || [];
      return {
        id: Number(r.get('id')),
        name: `信息处理 - 批次 #${r.get('jobNo') ?? r.get('id')}`,
        type: 'process' as const,
        status: String(r.get('status') ?? 'pending'),
        progress: Number(r.get('progress') ?? 0),
        createdAt: new Date(r.get('createdAt')).toISOString(),
        products: previewOf(pids),
        productTotal: pids.length,
      };
    }),
    ...publishRows.map((r: any) => {
      const total = Number(r.get('totalCount') ?? 0);
      const done = Number(r.get('successCount') ?? 0) + Number(r.get('failedCount') ?? 0);
      const pids = publishPids.get(Number(r.get('id'))) || [];
      return {
        id: Number(r.get('id')),
        name: `发布 - ${r.get('targetPlatform') ?? ''} 批次 #${r.get('batchNo') ?? r.get('id')}`,
        type: 'publish' as const,
        status: String(r.get('status') ?? 'pending'),
        progress: total > 0 ? Math.round((done / total) * 100) : 0,
        createdAt: new Date(r.get('createdAt')).toISOString(),
        products: previewOf(pids),
        productTotal: pids.length,
        storeName: storeNameById[Number(r.get('targetStoreId'))] || null,
        strategy: r.get('strategy') || null,
      };
    }),
  ]
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, 8);

  // 平台连接状态（脱敏：只出平台/状态/店铺名，绝不出凭证）。状态按「令牌事实」核定，
  // 与平台连接页一致：无令牌一律未连接（早期演示行写过 connected/expired 但从未持有令牌）。
  const accountRows = await Accounts.find({ sort: ['id'] });
  const platforms: DashboardSummary['platforms'] = accountRows.map((r: any) => {
    const hasToken = Boolean(r.get('accessTokenEnc') || r.get('refreshTokenEnc'));
    const refreshAt = r.get('refreshExpiresAt') ? new Date(r.get('refreshExpiresAt')) : null;
    let auth = String(r.get('authStatus') ?? 'disconnected');
    if (!hasToken) auth = 'disconnected';
    else if (auth === 'connected' && refreshAt && refreshAt.getTime() < Date.now()) auth = 'expired';
    const status: 'connected' | 'expired' | 'disconnected' =
      auth === 'connected' ? 'connected' : auth === 'expired' ? 'expired' : 'disconnected';
    return { platform: String(r.get('platform') ?? ''), status, storeName: r.get('storeName') || undefined };
  });

  // 我的待办：按「下一步该干什么」分组的商品（top5 + 总数），仪表板可直达处理入口。
  const buildTodo = async (
    key: 'toReview' | 'publishFailed' | 'toProcess',
    label: string,
    statuses: string[],
  ): Promise<DashboardSummary['todos'][number]> => {
    const count = await Products.count({ filter: { status: { $in: statuses } } });
    const rows = await Products.find({ filter: { status: { $in: statuses } }, sort: ['-updatedAt'], limit: 5 });
    const ids = rows.map((p: any) => p.get('id'));
    const imgById: Record<number, string> = {};
    if (ids.length) {
      const mains = await Media.find({
        filter: { $and: [{ productId: { $in: ids } }, { role: 'main' }] },
        sort: ['id'],
      });
      for (const m of mains) {
        const pid = m.get('productId');
        if (imgById[pid] == null && m.get('sourceUrl')) imgById[pid] = m.get('sourceUrl');
      }
    }
    return {
      key,
      label,
      count,
      items: rows.map((p: any) => ({
        id: p.get('id'),
        title: p.get('titleFinal') || p.get('titleProcessed') || p.get('titleOriginal') || `商品 #${p.get('id')}`,
        mainImage: imgById[p.get('id')] || null,
        status: p.get('status'),
        updatedAt: new Date(p.get('updatedAt')).toISOString(),
      })),
    };
  };
  const todos = await Promise.all([
    buildTodo('toReview', '待审核', ['processed', 'reviewing']),
    buildTodo('publishFailed', '发布失败', ['publish_failed']),
    buildTodo('toProcess', '待处理', ['captured', 'process_failed']),
  ]);

  // 真实通知：凭证过期 / 发布失败待重试 / 待处理与待审核积压。
  const notifications: DashboardSummary['notifications'] = [];
  let nid = 1;
  for (const p of platforms) {
    if (p.status === 'expired') {
      notifications.push({
        id: nid++,
        level: 'warning',
        type: 'credential_expired',
        message: `${p.platform} 授权已过期，请到「平台连接」页重新授权`,
      });
    }
  }
  if (pubFailed > 0) {
    notifications.push({
      id: nid++,
      level: 'error',
      type: 'publish_failed',
      message: `有 ${pubFailed} 条发布失败记录，可到「发布记录」页查看并重试`,
    });
  }
  const pendingProcess = byStatus.captured ?? 0;
  const awaitingReview = (byStatus.processed ?? 0) + (byStatus.reviewing ?? 0);
  if (pendingProcess > 0) {
    notifications.push({
      id: nid++,
      level: 'info',
      type: 'pending_process',
      message: `有 ${pendingProcess} 个已抓取商品待信息处理`,
    });
  }
  if (awaitingReview > 0) {
    notifications.push({
      id: nid++,
      level: 'info',
      type: 'awaiting_review',
      message: `有 ${awaitingReview} 个商品待人工确认（预览编辑）`,
    });
  }

  return {
    kpis: {
      todayCaptured,
      pendingProcess,
      published: byStatus.published ?? 0,
      publishSuccessRate: pubDenominator > 0 ? pubSuccess / pubDenominator : 0,
      awaitingReview,
    },
    statusDistribution: statusCounts.filter((s) => s.count > 0),
    mediaStats: { total: mediaTotal, downloaded: mediaDownloaded },
    trends,
    publishStats: { success: pubSuccess, failed: pubFailed },
    todos,
    quickEntries: [
      { key: 'url', title: 'URL 抓取', target: 'capture', tab: 'url' },
      { key: 'store', title: '店铺抓取', target: 'capture', tab: 'store' },
      { key: 'keyword', title: '关键词抓取', target: 'capture', tab: 'keyword' },
      { key: 'batch', title: '批量导入', target: 'capture', tab: 'batch' },
    ],
    platforms,
    recentTasks,
    notifications,
  };
}

// 在插件 load() 中调用：注册 aiListingDashboard:summary 自定义资源动作 + ACL。
export function setupDashboard(plugin: Plugin): void {
  const { app } = plugin;

  app.resourceManager.define({
    name: 'aiListingDashboard',
    actions: {
      summary: async (ctx: Context, next: Next) => {
        const traceId = ctx.reqId || `srv-${Date.now()}`;
        const vDays = Number((ctx.action?.params?.values as { trendDays?: number } | undefined)?.trendDays);
        const trendDays = [7, 14, 30].includes(vDays) ? vDays : 14;
        try {
          ctx.body = {
            ok: true,
            data: await buildSummary(plugin, trendDays),
            warnings: [],
            errors: [],
            traceId,
          };
        } catch (error) {
          // 统一失败信封：友好信息 + 错误码 + traceId，前端据此渲染友好错误态。
          ctx.status = 500;
          ctx.body = {
            ok: false,
            errors: [{ code: 'DASHBOARD_SUMMARY_FAILED', message: '工作台指标加载失败', recoverable: true }],
            traceId,
          };
          ctx.logger?.error(`[ai-listing][${traceId}] dashboard summary failed`, { error: (error as Error)?.message });
        }
        await next();
      },
    },
  });

  // 查询类，登录用户可读；遵循当前用户权限。
  app.acl.allow('aiListingDashboard', 'summary', 'loggedIn');
}
