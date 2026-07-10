/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// 智能视频(P8 图生视频 i2v)服务层单测:generateVideo 公网入图校验 + 建异步任务、pollVideoJob 落视频候选、
// adoptAsset 视频位(单槽替换)、selectPublishableVideo 发布只带采纳视频。全用内存仓库 + 假 DashScope(stub fetch)
// + 假 downloadToStorage,不触真实网络/存储/账号(零成本验证全链路,与"提交即验"的真机 E2E 互补)。

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adoptAsset, generateVideo, isLoopbackHttpUrl, pollVideoJob } from '../service';
import { selectPublishableVideo } from '../../publish';

vi.mock('../download', () => ({
  downloadToStorage: vi.fn(async () => ({ fileId: 555, url: '/storage/uploads/video-1.mp4' })),
  storeLocalFile: vi.fn(async () => ({ fileId: 777, url: '/storage/uploads/multi.mp4' })),
}));

// 多图成片的拼接层 mock:不依赖真实 ffmpeg,记录调用以断言段数
const concatMock = vi.fn(async () => undefined);
vi.mock('../video-concat', () => ({
  concatMp4: (...args: unknown[]) => concatMock(...args),
  ffmpegBin: () => 'ffmpeg',
}));

type Row = Record<string, unknown> & { id: number };
type Wrapped = { get: (k: string) => unknown };

function makeDb() {
  const tables: Record<string, Row[]> = {};
  let nextId = 1;
  const wrap = (row: Row): Wrapped => ({ get: (k: string) => row[k] });
  const matches = (row: Row, filter: Record<string, unknown> = {}): boolean =>
    Object.entries(filter).every(([key, cond]) => {
      if (cond && typeof cond === 'object' && !Array.isArray(cond)) {
        const ops = cond as { $in?: unknown[]; $gte?: string };
        if (ops.$in) return ops.$in.includes(row[key]);
        if (ops.$gte) return String(row[key] ?? '') >= ops.$gte;
      }
      return row[key] === cond;
    });
  const repo = (name: string) => {
    tables[name] ||= [];
    return {
      async create({ values }: { values: Record<string, unknown> }) {
        const row: Row = { id: nextId++, createdAt: new Date().toISOString(), ...values };
        tables[name].push(row);
        return wrap(row);
      },
      async findOne({ filterByTk, filter }: { filterByTk?: number; filter?: Record<string, unknown> }) {
        const row =
          filterByTk != null
            ? tables[name].find((r) => r.id === Number(filterByTk))
            : tables[name].find((r) => matches(r, filter));
        return row ? wrap(row) : null;
      },
      async find({ filter }: { filter?: Record<string, unknown> } = {}) {
        return tables[name].filter((r) => matches(r, filter)).map(wrap);
      },
      async update({ filterByTk, values }: { filterByTk: number; values: Record<string, unknown> }) {
        const row = tables[name].find((r) => r.id === Number(filterByTk));
        if (row) Object.assign(row, values);
      },
      async count({ filter }: { filter?: Record<string, unknown> } = {}) {
        return tables[name].filter((r) => matches(r, filter)).length;
      },
    };
  };
  return { tables, repo };
}

function makePlugin() {
  const db = makeDb();
  const app = { db: { getRepository: db.repo }, pm: { get: () => undefined }, logger: { warn: vi.fn() } };
  return { plugin: { app } as never, tables: db.tables, repo: db.repo };
}

// DashScope 服务(resolveMediaProvider 取第一条 enabled dashscope,读 options.apiKey)
async function seedDashScope(repo: ReturnType<typeof makeDb>['repo']) {
  await repo('llmServices').create({
    values: { provider: 'dashscope', enabled: true, options: { apiKey: 'sk-fake' } },
  });
}
async function seedProductImage(repo: ReturnType<typeof makeDb>['repo'], sourceUrl: string, status = 'reviewing') {
  const product = await repo('aiListingProducts').create({ values: { status } });
  const productId = product.get('id') as number;
  const asset = await repo('aiListingMediaAssets').create({
    values: { productId, assetType: 'image', role: 'main', sourceUrl, meta: { storedUrl: sourceUrl } },
  });
  return { productId, assetId: asset.get('id') as number };
}

