/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// 场景元信息:key → { icon(emoji), label(中文) }。用于候选区快捷/候选标签/抽屉快捷按钮的中文+图标展示。
// 中文标签与服务端 scenes.ts 的 title(英文,同时是 i18n 键)一一对应;这里直接给中文兜底,避免依赖 i18n 命名空间加载时机。

export interface SceneMeta {
  icon: string;
  label: string;
}

const SCENE_META: Record<string, SceneMeta> = {
  white_bg: { icon: '⬜', label: '白底图' },
  scene_gen: { icon: '🏞️', label: '场景图' },
  erase: { icon: '🧽', label: '图片擦除' },
  recolor: { icon: '🎨', label: '商品换色' },
  selling_point: { icon: '🏷️', label: '营销卖点图' },
  hd: { icon: '🔍', label: '高清增强' },
  expand: { icon: '↔️', label: '扩图' },
  material: { icon: '🧵', label: '换材质' },
  custom: { icon: '✏️', label: '自由改图' },
};

// 候选区头部「快捷直连」:只放最常用、点了直接生成(白底/高清无需指令;去logo水印用预置指令)。
export const QUICK_SCENES: Array<{ key: string; icon: string; label: string; instruction?: string }> = [
  { key: 'white_bg', icon: '⬜', label: '白底图' },
  { key: 'erase', icon: '🧽', label: '去logo水印', instruction: '品牌 logo 和所有文字水印' },
  { key: 'hd', icon: '🔍', label: '高清' },
];

export function sceneMeta(key?: string | null): SceneMeta {
  if (key && SCENE_META[key]) return SCENE_META[key];
  return { icon: '🖼️', label: key || '改图' };
}

// 场景中文名(带图标前缀,供下拉/标签)。fallbackTitle 用于 SCENE_META 未收录的 env 增补场景。
export function sceneLabel(key?: string | null, fallbackTitle?: string): string {
  if (key && SCENE_META[key]) return SCENE_META[key].label;
  return fallbackTitle || key || '改图';
}
