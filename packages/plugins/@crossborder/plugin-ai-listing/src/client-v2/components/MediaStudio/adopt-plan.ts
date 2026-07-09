/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// 批量采纳规划(纯函数,可单测):每张候选沿用快速采纳语义——有源图(parentAssetId/genParams.sourceAssetId
// 且源图仍在图集)→ 替换源图,否则追加。同一源图被多张候选盯上时只有第一张能替换(源图随即被移出最终集),
// 其余自动降级为追加,避免服务端 MEDIA_REPLACE_TARGET_INVALID。

import type { MediaAsset } from './types';

export interface AdoptPlanItem {
  assetId: number;
  mode: 'append' | 'replace';
  replaceAssetId?: number;
}

export function planBatchAdopt(candidates: MediaAsset[], gallery: MediaAsset[]): AdoptPlanItem[] {
  const usedTargets = new Set<number>();
  return candidates.map((cand) => {
    const srcId = cand.parentAssetId ?? cand.genParams?.sourceAssetId ?? null;
    const target = srcId ? gallery.find((g) => g.id === srcId && !g.discarded) : null;
    if (target && !usedTargets.has(target.id)) {
      usedTargets.add(target.id);
      return { assetId: cand.id, mode: 'replace' as const, replaceAssetId: target.id };
    }
    return { assetId: cand.id, mode: 'append' as const };
  });
}
