/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// 批量采纳规划:替换/追加语义、同源冲突降级、弃用源图不替换。

import { describe, expect, it } from 'vitest';
import { planBatchAdopt } from '../adopt-plan';
import type { MediaAsset } from '../types';

function asset(partial: Partial<MediaAsset> & { id: number }): MediaAsset {
  return {
    url: null,
    origin: 'ai_candidate',
    role: null,
    sort: null,
    finalSelected: false,
    discarded: false,
    parentAssetId: null,
    genParams: null,
    ...partial,
  } as MediaAsset;
}

describe('planBatchAdopt', () => {
  const gallery = [asset({ id: 1, origin: 'source' }), asset({ id: 2, origin: 'source' })];

  it('replaces the source when the candidate has one, appends otherwise', () => {
    const plan = planBatchAdopt([asset({ id: 10, parentAssetId: 1 }), asset({ id: 11, parentAssetId: null })], gallery);
    expect(plan).toEqual([
      { assetId: 10, mode: 'replace', replaceAssetId: 1 },
      { assetId: 11, mode: 'append' },
    ]);
  });

  it('degrades to append when two candidates target the same source (only the first replaces)', () => {
    const plan = planBatchAdopt(
      [asset({ id: 10, parentAssetId: 1 }), asset({ id: 11, parentAssetId: 1 }), asset({ id: 12, parentAssetId: 2 })],
      gallery,
    );
    expect(plan.map((p) => p.mode)).toEqual(['replace', 'append', 'replace']);
    expect(plan[2].replaceAssetId).toBe(2);
  });

  it('appends when the source is discarded or missing; honors genParams.sourceAssetId fallback', () => {
    const g = [asset({ id: 1, origin: 'source', discarded: true }), asset({ id: 3, origin: 'source' })];
    const plan = planBatchAdopt(
      [
        asset({ id: 10, parentAssetId: 1 }),
        asset({ id: 11, parentAssetId: null, genParams: { sourceAssetId: 3 } as MediaAsset['genParams'] }),
        asset({ id: 12, parentAssetId: 999 }),
      ],
      g,
    );
    expect(plan.map((p) => p.mode)).toEqual(['append', 'replace', 'append']);
    expect(plan[1].replaceAssetId).toBe(3);
  });
});
