/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// 创作历史(W4):跨会话回看某商品(或自由模式)的全部生成记录——候选资产(不过滤已弃用/已采纳)+ 失败任务
// 合并为一条时间倒序流。只读聚合,分页在内存合并后做(单商品历史量级为百,cap 兜底);写操作(弃用/重试)
// 复用既有 action,本层不新增写路径。

import type { Application } from '@nocobase/server';
import { JOB_TYPE_IMAGE, JOB_TYPE_IMAGE_EDIT, JOB_TYPE_VIDEO } from './service';

// 单侧来源的最大取数(防御性上限;单商品历史远小于此,超出的最老记录不进流)
const SOURCE_CAP = 500;

export interface HistoryItem {
  // asset=生成产物(候选/已采纳/已弃用);failed=失败任务(无产物,可按原参数重试)
  kind: 'asset' | 'failed';
  id: number;
  url: string | null;
  assetType: 'image' | 'video';
  status: 'candidate' | 'adopted' | 'discarded' | 'failed';
  scene: string | null;
  genParams: Record<string, unknown> | null;
  errorMessage: string | null;
  createdAt: string | null;
  parentAssetId: number | null;
}

export interface ListHistoryInput {
  // 0 = 自由模式(无商品归属的生成记录)
  productId: number;
  scene?: string;
  assetType?: 'image' | 'video';
  page?: number;
  pageSize?: number;
}

export interface ListHistoryResult {
  items: HistoryItem[];
  total: number;
  page: number;
  pageSize: number;
}

interface RepoRow {
  get: (k: string) => unknown;
}

function assetToItem(row: RepoRow): HistoryItem {
  const meta = (row.get('meta') as Record<string, unknown>) || {};
  const gp = (row.get('genParams') as Record<string, unknown>) || null;
  const discarded = Boolean(row.get('discarded'));
  const adopted = Boolean(row.get('finalSelected'));
  return {
    kind: 'asset',
    id: Number(row.get('id')),
    url: (meta.storedUrl as string) || (row.get('sourceUrl') as string) || null,
    assetType: row.get('assetType') === 'video' ? 'video' : 'image',
    status: discarded ? 'discarded' : adopted ? 'adopted' : 'candidate',
    scene: (gp?.scene as string) || null,
    genParams: gp,
    errorMessage: null,
    createdAt: row.get('createdAt') ? String(row.get('createdAt')) : null,
    parentAssetId: (row.get('parentAssetId') as number) ?? null,
  };
}

function jobToItem(row: RepoRow): HistoryItem {
  const metadata = (row.get('metadata') as Record<string, unknown>) || {};
  const jobType = row.get('jobType') as string;
  // 失败任务没有 genParams 快照,用 job metadata 拼出可重试的参数(scene/instruction/源图)
  const genParams: Record<string, unknown> = {
    scene: (metadata.scene as string) || null,
    instruction: (metadata.instruction as string) || (row.get('prompt') as string) || '',
    sourceImageUrl: (metadata.sourceUrl as string) || null,
    model: (row.get('model') as string) || null,
    llmService: (row.get('provider') as string) || null,
    parameters: metadata.parameters || null,
  };
  return {
    kind: 'failed',
    id: Number(row.get('id')),
    url: null,
    assetType: jobType === JOB_TYPE_VIDEO ? 'video' : 'image',
    status: 'failed',
    scene: (metadata.scene as string) || null,
    genParams,
    errorMessage: (row.get('errorMessage') as string) || null,
    createdAt: row.get('createdAt') ? String(row.get('createdAt')) : null,
    parentAssetId: null,
  };
}

// 合并流查询:productId=0 走 model.findAll 的 IS NULL(仓库 filter 对 null 语义不稳,与 candidates 同策)
export async function listMediaHistory(app: Application, input: ListHistoryInput): Promise<ListHistoryResult> {
  const productId = Number(input.productId) || 0;
  const page = Math.max(Number(input.page) || 1, 1);
  const pageSize = Math.min(Math.max(Number(input.pageSize) || 20, 1), 100);

  const Assets = app.db.getCollection('aiListingMediaAssets').model;
  const Jobs = app.db.getCollection('aiListingMediaJobs').model;
  const assetWhere: Record<string, unknown> = {
    productId: productId || null,
    origin: 'ai_candidate',
  };
  const assetRows = (await Assets.findAll({
    where: assetWhere,
    order: [['id', 'DESC']],
    limit: SOURCE_CAP,
  })) as unknown as RepoRow[];
  const jobRows = (await Jobs.findAll({
    where: { productId: productId || null, status: 'failed' },
    order: [['id', 'DESC']],
    limit: SOURCE_CAP,
  })) as unknown as RepoRow[];

  let items = [
    ...assetRows.map(assetToItem),
    ...jobRows
      .filter((r) => [JOB_TYPE_IMAGE_EDIT, JOB_TYPE_IMAGE, JOB_TYPE_VIDEO].includes(r.get('jobType') as string))
      .map(jobToItem),
  ];
  if (input.assetType) items = items.filter((it) => it.assetType === input.assetType);
  if (input.scene) items = items.filter((it) => it.scene === input.scene);
  items.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

  const total = items.length;
  const start = (page - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), total, page, pageSize };
}
