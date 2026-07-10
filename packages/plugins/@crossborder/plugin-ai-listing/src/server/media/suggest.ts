/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// 推荐提示词(对标创意工坊「点图自动出 3 条」):三级链并行竞速、按优先级收割,每级短超时快速失败——
//   ① 看图:视觉 chat 模型(qwen-vl/gpt-5.5 等,capability task='chat' 且 input 含 'image')看商品图产词;
//   ② 看标题:纯文本 chat 模型(DeepSeek/grok 等)按商品标题产词(视觉线路全挂时的真 AI 降级);
//   ③ 静态示例:全部失败时的固定词,前端明确标注。
// 所有目标同时起跑(不串行等死模型超时),排位靠前者成功即采用,总耗时≈实际应答那一级自身耗时。
// env AI_LISTING_SUGGEST_MODEL("svc:model" 或裸模型名)可锁定只用某一个模型。
// 铁律:只读、只产候选提示词不写库;任何失败绝不报错阻塞前端;商品图与 Key 只在服务端流转,出入参不含 Key。

import type { Application } from '@nocobase/server';
import { MediaServiceError, sourceImageInfo } from './service';

export interface SuggestPromptsInput {
  assetId?: number;
  sourceImageUrl?: string;
  // 'scene_gen'(场景描述)| 'selling_point'(卖点文案)| 'video'(视频运镜创意)| 其它=通用场景
  scene?: string;
  n?: number;
  // 显式指定产词模型(前端「模型」下拉):跳过三级链自动挑选,只试这一个(失败仍落静态)
  llmService?: string;
  model?: string;
}

