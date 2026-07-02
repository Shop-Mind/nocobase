/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// Phase 10 知识库（关键词/规则命中兜底版）。
// 本实例 Postgres 无 pgvector 且无法安装，真 RAG（embedding + 向量库）暂不可用；
// 故知识库以「结构化条目 + 关键词/规则匹配」实现，供 Rena/Lena 命中（matchKnowledge）+ Mira/Toby 违禁词扫描（scanBannedWords）。
// 后续接入向量库时，可在不改调用方的前提下把 matchKnowledge 内部替换为向量检索（保持入参/出参结构）。

import { ALIBABA_TITLE_RULES } from '../shared/title-rules';

export type KnowledgeCategory = 'platform_rule' | 'category_rule' | 'title_norm' | 'banned_word' | 'market';

export interface KnowledgeEntry {
  id: string;
  category: KnowledgeCategory;
  platform?: string; // 适用平台（小写）；缺省表示通用
  title: string;
  keywords: string[]; // 命中关键词（小写匹配）
  content: string; // 命中后回给员工/用户的规则正文
}

export interface KnowledgeHit {
  id: string;
  category: KnowledgeCategory;
  platform?: string;
  title: string;
  snippet: string;
  matchedTerms: string[];
  score: number; // 0~1，命中强度
}

// 违禁/风险词库（跨境电商常见）：绝对化用语、医疗功效、夸大宣传、平台敏感词。
export const BANNED_WORDS: { word: string; reason: string }[] = [
  { word: '最', reason: '绝对化用语（最便宜/最好/最低价等），多数平台与广告法禁止' },
  { word: '第一', reason: '绝对化用语，需有权威佐证，平台普遍禁止' },
  { word: '国家级', reason: '绝对化/权威背书用语，禁止' },
  { word: '包邮', reason: '运费表述应由运费模板控制，标题写包邮易违规' },
  { word: '正品保证', reason: '保证类承诺，平台敏感，建议改为品牌授权/品类描述' },
  { word: '清仓', reason: '促销夸大词，部分平台限制' },
  { word: '秒杀', reason: '促销夸大词，部分平台限制' },
  { word: '治疗', reason: '医疗功效宣称，非医疗类目禁止' },
  { word: '抗癌', reason: '医疗功效宣称，禁止' },
  { word: '100%', reason: '绝对化比例宣称，需佐证，建议规避' },
  { word: 'cheapest', reason: 'absolute claim, prohibited by most marketplaces' },
  { word: 'best price', reason: 'absolute/superlative claim, avoid in titles' },
  { word: 'guaranteed', reason: 'guarantee wording is platform-sensitive' },
];

