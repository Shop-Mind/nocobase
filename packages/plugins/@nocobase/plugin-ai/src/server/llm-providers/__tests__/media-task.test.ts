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
import {
  audioMimeToFormat,
  MediaTaskInput,
  MediaTaskInvoker,
  openAICompatibleMediaGeneration,
  openAIImagesEdit,
  openAIImagesGeneration,
  openAIMediaTaskInvoker,
  openAISpeech,
  openAITranscription,
  parseAudioDataURI,
} from '../common/media-task';
import { DashscopeProvider } from '../dashscope';

const OPTS = { apiKey: 'sk-test', baseURL: 'https://api.example.com/v1' };

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

describe('shape 1: OpenAI chat/completions media output', () => {
  it('extracts urls from message.images and content', async () => {
    mockFetch(() =>
      jsonResp({
        choices: [{ message: { content: '', images: [{ image_url: { url: 'https://x/img.png' } }] } }],
      }),
    );
    const result = await openAICompatibleMediaGeneration(OPTS)(taskInput({}));
    expect(result.urls).toEqual(['https://x/img.png']);
    expect(calls[0].url).toBe('https://api.example.com/v1/chat/completions');
  });
});

describe('shape 2a: OpenAI images/generations', () => {
  it('collects b64_json when no url is returned (gpt-image)', async () => {
    mockFetch(() => jsonResp({ data: [{ b64_json: 'aGVsbG8=' }] }));
    const result = await openAIImagesGeneration(OPTS, taskInput({ model: 'gpt-image-1' }));
    expect(result.urls).toEqual([]);
    expect(result.binaries).toEqual([{ base64: 'aGVsbG8=', mimeType: 'image/png' }]);
    expect(calls[0].url).toBe('https://api.example.com/v1/images/generations');
  });

  it('falls back to url (dall-e)', async () => {
    mockFetch(() => jsonResp({ data: [{ url: 'https://x/dalle.png' }] }));
    const result = await openAIImagesGeneration(OPTS, taskInput({ model: 'dall-e-3' }));
    expect(result.urls).toEqual(['https://x/dalle.png']);
  });

  it('throws a readable error on failure', async () => {
    mockFetch(() => jsonResp({ error: { message: 'billing hard limit' } }, 400));
    await expect(openAIImagesGeneration(OPTS, taskInput({}))).rejects.toThrow(/billing hard limit/);
  });
});

describe('shape 2a-edit: OpenAI images/edits', () => {
  it('uses image[] for grok2api image edit even with one source image', async () => {
    mockFetch(() => jsonResp({ data: [{ url: 'https://x/edit.png' }] }));
    const result = await openAIImagesEdit(
      { apiKey: 'sk-test', baseURL: 'http://120.76.157.51:8001/v1' },
      taskInput({ model: 'grok-imagine-image-edit', images: ['data:image/png;base64,QUJD'] }),
    );
    const body = calls[0].init.body as FormData;
    expect(Array.from(body.keys())).toContain('image[]');
    expect(Array.from(body.keys())).not.toContain('image');
    expect(result.urls).toEqual(['https://x/edit.png']);
  });
});

describe('shape 2b: OpenAI audio/speech (binary body)', () => {
  it('returns base64 binary with response mime type', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    mockFetch(() => new Response(bytes, { status: 200, headers: { 'Content-Type': 'audio/wav' } }));
    const result = await openAISpeech(OPTS, taskInput({ task: 'tts', model: 'tts-1', prompt: '你好' }));
    expect(result.binaries?.[0]).toEqual({ base64: Buffer.from(bytes).toString('base64'), mimeType: 'audio/wav' });
    const body = JSON.parse(String(calls[0].init.body));
    expect(body).toMatchObject({ model: 'tts-1', input: '你好', voice: 'alloy' });
  });
});

describe('shape 2c: OpenAI audio/transcriptions (multipart)', () => {
  it('downloads the audio and posts multipart form', async () => {
    mockFetch((url) => {
      if (url === 'https://x/audio.mp3') {
        return new Response(new Uint8Array([9, 9]), { status: 200, headers: { 'Content-Type': 'audio/mpeg' } });
      }
      return jsonResp({ text: '你好世界' });
    });
    const result = await openAITranscription(
      OPTS,
      taskInput({ task: 'asr', model: 'whisper-1', audios: ['https://x/audio.mp3'] }),
    );
    expect(result.text).toBe('你好世界');
    expect(calls[1].url).toBe('https://api.example.com/v1/audio/transcriptions');
    expect(calls[1].init.body).toBeInstanceOf(FormData);
  });

  it('requires an audio input', async () => {
    mockFetch(() => jsonResp({}));
    await expect(openAITranscription(OPTS, taskInput({ task: 'asr' }))).rejects.toThrow(/音频/);
  });
});

