/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { createDashScopeProvider, extractResultUrl } from '../providers/dashscope';

function fetchMock(handler: (url: string, init: RequestInit) => { status?: number; body: unknown }) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const { status = 200, body } = handler(url, init);
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

describe('dashscope media provider', () => {
  it('submits image edit to multimodal-generation with async header and source image', async () => {
    const { impl, calls } = fetchMock(() => ({ body: { output: { task_id: 't-img' } } }));
    const provider = createDashScopeProvider({ apiKey: 'sk-test', fetchImpl: impl });
    const result = await provider.submitImage({ prompt: '去除水印', sourceImageUrl: 'https://a/b.jpg' });
    expect(result.providerTaskId).toBe('t-img');
    expect(result.model).toBe('qwen-image-edit');
    expect(calls[0].url).toContain('/services/aigc/multimodal-generation/generation');
    expect((calls[0].init.headers as Record<string, string>)['X-DashScope-Async']).toBe('enable');
    expect((calls[0].init.headers as Record<string, string>)['Authorization']).toBe('Bearer sk-test');
    const body = JSON.parse(String(calls[0].init.body));
    expect(body.input.messages[0].content).toEqual([{ image: 'https://a/b.jpg' }, { text: '去除水印' }]);
  });

  it('uses text-to-image model when no source image, and video endpoint for videos', async () => {
    const { impl, calls } = fetchMock(() => ({ body: { output: { task_id: 't-x' } } }));
    const provider = createDashScopeProvider({ apiKey: 'sk', fetchImpl: impl });
    const img = await provider.submitImage({ prompt: '白底马克杯' });
    expect(img.model).toBe('qwen-image');
    const vid = await provider.submitVideo({ prompt: '旋转展示', sourceImageUrl: 'https://a/b.jpg' });
    expect(vid.model).toBe('wan2.2-i2v-flash');
    expect(calls[1].url).toContain('/services/aigc/video-generation/video-synthesis');
    expect(JSON.parse(String(calls[1].init.body)).input.img_url).toBe('https://a/b.jpg');
  });

  it('polls task status to success/failed/running', async () => {
    const { impl } = fetchMock((url) => {
      if (url.endsWith('/tasks/ok')) {
        return { body: { output: { task_status: 'SUCCEEDED', results: [{ url: 'https://x/y.png' }] } } };
      }
      if (url.endsWith('/tasks/bad')) {
        return { body: { output: { task_status: 'FAILED', message: 'quota' } } };
      }
      return { body: { output: { task_status: 'RUNNING' } } };
    });
    const provider = createDashScopeProvider({ apiKey: 'sk', fetchImpl: impl });
    expect(await provider.pollTask('ok')).toEqual({ status: 'success', resultUrl: 'https://x/y.png' });
    expect((await provider.pollTask('bad')).status).toBe('failed');
    expect((await provider.pollTask('pending')).status).toBe('running');
  });

  it('extracts result url from wanx/qwen/video shapes', () => {
    expect(extractResultUrl({ results: [{ url: 'a' }] })).toBe('a');
    expect(extractResultUrl({ choices: [{ message: { content: [{ text: 'hi' }, { image: 'b' }] } }] })).toBe('b');
    expect(extractResultUrl({ video_url: 'c' })).toBe('c');
    expect(extractResultUrl({})).toBeUndefined();
  });

  it('throws a readable error when submit is rejected', async () => {
    const { impl } = fetchMock(() => ({ status: 401, body: { code: 'InvalidApiKey', message: 'invalid key' } }));
    const provider = createDashScopeProvider({ apiKey: 'bad', fetchImpl: impl });
    await expect(provider.submitImage({ prompt: 'x' })).rejects.toThrow(/invalid key/);
  });
});
