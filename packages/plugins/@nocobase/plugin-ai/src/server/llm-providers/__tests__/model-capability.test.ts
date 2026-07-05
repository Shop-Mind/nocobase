/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { describe, expect, it, afterEach } from 'vitest';
import type { Application } from '@nocobase/server';
import type { AttachmentModel } from '@nocobase/plugin-file-manager';
import {
  applyCapabilityCatalog,
  getModelCapability,
  normalizeModelName,
  resetCapabilityCatalog,
} from '../common/model-capability';
import { detectMediaGenCapability } from '../common/image-gen';
import { DashscopeProvider } from '../dashscope';

afterEach(() => {
  delete process.env.AI_MODEL_CAPABILITY_OVERRIDES;
  delete process.env.AI_EMPLOYEE_IMAGE_GEN_MODELS;
  delete process.env.AI_EMPLOYEE_VIDEO_GEN_MODELS;
  resetCapabilityCatalog();
});

describe('normalizeModelName', () => {
  it('lowercases, strips provider prefix and date/latest suffixes', () => {
    expect(normalizeModelName('dashscope/Qwen-VL-Max')).toBe('qwen-vl-max');
    expect(normalizeModelName('qwen-image-2.0-pro-2026-04-22')).toBe('qwen-image-2.0-pro');
    expect(normalizeModelName('qwen-plus-20250413')).toBe('qwen-plus');
    expect(normalizeModelName('qwen-plus-0428')).toBe('qwen-plus');
    expect(normalizeModelName('qwen-vl-max-latest')).toBe('qwen-vl-max');
  });
});

describe('builtin family classification', () => {
  const cases: Array<[string, string, string[], string[]]> = [
    // [model, task, mustInclude(input), mustInclude(output)]
    ['qwen-max', 'chat', ['text'], ['text']],
    ['deepseek-v3', 'chat', ['text'], ['text']],
    ['qwen-vl-max', 'chat', ['image'], ['text']],
    ['qwen3-vl-plus', 'chat', ['image'], ['text']],
    ['qvq-max', 'chat', ['image'], ['text']],
    ['qwen-audio-turbo', 'chat', ['audio'], ['text']],
    ['gpt-4o-audio-preview', 'chat', ['audio'], ['audio']],
    ['qwen3-omni-flash', 'chat', ['image', 'audio'], ['text', 'audio']],
    ['qwen-image-2.0', 'image_gen', ['text', 'image'], ['image']],
    ['qwen-image-edit', 'image_gen', ['image'], ['image']],
    ['wan2.2-t2i-flash', 'image_gen', ['text'], ['image']],
    ['wanx2.1-t2i-turbo', 'image_gen', ['text'], ['image']],
    ['gpt-image-1', 'image_gen', ['text'], ['image']],
    ['dall-e-3', 'image_gen', ['text'], ['image']],
    ['gemini-2.5-flash-image', 'image_gen', ['text'], ['image']],
    ['seedream-4-0-250828', 'image_gen', ['text'], ['image']],
    ['wan2.5-i2v-preview', 'video_gen', ['image'], ['video']],
    ['wan2.2-t2v-plus', 'video_gen', ['text'], ['video']],
    ['seedance-1-0-pro', 'video_gen', ['text'], ['video']],
    ['qwen3-tts-flash', 'tts', ['text'], ['audio']],
    ['cosyvoice-v2', 'tts', ['text'], ['audio']],
    ['tts-1', 'tts', ['text'], ['audio']],
    ['gpt-4o-mini-tts', 'tts', ['text'], ['audio']],
    ['qwen3-asr-flash', 'asr', ['audio'], ['text']],
    ['paraformer-v2', 'asr', ['audio'], ['text']],
    ['whisper-1', 'asr', ['audio'], ['text']],
    ['gpt-4o-transcribe', 'asr', ['audio'], ['text']],
  ];

  it.each(cases)('%s → %s', (model, task, inputs, outputs) => {
    const capability = getModelCapability(model);
    expect(capability.task).toBe(task);
    for (const input of inputs) expect(capability.input).toContain(input);
    for (const output of outputs) expect(capability.output).toContain(output);
  });

  it('classifies dated variants via normalization', () => {
    expect(getModelCapability('qwen-image-2.0-pro-2026-04-22').task).toBe('image_gen');
  });

  it('marks omni models as stream-only tool-capable chat', () => {
    const capability = getModelCapability('qwen3-omni-flash');
    expect(capability.streamOnly).toBe(true);
    expect(capability.supportsTools).toBe(true);
    expect(capability.supportsStreaming).toBe(true);
  });

  it('defaults unknown models to text-only chat', () => {
    const capability = getModelCapability('totally-unknown-model');
    expect(capability.task).toBe('chat');
    expect(capability.input).toEqual(['text']);
    expect(capability.output).toEqual(['text']);
    expect(capability.supportsTools).toBe(true);
  });
});

