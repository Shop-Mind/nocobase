/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// W6 计价单测:默认价目锚点/算式(单价×张数×源图)/档位差异/未知场景回退/env 覆盖(含非法 JSON 兜底)/夹取。

import { describe, expect, it } from 'vitest';
import { DEFAULT_PRICING, estimateCost, resolvePricing } from '../pricing';

describe('estimateCost (W6)', () => {
  it('anchors match the researched price points', () => {
    expect(DEFAULT_PRICING.white_bg.basic).toBe(4);
    expect(DEFAULT_PRICING.scene_gen).toEqual({ basic: 10, advanced: 17 });
  });

  it('beans = unit × count × sources, with a full breakdown', () => {
    const res = estimateCost({ scene: 'scene_gen', tier: 'advanced', count: 2, sources: 3 }, '');
    expect(res.beans).toBe(17 * 2 * 3);
    expect(res.breakdown).toEqual({ scene: 'scene_gen', tier: 'advanced', unit: 17, count: 2, sources: 3, images: 6 });
  });

  it('tier changes the unit; unknown/missing scene falls back to default', () => {
    expect(estimateCost({ scene: 'scene_gen', tier: 'basic' }, '').beans).toBe(10);
    expect(estimateCost({ scene: 'nope' }, '').beans).toBe(DEFAULT_PRICING.default.basic);
    expect(estimateCost({}, '').breakdown.scene).toBe('default');
  });

  it('env override merges per scene and per tier; invalid JSON is ignored', () => {
    const env = '{"scene_gen":{"basic":12},"video":{"basic":40,"advanced":66}}';
    const pricing = resolvePricing(env);
    expect(pricing.scene_gen).toEqual({ basic: 12, advanced: 17 }); // 只覆盖 basic
    expect(pricing.video).toEqual({ basic: 40, advanced: 66 });
    expect(estimateCost({ scene: 'scene_gen' }, env).beans).toBe(12);
    expect(resolvePricing('not-json').scene_gen).toEqual(DEFAULT_PRICING.scene_gen);
  });

  it('clamps count and sources to sane ranges', () => {
    expect(estimateCost({ scene: 'white_bg', count: 0, sources: 0 }, '').breakdown.images).toBe(1);
    expect(estimateCost({ scene: 'white_bg', count: 99, sources: 99 }, '').breakdown).toMatchObject({
      count: 12,
      sources: 9,
    });
  });
});