export interface SuggestPromptsResult {
  prompts: string[];
  // 实际产词的模型;静态兜底时为 null
  model: string | null;
  // true = 静态兜底(basis='static');保留字段兼容旧前端
  fallback: boolean;
  // 产词依据:image=看图 / title=看商品标题(未看图) / static=固定示例
  basis: 'image' | 'title' | 'static';
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

interface SuggestTarget {
  llmService: string;
  model: string;
  // true=视觉模型(带图调用);false=纯文本模型(按商品标题调用)
  vision: boolean;
}

// 组装尝试序列:env 锁定则只有一个;否则视觉模型(capability input 含 image / 已知视觉家族名)在前,
// 纯文本 chat 模型在后(DeepSeek 官方直连最稳,排文本级第一),最多试 4 个。
async function resolveSuggestTargets(aiManager: VisionAiManager): Promise<SuggestTarget[]> {
  const services = await aiManager.listAllEnabledModels();
  const chatModels: Array<{ llmService: string; model: string; input: string[] }> = [];
  for (const s of services) {
    for (const m of s.enabledModels) {
      if (m.capability?.task === 'chat') {
        chatModels.push({ llmService: s.llmService, model: m.value, input: m.capability?.input || [] });
      }
    }
  }
  const isVision = (m: { model: string; input: string[] }) =>
    m.input.includes('image') || VISION_MODEL_NAME.test(m.model);
  const env = (process.env.AI_LISTING_SUGGEST_MODEL || '').trim();
  if (env) {
    if (env.includes(':')) {
      const i = env.indexOf(':');
      const model = env.slice(i + 1);
      return [{ llmService: env.slice(0, i), model, vision: VISION_MODEL_NAME.test(model) }];
    }
    const hit = chatModels.find((m) => m.model === env);
    if (hit) return [{ llmService: hit.llmService, model: hit.model, vision: isVision(hit) }];
  }
  const vision = chatModels.filter(isVision).map((m) => ({ llmService: m.llmService, model: m.model, vision: true }));
  const text = chatModels
    .filter((m) => !isVision(m))
    .sort((a, b) => Number(/deepseek/i.test(b.model)) - Number(/deepseek/i.test(a.model)))
    .map((m) => ({ llmService: m.llmService, model: m.model, vision: false }));
  return [...vision, ...text].slice(0, 4);
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
  if (scene === 'video') {
    return {
      system: '你是资深电商短视频导演,为跨境电商商品制作高转化的动态展示短视频。',
      ask: `请仔细观察这张商品图,产出 ${n} 条不同的商品展示视频镜头脚本,用于 AI 图生视频。每条 40-70 个汉字,中文,必须包含:开场场景氛围、一个明确的镜头运动(缓慢推近/环绕/平移/拉远选其一)、光影变化,并保证商品外观真实不变形;画面中不出现任何文字或水印,不要品牌名。只返回一个 JSON 字符串数组,不要任何多余文字。`,
    };
  }
  return {
    system: '你是资深电商视觉运营,擅长为商品设计有代入感的使用场景。',
    ask: `请仔细观察这张商品图,产出 ${n} 条不同的「使用场景」描述,用于 AI 生成商品场景图。每条 15-40 个汉字,中文,具体到环境/材质/光线/氛围,画面真实可信,不要出现具体品牌名。只返回一个 JSON 字符串数组,例如 ["场景一","场景二"],不要任何多余文字。`,
  };
}

// 文本级(看不了图时):按商品标题产词。约束与看图版一致,只是依据换成标题。
function buildTextSpec(scene: string | undefined, n: number, title: string): { system: string; ask: string } {
  if (scene === 'selling_point') {
    return {
      system: '你是资深电商营销文案专家,擅长从商品信息提炼有冲击力的卖点。',
      ask: `商品标题是「${title}」。请提炼 ${n} 条不同的营销卖点文案,用于生成营销卖点主图。每条 6-16 个汉字,中文,突出材质/功能/适用场景/差异化,不要出现具体品牌名。只返回一个 JSON 字符串数组,例如 ["卖点一","卖点二"],不要任何多余文字。`,
    };
  }
  if (scene === 'video') {
    return {
      system: '你是资深电商短视频导演,为跨境电商商品制作高转化的动态展示短视频。',
      ask: `商品标题是「${title}」。请为该商品产出 ${n} 条不同的商品展示视频镜头脚本,用于 AI 图生视频。每条 40-70 个汉字,中文,必须包含:开场场景氛围、一个明确的镜头运动(缓慢推近/环绕/平移/拉远选其一)、光影变化,并保证商品外观真实不变形;画面中不出现任何文字或水印,不要品牌名。只返回一个 JSON 字符串数组,不要任何多余文字。`,
    };
  }
  return {
    system: '你是资深电商视觉运营,擅长为商品设计有代入感的使用场景。',
    ask: `商品标题是「${title}」。请为该商品产出 ${n} 条不同的「使用场景」描述,用于 AI 生成商品场景图。每条 15-40 个汉字,中文,具体到环境/材质/光线/氛围,画面真实可信,不要出现具体品牌名。只返回一个 JSON 字符串数组,例如 ["场景一","场景二"],不要任何多余文字。`,
  };
}

// 解析模型输出为提示词数组:优先 JSON 数组,退化到按行拆(去项目符号/序号/引号),去空去重截断到 n。
// maxLen:视频创意文案(40-90 字)比图片场景词长,按场景放宽。
function parsePrompts(text: string, n: number, maxLen = 60): string[] {
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
    if (v && v.length <= maxLen && !seen.has(v)) {
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
  const videoPool = [
    '商品静置于原木桌面,晨光透过窗帘洒落,镜头从正面缓慢推近,展示材质细节,光影随时间轻柔移动',
    '纯色影棚背景,商品居中,镜头围绕商品缓慢环绕一周,顶光勾勒轮廓,质感突出',
    '生活化使用场景,商品被自然拿起展示,镜头轻微平移跟随,背景虚化,氛围温暖真实',
  ];
  return (scene === 'selling_point' ? spPool : scene === 'video' ? videoPool : scenePool).slice(0, n);
}

// 单次模型调用(带每级短超时):视觉级带图,文本级带标题;成功返回提示词数组,失败抛给上层换下一级。
const ATTEMPT_TIMEOUT_MS = 15000;
async function attemptTarget(
  aiManager: VisionAiManager,
  target: SuggestTarget,
  opts: { scene?: string; n: number; imageUrl?: string; title?: string },
): Promise<string[]> {
  const { provider } = await aiManager.getLLMService({ llmService: target.llmService, model: target.model });
  if (!provider?.invoke) throw new Error('provider 不支持 invoke');
  const spec = target.vision ? buildSpec(opts.scene, opts.n) : buildTextSpec(opts.scene, opts.n, opts.title || '');
  const content: unknown = target.vision
    ? [
        { type: 'text', text: spec.ask },
        { type: 'image_url', image_url: { url: opts.imageUrl } },
      ]
    : spec.ask;
  const invocation = provider.invoke({
    messages: [
      { role: 'system', content: spec.system },
      { role: 'user', content },
    ],
  });
  const timeout = new Promise<never>((_resolve, reject) =>
    setTimeout(() => reject(new Error('SUGGEST_TIMEOUT')), ATTEMPT_TIMEOUT_MS),
  );
  const res = await Promise.race([invocation, timeout]);
  const prompts = parsePrompts(contentToText(res?.content), opts.n, opts.scene === 'video' ? 160 : 60);
  if (!prompts.length) throw new Error('模型未返回可用提示词');
  return prompts;
}

// 出词主流程:看图 → 看标题 → 静态,逐级降。抛错仅限「缺源图」等参数问题;模型侧问题一律降级(不阻塞前端)。
export async function suggestPrompts(app: Application, input: SuggestPromptsInput): Promise<SuggestPromptsResult> {
  const n = Math.min(Math.max(Number(input.n) || 3, 1), 5);

  let sourceUrl = (input.sourceImageUrl || '').trim();
  let remoteUrl = ''; // 原始远端 URL(通常是公网可访问的抓取源图,如 alicdn)
  let productTitle = ''; // 文本级依据:源图所属商品的标题
  if (input.assetId) {
    const asset = await app.db.getRepository('aiListingMediaAssets').findOne({ filterByTk: input.assetId });
    if (!asset) throw new MediaServiceError('MEDIA_SOURCE_NOT_FOUND', `源图资产 ${input.assetId} 不存在`);
    const meta = (asset.get('meta') as Record<string, unknown>) || {};
    remoteUrl = (asset.get('sourceUrl') as string) || '';
    sourceUrl = (meta.storedUrl as string) || remoteUrl || '';
    const productId = Number(asset.get('productId')) || 0;
    if (productId) {
      const product = await app.db.getRepository('aiListingProducts').findOne({ filterByTk: productId });
      productTitle = String(
        product?.get('titleFinal') || product?.get('titleProcessed') || product?.get('titleOriginal') || '',
      ).trim();
    }
  }
  if (!sourceUrl && !remoteUrl)
    throw new MediaServiceError('MEDIA_SOURCE_NOT_FOUND', '缺少源图(assetId 或 sourceImageUrl)');

  const staticResult = (): SuggestPromptsResult => ({
    prompts: fallbackPrompts(input.scene, n),
    model: null,
    fallback: true,
    basis: 'static',
  });

  const aiManager = getVisionAiManager(app);
  if (!aiManager) return staticResult();
  const targets =
    input.llmService && input.model
      ? [{ llmService: input.llmService, model: input.model, vision: VISION_MODEL_NAME.test(input.model) }]
      : await resolveSuggestTargets(aiManager);

  // 视觉输入图:优先公网 http(s) URL(载荷小、模型直接取图,更快更稳);否则退回本地图 base64 data URI。
  let imageUrl = [remoteUrl, sourceUrl].find((u) => /^https?:\/\//i.test(u)) || '';
  if (!imageUrl && targets.some((t) => t.vision)) {
    try {
      imageUrl = (await sourceImageInfo(sourceUrl)).dataUri;
    } catch {
      imageUrl = '';
    }
  }

  const warn = (msg: string, meta?: unknown) =>
    (app as unknown as { logger?: { warn?: (m: string, x?: unknown) => void } }).logger?.warn?.(msg, meta);

  // 并行优先级竞速(修复:原串行链在视觉线全挂时,要为每个死模型白等 15s 超时才轮到文本级,推荐词动辄 30-45s):
  // 所有可用目标同时起跑,仍按原优先级顺序收割——排位靠前的成功立即采用,失败/超时立刻看下一位(通常已在跑或已完成),
  // 总耗时≈实际应答那一级自身的耗时。代价是高优先级健康时低优先级的调用被浪费(纯 chat 小调用,可接受)。
  // 视觉级没图跳过;文本级没标题跳过(自由模式上传图无商品归属)。
  const runnable = targets.filter((t) => (t.vision ? Boolean(imageUrl) : Boolean(productTitle)));
  const races = runnable.map((target) => ({
    target,
    result: attemptTarget(aiManager, target, { scene: input.scene, n, imageUrl, title: productTitle }).catch(
      (e: Error) => {
        warn('[ai-listing] suggestPrompts attempt failed, trying next', { model: target.model, message: e?.message });
        return null;
      },
    ),
  }));
  for (const race of races) {
    const prompts = await race.result;
    if (prompts?.length) {
      return { prompts, model: race.target.model, fallback: false, basis: race.target.vision ? 'image' : 'title' };
    }
  }
  return staticResult();
}
