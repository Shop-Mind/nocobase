/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// 图片编辑闭环 Phase 0 单测:editImage 走 plugin-ai 通用层落候选、adopt/discard 状态机、商品状态锁、
// 审计(actorType=user,不含任何凭证)。全部用内存仓库 + 假 aiManager,不触网络/数据库。

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adoptAsset, discardAsset, editImage, resolveImageEditTarget, revertAdoptAsset, upscaleSize } from '../service';

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

function makePlugin(options?: {
  aiOutput?: { urls: string[]; persisted?: boolean; files?: Array<{ fileId: number; url: string }> };
  noAI?: boolean;
  enabledModels?: Array<{ value: string; capability?: { task?: string } }>;
}) {
  const db = makeDb();
  const invokeCalls: Array<Record<string, unknown>> = [];
  const aiPlugin = {
    aiManager: {
      listAllEnabledModels: async () => [
        {
          llmService: 'svc-dashscope',
          enabledModels: options?.enabledModels ?? [
            { value: 'qwen3.7-max', capability: { task: 'chat' } },
            { value: 'qwen-image-2.0-pro-2026-04-22', capability: { task: 'image_gen' } },
          ],
        },
      ],
      getLLMService: async () => ({
        provider: {
          invokeMediaTask: async (input: Record<string, unknown>) => {
            invokeCalls.push(input);
            return (
              options?.aiOutput ?? {
                urls: ['/storage/uploads/ai-media-1.png'],
                persisted: true,
                files: [{ fileId: 99, url: '/storage/uploads/ai-media-1.png' }],
              }
            );
          },
        },
      }),
    },
  };
  const app = {
    db: { getRepository: db.repo },
    pm: { get: (name: string) => (name === 'ai' && !options?.noAI ? aiPlugin : undefined) },
    logger: { warn: vi.fn() },
  };
  return { plugin: { app } as never, tables: db.tables, repo: db.repo, invokeCalls };
}

async function seedProductWithImage(
  repo: ReturnType<typeof makeDb>['repo'],
  status = 'reviewing',
): Promise<{ productId: number; assetId: number }> {
  const product = await repo('aiListingProducts').create({ values: { status, titleOriginal: 'Test bag' } });
  const productId = product.get('id') as number;
  const asset = await repo('aiListingMediaAssets').create({
    values: {
      productId,
      assetType: 'image',
      role: 'detail',
      sort: 3,
      sourceUrl: 'https://cdn.example.com/raw.png',
      meta: { storedUrl: 'data:image/png;base64,QUJD' },
    },
  });
  return { productId, assetId: asset.get('id') as number };
}

beforeEach(() => {
  delete process.env.AI_LISTING_IMAGE_EDIT_MODEL;
  delete process.env.AI_LISTING_EDIT_CANDIDATES;
});