describe('openAIMediaTaskInvoker routing', () => {
  it('routes tasks to the matching endpoint', async () => {
    mockFetch((url) => {
      if (url.endsWith('/images/generations')) return jsonResp({ data: [{ url: 'https://x/i.png' }] });
      if (url.endsWith('/audio/speech')) return new Response(new Uint8Array([1]), { status: 200 });
      if (url.endsWith('/chat/completions'))
        return jsonResp({ choices: [{ message: { content: 'https://x/v.mp4' } }] });
      return jsonResp({});
    });
    const invoker = openAIMediaTaskInvoker(OPTS);
    expect((await invoker(taskInput({ task: 'image_gen' }))).urls).toEqual(['https://x/i.png']);
    expect((await invoker(taskInput({ task: 'tts' }))).binaries?.length).toBe(1);
    expect((await invoker(taskInput({ task: 'video_gen' }))).urls).toEqual(['https://x/v.mp4']);
  });

  // 关键:有源图的 image_gen 必须走 images/edits(带图编辑),否则 generations 会丢源图退化成纯文生图
  it('image_gen with a source image routes to images/edits (multipart)', async () => {
    const calls: Array<{ url: string; init: { body?: unknown } }> = [];
    mockFetch((url, init) => {
      calls.push({ url, init });
      if (url.endsWith('/images/edits')) return jsonResp({ data: [{ b64_json: 'ZWRpdA==' }] });
      if (url.endsWith('/images/generations')) return jsonResp({ data: [{ url: 'https://x/gen.png' }] });
      return jsonResp({});
    });
    const invoker = openAIMediaTaskInvoker(OPTS);
    const out = await invoker(taskInput({ task: 'image_gen', images: ['data:image/png;base64,QUJD'] }));
    expect(calls[calls.length - 1].url).toBe('https://api.example.com/v1/images/edits');
    expect(calls[calls.length - 1].init.body).toBeInstanceOf(FormData);
    expect(out.binaries?.[0]).toEqual({ base64: 'ZWRpdA==', mimeType: 'image/png' });
  });
});

describe('audio data helpers', () => {
  it('maps audio mimetypes to input_audio formats', () => {
    expect(audioMimeToFormat('audio/mpeg')).toBe('mp3');
    expect(audioMimeToFormat('audio/x-wav')).toBe('wav');
    expect(audioMimeToFormat('audio/webm')).toBe('webm');
    expect(audioMimeToFormat('audio/mp4')).toBe('m4a');
  });

  it('parses audio data URIs', () => {
    expect(parseAudioDataURI('data:audio/wav;base64,aGVsbG8=')).toEqual({ base64: 'aGVsbG8=', format: 'wav' });
    expect(parseAudioDataURI('https://x/a.wav')).toBeNull();
  });
});

