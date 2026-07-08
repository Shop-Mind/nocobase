/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// 图片编辑闭环 Phase 0 受控 action(resource: aiListingMedia)。铁律:AI/生成只产候选(candidates),
// 采纳(adopt)/弃用(discard)是用户显式动作 → actorType=user 审计 + 商品状态锁;发布取图(Phase 2)采纳集优先。
// Key 永不出服务端:本层只透传业务参数,凭证解析在 service/plugin-ai 内部完成。

import type { Context, Next } from '@nocobase/actions';
import type Plugin from '../plugin';
import { fail } from '../capture/shared';
import {
  adoptAsset,
  discardAsset,
  editImage,
  generateVideo,
  pollVideoJob,
  JOB_TYPE_IMAGE,
  JOB_TYPE_IMAGE_EDIT,
  JOB_TYPE_VIDEO,
  MediaServiceError,
} from './service';
import { listMediaScenes } from './scenes';
import { suggestPrompts } from './suggest';
import { toPublicUrl } from './public-url';

const MEDIA_ACTIONS = [
  'scenes',
  'imageModels',
  'candidates',
  'generate',
  'suggestPrompts',
  'publicUrl',
  'generateVideo',
  'videoJobStatus',
  'jobStatus',
  'adopt',
  'discard',
] as const;

// 服务层错误码 → HTTP 状态:限额 429、找不到 404、状态锁 409,其余按参数/配置错误 400
function httpStatusOf(code: string): number {
  if (code === 'MEDIA_LIMIT_EXCEEDED') return 429;
  if (code.endsWith('_NOT_FOUND')) return 404;
  if (code === 'MEDIA_ADOPT_LOCKED') return 409;
  return 400;
}

function currentUserId(ctx: Context): string {
  return String((ctx.state as { currentUser?: { id?: number } })?.currentUser?.id ?? 'unknown');
}

function handleError(ctx: Context, e: unknown, traceId: string): void {
  if (e instanceof MediaServiceError) {
    ctx.status = httpStatusOf(e.code);
    ctx.body = fail(e.code, e.message, e.code === 'MEDIA_LIMIT_EXCEEDED', traceId);
    return;
  }
  ctx.status = 500;
  ctx.body = fail('MEDIA_INTERNAL_ERROR', `媒体操作失败:${(e as Error)?.message || '未知错误'}`, true, traceId);
}

function mapAsset(row: { get: (k: string) => unknown }) {
  const meta = (row.get('meta') as Record<string, unknown>) || {};
  return {
    id: row.get('id'),
    url: (meta.storedUrl as string) || (row.get('sourceUrl') as string) || null,
    origin: row.get('origin'),
    role: row.get('role'),
    assetType: row.get('assetType'),
    sort: row.get('sort'),
    finalSelected: Boolean(row.get('finalSelected')),
    discarded: Boolean(row.get('discarded')),
    parentAssetId: row.get('parentAssetId'),
    genParams: row.get('genParams') || null,
    createdAt: row.get('createdAt'),
  };
}

