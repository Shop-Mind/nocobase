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
  // 用户取消(会话 abort)信号:适配器应把它与超时组合,并在轮询循环中检查
  signal?: AbortSignal;
  options?: Record<string, unknown>;
}

// 超时与用户取消组合;signal 缺省时退化为纯超时。
// AbortSignal.any 运行时(Node ≥20.3)已支持,但声明构建所用 TS lib 尚未收录,故经类型断言访问。
type AbortSignalWithAny = typeof AbortSignal & { any(signals: AbortSignal[]): AbortSignal };
export function taskSignal(timeoutMs: number, signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? (AbortSignal as AbortSignalWithAny).any([timeout, signal]) : timeout;
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
  // 转存成功的产物对应的 File Manager 附件记录(与 urls 中的本地地址一一对应),
  // 供业务插件(如 ai-listing 候选资产)直接关联文件而无需二次下载
  files?: Array<{ fileId: number | string; url: string }>;
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
    // 视频参数通道(grok2api 系中转的 video_config):chat 形状本身没有时长/分辨率字段,grok2api 约定顶层
    // video_config = { seconds, resolution_name, size };把通用 parameters 映射过去。标准 OpenAI 兼容服务
    // 忽略未知顶层字段,对不支持该约定的网关无副作用。
    const params = (input.options?.parameters as Record<string, unknown>) || {};
    const videoConfig: Record<string, unknown> = {};
    if (input.task === 'video_gen') {
      if (Number(params.duration) > 0) videoConfig.seconds = Number(params.duration);
      if (params.resolution) videoConfig.resolution_name = String(params.resolution).toLowerCase();
      if (params.size) videoConfig.size = String(params.size);
    }
    // 视频生成显著慢于图像(实测 grok imagine 视频 >3 分钟),video_gen 放宽到 10 分钟;其余任务维持 3 分钟
    const resp = await fetch(`${opts.baseURL.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: jsonHeaders(opts.apiKey),
      body: JSON.stringify({
        model: input.model,
        messages: [{ role: 'user', content }],
        stream: false,
        ...(Object.keys(videoConfig).length ? { video_config: videoConfig } : {}),
      }),
      signal: taskSignal(input.task === 'video_gen' ? 600000 : 180000, input.signal),
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
    signal: taskSignal(180000, input.signal),
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

// 拆解 data:image/*;base64(源图内联):返回 base64 与 mime。非 data URI(已是 http URL)返回 null。
export function parseImageDataURI(uri: string): { base64: string; mime: string } | null {
  const m = String(uri || '').match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
  if (!m) return null;
  return { mime: m[1], base64: m[2] };
}

function shouldUseArrayImageField(opts: MediaTaskEndpointOptions, input: MediaTaskInput): boolean {
  const baseURL = opts.baseURL || '';
  return /grok-imagine/i.test(input.model) || /grok2api|120\.76\.157\.51:8001/.test(baseURL);
}

// 形状②a-edit:OpenAI images/edits(带源图编辑)。**有源图时必须走它而非 images/generations**——
// generations 不接收 image,源图会被丢弃、退化成纯文生图(与原图无关)。gpt-image 系支持 image[] 多图输入
// 与可选 mask(局部重绘)。上游偶发 TLS(bad record MAC)/500 抖动,对这类瞬时错误做少量重试。
export async function openAIImagesEdit(
  opts: MediaTaskEndpointOptions,
  input: MediaTaskInput,
): Promise<MediaTaskOutput> {
  const params = (input.options?.parameters as Record<string, unknown>) || {};
  const maskUrl = input.options?.maskImageUrl as string | undefined; // 硬 mask 预留(前端产二值 mask 时透传)
  const buildForm = async (): Promise<FormData> => {
    const form = new FormData();
    form.append('model', input.model);
    form.append('prompt', input.prompt);
    if (params.size) form.append('size', String(params.size));
    form.append('n', String(Math.max(1, Math.min(Number(params.n) || 1, 4))));
    const multi = input.images.length > 1;
    const imageFieldName = multi || shouldUseArrayImageField(opts, input) ? 'image[]' : 'image';
    input.images.forEach((uri, i) => {
      const p = parseImageDataURI(uri);
      if (!p) return;
      const blob = new Blob([Buffer.from(p.base64, 'base64')], { type: p.mime });
      form.append(imageFieldName, blob, `image${i}.${p.mime.split('/')[1] || 'png'}`);
    });
    if (maskUrl) {
      const mr = await fetch(maskUrl, { signal: taskSignal(30000, input.signal) });
      if (mr.ok) {
        form.append('mask', new Blob([Buffer.from(await mr.arrayBuffer())], { type: 'image/png' }), 'mask.png');
      }
    }
    return form;
  };
  let lastErr = '图像编辑失败';
  for (let attempt = 0; attempt < 3; attempt++) {
    const resp = await fetch(`${opts.baseURL.replace(/\/$/, '')}/images/edits`, {
      method: 'POST',
      headers: authHeaders(opts.apiKey),
      body: await buildForm(),
      signal: taskSignal(180000, input.signal),
    });
    const json = (await resp.json().catch(() => ({}))) as ErrorPayload & {
      data?: Array<{ url?: string; b64_json?: string }>;
    };
    if (resp.ok) {
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
    lastErr = errorMessage(resp.status, json, '图像编辑失败');
    // 仅对上游瞬时错误(TLS bad record MAC / 5xx / EOF / 超时)重试;4xx(参数/鉴权/限流)立即抛出
    const transient = resp.status >= 500 && /tls|bad record mac|internal_server_error|timeout|eof/i.test(lastErr);
    if (!transient || attempt === 2) {
      throw new Error(lastErr);
    }
  }
  throw new Error(lastErr);
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
    signal: taskSignal(120000, input.signal),
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
  const audioResp = await fetch(audioUrl, { signal: taskSignal(60000, input.signal) });
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
    signal: taskSignal(120000, input.signal),
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
        // 有源图 = 编辑(走 images/edits 带图);无源图 = 纯文生图(images/generations)。
        // 关键:generations 不接收 image,若拿它做编辑会丢源图、退化成与原图无关的文生图。
        return input.images?.length ? openAIImagesEdit(opts, input) : openAIImagesGeneration(opts, input);
      case 'tts':
        return openAISpeech(opts, input);
      case 'asr':
        return openAITranscription(opts, input);
      default:
        return chatShape(input);
    }
  };
}