// 可编程的 DashScope stub:submit 返回 task_id;poll 返回可配置状态
let pollStatus: 'SUCCEEDED' | 'FAILED' | 'RUNNING' = 'SUCCEEDED';
beforeEach(() => {
  pollStatus = 'SUCCEEDED';
  global.fetch = vi.fn(async (url: string) => {
    const u = String(url);
    if (u.includes('video-synthesis')) {
      return { ok: true, status: 200, json: async () => ({ output: { task_id: 'task-abc' } }) } as never;
    }
    if (u.includes('/tasks/')) {
      if (pollStatus === 'SUCCEEDED') {
        return {
          ok: true,
          status: 200,
          json: async () => ({ output: { task_status: 'SUCCEEDED', video_url: 'https://cdn.example.com/out.mp4' } }),
        } as never;
      }
      if (pollStatus === 'FAILED') {
        return {
          ok: true,
          status: 200,
          json: async () => ({ output: { task_status: 'FAILED', message: 'quota' } }),
        } as never;
      }
      return { ok: true, status: 200, json: async () => ({ output: { task_status: 'RUNNING' } }) } as never;
    }
    return { ok: false, status: 404, json: async () => ({}) } as never;
  }) as never;
});
afterEach(() => {
  delete process.env.AI_LISTING_PUBLIC_BASE_URL;
  vi.restoreAllMocks();
});

describe('generateVideo', () => {
  it('recognizes container-only loopback reference URLs', () => {
    expect(isLoopbackHttpUrl('http://127.0.0.1:13001/storage/uploads/main.jpg')).toBe(true);
    expect(isLoopbackHttpUrl('http://localhost:13001/storage/uploads/main.jpg')).toBe(true);
    expect(isLoopbackHttpUrl('https://cdn.example.com/main.jpg')).toBe(false);
  });

  it('rejects a non-public source (video endpoint needs a fetchable URL)', async () => {
    const { plugin, repo } = makePlugin();
    await seedDashScope(repo);
    const { productId, assetId } = await seedProductImage(repo, '/storage/uploads/local.png');
    // 无 env 公网基址、无 publicBaseUrl → 相对路径不可公网访问
    await expect(generateVideo(plugin, { productId, assetId })).rejects.toMatchObject({
      code: 'MEDIA_SOURCE_NOT_PUBLIC',
    });
  });

  it('submits an i2v task with the public img_url and records job metadata', async () => {
    const { plugin, tables, repo } = makePlugin();
    await seedDashScope(repo);
    // 绝对 http 源图 → toPublicUrl 直通(public=true)
    const { productId, assetId } = await seedProductImage(repo, 'https://cdn.example.com/main.jpg');
    const res = await generateVideo(plugin, { productId, assetId, duration: 5, resolution: '720P' });

    expect(res.jobId).toBeGreaterThan(0);
    expect(res.providerTaskId).toBe('task-abc');
    const job = tables['aiListingMediaJobs'][0];
    expect(job).toMatchObject({ jobType: 'ai_video', status: 'running', productId });
    expect(job.metadata).toMatchObject({
      mode: 'i2v',
      publicImgUrl: 'https://cdn.example.com/main.jpg',
      duration: 5,
      resolution: '720P',
      parentAssetId: assetId,
    });
    // 提交请求带上了 parameters(resolution/duration)与 img_url
    const body = JSON.parse((global.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][1]['body']);
    expect(body.input.img_url).toBe('https://cdn.example.com/main.jpg');
    expect(body.parameters).toMatchObject({ resolution: '720P', duration: 5 });
    // 不含明文凭证泄露到 job
    expect(JSON.stringify(tables['aiListingMediaJobs'])).not.toMatch(/sk-fake/);
  });

  it('honors AI_LISTING_PUBLIC_BASE_URL for a relative source', async () => {
    process.env.AI_LISTING_PUBLIC_BASE_URL = 'https://app.xuanwu.space';
    const { plugin, tables, repo } = makePlugin();
    await seedDashScope(repo);
    const { productId, assetId } = await seedProductImage(repo, '/storage/uploads/local.png');
    await generateVideo(plugin, { productId, assetId });
    expect((tables['aiListingMediaJobs'][0].metadata as Record<string, unknown>).publicImgUrl).toBe(
      'https://app.xuanwu.space/storage/uploads/local.png',
    );
  });
});

