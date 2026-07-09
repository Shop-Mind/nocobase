/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// 推荐提示词三级链单测:看图(视觉模型)→ 看标题(文本模型)→ 静态示例。
// 覆盖:视觉成功 basis=image;视觉挂了降级文本 basis=title(带商品标题);全挂 basis=static;
// env AI_LISTING_SUGGEST_MODEL 锁定;文本级 DeepSeek 优先;自由模式(无商品标题)不走文本级。

import { afterEach, describe, expect, it } from 'vitest';
import { suggestPrompts } from '../suggest';

type Row = Record<string, unknown> & { id: number };

interface FakeModel {
  value: string;
  capability?: { task?: string; input?: string[] };
}

function makeApp(opts: {
  services: Array<{ llmService: string; models: FakeModel[] }>;
  // 每模型的应答:字符串=成功返回该 JSON;Error=调用失败;缺省=调用失败
  answers: Record<string, string | Error>;
  productTitle?: string | null;
}) {
  const rows: Record<string, Row[]> = {
    aiListingMediaAssets: [
      {
        id: 1,
        productId: opts.productTitle === null ? null : 7,
        sourceUrl: 'https://cdn.example.com/p.jpg',
        meta: { storedUrl: 'https://cdn.example.com/p.jpg' },
      },
    ],
    aiListingProducts: [{ id: 7, titleOriginal: opts.productTitle || '' }],
  };
  const invoked: string[] = [];
  const app = {
    db: {
      getRepository: (name: string) => ({
        findOne: async ({ filterByTk }: { filterByTk: number }) => {
          const row = rows[name]?.find((r) => r.id === Number(filterByTk));
          return row ? { get: (k: string) => row[k] } : null;
        },
      }),
    },
    pm: {
      get: () => ({
        aiManager: {
          listAllEnabledModels: async () =>
            opts.services.map((s) => ({
              llmService: s.llmService,
              enabledModels: s.models.map((m) => ({ value: m.value, capability: m.capability })),
            })),
          getLLMService: async ({ model }: { model: string }) => ({
            provider: {
              invoke: async () => {
                invoked.push(model);
                const a = opts.answers[model];
                if (typeof a === 'string') return { content: a };
                throw a instanceof Error ? a : new Error('unavailable');
              },
            },
          }),
        },
      }),
    },
    logger: { warn: () => undefined },
  };
  return { app: app as never, invoked };
}

const VISION = { value: 'gpt-5.5', capability: { task: 'chat', input: ['text', 'image'] } };
const GROK_CHAT = { value: 'grok-4.20-0309-console', capability: { task: 'chat', input: ['text'] } };
const DEEPSEEK = { value: 'deepseek-v4-pro', capability: { task: 'chat', input: ['text'] } };

afterEach(() => {
  delete process.env.AI_LISTING_SUGGEST_MODEL;
});

describe('suggestPrompts 3-tier chain', () => {
  it('vision model succeeds → basis=image with model name', async () => {
    const { app } = makeApp({
      services: [{ llmService: 'svc', models: [VISION, DEEPSEEK] }],
      answers: { 'gpt-5.5': '["场景一的描述文案","场景二的描述文案","场景三的描述文案"]' },
      productTitle: '圣诞酒瓶套',
    });
    const res = await suggestPrompts(app, { assetId: 1, scene: 'scene_gen' });
    expect(res).toMatchObject({ basis: 'image', model: 'gpt-5.5', fallback: false });
    expect(res.prompts).toHaveLength(3);
  });

  it('vision fails → falls to a text model using the product title (basis=title)', async () => {
    const { app, invoked } = makeApp({
      services: [{ llmService: 'svc', models: [VISION, GROK_CHAT, DEEPSEEK] }],
      answers: {
        'gpt-5.5': new Error('503 auth_unavailable'),
        'deepseek-v4-pro': '["根据标题产出的场景一","场景二"]',
      },
      productTitle: '圣诞酒瓶套',
    });
    const res = await suggestPrompts(app, { assetId: 1, scene: 'scene_gen' });
    expect(res).toMatchObject({ basis: 'title', model: 'deepseek-v4-pro', fallback: false });
    // 文本级 DeepSeek 排在 grok 前(官方直连更稳)
    expect(invoked).toEqual(['gpt-5.5', 'deepseek-v4-pro']);
  });

  it('all models fail → static fallback (basis=static, fallback=true)', async () => {
    const { app } = makeApp({
      services: [{ llmService: 'svc', models: [VISION, DEEPSEEK] }],
      answers: {},
      productTitle: '圣诞酒瓶套',
    });
    const res = await suggestPrompts(app, { assetId: 1, scene: 'scene_gen' });
    expect(res).toMatchObject({ basis: 'static', model: null, fallback: true });
    expect(res.prompts.length).toBeGreaterThan(0);
  });

  it('free-mode asset without product skips the title tier and goes static', async () => {
    const { app, invoked } = makeApp({
      services: [{ llmService: 'svc', models: [VISION, DEEPSEEK] }],
      answers: { 'deepseek-v4-pro': '["不该被用到"]', 'gpt-5.5': new Error('down') },
      productTitle: null,
    });
    const res = await suggestPrompts(app, { assetId: 1, scene: 'scene_gen' });
    expect(res.basis).toBe('static');
    expect(invoked).toEqual(['gpt-5.5']); // 文本级因无标题被跳过
  });

  it('AI_LISTING_SUGGEST_MODEL pins a single model', async () => {
    process.env.AI_LISTING_SUGGEST_MODEL = 'grok-4.20-0309-console';
    const { app, invoked } = makeApp({
      services: [{ llmService: 'svc', models: [VISION, GROK_CHAT, DEEPSEEK] }],
      answers: { 'grok-4.20-0309-console': '["锁定模型产出的场景"]' },
      productTitle: '圣诞酒瓶套',
    });
    const res = await suggestPrompts(app, { assetId: 1, scene: 'scene_gen' });
    expect(res).toMatchObject({ basis: 'title', model: 'grok-4.20-0309-console' });
    expect(invoked).toEqual(['grok-4.20-0309-console']);
  });
});
