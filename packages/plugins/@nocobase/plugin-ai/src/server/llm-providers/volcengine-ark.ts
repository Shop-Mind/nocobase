/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// 火山方舟(Volcengine Ark):对话/视觉/深度思考走 OpenAI 兼容端点(含 reasoning_content);
// Seedream 生图为 OpenAI images/generations 形状(基类默认实现直接可用);
// Seedance 视频为任务式 API(/contents/generations/tasks 提交 + 轮询),本文件覆盖。
// 豆包语音(openspeech)鉴权与协议独立(app token + WebSocket),不纳入本 provider。

import { LLMProvider } from './provider';
import { SupportedModel } from '../manager/ai-manager';
import { ReasoningChatOpenAI } from './common/reasoning';
import { MediaTaskInvoker, taskSignal } from './common/media-task';

const ARK_URL = 'https://ark.cn-beijing.volces.com/api/v3';

export class VolcengineArkProvider extends LLMProvider {
  declare chatModel: ReasoningChatOpenAI;

  get baseURL() {
    return ARK_URL;
  }

  createModel() {
    const { apiKey } = this.serviceOptions || {};
    return new ReasoningChatOpenAI({
      apiKey,
      topP: 0.8,
      temperature: 0.7,
      ...this.modelOptions,
      configuration: {
        baseURL: this.getResolvedBaseURL(),
      },
      verbose: false,
    });
  }

  // 测试可覆盖轮询间隔以加速
  protected mediaTaskPollIntervalMs = 3000;

  protected createMediaTaskInvoker(): MediaTaskInvoker {
    // 生图(Seedream)/TTS/ASR 走基类 OpenAI 端点组;仅视频(Seedance)需要任务式协议
    const openAIDefault = super.createMediaTaskInvoker();
    const { apiKey } = this.serviceOptions || {};
    const base = this.getResolvedBaseURL().replace(/\/$/, '');
    const headers = { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' };

    return async (input) => {
      if (input.task !== 'video_gen') return openAIDefault(input);
      const content: Array<Record<string, unknown>> = [{ type: 'text', text: input.prompt }];
      if (input.images[0]) {
        content.push({ type: 'image_url', image_url: { url: input.images[0] } });
      }
      const submit = await fetch(`${base}/contents/generations/tasks`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ model: input.model, content }),
        signal: taskSignal(60000, input.signal),
      });
      const submitJson = (await submit.json()) as { id?: string; error?: { message?: string }; message?: string };
      if (!submit.ok || !submitJson?.id) {
        throw new Error(
          `视频任务提交失败(HTTP ${submit.status}):${submitJson?.error?.message || submitJson?.message || '未知错误'}`,
        );
      }
      // 轮询 ≤10 分钟
      for (let i = 0; i < 200; i++) {
        if (input.signal?.aborted) throw new Error('生成已取消');
        await new Promise((resolve) => setTimeout(resolve, this.mediaTaskPollIntervalMs));
        const poll = await fetch(`${base}/contents/generations/tasks/${submitJson.id}`, {
          headers,
          signal: taskSignal(15000, input.signal),
        });
        const pollJson = (await poll.json()) as {
          status?: string;
          content?: { video_url?: string };
          error?: { message?: string };
        };
        const status = pollJson?.status;
        if (status === 'succeeded') {
          const url = pollJson?.content?.video_url;
          if (!url) throw new Error('任务成功但未返回视频 URL');
          return { urls: [url] };
        }
        if (status === 'failed' || status === 'cancelled' || status === 'expired') {
          throw new Error(`生成任务失败:${pollJson?.error?.message || `状态 ${status}`}`);
        }
      }
      throw new Error('生成任务超时(10 分钟),请稍后重试');
    };
  }
}

export const volcengineArkProviderOptions = {
  title: '{{t("Volcengine Ark", {ns: "ai"})}}',
  supportedModel: [SupportedModel.LLM],
  models: {
    [SupportedModel.LLM]: [
      'doubao-seed-1.8',
      'doubao-1.5-pro-32k',
      'doubao-1.5-vision-pro',
      'deepseek-v3.2',
      'doubao-seedream-4-5',
      'doubao-seedance-1-5-pro',
    ],
  },
  provider: VolcengineArkProvider,
};
