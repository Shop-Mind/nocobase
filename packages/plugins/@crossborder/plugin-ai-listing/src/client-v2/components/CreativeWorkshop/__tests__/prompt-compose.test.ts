/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// W5 prompt 组合单测:六项表单深化的注入正确性与互斥逻辑(换色多色/模特档位 vs 预置/翻译双开关/
// 擦除 chips 合并去重/场景图重排开关),以及从 doGenerate 迁移的既有组合(logo/material/selling_point)不回归。

import { describe, expect, it } from 'vitest';
import {
  composeInstruction,
  describeModelSpec,
  hasModelSpec,
  recolorInstructions,
  RECOLOR_COLORS,
} from '../prompt-compose';

describe('recolorInstructions (W5-1 多色批量)', () => {
  it('one instruction per color, region injected verbatim', () => {
    const out = recolorInstructions(' 红色的酒瓶套 ', ['藏青色', '军绿色']);
    expect(out).toEqual(['红色的酒瓶套换成藏青色', '红色的酒瓶套换成军绿色']);
  });
  it('preset palette has 12 distinct colors', () => {
    expect(new Set(RECOLOR_COLORS).size).toBe(12);
  });
});

describe('model_shot (W5-2 档位化)', () => {
  it('spec combo builds the model description with background', () => {
    expect(describeModelSpec({ race: '非裔黑人', gender: '女性', age: '青年', bg: '阳光海滩' })).toBe(
      '一位非裔黑人青年女性模特,气质自然,拍摄背景为阳光海滩',
    );
    expect(hasModelSpec({})).toBe(false);
    expect(hasModelSpec({ gender: '男性' })).toBe(true);
  });
  it('preset wins over spec; ref image wins over both; user text appended', () => {
    const spec = { race: '亚洲', gender: '女性' };
    expect(composeInstruction({ funcKey: 'model_shot', instruction: '', modelSpec: spec })).toBe(
      '一位亚洲女性模特,气质自然',
    );
    expect(
      composeInstruction({ funcKey: 'model_shot', instruction: '', modelPreset: '预置模特描述', modelSpec: spec }),
    ).toBe('预置模特描述');
    expect(composeInstruction({ funcKey: 'model_shot', instruction: '微笑', hasRefImage: true, modelSpec: spec })).toBe(
      '第二张图中的模特;微笑',
    );
  });
});

describe('translate (W5-3 保护开关)', () => {
  it('defaults: keep brand words, do not translate on-product text', () => {
    const out = composeInstruction({ funcKey: 'translate', instruction: '', keepBrandWords: true });
    expect(out).toContain('品牌名与商标词保留原文');
    expect(out).toContain('保持原样,不要翻译');
  });
  it('switches flip both constraints and keep user text first', () => {
    const out = composeInstruction({
      funcKey: 'translate',
      instruction: '语气正式',
      keepBrandWords: false,
      translateProductText: true,
    });
    expect(out.startsWith('语气正式;')).toBe(true);
    expect(out).not.toContain('品牌名与商标词保留原文');
    expect(out).toContain('也一并翻译');
  });
});

describe('erase (W5-5 元素勾选)', () => {
  it('merges chips with free text and dedupes', () => {
    expect(composeInstruction({ funcKey: 'erase', instruction: '水印', eraseTargets: ['水印', '品牌 Logo'] })).toBe(
      '水印、品牌 Logo',
    );
    expect(composeInstruction({ funcKey: 'erase', instruction: '', eraseTargets: ['文字'] })).toBe('文字');
  });
});

describe('scene_gen (W5-6 重排开关)', () => {
  it('default keeps original placement; relayout switch allows re-arranging', () => {
    expect(composeInstruction({ funcKey: 'scene_gen', instruction: '木桌上' })).toBe(
      '木桌上;严格保持商品原有的位置、比例与朝向',
    );
    expect(composeInstruction({ funcKey: 'scene_gen', instruction: '木桌上', sceneRelayout: true })).toContain(
      '可适当重新摆放商品位置',
    );
  });
});

describe('migrated combos stay intact (logo/material/selling_point)', () => {
  it('logo position + craft + extra', () => {
    expect(composeInstruction({ funcKey: 'logo', instruction: '小一点', logoPos: '左上角', craft: '烫金' })).toBe(
      '印在商品的左上角,采用烫金工艺;小一点',
    );
  });
  it('material with/without reference image', () => {
    expect(composeInstruction({ funcKey: 'material', instruction: '拉丝铝', hasRefImage: true })).toBe(
      '拉丝铝(材质参考第二张图)',
    );
    expect(composeInstruction({ funcKey: 'material', instruction: '拉丝铝' })).toBe('拉丝铝');
  });
  it('selling points joined with user text', () => {
    expect(
      composeInstruction({ funcKey: 'selling_point', instruction: '定制印花', pickedPoints: ['大容量', '环保帆布'] }),
    ).toBe('大容量 · 环保帆布 · 定制印花');
  });
});
