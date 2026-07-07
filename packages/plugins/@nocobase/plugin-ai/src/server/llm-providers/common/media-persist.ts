/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// 媒体产物统一转存:各家生成的图/音/视频 URL 全是短时效临时链接(百炼 24h、dall-e 60min,
// gpt-image/Gemini 只回 base64),拿到即下载/落盘到 File Manager(attachments),消息里只引用本地
// URL。任一产物转存失败则该产物回退原始 URL,并把 persisted 置 false 让气泡保留"有效期有限"提示;
// 转存动作绝不让整轮生成失败。

import { rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Application } from '@nocobase/server';
import type { PluginFileManagerServer } from '@nocobase/plugin-file-manager';
import type { MediaTaskInvoker, MediaTaskOutput } from './media-task';

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'video/mp4': '.mp4',
  'video/quicktime': '.mov',
  'video/webm': '.webm',
  'audio/wav': '.wav',
  'audio/x-wav': '.wav',
  'audio/wave': '.wav',
  'audio/mpeg': '.mp3',
  'audio/mp3': '.mp3',
  'audio/ogg': '.ogg',
  'audio/aac': '.aac',
};

function guessExt(sourceUrl: string, mimetype?: string | null): string {
  const normalized = mimetype?.split(';')[0]?.trim().toLowerCase();
  if (normalized && EXT_BY_MIME[normalized]) return EXT_BY_MIME[normalized];
  const m = sourceUrl.split('?')[0].match(/\.([a-zA-Z0-9]{2,4})$/);
  return m ? '.' + m[1].toLowerCase() : '';
}

interface StoredMediaFile {
  fileId: number | string;
  url: string;
}

async function storeBuffer(
  app: Application,
  buf: Buffer,
  ext: string,
  mimetype?: string,
  sourceUrl?: string,
): Promise<StoredMediaFile> {
  const fileManager = app.pm.get('file-manager') as PluginFileManagerServer;
  if (!fileManager?.createFileRecord) {
    throw new Error('file-manager plugin unavailable');
  }
  const tmp = path.join(os.tmpdir(), `ai-media-${Date.now()}-${Math.floor(Math.random() * 1e9)}${ext}`);
  await writeFile(tmp, buf);
  try {
    const created = await fileManager.createFileRecord({
      collectionName: 'attachments',
      filePath: tmp,
      values: { mimetype, meta: { source: 'ai-media-gen', ...(sourceUrl ? { sourceUrl } : {}) } },
    });
    // 记录本身不含 url 字段,访问地址由存储引擎按 baseUrl/path/filename 计算
    const url = await fileManager.getFileURL(created as never);
    if (!url) throw new Error('file record created without url');
    return { fileId: created.get('id') as number | string, url };
  } finally {
    await rm(tmp, { force: true });
  }
}

async function downloadToStorage(app: Application, sourceUrl: string): Promise<StoredMediaFile> {
  const resp = await fetch(sourceUrl, { signal: AbortSignal.timeout(120000) });
  if (!resp.ok) throw new Error(`下载失败 HTTP ${resp.status}`);
  const mimetype = resp.headers.get('content-type')?.split(';')[0]?.trim() || undefined;
  const buf = Buffer.from(await resp.arrayBuffer());
  return storeBuffer(app, buf, guessExt(sourceUrl, mimetype), mimetype, sourceUrl);
}

export async function persistMediaTaskOutput(app: Application, output: MediaTaskOutput): Promise<MediaTaskOutput> {
  const urls: string[] = [];
  const files: StoredMediaFile[] = [];
  let persisted = true;
  for (const url of output.urls) {
    try {
      const stored = await downloadToStorage(app, url);
      urls.push(stored.url);
      files.push(stored);
    } catch (e) {
      app.logger?.warn?.(`[ai media persist] download failed: ${(e as Error)?.message}`, { sourceUrl: url });
      urls.push(url);
      persisted = false;
    }
  }
  const leftoverBinaries: NonNullable<MediaTaskOutput['binaries']> = [];
  for (const binary of output.binaries || []) {
    try {
      const stored = await storeBuffer(
        app,
        Buffer.from(binary.base64, 'base64'),
        guessExt('', binary.mimeType),
        binary.mimeType,
      );
      urls.push(stored.url);
      files.push(stored);
    } catch (e) {
      app.logger?.warn?.(`[ai media persist] store binary failed: ${(e as Error)?.message}`);
      leftoverBinaries.push(binary);
      persisted = false;
    }
  }
  return {
    ...output,
    urls,
    binaries: leftoverBinaries.length ? leftoverBinaries : undefined,
    persisted,
    files: files.length ? files : undefined,
  };
}

// 装饰媒体任务调用:产物先转存再交给对话通道渲染
export function withMediaPersistence(app: Application, invoker: MediaTaskInvoker): MediaTaskInvoker {
  return async (input) => persistMediaTaskOutput(app, await invoker(input));
}
