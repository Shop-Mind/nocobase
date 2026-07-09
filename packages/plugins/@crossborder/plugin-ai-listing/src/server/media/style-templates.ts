/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// 风格模版服务层(W2):list(scene/category/source 过滤 + 类目聚合 + 按商品推荐类目)/ save(user 模版)/
// delete(仅本人的 user 模版)。类目推荐 = 商品标题/类目文本关键词匹配,不命中落「通用」;VL 看图推荐在 backlog。

import type { Application } from '@nocobase/server';
import { MediaServiceError } from './service';

// 类目注册表:key 入库,展示名由前端 i18n 映射(label 为 en 键);keywords 用于商品文本 → 类目自动推荐
export const STYLE_TEMPLATE_CATEGORIES: Array<{ key: string; label: string; keywords: string[] }> = [
  {
    key: 'festive',
    label: 'Festive & Gifts',
    keywords: [
      '圣诞',
      'christmas',
      'xmas',
      '新年',
      'new year',
      '万圣',
      'halloween',
      '节日',
      '礼品',
      '礼盒',
      'gift',
      'holiday',
      '装饰',
      'ornament',
      '复活节',
      'easter',
      '情人节',
      'valentine',
    ],
  },
  {
    key: 'bags',
    label: 'Bags & Luggage',
    keywords: [
      '包',
      'bag',
      'backpack',
      'handbag',
      '钱包',
      'wallet',
      '行李',
      'luggage',
      'suitcase',
      'tote',
      '斜挎',
      '手提',
      'pouch',
    ],
  },
  {
    key: 'home',
    label: 'Home & Storage',
    keywords: [
      '收纳',
      '家居',
      'home',
      'storage',
      'organizer',
      '置物',
      '衣架',
      'hanger',
      '厨房',
      'kitchen',
      '浴室',
      'bathroom',
      '挂钩',
      'hook',
      '篮',
      'basket',
      '毯',
      'blanket',
      '抱枕',
      'pillow',
    ],
  },
  {
    key: 'food',
    label: 'Food & Beverage',
    keywords: [
      '食品',
      'food',
      '饮料',
      'beverage',
      'drink',
      '零食',
      'snack',
      '茶',
      'tea',
      '咖啡',
      'coffee',
      '酒',
      'wine',
      'beer',
      '糖果',
      'candy',
      '巧克力',
      'chocolate',
    ],
  },
  {
    key: 'apparel',
    label: 'Apparel & Accessories',
    keywords: [
      '服饰',
      '服装',
      'apparel',
      'clothing',
      'wear',
      '帽',
      'hat',
      'cap',
      '围巾',
      'scarf',
      '手套',
      'glove',
      '袜',
      'sock',
      '珠宝',
      'jewelry',
      '项链',
      'necklace',
      '耳环',
      'earring',
      '手链',
      'bracelet',
      '饰品',
    ],
  },
  {
    key: 'industrial',
    label: 'Industrial & Tools',
    keywords: [
      '工具',
      'tool',
      '工业',
      'industrial',
      '五金',
      'hardware',
      '机械',
      'machine',
      '电动',
      'drill',
      '扳手',
      'wrench',
      '轴承',
      'bearing',
      '阀',
      'valve',
    ],
  },
  { key: 'general', label: 'General', keywords: [] },
];

// 商品文本 → 类目 key:加权评分制。多字关键词(如「圣诞」「食品」)计 2 分,单字泛词(如「包」「酒」)计 1 分,
// 防止「食品真空包装机」被单字「包」抢进包袋;同分按注册表顺序(festive 最前,「圣诞酒瓶套」命中节日而非食品)。
// 不命中回落 general。
export function recommendCategory(text: string): string {
  const lower = String(text || '').toLowerCase();
  if (!lower.trim()) return 'general';
  let best = 'general';
  let bestScore = 0;
  for (const cat of STYLE_TEMPLATE_CATEGORIES) {
    let score = 0;
    for (const kw of cat.keywords) {
      if (lower.includes(kw.toLowerCase())) score += kw.length >= 2 ? 2 : 1;
    }
    if (score > bestScore) {
      best = cat.key;
      bestScore = score;
    }
  }
  return best;
}

export interface StyleTemplateRow {
  id: number;
  title: string;
  category: string;
  scene: string;
  prompt: string;
  thumbUrl: string | null;
  source: 'builtin' | 'user';
  sort: number;
}

interface RepoRow {
  get: (k: string) => unknown;
}