// 结构化知识条目：平台规则 / 类目规则 / 标题规范 / 目标市场。
export const KNOWLEDGE_ENTRIES: KnowledgeEntry[] = [
  {
    id: 'kb-shopee-title',
    category: 'title_norm',
    platform: 'shopee',
    title: 'Shopee 标题规范',
    keywords: ['shopee', '标题', 'title', '字数', '长度', '关键词'],
    content:
      'Shopee 标题建议 ≤ 100 字符，品类关键词前置；禁止绝对化用语与 emoji 堆砌；避免重复堆词，建议「品牌 + 品类 + 核心属性 + 适用场景」。',
  },
  {
    id: 'kb-shopee-rule',
    category: 'platform_rule',
    platform: 'shopee',
    title: 'Shopee 合规要点',
    keywords: ['shopee', '合规', '禁售', '违禁', 'rule', '类目'],
    content:
      'Shopee 禁售：仿牌、医疗器械、危险品；标题/详情禁绝对化用语；价格需含税策略一致；主图需白底无水印无文字角标。',
  },
  {
    id: 'kb-lazada-title',
    category: 'title_norm',
    platform: 'lazada',
    title: 'Lazada 标题规范',
    keywords: ['lazada', '标题', 'title', '字数', '长度'],
    content:
      'Lazada 标题建议 ≤ 255 字符，结构「品牌 + 产品类型 + 关键规格」；禁止促销词（清仓/秒杀）写入标题；属性需对应类目模板。',
  },
  {
    id: 'kb-amazon-title',
    category: 'title_norm',
    platform: 'amazon',
    title: 'Amazon 标题规范',
    keywords: ['amazon', '标题', 'title', '字数', '长度', '亚马逊'],
    content:
      'Amazon 标题建议 ≤ 200 字符，首字母大写（介词/冠词除外），禁止全大写、价格、促销语；建议「品牌 + 型号 + 品类 + 关键属性 + 数量」。',
  },
  {
    id: 'kb-amazon-compliance',
    category: 'platform_rule',
    platform: 'amazon',
    title: 'Amazon 合规要点',
    keywords: ['amazon', '亚马逊', '合规', '禁售', 'compliance', '认证'],
    content:
      'Amazon 强类目（电子/玩具/母婴）需对应认证（FCC/CE/CPC）；禁止医疗功效宣称；主图纯白底、商品占比≥85%、无水印无附加文字。',
  },
  {
    id: 'kb-temu-rule',
    category: 'platform_rule',
    platform: 'temu',
    title: 'Temu 合规与定价',
    keywords: ['temu', '合规', '定价', '价格', '审核'],
    content:
      'Temu 半托管/全托管对定价与时效敏感；标题简洁含核心关键词；禁绝对化与品牌侵权；图片需高清白底，建议多角度细节图。',
  },
  {
    id: 'kb-alibaba-rule',
    category: 'platform_rule',
    platform: 'alibaba',
    title: 'Alibaba.com 发布要点',
    keywords: ['alibaba', '阿里', '国际站', 'icbu', '关键词', '类目'],
    content:
      'Alibaba.com（ICBU）重关键词与类目属性完整度；标题英文、含行业词与长尾词；MOQ/规格/认证需填全；图片≥6 张，含场景与细节。',
  },
  {
    id: 'kb-alibaba-title',
    category: 'title_norm',
    platform: 'alibaba',
    title: 'Alibaba.com 商品标题官方规范',
    keywords: ['标题', 'title', '商品名称', '产品名称', 'alibaba', '国际站', '核心词', '堆砌', 'with', 'for'],
    content: ALIBABA_TITLE_RULES,
  },
  {
    id: 'kb-category-attrs',
    category: 'category_rule',
    title: '类目必填属性',
    keywords: ['类目', '属性', '参数', 'category', 'attribute', '必填'],
    content:
      '发布前需补全目标类目必填属性（如材质/尺寸/适用人群/认证）；缺失会导致发布阻断（CATEGORY_MISSING / FIELD_MISSING）。',
  },
  {
    id: 'kb-image-rule',
    category: 'platform_rule',
    title: '主图与媒体规范',
    keywords: ['主图', '图片', 'image', '白底', '水印', '媒体'],
    content:
      '主图建议纯白底、无水印、无促销角标、商品占比≥85%；缺主图会触发发布阻断（IMAGE_MISSING）；细节图建议覆盖规格/包装/使用场景。',
  },
  {
    id: 'kb-banned',
    category: 'banned_word',
    title: '违禁/风险词总则',
    keywords: ['违禁', '禁用', '风险词', '绝对化', '夸大', 'banned', '广告法'],
    content:
      '禁用绝对化用语（最/第一/国家级/100%）、医疗功效（治疗/抗癌）、保证类（正品保证/guaranteed）与促销夸大（清仓/秒杀）。详见违禁词库逐项。',
  },
  {
    id: 'kb-market-sea',
    category: 'market',
    platform: 'shopee',
    title: '东南亚市场定价建议',
    keywords: ['东南亚', '市场', '定价', '价格区间', 'sea', '本地'],
    content:
      '东南亚（Shopee/Lazada）价格敏感，建议对齐当地中位价 ±15%；善用满减/捆绑；标题含本地常用关键词，必要时本地化语言。',
  },
];

const lc = (s: unknown): string => String(s ?? '').toLowerCase();

/**
 * 关键词/规则命中：按 query（可选 platform）对结构化知识条目打分排序。
 * 评分 = 命中关键词数 / 条目关键词数；平台匹配加权；query 直接包含 title 词再加权。封顶 1。
 */
export function matchKnowledge(query: string, options?: { platform?: string; topK?: number }): KnowledgeHit[] {
  const q = lc(query);
  if (!q.trim()) return [];
  const platform = options?.platform ? lc(options.platform) : undefined;
  const topK = options?.topK ?? 5;

  const hits: KnowledgeHit[] = [];
  for (const e of KNOWLEDGE_ENTRIES) {
    // 平台过滤：若指定平台，仅保留通用条目或同平台条目。
    if (platform && e.platform && e.platform !== platform) continue;

    const matchedTerms = e.keywords.filter((k) => q.includes(lc(k)));
    if (matchedTerms.length === 0) continue;

    let score = matchedTerms.length / Math.max(e.keywords.length, 1);
    if (platform && e.platform === platform) score += 0.25; // 平台精确匹配加权
    if (q.includes(lc(e.title))) score += 0.25;
    score = Math.min(1, score);

    hits.push({
      id: e.id,
      category: e.category,
      platform: e.platform,
      title: e.title,
      snippet: e.content,
      matchedTerms,
      score: Number(score.toFixed(3)),
    });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, topK);
}

/** 违禁/风险词扫描：返回文本中命中的违禁词及原因。 */
export function scanBannedWords(text: string): { word: string; reason: string }[] {
  const t = lc(text);
  if (!t.trim()) return [];
  return BANNED_WORDS.filter((b) => t.includes(lc(b.word)));
}
