/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { AIMessageChunk } from '@langchain/core/messages';
import { OpenAIEmbeddings } from '@langchain/openai';
import { EmbeddingProvider, LLMProvider } from './provider';
import { EmbeddingsInterface } from '@langchain/core/embeddings';
import { SupportedModel } from '../manager/ai-manager';
import { Context } from '@nocobase/actions';
import { Model } from '@nocobase/database';
import _ from 'lodash';
import PluginAIServer from '../plugin';
import path from 'node:path';
import { ReasoningChatOpenAI } from './common/reasoning';
import {
  extractMediaUrls,
  MediaTaskInput,
  MediaTaskInvoker,
  MediaTaskOutput,
  parseAudioDataURI,
  pcmToWav,
  taskSignal,
} from './common/media-task';
import { persistMediaTaskOutput } from './common/media-persist';
import { AttachmentModel } from '@nocobase/plugin-file-manager';

const DASHSCOPE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1';

export class DashscopeProvider extends LLMProvider {
  declare chatModel: ReasoningChatOpenAI;

  get baseURL() {
    return DASHSCOPE_URL;
  }

  createModel() {
    const { apiKey } = this.serviceOptions || {};
    const { responseFormat, structuredOutput } = this.modelOptions || {};
    const { name, schema } = structuredOutput || {};

    const modelKwargs: Record<string, any> = {};

    // Only set response_format when responseFormat is explicitly provided
    // Dashscope API rejects { type: undefined }
    if (responseFormat) {
      const responseFormatOptions: Record<string, any> = {
        type: responseFormat,
      };
      if (responseFormat === 'json_schema' && schema) {
        responseFormatOptions['json_schema'] = { schema, name: name ?? 'schema' };
      }
      modelKwargs['response_format'] = responseFormatOptions;
    } else {
      modelKwargs['response_format'] = { type: 'text' };
    }

    if (this.modelOptions?.builtIn?.webSearch === true) {
      // enable platform's web search ability
      // ref: https://bailian.console.aliyun.com/?tab=doc#/doc/?type=model&url=2867560
      modelKwargs['enable_search'] = true;
    }

    // 语音回复(omni 全模态):请求追加 modalities+audio,流式音频帧由 ReasoningChatOpenAI 聚合,
    // 结束后经 audioReplySink 拼 WAV 转存 File Manager,以 <audio> 气泡追加到消息末尾
    const voiceReply =
      this.modelOptions?.builtIn?.voiceReply === true &&
      this.getModelCapability(String(this.modelOptions?.model || '')).output.includes('audio');
    if (voiceReply) {
      modelKwargs['modalities'] = ['text', 'audio'];
      modelKwargs['audio'] = { voice: 'Cherry', format: 'wav' };
    }

    const model = new ReasoningChatOpenAI({
      apiKey,
      topP: 0.8,
      temperature: 0.7,
      ...this.modelOptions,
      modelKwargs,
      configuration: {
        baseURL: this.getResolvedBaseURL(),
      },
      verbose: false,
    });
    if (voiceReply) {
      model.audioReplySink = async (pcm) => {
        const output = await persistMediaTaskOutput(this.app, {
          urls: [],
          binaries: [{ base64: pcmToWav(pcm).toString('base64'), mimeType: 'audio/wav' }],
        });
        return output.persisted && output.urls[0] ? output.urls[0] : null;
      };
    }
    return model;
  }

  // DashScope 的 OpenAI 兼容端点不返回生图/生视频内容(实测 message 仅含 role),生成类模型必须走原生协议。
  // 各任务端点与调用模式:qwen-image/TTS/ASR 原生同步(multimodal-generation);万相 t2i(image-synthesis)、
  // 视频(video-synthesis)、paraformer 转写(transcription)为异步任务+轮询。qwen-image 系约束不一
  // (实测 qwen-image-2.0 仅同步,异步被 403;部分账号相反)——采用「同步优先、异步自动回退」。
  // 测试可覆盖轮询间隔以加速
  protected mediaTaskPollIntervalMs = 3000;

