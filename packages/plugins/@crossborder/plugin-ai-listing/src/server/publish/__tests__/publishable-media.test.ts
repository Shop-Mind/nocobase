/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// 发布图集「采纳集优先」过滤单测:已采纳候选进发布、未采纳候选与弃用/被替换原图不进、历史 NULL discarded 不误滤。

import { describe, it, expect } from 'vitest';
import { selectPublishableMedia } from '../index';

type Row = Record<string, unknown>;
const wrap = (row: Row) => ({ get: (k: string) => row[k] });

describe('selectPublishableMedia 采纳集优先', () => {
  it('排除未采纳的 AI 候选,保留源图与已采纳候选,按入参顺序', () => {
    const rows = [
      { id: 1, origin: 'source', role: 'main', sort: 0 },
      { id: 2, origin: 'source', role: 'detail', sort: 1 },
      { id: 5, origin: 'ai_candidate', sort: 2 }, // 未采纳候选:不进
      { id: 6, origin: 'ai_adopted', finalSelected: true, sort: 3 }, // 采纳追加:进
    ].map(wrap);
    const out = selectPublishableMedia(rows).map((m) => m.get('id'));
    expect(out).toEqual([1, 2, 6]);
  });

  it('排除弃用资产(含被替换原图),历史 discarded=undefined/NULL 不误滤', () => {
    const rows = [
      { id: 1, origin: 'source', discarded: false }, // 显式 false:进
      { id: 2, origin: 'source' }, // 历史行无 discarded 字段:进
      { id: 3, origin: 'source', discarded: true }, // 被替换原图:不进
      { id: 4, origin: 'ai_adopted', finalSelected: true, discarded: false },
      { id: 5, origin: 'ai_adopted', finalSelected: true, discarded: true }, // 采纳后又弃用:不进
    ].map(wrap);
    const out = selectPublishableMedia(rows).map((m) => m.get('id'));
    expect(out).toEqual([1, 2, 4]);
  });

  it('空集与全候选集', () => {
    expect(selectPublishableMedia([])).toEqual([]);
    const allCandidates = [{ id: 1, origin: 'ai_candidate' }].map(wrap);
    expect(selectPublishableMedia(allCandidates)).toEqual([]);
  });
});
