/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// uploadImagesToPhotobank:采纳的 AI 图是本地存储相对路径(/storage/uploads/...),必须读本地文件而不是 fetch
// (相对 URL 交给 fetch 必抛),上传成功拿 photobank_url+fileId;失败保留原 URL 且无 fileId(草稿侧负责剔除)。
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(async () => Buffer.from([0xff, 0xd8, 0xff, 0x01])),
}));
vi.mock('../../../openapi/iop-client', () => ({
  callIop: vi.fn(),
  callIopUpload: vi.fn(async () => ({ result: { photobank_url: 'https://photo.bank/x.jpg', file_id: 88 } })),
}));

import { readFile } from 'node:fs/promises';
import { callIopUpload } from '../../../openapi/iop-client';
import { uploadImagesToPhotobank } from '../index';

const cfg = {} as never;

describe('uploadImagesToPhotobank', () => {
  beforeEach(() => {
    vi.mocked(readFile).mockClear();
    vi.mocked(callIopUpload).mockClear();
  });

  it('相对 /storage 路径读本地文件并拿到 fileId', async () => {
    const notes: string[] = [];
    global.fetch = vi.fn(async () => {
      throw new Error('相对路径不应走 fetch');
    }) as never;
    const out = await uploadImagesToPhotobank(cfg, 'tk', ['/storage/uploads/ai-media-1.jpg'], notes);
    expect(vi.mocked(readFile)).toHaveBeenCalledTimes(1);
    expect(String(vi.mocked(readFile).mock.calls[0][0])).toContain('storage/uploads/ai-media-1.jpg');
    expect(out).toEqual([{ url: 'https://photo.bank/x.jpg', fileId: '88' }]);
    expect(notes.join(';')).toContain('已搬入图片银行');
  });

  it('http 绝对链接仍走 fetch 下载', async () => {
    const notes: string[] = [];
    global.fetch = vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    })) as never;
    const out = await uploadImagesToPhotobank(cfg, 'tk', ['https://sc04.alicdn.com/kf/a.jpg'], notes);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(vi.mocked(readFile)).not.toHaveBeenCalled();
    expect(out[0].fileId).toBe('88');
  });

  it('单张失败保留原 URL 且无 fileId,并记 notes', async () => {
    const notes: string[] = [];
    vi.mocked(readFile).mockRejectedValueOnce(new Error('ENOENT'));
    const out = await uploadImagesToPhotobank(cfg, 'tk', ['/storage/uploads/missing.jpg'], notes);
    expect(out).toEqual([{ url: '/storage/uploads/missing.jpg' }]);
    expect(notes.join(';')).toContain('搬入图片银行失败');
  });
});
