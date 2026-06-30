/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { describe, expect, it } from 'vitest';
import { matchKnowledge, scanBannedWords } from '../knowledge';

// Phase 10 知识库命中测试（关键词/规则兜底版）。覆盖：平台标题规范命中、平台过滤、类目/图片/违禁词命中、违禁词扫描、空输入。
describe('ai-listing knowledge base hit test', () => {
  it('命中 Shopee 标题规范', () => {
    const hits = matchKnowledge('Shopee 标题多长合适');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.map((h) => h.id)).toContain('kb-shopee-title');
    expect(hits[0].matchedTerms).toEqual(expect.arrayContaining(['shopee']));
  });

  it('platform 过滤：amazon 不应命中 shopee 专属条目', () => {
    const hits = matchKnowledge('标题规范', { platform: 'amazon' });
    const ids = hits.map((h) => h.id);
    expect(ids).toContain('kb-amazon-title');
    expect(ids).not.toContain('kb-shopee-title');
  });

  it('命中类目必填属性（通用条目，不受平台过滤影响）', () => {
    const hits = matchKnowledge('发布前要补全哪些类目属性', { platform: 'lazada' });
    expect(hits.map((h) => h.id)).toContain('kb-category-attrs');
  });

  it('命中主图/媒体规范', () => {
    const hits = matchKnowledge('主图白底水印要求');
    expect(hits.map((h) => h.id)).toContain('kb-image-rule');
  });

  it('命中按 score 降序排列', () => {
    const hits = matchKnowledge('Amazon 亚马逊 合规 认证');
    expect(hits.length).toBeGreaterThan(1);
    for (let i = 1; i < hits.length; i++) {
      expect(hits[i - 1].score).toBeGreaterThanOrEqual(hits[i].score);
    }
  });

  it('违禁词扫描命中绝对化/促销/保证类', () => {
    const found = scanBannedWords('全网最便宜 正品保证 清仓秒杀');
    const words = found.map((f) => f.word);
    expect(words).toEqual(expect.arrayContaining(['最', '正品保证', '清仓', '秒杀']));
  });

  it('违禁词扫描命中英文 absolute claim', () => {
    const found = scanBannedWords('the cheapest and best price, guaranteed');
    const words = found.map((f) => f.word);
    expect(words).toEqual(expect.arrayContaining(['cheapest', 'best price', 'guaranteed']));
  });

  it('空输入返回空命中', () => {
    expect(matchKnowledge('')).toEqual([]);
    expect(matchKnowledge('完全不相关的随机词xyz')).toEqual([]);
    expect(scanBannedWords('')).toEqual([]);
  });
});
