/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// 生成任务队列(模块级单例):快捷场景改图从「点了干等、工具栏全锁」变成「进队列、随时继续派活」。
// 模块级而非组件态,是为了跨商品切换存活——MediaStudio 随商品重挂载,排队中的任务不能跟着丢。
// 串行执行(并发 1):服务端 generate 同步等供应商出图,串行即天然限速,也保证候选生成顺序可预期。
// 组件用 useGenQueue()(useSyncExternalStore)订阅快照,done 数变化时自行刷新候选区。

import { useSyncExternalStore } from 'react';
import { callMediaApi, type MediaStudioApp } from './types';

export type GenTaskStatus = 'queued' | 'running' | 'done' | 'failed';

export interface GenTask {
  id: number;
  productId: number;
  assetId: number;
  /** 快捷场景 key;缺省 = 纯指令自定义改图(promptbar) */
  scene?: string;
  /** 展示用:场景名 + 源图短标识(入列时生成,模块内不做 i18n) */
  label: string;
  instruction?: string;
  n: number;
  llmService?: string;
  model?: string;
  status: GenTaskStatus;
  error?: string;
  resultAssetId?: number;
}

export interface GenQueueSnapshot {
  tasks: GenTask[];
  queued: number;
  running: number;
  done: number;
  failed: number;
}

type GenerateInput = Omit<GenTask, 'id' | 'status' | 'error' | 'resultAssetId'>;

let seq = 1;
let tasks: GenTask[] = [];
let snapshot: GenQueueSnapshot = { tasks, queued: 0, done: 0, running: 0, failed: 0 };
let pumping = false;
const listeners = new Set<() => void>();

function rebuildSnapshot(): void {
  snapshot = {
    tasks,
    queued: tasks.filter((t) => t.status === 'queued').length,
    running: tasks.filter((t) => t.status === 'running').length,
    done: tasks.filter((t) => t.status === 'done').length,
    failed: tasks.filter((t) => t.status === 'failed').length,
  };
  listeners.forEach((l) => l());
}

function patchTask(id: number, patch: Partial<GenTask>): void {
  tasks = tasks.map((t) => (t.id === id ? { ...t, ...patch } : t));
  rebuildSnapshot();
}

async function pump(app: MediaStudioApp): Promise<void> {
  if (pumping) return;
  pumping = true;
  try {
    for (;;) {
      const next = tasks.find((t) => t.status === 'queued');
      if (!next) break;
      patchTask(next.id, { status: 'running' });
      try {
        const res = await callMediaApi<{ assets: Array<{ assetId: number; url: string }> }>(
          app,
          'aiListingMedia:generate',
          {
            productId: next.productId,
            assetId: next.assetId,
            scene: next.scene,
            instruction: next.instruction || '',
            n: next.n,
            llmService: next.llmService,
            model: next.model,
          },
        );
        if (res.ok) {
          patchTask(next.id, { status: 'done', resultAssetId: res.data?.assets?.[0]?.assetId });
        } else {
          patchTask(next.id, { status: 'failed', error: res.message });
        }
      } catch (e) {
        patchTask(next.id, { status: 'failed', error: (e as Error).message });
      }
    }
  } finally {
    pumping = false;
  }
}

/** 入列并启动泵(泵已在跑则只入列)。返回本批任务 id。 */
export function enqueueGenerate(app: MediaStudioApp, items: GenerateInput[]): number[] {
  const added = items.map((item) => ({ ...item, id: seq++, status: 'queued' as const }));
  tasks = [...tasks, ...added];
  rebuildSnapshot();
  pump(app);
  return added.map((t) => t.id);
}

/** 失败任务重新排队(沿用原参数),一键重试的后端。 */
export function retryFailedGenerate(app: MediaStudioApp): number {
  const failed = tasks.filter((t) => t.status === 'failed');
  if (!failed.length) return 0;
  tasks = tasks.map((t) => (t.status === 'failed' ? { ...t, status: 'queued', error: undefined } : t));
  rebuildSnapshot();
  pump(app);
  return failed.length;
}

/** 清掉已结束(done/failed)的任务;排队/进行中的保留。 */
export function clearSettledGenerate(): void {
  tasks = tasks.filter((t) => t.status === 'queued' || t.status === 'running');
  rebuildSnapshot();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): GenQueueSnapshot {
  return snapshot;
}

export function useGenQueue(): GenQueueSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** 测试用:重置模块态。 */
export function __resetGenQueueForTest(): void {
  tasks = [];
  seq = 1;
  pumping = false;
  rebuildSnapshot();
}

/** 测试用:读当前快照(hook 之外)。 */
export function __getGenQueueSnapshotForTest(): GenQueueSnapshot {
  return snapshot;
}
