/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// 场景库单测:默认 10 场景完整性、env 增补/覆盖合并、模板占位符注入。

import { afterEach, describe, expect, it } from 'vitest';
import { buildScenePrompt, getMediaScene, listMediaScenes } from '../scenes';

afterEach(() => {
  delete process.env.AI_LISTING_MEDIA_SCENES;
});

function mustScene(key: string) {
  const scene = getMediaScene(key);
  if (!scene) throw new Error(`场景不存在:${key}`);
  return scene;
}

describe('listMediaScenes', () => {
  it('ships the 14 creative-workshop scenes with unique keys', () => {
    const scenes = listMediaScenes();
    const keys = scenes.map((s) => s.key);
    expect(keys).toEqual([
      'white_bg',
      'scene_gen',
      'erase',
      'recolor',
      'detail',
      'selling_point',
      'hd',
      'expand',
      'material',
      'logo',
      'translate',
      'model_shot',
      'process',
      'custom',
    ]);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('process is an instruct infographic scene with a {style} placeholder', () => {
    const process = mustScene('process');
    expect(process).toMatchObject({ route: 'instruct', instructionRequired: true, defaultN: 1 });
    expect(process.promptTemplate).toContain('{style}');
    expect(process.editFunction).toBeUndefined();
    // 风格 + 步骤注入
    const prompt = buildScenePrompt(process, { instruction: '1. 裁剪 2. 缝合', style: '商务信息图' });
    expect(prompt).toContain('商务信息图');
    expect(prompt).toContain('1. 裁剪 2. 缝合');
    expect(prompt).not.toContain('{style}');
  });

  it('translate is an instruct scene with a {target_language} placeholder, layout-locked', () => {
    const translate = mustScene('translate');
    expect(translate).toMatchObject({ route: 'instruct', instructionRequired: false, defaultN: 1 });
    expect(translate.promptTemplate).toContain('{target_language}');
    expect(translate.editFunction).toBeUndefined();
    // 目标语种注入,且强约束版式保留
    const prompt = buildScenePrompt(translate, { instruction: '', target_language: 'English' });
    expect(prompt).toContain('English');
    expect(prompt).not.toContain('{target_language}');
    expect(prompt).toContain('完全不变');
  });

  it('model_shot is an instruct scene that keeps the product unchanged', () => {
    const model = mustScene('model_shot');
    expect(model).toMatchObject({ route: 'instruct', instructionRequired: false });
    expect(model.editFunction).toBeUndefined();
    const prompt = buildScenePrompt(model, { instruction: '一位亚洲年轻女性模特' });
    expect(prompt).toContain('一位亚洲年轻女性模特');
    expect(prompt).toContain('保持完全不变');
  });

  it('detail is an instruct region-crop scene', () => {
    expect(getMediaScene('detail')).toMatchObject({ route: 'instruct', instructionRequired: true });
    expect(getMediaScene('detail')?.editFunction).toBeUndefined();
  });

  it('logo is an instruct multi-image compose scene (second image = logo)', () => {
    const logo = getMediaScene('logo');
    expect(logo).toMatchObject({ route: 'instruct', instructionRequired: false });
    expect(logo?.promptTemplate).toContain('第二张图');
  });

  it('hd upscales via size strategy; expand keeps the wanx function route', () => {
    // 实测 wanx super_resolution 恒输出 ~1MP 不放大——hd 走 qwen-image-edit 指令通道 + 动态 size
    const hd = getMediaScene('hd');
    expect(hd).toMatchObject({
      route: 'instruct',
      sizeStrategy: 'upscale',
      defaultParameters: { upscale_factor: 2 },
      compareMode: 'slider',
      defaultN: 1,
    });
    expect(hd?.editFunction).toBeUndefined();
    const expand = getMediaScene('expand');
    expect(expand).toMatchObject({ route: 'function', editFunction: 'expand', compareMode: 'slider' });
    expect(expand?.defaultParameters).toMatchObject({ top_scale: 1.5, left_scale: 1.5 });
    // 指令式场景不带专项 function
    for (const s of listMediaScenes().filter((x) => x.route === 'instruct')) {
      expect(s.editFunction).toBeUndefined();
    }
  });

  it('merges env overrides by key and appends new scenes', () => {
    process.env.AI_LISTING_MEDIA_SCENES = JSON.stringify([
      { key: 'white_bg', defaultN: 4 },
      { key: 'watermark_rm', route: 'function', editFunction: 'remove_watermark', hint: '去文字水印' },
    ]);
    const scenes = listMediaScenes();
    expect(scenes.find((s) => s.key === 'white_bg')).toMatchObject({ defaultN: 4, route: 'instruct' });
    expect(scenes.find((s) => s.key === 'watermark_rm')).toMatchObject({
      route: 'function',
      editFunction: 'remove_watermark',
      defaultN: 2,
    });
    expect(scenes.length).toBe(15);
  });

  it('falls back to defaults on invalid env JSON', () => {
    process.env.AI_LISTING_MEDIA_SCENES = '{not json';
    expect(listMediaScenes().length).toBe(14);
  });
});

describe('buildScenePrompt', () => {
  it('injects {instruction} and collapses leftover whitespace', () => {
    const recolor = buildScenePrompt(mustScene('recolor'), { instruction: '红色酒瓶套换成藏青色' });
    expect(recolor).toContain('红色酒瓶套换成藏青色');
    expect(recolor).toContain('完全不变');
    const prompt = buildScenePrompt(mustScene('white_bg'), { instruction: '' });
    expect(prompt).not.toContain('{instruction}');
    expect(prompt).toContain('纯白色电商白底');
  });

  it('supports arbitrary {param} placeholders for env-defined scenes', () => {
    const scene = { ...mustScene('custom'), promptTemplate: '把{part}换成{color}' };
    expect(buildScenePrompt(scene, { part: '背景', color: '蓝色' })).toBe('把背景换成蓝色');
  });
});
