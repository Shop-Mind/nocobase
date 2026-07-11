/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { describe, expect, it } from 'vitest';
import { shouldShortCircuitBatch } from '../../publish';
import { computeStockFallback, NEXT_ACTIONS } from '../quick-transfer-nodes';

describe('QT4 幂等层①短路语义：只短路非失败批次', () => {
  it('成功批次短路（防重复点击重复发布）', () => {
    expect(shouldShortCircuitBatch('success')).toBe(true);
  });

  it('运行中批次短路（同 key 并发重入会双发）', () => {
    expect(shouldShortCircuitBatch('running')).toBe(true);
  });

  it('全跳过批次短路（重跑结果相同，避免空批次堆积）', () => {
    expect(shouldShortCircuitBatch('skipped')).toBe(true);
  });

  it('失败批次放行真重试', () => {
    expect(shouldShortCircuitBatch('failed')).toBe(false);
  });

  it('部分失败批次放行真重试（成功商品由幂等层②跳过）', () => {
    expect(shouldShortCircuitBatch('partial_failed')).toBe(false);
  });
});

describe('QT4 缺省库存兜底判定 computeStockFallback', () => {
  it('商品已有库存 → 不动（返回 null）', () => {
    expect(computeStockFallback(15000, 500)).toBeNull();
    expect(computeStockFallback(1, 500)).toBeNull();
  });

  it('无库存 + 配置了正整数缺省值 → 返回缺省值', () => {
    expect(computeStockFallback(null, 500)).toBe(500);
    expect(computeStockFallback(0, 500)).toBe(500);
    expect(computeStockFallback(undefined, 500)).toBe(500);
  });

  it('无库存 + 缺省关闭（null/0/未配置）→ 返回 null（行为与历史一致）', () => {
    expect(computeStockFallback(null, null)).toBeNull();
    expect(computeStockFallback(0, 0)).toBeNull();
    expect(computeStockFallback(null, undefined)).toBeNull();
  });

  it('非法配置值（负数/NaN/字符串垃圾）→ 不兜底', () => {
    expect(computeStockFallback(null, -5)).toBeNull();
    expect(computeStockFallback(null, 'abc')).toBeNull();
  });

  it('小数配置向下取整', () => {
    expect(computeStockFallback(null, 99.9)).toBe(99);
  });
});

describe('QT4 errorCode → 下一步指引映射', () => {
  it('核心失败码都有中文指引', () => {
    for (const code of [
      'QUICK_URL_REQUIRED',
      'QUICK_DUPLICATE_URL',
      'PUBLISH_STOCK_INVALID',
      'PUBLISH_STORE_NOT_SELECTED',
      'NO_RULE_AVAILABLE',
      'OPENAPI_NOT_CONNECTED',
      'VALIDATION_REQUIRED_FIELD_MISSING',
    ]) {
      expect(NEXT_ACTIONS[code], code).toBeTruthy();
    }
  });
});
