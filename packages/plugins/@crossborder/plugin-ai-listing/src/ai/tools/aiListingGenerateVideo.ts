/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// 多模态抽屉:会话内生成视频(图生视频/文生视频,万相系)。视频生成耗时数分钟,不能阻塞会话:
// 本工具只提交任务并返回 jobId,进度经 aiListingCheckMediaJob 懒轮询查询。日限额(视频独立、更严)+ 审计。

import type { Context } from '@nocobase/actions';
import { defineTools } from '@nocobase/ai';
import { submitVideoJob, MediaServiceError } from '../../server/media/service';

export default defineTools({
  scope: 'GENERAL',
  defaultPermission: 'ASK',
  introduction: { title: '生成视频', about: '基于图片或文字描述生成短视频(异步,提交后可查询进度)' },
  definition: {
    name: 'aiListingGenerateVideo',
    description: [
      'Submit a video generation task: image-to-video when sourceImageUrl is provided (recommended for product',
      'showcase clips), otherwise text-to-video. Generation takes MINUTES and runs in the background — this tool',
      'returns a jobId immediately. Tell the user the video is being generated, and when the user asks about it',
      'later (or after a while), call aiListingCheckMediaJob with the jobId to fetch the result.',
    ].join(' '),
    schema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Description of the desired video motion/scene, e.g. "商品缓慢旋转展示,柔和打光,白色背景"',
        },
        sourceImageUrl: {
          type: 'string',
          description: 'Optional. URL of the source image to animate (image-to-video). Omit for text-to-video.',
        },
      },
      required: ['prompt'],
    },
  },
  invoke: async (ctx: Context, args: { prompt?: string; sourceImageUrl?: string }) => {
    try {
      const result = await submitVideoJob(
        { app: ctx.app },
        { prompt: String(args?.prompt || ''), sourceImageUrl: args?.sourceImageUrl || undefined },
      );
      return {
        status: 'success' as const,
        content: JSON.stringify({
          jobId: result.jobId,
          note: 'Video task submitted; it takes a few minutes. Tell the user it is generating and that you can check progress with aiListingCheckMediaJob later.',
        }),
      };
    } catch (e) {
      const msg = e instanceof MediaServiceError ? `[${e.code}] ${e.message}` : (e as Error).message;
      return { status: 'error' as const, content: `视频任务提交失败:${msg}` };
    }
  },
});
