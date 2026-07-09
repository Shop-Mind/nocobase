/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// 生成队列单测:串行执行(并发 1)、成功/失败状态流转、失败重试沿用原参数、清空只清已结束。
// 假 app.apiClient 可控 resolve,不触网络。

import { beforeEach, describe, expect, it } from 'vitest';
import {
  __getGenQueueSnapshotForTest as snap,
  __resetGenQueueForTest,
  clearSettledGenerate,
  enqueueGenerate,
  retryFailedGenerate,
} from '../gen-queue';
import type { MediaStudioApp } from '../types';

type Deferred = { resolve: (v: unknown) => void; data: Record<string, unknown> };

function makeApp() {
  const calls: Deferred[] = [];
  const app = {
    apiClient: {
      request: (opts: { data: Record<string, unknown> }) => {
        let settle!: (v: unknown) => void;
        const promise = new Promise((resolve) => (settle = resolve));
        calls.push({ resolve: settle, data: opts.data });
        return promise;
      },
    },
  } as unknown as MediaStudioApp;
  return { app, calls };
}

const okBody = { data: { data: { ok: true, data: { assets: [{ assetId: 901, url: '/x.png' }] } } } };
const failBody = {
  data: { data: { ok: false, errors: [{ code: 'MEDIA_GENERATE_FAILED', message: '生成失败:模拟' }] } },
};
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function baseTask(assetId: number) {
  return { productId: 1, assetId, scene: 'white_bg', label: `白底图 · #${assetId}`, n: 1 };
}

describe('gen-queue', () => {
  beforeEach(() => __resetGenQueueForTest());

  it('runs tasks strictly one at a time and marks them done with the result asset', async () => {
    const { app, calls } = makeApp();
    enqueueGenerate(app, [baseTask(11), baseTask(12)]);
    await tick();
    // 串行:第一条在跑,第二条还没发请求
    expect(calls.length).toBe(1);
    expect(calls[0].data.assetId).toBe(11);
    expect(snap()).toMatchObject({ running: 1, queued: 1 });
    calls[0].resolve(okBody);
    await tick();
    await tick();
    expect(calls.length).toBe(2);
    expect(calls[1].data.assetId).toBe(12);
    calls[1].resolve(okBody);
    await tick();
    await tick();
    expect(snap()).toMatchObject({ done: 2, failed: 0, queued: 0, running: 0 });
    expect(snap().tasks[0].resultAssetId).toBe(901);
  });

  it('marks a rejected task failed, and retryFailed re-queues it with the same params', async () => {
    const { app, calls } = makeApp();
    enqueueGenerate(app, [{ ...baseTask(21), instruction: '换成大理石背景' }]);
    await tick();
    calls[0].resolve(failBody);
    await tick();
    await tick();
    expect(snap().tasks[0]).toMatchObject({ status: 'failed', error: '生成失败:模拟' });

    const retried = retryFailedGenerate(app);
    expect(retried).toBe(1);
    await tick();
    expect(calls.length).toBe(2);
    // 沿用原参数
    expect(calls[1].data).toMatchObject({ assetId: 21, scene: 'white_bg', instruction: '换成大理石背景' });
    calls[1].resolve(okBody);
    await tick();
    await tick();
    expect(snap().tasks[0].status).toBe('done');
  });

  it('clearSettled removes only finished tasks and keeps queued/running ones', async () => {
    const { app, calls } = makeApp();
    enqueueGenerate(app, [baseTask(31), baseTask(32)]);
    await tick();
    calls[0].resolve(okBody);
    await tick();
    await tick();
    // 31 done,32 running
    expect(snap()).toMatchObject({ done: 1, running: 1 });
    clearSettledGenerate();
    expect(snap().tasks.map((t) => t.assetId)).toEqual([32]);
    calls[1].resolve(okBody);
    await tick();
    await tick();
    expect(snap()).toMatchObject({ done: 1, failed: 0 });
  });
});