describe('pollVideoJob', () => {
  async function submit(plugin: never, repo: ReturnType<typeof makeDb>['repo']) {
    const { productId, assetId } = await seedProductImage(repo, 'https://cdn.example.com/main.jpg');
    const { jobId } = await generateVideo(plugin, { productId, assetId });
    return { productId, assetId, jobId };
  }

  it('running task stays running', async () => {
    const { plugin, repo } = makePlugin();
    await seedDashScope(repo);
    const { jobId } = await submit(plugin, repo);
    pollStatus = 'RUNNING';
    expect(await pollVideoJob(plugin, jobId)).toMatchObject({ status: 'running' });
  });

  it('success creates a video candidate (origin=ai_candidate, assetType=video) and stores it on the job', async () => {
    const { plugin, tables, repo } = makePlugin();
    await seedDashScope(repo);
    const { productId, jobId } = await submit(plugin, repo);
    pollStatus = 'SUCCEEDED';
    const res = await pollVideoJob(plugin, jobId);

    expect(res.status).toBe('success');
    const cand = tables['aiListingMediaAssets'].find((r) => r.assetType === 'video');
    expect(cand).toMatchObject({
      productId,
      assetType: 'video',
      role: 'video',
      origin: 'ai_candidate',
      finalSelected: false,
      processType: 'ai_video',
      sourceFileId: 555,
    });
    expect(res.assetId).toBe(cand?.id);
    // 二次轮询直接返回已存结果,不重复建候选
    const again = await pollVideoJob(plugin, jobId);
    expect(again).toMatchObject({ status: 'success', assetId: cand?.id });
    expect(tables['aiListingMediaAssets'].filter((r) => r.assetType === 'video')).toHaveLength(1);
  });

  it('failed task marks the job failed', async () => {
    const { plugin, tables, repo } = makePlugin();
    await seedDashScope(repo);
    const { jobId } = await submit(plugin, repo);
    pollStatus = 'FAILED';
    expect(await pollVideoJob(plugin, jobId)).toMatchObject({ status: 'failed' });
    expect(tables['aiListingMediaJobs'][0]).toMatchObject({ status: 'failed', retryable: true });
  });
});

describe('adoptAsset (video slot)', () => {
  it('adopts a video candidate into the single video slot, replacing the previously adopted video', async () => {
    const { plugin, tables, repo } = makePlugin();
    await seedDashScope(repo);
    const { productId } = await seedProductImage(repo, 'https://cdn.example.com/main.jpg', 'processed');
    // 已有一个采纳视频
    const prev = await repo('aiListingMediaAssets').create({
      values: { productId, assetType: 'video', role: 'video', origin: 'ai_adopted', finalSelected: true },
    });
    // 新视频候选
    const cand = await repo('aiListingMediaAssets').create({
      values: { productId, assetType: 'video', role: 'video', origin: 'ai_candidate', finalSelected: false },
    });
    const res = await adoptAsset(plugin, { assetId: cand.get('id') as number, actorId: '7', traceId: 't-vid' });

    expect(res).toMatchObject({ productId, role: 'video' });
    const newRow = tables['aiListingMediaAssets'].find((r) => r.id === cand.get('id'));
    expect(newRow).toMatchObject({ finalSelected: true, origin: 'ai_adopted', role: 'video' });
    // 旧采纳视频被移出槽位(discarded、不再 finalSelected)
    const prevRow = tables['aiListingMediaAssets'].find((r) => r.id === prev.get('id'));
    expect(prevRow).toMatchObject({ finalSelected: false, discarded: true });
    expect(tables['aiListingProducts'][0].status).toBe('reviewing');
    expect(tables['aiListingAuditLogs'][0]).toMatchObject({
      actorType: 'user',
      action: 'media.adopt',
      resourceId: productId,
    });
  });
});

