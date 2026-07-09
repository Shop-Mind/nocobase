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

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Application } from '@nocobase/server';
import { createDashScopeProvider } from './providers/dashscope';
import type { MediaProvider } from './providers/types';
import { downloadToStorage } from './download';
import { buildScenePrompt, getMediaScene, listMediaScenes, type MediaScene } from './scenes';
import { toPublicUrl } from './public-url';
import { estimateCost } from './pricing';
import { writeAudit as writeAuditEntries, type AuditEntry } from '../processing/audit';
import { EDITABLE_STATUS } from '../shared/product-status';

const IMAGE_DAILY_LIMIT = Number(process.env.AI_LISTING_IMAGE_DAILY_LIMIT || 200);
const VIDEO_DAILY_LIMIT = Number(process.env.AI_LISTING_VIDEO_DAILY_LIMIT || 20);
const IMAGE_POLL_INTERVAL_MS = 3000;
const IMAGE_POLL_MAX_TRIES = 40; // 120s

export const JOB_TYPE_IMAGE = 'ai_image';
export const JOB_TYPE_VIDEO = 'ai_video';
export const JOB_TYPE_IMAGE_EDIT = 'ai_image_edit';

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

// ============================================================================
// 图像编辑与候选/采纳闭环(图片编辑闭环 Phase 0)。与上方生成通道的区别:编辑走 plugin-ai 的通用媒体任务层
// (能力注册中心 + 多提供商适配器 + File Manager 转存),换模型/换服务商零业务代码;产物按「候选」生命周期落库:
// origin=ai_candidate → 用户显式 adopt(finalSelected=true,状态锁校验,审计 actorType=user)→ 发布采纳集优先。
// ============================================================================

const DEFAULT_EDIT_CANDIDATES = () => Math.min(Math.max(Number(process.env.AI_LISTING_EDIT_CANDIDATES) || 2, 1), 4);

// plugin-ai 服务端结构类型(不 import 其内部实现,避免 dist 耦合;形状与 AIManager/LLMProvider 公开面一致)
interface AIMediaTaskOutput {
  urls: string[];
  persisted?: boolean;
  files?: Array<{ fileId: number | string; url: string }>;
}
interface AIPluginLike {
  aiManager: {
    listAllEnabledModels(): Promise<
      Array<{ llmService: string; enabledModels: Array<{ value: string; capability?: { task?: string } }> }>
    >;
    getLLMService(opts: { llmService: string; model: string }): Promise<{
      provider: {
        invokeMediaTask(input: {
          task: 'image_gen' | 'video_gen' | 'tts' | 'asr';
          model: string;
          prompt: string;
          images: string[];
          audios: string[];
          options?: Record<string, unknown>;
        }): Promise<AIMediaTaskOutput>;
      };
    }>;
  };
}

function getAIPlugin(app: Application): AIPluginLike {
  const ai = app.pm.get('ai') as unknown as AIPluginLike | undefined;
  if (!ai?.aiManager) {
    throw new MediaServiceError('MEDIA_SERVICE_NOT_CONFIGURED', '未启用 AI 员工插件(plugin-ai),无法进行图像编辑。');
  }
  return ai;
}

// 解析图像编辑用的服务+模型:env AI_LISTING_IMAGE_EDIT_MODEL(`<llmService>:<model>` 或裸模型名)优先,
// 否则扫描全部已启用模型,取能力=image_gen 者按路由选型:route='function'(超分/扩图等专项)只有
// wanx imageedit 系的 image2image 通道支持;route='instruct'(指令改图)qwen-image-edit 系效果最好,
// 依次回退其他编辑家族、qwen-image 生成+编辑融合系、任意图像模型。
export async function resolveImageEditTarget(
  app: Application,
  opts?: { route?: 'instruct' | 'function' },
): Promise<{ llmService: string; model: string }> {
  const ai = getAIPlugin(app);
  const env = (process.env.AI_LISTING_IMAGE_EDIT_MODEL || '').trim();
  if (env.includes(':')) {
    const idx = env.indexOf(':');
    return { llmService: env.slice(0, idx), model: env.slice(idx + 1) };
  }
  const services = await ai.aiManager.listAllEnabledModels();
  if (env) {
    const hit = services.find((svc) => svc.enabledModels.some((m) => m.value === env));
    if (hit) return { llmService: hit.llmService, model: env };
    // env 指定的模型未在任何服务的启用清单里:取第一条服务承载(信任用户配置)
    if (services[0]) return { llmService: services[0].llmService, model: env };
  }
  const imageModels: Array<{ llmService: string; model: string }> = [];
  for (const svc of services) {
    for (const m of svc.enabledModels) {
      if (m.capability?.task === 'image_gen') imageModels.push({ llmService: svc.llmService, model: m.value });
    }
  }
  if (opts?.route === 'function') {
    const functional = imageModels.find((m) => /imageedit/i.test(m.model));
    if (!functional) {
      throw new MediaServiceError(
        'MEDIA_SERVICE_NOT_CONFIGURED',
        '该场景(超分/扩图等专项功能)需要 wanx 图像编辑模型:请到「AI 员工 → LLM 服务」启用 wanx2.1-imageedit,或设置 AI_LISTING_IMAGE_EDIT_MODEL。',
      );
    }
    return functional;
  }
  const preferred =
    imageModels.find((m) => /qwen-image.*edit/i.test(m.model)) ||
    imageModels.find((m) => /edit/i.test(m.model)) ||
    imageModels.find((m) => /qwen-image/i.test(m.model)) ||
    imageModels[0];
  if (!preferred) {
    throw new MediaServiceError(
      'MEDIA_SERVICE_NOT_CONFIGURED',
      '没有已启用的图像生成/编辑模型:请到「AI 员工 → LLM 服务」启用(如 qwen-image-2.0-pro / qwen-image-edit-plus),或设置 AI_LISTING_IMAGE_EDIT_MODEL。',
    );
  }
  return preferred;
}