describe('shapes 3 & 4: DashScope native sync / async task', () => {
  class TestDashscopeProvider extends DashscopeProvider {
    protected mediaTaskPollIntervalMs = 1;
    invoker(): MediaTaskInvoker {
      return this.createMediaTaskInvoker();
    }
  }

  const provider = (model: string) =>
    new TestDashscopeProvider({
      app: { environment: { renderJsonTemplate: (v: unknown) => v } } as unknown as Application,
      serviceOptions: { apiKey: 'sk-test' },
      modelOptions: { model },
    });

  const NATIVE = 'https://dashscope.aliyuncs.com/api/v1';

  it('tts: native sync returns output.audio.url without async header', async () => {
    mockFetch(() => jsonResp({ output: { audio: { url: 'https://x/a.wav' } } }));
    const result = await provider('qwen3-tts-flash').invoker()(
      taskInput({ task: 'tts', model: 'qwen3-tts-flash', prompt: '欢迎' }),
    );
    expect(result.urls).toEqual(['https://x/a.wav']);
    expect(calls[0].url).toBe(`${NATIVE}/services/aigc/multimodal-generation/generation`);
    expect((calls[0].init.headers as Record<string, string>)['X-DashScope-Async']).toBeUndefined();
    const body = JSON.parse(String(calls[0].init.body));
    expect(body.input).toMatchObject({ text: '欢迎', voice: 'Cherry' });
  });

  it('asr: base64 data URI goes through OpenAI-compatible input_audio', async () => {
    mockFetch(() => jsonResp({ choices: [{ message: { content: '你好世界' } }] }));
    const result = await provider('qwen3-asr-flash').invoker()(
      taskInput({ task: 'asr', model: 'qwen3-asr-flash', prompt: '', audios: ['data:audio/webm;base64,aGVsbG8='] }),
    );
    expect(result.text).toBe('你好世界');
    expect(calls[0].url).toBe('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions');
    const body = JSON.parse(String(calls[0].init.body));
    // 百炼要求 data URI 形式(裸 base64 被拒),data 原样透传
    expect(body.messages[0].content[0]).toEqual({
      type: 'input_audio',
      input_audio: { data: 'data:audio/webm;base64,aGVsbG8=', format: 'webm' },
    });
  });

  it('asr: native sync sends {audio} content and reads message text', async () => {
    mockFetch(() => jsonResp({ output: { choices: [{ message: { content: [{ text: '欢迎使用阿里云' }] } }] } }));
    const result = await provider('qwen3-asr-flash').invoker()(
      taskInput({ task: 'asr', model: 'qwen3-asr-flash', prompt: '', audios: ['https://x/w.mp3'] }),
    );
    expect(result.text).toBe('欢迎使用阿里云');
    const body = JSON.parse(String(calls[0].init.body));
    expect(body.input.messages[0].content).toEqual([{ audio: 'https://x/w.mp3' }]);
  });

  it('image sync-first: qwen-image returns urls directly', async () => {
    mockFetch(() => jsonResp({ output: { choices: [{ message: { content: [{ image: 'https://x/i.png' }] } }] } }));
    const result = await provider('qwen-image-2.0').invoker()(
      taskInput({ task: 'image_gen', model: 'qwen-image-2.0' }),
    );
    expect(result.urls).toEqual(['https://x/i.png']);
    expect((calls[0].init.headers as Record<string, string>)['X-DashScope-Async']).toBeUndefined();
  });

  it('async fallback: resubmits with async header and polls the task', async () => {
    let submits = 0;
    mockFetch((url, init) => {
      if (url.includes('/tasks/')) {
        return jsonResp({ output: { task_status: 'SUCCEEDED', results: [{ url: 'https://x/done.png' }] } });
      }
      submits += 1;
      if (submits === 1) {
        return jsonResp({ message: 'current user api does not support synchronous calls' }, 400);
      }
      expect((init.headers as Record<string, string>)['X-DashScope-Async']).toBe('enable');
      return jsonResp({ output: { task_id: 't-1' } });
    });
    const result = await provider('qwen-image-2.1').invoker()(
      taskInput({ task: 'image_gen', model: 'qwen-image-2.1' }),
    );
    expect(result.urls).toEqual(['https://x/done.png']);
    expect(calls.some((c) => c.url === `${NATIVE}/tasks/t-1`)).toBe(true);
  });

  it('wan t2i: submits async to image-synthesis endpoint and polls', async () => {
    mockFetch((url) => {
      if (url.includes('/tasks/')) {
        return jsonResp({ output: { task_status: 'SUCCEEDED', results: [{ url: 'https://x/wan.png' }] } });
      }
      return jsonResp({ output: { task_id: 't-2' } });
    });
    const result = await provider('wan2.2-t2i-flash').invoker()(
      taskInput({ task: 'image_gen', model: 'wan2.2-t2i-flash' }),
    );
    expect(result.urls).toEqual(['https://x/wan.png']);
    expect(calls[0].url).toBe(`${NATIVE}/services/aigc/text2image/image-synthesis`);
    expect((calls[0].init.headers as Record<string, string>)['X-DashScope-Async']).toBe('enable');
  });

  it('wanx imageedit: routes to image2image endpoint with function and base image', async () => {
    mockFetch((url) => {
      if (url.includes('/tasks/')) {
        return jsonResp({ output: { task_status: 'SUCCEEDED', results: [{ url: 'https://x/edited.png' }] } });
      }
      return jsonResp({ output: { task_id: 't-9' } });
    });
    const result = await provider('wanx2.1-imageedit').invoker()(
      taskInput({
        task: 'image_gen',
        model: 'wanx2.1-imageedit',
        prompt: '去掉图中文字水印',
        images: ['data:image/png;base64,QUJD'],
        options: { function: 'remove_watermark', parameters: { upscale_factor: 2 } },
      }),
    );
    expect(result.urls).toEqual(['https://x/edited.png']);
    expect(calls[0].url).toBe(`${NATIVE}/services/aigc/image2image/image-synthesis`);
    expect((calls[0].init.headers as Record<string, string>)['X-DashScope-Async']).toBe('enable');
    const body = JSON.parse(String(calls[0].init.body));
    expect(body.input).toMatchObject({
      function: 'remove_watermark',
      prompt: '去掉图中文字水印',
      base_image_url: 'data:image/png;base64,QUJD',
    });
    expect(body.parameters).toMatchObject({ n: 1, upscale_factor: 2 });
  });

  it('qwen-image-edit: source images and n parameter pass through multimodal-generation', async () => {
    mockFetch(() =>
      jsonResp({
        output: { choices: [{ message: { content: [{ image: 'https://x/e1.png' }, { image: 'https://x/e2.png' }] } }] },
      }),
    );
    const result = await provider('qwen-image-edit-plus').invoker()(
      taskInput({
        task: 'image_gen',
        model: 'qwen-image-edit-plus',
        prompt: '把背景换成纯白',
        images: ['data:image/jpeg;base64,QUJD'],
        options: { parameters: { n: 2 } },
      }),
    );
    expect(result.urls).toEqual(['https://x/e1.png', 'https://x/e2.png']);
    const body = JSON.parse(String(calls[0].init.body));
    expect(body.input.messages[0].content[0]).toEqual({ image: 'data:image/jpeg;base64,QUJD' });
    expect(body.parameters).toEqual({ n: 2 });
  });

  it('wan2.7-image: new-generation wan image models go through multimodal-generation sync-first', async () => {
    mockFetch(() => jsonResp({ output: { choices: [{ message: { content: [{ image: 'https://x/w27.png' }] } }] } }));
    const result = await provider('wan2.7-image').invoker()(taskInput({ task: 'image_gen', model: 'wan2.7-image' }));
    expect(result.urls).toEqual(['https://x/w27.png']);
    expect(calls[0].url).toBe(`${NATIVE}/services/aigc/multimodal-generation/generation`);
    expect((calls[0].init.headers as Record<string, string>)['X-DashScope-Async']).toBeUndefined();
  });

  it('paraformer: async transcription task then fetches transcription_url', async () => {
    mockFetch((url) => {
      if (url.includes('/tasks/')) {
        return jsonResp({
          output: { task_status: 'SUCCEEDED', results: [{ transcription_url: 'https://x/tr.json' }] },
        });
      }
      if (url === 'https://x/tr.json') {
        return jsonResp({ transcripts: [{ text: '第一段' }, { text: '第二段' }] });
      }
      return jsonResp({ output: { task_id: 't-3' } });
    });
    const result = await provider('paraformer-v2').invoker()(
      taskInput({ task: 'asr', model: 'paraformer-v2', audios: ['https://x/long.mp3'] }),
    );
    expect(result.text).toBe('第一段\n第二段');
    expect(calls[0].url).toBe(`${NATIVE}/services/audio/asr/transcription`);
    const body = JSON.parse(String(calls[0].init.body));
    expect(body.input.file_urls).toEqual(['https://x/long.mp3']);
  });

  it('video: keeps sync-first submit to video-synthesis', async () => {
    mockFetch((url) => {
      if (url.includes('/tasks/')) {
        return jsonResp({ output: { task_status: 'SUCCEEDED', video_url: 'https://x/v.mp4' } });
      }
      return jsonResp({ output: { task_id: 't-4' } });
    });
    const result = await provider('wan2.5-i2v-preview').invoker()(
      taskInput({ task: 'video_gen', model: 'wan2.5-i2v-preview', images: ['https://x/ref.png'] }),
    );
    expect(result.urls).toEqual(['https://x/v.mp4']);
    expect(calls[0].url).toBe(`${NATIVE}/services/aigc/video-generation/video-synthesis`);
    const body = JSON.parse(String(calls[0].init.body));
    expect(body.input.img_url).toBe('https://x/ref.png');
  });

  it('abort signal cancels polling loops', async () => {
    mockFetch((url) => {
      if (url.includes('/tasks/')) return jsonResp({ output: { task_status: 'RUNNING' } });
      return jsonResp({ output: { task_id: 't-abort' } });
    });
    const controller = new AbortController();
    controller.abort();
    await expect(
      provider('wan2.2-t2i-flash').invoker()(
        taskInput({ task: 'image_gen', model: 'wan2.2-t2i-flash', signal: controller.signal }),
      ),
    ).rejects.toThrow(/取消/);
  });

  it('polling failure surfaces the task error message', async () => {
    mockFetch((url) => {
      if (url.includes('/tasks/')) {
        return jsonResp({ output: { task_status: 'FAILED', message: 'content policy' } });
      }
      return jsonResp({ output: { task_id: 't-5' } });
    });
    await expect(
      provider('wan2.2-t2i-flash').invoker()(taskInput({ task: 'image_gen', model: 'wan2.2-t2i-flash' })),
    ).rejects.toThrow(/content policy/);
  });
});