describe('resolveImageEditTarget', () => {
  it('honors AI_LISTING_IMAGE_EDIT_MODEL with service prefix', async () => {
    process.env.AI_LISTING_IMAGE_EDIT_MODEL = 'svc-x:qwen-image-edit-plus';
    const { plugin } = makePlugin();
    expect(await resolveImageEditTarget((plugin as { app: never }).app)).toEqual({
      llmService: 'svc-x',
      model: 'qwen-image-edit-plus',
    });
  });

  it('prefers edit-family models, falls back to qwen-image family by capability', async () => {
    const { plugin } = makePlugin({
      enabledModels: [
        { value: 'qwen3.7-max', capability: { task: 'chat' } },
        { value: 'qwen-image-2.0-pro', capability: { task: 'image_gen' } },
        { value: 'qwen-image-edit-plus', capability: { task: 'image_gen' } },
      ],
    });
    expect(await resolveImageEditTarget((plugin as { app: never }).app)).toEqual({
      llmService: 'svc-dashscope',
      model: 'qwen-image-edit-plus',
    });
  });

  it('throws MEDIA_SERVICE_NOT_CONFIGURED without any image-capable model', async () => {
    const { plugin } = makePlugin({ enabledModels: [{ value: 'qwen3.7-max', capability: { task: 'chat' } }] });
    await expect(resolveImageEditTarget((plugin as { app: never }).app)).rejects.toMatchObject({
      code: 'MEDIA_SERVICE_NOT_CONFIGURED',
    });
  });

  it('instruct route prefers qwen-image-edit over wanx imageedit; function route requires imageedit', async () => {
    const both = [
      { value: 'wanx2.1-imageedit', capability: { task: 'image_gen' } },
      { value: 'qwen-image-edit-plus', capability: { task: 'image_gen' } },
    ];
    const { plugin } = makePlugin({ enabledModels: both });
    const app = (plugin as { app: never }).app;
    expect((await resolveImageEditTarget(app, { route: 'instruct' })).model).toBe('qwen-image-edit-plus');
    expect((await resolveImageEditTarget(app, { route: 'function' })).model).toBe('wanx2.1-imageedit');

    const noFunctional = makePlugin({
      enabledModels: [{ value: 'qwen-image-edit-plus', capability: { task: 'image_gen' } }],
    });
    await expect(
      resolveImageEditTarget((noFunctional.plugin as { app: never }).app, { route: 'function' }),
    ).rejects.toMatchObject({ code: 'MEDIA_SERVICE_NOT_CONFIGURED' });
  });

  it('throws when plugin-ai is unavailable', async () => {
    const { plugin } = makePlugin({ noAI: true });
    await expect(resolveImageEditTarget((plugin as { app: never }).app)).rejects.toMatchObject({
      code: 'MEDIA_SERVICE_NOT_CONFIGURED',
    });
  });
});

