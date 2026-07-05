/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { EmbeddingProvider, LLMProvider, ParsedAttachmentResult } from './provider';
import { serverRequest } from '@nocobase/utils';
import { Model } from '@nocobase/database';
import { encodeFile } from '../utils';
import { AttachmentModel, PluginFileManagerServer } from '@nocobase/plugin-file-manager';
import { LLMProviderMeta, SupportedModel } from '../manager/ai-manager';
import { EmbeddingsInterface } from '@langchain/core/embeddings';
import { Context } from '@nocobase/actions';
import { AIChatContext } from '../types/ai-chat-conversation.type';
import { ChatGenerationChunk, LLMResult } from '@langchain/core/outputs';
import { MediaTaskInvoker, taskSignal } from './common/media-task';

const GOOGLE_GEN_AI_URL = 'https://generativelanguage.googleapis.com';

export class GoogleGenAIProvider extends LLMProvider {
  declare chatModel: ChatGoogleGenerativeAI;

  get baseURL() {
    return GOOGLE_GEN_AI_URL;
  }

  createModel() {
    const { apiKey } = this.serviceOptions || {};
    const { model, responseFormat } = this.modelOptions || {};

    return new ChatGoogleGenerativeAI({
      apiKey,
      ...this.modelOptions,
      model,
      json: responseFormat === 'json',
      baseUrl: this.getResolvedBaseURL(),
    });
  }

