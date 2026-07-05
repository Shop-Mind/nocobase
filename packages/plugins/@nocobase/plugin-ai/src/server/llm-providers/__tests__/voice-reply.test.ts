/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { describe, expect, it } from 'vitest';
import type { Application } from '@nocobase/server';
import { pcmToWav } from '../common/media-task';
import { ReasoningChatOpenAI } from '../common/reasoning';
import { DashscopeProvider } from '../dashscope';

describe('pcmToWav', () => {
  it('wraps pcm bytes with a valid 24kHz mono 16bit RIFF header', () => {
    const pcm = Buffer.from([1, 2, 3, 4, 5, 6]);
    const wav = pcmToWav(pcm);
    expect(wav.length).toBe(44 + pcm.length);
    expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
    expect(wav.toString('ascii', 8, 12)).toBe('WAVE');
    expect(wav.readUInt32LE(24)).toBe(24000);
    expect(wav.readUInt16LE(22)).toBe(1);
    expect(wav.readUInt32LE(40)).toBe(pcm.length);
    expect(wav.subarray(44).equals(pcm)).toBe(true);
  });
});

describe('ReasoningChatOpenAI voice-reply delta handling', () => {
  const model = new ReasoningChatOpenAI({ apiKey: 'sk-test', model: 'qwen3-omni-flash' });

  it('maps delta.audio.transcript to content and stashes audio frames', () => {
    const chunk = model._convertCompletionsDeltaToBaseMessageChunk(
      { role: 'assistant', audio: { transcript: '你好', data: 'QUJD' } },
      { choices: [{}] },
      'assistant',
    );
    expect(chunk.content).toContain('你好');
    expect(chunk.additional_kwargs.__nb_audio_frames).toEqual(['QUJD']);
    // 基类塞入的 audio 字段必须被清除,否则聚合进消息 metadata 并污染历史重放
    expect(chunk.additional_kwargs.audio).toBeUndefined();
  });

  it('does not duplicate text when delta.content is present', () => {
    const chunk = model._convertCompletionsDeltaToBaseMessageChunk(
      { role: 'assistant', content: '正文', audio: { transcript: '不该出现' } },
      { choices: [{}] },
      'assistant',
    );
    expect(chunk.content).toBe('正文');
  });
});

describe('Dashscope voiceReply request injection', () => {
  const createApp = () => ({ environment: { renderJsonTemplate: (v: unknown) => v } }) as unknown as Application;
  const provider = (model: string, voiceReply: boolean) =>
    new DashscopeProvider({
      app: createApp(),
      serviceOptions: { apiKey: 'sk-test' },
      modelOptions: { model, builtIn: voiceReply ? { voiceReply: true } : undefined },
    });

  it('adds modalities+audio kwargs and audio sink for omni models', () => {
    const chatModel = provider('qwen3-omni-flash', true).chatModel as ReasoningChatOpenAI;
    expect((chatModel.modelKwargs as Record<string, unknown>).modalities).toEqual(['text', 'audio']);
    expect((chatModel.modelKwargs as Record<string, unknown>).audio).toEqual({ voice: 'Cherry', format: 'wav' });
    expect(typeof chatModel.audioReplySink).toBe('function');
  });

  it('ignores voiceReply for models without audio output', () => {
    const chatModel = provider('qwen3.7-max', true).chatModel as ReasoningChatOpenAI;
    expect((chatModel.modelKwargs as Record<string, unknown>)?.modalities).toBeUndefined();
    expect(chatModel.audioReplySink).toBeUndefined();
  });

  it('drops tools when voiceReply is on (mutually exclusive with function calling)', () => {
    expect(provider('qwen3-omni-flash', true).resolveTools([{ name: 'x' }])).toEqual([]);
    expect(provider('qwen3-omni-flash', false).resolveTools([{ name: 'x' }])).toEqual([{ name: 'x' }]);
  });
});