// 模型档语义('basic' 标准/flash · 'advanced' pro/plus/max)→ 具体服务+模型。
// env AI_LISTING_MODEL_TIERS 为 JSON 映射,如 {"basic":"v_xxx:qwen-image","advanced":"v_xxx:qwen-image-max"};
// 无映射(或测试环境只有 gpt-image-2)时回退 resolveImageEditTarget 自动解析,两档指向同一可用模型。
export async function resolveModelByTier(
  app: Application,
  tier: 'basic' | 'advanced',
  opts?: { route?: 'instruct' | 'function' },
): Promise<{ llmService: string; model: string }> {
  const raw = (process.env.AI_LISTING_MODEL_TIERS || '').trim();
  if (raw) {
    try {
      const map = JSON.parse(raw) as Record<string, string>;
      const spec = (map?.[tier] || '').trim();
      if (spec.includes(':')) {
        const i = spec.indexOf(':');
        return { llmService: spec.slice(0, i), model: spec.slice(i + 1) };
      }
    } catch {
      // 解析失败静默回退自动解析
    }
  }
  return resolveImageEditTarget(app, opts);
}

const IMAGE_MIME_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
};

// 图片尺寸(PNG 读 IHDR;JPEG 扫 SOF0-15,跳过 C4/C8/CC);其余格式返回 undefined(hd 场景放弃指定尺寸)
export function imageDimensions(buf: Buffer): { width: number; height: number } | undefined {
  if (buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let off = 2;
    while (off + 9 < buf.length) {
      if (buf[off] !== 0xff) {
        off++;
        continue;
      }
      const marker = buf[off + 1];
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: buf.readUInt16BE(off + 5), width: buf.readUInt16BE(off + 7) };
      }
      off += 2 + buf.readUInt16BE(off + 2);
    }
  }
  return undefined;
}

