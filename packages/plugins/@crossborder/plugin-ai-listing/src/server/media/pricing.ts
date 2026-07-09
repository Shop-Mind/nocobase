/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// i豆计价(W6):价目 + 估算 + 记账,不做余额扣减/拦截(商业化课题,日限额继续兜底)。
// 单价 = 每产出一张图的 i豆数,按 场景 × 档位;总价 = 单价 × 每源图张数 × 源图数。
// env AI_LISTING_MEDIA_PRICING(JSON,同构子集)可按场景覆盖,如 {"scene_gen":{"basic":12},"video":{"basic":40}}。

export interface ScenePrice {
  basic: number;
  advanced: number;
}

// 默认价目:锚点参照调研数据(白底 4、场景 basic 10/advanced 17),其余按功能算力/价值分层
export const DEFAULT_PRICING: Record<string, ScenePrice> = {
  white_bg: { basic: 4, advanced: 7 },
  scene_gen: { basic: 10, advanced: 17 },
  erase: { basic: 4, advanced: 7 },
  recolor: { basic: 8, advanced: 17 },
  logo: { basic: 8, advanced: 17 },
  model_shot: { basic: 10, advanced: 17 },
  hd: { basic: 2, advanced: 4 },
  detail: { basic: 6, advanced: 10 },
  custom: { basic: 6, advanced: 10 },
  translate: { basic: 2, advanced: 4 },
  material: { basic: 8, advanced: 17 },
  process: { basic: 8, advanced: 17 },
  selling_point: { basic: 8, advanced: 17 },
  expand: { basic: 3, advanced: 5 },
  // 无场景的自由生成(t2i/指令式缺省)
  default: { basic: 6, advanced: 10 },
  // 图生视频(秒数不分档,单条一口价的两档)
  video: { basic: 50, advanced: 80 },
};

// env 覆盖:JSON 解析失败静默忽略(计价绝不阻塞生成);按场景浅合并,允许只覆盖一个档
export function resolvePricing(
  env: string | undefined = process.env.AI_LISTING_MEDIA_PRICING,
): Record<string, ScenePrice> {
  const merged: Record<string, ScenePrice> = { ...DEFAULT_PRICING };
  if (!env?.trim()) return merged;
  try {
    const override = JSON.parse(env) as Record<string, Partial<ScenePrice>>;
    for (const [scene, price] of Object.entries(override)) {
      if (!price || typeof price !== 'object') continue;
      const base = merged[scene] || merged.default;
      merged[scene] = {
        basic: Number(price.basic) > 0 ? Number(price.basic) : base.basic,
        advanced: Number(price.advanced) > 0 ? Number(price.advanced) : base.advanced,
      };
    }
  } catch {
    // 非法 JSON → 用默认价目
  }
  return merged;
}

export interface EstimateInput {
  // 场景 key;空/未知回落 default;'video' = 图生视频
  scene?: string | null;
  tier?: 'basic' | 'advanced' | null;
  // 每源图张数(换色多色时=色数)
  count?: number;
  // 源图数(t2i 无源图按 1)
  sources?: number;
}

export interface EstimateResult {
  beans: number;
  breakdown: {
    scene: string;
    tier: 'basic' | 'advanced';
    // 单张价
    unit: number;
    count: number;
    sources: number;
    // 总张数 = count × sources
    images: number;
  };
}

export function estimateCost(input: EstimateInput, env?: string): EstimateResult {
  const pricing = resolvePricing(env);
  const scene = input.scene && pricing[input.scene] ? input.scene : 'default';
  const tier: 'basic' | 'advanced' = input.tier === 'advanced' ? 'advanced' : 'basic';
  const count = Math.min(Math.max(Number(input.count) || 1, 1), 12);
  const sources = Math.min(Math.max(Number(input.sources) || 1, 1), 9);
  const unit = pricing[scene][tier];
  const images = count * sources;
  return { beans: unit * images, breakdown: { scene, tier, unit, count, sources, images } };
}
