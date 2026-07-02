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
  quickEntries: Array<{ key: string; title: string; target: string; tab: string }>;
  platforms: Array<{ platform: string; status: 'connected' | 'expired' | 'disconnected'; storeName?: string }>;
  recentTasks: Array<{
    id: number;
    name: string;
    type: 'capture' | 'process' | 'media' | 'publish' | 'import';
    status: 'pending' | 'running' | 'success' | 'partial_failed' | 'failed' | string;
    progress: number;
    createdAt: string;
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
async function buildSummary(plugin: Plugin): Promise<DashboardSummary> {
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

  // 最近任务：抓取任务 + 处理批次 + 发布批次 各取最新 5，合并按创建时间倒序取 8。
  const [captureRows, processRows, publishRows] = await Promise.all([
    CaptureTasks.find({ sort: ['-id'], limit: 5 }),
    ProcessingJobs.find({ sort: ['-id'], limit: 5 }),
    PublishBatches.find({ sort: ['-id'], limit: 5 }),
  ]);
  const recentTasks = [
    ...captureRows.map((r: any) => ({
      id: Number(r.get('id')),
      name: captureTaskName(r.toJSON()),
      type: 'capture' as const,
      status: String(r.get('status') ?? 'pending'),
      progress: Number(r.get('progress') ?? 0),
      createdAt: new Date(r.get('createdAt')).toISOString(),
    })),
    ...processRows.map((r: any) => ({
      id: Number(r.get('id')),
      name: `信息处理 - 批次 #${r.get('jobNo') ?? r.get('id')}`,
      type: 'process' as const,
      status: String(r.get('status') ?? 'pending'),
      progress: Number(r.get('progress') ?? 0),
      createdAt: new Date(r.get('createdAt')).toISOString(),
    })),
    ...publishRows.map((r: any) => {
      const total = Number(r.get('totalCount') ?? 0);
      const done = Number(r.get('successCount') ?? 0) + Number(r.get('failedCount') ?? 0);
      return {
        id: Number(r.get('id')),
        name: `发布 - ${r.get('targetPlatform') ?? ''} 批次 #${r.get('batchNo') ?? r.get('id')}`,
        type: 'publish' as const,
        status: String(r.get('status') ?? 'pending'),
        progress: total > 0 ? Math.round((done / total) * 100) : 0,
        createdAt: new Date(r.get('createdAt')).toISOString(),
      };
    }),
  ]
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, 8);

  // 平台连接状态（脱敏：只出平台/状态/店铺名，绝不出凭证）。
  const accountRows = await Accounts.find({ sort: ['id'] });
  const platforms: DashboardSummary['platforms'] = accountRows.map((r: any) => {
    const auth = String(r.get('authStatus') ?? 'disconnected');
    const status: 'connected' | 'expired' | 'disconnected' =
      auth === 'connected' ? 'connected' : auth === 'expired' ? 'expired' : 'disconnected';
    return { platform: String(r.get('platform') ?? ''), status, storeName: r.get('storeName') || undefined };
  });

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
        try {
          ctx.body = {
            ok: true,
            data: await buildSummary(plugin),
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
