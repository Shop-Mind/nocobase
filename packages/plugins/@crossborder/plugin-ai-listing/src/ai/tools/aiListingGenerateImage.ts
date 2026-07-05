/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// 多模态抽屉:会话内生成/修改图片(文生图 + 基于源图 URL 的指令式改图)。同步等待完成(≤120s)后
// 直接返回应用内 URL,并明确指示模型用 markdown 图片语法在回复中展示。产物落 File Manager + mediaAssets,
// 逐次审计 + 日限额,详见 src/server/media/service.ts。ASK 权限:生成消耗真实费用,首次调用需用户确认。

import type { Context } from '@nocobase/actions';
import { defineTools } from '@nocobase/ai';
import { generateImageSync, MediaServiceError } from '../../server/media/service';

export default defineTools({
  scope: 'GENERAL',
  defaultPermission: 'ASK',
  introduction: { title: '生成/修改图片', about: '文生图或基于源图改图(去水印/换背景等),结果直接显示在会话里' },
  definition: {
    name: 'aiListingGenerateImage',
    description: [
      'Generate a new image from a text prompt, or edit an existing image (remove watermark/logo, change',
      'background, white background, style tweaks) when sourceImageUrl is provided. Takes up to 2 minutes.',
      'On success it returns a JSON with the final image `url`. You MUST then display the image in your reply',
      'using markdown: ![short description](url) — the chat UI renders it inline.',
    ].join(' '),
    schema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description:
            'Chinese or English instruction describing the desired image (for generation) or the edit to apply (for editing), e.g. "将背景替换为纯白色,商品主体居中,无水印无文字"',
        },
        sourceImageUrl: {
          type: 'string',
          description: 'Optional. URL of the source image to edit. Omit to generate a brand-new image from text.',
        },
      },
      required: ['prompt'],
    },
  },
  invoke: async (ctx: Context, args: { prompt?: string; sourceImageUrl?: string }) => {
    try {
      const result = await generateImageSync(
        { app: ctx.app },
        { prompt: String(args?.prompt || ''), sourceImageUrl: args?.sourceImageUrl || undefined },
      );
      return {
        status: 'success' as const,
        content: JSON.stringify({
          url: result.url,
          assetId: result.assetId,
          jobId: result.jobId,
          note: 'Image ready. Show it to the user with markdown: ![image](url).',
        }),
      };
    } catch (e) {
      const msg = e instanceof MediaServiceError ? `[${e.code}] ${e.message}` : (e as Error).message;
      return { status: 'error' as const, content: `图片生成失败:${msg}` };
    }
  },
});