  protected createMediaTaskInvoker(): MediaTaskInvoker {
    const { apiKey } = this.serviceOptions || {};
    const compatBase = this.getResolvedBaseURL().replace(/\/$/, '');
    const nativeBase = this.getResolvedBaseURL().replace(/\/compatible-mode\/v1\/?$/, '/api/v1');
    const baseHeaders = { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' };

    type NativeOutput = Record<string, unknown> & {
      task_id?: string;
      task_status?: string;
      choices?: Array<{ message?: { content?: unknown } }>;
      results?: unknown;
      video_url?: string;
      audio?: { url?: string };
      message?: string;
    };
    type SubmitResult = {
      ok: boolean;
      status: number;
      json?: { output?: NativeOutput; message?: string; code?: string };
    };
    const extractUrls = (output?: NativeOutput): string[] => [
      ...extractMediaUrls(output?.results),
      ...extractMediaUrls(output?.choices?.[0]?.message?.content),
      ...extractMediaUrls(output?.video_url),
    ];
    const failure = (action: string, r: SubmitResult) =>
      new Error(`${action}(HTTP ${r.status}):${r.json?.message || r.json?.code || '未知错误'}`);
    // 同步生成会长时间占连接,本地代理偶发断连/吞响应(实测)——必须显式超时,把"无限挂起"变成可见错误;
    // 网络层错误重试一次。提交(同步含生成耗时)150s,轮询 15s。
    const callOnce = async (url: string, init: RequestInit, timeoutMs: number, signal?: AbortSignal) => {
      const withSignal = (base: RequestInit) => ({ ...base, signal: taskSignal(timeoutMs, signal) });
      try {
        return await fetch(url, withSignal(init));
      } catch {
        return await fetch(url, withSignal(init));
      }
    };
    const submit = async (
      url: string,
      payload: Record<string, unknown>,
      asyncMode: boolean,
      signal?: AbortSignal,
    ): Promise<SubmitResult> => {
      const headers = asyncMode ? { ...baseHeaders, 'X-DashScope-Async': 'enable' } : baseHeaders;
      const resp = await callOnce(url, { method: 'POST', headers, body: JSON.stringify(payload) }, 150000, signal);
      const json = (await resp.json()) as SubmitResult['json'];
      return { ok: resp.ok, status: resp.status, json };
    };
    const pollTask = async (
      taskId: string,
      maxTries: number,
      timeoutLabel: string,
      signal?: AbortSignal,
    ): Promise<NativeOutput> => {
      for (let i = 0; i < maxTries; i++) {
        if (signal?.aborted) throw new Error('生成已取消');
        await new Promise((resolve) => setTimeout(resolve, this.mediaTaskPollIntervalMs));
        const pollResp = await callOnce(
          `${nativeBase}/tasks/${taskId}`,
          { method: 'GET', headers: baseHeaders },
          15000,
          signal,
        );
        const pollJson = (await pollResp.json()) as { output?: NativeOutput };
        const status = pollJson?.output?.task_status;
        if (status === 'SUCCEEDED') return pollJson.output;
        if (status === 'FAILED' || status === 'CANCELED' || status === 'UNKNOWN') {
          throw new Error(`生成任务失败:${pollJson?.output?.message || `状态 ${status}`}`);
        }
      }
      throw new Error(`生成任务超时(${timeoutLabel}),请稍后重试`);
    };
    const submitAsyncTask = async (
      url: string,
      payload: Record<string, unknown>,
      signal?: AbortSignal,
    ): Promise<string> => {
      const r = await submit(url, payload, true, signal);
      const taskId = r.json?.output?.task_id;
      if (!r.ok || !taskId) throw failure('DashScope 任务提交失败', r);
      return taskId;
    };
    const genUrl = `${nativeBase}/services/aigc/multimodal-generation/generation`;

    // TTS:原生同步,input.{text,voice} → output.audio.url(wav)
    const invokeTTS = async (input: MediaTaskInput): Promise<MediaTaskOutput> => {
      const voice = (input.options?.voice as string) || 'Cherry';
      const r = await submit(genUrl, { model: input.model, input: { text: input.prompt, voice } }, false, input.signal);
      if (!r.ok) throw failure('语音合成失败', r);
      const url = r.json?.output?.audio?.url;
      if (!url) throw new Error('模型未返回音频 URL');
      return { urls: [url] };
    };

    // ASR 同步(qwen3-asr/qwen-audio-asr):messages 内容为 {audio} 块,可选 system 文本做转写上下文
    const invokeASRSync = async (input: MediaTaskInput): Promise<MediaTaskOutput> => {
      if (!input.audios.length) throw new Error('语音识别需要音频输入');
      const messages = [
        ...(input.prompt ? [{ role: 'system', content: [{ text: input.prompt }] }] : []),
        { role: 'user', content: input.audios.map((audio) => ({ audio })) },
      ];
      const r = await submit(genUrl, { model: input.model, input: { messages } }, false, input.signal);
      if (!r.ok) throw failure('语音识别失败', r);
      const content = r.json?.output?.choices?.[0]?.message?.content;
      const text =
        typeof content === 'string'
          ? content
          : Array.isArray(content)
            ? (content as Array<{ text?: string }>)
                .map((b) => b?.text)
                .filter(Boolean)
                .join('')
            : '';
      if (!text) throw new Error('模型未返回转写文本');
      return { urls: [], text };
    };

    // ASR base64(浏览器录音听写等本地音频):OpenAI 兼容 input_audio 内容块,无需公网 URL。
    // 实测百炼要求 data 为 data URI 形式(裸 base64 被拒 "URL 无效")
    const invokeASRBase64 = async (input: MediaTaskInput): Promise<MediaTaskOutput> => {
      const parsed = parseAudioDataURI(input.audios[0]);
      if (!parsed) throw new Error('无效的音频数据');
      const resp = await callOnce(
        `${compatBase}/chat/completions`,
        {
          method: 'POST',
          headers: baseHeaders,
          body: JSON.stringify({
            model: input.model,
            stream: false,
            messages: [
              ...(input.prompt ? [{ role: 'system', content: input.prompt }] : []),
              {
                role: 'user',
                content: [{ type: 'input_audio', input_audio: { data: input.audios[0], format: parsed.format } }],
              },
            ],
          }),
        },
        150000,
        input.signal,
      );
      const json = (await resp.json()) as {
        choices?: Array<{ message?: { content?: unknown } }>;
        error?: { message?: string };
        message?: string;
      };
      if (!resp.ok) {
        throw new Error(`语音识别失败(HTTP ${resp.status}):${json?.error?.message || json?.message || '未知错误'}`);
      }
      const content = json?.choices?.[0]?.message?.content;
      // qwen3-asr 的回复会夹杂 "User query" 模板残留(实测),清洗后再返回
      const text = (typeof content === 'string' ? content : '').replace(/User query[,，。]?/g, '').trim();
      if (!text) throw new Error('模型未返回转写文本');
      return { urls: [], text };
    };

    // ASR 异步(paraformer/fun-asr/sensevoice):file_urls 需公网可达,产物是 transcription_url 指向的 JSON
    const invokeASRFile = async (input: MediaTaskInput): Promise<MediaTaskOutput> => {
      if (!input.audios.length) throw new Error('转写需要音频文件地址(公网可访问)');
      const taskId = await submitAsyncTask(
        `${nativeBase}/services/audio/asr/transcription`,
        {
          model: input.model,
          input: { file_urls: input.audios },
          parameters: { language_hints: ['zh', 'en'] },
        },
        input.signal,
      );
      const output = await pollTask(taskId, 100, '5 分钟', input.signal);
      const results = (output?.results as Array<{ transcription_url?: string }>) || [];
      const texts: string[] = [];
      for (const item of results) {
        if (!item?.transcription_url) continue;
        const tr = await callOnce(item.transcription_url, { method: 'GET' }, 15000);
        const tj = (await tr.json()) as { transcripts?: Array<{ text?: string }> };
        for (const t of tj?.transcripts || []) {
          if (t?.text) texts.push(t.text);
        }
      }
      if (!texts.length) throw new Error('转写任务成功但未返回文本');
      return { urls: [], text: texts.join('\n') };
    };

    // function 式图像编辑(wanx2.1-imageedit 系:超分/扩图/去文字水印/mask 局部重绘等专项):仅异步,
    // 专用 image2image 端点;base_image_url / mask_image_url 支持公网 URL 或 base64 data URI
    const invokeImageEdit = async (input: MediaTaskInput): Promise<MediaTaskOutput> => {
      if (!input.images.length) throw new Error('图像编辑需要源图输入');
      const options = input.options || {};
      const taskId = await submitAsyncTask(
        `${nativeBase}/services/aigc/image2image/image-synthesis`,
        {
          model: input.model,
          input: {
            function: (options.function as string) || 'description_edit',
            prompt: input.prompt,
            base_image_url: input.images[0],
            ...(options.maskImageUrl ? { mask_image_url: options.maskImageUrl } : {}),
          },
          parameters: { n: 1, ...((options.parameters as Record<string, unknown>) || {}) },
        },
        input.signal,
      );
      const output = await pollTask(taskId, 40, '2 分钟', input.signal);
      const urls = extractUrls(output);
      if (!urls.length) throw new Error('任务成功但未返回媒体 URL');
      return { urls };
    };

    // 万相文生图:仅异步,专用 image-synthesis 端点
    const invokeWanT2I = async (input: MediaTaskInput): Promise<MediaTaskOutput> => {
      const taskId = await submitAsyncTask(
        `${nativeBase}/services/aigc/text2image/image-synthesis`,
        {
          model: input.model,
          input: { prompt: input.prompt },
          parameters: { n: 1 },
        },
        input.signal,
      );
      const output = await pollTask(taskId, 40, '2 分钟', input.signal);
      const urls = extractUrls(output);
      if (!urls.length) throw new Error('任务成功但未返回媒体 URL');
      return { urls };
    };

    // qwen-image 系与视频:同步优先、异步自动回退
    const invokeGeneration = async (input: MediaTaskInput): Promise<MediaTaskOutput> => {
      const isVideo = input.task === 'video_gen';
      const submitUrl = isVideo ? `${nativeBase}/services/aigc/video-generation/video-synthesis` : genUrl;
      const payload = isVideo
        ? {
            model: input.model,
            input: { prompt: input.prompt, ...(input.images[0] ? { img_url: input.images[0] } : {}) },
          }
        : {
            model: input.model,
            input: {
              messages: [
                { role: 'user', content: [...input.images.map((image) => ({ image })), { text: input.prompt }] },
              ],
            },
            // 生成参数透传(n/size/negative_prompt/watermark 等):qwen-image-edit 系支持 n=1~6 多候选
            ...(input.options?.parameters ? { parameters: input.options.parameters } : {}),
          };
      // 1) 同步优先
      let r = await submit(submitUrl, payload, false, input.signal);
      let taskId = r.json?.output?.task_id;
      if (r.ok && !taskId) {
        const urls = extractUrls(r.json?.output);
        if (!urls.length) throw new Error(`模型未返回媒体 URL:${r.json?.message || r.json?.code || '空响应'}`);
        return { urls };
      }
      // 2) 明确要求异步(或同步被拒)→ 带异步头重提;其他业务错误直接抛出
      if (!r.ok && !taskId) {
        if (!/synchronous|async/i.test(String(r.json?.message || ''))) {
          throw failure('DashScope 生成失败', r);
        }
        r = await submit(submitUrl, payload, true, input.signal);
        taskId = r.json?.output?.task_id;
        if (!r.ok || !taskId) throw failure('DashScope 生成任务提交失败', r);
      }
      // 3) 轮询任务(视频 ≤10min,图片 ≤2min)
      const output = await pollTask(taskId, isVideo ? 200 : 40, isVideo ? '10 分钟' : '2 分钟', input.signal);
      const urls = extractUrls(output);
      if (!urls.length) throw new Error('任务成功但未返回媒体 URL');
      return { urls };
    };

    return async (input) => {
      switch (input.task) {
        case 'tts':
          return invokeTTS(input);
        case 'asr':
          if (input.audios[0]?.startsWith('data:')) return invokeASRBase64(input);
          return /paraformer|fun-asr|sensevoice/i.test(input.model) ? invokeASRFile(input) : invokeASRSync(input);
        case 'image_gen':
          // function 式编辑(wanx2.1-imageedit)先于 ^wanx 老一代规则判断,走 image2image 异步端点;
          // 仅老一代万相文生图(wan2.x-t2i-*/wanx*)走专用 image-synthesis 异步端点;
          // 新一代 wan*-image(如 wan2.7-image)与 qwen-image(-edit)同挂 multimodal-generation(实测),
          // 输入图经 messages content 透传——指令式改图与文生图同一条路
          if (/imageedit/i.test(input.model)) return invokeImageEdit(input);
          return /^wan[0-9x.]*[-.]?t2i|^wanx/i.test(input.model) ? invokeWanT2I(input) : invokeGeneration(input);
        default:
          return invokeGeneration(input);
      }
    };
  }

  isToolConflict(): boolean {
    return true;
  }

  resolveTools(toolDefinitions: any[]): any[] {
    // 联网搜索与语音回复均与函数调用互斥(百炼限制/稳定性考虑):开启时不绑定工具
    if (
      this.isToolConflict() &&
      (this.modelOptions?.builtIn?.webSearch === true || this.modelOptions?.builtIn?.voiceReply === true)
    ) {
      return [];
    } else {
      return toolDefinitions;
    }
  }

  parseResponseMessage(message: Model) {
    const result = super.parseResponseMessage(message);
    if (['user', 'tool'].includes(result?.role)) {
      return result;
    }
    const { metadata } = message?.toJSON() ?? {};
    if (!_.isEmpty(metadata?.additional_kwargs?.reasoning_content)) {
      result.content = {
        ...(result.content ?? {}),
        reasoning: {
          status: 'stop',
          content: metadata?.additional_kwargs.reasoning_content,
        },
      };
    }
    return result;
  }

  parseReasoningContent(chunk: AIMessageChunk): { status: string; content: string } {
    if (!_.isEmpty(chunk?.additional_kwargs?.reasoning_content)) {
      return {
        status: 'streaming',
        content: chunk.additional_kwargs.reasoning_content as string,
      };
    }
    return null;
  }

  // 把百炼的原始错误翻译成用户能行动的提示;未识别的错误保持原样
  parseResponseError(err: unknown): string {
    const message = super.parseResponseError(err) ?? '';
    if (/Unexpected item type in content|messages input is invalid/i.test(message)) {
      return '当前模型不支持图片等多媒体内容(会话中包含图片)。请切换视觉模型(如 qwen-vl-max)重试,或开启新会话。';
    }
    if (/Access denied|unpurchased|Model not exist|model not found/i.test(message)) {
      return '当前模型不可用:可能未开通或无权限,请在百炼控制台确认后重试。原始信息:' + message;
    }
    return message;
  }

  // 百炼兼容端点要求 input_audio.data 为 data URI(裸 base64 报 "URL 无效"),在基类产物上补前缀
  protected async convertToContent(ctx: Context, attachment: AttachmentModel) {
    const parsed = await super.convertToContent(ctx, attachment);
    const content = parsed?.content as { type?: string; input_audio?: { data?: string } } | undefined;
    if (content?.type === 'input_audio' && content.input_audio?.data && !content.input_audio.data.startsWith('data:')) {
      content.input_audio.data = `data:;base64,${content.input_audio.data}`;
    }
    return parsed;
  }

  protected isApiSupportedAttachment(attachment: AttachmentModel): boolean {
    // 仅具备对应输入能力的模型(由能力注册中心判定)接收图像/音频内容;文本模型(qwen-max 等)收到
    // 多媒体块会被百炼以 InvalidParameter 400 拒绝并打断整轮对话——改走基类"不支持解析附件"的
    // 友好提示路径,让模型礼貌告知用户切换模型,而不是报错
    const capability = this.getModelCapability(String(this.modelOptions?.model || ''));
    if (attachment.mimetype?.startsWith('audio/')) {
      return capability.input.includes('audio');
    }
    if (!attachment.mimetype?.startsWith('image/')) {
      return false;
    }
    return capability.input.includes('image');
  }
}

export class DashscopeEmbeddingProvider extends EmbeddingProvider {
  protected getDefaultUrl(): string {
    return DASHSCOPE_URL;
  }

  createEmbedding(): EmbeddingsInterface {
    return new OpenAIEmbeddings({
      configuration: {
        baseURL: this.baseURL,
        apiKey: this.apiKey,
      },
      model: this.model,
    });
  }
}

export const dashscopeProviderOptions = {
  title: '{{t("Dashscope", {ns: "ai"})}}',
  supportedModel: [SupportedModel.LLM, SupportedModel.EMBEDDING],
  supportWebSearch: true,
  models: {
    [SupportedModel.LLM]: [
      'qwen-long',
      'qwq-plus',
      'qwen-max',
      'qwen-plus',
      'qwen-turbo',
      'qwen-math-plus',
      'qwen-math-turbo',
      'qwen-coder-plus',
      'qwen-coder-turbo',
    ],
    [SupportedModel.EMBEDDING]: [
      'text-embedding-v4',
      'text-embedding-v3',
      'text-embedding-v2',
      'text-embedding-v1',
      'text-embedding-async-v2',
      'text-embedding-async-v1',
    ],
  },
  provider: DashscopeProvider,
  embedding: DashscopeEmbeddingProvider,
};
