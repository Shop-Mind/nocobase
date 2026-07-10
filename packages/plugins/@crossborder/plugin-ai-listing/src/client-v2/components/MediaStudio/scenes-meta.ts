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

// 候选区头部「快捷直连」:只放最常用、点了直接生成(白底/高清无需指令;去logo水印用预置指令;
// 翻译(英)预置目标语种——搬运出海主战场是英文站,详情图文字一键英化;其他语种去创意工坊选)。
export const QUICK_SCENES: Array<{
  key: string;
  icon: string;
  label: string;
  instruction?: string;
  targetLanguage?: string;
}> = [
  { key: 'white_bg', icon: '⬜', label: '白底图' },
  { key: 'erase', icon: '🧽', label: '去logo水印', instruction: '品牌 logo 和所有文字水印' },
  { key: 'hd', icon: '🔍', label: '高清' },
  { key: 'translate', icon: '🌐', label: '翻译(英)', targetLanguage: 'English' },
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

// 相对时间(候选条角标):刚刚 / N 分钟 / N 小时 / N 天。与 scenes-meta 其余中文兜底一致(直接给中文,不依赖 i18n 加载时机)。
export function relTime(iso?: string | null): string {
  if (!iso) return '';
  const ts = new Date(iso).getTime();
  if (!ts || Number.isNaN(ts)) return '';
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1) return '刚刚';
  if (m < 60) return `${m} 分钟`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时`;
  return `${Math.floor(h / 24)} 天`;
}

// 是否近期新出(候选 NEW 翠标):默认 3 分钟内。
export function isRecent(iso?: string | null, withinMs = 180000): boolean {
  if (!iso) return false;
  const ts = new Date(iso).getTime();
  return Boolean(ts) && !Number.isNaN(ts) && Date.now() - ts < withinMs;
}
