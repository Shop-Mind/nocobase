/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// 媒体真实下载：把抓取到的图片/视频 sourceUrl 拉取字节，落到 NocoBase 文件存储（attachments），
// 回写 media 资产的 sourceFileId / processStatus。这样搬运的主图、详情图、视频都被“下载”到本地存储，
// 后续白底图/去水印/发布都在已下载的原文件上执行。逐个素材隔离：一个失败不影响其它。

import { rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { PluginFileManagerServer } from '@nocobase/plugin-file-manager';
import type Plugin from '../plugin';

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'video/mp4': '.mp4',
  'video/quicktime': '.mov',
  'video/webm': '.webm',
};

// 推断扩展名：优先 content-type，退回 URL 后缀。
function guessExt(sourceUrl: string, mimetype?: string | null): string {
  if (mimetype && EXT_BY_MIME[mimetype.toLowerCase()]) return EXT_BY_MIME[mimetype.toLowerCase()];
  const m = sourceUrl.split('?')[0].match(/\.([a-zA-Z0-9]{2,4})$/);
  return m ? '.' + m[1].toLowerCase() : '';
}

export interface StoredFile {
  fileId: number;
  url?: string;
  mimetype?: string;
  size?: number;
}

// 下载单个 URL 落存储，返回附件 id + 访问 url。失败抛出。
export async function downloadToStorage(plugin: Plugin, sourceUrl: string): Promise<StoredFile> {
  const resp = await fetch(sourceUrl, { signal: AbortSignal.timeout(120000) });
  if (!resp.ok) throw new Error(`下载失败 HTTP ${resp.status}`);
  const mimetype = resp.headers.get('content-type')?.split(';')[0]?.trim() || undefined;
  const buf = Buffer.from(await resp.arrayBuffer());
  const ext = guessExt(sourceUrl, mimetype);
  const tmp = path.join(os.tmpdir(), `ai-listing-${Date.now()}-${Math.floor(Math.random() * 1e9)}${ext}`);
  await writeFile(tmp, buf);
  try {
    const fileManager = plugin.app.pm.get('file-manager') as PluginFileManagerServer;
    const created = await fileManager.createFileRecord({
      collectionName: 'attachments',
      filePath: tmp,
      values: { mimetype, meta: { sourceUrl } },
    });
    return { fileId: created.get('id'), url: created.get('url'), mimetype, size: buf.length };
  } finally {
    await rm(tmp, { force: true });
  }
}

export interface DownloadStats {
  total: number;
  ok: number;
  failed: number;
  skipped: number;
}

interface DownloadOptions {
  traceId?: string;
  taskId?: number | string;
  Steps?: { create: (args: { values: Record<string, unknown> }) => Promise<unknown> };
}

// 下载某商品所有尚未下载（sourceFileId 为空）的素材（图片 + 视频）。幂等：已下载的跳过。
export async function downloadProductMedia(
  plugin: Plugin,
  productId: number,
  options: DownloadOptions = {},
): Promise<DownloadStats> {
  const { traceId, taskId, Steps } = options;
  const Media = plugin.app.db.getRepository('aiListingMediaAssets');
  const assets = await Media.find({ filter: { productId, sourceFileId: null }, sort: ['sort', 'id'] });
  const t = Date.now();
  let ok = 0;
  let failed = 0;
  for (const asset of assets) {
    const id = asset.get('id');
    const meta = (asset.get('meta') as Record<string, unknown>) || {};
    await Media.update({ filterByTk: id, values: { processStatus: 'running' } });
    try {
      const stored = await downloadToStorage(plugin, asset.get('sourceUrl'));
      await Media.update({
        filterByTk: id,
        values: {
          sourceFileId: stored.fileId,
          processStatus: 'success',
          processType: 'download',
          meta: { ...meta, storedUrl: stored.url, mimetype: stored.mimetype, size: stored.size },
        },
      });
      ok++;
    } catch (e) {
      await Media.update({
        filterByTk: id,
        values: { processStatus: 'failed', meta: { ...meta, downloadError: (e as Error)?.message } },
      });
      plugin.app.logger?.warn(`[ai-listing]${traceId ? `[${traceId}]` : ''} media download failed`, {
        assetId: id,
        message: (e as Error)?.message,
      });
      failed++;
    }
  }
  const stats: DownloadStats = { total: assets.length, ok, failed, skipped: 0 };
  if (Steps && taskId != null) {
    await Steps.create({
      values: {
        taskType: 'capture',
        taskId,
        stepName: 'download_media',
        status: failed === 0 ? 'success' : ok === 0 ? 'failed' : 'partial',
        traceId,
        outputSnapshot: stats,
        durationMs: Date.now() - t,
      },
    });
  }
  return stats;
}