describe('env overrides', () => {
  it('AI_MODEL_CAPABILITY_OVERRIDES with task shorthand takes top priority', () => {
    process.env.AI_MODEL_CAPABILITY_OVERRIDES = JSON.stringify({ 'my-fake-model': 'image_gen' });
    expect(getModelCapability('my-fake-model').task).toBe('image_gen');
  });

  it('AI_MODEL_CAPABILITY_OVERRIDES with object merges onto task defaults and beats builtin rules', () => {
    process.env.AI_MODEL_CAPABILITY_OVERRIDES = JSON.stringify({
      'qwen-max': { task: 'chat', input: ['text', 'image'] },
    });
    expect(getModelCapability('qwen-max').input).toContain('image');
  });

  it('reflects env changes within the same process', () => {
    process.env.AI_MODEL_CAPABILITY_OVERRIDES = JSON.stringify({ 'model-a': 'tts' });
    expect(getModelCapability('model-a').task).toBe('tts');
    process.env.AI_MODEL_CAPABILITY_OVERRIDES = JSON.stringify({ 'model-a': 'asr' });
    expect(getModelCapability('model-a').task).toBe('asr');
  });

  it('ignores malformed JSON and falls through', () => {
    process.env.AI_MODEL_CAPABILITY_OVERRIDES = '{not json';
    expect(getModelCapability('qwen-max').task).toBe('chat');
  });

  it('honors legacy AI_EMPLOYEE_*_GEN_MODELS regex envs', () => {
    process.env.AI_EMPLOYEE_IMAGE_GEN_MODELS = '^foo-model$';
    process.env.AI_EMPLOYEE_VIDEO_GEN_MODELS = '^bar-model$';
    expect(getModelCapability('foo-model').task).toBe('image_gen');
    expect(getModelCapability('bar-model').task).toBe('video_gen');
  });
});

describe('LiteLLM catalog fallback', () => {
  it('resolves models absent from builtin rules and respects builtin priority', () => {
    applyCapabilityCatalog({
      'openai/some-vendor-model': { mode: 'chat', supports_vision: true },
      'qwen-image-2.0': { mode: 'chat' }, // 与内置规则冲突,内置(自维护)应获胜
    });
    const fromCatalog = getModelCapability('some-vendor-model');
    expect(fromCatalog.task).toBe('chat');
    expect(fromCatalog.input).toContain('image');
    expect(getModelCapability('qwen-image-2.0').task).toBe('image_gen');
  });

  it('maps catalog modes to tasks', () => {
    applyCapabilityCatalog({
      'vendor-painter': { mode: 'image_generation' },
      'vendor-speaker': { mode: 'audio_speech' },
      'vendor-listener': { mode: 'audio_transcription' },
      'vendor-embedder': { mode: 'embedding' },
    });
    expect(getModelCapability('vendor-painter').task).toBe('image_gen');
    expect(getModelCapability('vendor-speaker').task).toBe('tts');
    expect(getModelCapability('vendor-listener').task).toBe('asr');
    // embedding 等非对话形态不进入能力表,回落默认 chat
    expect(getModelCapability('vendor-embedder').task).toBe('chat');
  });
});

