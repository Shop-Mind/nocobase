/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { HumanMessage } from '@langchain/core/messages';
import type { Application } from '@nocobase/server';
import { persistMediaTaskOutput, withMediaPersistence } from '../common/media-persist';
import { MediaGenChatModel } from '../common/image-gen';
import type { MediaTaskOutput } from '../common/media-task';

function makeApp(overrides?: { createFileRecord?: (options: Record<string, unknown>) => Promise<unknown> }) {
  const createFileRecord = overrides?.createFileRecord ?? vi.fn(async () => ({ get: () => 1 }));
  const getFileURL = vi.fn(async () => '/storage/uploads/ai-media-test.png');
  const warn = vi.fn();
  const app = {
    pm: { get: () => ({ createFileRecord, getFileURL }) },
    logger: { warn },
  } as unknown as Application;
  return { app, createFileRecord, warn };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('persistMediaTaskOutput', () => {
  it('downloads remote urls into file manager and marks persisted', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () => new Response(new Uint8Array([1, 2]), { status: 200, headers: { 'Content-Type': 'image/png' } }),
      ),
    );
    const { app, createFileRecord } = makeApp();
    const result = await persistMediaTaskOutput(app, { urls: ['https://oss.example.com/a.png?Expires=1'] });
    expect(result.urls).toEqual(['/storage/uploads/ai-media-test.png']);
    expect(result.persisted).toBe(true);
    expect(createFileRecord).toHaveBeenCalledOnce();
  });

  it('falls back to the original url when download fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 403 })),
    );
    const { app, warn } = makeApp();
    const result = await persistMediaTaskOutput(app, { urls: ['https://oss.example.com/gone.png'] });
    expect(result.urls).toEqual(['https://oss.example.com/gone.png']);
    expect(result.persisted).toBe(false);
    expect(warn).toHaveBeenCalled();
  });

  it('stores base64 binaries as files and clears them from the output', async () => {
    const { app } = makeApp();
    const result = await persistMediaTaskOutput(app, {
      urls: [],
      binaries: [{ base64: Buffer.from('wav-bytes').toString('base64'), mimeType: 'audio/wav' }],
    });
    expect(result.urls).toEqual(['/storage/uploads/ai-media-test.png']);
    expect(result.binaries).toBeUndefined();
    expect(result.persisted).toBe(true);
  });

  it('keeps binaries and marks unpersisted when file manager is unavailable', async () => {
    const app = { pm: { get: () => undefined }, logger: { warn: vi.fn() } } as unknown as Application;
    const binaries = [{ base64: 'aGk=', mimeType: 'audio/wav' }];
    const result = await persistMediaTaskOutput(app, { urls: [], binaries });
    expect(result.binaries).toEqual(binaries);
    expect(result.persisted).toBe(false);
  });
});

describe('MediaGenChatModel expiry tip', () => {
  const modelWith = (output: MediaTaskOutput) =>
    new MediaGenChatModel({ model: 'qwen-image-2.0', task: 'image_gen', invoker: async () => output });

  it('omits the expiry tip for persisted local urls', async () => {
    const model = modelWith({ urls: ['/storage/uploads/ai.png'], persisted: true });
    const { generations } = await model._generate([new HumanMessage('画一只猫')], {} as never);
    expect(generations[0].text).toContain('/storage/uploads/ai.png');
    expect(generations[0].text).not.toContain('有效期有限');
  });

  it('keeps the expiry tip when falling back to provider urls', async () => {
    const model = modelWith({ urls: ['https://oss.example.com/a.png'], persisted: false });
    const { generations } = await model._generate([new HumanMessage('画一只猫')], {} as never);
    expect(generations[0].text).toContain('有效期有限');
  });
});

describe('MediaGenChatModel tts branch', () => {
  it('renders an audio bubble for tts urls', async () => {
    const model = new MediaGenChatModel({
      model: 'qwen3-tts-flash',
      task: 'tts',
      invoker: async () => ({ urls: ['/storage/uploads/ai-voice.wav'], persisted: true }),
    });
    const { generations } = await model._generate([new HumanMessage('你好,欢迎光临')], {} as never);
    expect(generations[0].text).toContain('<audio src="/storage/uploads/ai-voice.wav" controls');
    expect(generations[0].text).not.toContain('有效期有限');
  });

  it('asks for text without invoking the provider when the user message is empty', async () => {
    const invoker = vi.fn(async () => ({ urls: ['x'] }));
    const model = new MediaGenChatModel({ model: 'qwen3-tts-flash', task: 'tts', invoker });
    const { generations } = await model._generate([new HumanMessage('')], {} as never);
    expect(generations[0].text).toContain('请发送要合成语音的文本');
    expect(invoker).not.toHaveBeenCalled();
  });
});

describe('withMediaPersistence', () => {
  it('decorates the invoker output', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(new Uint8Array([1]), { status: 200, headers: { 'Content-Type': 'image/png' } })),
    );
    const { app } = makeApp();
    const decorated = withMediaPersistence(app, async () => ({ urls: ['https://oss.example.com/x.png'] }));
    const result = await decorated({ task: 'image_gen', model: 'm', prompt: 'p', images: [], audios: [] });
    expect(result.urls[0]).toBe('/storage/uploads/ai-media-test.png');
    expect(result.persisted).toBe(true);
  });
});
