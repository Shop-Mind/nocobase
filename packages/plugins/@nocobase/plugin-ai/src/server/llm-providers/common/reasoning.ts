/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { AIMessage, AIMessageChunk, BaseMessage } from '@langchain/core/messages';
import { ChatGenerationChunk } from '@langchain/core/outputs';
import { ChatOpenAICompletions } from '@langchain/openai';
import type OpenAI from 'openai';

export const REASONING_MAP_KEY = '__nb_reasoning_map';
export const MODEL_KWARGS_KEY = '__nb_model_kwargs';

// 语音回复(omni 全模态)流式音频的落库回调:PCM 聚合完成后由提供商转存 File Manager,返回本地 URL
export type AudioReplySink = (pcm: Buffer) => Promise<string | null>;

export const collectReasoningMap = (messages: BaseMessage[]) => {
  const reasoningMap = new Map<string, string>();
  for (let i = 0; i < messages.length; i++) {
    const message = (messages ?? [])[i];
    if (!AIMessage.isInstance(message)) {
      continue;
    }
    const reasoningContent = message.additional_kwargs?.reasoning_content;
    if (reasoningContent == null || typeof reasoningContent !== 'string') {
      continue;
    }
    reasoningMap.set(String(i), reasoningContent);
  }
  return reasoningMap;
};

export const patchRequestMessagesReasoning = (request: any, reasoningMap?: Map<string, string>) => {
  if (!reasoningMap?.size || !Array.isArray(request?.messages)) {
    return;
  }
  if (request.messages.some((msg: any) => msg.role === 'tool')) {
    for (let i = 0; i < request.messages.length; i++) {
      const message = request.messages[i];
      if (message?.role !== 'assistant') {
        continue;
      }
      if (message.reasoning_content) {
        continue;
      }
      const reasoningContent = reasoningMap.get(String(i));
      message.reasoning_content = reasoningContent;
    }
  }
};

export const patchRequestModelKwargs = (request: any, modelKwargs?: Record<string, any>) => {
  if (!modelKwargs || typeof modelKwargs !== 'object') {
    return;
  }
  Object.assign(request, modelKwargs);
};

export class ReasoningChatOpenAI extends ChatOpenAICompletions {
  // 语音回复:流式 PCM 聚合后的落库回调(由提供商在 createModel 后注入)
  audioReplySink?: AudioReplySink;

  async _generate(messages: BaseMessage[], options: any, runManager?: any) {
    const reasoningMap = collectReasoningMap(messages);
    const nextOptions = {
      ...(options || {}),
      [REASONING_MAP_KEY]: reasoningMap,
    };
    return super._generate(messages, nextOptions, runManager);
  }

  async *_streamResponseChunks(messages: BaseMessage[], options: any, runManager?: any) {
    const reasoningMap =
      options?.[REASONING_MAP_KEY] instanceof Map
        ? (options[REASONING_MAP_KEY] as Map<string, string>)
        : collectReasoningMap(messages);
    const nextOptions = {
      ...(options || {}),
      [REASONING_MAP_KEY]: reasoningMap,
    };
    // 语音回复:沿途剥离音频帧(避免进 SSE/消息 metadata),流结束后拼 WAV 落库,
    // 以一个追加的文本 chunk 把音频气泡挂到消息末尾——上层流管线无需感知
    const audioBase64Frames: string[] = [];
    for await (const chunk of super._streamResponseChunks(messages, nextOptions, runManager)) {
      const kwargs = chunk?.message?.additional_kwargs as Record<string, unknown> | undefined;
      if (Array.isArray(kwargs?.__nb_audio_frames)) {
        audioBase64Frames.push(...(kwargs.__nb_audio_frames as string[]));
        delete kwargs.__nb_audio_frames;
      }
      yield chunk;
    }
    if (audioBase64Frames.length && this.audioReplySink) {
      let url: string | null = null;
      try {
        url = await this.audioReplySink(Buffer.concat(audioBase64Frames.map((b64) => Buffer.from(b64, 'base64'))));
      } catch {
        url = null;
      }
      if (url) {
        const text = `\n\n<audio src="${url}" controls preload="metadata"></audio>`;
        yield new ChatGenerationChunk({ text, message: new AIMessageChunk({ content: text }) });
        await runManager?.handleLLMNewToken(text);
      }
    }
  }

  _convertCompletionsDeltaToBaseMessageChunk(delta: any, rawResponse: any, defaultRole?: any) {
    const messageChunk = super._convertCompletionsDeltaToBaseMessageChunk(delta, rawResponse, defaultRole);
    if (delta?.reasoning_content) {
      messageChunk.additional_kwargs = {
        ...(messageChunk.additional_kwargs || {}),
        reasoning_content: delta.reasoning_content,
      };
    }
    const kwargsAudio = messageChunk.additional_kwargs?.audio as { transcript?: string; data?: string } | undefined;
    if (delta?.audio || kwargsAudio) {
      // 语音回复流:文本经 delta.audio.transcript 下发(此时 delta.content 为空),映射为正文以复用文字流;
      // 音频 PCM 帧暂存 __nb_audio_frames,由 _streamResponseChunks 聚合并剥离。
      // 必须删除基类塞入的 additional_kwargs.audio:否则帧数据聚合进消息 metadata(几百 KB),
      // 且历史重放时被序列化成非法请求(实测 400 "content: got an object")
      const transcript = delta?.audio?.transcript ?? kwargsAudio?.transcript;
      const data = delta?.audio?.data ?? kwargsAudio?.data;
      if (typeof transcript === 'string' && transcript && !delta?.content) {
        messageChunk.content = ((messageChunk.content as string) || '') + transcript;
      }
      if (typeof data === 'string' && data) {
        messageChunk.additional_kwargs = {
          ...(messageChunk.additional_kwargs || {}),
          __nb_audio_frames: [data],
        };
      }
      if (messageChunk.additional_kwargs?.audio) {
        delete messageChunk.additional_kwargs.audio;
      }
    }
    return messageChunk;
  }

  _convertCompletionsMessageToBaseMessage(message: any, rawResponse: any) {
    const langChainMessage = super._convertCompletionsMessageToBaseMessage(message, rawResponse);
    if (message?.reasoning_content) {
      langChainMessage.additional_kwargs = {
        ...(langChainMessage.additional_kwargs || {}),
        reasoning_content: message.reasoning_content,
      };
    }
    return langChainMessage;
  }

  completionWithRetry(
    request: OpenAI.Chat.ChatCompletionCreateParamsStreaming,
    requestOptions?: OpenAI.RequestOptions,
  ): Promise<AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>>;
  completionWithRetry(
    request: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming,
    requestOptions?: OpenAI.RequestOptions,
  ): Promise<OpenAI.Chat.Completions.ChatCompletion>;
  async completionWithRetry(
    request: OpenAI.Chat.ChatCompletionCreateParamsStreaming | OpenAI.Chat.ChatCompletionCreateParamsNonStreaming,
    requestOptions?: OpenAI.RequestOptions,
  ): Promise<AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk> | OpenAI.Chat.Completions.ChatCompletion> {
    const reasoningMap = requestOptions?.[REASONING_MAP_KEY] as Map<string, string> | undefined;
    const modelKwargs = requestOptions?.[MODEL_KWARGS_KEY] as Record<string, any> | undefined;
    patchRequestMessagesReasoning(request, reasoningMap);
    patchRequestModelKwargs(request, modelKwargs);
    if (request.stream) {
      return super.completionWithRetry(request as OpenAI.Chat.ChatCompletionCreateParamsStreaming, requestOptions);
    }
    return super.completionWithRetry(request as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming, requestOptions);
  }
}
