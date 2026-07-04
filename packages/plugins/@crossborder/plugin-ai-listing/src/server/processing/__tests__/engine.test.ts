/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { applyRule, cleanTitle, type RuleConfig } from '../engine';

describe('processing engine — 专业化规则', () => {
  const baseProduct = {
    id: 1,
    titleOriginal: 'Velvet Jewelry Pouch',
    descriptionOriginal: 'A nice pouch.',
    priceOriginal: 10,
    currencyOriginal: 'CNY',
    attributesOriginal: { Material: 'Velvet' },
  };
  const priceCfg: RuleConfig = {
    price: { fromCurrency: 'CNY', toCurrency: 'CNY', rate: 1, markupPct: 25, ending: '' },
  };

  describe('cleanTitle', () => {
    it('去批发噪声词与 emoji', () => {
      expect(cleanTitle('Hot Sale Wholesale Velvet Pouch ★ Free Shipping OEM')).toBe('Velvet Pouch');
    });

    it('英文重复词去堆砌（保留首次，大小写不敏感）', () => {
      expect(cleanTitle('Pouch Velvet pouch Bag Velvet POUCH')).toBe('Pouch Velvet Bag');
    });

    it('超过 128 字符按词边界截断', () => {
      const long = Array.from({ length: 40 }, (_, i) => `word${i}`).join(' ');
      const out = cleanTitle(long);
      expect(out.length).toBeLessThanOrEqual(128);
      expect(out.endsWith(' ')).toBe(false);
      // 不在词中间截断：最后一个 token 必须是完整的 wordN。
      expect(out.split(' ').pop()).toMatch(/^word\d+$/);
    });

    it('中文标题不做词级去重、不被误删', () => {
      expect(cleanTitle('新款绒布首饰袋 抽绳收纳袋')).toBe('新款绒布首饰袋 抽绳收纳袋');
    });
  });

  describe('价格转换保护', () => {
    it('币种一致时按 汇率 × 加价 计算', () => {
      const r = applyRule(baseProduct, priceCfg, [], 't');
      expect(r.patch.priceTarget).toBe(12.5); // 10 × 1 × 1.25
    });

    it('商品原币种与规则 fromCurrency 不一致时跳过汇率只加价（防二次换汇）', () => {
      const cfg: RuleConfig = { price: { fromCurrency: 'THB', toCurrency: 'USD', rate: 0.028, markupPct: 30 } };
      const r = applyRule({ ...baseProduct, currencyOriginal: 'USD', priceOriginal: 10 }, cfg, [], 't');
      expect(r.patch.priceTarget).toBe(13); // 10 × 1.3，rate 0.028 未应用
      const reason = r.changes.find((c) => c.field === 'priceTarget')?.reason || '';
      expect(reason).toContain('不一致');
    });

    it('尾数策略只对 ≥2 的价格生效（低价商品不被 .99 隐性抬价）', () => {
      const cfg: RuleConfig = {
        price: { fromCurrency: 'CNY', toCurrency: 'CNY', rate: 1, markupPct: 20, ending: '.99' },
      };
      const low = applyRule({ ...baseProduct, priceOriginal: 0.55 }, cfg, [], 't');
      expect(low.patch.priceTarget).toBe(0.66); // 不套尾数
      const high = applyRule({ ...baseProduct, priceOriginal: 10 }, cfg, [], 't');
      expect(high.patch.priceTarget).toBe(12.99); // floor(12) + .99
    });
  });

  describe('SKU 逐条定价', () => {
    it('有原价的 SKU 按同一规则生成目标价，无原价的跳过', () => {
      const r = applyRule(
        {
          ...baseProduct,
          skus: [
            { id: 11, priceOriginal: 4 },
            { id: 12, priceOriginal: null },
            { id: 13, priceOriginal: 8 },
          ],
        },
        priceCfg,
        [],
        't',
      );
      expect(r.skuPatches).toEqual([
        { id: 11, priceTarget: 5 },
        { id: 13, priceTarget: 10 },
      ]);
      expect(r.changes.some((c) => c.field === 'skus.priceTarget')).toBe(true);
    });

    it('无价格规则时不产出 skuPatches', () => {
      const r = applyRule({ ...baseProduct, skus: [{ id: 11, priceOriginal: 4 }] }, {}, [], 't');
      expect(r.skuPatches).toEqual([]);
    });
  });

  describe('描述建议剥离源站内嵌 FAQ 段', () => {
    it('详情尾部的 FAQ Q/A 列表不进 descriptionProcessed', () => {
      const desc =
        '产品亮点：非接触式测量，快速准确。环保包装，配有可重复使用的棉质抽绳袋，方便存放与携带，适合长期使用。\n' +
        'FAQs\nQ: 我们如何确保质量\nA: 我们严格控制每一个生产过程。\nQ: 我们可以提供什么服务?\nA: 接受 FOB、CIF、EXW。';
      const r = applyRule({ ...baseProduct, descriptionOriginal: desc }, priceCfg, [], 't');
      expect(String(r.patch.descriptionProcessed)).not.toContain('FAQ');
      expect(String(r.patch.descriptionProcessed)).toContain('产品亮点');
    });
  });

  describe('风险词扫描入 riskFlags', () => {
    it('标题/描述命中的违禁词写入 riskFlags 而不是自动删除', () => {
      const r = applyRule(
        { ...baseProduct, titleOriginal: '全网最低价首饰袋', descriptionOriginal: '正品保证，treatment 无关词' },
        priceCfg,
        [],
        't',
      );
      const flags = r.patch.riskFlags as Array<{ word: string; field: string }>;
      expect(flags.some((f) => f.word === '最' && f.field === 'title')).toBe(true);
      expect(flags.some((f) => f.word === '正品保证' && f.field === 'description')).toBe(true);
      // 标题本身不被改动（「最」不会被盲删）。
      expect(String(r.patch.titleProcessed)).toContain('最低价');
    });

    it('无命中时 riskFlags 为空数组（清掉历史扫描结果）', () => {
      const r = applyRule(baseProduct, priceCfg, [], 't');
      expect(r.patch.riskFlags).toEqual([]);
    });
  });

  describe('发布阶梯价生成（档数跟随源站）', () => {
    it('源站 4 档采购阶梯 → 逐档按同一规则加价生成 ladderTarget', () => {
      const r = applyRule(
        {
          ...baseProduct,
          priceOriginal: 10.01,
          ladderOriginal: [
            { minQuantity: 500, price: 10.01, currency: 'CNY' },
            { minQuantity: 1000, price: 8.65, currency: 'CNY' },
            { minQuantity: 5000, price: 7.3, currency: 'CNY' },
            { minQuantity: 10000, price: 5.95, currency: 'CNY' },
          ],
        },
        priceCfg,
        [],
        't',
      );
      expect(r.patch.ladderTarget).toEqual([
        { minQuantity: 500, price: 12.51 },
        { minQuantity: 1000, price: 10.81 },
        { minQuantity: 5000, price: 9.13 },
        { minQuantity: 10000, price: 7.44 },
      ]);
    });

    it('源站固定价（无阶梯或仅单档）不生成 ladderTarget，草稿保持固定价形态', () => {
      const none = applyRule(baseProduct, priceCfg, [], 't');
      expect(none.patch.ladderTarget).toBeUndefined();
      const single = applyRule(
        { ...baseProduct, ladderOriginal: [{ minQuantity: 2, price: 10, currency: 'CNY' }] },
        priceCfg,
        [],
        't',
      );
      expect(single.patch.ladderTarget).toBeUndefined();
    });

    it('源站阶梯乱序/含无效档时先过滤再按起订量升序生成', () => {
      const r = applyRule(
        {
          ...baseProduct,
          ladderOriginal: [
            { minQuantity: 1000, price: 8, currency: 'CNY' },
            { minQuantity: 0, price: 9, currency: 'CNY' },
            { minQuantity: 100, price: 10, currency: 'CNY' },
          ],
        },
        priceCfg,
        [],
        't',
      );
      expect(r.patch.ladderTarget).toEqual([
        { minQuantity: 100, price: 12.5 },
        { minQuantity: 1000, price: 10 },
      ]);
    });
  });
});