describe('selectPublishableVideo', () => {
  const row = (v: Record<string, unknown>) => ({ get: (k: string) => v[k] });

  it('prefers the adopted video and never publishes a raw candidate', () => {
    const adopted = row({ id: 2, finalSelected: true, origin: 'ai_adopted', sourceUrl: '/a.mp4' });
    const candidate = row({ id: 3, finalSelected: false, origin: 'ai_candidate', sourceUrl: '/c.mp4' });
    expect(selectPublishableVideo([candidate, adopted])?.get('id')).toBe(2);
    // 只有裸候选时 → 不发布(undefined)
    expect(selectPublishableVideo([candidate])).toBeUndefined();
  });

  it('falls back to a non-candidate legacy video, and skips discarded', () => {
    const legacy = row({ id: 5, finalSelected: false, origin: null, sourceUrl: '/legacy.mp4' });
    expect(selectPublishableVideo([legacy])?.get('id')).toBe(5);
    const discarded = row({ id: 6, finalSelected: true, origin: 'ai_adopted', discarded: true });
    expect(selectPublishableVideo([discarded])).toBeUndefined();
  });
});

describe('generateVideo · 多图 AI 成片', () => {
  function makeAiPlugin(invokeMediaTask: ReturnType<typeof vi.fn>) {
    const db = (globalThis as never as { __mvdb?: unknown }).__mvdb; // 不复用,每测新建
    void db;
    const made = (() => {
      const base = makePlugin() as unknown as { plugin: { app: Record<string, unknown> }; tables: never; repo: never };
      (base.plugin.app as { pm: unknown }).pm = {
        get: (name: string) =>
          name === 'ai' ? { aiManager: { getLLMService: async () => ({ provider: { invokeMediaTask } }) } } : undefined,
      };
      return base;
    })();
    return made as unknown as ReturnType<typeof makePlugin>;
  }

  it('2 张源图 → 逐段生成 → 拼接 → 单条视频候选(genParams.mode=multi_i2v)', async () => {
    concatMock.mockClear();
    const invoke = vi.fn(async () => ({ urls: ['https://relay.example.com/v1/files/video?id=seg'] }));
    const { plugin, tables, repo } = makeAiPlugin(invoke);
    const { productId, assetId } = await seedProductImage(repo, 'https://cdn.example.com/a.jpg');
    const asset2 = await repo('aiListingMediaAssets').create({
      values: {
        productId,
        assetType: 'image',
        role: 'detail',
        sourceUrl: 'https://cdn.example.com/b.jpg',
        meta: { storedUrl: 'https://cdn.example.com/b.jpg' },
      },
    });
    // 段产物下载走全局 fetch:回可用的二进制
    global.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      arrayBuffer: async () => new Uint8Array([0, 0, 0, 1]).buffer,
    })) as never;

    const res = await generateVideo(plugin, {
      productId,
      assetIds: [assetId, asset2.get('id') as number],
      prompt: '镜头缓慢推近',
      duration: 6,
      llmService: 'svc',
      model: 'grok-imagine-video',
    });
    expect(res.providerTaskId).toMatch(/^multi-/);

    // 后台任务异步推进:轮询内存表等它到终态
    for (let i = 0; i < 40; i++) {
      const job = tables['aiListingMediaJobs'].find((j) => j.id === res.jobId);
      if (job?.status === 'success' || job?.status === 'failed') break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    const job = tables['aiListingMediaJobs'].find((j) => j.id === res.jobId);
    expect(job?.status).toBe('success');
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(concatMock).toHaveBeenCalledTimes(1);
    expect((concatMock.mock.calls[0][0] as string[]).length).toBe(2);
    const video = tables['aiListingMediaAssets'].find((a) => a.assetType === 'video');
    expect(video).toBeTruthy();
    const gp = video?.genParams as Record<string, unknown>;
    expect(gp.mode).toBe('multi_i2v');
    expect((gp.sourceAssetIds as number[]).length).toBe(2);
  });

  it('少于 2 张或未显式选模 → 参数错误', async () => {
    const invoke = vi.fn();
    const { plugin, repo } = makeAiPlugin(invoke);
    const { productId, assetId } = await seedProductImage(repo, 'https://cdn.example.com/a.jpg');
    await expect(
      generateVideo(plugin, { productId, assetIds: [assetId], llmService: 'svc', model: 'm' }),
    ).rejects.toMatchObject({ code: 'MEDIA_PARAM_INVALID' });
    await expect(generateVideo(plugin, { productId, assetIds: [assetId, assetId] })).rejects.toMatchObject({
      code: 'MEDIA_PARAM_INVALID',
    });
  });
});
