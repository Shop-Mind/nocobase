/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { describe, it, expect } from 'vitest';
import { runPrecheck, type PrecheckInput } from '../precheck';

// 一个「除了被测规则外全部合规」的基线输入，便于隔离单条规则。
function baseInput(overrides: Partial<PrecheckInput> = {}): PrecheckInput {
  return {
    product: {
      titleFinal: 'Stainless Steel Insulated Water Bottle 1L',
      priceTarget: 18,
      stock: 210,
      categoryTargetId: 'LAZ-1001',
      attributes: { 材质: '不锈钢', 容量: '1L' },
      ...(overrides.product || {}),
    },
    skus: overrides.skus ?? [],
    hasMainImage: overrides.hasMainImage ?? true,
    imageCount: overrides.imageCount ?? 3,
    config: overrides.config ?? { targetStoreId: 1, categoryTargetId: 'LAZ-1001' },
  };
}

describe('runPrecheck 商品属性必填规则', () => {
  it('属性齐全时通过（无 PUBLISH_ATTRIBUTES_MISSING）', () => {
    const { ready, issues } = runPrecheck(baseInput());
    expect(ready).toBe(true);
    expect(issues.some((i) => i.code === 'PUBLISH_ATTRIBUTES_MISSING')).toBe(false);
  });

  it('属性为空对象 {} 时阻断', () => {
    const { ready, issues } = runPrecheck(baseInput({ product: { attributes: {} } }));
    expect(ready).toBe(false);
    const attr = issues.find((i) => i.code === 'PUBLISH_ATTRIBUTES_MISSING');
    expect(attr).toBeDefined();
    expect(attr?.level).toBe('block');
  });

  it('属性为 null 时阻断', () => {
    const { issues } = runPrecheck(baseInput({ product: { attributes: null } }));
    expect(issues.some((i) => i.code === 'PUBLISH_ATTRIBUTES_MISSING' && i.level === 'block')).toBe(true);
  });

  it('属性值全为空白字符串时按空处理并阻断', () => {
    const { issues } = runPrecheck(baseInput({ product: { attributes: { 材质: '', 颜色: '   ' } } }));
    expect(issues.some((i) => i.code === 'PUBLISH_ATTRIBUTES_MISSING')).toBe(true);
  });

  it('主图缺失与属性缺失可同时作为独立阻断项', () => {
    const { ready, issues } = runPrecheck(
      baseInput({ product: { attributes: {} }, hasMainImage: false, imageCount: 0 }),
    );
    expect(ready).toBe(false);
    expect(issues.some((i) => i.code === 'PUBLISH_ATTRIBUTES_MISSING')).toBe(true);
    expect(issues.some((i) => i.code === 'PUBLISH_IMAGE_MISSING')).toBe(true);
  });
});
