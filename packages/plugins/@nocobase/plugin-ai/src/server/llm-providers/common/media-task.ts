/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// 统一媒体任务接口(提供商无关):生图/生视频/TTS/ASR 都收敛为 invokeMediaTask({task, model, prompt,
// images, audios, options}) → { urls, text, binaries }。本文件同时提供 OpenAI 标准三端点
// (images/generations、audio/speech、audio/transcriptions)与 chat/completions 图像输出两种协议形状的
// 默认实现,供 OpenAI/Ark 系服务直接复用;DashScope 原生协议在 dashscope.ts 覆盖;Gemini
// generateContent 形状预留给 Phase 7(接口位即 MediaTaskInvoker,无需新抽象)。

export type MediaTask = 'image_gen' | 'video_gen' | 'tts' | 'asr';

export interface MediaTaskInput {
  task: MediaTask;
  model: string;
  // 生成类为提示词;TTS 为要朗读的文本;ASR 为可选的转写上下文提示
  prompt: string;
  images: string[];
  audios: string[];
  options?: Record<string, unknown>;
}

// 二进制产物(gpt-image 的 b64_json、OpenAI TTS 的音频流):Phase 2 统一转存 File Manager,当前原样返回
export interface MediaTaskBinary {
  base64: string;
  mimeType: string;
}

export interface MediaTaskOutput {
  urls: string[];
  text?: string;
  binaries?: MediaTaskBinary[];
  // 产物已全部转存 File Manager(urls 为本地地址);false/缺省 = 存在临时链接,渲染层保留时效提示
  persisted?: boolean;
}

export type MediaTaskInvoker = (input: MediaTaskInput) => Promise<MediaTaskOutput>;

export interface MediaTaskEndpointOptions {
  apiKey: string;
  baseURL: string;
}

type ContentBlock = { type?: string; text?: string; image_url?: { url?: string }; image?: string; url?: string };

