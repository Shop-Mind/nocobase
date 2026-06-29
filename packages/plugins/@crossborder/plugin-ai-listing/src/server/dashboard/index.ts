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

// 工作台聚合返回结构（PRD §7.5 统一信封）。Phase 3 先返回稳定 mock，后续用真实聚合替换 data 内容，结构不变。
export interface DashboardSummary {
  kpis: {
    todayCaptured: number;
    pendingProcess: number;
    published: number;
    publishSuccessRate: number; // 0~1
    awaitingReview: number;
  };
  quickEntries: Array<{ key: string; title: string; target: string; tab: string }>;
  platforms: Array<{ platform: string; status: 'connected' | 'expired' | 'disconnected'; storeName?: string }>;
  recentTasks: Array<{
    id: number;
    name: string;
    type: 'capture' | 'process' | 'media' | 'publish' | 'import';
    status: 'pending' | 'running' | 'success' | 'partial_failed' | 'failed';
    progress: number;
    createdAt: string;
  }>;
  notifications: Array<{ id: number; level: 'info' | 'warning' | 'error'; type: string; message: string }>;
}

// 占位聚合：后续替换为基于 aiListing* 集合的真实统计（nocobase-data-analysis / repository 聚合），保持本结构不变。
function buildMockSummary(): DashboardSummary {
  return {
    kpis: {
      todayCaptured: 12,
      pendingProcess: 5,
      published: 34,
      publishSuccessRate: 0.92,
      awaitingReview: 3,
    },
    quickEntries: [
      { key: 'url', title: 'URL 抓取', target: 'capture', tab: 'url' },
      { key: 'store', title: '店铺抓取', target: 'capture', tab: 'store' },
      { key: 'keyword', title: '关键词抓取', target: 'capture', tab: 'keyword' },
      { key: 'batch', title: '批量导入', target: 'capture', tab: 'batch' },
    ],
    platforms: [
      { platform: 'Shopee', status: 'connected', storeName: 'Shopee 旗舰店' },
      { platform: 'Lazada', status: 'expired', storeName: 'Lazada 主店' },
      { platform: 'Alibaba.com', status: 'connected', storeName: 'Alibaba 供应' },
      { platform: 'Temu', status: 'disconnected' },
      { platform: 'TikTok Shop', status: 'disconnected' },
    ],
    recentTasks: [
      {
        id: 1001,
        name: 'URL 抓取 - 女士连衣裙',
        type: 'capture',
        status: 'success',
        progress: 100,
        createdAt: '2026-06-29T09:12:00Z',
      },
      {
        id: 1002,
        name: '关键词抓取 - bluetooth earphone',
        type: 'capture',
        status: 'running',
        progress: 60,
        createdAt: '2026-06-29T09:40:00Z',
      },
      {
        id: 1003,
        name: '信息处理 - 批次 #A23',
        type: 'process',
        status: 'partial_failed',
        progress: 80,
        createdAt: '2026-06-29T10:05:00Z',
      },
      {
        id: 1004,
        name: '模拟发布 - Shopee 批次 #P7',
        type: 'publish',
        status: 'pending',
        progress: 0,
        createdAt: '2026-06-29T10:30:00Z',
      },
    ],
    notifications: [
      { id: 1, level: 'warning', type: 'credential_expired', message: 'Lazada 凭证即将过期，请尽快重新授权' },
      { id: 2, level: 'error', type: 'publish_failed', message: '发布批次 #P5 有 2 条失败，待重试' },
      { id: 3, level: 'info', type: 'rule_updated', message: '通用处理规则已更新' },
    ],
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
            data: buildMockSummary(),
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