  // Gemini 生图(gemini-*-image / imagen 系):原生 generateContent,产物为 inlineData base64,
  // 经统一转存落 File Manager;其余任务回落基类 OpenAI 端点组(对 Google 仅作兜底)
  protected createMediaTaskInvoker(): MediaTaskInvoker {
    const fallback = super.createMediaTaskInvoker();
    const { apiKey } = this.serviceOptions || {};
    const base = this.getResolvedBaseURL().replace(/\/$/, '');
    return async (input) => {
      if (input.task !== 'image_gen') return fallback(input);
      const parts: Array<Record<string, unknown>> = [{ text: input.prompt }];
      for (const image of input.images) {
        const match = image.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
        if (match) parts.push({ inline_data: { mime_type: match[1], data: match[2] } });
      }
      const resp = await fetch(`${base}/v1beta/models/${encodeURIComponent(input.model)}:generateContent`, {
        method: 'POST',
        headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts }] }),
        signal: taskSignal(180000, input.signal),
      });
      const json = (await resp.json()) as {
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string; inlineData?: { mimeType?: string; data?: string } }> };
        }>;
        error?: { message?: string };
      };
      if (!resp.ok) {
        throw new Error(`图像生成失败(HTTP ${resp.status}):${json?.error?.message || '未知错误'}`);
      }
      const outParts = json?.candidates?.[0]?.content?.parts || [];
      const binaries = outParts
        .filter((part) => part?.inlineData?.data)
        .map((part) => ({ base64: part.inlineData.data, mimeType: part.inlineData.mimeType || 'image/png' }));
      const text = outParts
        .map((part) => part?.text)
        .filter(Boolean)
        .join('\n');
      if (!binaries.length && !text) {
        throw new Error('模型未返回图像结果');
      }
      return { urls: [], binaries, text: text || undefined };
    };
  }

  async listModels(): Promise<{
    models?: { id: string }[];
    code?: number;
    errMsg?: string;
  }> {
    const options = this.serviceOptions || {};
    const apiKey = options.apiKey;
    let url: string;
    try {
      url = this.buildRequestURL(`v1beta/models?key=${encodeURIComponent(apiKey ?? '')}`);
    } catch (e) {
      return { code: 400, errMsg: e instanceof Error ? e.message : String(e) };
    }
    if (!url) {
      return { code: 400, errMsg: 'baseURL is required' };
    }
    if (!apiKey) {
      return { code: 400, errMsg: 'API Key required' };
    }
    try {
      const res = await serverRequest({
        method: 'GET',
        url,
      });
      return {
        models: res?.data?.models.map((model) => ({
          id: model.name,
        })),
      };
    } catch (e) {
      return { code: e.response?.status || 500, errMsg: e.message };
    }
  }

  parseResponseMessage(message: Model) {
    const { content: rawContent, messageId, metadata, role, toolCalls, attachments, workContext, createdAt } = message;
    const content = {
      ...rawContent,
      messageId,
      metadata,
      attachments,
      workContext,
    };

    if (toolCalls) {
      content.tool_calls = toolCalls;
    }

    if (Array.isArray(content.content)) {
      const textMessage = content.content.find((msg) => msg.type === 'text');
      content.content = textMessage?.text;
    }
    if (metadata?.response_metadata?.groundingMetadata?.groundingChunks?.length) {
      content.reference = content.reference ?? [];
      for (const groundingChunk of metadata?.response_metadata?.groundingMetadata?.groundingChunks ?? []) {
        if (!groundingChunk.web) {
          continue;
        }
        content.reference.push({
          title: groundingChunk.web.title,
          url: groundingChunk.web.uri,
        });
      }
    }

    return {
      key: messageId,
      createdAt,
      content,
      role,
    };
  }

  protected async convertToContent(ctx: Context, attachment: AttachmentModel): Promise<ParsedAttachmentResult> {
    const fileManager = this.app.pm.get('file-manager') as PluginFileManagerServer;
    const url = await fileManager.getFileURL(attachment);
    if (attachment.mimetype?.startsWith('image/')) {
      const data = await encodeFile(ctx, decodeURIComponent(url));
      return {
        placement: 'contentBlocks',
        content: {
          type: 'image_url',
          image_url: {
            url: `data:image/${attachment.mimetype.split('/')[1]};base64,${data}`,
          },
        },
      };
    } else {
      const data = await encodeFile(ctx, decodeURIComponent(url));
      return {
        placement: 'contentBlocks',
        content: {
          type: attachment.mimetype,
          data,
        },
      };
    }
  }

  parseResponseMetadata(output: LLMResult) {
    const [generation] = output?.generations ?? [];
    const [chatGenerationChunk] = generation ?? [];
    return [
      (chatGenerationChunk as any)?.message?.id,
      { groundingMetadata: chatGenerationChunk?.generationInfo?.groundingMetadata },
    ];
  }

  getStructuredOutputOptions(structuredOutput: AIChatContext['structuredOutput']) {
    const { responseFormat } = this.modelOptions || {};
    const { schema, name, description } = structuredOutput || {};
    if (!schema) {
      return;
    }

    const methods = {
      json_object: 'jsonMode',
      json_schema: 'jsonSchema',
    };

    const options: Record<string, any> = {
      includeRaw: true,
      name,
    };

    const method = methods[responseFormat];
    if (method) {
      options.method = method;
    }

    return {
      schema: {
        ...schema,
        description: description ?? schema.description,
      },
      options,
    };
  }

  protected builtInTools(): any[] {
    if (this.modelOptions?.builtIn?.webSearch === true) {
      return [{ googleSearch: {} }];
    }
    return [];
  }

  isToolConflict(): boolean {
    return true;
  }
}

export class GoogleGenAIEmbeddingProvider extends EmbeddingProvider {
  protected getDefaultUrl(): string {
    return 'https://generativelanguage.googleapis.com';
  }

  createEmbedding(): EmbeddingsInterface {
    return new GoogleGenerativeAIEmbeddings({
      apiKey: this.apiKey,
      baseUrl: this.baseURL,
      model: this.model,
    });
  }
}

export const googleGenAIProviderOptions: LLMProviderMeta = {
  title: 'Google generative AI',
  supportedModel: [SupportedModel.LLM, SupportedModel.EMBEDDING],
  models: {
    [SupportedModel.LLM]: ['models/gemini-3.0-pro-preview'],
    [SupportedModel.EMBEDDING]: ['gemini-embedding-001'],
  },
  provider: GoogleGenAIProvider,
  embedding: GoogleGenAIEmbeddingProvider,
  supportWebSearch: true,
};
