/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// W2 风格模版单测:种子幂等(跑两次不重复)、list 按 scene/category/source 过滤 + 类目聚合 + 推荐类目、
// save 建 user 模版(非法类目落 general)、delete 只能删自己的 user 模版。全部内存仓库,不触数据库。

import { describe, expect, it } from 'vitest';
import { STYLE_TEMPLATE_SEEDS, seedStyleTemplates } from '../style-templates-seed';
import {
  STYLE_TEMPLATE_CATEGORIES,
  deleteStyleTemplate,
  listStyleTemplates,
  recommendCategory,
  saveStyleTemplate,
} from '../style-templates';

type Row = Record<string, unknown> & { id: number };

function makeApp() {
  const rows: Row[] = [];
  let nextId = 1;
  const wrap = (row: Row) => ({ get: (k: string) => row[k] });
  const matches = (row: Row, filter: Record<string, unknown> = {}) =>
    Object.entries(filter).every(([k, v]) => row[k] === v);
  const repo = {
    async find({ filter }: { filter?: Record<string, unknown> } = {}) {
      return rows
        .filter((r) => matches(r, filter))
        .sort((a, b) => Number(a.sort ?? 0) - Number(b.sort ?? 0) || a.id - b.id)
        .map(wrap);
    },
    async findOne({ filterByTk, filter }: { filterByTk?: number; filter?: Record<string, unknown> }) {
      const row =
        filterByTk != null ? rows.find((r) => r.id === Number(filterByTk)) : rows.find((r) => matches(r, filter));
      return row ? wrap(row) : null;
    },
    async create({ values }: { values: Record<string, unknown> }) {
      const row: Row = { id: nextId++, ...values };
      rows.push(row);
      return wrap(row);
    },
    async destroy({ filterByTk }: { filterByTk: number }) {
      const idx = rows.findIndex((r) => r.id === Number(filterByTk));
      if (idx >= 0) rows.splice(idx, 1);
    },
  };
  const app = {
    db: { getRepository: () => repo },
    logger: { info: () => undefined, warn: () => undefined },
  };
  return { app: app as never, rows };
}

describe('style templates (W2)', () => {
  it('seeds are ≥36 across 7 categories and seeding twice never duplicates', async () => {
    const { app, rows } = makeApp();
    expect(STYLE_TEMPLATE_SEEDS.length).toBeGreaterThanOrEqual(36);
    const catKeys = new Set(STYLE_TEMPLATE_SEEDS.map((s) => s.category));
    expect(catKeys.size).toBe(7);
    // 每条种子的类目都必须在注册表里,否则前端类目导航显示不出来
    for (const s of STYLE_TEMPLATE_SEEDS) {
      expect(STYLE_TEMPLATE_CATEGORIES.some((c) => c.key === s.category)).toBe(true);
      expect(s.prompt.length).toBeLessThanOrEqual(500);
    }
    const first = await seedStyleTemplates(app);
    expect(first.created).toBe(STYLE_TEMPLATE_SEEDS.length);
    const second = await seedStyleTemplates(app);
    expect(second.created).toBe(0);
    expect(second.skipped).toBe(STYLE_TEMPLATE_SEEDS.length);
    expect(rows.length).toBe(STYLE_TEMPLATE_SEEDS.length);
  });

  it('list filters by scene/category/source, aggregates categories and recommends by product text', async () => {
    const { app } = makeApp();
    await seedStyleTemplates(app);
    await saveStyleTemplate(app, { title: '我的模版', category: 'bags', prompt: '自定义提示词', userId: 7 });

    const all = await listStyleTemplates(app, { scene: 'scene_gen', userId: 7 });
    expect(all.templates.length).toBe(STYLE_TEMPLATE_SEEDS.length); // builtin 不含 user
    expect(all.mine.length).toBe(1);
    expect(all.categories.reduce((n, c) => n + c.count, 0)).toBe(STYLE_TEMPLATE_SEEDS.length);

    const festive = await listStyleTemplates(app, { scene: 'scene_gen', category: 'festive' });
    expect(festive.templates.length).toBeGreaterThanOrEqual(5);
    expect(festive.templates.every((tpl) => tpl.category === 'festive')).toBe(true);

    const mine = await listStyleTemplates(app, { scene: 'scene_gen', source: 'mine', userId: 7 });
    expect(mine.templates.length).toBe(1);
    expect(mine.templates[0].source).toBe('user');

    // 其它 scene 目前无种子
    const other = await listStyleTemplates(app, { scene: 'selling_point' });
    expect(other.templates.length).toBe(0);

    const rec = await listStyleTemplates(app, { scene: 'scene_gen', productText: '圣诞酒瓶套 红酒瓶装饰' });
    expect(rec.recommended).toBe('festive');
  });

  it('recommendCategory weights multi-char keywords over generic single chars', () => {
    expect(recommendCategory('圣诞酒瓶套')).toBe('festive'); // 「圣诞」(2) > 「酒」(1)
    expect(recommendCategory('食品真空包装机')).toBe('food'); // 「食品」(2) > 「包」(1)
    expect(recommendCategory('大容量旅行背包 backpack')).toBe('bags');
    expect(recommendCategory('不锈钢五金扳手套装')).toBe('industrial');
    expect(recommendCategory('')).toBe('general');
    expect(recommendCategory('说不清是什么')).toBe('general');
  });

  it('save requires title/prompt/user and falls back to general for unknown category', async () => {
    const { app } = makeApp();
    await expect(saveStyleTemplate(app, { title: '', prompt: 'x', userId: 1 })).rejects.toThrow('标题');
    await expect(saveStyleTemplate(app, { title: 'x', prompt: '', userId: 1 })).rejects.toThrow('提示词');
    await expect(saveStyleTemplate(app, { title: 'x', prompt: 'y', userId: 0 })).rejects.toThrow('用户');
    const tpl = await saveStyleTemplate(app, { title: 't', category: 'nope', prompt: 'p', userId: 3 });
    expect(tpl.category).toBe('general');
    expect(tpl.source).toBe('user');
  });

  it('delete only allows the owner to delete their own user templates', async () => {
    const { app } = makeApp();
    await seedStyleTemplates(app);
    const mineTpl = await saveStyleTemplate(app, { title: '我的', category: 'home', prompt: 'p', userId: 7 });

    // builtin 模版不可删
    const builtin = await listStyleTemplates(app, { scene: 'scene_gen' });
    await expect(deleteStyleTemplate(app, { id: builtin.templates[0].id, userId: 7 })).rejects.toThrow('自己');
    // 他人不可删
    await expect(deleteStyleTemplate(app, { id: mineTpl.id, userId: 8 })).rejects.toThrow('自己');
    // 本人可删,删后消失
    const res = await deleteStyleTemplate(app, { id: mineTpl.id, userId: 7 });
    expect(res.deleted).toBe(true);
    const after = await listStyleTemplates(app, { scene: 'scene_gen', userId: 7 });
    expect(after.mine.length).toBe(0);
    // 不存在 → NOT_FOUND
    await expect(deleteStyleTemplate(app, { id: mineTpl.id, userId: 7 })).rejects.toThrow('未找到');
  });
});