describe('editImage', () => {
  it('creates candidate assets linked to the source with genParams and job trace', async () => {
    const { plugin, tables, repo, invokeCalls } = makePlugin();
    const { productId, assetId } = await seedProductWithImage(repo);
    const result = await editImage(plugin, { productId, assetId, instruction: '去掉图中的品牌 logo' });

    expect(result.assets).toHaveLength(1);
    expect(result.model).toBe('qwen-image-2.0-pro-2026-04-22');
    // 源图以 data URI 原样传给通用层,默认候选数 n=2
    expect(invokeCalls[0]).toMatchObject({
      task: 'image_gen',
      prompt: '去掉图中的品牌 logo',
      images: ['data:image/png;base64,QUJD'],
      options: { parameters: { n: 2 } },
    });
    const candidate = tables['aiListingMediaAssets'].find((r) => r.origin === 'ai_candidate');
    expect(candidate).toMatchObject({
      productId,
      parentAssetId: assetId,
      finalSelected: false,
      discarded: false,
      sourceFileId: 99,
      processType: 'ai_edit',
    });
    expect(candidate?.genParams).toMatchObject({ instruction: '去掉图中的品牌 logo', sourceAssetId: assetId });
    const job = tables['aiListingMediaJobs'][0];
    expect(job).toMatchObject({ jobType: 'ai_image_edit', status: 'success', model: 'qwen-image-2.0-pro-2026-04-22' });
    // 审计与任务均不含任何凭证
    expect(JSON.stringify(tables['aiListingAuditLogs']) + JSON.stringify(tables['aiListingMediaJobs'])).not.toMatch(
      /sk-|apiKey/i,
    );
  });

  it('marks the job failed and rethrows when the invoker errors', async () => {
    const { plugin, tables, repo } = makePlugin();
    const { productId, assetId } = await seedProductWithImage(repo);
    (plugin as { app: { pm: { get: (n: string) => unknown } } }).app.pm.get = () => ({
      aiManager: {
        listAllEnabledModels: async () => [
          { llmService: 'svc', enabledModels: [{ value: 'qwen-image-2.0', capability: { task: 'image_gen' } }] },
        ],
        getLLMService: async () => ({
          provider: {
            invokeMediaTask: async () => {
              throw new Error('quota exceeded');
            },
          },
        }),
      },
    });
    await expect(editImage(plugin, { productId, assetId, instruction: '白底' })).rejects.toMatchObject({
      code: 'MEDIA_EDIT_FAILED',
    });
    expect(tables['aiListingMediaJobs'][0]).toMatchObject({ status: 'failed', retryable: true });
  });

  it('rejects empty instructions and missing sources', async () => {
    const { plugin } = makePlugin();
    await expect(editImage(plugin, { instruction: '  ' })).rejects.toMatchObject({ code: 'MEDIA_EDIT_NO_INSTRUCTION' });
    await expect(editImage(plugin, { instruction: '白底' })).rejects.toMatchObject({ code: 'MEDIA_SOURCE_NOT_FOUND' });
  });

  it('textToImage: allows no source, sends empty images and creates an unparented candidate', async () => {
    const { plugin, tables, invokeCalls } = makePlugin();
    const result = await editImage(plugin, {
      instruction: '深色木板桌面上一只米色帆布包,暖光',
      textToImage: true,
      n: 1,
    });
    expect(result.assets).toHaveLength(1);
    // t2i:images 空数组 → 通用层据此走 images/generations(纯文生图)
    expect(invokeCalls[0]).toMatchObject({ task: 'image_gen', images: [] });
    const candidate = tables['aiListingMediaAssets'].find((r) => r.origin === 'ai_candidate');
    expect(candidate).toMatchObject({ productId: null, parentAssetId: null, processType: 'ai_edit' });
    expect(candidate?.genParams).toMatchObject({ sourceAssetId: null, sourceImageUrl: null });
  });

  it('scene: builds the prompt from the template and records scene genParams', async () => {
    const { plugin, tables, repo, invokeCalls } = makePlugin();
    const { productId, assetId } = await seedProductWithImage(repo);
    await editImage(plugin, { productId, assetId, scene: 'recolor', instruction: '墨绿色' });

    const call = invokeCalls[0] as { prompt: string; options: { parameters: { n: number } } };
    // recolor 模板已强化为区域精准+其余保留:instruction 注入 + 保留约束
    expect(call.prompt).toContain('墨绿色');
    expect(call.prompt).toContain('完全不变');
    expect(call.options.parameters.n).toBe(2);
    const candidate = tables['aiListingMediaAssets'].find((r) => r.origin === 'ai_candidate');
    expect(candidate?.genParams).toMatchObject({
      scene: 'recolor',
      instruction: '墨绿色',
      compareMode: 'side_by_side',
    });
    expect((candidate?.genParams as { prompt: string }).prompt).toContain('墨绿色');
  });

  it('scene hd: instruct route with a 2x size computed from the source dimensions', async () => {
    const { plugin, repo, invokeCalls } = makePlugin({
      enabledModels: [
        { value: 'wanx2.1-imageedit', capability: { task: 'image_gen' } },
        { value: 'qwen-image-edit-plus', capability: { task: 'image_gen' } },
      ],
    });
    // 构造带真实 IHDR 的最小 PNG 头(600×400),让服务层解析出源图尺寸
    const png = Buffer.alloc(32);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png, 0);
    png.writeUInt32BE(13, 8);
    png.write('IHDR', 12);
    png.writeUInt32BE(600, 16);
    png.writeUInt32BE(400, 20);
    const product = await repo('aiListingProducts').create({ values: { status: 'reviewing' } });
    const asset = await repo('aiListingMediaAssets').create({
      values: {
        productId: product.get('id'),
        assetType: 'image',
        role: 'detail',
        meta: { storedUrl: `data:image/png;base64,${png.toString('base64')}` },
      },
    });
    const result = await editImage(plugin, {
      productId: product.get('id') as number,
      assetId: asset.get('id') as number,
      scene: 'hd',
      instruction: '',
    });

    // 指令路由优先 qwen-image-edit 系;upscale_factor 换算成 size 后不再出现在参数里
    expect(result.model).toBe('qwen-image-edit-plus');
    const call = invokeCalls[0] as { options: { function?: string; parameters: Record<string, unknown> } };
    expect(call.options.function).toBeUndefined();
    expect(call.options.parameters).toMatchObject({ n: 1, size: '1200*800' });
    expect(call.options.parameters.upscale_factor).toBeUndefined();
  });

  it('scene expand: function route to the wanx imageedit model with four-side scales', async () => {
    const { plugin, repo, invokeCalls } = makePlugin({
      enabledModels: [
        { value: 'qwen-image-edit-plus', capability: { task: 'image_gen' } },
        { value: 'wanx2.1-imageedit', capability: { task: 'image_gen' } },
      ],
    });
    const { productId, assetId } = await seedProductWithImage(repo);
    const result = await editImage(plugin, { productId, assetId, scene: 'expand', instruction: '' });

    expect(result.model).toBe('wanx2.1-imageedit');
    expect(invokeCalls[0]).toMatchObject({
      options: { function: 'expand', parameters: { top_scale: 1.5, bottom_scale: 1.5, n: 1 } },
    });
  });

  it('upscaleSize clamps into the provider 512-2048 bounds', () => {
    expect(upscaleSize(600, 400, 2)).toBe('1200*800');
    // 超上限:整体等比缩到 2048
    expect(upscaleSize(790, 1202, 2)).toBe('1346*2048');
    // 小图放大后仍不足 512:抬到下界
    expect(upscaleSize(100, 100, 2)).toBe('512*512');
    // 极端宽高比塞不进 [512,2048]:放弃指定尺寸
    expect(upscaleSize(100, 3000, 2)).toBeUndefined();
  });

  it('scene: rejects unknown scenes and missing required instructions', async () => {
    const { plugin, repo } = makePlugin();
    const { productId, assetId } = await seedProductWithImage(repo);
    await expect(editImage(plugin, { productId, assetId, scene: 'nope', instruction: 'x' })).rejects.toMatchObject({
      code: 'MEDIA_SCENE_UNKNOWN',
    });
    await expect(editImage(plugin, { productId, assetId, scene: 'recolor', instruction: '' })).rejects.toMatchObject({
      code: 'MEDIA_EDIT_NO_INSTRUCTION',
    });
  });

  it('scene translate: injects targetLanguage into the prompt and records it in genParams', async () => {
    const { plugin, tables, repo, invokeCalls } = makePlugin();
    const { productId, assetId } = await seedProductWithImage(repo);
    await editImage(plugin, { productId, assetId, scene: 'translate', instruction: '', targetLanguage: 'English' });

    const call = invokeCalls[0] as { prompt: string; options: { parameters: { n: number } } };
    expect(call.prompt).toContain('English');
    expect(call.prompt).not.toContain('{target_language}');
    // translate 默认候选数 1
    expect(call.options.parameters.n).toBe(1);
    const candidate = tables['aiListingMediaAssets'].find((r) => r.origin === 'ai_candidate');
    expect(candidate?.genParams).toMatchObject({ scene: 'translate', targetLanguage: 'English' });
  });

  it('scene process: injects style into the prompt and records it in genParams', async () => {
    const { plugin, tables, repo, invokeCalls } = makePlugin();
    const { productId, assetId } = await seedProductWithImage(repo);
    await editImage(plugin, {
      productId,
      assetId,
      scene: 'process',
      instruction: '1. 裁剪 2. 缝合 3. 质检',
      style: '商务信息图',
    });

    const call = invokeCalls[0] as { prompt: string; options: { parameters: { n: number } } };
    expect(call.prompt).toContain('商务信息图');
    expect(call.prompt).toContain('1. 裁剪 2. 缝合 3. 质检');
    expect(call.prompt).not.toContain('{style}');
    expect(call.options.parameters.n).toBe(1);
    const candidate = tables['aiListingMediaAssets'].find((r) => r.origin === 'ai_candidate');
    expect(candidate?.genParams).toMatchObject({ scene: 'process', style: '商务信息图' });
  });

  it('scene white_bg: works without an instruction and keeps caller n override', async () => {
    const { plugin, repo, invokeCalls } = makePlugin();
    const { productId, assetId } = await seedProductWithImage(repo);
    await editImage(plugin, { productId, assetId, scene: 'white_bg', instruction: '', n: 3 });
    const call = invokeCalls[0] as { prompt: string; options: { parameters: { n: number } } };
    expect(call.prompt).toContain('纯白色电商白底');
    expect(call.prompt).not.toContain('{instruction}');
    expect(call.options.parameters.n).toBe(3);
  });
});