// 源图统一转 base64 data URI 再交给服务商:本地 /storage 相对地址服务商不可达,公网 URL 也转 base64
// 以避免服务商回源失败。相对地址按本地存储引擎惯例映射到应用工作目录下的文件(与 storage/uploads 布局一致)。
// 同时返回解析出的图片尺寸(hd 超分按源图尺寸计算目标 size)。
export async function sourceImageInfo(rawUrl: string): Promise<{ dataUri: string; width?: number; height?: number }> {
  if (rawUrl.startsWith('data:')) {
    const base64 = rawUrl.split(',')[1] || '';
    const dims = imageDimensions(Buffer.from(base64, 'base64'));
    return { dataUri: rawUrl, ...dims };
  }
  const clean = rawUrl.split('?')[0];
  let buf: Buffer;
  let mimetype: string | undefined;
  if (/^https?:\/\//i.test(rawUrl)) {
    const resp = await fetch(rawUrl, { signal: AbortSignal.timeout(60000) });
    if (!resp.ok) throw new MediaServiceError('MEDIA_SOURCE_UNREACHABLE', `源图下载失败(HTTP ${resp.status})`);
    mimetype = resp.headers.get('content-type')?.split(';')[0]?.trim() || undefined;
    buf = Buffer.from(await resp.arrayBuffer());
  } else {
    try {
      buf = await readFile(path.join(process.cwd(), clean.replace(/^\//, '')));
    } catch {
      throw new MediaServiceError('MEDIA_SOURCE_UNREACHABLE', `无法读取本地源图:${rawUrl}`);
    }
  }
  if (!mimetype || !mimetype.startsWith('image/')) {
    mimetype = IMAGE_MIME_BY_EXT[path.extname(clean).toLowerCase()] || 'image/png';
  }
  return { dataUri: `data:${mimetype};base64,${buf.toString('base64')}`, ...imageDimensions(buf) };
}

export async function imageToDataURI(rawUrl: string): Promise<string> {
  return (await sourceImageInfo(rawUrl)).dataUri;
}

// hd 超分目标尺寸:源图 × factor,整体等比夹进 [512, 2048];极端宽高比塞不进边界时返回 undefined
export function upscaleSize(width: number, height: number, factor: number): string | undefined {
  let tw = width * factor;
  let th = height * factor;
  const down = Math.min(1, 2048 / tw, 2048 / th);
  tw *= down;
  th *= down;
  const up = Math.max(1, 512 / tw, 512 / th);
  tw = Math.round(tw * up);
  th = Math.round(th * up);
  if (tw < 512 || th < 512 || tw > 2048 || th > 2048) return undefined;
  return `${tw}*${th}`;
}

// 图片比例("宽:高",如 "16:9")→ 服务商 size("宽*高")。较长边取 ~1280,另一边按比例算,两边夹在 512~2048、
// 取 16 的倍数(多数生图模型要求)。非法比例返回 undefined。对标官方创意工坊 10 档常用比例。
export function ratioToSize(aspect: string): string | undefined {
  const m = /^(\d+):(\d+)$/.exec((aspect || '').trim());
  if (!m) return undefined;
  const rw = Number(m[1]);
  const rh = Number(m[2]);
  if (!rw || !rh) return undefined;
  const long = 1280;
  let w: number;
  let h: number;
  if (rw >= rh) {
    w = long;
    h = (long * rh) / rw;
  } else {
    h = long;
    w = (long * rw) / rh;
  }
  const round16 = (x: number) => Math.max(512, Math.min(2048, Math.round(x / 16) * 16));
  return `${round16(w)}*${round16(h)}`;
}

export interface EditImageInput {
  productId?: number;
  assetId?: number;
  sourceImageUrl?: string;
  instruction: string;
  // 场景 key(场景库 scenes.ts:模板注入提示词、决定路由/function/默认候选数)
  scene?: string;
  // wanx2.1-imageedit 系专项 function(super_resolution/expand/remove_watermark/description_edit_with_mask);
  // 显式传入时覆盖场景默认
  editFunction?: string;
  // 请求参数覆盖(如 upscale_factor、四向 scale),合并在场景 defaultParameters 之上
  parameters?: Record<string, unknown>;
  n?: number;
  // 显式指定服务+模型(前端「选模型」);缺省时按 resolveImageEditTarget 自动解析
  llmService?: string;
  model?: string;
  // 图片比例(如 "16:9"):换算成 parameters.size("宽*高")透传给服务商;仅在未显式给 parameters.size 时生效
  aspect?: string;
  // 第二张图 URL(Logo定制的 Logo 图 / 换材质的材质参考图 / 模特图的模特参考图):作为 image[1] 与源图一起送多图编辑
  refImageUrl?: string;
  // 目标语种(图片翻译 translate 场景):注入模板 {target_language},如 "English" / "日本語"
  targetLanguage?: string;
  // 风格(生产流程图 process 场景):注入模板 {style},如 "商务信息图" / "简约卡通"
  style?: string;
  // 模型档语义:'basic'≈标准/flash,'advanced'≈pro/plus/max。显式 llmService+model 优先;否则 tier 经
  // resolveModelByTier(env AI_LISTING_MODEL_TIERS)映射到具体模型,无映射回退自动解析
  tier?: 'basic' | 'advanced';
  // 纯文生图(t2i):显式置 true 时允许不带源图,images 传空 → 服务商走 images/generations 端点
  // (grok-imagine-image 等仅支持 t2i 的模型;模版缩略图批产用)。产物仍只落候选,铁律不变。
  textToImage?: boolean;
}

// 指令式改图:源图(资产或 URL)→ data URI → plugin-ai invokeMediaTask(产物已转存 File Manager)→
// 每张产物落一行候选资产(origin=ai_candidate,不进发布)。同步等待,供受控 action 与会话工具调用。
// 带 scene 时提示词由场景模板注入、路由/function/候选数取场景默认(显式入参仍可覆盖)。
export async function editImage(
  plugin: PluginLike,
  input: EditImageInput,
): Promise<{ jobId: number; assets: Array<{ assetId: number; url: string }>; model: string }> {
  const { app } = plugin;
  let sceneDef: MediaScene | undefined;
  if (input.scene) {
    sceneDef = getMediaScene(input.scene);
    if (!sceneDef) {
      const known = listMediaScenes()
        .map((s) => s.key)
        .join(' / ');
      throw new MediaServiceError('MEDIA_SCENE_UNKNOWN', `未知场景「${input.scene}」,可用场景:${known}`);
    }
  }
  const instruction = (input.instruction || '').trim();
  if (!instruction && (!sceneDef || sceneDef.instructionRequired)) {
    throw new MediaServiceError(
      'MEDIA_EDIT_NO_INSTRUCTION',
      sceneDef ? `场景「${sceneDef.key}」需要提供指令:${sceneDef.hint}` : '缺少编辑指令',
    );
  }
  const prompt = sceneDef
    ? buildScenePrompt(sceneDef, { instruction, target_language: input.targetLanguage, style: input.style })
    : instruction;
  await checkDailyLimit(app, JOB_TYPE_IMAGE_EDIT, IMAGE_DAILY_LIMIT);

  const Assets = app.db.getRepository('aiListingMediaAssets');
  let sourceAsset: { get: (k: string) => unknown } | null = null;
  let sourceUrl = (input.sourceImageUrl || '').trim();
  if (input.assetId) {
    sourceAsset = await Assets.findOne({ filterByTk: input.assetId });
    if (!sourceAsset) throw new MediaServiceError('MEDIA_SOURCE_NOT_FOUND', `源图资产 ${input.assetId} 不存在`);
    if (input.productId && Number(sourceAsset.get('productId')) !== Number(input.productId)) {
      throw new MediaServiceError('MEDIA_SOURCE_NOT_FOUND', '源图不属于该商品');
    }
    const meta = (sourceAsset.get('meta') as Record<string, unknown>) || {};
    sourceUrl = (meta.storedUrl as string) || (sourceAsset.get('sourceUrl') as string) || '';
  }
  if (!sourceUrl && !input.textToImage) {
    throw new MediaServiceError('MEDIA_SOURCE_NOT_FOUND', '缺少源图(assetId 或 sourceImageUrl)');
  }
  const productId = input.productId ?? (sourceAsset?.get('productId') as number | undefined) ?? null;

  const editFunction = input.editFunction ?? (sceneDef?.route === 'function' ? sceneDef.editFunction : undefined);
  const route: 'instruct' | 'function' = editFunction ? 'function' : 'instruct';
  // 前端显式选了模型就用它;否则档位(基础/进阶)映射;都没有则自动解析(env → 能力扫描)
  const target =
    input.llmService && input.model
      ? { llmService: input.llmService, model: input.model }
      : input.tier
        ? await resolveModelByTier(app, input.tier, { route })
        : await resolveImageEditTarget(app, { route });
  const { provider } = await getAIPlugin(app).aiManager.getLLMService(target);

  const n = Math.min(Math.max(Number(input.n) || sceneDef?.defaultN || DEFAULT_EDIT_CANDIDATES(), 1), 4);
  const parameters: Record<string, unknown> = {
    ...(sceneDef?.defaultParameters || {}),
    ...(input.parameters || {}),
    n,
  };
  const traceId = `media-edit-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const Jobs = app.db.getRepository('aiListingMediaJobs');
  const job = await Jobs.create({
    values: {
      jobType: JOB_TYPE_IMAGE_EDIT,
      status: 'running',
      traceId,
      productId,
      assetId: input.assetId ?? null,
      provider: target.llmService,
      model: target.model,
      prompt,
      metadata: { scene: input.scene ?? null, instruction, editFunction: editFunction ?? null, parameters, sourceUrl },
    },
  });
  const jobId = job.get('id') as number;
  await writeAudit(app, 'ai.image_edit', prompt, traceId);

  const startedAt = Date.now();
  const refUrl = (input.refImageUrl || '').trim();
  try {
    // t2i 模式无源图:images 传空,media-task 基类据此路由到 images/generations(纯文生图)
    const srcInfo = sourceUrl ? await sourceImageInfo(sourceUrl) : null;
    // 第二张图(Logo/材质参考):解析为 data URI,与源图一起作为多图输入(image[]);失败不阻断,退化为单图
    let refInfo: { dataUri: string } | undefined;
    if (refUrl) {
      try {
        refInfo = await sourceImageInfo(refUrl);
      } catch {
        refInfo = undefined;
      }
    }
    // hd 超分:upscale_factor 只是本层语义(默认 2),换算成服务商认识的 size 后从参数里拿掉
    if (sceneDef?.sizeStrategy === 'upscale') {
      const factor = Math.min(Math.max(Number(parameters.upscale_factor) || 2, 1), 4);
      delete parameters.upscale_factor;
      if (srcInfo?.width && srcInfo?.height && !parameters.size) {
        const size = upscaleSize(srcInfo.width, srcInfo.height, factor);
        if (size) parameters.size = size;
      }
    }
    // 图片比例(aspect)→ size:仅在未显式给 parameters.size 时生效(不与 hd 超分冲突)
    if (input.aspect && !parameters.size) {
      const size = ratioToSize(input.aspect);
      if (size) parameters.size = size;
    }
    // i豆记账(W6):单张价按 场景×档位;每张候选记单价,任务记总额。只记不扣(无余额体系)。
    const beanUnit = estimateCost({ scene: input.scene, tier: input.tier, count: 1, sources: 1 }).beans;
    const images = srcInfo ? (refInfo ? [srcInfo.dataUri, refInfo.dataUri] : [srcInfo.dataUri]) : [];
    const output = await provider.invokeMediaTask({
      task: 'image_gen',
      model: target.model,
      prompt,
      images,
      audios: [],
      options: { ...(editFunction ? { function: editFunction } : {}), parameters },
    });
    if (!output.urls?.length) throw new MediaServiceError('MEDIA_GENERATE_FAILED', '模型未返回图片');
    const assets: Array<{ assetId: number; url: string }> = [];
    for (const url of output.urls) {
      // plugin-ai 层已转存的产物带 fileId;个别转存失败回退的远端 URL 再由本插件补一次下载
      let fileId = output.files?.find((f) => f.url === url)?.fileId;
      let finalUrl = url;
      if (fileId == null && /^https?:/i.test(url)) {
        try {
          const stored = await downloadToStorage(plugin as never, url);
          fileId = stored.fileId;
          finalUrl = stored.url || url;
        } catch {
          // 保留远端 URL(24h 时效),不阻断
        }
      }
      const asset = await Assets.create({
        values: {
          productId,
          assetType: 'image',
          role: 'detail',
          origin: 'ai_candidate',
          finalSelected: false,
          discarded: false,
          parentAssetId: (sourceAsset?.get('id') as number | undefined) ?? null,
          sourceUrl: finalUrl,
          sourceFileId: fileId ?? null,
          processStatus: 'success',
          processType: 'ai_edit',
          genParams: {
            scene: input.scene ?? null,
            instruction,
            prompt,
            editFunction: editFunction ?? null,
            parameters,
            aspect: input.aspect ?? null,
            tier: input.tier ?? null,
            refImageUrl: refUrl || null,
            targetLanguage: input.targetLanguage ?? null,
            style: input.style ?? null,
            compareMode: sceneDef?.compareMode ?? 'side_by_side',
            model: target.model,
            llmService: target.llmService,
            n,
            sourceAssetId: (sourceAsset?.get('id') as number | undefined) ?? null,
            sourceImageUrl: sourceUrl || null,
            estimatedBeans: beanUnit,
          },
          meta: { storedUrl: finalUrl, prompt, model: target.model },
        },
      });
      assets.push({ assetId: asset.get('id') as number, url: finalUrl });
    }
    await Jobs.update({
      filterByTk: jobId,
      values: {
        status: 'success',
        durationMs: Date.now() - startedAt,
        metadata: {
          scene: input.scene ?? null,
          instruction,
          editFunction: editFunction ?? null,
          parameters,
          sourceUrl,
          assets,
          estimatedBeans: beanUnit * assets.length,
        },
      },
    });
    return { jobId, assets, model: target.model };
  } catch (e) {
    await Jobs.update({
      filterByTk: jobId,
      values: {
        status: 'failed',
        errorMessage: String((e as Error)?.message || e).slice(0, 500),
        retryable: true,
        durationMs: Date.now() - startedAt,
      },
    });
    if (e instanceof MediaServiceError) throw e;
    throw new MediaServiceError('MEDIA_EDIT_FAILED', `图片编辑失败:${(e as Error)?.message}`);
  }
}

// ============================================================================
// 智能视频:图生视频(i2v)候选管线(创意工坊 P8)。与图片编辑同一套候选生命周期,但走异步任务(视频耗时数分钟):
// generateVideo 建任务立即返回 jobId(不阻塞),前端轮询 videoJobStatus 推进。铁律:视频端点(DashScope 万相 i2v)
// 强制公网可访问 img_url → 入源统一经 toPublicUrl(生产设 env AI_LISTING_PUBLIC_BASE_URL=公网域名);产物落
// 视频候选(origin=ai_candidate,assetType=video),用户显式采纳(actorType=user)后进商品视频位,发布只带采纳视频。
// ============================================================================

export interface GenerateVideoInput {
  productId?: number;
  assetId?: number;
  sourceImageUrl?: string;
  // 运镜/画面描述(可选;i2v 缺省给通用运镜)
  prompt?: string;
  // 目标时长(秒)与分辨率(如 '720P'/'1080P');透传服务商 parameters
  duration?: number;
  resolution?: string;
  // toPublicUrl 无 env 基址时的兜底基址(通常取请求 origin)
  publicBaseUrl?: string;
}

const I2V_DEFAULT_PROMPT = '让画面自然地轻微运动:商品缓慢旋转/镜头缓缓推近,展示细节,光影真实,不改变商品本身。';

// 图生视频:源图经 toPublicUrl 落公网 URL → DashScope 万相 i2v 异步任务 → 建 JOB_TYPE_VIDEO(带 productId)。
// 立即返回 jobId,不阻塞(视频耗时数分钟);完成由 pollVideoJob 推进并落视频候选。
export async function generateVideo(
  plugin: PluginLike,
  input: GenerateVideoInput,
): Promise<{ jobId: number; providerTaskId: string; model: string }> {
  const { app } = plugin;
  await checkDailyLimit(app, JOB_TYPE_VIDEO, VIDEO_DAILY_LIMIT);

  const Assets = app.db.getRepository('aiListingMediaAssets');
  let sourceAsset: { get: (k: string) => unknown } | null = null;
  let sourceUrl = (input.sourceImageUrl || '').trim();
  if (input.assetId) {
    sourceAsset = await Assets.findOne({ filterByTk: input.assetId });
    if (!sourceAsset) throw new MediaServiceError('MEDIA_SOURCE_NOT_FOUND', `源图资产 ${input.assetId} 不存在`);
    if (input.productId && Number(sourceAsset.get('productId')) !== Number(input.productId)) {
      throw new MediaServiceError('MEDIA_SOURCE_NOT_FOUND', '源图不属于该商品');
    }
    const meta = (sourceAsset.get('meta') as Record<string, unknown>) || {};
    sourceUrl = (meta.storedUrl as string) || (sourceAsset.get('sourceUrl') as string) || '';
  }
  if (!sourceUrl) throw new MediaServiceError('MEDIA_SOURCE_NOT_FOUND', '缺少源图(assetId 或 sourceImageUrl)');
  const productId = input.productId ?? (sourceAsset?.get('productId') as number | undefined) ?? null;

  // 视频端点强制公网 img_url:非公网(本地相对路径且无 env/兜底基址)直接拒,提示配置公网基址
  const pub = await toPublicUrl(app, { url: sourceUrl }, { baseUrl: input.publicBaseUrl });
  if (!pub.public) {
    throw new MediaServiceError(
      'MEDIA_SOURCE_NOT_PUBLIC',
      '图生视频要求源图可公网访问:请配置 AI_LISTING_PUBLIC_BASE_URL(如 https://app.xuanwu.space)指向可对外访问的存储。',
    );
  }

  const provider = await resolveMediaProvider(app);
  const prompt = (input.prompt || '').trim() || I2V_DEFAULT_PROMPT;
  const parameters: Record<string, unknown> = {};
  if (input.resolution) parameters.resolution = input.resolution;
  if (input.duration) parameters.duration = input.duration;

  const submitted = await provider.submitVideo({ prompt, sourceImageUrl: pub.url, parameters });
  const traceId = `media-i2v-${submitted.providerTaskId}`;
  const Jobs = app.db.getRepository('aiListingMediaJobs');
  const job = await Jobs.create({
    values: {
      jobType: JOB_TYPE_VIDEO,
      status: 'running',
      traceId,
      productId,
      assetId: input.assetId ?? null,
      provider: provider.name,
      model: submitted.model,
      prompt,
      metadata: {
        providerTaskId: submitted.providerTaskId,
        model: submitted.model,
        mode: 'i2v',
        prompt,
        duration: input.duration ?? null,
        resolution: input.resolution ?? null,
        sourceUrl,
        publicImgUrl: pub.url,
        parentAssetId: (sourceAsset?.get('id') as number | undefined) ?? null,
        estimatedBeans: estimateCost({ scene: 'video', count: 1, sources: 1 }).beans,
      },
    },
  });
  await writeAudit(app, 'ai.video_generate', prompt, traceId);
  return { jobId: job.get('id') as number, providerTaskId: submitted.providerTaskId, model: submitted.model };
}

// 轮询图生视频任务并推进:running→running;failed→标记失败;success→下载视频落库 + 建视频候选(origin=ai_candidate)。
export async function pollVideoJob(
  plugin: PluginLike,
  jobId: number,
): Promise<{ status: string; assetId?: number; url?: string; errorMessage?: string }> {
  const { app } = plugin;
  const Jobs = app.db.getRepository('aiListingMediaJobs');
  const job = await Jobs.findOne({ filterByTk: jobId });
  if (!job || job.get('jobType') !== JOB_TYPE_VIDEO) {
    throw new MediaServiceError('MEDIA_JOB_NOT_FOUND', `未找到视频任务 ${jobId}`);
  }
  const metadata = (job.get('metadata') as Record<string, unknown>) || {};
  const status = job.get('status') as string;
  if (status === 'success') {
    return { status, assetId: metadata.assetId as number, url: metadata.storedUrl as string };
  }
  if (status === 'failed') {
    return { status, errorMessage: (job.get('errorMessage') as string) || '视频生成失败' };
  }

  const provider = await resolveMediaProvider(app);
  const polled = await provider.pollTask(metadata.providerTaskId as string);
  if (polled.status === 'running') return { status: 'running' };
  if (polled.status === 'failed') {
    await Jobs.update({
      filterByTk: jobId,
      values: { status: 'failed', errorMessage: polled.errorMessage, retryable: true },
    });
    return { status: 'failed', errorMessage: polled.errorMessage };
  }

  // 成功:下载视频落 File Manager,建视频候选资产(不进发布,待用户采纳)
  const productId = (metadata.productId as number) ?? (job.get('productId') as number) ?? null;
  const Assets = app.db.getRepository('aiListingMediaAssets');
  let fileId: number | undefined;
  let finalUrl = polled.resultUrl as string;
  try {
    const stored = await downloadToStorage(plugin as never, polled.resultUrl as string);
    fileId = stored.fileId;
    finalUrl = stored.url || finalUrl;
  } catch {
    // 保留远端 URL(时效),不阻断
  }
  const asset = await Assets.create({
    values: {
      productId: job.get('productId') ?? productId,
      assetType: 'video',
      role: 'video',
      origin: 'ai_candidate',
      finalSelected: false,
      discarded: false,
      parentAssetId: (metadata.parentAssetId as number | undefined) ?? null,
      sourceUrl: finalUrl,
      sourceFileId: fileId ?? null,
      processStatus: 'success',
      processType: 'ai_video',
      genParams: {
        mode: 'i2v',
        prompt: metadata.prompt,
        duration: metadata.duration ?? null,
        resolution: metadata.resolution ?? null,
        model: metadata.model,
        sourceImageUrl: metadata.sourceUrl,
        sourceAssetId: (metadata.parentAssetId as number | undefined) ?? null,
        estimatedBeans: (metadata.estimatedBeans as number | undefined) ?? null,
      },
      meta: { storedUrl: finalUrl, prompt: metadata.prompt, model: metadata.model },
    },
  });
  const assetId = asset.get('id') as number;
  await Jobs.update({
    filterByTk: jobId,
    values: {
      status: 'success',
      outputFileId: fileId ?? null,
      metadata: { ...metadata, storedUrl: finalUrl, assetId },
    },
  });
  return { status: 'success', assetId, url: finalUrl };
}

function assetUrl(asset: { get: (k: string) => unknown }): string {
  const meta = (asset.get('meta') as Record<string, unknown>) || {};
  return (meta.storedUrl as string) || (asset.get('sourceUrl') as string) || '';
}

// 商品状态锁:与 saveFinal 同一把锁、同一套话术(采纳/弃用会改变最终发布内容)
async function assertProductEditable(app: Application, productId: number): Promise<{ status: string }> {
  const product = await app.db.getRepository('aiListingProducts').findOne({ filterByTk: productId });
  if (!product) throw new MediaServiceError('MEDIA_PRODUCT_NOT_FOUND', `商品 ${productId} 不存在`);
  const status = product.get('status') as string;
  if (!EDITABLE_STATUS.includes(status)) {
    const hint =
      status === 'reviewed'
        ? '该商品已审核,图集已锁定。请先「回退审核」再采纳/弃用。'
        : status === 'publishing'
          ? '该商品正在发布中,请等发布结束(成功/失败)后再操作图集。'
          : status === 'published'
            ? '该商品已发布。请先「退回编辑」再调整图集(平台上已发布的内容不受影响)。'
            : `商品状态「${status}」不可编辑图集。`;
    throw new MediaServiceError('MEDIA_ADOPT_LOCKED', hint);
  }
  return { status };
}

export interface AdoptAssetInput {
  assetId: number;
  // append(默认):追加为新详情图,排到图集末尾;replace:替换指定原图(原图 discarded,不删行)
  mode?: 'append' | 'replace';
  replaceAssetId?: number;
  actorId: string;
  traceId: string;
}

// 采纳候选图进最终集:用户显式动作(actorType=user),受商品状态锁约束,写审计(替换时留原图快照)。
export async function adoptAsset(
  plugin: PluginLike,
  input: AdoptAssetInput,
): Promise<{ productId: number; role: string; sort: number; replacedAssetId?: number }> {
  const { app } = plugin;
  const Assets = app.db.getRepository('aiListingMediaAssets');
  const asset = await Assets.findOne({ filterByTk: input.assetId });
  if (!asset) throw new MediaServiceError('MEDIA_ASSET_NOT_FOUND', `候选图 ${input.assetId} 不存在`);
  const origin = asset.get('origin') as string;
  if (origin !== 'ai_candidate' && origin !== 'ai_adopted') {
    throw new MediaServiceError('MEDIA_NOT_CANDIDATE', '只能采纳 AI 生成的候选图');
  }
  if (asset.get('discarded')) throw new MediaServiceError('MEDIA_CANDIDATE_DISCARDED', '该候选图已弃用,不能采纳');
  const productId = asset.get('productId') as number;
  if (!productId) throw new MediaServiceError('MEDIA_ASSET_NO_PRODUCT', '候选图未关联商品,无法采纳');
  const { status } = await assertProductEditable(app, productId);

  // 视频候选:单视频位。采纳把之前采纳的视频移出(discarded),本视频占位(finalSelected=true, role=video)。
  if (asset.get('assetType') === 'video') {
    const prevVideos = await Assets.find({ filter: { productId, assetType: 'video', finalSelected: true } });
    const displacedVideoIds: number[] = [];
    for (const pv of prevVideos) {
      if (Number(pv.get('id')) !== Number(input.assetId)) {
        displacedVideoIds.push(Number(pv.get('id')));
        await Assets.update({ filterByTk: pv.get('id') as number, values: { finalSelected: false, discarded: true } });
      }
    }
    await Assets.update({
      filterByTk: input.assetId,
      values: { finalSelected: true, origin: 'ai_adopted', role: 'video' },
    });
    const patch: Record<string, unknown> = { status: 'reviewing' };
    if (status === 'publish_failed') patch.reviewStatus = 'pending';
    await app.db.getRepository('aiListingProducts').update({ filterByTk: productId, values: patch });
    try {
      await writeAuditEntries(app.db.getRepository('aiListingAuditLogs'), [
        {
          actorType: 'user',
          actorId: input.actorId,
          action: 'media.adopt',
          resourceType: 'product',
          resourceId: productId,
          fieldName: `video#${input.assetId}`,
          oldValue: null,
          // displacedVideoIds:撤销采纳(revertAdoptAsset)靠它恢复被顶掉的旧采纳视频
          newValue: { assetId: input.assetId, url: assetUrl(asset), role: 'video', displacedVideoIds },
          reason: 'AI 视频候选采纳为商品视频',
          traceId: input.traceId,
        },
      ]);
    } catch {
      // 审计失败不回滚采纳
    }
    return { productId, role: 'video', sort: 0 };
  }

  let role = 'detail';
  let sort: number;
  let replacedAssetId: number | undefined;
  let replacedSnapshot: Record<string, unknown> | null = null;
  if (input.mode === 'replace') {
    if (!input.replaceAssetId)
      throw new MediaServiceError('MEDIA_REPLACE_TARGET_REQUIRED', '替换模式需要 replaceAssetId');
    const target = await Assets.findOne({ filterByTk: input.replaceAssetId });
    if (!target || Number(target.get('productId')) !== Number(productId)) {
      throw new MediaServiceError('MEDIA_REPLACE_TARGET_INVALID', '被替换图不存在或不属于该商品');
    }
    if (Number(target.get('id')) === Number(input.assetId)) {
      throw new MediaServiceError('MEDIA_REPLACE_TARGET_INVALID', '不能用候选图替换它自己');
    }
    if (target.get('discarded')) {
      throw new MediaServiceError('MEDIA_REPLACE_TARGET_INVALID', '被替换图已被移出最终集');
    }
    role = (target.get('role') as string) || 'detail';
    sort = Number(target.get('sort')) || 0;
    replacedAssetId = target.get('id') as number;
    replacedSnapshot = { replacedAssetId, url: assetUrl(target), role, sort };
    const targetMeta = (target.get('meta') as Record<string, unknown>) || {};
    await Assets.update({
      filterByTk: replacedAssetId,
      values: { discarded: true, meta: { ...targetMeta, replacedBy: input.assetId } },
    });
  } else {
    // 追加:排到该商品未弃用图片的末尾
    const rows = await Assets.find({ filter: { productId, assetType: 'image' } });
    sort =
      rows
        .filter((r: { get: (k: string) => unknown }) => !r.get('discarded'))
        .reduce((mx: number, r: { get: (k: string) => unknown }) => Math.max(mx, Number(r.get('sort')) || 0), 0) + 1;
  }
  await Assets.update({
    filterByTk: input.assetId,
    values: { finalSelected: true, origin: 'ai_adopted', role, sort },
  });
  // 内容变化 → 状态收敛 reviewing(与 saveFinal 一致;publish_failed 重新进入待审)
  const patch: Record<string, unknown> = { status: 'reviewing' };
  if (status === 'publish_failed') patch.reviewStatus = 'pending';
  await app.db.getRepository('aiListingProducts').update({ filterByTk: productId, values: patch });

  const entries: AuditEntry[] = [
    {
      actorType: 'user',
      actorId: input.actorId,
      action: 'media.adopt',
      resourceType: 'product',
      resourceId: productId,
      fieldName: `media#${input.assetId}`,
      oldValue: replacedSnapshot,
      newValue: { assetId: input.assetId, url: assetUrl(asset), mode: input.mode || 'append', role, sort },
      reason: input.mode === 'replace' ? 'AI 候选图替换原图(用户确认)' : 'AI 候选图追加为最终图',
      traceId: input.traceId,
    },
  ];
  try {
    await writeAuditEntries(app.db.getRepository('aiListingAuditLogs'), entries);
  } catch {
    // 审计失败不回滚采纳
  }
  return { productId, role, sort, replacedAssetId };
}

