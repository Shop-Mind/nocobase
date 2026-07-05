/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// 多模态生成服务层(AI 工具与后续 Media Studio 页面共用)。职责:解析百炼服务(Key 来自 plugin-ai 的
// llmServices,绝不落日志/审计)、日限额、生成任务(图=同步等待,视频=提交+懒轮询)、产物经 downloadToStorage
// 落 File Manager 并建 mediaAssets 资产行、逐次审计。复用现有表,不新增字段:任务细节存 mediaJobs.metadata,
// 资产细节存 mediaAssets.meta。

import type { Application } from '@nocobase/server';
import { createDashScopeProvider } from './providers/dashscope';
import type { MediaProvider } from './providers/types';
import { downloadToStorage } from './download';

const IMAGE_DAILY_LIMIT = Number(process.env.AI_LISTING_IMAGE_DAILY_LIMIT || 200);
const VIDEO_DAILY_LIMIT = Number(process.env.AI_LISTING_VIDEO_DAILY_LIMIT || 20);
const IMAGE_POLL_INTERVAL_MS = 3000;
const IMAGE_POLL_MAX_TRIES = 40; // 120s

export const JOB_TYPE_IMAGE = 'ai_image';
export const JOB_TYPE_VIDEO = 'ai_video';

export class MediaServiceError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

interface PluginLike {
  app: Application;
}

// 解析生成服务:取第一条 enabled 的 dashscope LLM 服务(与用户拍板一致:服务商在「LLM 服务」配置)。
export async function resolveMediaProvider(app: Application): Promise<MediaProvider> {
  const Services = app.db.getRepository('llmServices');
  const svc = await Services.findOne({ filter: { provider: 'dashscope', enabled: true } });
  if (!svc) {
    throw new MediaServiceError(
      'MEDIA_SERVICE_NOT_CONFIGURED',
      '未配置图像/视频生成服务:请到「AI 员工 → LLM 服务」添加并启用一条 Dashscope(阿里云百炼)服务。',
    );
  }
  const options = (svc.get('options') as { apiKey?: string; baseURL?: string }) || {};
  if (!options.apiKey) {
    throw new MediaServiceError('MEDIA_SERVICE_NOT_CONFIGURED', '所选 Dashscope 服务未配置 API Key。');
  }
  return createDashScopeProvider({ apiKey: options.apiKey, baseURL: options.baseURL });
}

async function checkDailyLimit(app: Application, jobType: string, limit: number): Promise<void> {
  const Jobs = app.db.getRepository('aiListingMediaJobs');
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const used = await Jobs.count({ filter: { jobType, createdAt: { $gte: dayStart.toISOString() } } });
  if (used >= limit) {
    throw new MediaServiceError(
      'MEDIA_LIMIT_EXCEEDED',
      `今日${jobType === JOB_TYPE_VIDEO ? '视频' : '图片'}生成已达上限(${limit}),请明天再试或调整限额。`,
    );
  }
}

async function writeAudit(app: Application, action: string, reason: string, traceId: string): Promise<void> {
  try {
    await app.db.getRepository('aiListingAuditLogs').create({
      values: { actorType: 'ai_employee', actorId: 'media-tool', action, reason: reason.slice(0, 200), traceId },
    });
  } catch {
    // 审计失败不阻断生成。
  }
}

// 产物入库:下载结果 URL 落 File Manager,并建 ai_generated 资产行,返回可直接嵌入 markdown 的应用内 URL。
async function persistResult(
  plugin: PluginLike,
  args: { assetType: 'image' | 'video'; resultUrl: string; prompt: string; model: string; sourceImageUrl?: string },
): Promise<{ assetId: number; url: string; fileId: number }> {
  const stored = await downloadToStorage(plugin as never, args.resultUrl);
  const Assets = plugin.app.db.getRepository('aiListingMediaAssets');
  const asset = await Assets.create({
    values: {
      assetType: args.assetType,
      sourceUrl: args.resultUrl,
      sourceFileId: stored.fileId,
      role: args.assetType === 'video' ? 'video' : 'detail',
      processStatus: 'success',
      processType: 'ai_generate',
      meta: { storedUrl: stored.url, prompt: args.prompt, model: args.model, sourceImageUrl: args.sourceImageUrl },
    },
  });
  return { assetId: asset.get('id') as number, url: stored.url || args.resultUrl, fileId: stored.fileId };
}

