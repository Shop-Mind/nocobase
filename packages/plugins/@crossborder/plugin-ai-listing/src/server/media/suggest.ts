/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// 推荐提示词(对标创意工坊「点图自动出 3 条」):看商品图 → 视觉 chat 模型(qwen-vl/gpt-5.5 等,capability
// task='chat' 且 input 含 'image')→ 产出 N 条场景/卖点描述。不是生图端点自带的 prompt_extend(文改文)。
// 铁律:只读、只产候选提示词不写库;无视觉模型/失败/超时 → 返回静态兜底并标 fallback=true,绝不报错阻塞前端;
// 商品图与 Key 只在服务端流转,出入参不含 Key。

import type { Application } from '@nocobase/server';
import { MediaServiceError, sourceImageInfo } from './service';

export interface SuggestPromptsInput {
  assetId?: number;
  sourceImageUrl?: string;
  // 'scene_gen'(场景描述)| 'selling_point'(卖点文案)| 其它=通用场景
  scene?: string;
  n?: number;
}

export interface SuggestPromptsResult {
  prompts: string[];
  // 实际所用视觉模型;走兜底时为 null
  model: string | null;
  // true = 未用真实模型(无视觉模型/失败/超时),prompts 为静态兜底
  fallback: boolean;
}

interface VisionProvider {
  invoke(context: { messages: Array<{ role: string; content: unknown }> }): Promise<{ content?: unknown }>;
}
interface VisionAiManager {
  listAllEnabledModels(): Promise<
    Array<{
      llmService: string;
      enabledModels: Array<{ value: string; capability?: { task?: string; input?: string[] } }>;
    }>
  >;
  getLLMService(opts: { llmService: string; model: string }): Promise<{ provider?: VisionProvider }>;
}

function getVisionAiManager(app: Application): VisionAiManager | undefined {
  const ai = app.pm.get('ai') as unknown as { aiManager?: VisionAiManager } | undefined;
  return ai?.aiManager;
}

// 已知视觉对话家族名(冷 catalog 兜底用):plugin-ai 的能力判定除内置规则外还查 LiteLLM 在线目录(异步、冷缓存),
// 重启后目录未加载时 gpt-5/gpt-4o 等会被暂判为纯文本;按名兜底避免头几次调用误降级。
const VISION_MODEL_NAME = /(^|-)vl(-|\d|$)|vision|qvq|omni|gpt-5|gpt-4o|gpt-4\.|gpt-4-turbo/i;

// 选一个视觉 chat 模型:① capability.task='chat' 且 input 含 'image';② 冷 catalog 兜底按已知视觉家族名匹配。无则 null。
async function resolveVisionModel(aiManager: VisionAiManager): Promise<{ llmService: string; model: string } | null> {
  const services = await aiManager.listAllEnabledModels();
  const chatModels: Array<{ llmService: string; model: string; input: string[] }> = [];
  for (const s of services) {
    for (const m of s.enabledModels) {
      if (m.capability?.task === 'chat') {
        chatModels.push({ llmService: s.llmService, model: m.value, input: m.capability?.input || [] });
      }
    }
  }
  const byCap = chatModels.find((m) => m.input.includes('image'));
  if (byCap) return { llmService: byCap.llmService, model: byCap.model };
  const byName = chatModels.find((m) => VISION_MODEL_NAME.test(m.model));
  if (byName) return { llmService: byName.llmService, model: byName.model };
  return null;
}

function contentToText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((c) => (typeof c === 'string' ? c : (c as { text?: string })?.text ?? ''))
      .join('')
      .trim();
  }
  return content != null ? String(content) : '';
}

// 按场景给系统人格 + 看图指令。要求模型只回 JSON 字符串数组,便于稳定解析。
function buildSpec(scene: string | undefined, n: number): { system: string; ask: string } {
  if (scene === 'selling_point') {
    return {
      system: '你是资深电商营销文案专家,擅长从商品图提炼有冲击力的卖点。',
      ask: `请仔细观察这张商品图,提炼 ${n} 条不同的营销卖点文案,用于生成营销卖点主图。每条 6-16 个汉字,中文,突出材质/功能/适用场景/差异化,不要出现具体品牌名。只返回一个 JSON 字符串数组,例如 ["卖点一","卖点二"],不要任何多余文字。`,
    };
  }
  return {
    system: '你是资深电商视觉运营,擅长为商品设计有代入感的使用场景。',
    ask: `请仔细观察这张商品图,产出 ${n} 条不同的「使用场景」描述,用于 AI 生成商品场景图。每条 15-40 个汉字,中文,具体到环境/材质/光线/氛围,画面真实可信,不要出现具体品牌名。只返回一个 JSON 字符串数组,例如 ["场景一","场景二"],不要任何多余文字。`,
  };
}