export interface RevertAdoptInput {
  assetId: number;
  actorId: string;
  traceId: string;
}

// 撤销采纳(采纳的后悔药,支撑前端「已采纳·撤销」toast):候选回到候选区(finalSelected=false,origin 回
// ai_candidate),并按该资产最近一条 media.adopt 审计回放副作用——图片替换模式恢复被替换原图、视频恢复被
// 顶掉的旧采纳视频。受商品状态锁约束,写 media.adoptRevert 审计(actorType=user)。
export async function revertAdoptAsset(
  plugin: PluginLike,
  input: RevertAdoptInput,
): Promise<{ productId: number; restoredAssetIds: number[] }> {
  const { app } = plugin;
  const Assets = app.db.getRepository('aiListingMediaAssets');
  const asset = await Assets.findOne({ filterByTk: input.assetId });
  if (!asset) throw new MediaServiceError('MEDIA_ASSET_NOT_FOUND', `素材 ${input.assetId} 不存在`);
  if ((asset.get('origin') as string) !== 'ai_adopted' || !asset.get('finalSelected')) {
    throw new MediaServiceError('MEDIA_NOT_ADOPTED', '该素材不是已采纳的候选,无法撤销采纳');
  }
  const productId = asset.get('productId') as number;
  if (!productId) throw new MediaServiceError('MEDIA_ASSET_NO_PRODUCT', '素材未关联商品,无法撤销');
  await assertProductEditable(app, productId);

  const isVideo = asset.get('assetType') === 'video';
  const Audit = app.db.getRepository('aiListingAuditLogs');
  const lastAdopt = await Audit.findOne({
    filter: {
      action: 'media.adopt',
      resourceType: 'product',
      resourceId: productId,
      fieldName: `${isVideo ? 'video' : 'media'}#${input.assetId}`,
    },
    sort: ['-id'],
  });

  const restoredAssetIds: number[] = [];
  if (isVideo) {
    const displaced = ((lastAdopt?.get('newValue') as Record<string, unknown>)?.displacedVideoIds as number[]) || [];
    for (const id of displaced) {
      const pv = await Assets.findOne({ filterByTk: id });
      if (pv) {
        await Assets.update({ filterByTk: id, values: { discarded: false, finalSelected: true } });
        restoredAssetIds.push(Number(id));
      }
    }
  } else {
    const replacedAssetId = Number((lastAdopt?.get('oldValue') as Record<string, unknown>)?.replacedAssetId as number);
    if (replacedAssetId) {
      const target = await Assets.findOne({ filterByTk: replacedAssetId });
      if (target && target.get('discarded')) {
        const targetMeta = { ...((target.get('meta') as Record<string, unknown>) || {}) };
        delete targetMeta.replacedBy;
        await Assets.update({ filterByTk: replacedAssetId, values: { discarded: false, meta: targetMeta } });
        restoredAssetIds.push(replacedAssetId);
      }
    }
  }
  // 候选回位:回到候选区可再次采纳/弃用(role/sort 残值无害,finalSelected=false 即不在最终集)
  await Assets.update({
    filterByTk: input.assetId,
    values: { finalSelected: false, origin: 'ai_candidate' },
  });
  try {
    await writeAuditEntries(app.db.getRepository('aiListingAuditLogs'), [
      {
        actorType: 'user',
        actorId: input.actorId,
        action: 'media.adoptRevert',
        resourceType: 'product',
        resourceId: productId,
        fieldName: `${isVideo ? 'video' : 'media'}#${input.assetId}`,
        oldValue: { assetId: input.assetId, finalSelected: true },
        newValue: { reverted: true, restoredAssetIds },
        reason: '用户撤销采纳,候选回到候选区',
        traceId: input.traceId,
      },
    ]);
  } catch {
    // 审计失败不回滚撤销
  }
  return { productId, restoredAssetIds };
}