export function extractMediaUrls(content: unknown): string[] {
  if (typeof content === 'string') {
    return Array.from(content.matchAll(/https?:\/\/[^\s)"']+/g)).map((m) => m[0]);
  }
  if (Array.isArray(content)) {
    return (content as ContentBlock[])
      .map((b) => b?.image_url?.url || b?.image || b?.url)
      .filter((u): u is string => typeof u === 'string');
  }
  return [];
}

// 音频 MIME 子类型 → 各家 input_audio.format 取值(常见别名归一)
export function audioMimeToFormat(mimetype: string): string {
  const subtype = String(mimetype || '')
    .split('/')
    .pop()
    ?.split(';')[0]
    ?.trim()
    .toLowerCase();
  const alias: Record<string, string> = { 'x-wav': 'wav', wave: 'wav', mpeg: 'mp3', 'x-m4a': 'm4a', mp4: 'm4a' };
  return alias[subtype] || subtype || 'wav';
}

// 拆解 data:audio/*;base64 数据(浏览器录音、附件内联):返回 base64 与 format
export function parseAudioDataURI(uri: string): { base64: string; format: string } | null {
  const match = String(uri || '').match(/^data:(audio\/[a-z0-9.+-]+);base64,(.+)$/i);
  if (!match) return null;
  return { base64: match[2], format: audioMimeToFormat(match[1]) };
}

// 流式语音回复的 PCM 帧(16bit 小端)拼 WAV 头,得到可直接播放/落库的完整文件
export function pcmToWav(pcm: Buffer, sampleRate = 24000, channels = 1, bitDepth = 16): Buffer {
  const byteRate = (sampleRate * channels * bitDepth) / 8;
  const blockAlign = (channels * bitDepth) / 8;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitDepth, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

const authHeaders = (apiKey: string) => ({ Authorization: `Bearer ${apiKey}` });
const jsonHeaders = (apiKey: string) => ({ ...authHeaders(apiKey), 'Content-Type': 'application/json' });

type ErrorPayload = { error?: { message?: string } | string; message?: string };

function errorMessage(status: number, payload: ErrorPayload | undefined, fallback: string): string {
  const error = payload?.error;
  const detail = (typeof error === 'string' ? error : error?.message) || payload?.message || '未知错误';
  return `${fallback}(HTTP ${status}):${detail}`;
}

// 形状①:OpenAI chat/completions 图像/视频输出(dashscope 兼容端点、openrouter 等把生成结果放进
// assistant message 的模型通用)
export function openAICompatibleMediaGeneration(opts: MediaTaskEndpointOptions): MediaTaskInvoker {
  return async (input: MediaTaskInput): Promise<MediaTaskOutput> => {
    const content: Array<Record<string, unknown>> = [
      ...input.images.map((url) => ({ type: 'image_url', image_url: { url } })),
      { type: 'text', text: input.prompt },
    ];
    const resp = await fetch(`${opts.baseURL.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: jsonHeaders(opts.apiKey),
      body: JSON.stringify({ model: input.model, messages: [{ role: 'user', content }], stream: false }),
      signal: AbortSignal.timeout(180000),
    });
    const json = (await resp.json()) as ErrorPayload & {
      choices?: Array<{ message?: { content?: unknown; images?: Array<{ image_url?: { url?: string } }> } }>;
    };
    if (!resp.ok) {
      throw new Error(errorMessage(resp.status, json, '媒体生成失败'));
    }
    const message = json?.choices?.[0]?.message;
    const urls = [
      ...extractMediaUrls(message?.content),
      ...(message?.images || []).map((i) => i?.image_url?.url).filter((u): u is string => typeof u === 'string'),
    ];
    return { urls, text: typeof message?.content === 'string' ? message.content : undefined };
  };
}

// 形状②a:OpenAI images/generations(gpt-image 只回 b64_json,dall-e 回 url——两者都收)
export async function openAIImagesGeneration(
  opts: MediaTaskEndpointOptions,
  input: MediaTaskInput,
): Promise<MediaTaskOutput> {
  const resp = await fetch(`${opts.baseURL.replace(/\/$/, '')}/images/generations`, {
    method: 'POST',
    headers: jsonHeaders(opts.apiKey),
    body: JSON.stringify({ model: input.model, prompt: input.prompt, n: 1, ...(input.options || {}) }),
    signal: AbortSignal.timeout(180000),
  });
  const json = (await resp.json()) as ErrorPayload & { data?: Array<{ url?: string; b64_json?: string }> };
  if (!resp.ok) {
    throw new Error(errorMessage(resp.status, json, '图像生成失败'));
  }
  const data = json?.data || [];
  const urls = data.map((d) => d?.url).filter((u): u is string => typeof u === 'string');
  const binaries = data
    .filter((d) => typeof d?.b64_json === 'string')
    .map((d) => ({ base64: d.b64_json as string, mimeType: 'image/png' }));
  if (!urls.length && !binaries.length) {
    throw new Error('模型未返回图像结果');
  }
  return { urls, binaries };
}

// 形状②b:OpenAI audio/speech(响应体是音频二进制流)
export async function openAISpeech(opts: MediaTaskEndpointOptions, input: MediaTaskInput): Promise<MediaTaskOutput> {
  const resp = await fetch(`${opts.baseURL.replace(/\/$/, '')}/audio/speech`, {
    method: 'POST',
    headers: jsonHeaders(opts.apiKey),
    body: JSON.stringify({
      model: input.model,
      input: input.prompt,
      voice: (input.options?.voice as string) || 'alloy',
    }),
    signal: AbortSignal.timeout(120000),
  });
  if (!resp.ok) {
    const payload = (await resp.json().catch(() => undefined)) as ErrorPayload | undefined;
    throw new Error(errorMessage(resp.status, payload, '语音合成失败'));
  }
  const base64 = Buffer.from(await resp.arrayBuffer()).toString('base64');
  return { urls: [], binaries: [{ base64, mimeType: resp.headers.get('content-type') || 'audio/mpeg' }] };
}

// 形状②c:OpenAI audio/transcriptions(multipart 上传音频文件)
export async function openAITranscription(
  opts: MediaTaskEndpointOptions,
  input: MediaTaskInput,
): Promise<MediaTaskOutput> {
  const audioUrl = input.audios[0];
  if (!audioUrl) {
    throw new Error('转写需要音频输入');
  }
  const audioResp = await fetch(audioUrl, { signal: AbortSignal.timeout(60000) });
  if (!audioResp.ok) {
    throw new Error(`音频文件下载失败(HTTP ${audioResp.status})`);
  }
  const filename = audioUrl.split('?')[0].split('/').pop() || 'audio.mp3';
  const form = new FormData();
  form.append('file', await audioResp.blob(), filename);
  form.append('model', input.model);
  // 不手工设置 Content-Type:multipart boundary 由 FormData 生成
  const resp = await fetch(`${opts.baseURL.replace(/\/$/, '')}/audio/transcriptions`, {
    method: 'POST',
    headers: authHeaders(opts.apiKey),
    body: form,
    signal: AbortSignal.timeout(120000),
  });
  const json = (await resp.json()) as ErrorPayload & { text?: string };
  if (!resp.ok) {
    throw new Error(errorMessage(resp.status, json, '语音识别失败'));
  }
  return { urls: [], text: json?.text || '' };
}

// 基类默认路由:image_gen/tts/asr 走 OpenAI 标准端点,video_gen(无标准端点)回落 chat/completions 形状
export function openAIMediaTaskInvoker(opts: MediaTaskEndpointOptions): MediaTaskInvoker {
  const chatShape = openAICompatibleMediaGeneration(opts);
  return async (input: MediaTaskInput): Promise<MediaTaskOutput> => {
    switch (input.task) {
      case 'image_gen':
        return openAIImagesGeneration(opts, input);
      case 'tts':
        return openAISpeech(opts, input);
      case 'asr':
        return openAITranscription(opts, input);
      default:
        return chatShape(input);
    }
  };
}