// 解析模型输出为提示词数组:优先 JSON 数组,退化到按行拆(去项目符号/序号/引号),去空去重截断到 n。
function parsePrompts(text: string, n: number): string[] {
  if (!text) return [];
  let s = text.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  let arr: unknown[] = [];
  const lb = s.indexOf('[');
  const rb = s.lastIndexOf(']');
  if (lb !== -1 && rb > lb) {
    try {
      const parsed = JSON.parse(s.slice(lb, rb + 1));
      if (Array.isArray(parsed)) arr = parsed;
    } catch {
      // 非合法 JSON,走按行拆分
    }
  }
  if (!arr.length) {
    arr = s
      .split('\n')
      .map((l) =>
        l
          .replace(/^\s*[-*•\d.、)\]"'"']+\s*/, '')
          .replace(/["'"']\s*$/, '')
          .trim(),
      )
      .filter(Boolean);
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of arr) {
    const v = String(p).trim();
    if (v && v.length <= 60 && !seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
    if (out.length >= n) break;
  }
  return out;
}

// 静态兜底(无视觉模型/失败时):非看图,仅给通用可用词,前端标注「示例·可手动输入」。
function fallbackPrompts(scene: string | undefined, n: number): string[] {
  const scenePool = [
    '北欧原木桌面,晨光从左侧柔和洒入,营造温暖居家氛围',
    '现代简约白色大理石台面,柔和顶光,背景虚化绿植,突出高级质感',
    '户外木质桌面,暖调黄昏光线,远处虚化自然景,传达生活方式',
    '极简纯色背景,柔和均匀布光,聚焦商品本身,电商主图风',
  ];
  const spPool = ['精选材质 品质之选', '大容量设计 实用耐用', '简约百搭 场景通用', '细节考究 做工精良'];
  return (scene === 'selling_point' ? spPool : scenePool).slice(0, n);
}

// 看图出词主流程。抛错仅限「缺源图」等参数问题;模型侧问题一律降级为 fallback(不阻塞前端)。
export async function suggestPrompts(app: Application, input: SuggestPromptsInput): Promise<SuggestPromptsResult> {
  const n = Math.min(Math.max(Number(input.n) || 3, 1), 5);

  let sourceUrl = (input.sourceImageUrl || '').trim();
  let remoteUrl = ''; // 原始远端 URL(通常是公网可访问的抓取源图,如 alicdn)
  if (input.assetId) {
    const asset = await app.db.getRepository('aiListingMediaAssets').findOne({ filterByTk: input.assetId });
    if (!asset) throw new MediaServiceError('MEDIA_SOURCE_NOT_FOUND', `源图资产 ${input.assetId} 不存在`);
    const meta = (asset.get('meta') as Record<string, unknown>) || {};
    remoteUrl = (asset.get('sourceUrl') as string) || '';
    sourceUrl = (meta.storedUrl as string) || remoteUrl || '';
  }
  if (!sourceUrl && !remoteUrl)
    throw new MediaServiceError('MEDIA_SOURCE_NOT_FOUND', '缺少源图(assetId 或 sourceImageUrl)');

  const aiManager = getVisionAiManager(app);
  const target = aiManager ? await resolveVisionModel(aiManager) : null;
  if (!aiManager || !target) {
    return { prompts: fallbackPrompts(input.scene, n), model: null, fallback: true };
  }

  try {
    // 视觉输入图:优先公网 http(s) URL(载荷小、模型直接取图,更快更稳);否则退回本地图 base64 data URI。
    const publicUrl = [remoteUrl, sourceUrl].find((u) => /^https?:\/\//i.test(u));
    const imageUrl = publicUrl || (await sourceImageInfo(sourceUrl)).dataUri;
    const { provider } = await aiManager.getLLMService(target);
    if (!provider?.invoke) return { prompts: fallbackPrompts(input.scene, n), model: null, fallback: true };
    const { system, ask } = buildSpec(input.scene, n);
    const invocation = provider.invoke({
      messages: [
        { role: 'system', content: system },
        {
          role: 'user',
          content: [
            { type: 'text', text: ask },
            { type: 'image_url', image_url: { url: imageUrl } },
          ],
        },
      ],
    });
    const timeout = new Promise<never>((_resolve, reject) =>
      setTimeout(() => reject(new Error('SUGGEST_TIMEOUT')), 35000),
    );
    const res = await Promise.race([invocation, timeout]);
    const prompts = parsePrompts(contentToText(res?.content), n);
    if (prompts.length) return { prompts, model: target.model, fallback: false };
    return { prompts: fallbackPrompts(input.scene, n), model: null, fallback: true };
  } catch (e) {
    (app as unknown as { logger?: { warn?: (m: string, meta?: unknown) => void } }).logger?.warn?.(
      '[ai-listing] suggestPrompts failed, fallback',
      { message: (e as Error)?.message },
    );
    return { prompts: fallbackPrompts(input.scene, n), model: null, fallback: true };
  }
}
