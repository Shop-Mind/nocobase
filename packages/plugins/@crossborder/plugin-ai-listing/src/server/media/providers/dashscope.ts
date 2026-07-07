/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// 阿里云百炼(DashScope)媒体生成 Provider。统一走异步任务协议:提交(X-DashScope-Async: enable)拿 task_id,
// 轮询 GET /tasks/{id} 到 SUCCEEDED/FAILED。图像走千问系(qwen-image / qwen-image-edit,multimodal-generation
// 端点,指令式改图,对图内中文文字/水印处理最强,选型决策见 docs/media-studio-design.md §5);视频走万相系
// (wan i2v/t2v,video-synthesis 端点,千问系无视频模型)。模型名可经环境变量覆盖,便于不发版切换(如换万相改图)。

import type { MediaGenInput, MediaProvider, MediaSubmitResult, MediaTaskResult } from './types';

export interface DashScopeProviderOptions {
  apiKey: string;
  baseURL?: string;
  fetchImpl?: typeof fetch;
}

const DEFAULT_BASE_URL = 'https://dashscope.aliyuncs.com/api/v1';

const MODELS = {
  imageEdit: process.env.AI_LISTING_IMAGE_EDIT_MODEL || 'qwen-image-edit',
  textToImage: process.env.AI_LISTING_T2I_MODEL || 'qwen-image',
  imageToVideo: process.env.AI_LISTING_I2V_MODEL || 'wan2.2-i2v-flash',
  textToVideo: process.env.AI_LISTING_T2V_MODEL || 'wan2.2-t2v-flash',
};

// 兼容多种任务结果形状:万相类 output.results[0].url;千问多模态 output.choices[0].message.content 里的 image 项;
// 视频类 output.video_url。取不到返回 undefined,由调用方判失败。
export function extractResultUrl(output: unknown): string | undefined {
  const o = output as {
    results?: Array<{ url?: string }>;
    choices?: Array<{ message?: { content?: Array<{ image?: string }> | string } }>;
    video_url?: string;
  };
  const fromResults = o?.results?.[0]?.url;
  if (fromResults) return fromResults;
  const content = o?.choices?.[0]?.message?.content;
  if (Array.isArray(content)) {
    const imageItem = content.find((item) => item && typeof item === 'object' && typeof item.image === 'string');
    if (imageItem?.image) return imageItem.image;
  }
  return o?.video_url || undefined;
}

export function createDashScopeProvider(options: DashScopeProviderOptions): MediaProvider {
  const baseURL = (options.baseURL || DEFAULT_BASE_URL).replace(/\/$/, '');
  const doFetch = options.fetchImpl ?? fetch;
  const headers = {
    Authorization: `Bearer ${options.apiKey}`,
    'Content-Type': 'application/json',
    'X-DashScope-Async': 'enable',
  };

  async function submit(url: string, body: Record<string, unknown>): Promise<{ taskId: string }> {
    const resp = await doFetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    const json = (await resp.json()) as { output?: { task_id?: string }; message?: string; code?: string };
    const taskId = json?.output?.task_id;
    if (!resp.ok || !taskId) {
      throw new Error(`DashScope 提交失败(HTTP ${resp.status}): ${json?.message || json?.code || '未知错误'}`);
    }
    return { taskId };
  }

  return {
    name: 'dashscope',

    async submitImage(input: MediaGenInput): Promise<MediaSubmitResult> {
      const model = input.sourceImageUrl ? MODELS.imageEdit : MODELS.textToImage;
      const content: Array<Record<string, string>> = [];
      if (input.sourceImageUrl) content.push({ image: input.sourceImageUrl });
      content.push({ text: input.prompt });
      const { taskId } = await submit(`${baseURL}/services/aigc/multimodal-generation/generation`, {
        model,
        input: { messages: [{ role: 'user', content }] },
      });
      return { providerTaskId: taskId, model };
    },

    async submitVideo(input: MediaGenInput): Promise<MediaSubmitResult> {
      const model = input.sourceImageUrl ? MODELS.imageToVideo : MODELS.textToVideo;
      const hasParams = input.parameters && Object.keys(input.parameters).length > 0;
      const { taskId } = await submit(`${baseURL}/services/aigc/video-generation/video-synthesis`, {
        model,
        input: { prompt: input.prompt, ...(input.sourceImageUrl ? { img_url: input.sourceImageUrl } : {}) },
        ...(hasParams ? { parameters: input.parameters } : {}),
      });
      return { providerTaskId: taskId, model };
    },

    async pollTask(providerTaskId: string): Promise<MediaTaskResult> {
      const resp = await doFetch(`${baseURL}/tasks/${providerTaskId}`, { method: 'GET', headers });
      const json = (await resp.json()) as { output?: { task_status?: string; message?: string }; message?: string };
      const status = json?.output?.task_status;
      if (status === 'SUCCEEDED') {
        const resultUrl = extractResultUrl(json?.output);
        if (!resultUrl) return { status: 'failed', errorMessage: '任务成功但未返回结果 URL' };
        return { status: 'success', resultUrl };
      }
      if (status === 'FAILED' || status === 'CANCELED' || status === 'UNKNOWN') {
        return { status: 'failed', errorMessage: json?.output?.message || json?.message || `任务状态 ${status}` };
      }
      return { status: 'running' };
    },
  };
}