export interface DiscardAssetInput {
  assetId: number;
  actorId: string;
  traceId: string;
}

// 弃用候选图:纯候选可随时弃用;已采纳(finalSelected)的弃用会改变最终集,须过商品状态锁。幂等。
export async function discardAsset(
  plugin: PluginLike,
  input: DiscardAssetInput,
): Promise<{ productId: number | null; alreadyDiscarded: boolean }> {
  const { app } = plugin;
  const Assets = app.db.getRepository('aiListingMediaAssets');
  const asset = await Assets.findOne({ filterByTk: input.assetId });
  if (!asset) throw new MediaServiceError('MEDIA_ASSET_NOT_FOUND', `候选图 ${input.assetId} 不存在`);
  const origin = asset.get('origin') as string;
  if (origin !== 'ai_candidate' && origin !== 'ai_adopted') {
    throw new MediaServiceError('MEDIA_NOT_CANDIDATE', '只能弃用 AI 生成的候选图');
  }
  const productId = (asset.get('productId') as number) || null;
  if (asset.get('discarded')) return { productId, alreadyDiscarded: true };
  if (asset.get('finalSelected') && productId) {
    await assertProductEditable(app, productId);
  }
  await Assets.update({ filterByTk: input.assetId, values: { discarded: true, finalSelected: false } });
  try {
    await writeAuditEntries(app.db.getRepository('aiListingAuditLogs'), [
      {
        actorType: 'user',
        actorId: input.actorId,
        action: 'media.discard',
        resourceType: 'product',
        resourceId: productId || 0,
        fieldName: `media#${input.assetId}`,
        oldValue: { origin, finalSelected: Boolean(asset.get('finalSelected')) },
        newValue: { discarded: true },
        reason: '弃用 AI 候选图',
        traceId: input.traceId,
      },
    ]);
  } catch {
    // 审计失败不回滚弃用
  }
  return { productId, alreadyDiscarded: false };
}