function mapTemplate(row: RepoRow): StyleTemplateRow {
  return {
    id: Number(row.get('id')),
    title: String(row.get('title') || ''),
    category: String(row.get('category') || 'general'),
    scene: String(row.get('scene') || 'scene_gen'),
    prompt: String(row.get('prompt') || ''),
    thumbUrl: (row.get('thumbUrl') as string) || null,
    source: row.get('source') === 'user' ? 'user' : 'builtin',
    sort: Number(row.get('sort')) || 0,
  };
}

export interface ListStyleTemplatesInput {
  scene?: string;
  category?: string;
  source?: 'builtin' | 'mine';
  userId?: number;
  // 商品文本(标题+类目),动作层从商品行拼好传入;用于推荐类目
  productText?: string;
}

export interface ListStyleTemplatesResult {
  templates: StyleTemplateRow[];
  mine: StyleTemplateRow[];
  categories: Array<{ key: string; label: string; count: number }>;
  recommended: string;
}

// 一次拉全:builtin(可按 category 过滤)+ mine + 类目聚合 + 推荐类目。数据量小(内置 ~40 条),不分页。
export async function listStyleTemplates(
  app: Application,
  input: ListStyleTemplatesInput,
): Promise<ListStyleTemplatesResult> {
  const repo = app.db.getRepository('aiListingStyleTemplates');
  const scene = input.scene || 'scene_gen';
  const builtinRows = await repo.find({ filter: { scene, source: 'builtin', enabled: true }, sort: ['sort', 'id'] });
  const builtin = builtinRows.map(mapTemplate);
  const mineRows = input.userId
    ? await repo.find({ filter: { scene, source: 'user', createdById: input.userId }, sort: ['sort', 'id'] })
    : [];
  const mine = mineRows.map(mapTemplate);
  // 类目聚合只统计 builtin(自定义模版不参与类目导航),按注册表顺序、只列非空类目
  const categories = STYLE_TEMPLATE_CATEGORIES.map((c) => ({
    key: c.key,
    label: c.label,
    count: builtin.filter((tpl) => tpl.category === c.key).length,
  })).filter((c) => c.count > 0);
  const recommended = recommendCategory(input.productText || '');
  let templates = input.source === 'mine' ? mine : builtin;
  if (input.category) templates = templates.filter((tpl) => tpl.category === input.category);
  return { templates, mine, categories, recommended };
}

export interface SaveStyleTemplateInput {
  title?: string;
  category?: string;
  scene?: string;
  prompt?: string;
  thumbUrl?: string;
  userId: number;
}

// 保存自定义模版(W3「保存为模版」也走这里):source=user + createdById,类目不合法回落 general
export async function saveStyleTemplate(app: Application, input: SaveStyleTemplateInput): Promise<StyleTemplateRow> {
  const title = String(input.title || '').trim();
  const prompt = String(input.prompt || '').trim();
  if (!title) throw new MediaServiceError('MEDIA_TEMPLATE_TITLE_REQUIRED', '模版标题不能为空');
  if (!prompt) throw new MediaServiceError('MEDIA_TEMPLATE_PROMPT_REQUIRED', '模版提示词不能为空');
  if (prompt.length > 500) throw new MediaServiceError('MEDIA_TEMPLATE_PROMPT_TOO_LONG', '模版提示词不能超过 500 字');
  if (!input.userId) throw new MediaServiceError('MEDIA_TEMPLATE_NO_USER', '缺少当前用户');
  const category = STYLE_TEMPLATE_CATEGORIES.some((c) => c.key === input.category) ? input.category : 'general';
  const repo = app.db.getRepository('aiListingStyleTemplates');
  const row = await repo.create({
    values: {
      title: title.slice(0, 60),
      category,
      scene: input.scene || 'scene_gen',
      prompt,
      thumbUrl: input.thumbUrl || null,
      source: 'user',
      createdById: input.userId,
      sort: 0,
      enabled: true,
    },
  });
  return mapTemplate(row);
}

// 删除自定义模版:只能删自己的 user 模版;builtin/他人模版一律拒绝
export async function deleteStyleTemplate(
  app: Application,
  input: { id: number; userId: number },
): Promise<{ deleted: true; id: number }> {
  const repo = app.db.getRepository('aiListingStyleTemplates');
  const row = await repo.findOne({ filterByTk: input.id });
  if (!row) throw new MediaServiceError('MEDIA_TEMPLATE_NOT_FOUND', `未找到模版 ${input.id}`);
  if (row.get('source') !== 'user' || Number(row.get('createdById')) !== Number(input.userId)) {
    throw new MediaServiceError('MEDIA_TEMPLATE_FORBIDDEN', '只能删除自己创建的模版');
  }
  await repo.destroy({ filterByTk: input.id });
  return { deleted: true, id: input.id };
}