// 生成图片(文生图/改图):同步等待完成(≤120s),直接返回可展示 URL。会话中的工具调用走此路径。
export async function generateImageSync(
  plugin: PluginLike,
  input: { prompt: string; sourceImageUrl?: string },
): Promise<{ assetId: number; url: string; jobId: number }> {
  const { app } = plugin;
  await checkDailyLimit(app, JOB_TYPE_IMAGE, IMAGE_DAILY_LIMIT);
  const provider = await resolveMediaProvider(app);
  const Jobs = app.db.getRepository('aiListingMediaJobs');
  const submitted = await provider.submitImage(input);
  const traceId = `media-img-${submitted.providerTaskId}`;
  const job = await Jobs.create({
    values: {
      jobType: JOB_TYPE_IMAGE,
      status: 'running',
      traceId,
      metadata: { providerTaskId: submitted.providerTaskId, model: submitted.model, prompt: input.prompt },
    },
  });
  const jobId = job.get('id') as number;
  await writeAudit(app, 'ai.image_generate', input.prompt, traceId);

  const startedAt = Date.now();
  for (let i = 0; i < IMAGE_POLL_MAX_TRIES; i++) {
    await new Promise((resolve) => setTimeout(resolve, IMAGE_POLL_INTERVAL_MS));
    const polled = await provider.pollTask(submitted.providerTaskId);
    if (polled.status === 'running') continue;
    if (polled.status === 'failed') {
      await Jobs.update({
        filterByTk: jobId,
        values: {
          status: 'failed',
          errorMessage: polled.errorMessage,
          retryable: true,
          durationMs: Date.now() - startedAt,
        },
      });
      throw new MediaServiceError('MEDIA_GENERATE_FAILED', `图片生成失败:${polled.errorMessage}`);
    }
    const persisted = await persistResult(plugin, {
      assetType: 'image',
      resultUrl: polled.resultUrl as string,
      prompt: input.prompt,
      model: submitted.model,
      sourceImageUrl: input.sourceImageUrl,
    });
    await Jobs.update({
      filterByTk: jobId,
      values: {
        status: 'success',
        outputFileId: persisted.fileId,
        durationMs: Date.now() - startedAt,
        metadata: {
          providerTaskId: submitted.providerTaskId,
          model: submitted.model,
          prompt: input.prompt,
          storedUrl: persisted.url,
          assetId: persisted.assetId,
        },
      },
    });
    return { ...persisted, jobId };
  }
  await Jobs.update({
    filterByTk: jobId,
    values: { status: 'failed', errorMessage: '生成超时(120s)', retryable: true },
  });
  throw new MediaServiceError('MEDIA_GENERATE_TIMEOUT', '图片生成超时(120s),请让用户稍后重试。');
}

// 提交视频生成(图生视频/文生视频):立即返回 jobId,进度由 checkMediaJob 懒轮询推进,不阻塞会话。
export async function submitVideoJob(
  plugin: PluginLike,
  input: { prompt: string; sourceImageUrl?: string },
): Promise<{ jobId: number }> {
  const { app } = plugin;
  await checkDailyLimit(app, JOB_TYPE_VIDEO, VIDEO_DAILY_LIMIT);
  const provider = await resolveMediaProvider(app);
  const submitted = await provider.submitVideo(input);
  const traceId = `media-vid-${submitted.providerTaskId}`;
  const job = await app.db.getRepository('aiListingMediaJobs').create({
    values: {
      jobType: JOB_TYPE_VIDEO,
      status: 'running',
      traceId,
      metadata: {
        providerTaskId: submitted.providerTaskId,
        model: submitted.model,
        prompt: input.prompt,
        sourceImageUrl: input.sourceImageUrl,
      },
    },
  });
  await writeAudit(app, 'ai.video_generate', input.prompt, traceId);
  return { jobId: job.get('id') as number };
}

// 查询媒体任务:running 时向服务商轮询一次并推进状态;完成后产物入库并把结果 URL 固化到 metadata。
export async function checkMediaJob(
  plugin: PluginLike,
  jobId: number,
): Promise<{ status: string; url?: string; assetId?: number; errorMessage?: string; assetType: 'image' | 'video' }> {
  const { app } = plugin;
  const Jobs = app.db.getRepository('aiListingMediaJobs');
  const job = await Jobs.findOne({ filterByTk: jobId });
  if (!job || ![JOB_TYPE_IMAGE, JOB_TYPE_VIDEO].includes(job.get('jobType') as string)) {
    throw new MediaServiceError('MEDIA_JOB_NOT_FOUND', `未找到媒体生成任务 ${jobId}`);
  }
  const assetType = job.get('jobType') === JOB_TYPE_VIDEO ? 'video' : 'image';
  const metadata = (job.get('metadata') as Record<string, unknown>) || {};
  const status = job.get('status') as string;
  if (status === 'success') {
    return { status, url: metadata.storedUrl as string, assetId: metadata.assetId as number, assetType };
  }
  if (status === 'failed') {
    return { status, errorMessage: (job.get('errorMessage') as string) || '生成失败', assetType };
  }
  const provider = await resolveMediaProvider(app);
  const polled = await provider.pollTask(metadata.providerTaskId as string);
  if (polled.status === 'running') return { status: 'running', assetType };
  if (polled.status === 'failed') {
    await Jobs.update({
      filterByTk: jobId,
      values: { status: 'failed', errorMessage: polled.errorMessage, retryable: true },
    });
    return { status: 'failed', errorMessage: polled.errorMessage, assetType };
  }
  const persisted = await persistResult(plugin, {
    assetType,
    resultUrl: polled.resultUrl as string,
    prompt: (metadata.prompt as string) || '',
    model: (metadata.model as string) || '',
    sourceImageUrl: metadata.sourceImageUrl as string | undefined,
  });
  await Jobs.update({
    filterByTk: jobId,
    values: {
      status: 'success',
      outputFileId: persisted.fileId,
      metadata: { ...metadata, storedUrl: persisted.url, assetId: persisted.assetId },
    },
  });
  return { status: 'success', url: persisted.url, assetId: persisted.assetId, assetType };
}