describe('adoptAsset', () => {
  async function seedCandidate(repo: ReturnType<typeof makeDb>['repo'], productId: number, parentAssetId: number) {
    const row = await repo('aiListingMediaAssets').create({
      values: {
        productId,
        assetType: 'image',
        role: 'detail',
        origin: 'ai_candidate',
        finalSelected: false,
        discarded: false,
        parentAssetId,
        meta: { storedUrl: '/storage/uploads/candidate.png' },
      },
    });
    return row.get('id') as number;
  }

  it('append: adds to the end of the image set, converges status, audits as user', async () => {
    const { plugin, tables, repo } = makePlugin();
    const { productId, assetId } = await seedProductWithImage(repo, 'processed');
    const candidateId = await seedCandidate(repo, productId, assetId);
    const result = await adoptAsset(plugin, { assetId: candidateId, actorId: '7', traceId: 't-adopt' });

    expect(result).toMatchObject({ productId, role: 'detail', sort: 4 });
    const adopted = tables['aiListingMediaAssets'].find((r) => r.id === candidateId);
    expect(adopted).toMatchObject({ finalSelected: true, origin: 'ai_adopted', sort: 4 });
    expect(tables['aiListingProducts'][0].status).toBe('reviewing');
    expect(tables['aiListingAuditLogs'][0]).toMatchObject({
      actorType: 'user',
      actorId: '7',
      action: 'media.adopt',
      resourceId: productId,
    });
  });

  it('replace: discards the original (keeping the row) and inherits its role/sort with a snapshot', async () => {
    const { plugin, tables, repo } = makePlugin();
    const { productId, assetId } = await seedProductWithImage(repo);
    const candidateId = await seedCandidate(repo, productId, assetId);
    const result = await adoptAsset(plugin, {
      assetId: candidateId,
      mode: 'replace',
      replaceAssetId: assetId,
      actorId: '7',
      traceId: 't-replace',
    });

    expect(result).toMatchObject({ productId, role: 'detail', sort: 3, replacedAssetId: assetId });
    const original = tables['aiListingMediaAssets'].find((r) => r.id === assetId);
    expect(original).toMatchObject({ discarded: true });
    expect((original?.meta as Record<string, unknown>).replacedBy).toBe(candidateId);
    const audit = tables['aiListingAuditLogs'][0];
    expect(audit.oldValue).toMatchObject({ replacedAssetId: assetId });
    expect(audit.newValue).toMatchObject({ mode: 'replace' });
  });

  it('rejects when the product status is locked (same lock as saveFinal)', async () => {
    const { plugin, repo } = makePlugin();
    const { productId, assetId } = await seedProductWithImage(repo, 'reviewed');
    const candidateId = await seedCandidate(repo, productId, assetId);
    await expect(adoptAsset(plugin, { assetId: candidateId, actorId: '7', traceId: 't' })).rejects.toMatchObject({
      code: 'MEDIA_ADOPT_LOCKED',
    });
  });

  it('rejects non-candidate assets and discarded candidates', async () => {
    const { plugin, repo } = makePlugin();
    const { productId, assetId } = await seedProductWithImage(repo);
    await expect(adoptAsset(plugin, { assetId, actorId: '7', traceId: 't' })).rejects.toMatchObject({
      code: 'MEDIA_NOT_CANDIDATE',
    });
    const candidateId = await seedCandidate(repo, productId, assetId);
    await discardAsset(plugin, { assetId: candidateId, actorId: '7', traceId: 't' });
    await expect(adoptAsset(plugin, { assetId: candidateId, actorId: '7', traceId: 't' })).rejects.toMatchObject({
      code: 'MEDIA_CANDIDATE_DISCARDED',
    });
  });

  it('replace requires a valid target of the same product', async () => {
    const { plugin, repo } = makePlugin();
    const { productId, assetId } = await seedProductWithImage(repo);
    const candidateId = await seedCandidate(repo, productId, assetId);
    await expect(
      adoptAsset(plugin, { assetId: candidateId, mode: 'replace', actorId: '7', traceId: 't' }),
    ).rejects.toMatchObject({ code: 'MEDIA_REPLACE_TARGET_REQUIRED' });
    await expect(
      adoptAsset(plugin, { assetId: candidateId, mode: 'replace', replaceAssetId: 9999, actorId: '7', traceId: 't' }),
    ).rejects.toMatchObject({ code: 'MEDIA_REPLACE_TARGET_INVALID' });
  });
});

