/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Application } from '@nocobase/server';
import type { MediaTaskInput, MediaTaskInvoker } from '../common/media-task';
import { getModelCapability } from '../common/model-capability';
import { GoogleGenAIProvider } from '../google-genai';
import { VolcengineArkProvider } from '../volcengine-ark';

const createApp = () => ({ environment: { renderJsonTemplate: (v: unknown) => v } }) as unknown as Application;

const taskInput = (partial: Partial<MediaTaskInput>): MediaTaskInput => ({
  task: 'image_gen',
  model: 'test-model',
  prompt: '测试',
  images: [],
  audios: [],
  ...partial,
});

type FetchCall = { url: string; init: RequestInit };
const calls: FetchCall[] = [];

function mockFetch(handler: (url: string, init: RequestInit) => Promise<Response> | Response) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({ url: String(url), init });
      return handler(String(url), init);
    }),
  );
}

const jsonResp = (json: unknown, status = 200) =>
  new Response(JSON.stringify(json), { status, headers: { 'Content-Type': 'application/json' } });

afterEach(() => {
  vi.unstubAllGlobals();
  calls.length = 0;
});

describe('registry classification for new provider families', () => {
  it.each([
    ['doubao-seed-1.8', 'chat'],
    ['doubao-1.5-vision-pro', 'chat'],
    ['doubao-seedream-4-5', 'image_gen'],
    ['doubao-seedance-1-5-pro', 'video_gen'],
    ['gemini-2.5-flash-image', 'image_gen'],
    ['gpt-image-1', 'image_gen'],
  ])('%s → %s', (model, task) => {
    expect(getModelCapability(model).task).toBe(task);
  });

  it('vision-capable doubao accepts image input', () => {
    expect(getModelCapability('doubao-1.5-vision-pro').input).toContain('image');
  });
});

describe('Gemini generateContent image adapter', () => {
  class TestGoogleProvider extends GoogleGenAIProvider {
    invoker(): MediaTaskInvoker {
      return this.createMediaTaskInvoker();
    }
  }
  const provider = () => new TestGoogleProvider({ app: createApp(), serviceOptions: { apiKey: 'g-key' } });

  it('posts native generateContent and collects inlineData binaries', async () => {
    mockFetch(() =>
      jsonResp({
        candidates: [
          { content: { parts: [{ text: '好的' }, { inlineData: { mimeType: 'image/png', data: 'aW1n' } }] } },
        ],
      }),
    );
    const result = await provider().invoker()(
      taskInput({ task: 'image_gen', model: 'gemini-2.5-flash-image', images: ['data:image/png;base64,cmVm'] }),
    );
    expect(result.binaries).toEqual([{ base64: 'aW1n', mimeType: 'image/png' }]);
    expect(calls[0].url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent',
    );
    expect((calls[0].init.headers as Record<string, string>)['x-goog-api-key']).toBe('g-key');
    const body = JSON.parse(String(calls[0].init.body));
    expect(body.contents[0].parts[0]).toEqual({ text: '测试' });
    expect(body.contents[0].parts[1]).toEqual({ inline_data: { mime_type: 'image/png', data: 'cmVm' } });
  });

  it('surfaces API errors readably', async () => {
    mockFetch(() => jsonResp({ error: { message: 'quota exceeded' } }, 429));
    await expect(
      provider().invoker()(taskInput({ task: 'image_gen', model: 'gemini-2.5-flash-image' })),
    ).rejects.toThrow(/quota exceeded/);
  });
});

describe('Volcengine Ark provider', () => {
  class TestArkProvider extends VolcengineArkProvider {
    protected mediaTaskPollIntervalMs = 1;
    invoker(): MediaTaskInvoker {
      return this.createMediaTaskInvoker();
    }
  }
  const provider = () => new TestArkProvider({ app: createApp(), serviceOptions: { apiKey: 'ark-key' } });

  it('routes image_gen to the OpenAI images endpoint (Seedream)', async () => {
    mockFetch(() => jsonResp({ data: [{ url: 'https://x/seedream.png' }] }));
    const result = await provider().invoker()(taskInput({ task: 'image_gen', model: 'doubao-seedream-4-5' }));
    expect(result.urls).toEqual(['https://x/seedream.png']);
    expect(calls[0].url).toBe('https://ark.cn-beijing.volces.com/api/v3/images/generations');
  });

  it('runs Seedance video through the task API with polling', async () => {
    mockFetch((url) => {
      if (url.endsWith('/contents/generations/tasks')) return jsonResp({ id: 'task-1' });
      return jsonResp({ status: 'succeeded', content: { video_url: 'https://x/seedance.mp4' } });
    });
    const result = await provider().invoker()(
      taskInput({ task: 'video_gen', model: 'doubao-seedance-1-5-pro', images: ['https://x/ref.png'] }),
    );
    expect(result.urls).toEqual(['https://x/seedance.mp4']);
    expect(calls[0].url).toBe('https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks');
    const body = JSON.parse(String(calls[0].init.body));
    expect(body.content[1]).toEqual({ type: 'image_url', image_url: { url: 'https://x/ref.png' } });
    expect(calls[1].url).toBe('https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks/task-1');
  });

  it('propagates task failure and abort', async () => {
    mockFetch((url) => {
      if (url.endsWith('/tasks')) return jsonResp({ id: 'task-2' });
      return jsonResp({ status: 'failed', error: { message: 'content policy' } });
    });
    await expect(
      provider().invoker()(taskInput({ task: 'video_gen', model: 'doubao-seedance-1-5-pro' })),
    ).rejects.toThrow(/content policy/);

    const controller = new AbortController();
    controller.abort();
    mockFetch((url) => {
      if (url.endsWith('/tasks')) return jsonResp({ id: 'task-3' });
      return jsonResp({ status: 'running' });
    });
    await expect(
      provider().invoker()(
        taskInput({ task: 'video_gen', model: 'doubao-seedance-1-5-pro', signal: controller.signal }),
      ),
    ).rejects.toThrow(/取消/);
  });
});
