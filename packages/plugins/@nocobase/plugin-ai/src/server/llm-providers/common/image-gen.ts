/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// 通用「生成类模型对话通道」(提供商无关):让 AI 员工像换对话模型一样直接选用生图/生视频模型。
// 分工:① 能力判定走 model-capability 注册中心(detectMediaGenCapability 仅是薄封装);
// ② MediaGenChatModel 只做消息折叠与"结果→markdown 单块流",生成调用经依赖注入的 MediaTaskInvoker 完成;
// ③ 协议实现在 media-task.ts(OpenAI 端点组默认实现)与各提供商覆盖(dashscope 原生协议)里。

import { BaseChatModel, type BaseChatModelParams } from '@langchain/core/language_models/chat_models';
import { AIMessageChunk, type BaseMessage } from '@langchain/core/messages';
import { ChatGenerationChunk } from '@langchain/core/outputs';
import type { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager';
import { getModelCapability } from './model-capability';
import type { MediaTaskInvoker } from './media-task';

export interface MediaGenCapability {
  imageOutput?: boolean;
  videoOutput?: boolean;
}

// 生成能力判定改由 model-capability 注册中心统一给出(内置家族规则 + env 覆盖 + LiteLLM 目录),
// 本函数保留为面向媒体通道的薄封装
export function detectMediaGenCapability(model: string): MediaGenCapability | null {
  if (!model) return null;
  const { task } = getModelCapability(model);
  if (task === 'video_gen') return { videoOutput: true };
  if (task === 'image_gen') return { imageOutput: true };
  return null;
}

type ContentBlock = { type?: string; text?: string; image_url?: { url?: string }; image?: string };

// 提取最后一条用户消息的文本与图片(附件已被上游转成 image_url 块)
export function collectUserInput(messages: BaseMessage[]): { text: string; images: string[] } {
  const humans = messages.filter((m) => m._getType() === 'human');
  const last = humans[humans.length - 1];
  const texts: string[] = [];
  const images: string[] = [];
  const content = last?.content;
  if (typeof content === 'string') {
    texts.push(content);
  } else if (Array.isArray(content)) {
    for (const block of content as ContentBlock[]) {
      if (block?.type === 'text' && block.text) texts.push(block.text);
      if (block?.type === 'image_url' && block.image_url?.url) images.push(block.image_url.url);
      if (typeof block?.image === 'string') images.push(block.image);
    }
  }
  return { text: texts.join('\n').trim(), images };
}

export type MediaGenTask = 'image_gen' | 'video_gen' | 'tts';

// 按任务类型把产物 URL 渲染成气泡 markdown(图片=antd Image、视频/音频=原生控件,均经 sanitize 白名单)
export function renderMediaMarkdown(task: MediaGenTask, urls: string[]): string {
  return urls
    .map((u, i) => {
      const idx = urls.length > 1 ? ` ${i + 1}` : '';
      if (task === 'video_gen') return `<video src="${u}" controls width="480"></video>\n\n[视频直链${idx}](${u})`;
      if (task === 'tts') return `<audio src="${u}" controls preload="metadata"></audio>\n\n[音频文件${idx}](${u})`;
      return `![AI 生成图片${idx}](${u})`;
    })
    .join('\n\n');
}

interface MediaGenChatModelParams extends BaseChatModelParams {
  model: string;
  task: MediaGenTask;
  invoker: MediaTaskInvoker;
}

export class MediaGenChatModel extends BaseChatModel {
  private readonly opts: MediaGenChatModelParams;

  constructor(opts: MediaGenChatModelParams) {
    super(opts);
    this.opts = opts;
  }

  _llmType(): string {
    return 'media-gen';
  }

  // 生成类模型不支持函数调用:绑定工具变为无害空操作,员工管线无需感知
  bindTools(): this {
    return this;
  }

  override async *_streamResponseChunks(
    messages: BaseMessage[],
    _options: this['ParsedCallOptions'],
    runManager?: CallbackManagerForLLMRun,
  ): AsyncGenerator<ChatGenerationChunk> {
    const { text, images } = collectUserInput(messages);
    const task = this.opts.task;
    if (task === 'tts' && !text) {
      const tip = '请发送要合成语音的文本内容。';
      yield new ChatGenerationChunk({ text: tip, message: new AIMessageChunk({ content: tip }) });
      await runManager?.handleLLMNewToken(tip);
      return;
    }
    const result = await this.opts.invoker({
      task,
      model: this.opts.model,
      prompt: text || '生成一张图片',
      images,
      audios: [],
    });
    let textOut: string;
    if (result.urls.length) {
      // 产物已转存 File Manager 时无需时效提示;仅当存在未转存的服务商临时链接才提醒
      const expiryTip = result.persisted ? '' : '\n\n> 链接由模型服务商生成,有效期有限;如需长期使用请及时保存。';
      textOut = renderMediaMarkdown(task, result.urls) + expiryTip;
    } else if (task === 'image_gen' && result.binaries?.length) {
      // gpt-image 等只回 base64 且转存失败时:以 data URI 内联展示兜底(音频 data URI 体积过大,不做)
      textOut = result.binaries
        .map(
          (b, i) =>
            `![AI 生成图片${result.binaries.length > 1 ? ` ${i + 1}` : ''}](data:${b.mimeType};base64,${b.base64})`,
        )
        .join('\n\n');
    } else if (task === 'tts' && result.binaries?.length) {
      textOut = '语音已生成但转存失败,请重试。';
    } else {
      textOut = result.text || '模型未返回媒体结果,请调整描述后重试。';
    }
    const chunk = new ChatGenerationChunk({ text: textOut, message: new AIMessageChunk({ content: textOut }) });
    yield chunk;
    await runManager?.handleLLMNewToken(textOut);
  }

  async _generate(messages: BaseMessage[], options: this['ParsedCallOptions']) {
    let text = '';
    for await (const chunk of this._streamResponseChunks(messages, options)) {
      text += chunk.text;
    }
    return { generations: [{ text, message: new AIMessageChunk({ content: text }) }] };
  }
}