describe('discardAsset', () => {
  it('discards a candidate idempotently and audits once', async () => {
    const { plugin, tables, repo } = makePlugin();
    const { productId, assetId } = await seedProductWithImage(repo);
    const candidate = await repo('aiListingMediaAssets').create({
      values: { productId, assetType: 'image', origin: 'ai_candidate', parentAssetId: assetId },
    });
    const candidateId = candidate.get('id') as number;
    const first = await discardAsset(plugin, { assetId: candidateId, actorId: '7', traceId: 't' });
    expect(first.alreadyDiscarded).toBe(false);
    const second = await discardAsset(plugin, { assetId: candidateId, actorId: '7', traceId: 't' });
    expect(second.alreadyDiscarded).toBe(true);
    expect(tables['aiListingAuditLogs'].filter((a) => a.action === 'media.discard')).toHaveLength(1);
  });

  it('requires the editable lock when discarding an adopted asset', async () => {
    const { plugin, repo, tables } = makePlugin();
    const { productId, assetId } = await seedProductWithImage(repo, 'published');
    const adopted = await repo('aiListingMediaAssets').create({
      values: { productId, assetType: 'image', origin: 'ai_adopted', finalSelected: true, parentAssetId: assetId },
    });
    await expect(
      discardAsset(plugin, { assetId: adopted.get('id') as number, actorId: '7', traceId: 't' }),
    ).rejects.toMatchObject({ code: 'MEDIA_ADOPT_LOCKED' });
    expect(tables['aiListingMediaAssets'].find((r) => r.id === adopted.get('id'))?.discarded).toBeFalsy();
  });
});