describe('detectMediaGenCapability regression (media-gen channel)', () => {
  it('keeps the image/video split used by MediaGenChatModel', () => {
    expect(detectMediaGenCapability('qwen-image-2.0')).toEqual({ imageOutput: true });
    expect(detectMediaGenCapability('wan2.5-i2v-preview')).toEqual({ videoOutput: true });
    expect(detectMediaGenCapability('qwen-max')).toBeNull();
    expect(detectMediaGenCapability('')).toBeNull();
  });
});

describe('Dashscope attachment guard regression', () => {
  class TestDashscopeProvider extends DashscopeProvider {
    accepts(attachment: AttachmentModel) {
      return this.isApiSupportedAttachment(attachment);
    }
  }

  const createApp = (): Application =>
    ({
      environment: {
        renderJsonTemplate: (value: Record<string, unknown>) => value,
      },
    }) as unknown as Application;

  const provider = (model: string) =>
    new TestDashscopeProvider({
      app: createApp(),
      serviceOptions: { apiKey: 'sk-test' },
      modelOptions: { model },
    });

  const image = { mimetype: 'image/png' } as AttachmentModel;

  it('accepts images only for image-input capable models', () => {
    expect(provider('qwen-vl-max').accepts(image)).toBe(true);
    expect(provider('qwen3-omni-flash').accepts(image)).toBe(true);
    expect(provider('qwen-image-edit').accepts(image)).toBe(true);
    expect(provider('qwen-max').accepts(image)).toBe(false);
    expect(provider('deepseek-v3').accepts(image)).toBe(false);
  });

  it('rejects non-media mimetypes regardless of model', () => {
    expect(provider('qwen-vl-max').accepts({ mimetype: 'application/pdf' } as AttachmentModel)).toBe(false);
  });

  it('accepts audio only for audio-input capable models', () => {
    const audio = { mimetype: 'audio/mpeg' } as AttachmentModel;
    expect(provider('qwen3-omni-flash').accepts(audio)).toBe(true);
    expect(provider('qwen3-asr-flash').accepts(audio)).toBe(true);
    expect(provider('qwen-audio-turbo').accepts(audio)).toBe(true);
    expect(provider('qwen-max').accepts(audio)).toBe(false);
    expect(provider('qwen-vl-max').accepts(audio)).toBe(false);
  });

  // 事故回归(2026-07-05):LiteLLM 目录把 qwen3.7-max 标成 supports_vision 后,历史图片被重放给
  // 文本模型,百炼整轮 400。内置钉子规则必须让公开目录无法翻转百炼文本对话家族
  it('public catalog vision claims cannot flip pinned Bailian text-chat families', () => {
    applyCapabilityCatalog({ 'qwen3.7-max': { mode: 'chat', supports_vision: true } });
    expect(getModelCapability('qwen3.7-max').input).toEqual(['text']);
    expect(provider('qwen3.7-max').accepts(image)).toBe(false);
    for (const model of ['qwen-turbo', 'qwen3.7-plus', 'qwq-plus', 'deepseek-r1']) {
      expect(getModelCapability(model).input).toEqual(['text']);
    }
    // 更具体的视觉/生成规则先于钉子命中,不受影响
    expect(getModelCapability('qwen-vl-max').input).toContain('image');
    expect(getModelCapability('qwen3-tts-flash').task).toBe('tts');
  });

  it('maps Bailian multimedia InvalidParameter to an actionable Chinese hint', () => {
    const mapped = provider('qwen3.7-max').parseResponseError({
      message:
        '400 <400> InternalError.Algo.InvalidParameter: The provided messages input is invalid. The error info is [Unexpected item type in content.].',
    });
    expect(mapped).toContain('切换视觉模型');
    expect(provider('qwen-max').parseResponseError({ message: 'other error' })).toBe('other error');
  });
});
