/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// W4 创作历史单测:候选(含已弃用/已采纳)+ 失败任务合并倒序流;状态映射;scene/assetType 过滤;分页;
// 自由模式(productId=0 → productId IS NULL)。全部内存替身,不触数据库。

import { describe, expect, it } from 'vitest';
import { listMediaHistory } from '../history';

type Row = Record<string, unknown> & { id: number };

function makeApp(assets: Row[], jobs: Row[]) {
  const wrap = (row: Row) => ({ get: (k: string) => row[k] });
  const table = (rows: Row[]) => ({
    findAll: async ({ where, limit }: { where: Record<string, unknown>; limit?: number }) =>
      rows
        .filter((r) => Object.entries(where).every(([k, v]) => (r[k] ?? null) === v))
        .sort((a, b) => b.id - a.id)
        .slice(0, limit ?? rows.length)
        .map(wrap),
  });
  const app = {
    db: {
      getCollection: (name: string) => ({ model: name === 'aiListingMediaAssets' ? table(assets) : table(jobs) }),
    },
  };
  return app as never;
}

const asset = (id: number, extra: Partial<Row> = {}): Row => ({
  id,
  productId: 7,
  origin: 'ai_candidate',
  assetType: 'image',
  finalSelected: false,
  discarded: false,
  parentAssetId: 3,
  sourceUrl: `http://x/${id}.png`,
  meta: { storedUrl: `http://x/${id}.png` },
  genParams: { scene: 'scene_gen', instruction: `指令${id}` },
  createdAt: `2026-07-0${(id % 8) + 1}T00:00:00Z`,
  ...extra,
});

const failedJob = (id: number, extra: Partial<Row> = {}): Row => ({
  id,
  productId: 7,
  jobType: 'ai_image_edit',
  status: 'failed',
  prompt: '失败的提示词',
  model: 'gpt-image-2',
  provider: 'v_openai',
  errorMessage: 'HTTP 401 token invalidated',
  metadata: { scene: 'white_bg', instruction: '白底', sourceUrl: 'http://x/src.png' },
  createdAt: `2026-07-0${(id % 8) + 1}T12:00:00Z`,
  ...extra,
});

describe('listMediaHistory (W4)', () => {
  it('merges assets (all lifecycle states) and failed jobs, newest first, with status mapping', async () => {
    const app = makeApp(
      [
        asset(1), // candidate
        asset(2, { finalSelected: true }), // adopted
        asset(3, { discarded: true }), // discarded
      ],
      [
        failedJob(4),
        { id: 5, productId: 7, jobType: 'ai_image_edit', status: 'success', createdAt: '2026-07-08T00:00:00Z' },
      ],
    );
    const res = await listMediaHistory(app, { productId: 7 });
    expect(res.total).toBe(4); // success job 不进流
    const byId = Object.fromEntries(res.items.map((it) => [it.id, it]));
    expect(byId[1].status).toBe('candidate');
    expect(byId[2].status).toBe('adopted');
    expect(byId[3].status).toBe('discarded');
    expect(byId[4]).toMatchObject({ kind: 'failed', status: 'failed', errorMessage: 'HTTP 401 token invalidated' });
    // 失败条目拼出可重试参数
    expect(byId[4].genParams).toMatchObject({ scene: 'white_bg', instruction: '白底', model: 'gpt-image-2' });
    // 时间倒序
    const times = res.items.map((it) => it.createdAt);
    expect([...times].sort().reverse()).toEqual(times);
  });

  it('filters by scene and assetType', async () => {
    const app = makeApp(
      [
        asset(1, { genParams: { scene: 'white_bg' } }),
        asset(2, { genParams: { scene: 'scene_gen' } }),
        asset(3, { assetType: 'video', genParams: { scene: null } }),
      ],
      [failedJob(4, { metadata: { scene: 'scene_gen' } })],
    );
    const scene = await listMediaHistory(app, { productId: 7, scene: 'scene_gen' });
    expect(scene.items.map((it) => it.id).sort()).toEqual([2, 4]);
    const video = await listMediaHistory(app, { productId: 7, assetType: 'video' });
    expect(video.items.map((it) => it.id)).toEqual([3]);
  });

  it('paginates the merged stream', async () => {
    const app = makeApp([asset(1), asset(2), asset(3)], [failedJob(4), failedJob(5)]);
    const p1 = await listMediaHistory(app, { productId: 7, page: 1, pageSize: 2 });
    const p2 = await listMediaHistory(app, { productId: 7, page: 2, pageSize: 2 });
    const p3 = await listMediaHistory(app, { productId: 7, page: 3, pageSize: 2 });
    expect(p1.total).toBe(5);
    expect(p1.items.length).toBe(2);
    expect(p2.items.length).toBe(2);
    expect(p3.items.length).toBe(1);
    const all = [...p1.items, ...p2.items, ...p3.items].map((it) => `${it.kind}${it.id}`);
    expect(new Set(all).size).toBe(5); // 无重复无遗漏
  });

  it('free mode (productId=0) matches rows with null productId only', async () => {
    const app = makeApp([asset(1, { productId: null }), asset(2)], []);
    const free = await listMediaHistory(app, { productId: 0 });
    expect(free.items.map((it) => it.id)).toEqual([1]);
    const bound = await listMediaHistory(app, { productId: 7 });
    expect(bound.items.map((it) => it.id)).toEqual([2]);
  });
});