// 撤销采纳(revertAdoptAsset):采纳的后悔药——候选回候选区,按最近一条 media.adopt 审计恢复被替换图/被顶视频
describe('revertAdoptAsset', () => {
  async function seedCandidate(repo: ReturnType<typeof makeDb>['repo'], productId: number, parentAssetId: number) {
    const row = await repo('aiListingMediaAssets').create({
      values: {
        productId,
        assetType: 'image',
        role: 'detail',
        origin: 'ai_candidate',
        finalSelected: false,
        discarded: false,
        parentAssetId,
        meta: { storedUrl: '/storage/uploads/candidate.png' },
      },
    });
    return row.get('id') as number;
  }

  it('reverts an append-adopt: candidate goes back to the pool and an adoptRevert audit is written', async () => {
    const { plugin, tables, repo } = makePlugin();
    const { productId, assetId } = await seedProductWithImage(repo, 'processed');
    const candidateId = await seedCandidate(repo, productId, assetId);
    await adoptAsset(plugin, { assetId: candidateId, actorId: '7', traceId: 't-adopt' });

    const result = await revertAdoptAsset(plugin, { assetId: candidateId, actorId: '7', traceId: 't-revert' });
    expect(result).toMatchObject({ productId, restoredAssetIds: [] });
    const cand = tables['aiListingMediaAssets'].find((r) => r.id === candidateId);
    expect(cand).toMatchObject({ finalSelected: false, origin: 'ai_candidate' });
    const revertAudit = tables['aiListingAuditLogs'].find((r) => r.action === 'media.adoptRevert');
    expect(revertAudit).toMatchObject({ actorType: 'user', actorId: '7', resourceId: productId });
  });

  it('reverts a replace-adopt: the replaced original is restored (undiscarded, replacedBy cleared)', async () => {
    const { plugin, tables, repo } = makePlugin();
    const { productId, assetId } = await seedProductWithImage(repo);
    const candidateId = await seedCandidate(repo, productId, assetId);
    await adoptAsset(plugin, {
      assetId: candidateId,
      mode: 'replace',
      replaceAssetId: assetId,
      actorId: '7',
      traceId: 't-replace',
    });

    const result = await revertAdoptAsset(plugin, { assetId: candidateId, actorId: '7', traceId: 't-revert' });
    expect(result.restoredAssetIds).toEqual([assetId]);
    const original = tables['aiListingMediaAssets'].find((r) => r.id === assetId);
    expect(original).toMatchObject({ discarded: false });
    expect((original?.meta as Record<string, unknown>).replacedBy).toBeUndefined();
    const cand = tables['aiListingMediaAssets'].find((r) => r.id === candidateId);
    expect(cand).toMatchObject({ finalSelected: false, origin: 'ai_candidate' });
  });

  it('reverts a video adopt: the displaced previously-adopted video is restored', async () => {
    const { plugin, tables, repo } = makePlugin();
    const { productId } = await seedProductWithImage(repo, 'processed');
    const prev = await repo('aiListingMediaAssets').create({
      values: { productId, assetType: 'video', role: 'video', origin: 'ai_adopted', finalSelected: true },
    });
    const candRow = await repo('aiListingMediaAssets').create({
      values: { productId, assetType: 'video', role: 'video', origin: 'ai_candidate', finalSelected: false },
    });
    const candId = candRow.get('id') as number;
    await adoptAsset(plugin, { assetId: candId, actorId: '7', traceId: 't-video' });
    expect(tables['aiListingMediaAssets'].find((r) => r.id === prev.get('id'))).toMatchObject({
      discarded: true,
      finalSelected: false,
    });

    const result = await revertAdoptAsset(plugin, { assetId: candId, actorId: '7', traceId: 't-revert' });
    expect(result.restoredAssetIds).toEqual([prev.get('id')]);
    expect(tables['aiListingMediaAssets'].find((r) => r.id === prev.get('id'))).toMatchObject({
      discarded: false,
      finalSelected: true,
    });
    expect(tables['aiListingMediaAssets'].find((r) => r.id === candId)).toMatchObject({
      finalSelected: false,
      origin: 'ai_candidate',
    });
  });

  it('rejects non-adopted assets and locked products', async () => {
    const { plugin, repo } = makePlugin();
    const { productId, assetId } = await seedProductWithImage(repo, 'processed');
    await expect(revertAdoptAsset(plugin, { assetId, actorId: '7', traceId: 't' })).rejects.toMatchObject({
      code: 'MEDIA_NOT_ADOPTED',
    });
    const adopted = await repo('aiListingMediaAssets').create({
      values: { productId, assetType: 'image', origin: 'ai_adopted', finalSelected: true },
    });
    await repo('aiListingProducts').update({ filterByTk: productId, values: { status: 'published' } });
    await expect(
      revertAdoptAsset(plugin, { assetId: adopted.get('id') as number, actorId: '7', traceId: 't' }),
    ).rejects.toMatchObject({ code: 'MEDIA_ADOPT_LOCKED' });
  });
});
