/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { describe, it, expect } from 'vitest';
import { normalizeBulkFields, computeFieldDiffs, BULK_LOCKED_STATUS } from '../index';

describe('normalizeBulkFields 字段白名单 + 值归一化', () => {
  it('接受合法字段并归一化', () => {
    const patch = normalizeBulkFields({
      targetPlatform: ' Lazada ',
      stock: '30',
      priority: 'high',
      tags: [' 爆款 ', '东南亚'],
    });
    expect(patch).toEqual({ targetPlatform: 'Lazada', stock: 30, priority: 'high', tags: ['爆款', '东南亚'] });
  });

  it('丢弃未在白名单里的字段（防越权写入）', () => {
    const patch = normalizeBulkFields({ titleFinal: '恶意', status: 'published', id: 9, targetPlatform: 'Shopee' });
    expect(patch).toEqual({ targetPlatform: 'Shopee' });
  });

  it('非法优先级被丢弃', () => {
    expect(normalizeBulkFields({ priority: 'urgent' })).toEqual({});
    expect(normalizeBulkFields({ priority: 'low' })).toEqual({ priority: 'low' });
  });

  it('负库存/非数字库存被丢弃，小数取整', () => {
    expect(normalizeBulkFields({ stock: -5 })).toEqual({});
    expect(normalizeBulkFields({ stock: 'abc' })).toEqual({});
    expect(normalizeBulkFields({ stock: 12.9 })).toEqual({ stock: 12 });
    expect(normalizeBulkFields({ stock: 0 })).toEqual({ stock: 0 });
  });

  it('tags 清洗空白项；空对象返回空 patch', () => {
    expect(normalizeBulkFields({ tags: ['', '  ', 'a'] })).toEqual({ tags: ['a'] });
    expect(normalizeBulkFields({})).toEqual({});
    expect(normalizeBulkFields({ targetPlatform: '   ' })).toEqual({});
  });
});

describe('computeFieldDiffs 只挑实际有变化的字段', () => {
  it('相同值不产生 diff，不同值产生 diff', () => {
    const diffs = computeFieldDiffs(
      { targetPlatform: 'Lazada', priority: 'low' },
      { targetPlatform: 'Lazada', priority: 'high' },
    );
    expect(diffs).toEqual([{ field: 'priority', old: 'low', val: 'high' }]);
  });

  it('null/undefined 旧值与新值不同时产生 diff（old 归一为 null）', () => {
    const diffs = computeFieldDiffs(
      { targetPlatform: undefined, tags: null },
      { targetPlatform: 'Shopee', tags: ['x'] },
    );
    expect(diffs).toEqual([
      { field: 'targetPlatform', old: null, val: 'Shopee' },
      { field: 'tags', old: null, val: ['x'] },
    ]);
  });

  it('数组/对象按值比较（顺序相同视为无变化）', () => {
    expect(computeFieldDiffs({ tags: ['a', 'b'] }, { tags: ['a', 'b'] })).toEqual([]);
    expect(computeFieldDiffs({ tags: ['a'] }, { tags: ['a', 'b'] })).toHaveLength(1);
  });
});

describe('BULK_LOCKED_STATUS 锁定状态', () => {
  it('发布中/已发布锁定，其余可编辑', () => {
    expect(BULK_LOCKED_STATUS.includes('published')).toBe(true);
    expect(BULK_LOCKED_STATUS.includes('publishing')).toBe(true);
    expect(BULK_LOCKED_STATUS.includes('processed')).toBe(false);
    expect(BULK_LOCKED_STATUS.includes('reviewed')).toBe(false);
  });
});