export function setupMedia(plugin: Plugin): void {
  const { app } = plugin;

  app.resourceManager.define({
    name: 'aiListingMedia',
    actions: {
      // 场景库(供候选区场景选择器、抽屉快捷按钮渲染;注册表见 service 层 scenes.ts,env 可增补)
      scenes: async (ctx: Context, next: Next) => {
        const traceId = ctx.reqId || `srv-${Date.now()}`;
        ctx.body = { ok: true, data: { scenes: listMediaScenes() }, warnings: [], errors: [], traceId };
        await next();
      },

      // 可用于改图的图像模型清单(能力=image_gen),供候选区「选模型」下拉;默认项 = resolveImageEditTarget 会选的那个
      imageModels: async (ctx: Context, next: Next) => {
        const traceId = ctx.reqId || `srv-${Date.now()}`;
        const ai = app.pm.get('ai') as unknown as {
          aiManager?: {
            listAllEnabledModels: () => Promise<
              Array<{
                llmService: string;
                llmServiceTitle?: string;
                enabledModels: Array<{ value: string; label?: string; capability?: { task?: string } }>;
              }>
            >;
          };
        };
        let models: Array<{ llmService: string; model: string; label: string }> = [];
        try {
          const svcs = (await ai?.aiManager?.listAllEnabledModels?.()) || [];
          for (const s of svcs) {
            for (const m of s.enabledModels) {
              if (m.capability?.task === 'image_gen') {
                models.push({
                  llmService: s.llmService,
                  model: m.value,
                  label: `${m.label || m.value} · ${s.llmServiceTitle || s.llmService}`,
                });
              }
            }
          }
        } catch {
          models = [];
        }
        ctx.body = { ok: true, data: { models }, warnings: [], errors: [], traceId };
        await next();
      },

      // 某商品的媒体面板数据:图集(源图+已采纳,进发布的集合)+ 未弃用候选 + 已采纳集
      // (供预览编辑页 MediaStudio 一次拉全;gallery 顺序与发布装配一致:sort,id)
      candidates: async (ctx: Context, next: Next) => {
        const traceId = ctx.reqId || `srv-${Date.now()}`;
        const v = (ctx.action?.params?.values || {}) as { productId?: number };
        const productId = Number(v.productId);
        if (!productId) {
          ctx.status = 400;
          ctx.body = fail('NO_PRODUCT_ID', '缺少商品 id', false, traceId);
          return await next();
        }
        const rows = await app.db.getRepository('aiListingMediaAssets').find({
          filter: { productId, assetType: 'image' },
          sort: ['sort', 'id'],
        });
        const mapped = rows.map(mapAsset);
        const byIdDesc = [...mapped].sort((a, b) => Number(b.id) - Number(a.id));
        // 视频候选/采纳(P8 智能视频):独立数组,不与图片面板混用
        const videoRows = await app.db.getRepository('aiListingMediaAssets').find({
          filter: { productId, assetType: 'video' },
          sort: ['id'],
        });
        const videos = videoRows.map(mapAsset).sort((a, b) => Number(b.id) - Number(a.id));
        ctx.body = {
          ok: true,
          data: {
            gallery: mapped.filter((a) => !a.discarded && a.origin !== 'ai_candidate'),
            candidates: byIdDesc.filter((a) => !a.discarded && a.origin === 'ai_candidate' && !a.finalSelected),
            adopted: byIdDesc.filter((a) => !a.discarded && a.finalSelected),
            // 全部未弃用视频(含源站视频 + AI 候选/采纳),已采纳优先,供 MediaStudio 视频入列(vslot)。只读增量,不改采纳逻辑。
            videos: videos
              .filter((a) => !a.discarded)
              .sort((a, b) => Number(b.finalSelected) - Number(a.finalSelected) || Number(b.id) - Number(a.id)),
            videoCandidates: videos.filter((a) => !a.discarded && a.origin === 'ai_candidate' && !a.finalSelected),
            videoAdopted: videos.filter((a) => !a.discarded && a.finalSelected),
          },
          warnings: [],
          errors: [],
          traceId,
        };
        await next();
      },

      // 指令式改图(同步等待 ≤150s):产物落候选资产,绝不直接进最终集
      generate: async (ctx: Context, next: Next) => {
        const traceId = ctx.reqId || `srv-${Date.now()}`;
        const v = (ctx.action?.params?.values || {}) as {
          productId?: number;
          assetId?: number;
          sourceImageUrl?: string;
          instruction?: string;
          scene?: string;
          function?: string;
          parameters?: Record<string, unknown>;
          n?: number;
          llmService?: string;
          model?: string;
          aspect?: string;
          tier?: 'basic' | 'advanced';
          refImageUrl?: string;
          targetLanguage?: string;
          style?: string;
        };
        try {
          const result = await editImage(plugin, {
            productId: Number(v.productId) || undefined,
            assetId: Number(v.assetId) || undefined,
            sourceImageUrl: v.sourceImageUrl,
            instruction: String(v.instruction || ''),
            scene: v.scene,
            editFunction: v.function,
            parameters: v.parameters && typeof v.parameters === 'object' ? v.parameters : undefined,
            n: v.n,
            llmService: v.llmService || undefined,
            model: v.model || undefined,
            aspect: v.aspect || undefined,
            tier: v.tier === 'basic' || v.tier === 'advanced' ? v.tier : undefined,
            refImageUrl: v.refImageUrl || undefined,
            targetLanguage: v.targetLanguage || undefined,
            style: v.style || undefined,
          });
          ctx.body = { ok: true, data: result, warnings: [], errors: [], traceId };
        } catch (e) {
          handleError(ctx, e, traceId);
        }
        await next();
      },

      // 推荐提示词(点图出 3 条):看商品图 → 视觉 chat 模型产场景/卖点描述。只读,无视觉模型时静态兜底(fallback=true)。
      suggestPrompts: async (ctx: Context, next: Next) => {
        const traceId = ctx.reqId || `srv-${Date.now()}`;
        const v = (ctx.action?.params?.values || {}) as {
          assetId?: number;
          sourceImageUrl?: string;
          scene?: string;
          n?: number;
        };
        try {
          const result = await suggestPrompts(app, {
            assetId: Number(v.assetId) || undefined,
            sourceImageUrl: v.sourceImageUrl,
            scene: v.scene,
            n: v.n,
          });
          ctx.body = { ok: true, data: result, warnings: [], errors: [], traceId };
        } catch (e) {
          handleError(ctx, e, traceId);
        }
        await next();
      },

      // 公网 URL 管线(P6):把资产归一化为外部服务商可回源的绝对 URL(生产翻译/模特/视频端点入图基座)。
      // 请求 origin 作为无 env 配置时的兜底基址,便于本机/自测直接产出可 200 的 URL。
      publicUrl: async (ctx: Context, next: Next) => {
        const traceId = ctx.reqId || `srv-${Date.now()}`;
        const v = (ctx.action?.params?.values || {}) as { assetId?: number; url?: string };
        try {
          const baseUrl = `${ctx.protocol}://${ctx.host}`;
          const result = await toPublicUrl(app, { assetId: Number(v.assetId) || undefined, url: v.url }, { baseUrl });
          ctx.body = { ok: true, data: result, warnings: [], errors: [], traceId };
        } catch (e) {
          handleError(ctx, e, traceId);
        }
        await next();
      },

      // 图生视频(P8 智能视频):异步建任务立即返回 jobId,前端轮询 videoJobStatus。产物为视频候选,绝不直接进发布。
      generateVideo: async (ctx: Context, next: Next) => {
        const traceId = ctx.reqId || `srv-${Date.now()}`;
        const v = (ctx.action?.params?.values || {}) as {
          productId?: number;
          assetId?: number;
          sourceImageUrl?: string;
          prompt?: string;
          duration?: number;
          resolution?: string;
        };
        try {
          const result = await generateVideo(plugin, {
            productId: Number(v.productId) || undefined,
            assetId: Number(v.assetId) || undefined,
            sourceImageUrl: v.sourceImageUrl,
            prompt: v.prompt,
            duration: Number(v.duration) || undefined,
            resolution: v.resolution || undefined,
            // 无 env 公网基址时用请求 origin 兜底(生产应配 AI_LISTING_PUBLIC_BASE_URL)
            publicBaseUrl: `${ctx.protocol}://${ctx.host}`,
          });
          ctx.body = { ok: true, data: result, warnings: [], errors: [], traceId };
        } catch (e) {
          handleError(ctx, e, traceId);
        }
        await next();
      },

      // 轮询图生视频任务:running/failed/success;success 时返回视频候选 assetId+url(可播放预览、可采纳)。
      videoJobStatus: async (ctx: Context, next: Next) => {
        const traceId = ctx.reqId || `srv-${Date.now()}`;
        const v = (ctx.action?.params?.values || {}) as { jobId?: number };
        const jobId = Number(v.jobId);
        if (!jobId) {
          ctx.status = 400;
          ctx.body = fail('NO_JOB_ID', '缺少任务 id', false, traceId);
          return await next();
        }
        try {
          const result = await pollVideoJob(plugin, jobId);
          ctx.body = { ok: true, data: { jobId, ...result }, warnings: [], errors: [], traceId };
        } catch (e) {
          handleError(ctx, e, traceId);
        }
        await next();
      },

      // 查询媒体任务状态(候选区轮询用)
      jobStatus: async (ctx: Context, next: Next) => {
        const traceId = ctx.reqId || `srv-${Date.now()}`;
        const v = (ctx.action?.params?.values || {}) as { jobId?: number };
        const jobId = Number(v.jobId);
        if (!jobId) {
          ctx.status = 400;
          ctx.body = fail('NO_JOB_ID', '缺少任务 id', false, traceId);
          return await next();
        }
        const job = await app.db.getRepository('aiListingMediaJobs').findOne({ filterByTk: jobId });
        if (!job || ![JOB_TYPE_IMAGE_EDIT, JOB_TYPE_IMAGE, JOB_TYPE_VIDEO].includes(job.get('jobType') as string)) {
          ctx.status = 404;
          ctx.body = fail('MEDIA_JOB_NOT_FOUND', `未找到媒体任务 ${jobId}`, false, traceId);
          return await next();
        }
        const metadata = (job.get('metadata') as Record<string, unknown>) || {};
        ctx.body = {
          ok: true,
          data: {
            jobId,
            jobType: job.get('jobType'),
            status: job.get('status'),
            model: job.get('model') || metadata.model || null,
            assets: metadata.assets || [],
            errorMessage: job.get('errorMessage') || null,
          },
          warnings: [],
          errors: [],
          traceId,
        };
        await next();
      },

      // 采纳候选图(用户显式动作):append 追加为新详情图 / replace 替换指定原图(前端需二次确认)
      adopt: async (ctx: Context, next: Next) => {
        const traceId = ctx.reqId || `srv-${Date.now()}`;
        const v = (ctx.action?.params?.values || {}) as {
          assetId?: number;
          mode?: 'append' | 'replace';
          replaceAssetId?: number;
        };
        const assetId = Number(v.assetId);
        if (!assetId) {
          ctx.status = 400;
          ctx.body = fail('NO_ASSET_ID', '缺少候选图 id', false, traceId);
          return await next();
        }
        try {
          const result = await adoptAsset(plugin, {
            assetId,
            mode: v.mode === 'replace' ? 'replace' : 'append',
            replaceAssetId: Number(v.replaceAssetId) || undefined,
            actorId: currentUserId(ctx),
            traceId,
          });
          ctx.body = { ok: true, data: result, warnings: [], errors: [], traceId };
        } catch (e) {
          handleError(ctx, e, traceId);
        }
        await next();
      },

      // 弃用候选图(幂等):已采纳的弃用会改变最终集,服务层过商品状态锁
      discard: async (ctx: Context, next: Next) => {
        const traceId = ctx.reqId || `srv-${Date.now()}`;
        const v = (ctx.action?.params?.values || {}) as { assetId?: number };
        const assetId = Number(v.assetId);
        if (!assetId) {
          ctx.status = 400;
          ctx.body = fail('NO_ASSET_ID', '缺少候选图 id', false, traceId);
          return await next();
        }
        try {
          const result = await discardAsset(plugin, { assetId, actorId: currentUserId(ctx), traceId });
          ctx.body = { ok: true, data: result, warnings: [], errors: [], traceId };
        } catch (e) {
          handleError(ctx, e, traceId);
        }
        await next();
      },
    },
  });

  for (const action of MEDIA_ACTIONS) {
    app.acl.allow('aiListingMedia', action, 'loggedIn');
  }
}
