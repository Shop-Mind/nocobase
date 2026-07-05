/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// 多模态抽屉:查询媒体生成任务进度(只读,ALLOW 自动执行)。running 时向服务商懒轮询一次推进状态;
// 完成后产物已入库,返回可展示 URL,并指示模型按类型嵌入 markdown 图片或 <video> 标签。

import type { Context } from '@nocobase/actions';
import { defineTools } from '@nocobase/ai';
import { checkMediaJob, MediaServiceError } from '../../server/media/service';

export default defineTools({
  scope: 'GENERAL',
  defaultPermission: 'ALLOW',
  introduction: { title: '查询媒体生成任务', about: '查询图片/视频生成任务的进度与结果(只读)' },
  definition: {
    name: 'aiListingCheckMediaJob',
    description: [
      'Check the progress/result of a media generation job created by aiListingGenerateVideo (or image jobs).',
      'When status is "success": for an image, display it with markdown ![image](url); for a video, embed it as',
      'raw HTML: <video src="URL" controls width="480"></video> so the user can play it inline (also give the',
      'plain URL as a fallback link). When "running", tell the user to wait a bit. When "failed", explain the error.',
    ].join(' '),
    schema: {
      type: 'object',
      properties: {
        jobId: { type: 'number', description: 'The media job id returned when the task was submitted.' },
      },
      required: ['jobId'],
    },
  },
  invoke: async (ctx: Context, args: { jobId?: number }) => {
    try {
      const result = await checkMediaJob({ app: ctx.app }, Number(args?.jobId));
      return { status: 'success' as const, content: JSON.stringify(result) };
    } catch (e) {
      const msg = e instanceof MediaServiceError ? `[${e.code}] ${e.message}` : (e as Error).message;
      return { status: 'error' as const, content: `查询任务失败:${msg}` };
    }
  },
});
