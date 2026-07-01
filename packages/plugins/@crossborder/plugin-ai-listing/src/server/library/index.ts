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

// 商品库（Phase 9）：主数据台账。统计卡 + 搜索筛选 + 列表/卡片 + 发布链接聚合。只读查询，不改业务状态。
// 发布链接来自该商品最近一条「成功」发布记录的 targetUrl（§5.6 发布链接列）。

// 统计卡片分组（PRD §5.6：全部 / 已抓取 / 已处理 / 已发布 / 发布失败）。
const CARD_GROUPS: Array<{ key: string; label: string; statuses: string[] }> = [
  { key: 'captured', label: '已抓取', statuses: ['captured'] },
  { key: 'processed', label: '已处理', statuses: ['processed', 'reviewing', 'reviewed'] },
  { key: 'published', label: '已发布', statuses: ['published'] },
  { key: 'publishFailed', label: '发布失败', statuses: ['publish_failed'] },
];

const STATUS_OPTIONS = [
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

function getRepos(db: any) {
  return {
    Products: db.getRepository('aiListingProducts'),
    Media: db.getRepository('aiListingMediaAssets'),
    Records: db.getRepository('aiListingPublishRecords'),
  };
}

// 关键词/状态/平台筛选 → 组合 $and 过滤（root 必须是条件组）。
function buildFilter(v: { keyword?: string; status?: string; platform?: string }): Record<string, unknown> {
  const and: unknown[] = [];
  if (v.status && STATUS_OPTIONS.includes(v.status)) and.push({ status: v.status });
  if (v.platform) and.push({ $or: [{ sourcePlatform: v.platform }, { targetPlatform: v.platform }] });
  if (v.keyword && v.keyword.trim()) {
    const kw = v.keyword.trim();
    and.push({
      $or: [
        { titleFinal: { $includes: kw } },
        { titleProcessed: { $includes: kw } },
        { titleOriginal: { $includes: kw } },
        { productNo: { $includes: kw } },
      ],
    });
  }
  return and.length ? { $and: and } : {};
}

// 聚合一批商品的发布链接：productId → 最近成功记录 targetUrl。
async function loadPublishLinks(Records: any, productIds: number[]): Promise<Record<number, string>> {
  if (!productIds.length) return {};
  const rows = await Records.find({
    filter: { $and: [{ productId: { $in: productIds } }, { result: 'success' }] },
    sort: ['-id'],
  });
  const map: Record<number, string> = {};
  for (const r of rows) {
    const pid = r.get('productId');
    // 取每个商品最近（id 最大）一条成功记录的链接；已存在则跳过（sort 已降序）。
    if (map[pid] == null && r.get('targetUrl')) map[pid] = r.get('targetUrl');
  }
  return map;
}

function toRow(p: any, mainImage: string | null, publishUrl: string | null) {
  return {
    id: p.get('id'),
    productNo: p.get('productNo'),
    title: p.get('titleFinal') || p.get('titleProcessed') || p.get('titleOriginal') || '（未命名）',
    sourcePlatform: p.get('sourcePlatform'),
    targetPlatform: p.get('targetPlatform'),
    priceTarget: p.get('priceTarget'),
    priceOriginal: p.get('priceOriginal'),
    currencyOriginal: p.get('currencyOriginal'),
    stock: p.get('stock'),
    status: p.get('status'),
    priority: p.get('priority'),
    tags: p.get('tags') || [],
    updatedAt: p.get('updatedAt'),
    mainImage,
    publishUrl,
  };
}

const CSV_HEADERS = ['ID', '商品编号', '标题', '来源平台', '目标平台', '目标售价', '库存', '状态', '发布链接'];

function csvCell(value: unknown): string {
  const s = value == null ? '' : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// ── 批量保存字段的纯逻辑（可单测，与 DB/审计写入解耦）──
// 锁定状态：这些商品的运营字段不允许批量改（发布中/已发布）。
export const BULK_LOCKED_STATUS = ['publishing', 'published'];
const BULK_PRIORITY = ['high', 'medium', 'low'];

// 字段白名单 + 值归一化：服务端二次校验，不信任前端传的字段名/值。只返回合法字段。
export function normalizeBulkFields(input: Record<string, unknown>): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (input.targetPlatform != null && String(input.targetPlatform).trim()) {
    patch.targetPlatform = String(input.targetPlatform).trim();
  }
  if (input.stock != null && input.stock !== '') {
    const n = Number(input.stock);
    if (Number.isFinite(n) && n >= 0) patch.stock = Math.floor(n);
  }
  if (input.priority != null && BULK_PRIORITY.includes(String(input.priority))) {
    patch.priority = String(input.priority);
  }
  if (Array.isArray(input.tags)) {
    patch.tags = input.tags.map((t) => String(t).trim()).filter(Boolean);
  }
  return patch;
}

// 计算「实际有变化的字段」：current 为字段当前值映射，patch 为归一化后的目标值。返回逐字段 diff。
export function computeFieldDiffs(
  current: Record<string, unknown>,
  patch: Record<string, unknown>,
): Array<{ field: string; old: unknown; val: unknown }> {
  const diffs: Array<{ field: string; old: unknown; val: unknown }> = [];
  for (const k of Object.keys(patch)) {
    const oldVal = current[k];
    if (JSON.stringify(oldVal ?? null) === JSON.stringify(patch[k])) continue;
    diffs.push({ field: k, old: oldVal ?? null, val: patch[k] });
  }
  return diffs;
}

export function setupLibrary(plugin: Plugin): void {
  const { app } = plugin;
  const db = app.db;

  app.resourceManager.define({
    name: 'aiListingLibrary',
    actions: {
      // 统计卡片：全部 + 4 个生命周期分组计数。
      stats: async (ctx: Context, next: Next) => {
        const traceId = ctx.reqId || `srv-${Date.now()}`;
        const { Products } = getRepos(db);
        const total = await Products.count();
        const cards: Array<{ key: string; label: string; count: number }> = [
          { key: 'total', label: '全部商品', count: total },
        ];
        for (const g of CARD_GROUPS) {
          const count = await Products.count({ filter: { status: { $in: g.statuses } } });
          cards.push({ key: g.key, label: g.label, count });
        }
        ctx.body = { ok: true, data: { cards }, warnings: [], errors: [], traceId };
        await next();
      },

      // 列表（列表/卡片视图共用数据）：关键词/状态/平台筛选 + 分页 + 主图 + 发布链接。
      list: async (ctx: Context, next: Next) => {
        const traceId = ctx.reqId || `srv-${Date.now()}`;
        const v = (ctx.action?.params?.values || {}) as {
          keyword?: string;
          status?: string;
          platform?: string;
          page?: number;
          pageSize?: number;
        };
        const page = Math.max(1, Number(v.page) || 1);
        const pageSize = Math.min(50, Math.max(1, Number(v.pageSize) || 12));
        const filter = buildFilter(v);
        const { Products, Media, Records } = getRepos(db);
        const total = await Products.count({ filter });
        const rows = await Products.find({ filter, sort: ['-id'], offset: (page - 1) * pageSize, limit: pageSize });
        const ids = rows.map((p: any) => p.get('id'));
        const links = await loadPublishLinks(Records, ids);
        const items = [];
        for (const p of rows) {
          const pid = p.get('id');
          const main = await Media.findOne({ filter: { $and: [{ productId: pid }, { role: 'main' }] } });
          items.push(toRow(p, main ? main.get('sourceUrl') : null, links[pid] || null));
        }
        ctx.body = {
          ok: true,
          data: { items, total, page, pageSize, statusOptions: STATUS_OPTIONS },
          warnings: [],
          errors: [],
          traceId,
        };
        await next();
      },

      // 导出（MVP）：按当前筛选导出 CSV，返回 base64 内容供前端 data URI 下载（不落盘、不外发）。
      export: async (ctx: Context, next: Next) => {
        const traceId = ctx.reqId || `srv-${Date.now()}`;
        const v = (ctx.action?.params?.values || {}) as { keyword?: string; status?: string; platform?: string };
        const filter = buildFilter(v);
        const { Products, Records } = getRepos(db);
        const rows = await Products.find({ filter, sort: ['-id'], limit: 1000 });
        const ids = rows.map((p: any) => p.get('id'));
        const links = await loadPublishLinks(Records, ids);
        const lines = [CSV_HEADERS.join(',')];
        for (const p of rows) {
          lines.push(
            [
              p.get('id'),
              p.get('productNo'),
              p.get('titleFinal') || p.get('titleProcessed') || p.get('titleOriginal'),
              p.get('sourcePlatform'),
              p.get('targetPlatform'),
              p.get('priceTarget'),
              p.get('stock'),
              p.get('status'),
              links[p.get('id')] || '',
            ]
              .map(csvCell)
              .join(','),
          );
        }
        const csv = lines.join('\n');
        // 前置 UTF-8 BOM 让 Excel 正确识别中文编码。
        const base64 = Buffer.from(`\uFEFF${csv}`, 'utf8').toString('base64');
        ctx.body = {
          ok: true,
          data: { filename: `products-${Date.now()}.csv`, base64, count: rows.length },
          warnings: rows.length >= 1000 ? ['导出上限 1000 条，请缩小筛选范围获取完整数据'] : [],
          errors: [],
          traceId,
        };
        await next();
      },

      // 批量保存字段（Phase 4）：受控地把「运营维度」字段批量写入选中商品。唯一写库口，逐商品逐字段审计 actorType=user。
      // 白名单字段：targetPlatform / stock / priority / tags；跳过锁定商品（发布中/已发布）；只写实际有变化的字段。
      bulkSaveFields: async (ctx: Context, next: Next) => {
        const traceId = ctx.reqId || `srv-${Date.now()}`;
        const v = (ctx.action?.params?.values || {}) as {
          productIds?: Array<number | string>;
          values?: Record<string, unknown>;
        };
        const actorId = String(ctx.state?.currentUser?.id ?? 'unknown');
        const ids = Array.isArray(v.productIds)
          ? Array.from(new Set(v.productIds.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n > 0)))
          : [];
        if (!ids.length) {
          ctx.status = 400;
          ctx.body = fail('NO_PRODUCTS', '请先选择要批量编辑的商品', false, traceId);
          return await next();
        }
        // 字段白名单 + 值归一化（服务端二次校验，不信任前端传的字段名/值）。见 normalizeBulkFields（可单测）。
        const patch = normalizeBulkFields((v.values || {}) as Record<string, unknown>);
        const patchKeys = Object.keys(patch);
        if (!patchKeys.length) {
          ctx.status = 400;
          ctx.body = fail('NO_FIELDS', '没有可批量保存的字段（可批量编辑：目标平台/库存/优先级/标签）', false, traceId);
          return await next();
        }

        const Products = db.getRepository('aiListingProducts');
        const AuditLogs = db.getRepository('aiListingAuditLogs');
        let updated = 0;
        let auditCount = 0;
        const skipped: number[] = [];
        for (const id of ids) {
          const p: any = await Products.findOne({ filterByTk: id });
          if (!p || BULK_LOCKED_STATUS.includes(p.get('status'))) {
            skipped.push(id);
            continue;
          }
          // 只写实际有变化的字段，并逐字段记审计（actorType=user，因入库由用户点提交触发）。
          const current: Record<string, unknown> = {};
          for (const k of patchKeys) current[k] = p.get(k);
          const diffs = computeFieldDiffs(current, patch);
          if (!diffs.length) continue;
          const values: Record<string, unknown> = {};
          diffs.forEach((d) => {
            values[d.field] = d.val;
          });
          await Products.update({ filterByTk: id, values });
          for (const d of diffs) {
            await AuditLogs.create({
              values: {
                actorType: 'user',
                actorId,
                action: 'bulk.edit_field',
                resourceType: 'product',
                resourceId: id,
                fieldName: d.field,
                oldValue: d.old,
                newValue: d.val,
                reason: '商品库批量编辑字段',
                traceId,
              },
            });
            auditCount++;
          }
          updated++;
        }
        ctx.body = {
          ok: true,
          data: { updated, skippedCount: skipped.length, skipped, fields: patchKeys, audits: auditCount },
          warnings: skipped.length ? [`已跳过 ${skipped.length} 个锁定（发布中/已发布）或不存在的商品`] : [],
          errors: [],
          traceId,
        };
        await next();
      },
    },
  });

  // 查询/导出均为只读，登录用户可用（遵循当前用户权限）。批量保存字段为受控写入，登录用户可用（细粒度角色留待 ACL 细化）。
  app.acl.allow('aiListingLibrary', 'stats', 'loggedIn');
  app.acl.allow('aiListingLibrary', 'list', 'loggedIn');
  app.acl.allow('aiListingLibrary', 'export', 'loggedIn');
  app.acl.allow('aiListingLibrary', 'bulkSaveFields', 'loggedIn');
}
