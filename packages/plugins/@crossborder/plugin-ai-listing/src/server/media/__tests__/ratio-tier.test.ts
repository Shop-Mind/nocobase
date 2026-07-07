/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// P2 单测:图片比例换算 ratioToSize + 模型档映射 resolveModelByTier(env 映射路径,不触达 app)。
import { afterEach, describe, expect, it } from 'vitest';
import { ratioToSize, resolveModelByTier } from '../service';

describe('ratioToSize', () => {
  it('方形与横竖比例换算为「宽*高」', () => {
    expect(ratioToSize('1:1')).toBe('1280*1280');
    expect(ratioToSize('16:9')).toBe('1280*720');
    expect(ratioToSize('9:16')).toBe('720*1280');
    expect(ratioToSize('4:5')).toBe('1024*1280');
    expect(ratioToSize('5:4')).toBe('1280*1024');
  });

  it('超宽 21:9 短边仍夹在 512 以上', () => {
    const s = ratioToSize('21:9');
    expect(s).toBe('1280*544');
    const [, h] = String(s).split('*').map(Number);
    expect(h).toBeGreaterThanOrEqual(512);
  });

  it('两边都是 16 的倍数且夹在 512~2048', () => {
    for (const r of ['1:1', '4:3', '3:4', '16:9', '9:16', '3:2', '2:3', '4:5', '5:4', '21:9']) {
      const size = ratioToSize(r);
      expect(size).toBeDefined();
      const [w, h] = String(size).split('*').map(Number);
      expect(w % 16).toBe(0);
      expect(h % 16).toBe(0);
      expect(w).toBeGreaterThanOrEqual(512);
      expect(h).toBeGreaterThanOrEqual(512);
      expect(w).toBeLessThanOrEqual(2048);
      expect(h).toBeLessThanOrEqual(2048);
    }
  });

  it('非法比例返回 undefined', () => {
    expect(ratioToSize('abc')).toBeUndefined();
    expect(ratioToSize('0:1')).toBeUndefined();
    expect(ratioToSize('16-9')).toBeUndefined();
    expect(ratioToSize('')).toBeUndefined();
  });
});

describe('resolveModelByTier(env 映射)', () => {
  afterEach(() => {
    delete process.env.AI_LISTING_MODEL_TIERS;
  });

  // env 命中时直接返回映射的 service:model,不触达 app(传一个会抛错的假 app 证明未被调用)
  const explodingApp = {
    pm: {
      get() {
        throw new Error('app should not be touched when env tier mapping hits');
      },
    },
  } as unknown as Parameters<typeof resolveModelByTier>[0];

  it('env 命中:basic/advanced 各映射到具体模型', async () => {
    process.env.AI_LISTING_MODEL_TIERS = JSON.stringify({
      basic: 'v_svc:qwen-image',
      advanced: 'v_svc:qwen-image-max',
    });
    expect(await resolveModelByTier(explodingApp, 'basic')).toEqual({ llmService: 'v_svc', model: 'qwen-image' });
    expect(await resolveModelByTier(explodingApp, 'advanced')).toEqual({
      llmService: 'v_svc',
      model: 'qwen-image-max',
    });
  });

  it('model 名本身含冒号:只在首个冒号切分', async () => {
    process.env.AI_LISTING_MODEL_TIERS = JSON.stringify({ basic: 'svc:ns:model-x' });
    expect(await resolveModelByTier(explodingApp, 'basic')).toEqual({ llmService: 'svc', model: 'ns:model-x' });
  });
});
