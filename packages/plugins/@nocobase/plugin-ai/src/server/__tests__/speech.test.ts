/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { extractSpeechText, resolveDefaultASRModel, resolveDefaultTTSModel } from '../ai-employees/speech';
import type PluginAIServer from '../plugin';

const pluginWith = (services: Array<{ llmService: string; models: string[] }>) =>
  ({
    aiManager: {
      listAllEnabledModels: async () =>
        services.map((s) => ({
          llmService: s.llmService,
          enabledModels: s.models.map((value) => ({ label: value, value })),
        })),
    },
  }) as unknown as PluginAIServer;

afterEach(() => {
  delete process.env.AI_DEFAULT_TTS_MODEL;
  delete process.env.AI_DEFAULT_ASR_MODEL;
});

describe('resolveDefaultASRModel', () => {
  it('picks the first enabled model classified as asr', async () => {
    const plugin = pluginWith([
      { llmService: 'svc-a', models: ['qwen-max', 'qwen3-tts-flash'] },
      { llmService: 'svc-b', models: ['qwen3-asr-flash'] },
    ]);
    expect(await resolveDefaultASRModel(plugin)).toEqual({ llmService: 'svc-b', model: 'qwen3-asr-flash' });
  });

  it('honors AI_DEFAULT_ASR_MODEL env', async () => {
    process.env.AI_DEFAULT_ASR_MODEL = 'svc-x:paraformer-v2';
    expect(await resolveDefaultASRModel(pluginWith([]))).toEqual({ llmService: 'svc-x', model: 'paraformer-v2' });
  });

  it('returns null without asr-capable models', async () => {
    expect(await resolveDefaultASRModel(pluginWith([{ llmService: 'svc-a', models: ['qwen-max'] }]))).toBeNull();
  });
});

describe('extractSpeechText', () => {
  it('strips markdown, html and images but keeps link text', () => {
    const text = extractSpeechText(
      '# 标题\n\n这是**重点**内容,详见[官网](https://x.com)。\n\n![图](https://x/i.png)\n\n<audio src="/a.wav"></audio>\n\n```js\ncode\n```',
    );
    expect(text).toContain('标题');
    expect(text).toContain('重点');
    expect(text).toContain('官网');
    expect(text).not.toContain('https://x/i.png');
    expect(text).not.toContain('audio');
    expect(text).not.toContain('code');
  });
});

describe('resolveDefaultTTSModel', () => {
  it('picks the first enabled model classified as tts', async () => {
    const plugin = pluginWith([
      { llmService: 'svc-a', models: ['qwen-max', 'qwen-vl-max'] },
      { llmService: 'svc-b', models: ['qwen3-tts-flash', 'qwen-plus'] },
    ]);
    expect(await resolveDefaultTTSModel(plugin)).toEqual({ llmService: 'svc-b', model: 'qwen3-tts-flash' });
  });

  it('returns null when no tts-capable model is enabled', async () => {
    const plugin = pluginWith([{ llmService: 'svc-a', models: ['qwen-max'] }]);
    expect(await resolveDefaultTTSModel(plugin)).toBeNull();
  });

  it('honors AI_DEFAULT_TTS_MODEL with service prefix', async () => {
    process.env.AI_DEFAULT_TTS_MODEL = 'svc-x:cosyvoice-v2';
    const plugin = pluginWith([]);
    expect(await resolveDefaultTTSModel(plugin)).toEqual({ llmService: 'svc-x', model: 'cosyvoice-v2' });
  });

  it('honors bare AI_DEFAULT_TTS_MODEL by locating the hosting service', async () => {
    process.env.AI_DEFAULT_TTS_MODEL = 'qwen3-tts-flash';
    const plugin = pluginWith([{ llmService: 'svc-a', models: ['qwen3-tts-flash'] }]);
    expect(await resolveDefaultTTSModel(plugin)).toEqual({ llmService: 'svc-a', model: 'qwen3-tts-flash' });
  });
});
