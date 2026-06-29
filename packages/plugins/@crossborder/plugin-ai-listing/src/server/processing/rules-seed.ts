/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import type Plugin from '../plugin';

// Phase 6 默认处理规则种子（PRD §5.3 / §10.2 规则卡片）。幂等：按 ruleCode 存在则跳过。
// config 承载翻译 / 价格 / 媒体处理配置；mappingRows 为替换映射表；promptTemplate 供后续真实 AI 节点使用。
export const ruleSeeds = [
  {
    ruleCode: 'shopee_to_lazada_sea',
    name: 'Shopee → Lazada 东南亚',
    ruleType: 'info',
    sourcePlatform: 'Shopee',
    targetPlatform: 'Lazada',
    enabled: true,
    config: {
      targetPlatform: 'Lazada',
      translate: { enabled: true, sourceLang: 'th', targetLang: 'en' },
      price: { fromCurrency: 'THB', toCurrency: 'USD', rate: 0.028, markupPct: 30, ending: '.99' },
      media: { jobs: ['remove_watermark', 'white_bg'] },
    },
    mappingRows: [
      { source: 'Material', match: '*', target: '材质', replace: '', type: 'attr' },
      { source: 'Brand', match: 'OEM', target: 'Brand', replace: 'No Brand', type: 'attr' },
    ],
    promptTemplate:
      '你是东南亚跨境选品的信息整理员。请把以下商品标题、描述、属性清洗并本地化为 Lazada 适用的英文，输出建议值，不要编造品牌与功效词。',
  },
  {
    ruleCode: 'amazon_to_temu_us',
    name: 'Amazon → Temu 美国',
    ruleType: 'info',
    sourcePlatform: 'Amazon',
    targetPlatform: 'Temu',
    enabled: true,
    config: {
      targetPlatform: 'Temu',
      translate: { enabled: false },
      price: { fromCurrency: 'USD', toCurrency: 'USD', rate: 1, markupPct: 15, ending: '.99' },
      media: { jobs: ['white_bg', 'crop'] },
    },
    mappingRows: [{ source: 'Brand', match: '*', target: 'Brand', replace: 'Generic', type: 'attr' }],
    promptTemplate: '你是美国市场的信息整理员。请把商品文案改写为 Temu 风格的简洁卖点，价格按规则换算，输出建议值。',
  },
  {
    ruleCode: 'generic_quick',
    name: '通用快速处理',
    ruleType: 'info',
    sourcePlatform: '*',
    targetPlatform: '*',
    enabled: true,
    config: {
      translate: { enabled: false },
      price: { fromCurrency: 'USD', toCurrency: 'USD', rate: 1, markupPct: 20, ending: '.99' },
      media: { jobs: ['white_bg'] },
    },
    mappingRows: [],
    promptTemplate: '通用规则：清洗标题与描述，按 20% 加价生成目标价，输出建议值供人工审核。',
  },
];

// 在插件 install() 中调用：幂等创建默认规则。
export async function seedRules(plugin: Plugin): Promise<void> {
  const Rules = plugin.app.db.getRepository('aiListingRules');
  for (const seed of ruleSeeds) {
    const existing = await Rules.findOne({ filter: { ruleCode: seed.ruleCode } });
    if (existing) continue;
    await Rules.create({ values: seed });
  }
}
