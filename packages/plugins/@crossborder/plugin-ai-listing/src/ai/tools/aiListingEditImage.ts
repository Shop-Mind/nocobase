/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// 会话内商品图编辑(场景库驱动):对已有商品图执行白底/擦除/换色/高清/扩图等编辑,产物只落「候选区」
// (origin=ai_candidate),采纳权在用户——工具返回候选 URL 供气泡预览,同时提醒用户去预览编辑页采纳。
// 与 aiListingGenerateImage(纯文生图/无场景库)互补。ASK 权限:生成消耗真实费用。

import type { Context } from '@nocobase/actions';
import { defineTools } from '@nocobase/ai';
import { editImage, MediaServiceError } from '../../server/media/service';
import { listMediaScenes } from '../../server/media/scenes';

const scenes = listMediaScenes();

export default defineTools({
  scope: 'GENERAL',
  defaultPermission: 'ASK',
  introduction: {
    title: '编辑商品图(候选)',
    about: '对商品图做白底/擦除/换色/高清/扩图等场景化编辑,产出候选图,由用户在预览编辑页采纳后生效',
  },
  definition: {
    name: 'aiListingEditImage',
    description: [
      'Edit an EXISTING product image (requires assetId or sourceImageUrl as the source). Scene-driven:',
      'pick the closest `scene`, or omit it and pass a full Chinese edit instruction. Takes up to 3 minutes.',
      'Results are CANDIDATE images staged for user review — they do NOT change the product until the user',
      'adopts them on the review page. On success, display every candidate with markdown ![候选](url),',
      'then tell the user: 候选图已进入预览编辑页的「AI 候选区」,采纳后才会用于发布. The response echoes',
      'lastGenParams — reuse it (adjust only what the user asks to change) for incremental follow-up edits.',
      'Scenes: ' + scenes.map((s) => `${s.key} = ${s.hint}`).join('; '),
    ].join(' '),
    schema: {
      type: 'object',
      properties: {
        scene: {
          type: 'string',
          enum: scenes.map((s) => s.key),
          description: 'Edit scene key. Omit for free-form editing with a full instruction.',
        },
        instruction: {
          type: 'string',
          description:
            'Chinese instruction filling the scene (e.g. target color / scene description / objects to erase). Optional for white_bg / hd / expand.',
        },
        assetId: {
          type: 'number',
          description: 'aiListingMediaAssets id of the source image (preferred when the image is a product asset).',
        },
        sourceImageUrl: {
          type: 'string',
          description: 'Source image URL (app-relative /storage/... or http(s)). Use when no assetId is known.',
        },
        productId: {
          type: 'number',
          description: 'Product id the candidates belong to. Optional when assetId is given (inferred).',
        },
        n: { type: 'integer', minimum: 1, maximum: 4, description: 'Candidate count (default from scene, usually 2).' },
      },
      required: [],
    },
  },
  invoke: async (
    ctx: Context,
    args: {
      scene?: string;
      instruction?: string;
      assetId?: number;
      sourceImageUrl?: string;
      productId?: number;
      n?: number;
    },
  ) => {
    try {
      const result = await editImage(
        { app: ctx.app },
        {
          scene: args?.scene,
          instruction: String(args?.instruction || ''),
          assetId: Number(args?.assetId) || undefined,
          sourceImageUrl: args?.sourceImageUrl || undefined,
          productId: Number(args?.productId) || undefined,
          n: args?.n,
        },
      );
      return {
        status: 'success' as const,
        content: JSON.stringify({
          model: result.model,
          candidates: result.assets,
          lastGenParams: {
            scene: args?.scene ?? null,
            instruction: args?.instruction ?? '',
            assetId: args?.assetId ?? null,
            sourceImageUrl: args?.sourceImageUrl ?? null,
            n: args?.n ?? null,
          },
          note: 'Show each candidate with markdown ![候选](url). Remind the user: adopt them in the review page AI candidate zone before publishing.',
        }),
      };
    } catch (e) {
      const msg = e instanceof MediaServiceError ? `[${e.code}] ${e.message}` : (e as Error).message;
      return { status: 'error' as const, content: `图片编辑失败:${msg}` };
    }
  },
});
