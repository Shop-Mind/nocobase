/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// 模型能力注册中心:全模态通道(生图/生视频/TTS/ASR/Omni)统一从这里判定模型能干什么,取代散落各处的
// 命名正则。查找链(先命中者生效):
//   ① env AI_MODEL_CAPABILITY_OVERRIDES(JSON,零发版补条目/纠错,最高优先)
//   ② env AI_EMPLOYEE_IMAGE_GEN_MODELS / AI_EMPLOYEE_VIDEO_GEN_MODELS(历史正则扩展,兼容保留)
//   ③ 内置家族规则表(自维护;百炼 tts/万相/音频等模型是公开目录的盲区,必须内置)
//   ④ LiteLLM 公开目录(首个查询后台异步拉取 + 每日刷新,失败静默降级,永不阻塞)
//   ⑤ 默认 chat(text→text)
// 提供商可覆盖 LLMProvider.getModelCapability() 精确声明自家模型。

export type ModalityInput = 'text' | 'image' | 'audio' | 'video' | 'file';
export type ModalityOutput = 'text' | 'image' | 'audio' | 'video';
export type ModelTask = 'chat' | 'image_gen' | 'video_gen' | 'tts' | 'asr';

export interface ModelCapability {
  task: ModelTask;
  input: ModalityInput[];
  output: ModalityOutput[];
  supportsTools: boolean;
  supportsStreaming: boolean;
  // 仅支持流式调用(如 qwen-omni 系列,非流式请求会被服务端拒绝)
  streamOnly?: boolean;
}

const capability = (partial: Partial<ModelCapability> & { task: ModelTask }): ModelCapability => ({
  input: ['text'],
  output: ['text'],
  supportsTools: false,
  supportsStreaming: false,
  ...partial,
});

export const TASK_DEFAULTS: Record<ModelTask, ModelCapability> = {
  chat: capability({ task: 'chat', supportsTools: true, supportsStreaming: true }),
  image_gen: capability({ task: 'image_gen', input: ['text', 'image'], output: ['image'] }),
  video_gen: capability({ task: 'video_gen', input: ['text', 'image'], output: ['video'] }),
  tts: capability({ task: 'tts', input: ['text'], output: ['audio'] }),
  asr: capability({ task: 'asr', input: ['audio'], output: ['text'] }),
};

// 名称归一化:小写、去 provider 前缀(dashscope/qwen-max)、去日期与 latest 后缀,
// 让 qwen-image-2.0-pro-2026-04-22 与 qwen-image-2.0-pro 命中同一条规则/目录条目
export function normalizeModelName(model: string): string {
  let name = String(model || '')
    .trim()
    .toLowerCase();
  const slash = name.lastIndexOf('/');
  if (slash >= 0) {
    name = name.slice(slash + 1);
  }
  return name
    .replace(/-latest$/, '')
    .replace(/-20\d{2}-\d{2}-\d{2}$/, '')
    .replace(/-20\d{2}\d{2}\d{2}$/, '')
    .replace(/-\d{4}$/, '');
}

// 内置家族规则(顺序即优先级,先命中者生效)。覆盖调研确认的各家族:
// 百炼(qwen/wan/paraformer/cosyvoice/sensevoice)、OpenAI(gpt-image/dall-e/tts/whisper/transcribe)、
// 火山(seedream/seedance)、Gemini(*-image)等;新家族优先补这里,个别纠错走 env ①。
const BUILTIN_RULES: Array<{ pattern: RegExp; capability: ModelCapability }> = [
  { pattern: /(^|-)tts(-|\d|$)|cosyvoice|sambert/, capability: TASK_DEFAULTS.tts },
  { pattern: /(^|-)asr(-|\d|$)|paraformer|whisper|transcribe|sensevoice/, capability: TASK_DEFAULTS.asr },
  {
    // qwen-omni / qwen3-omni:全模态输入,文本+语音输出,且仅支持流式
    pattern: /omni/,
    capability: capability({
      task: 'chat',
      input: ['text', 'image', 'audio', 'video'],
      output: ['text', 'audio'],
      supportsTools: true,
      supportsStreaming: true,
      streamOnly: true,
    }),
  },
  {
    pattern: /^wan[0-9x.]*[-.]?(i2v|t2v|kf2v|s2v)|(^|-)video(-|$)|kling|seedance|veo|sora|cogvideo/,
    capability: TASK_DEFAULTS.video_gen,
  },
  {
    // 生成与编辑同族(image_gen 的 input 已含 image):qwen-image-edit*、wanx2.1-imageedit、doubao-seededit*
    // 由 imageedit/seededit 词根兜住,端点差异在各 provider 的 invoker 内路由
    pattern:
      /^(qwen-image|wan[0-9x.]*[-.]?t2i|wanx|gpt-image|dall-e|z-image)|seedream|seededit|imageedit|flux|imagen|(^|-)image(-|$)/,
    capability: TASK_DEFAULTS.image_gen,
  },
  {
    // 视觉理解(qwen-vl / qwen3-vl / qvq / *-vision-*):对话模型 + 图像输入
    pattern: /(^|-)vl(-|\d|$)|vision|qvq/,
    capability: capability({
      task: 'chat',
      input: ['text', 'image'],
      supportsTools: true,
      supportsStreaming: true,
    }),
  },
  {
    // gpt-4o-audio 系:对话模型,语音输入 + 语音输出
    pattern: /^gpt-4o.*audio/,
    capability: capability({
      task: 'chat',
      input: ['text', 'audio'],
      output: ['text', 'audio'],
      supportsTools: true,
      supportsStreaming: true,
    }),
  },
  {
    // qwen-audio / qwen2-audio 系:音频理解对话模型
    pattern: /(^|-)audio(-|\d|$)/,
    capability: capability({
      task: 'chat',
      input: ['text', 'audio'],
      supportsTools: true,
      supportsStreaming: true,
    }),
  },
  {
    // 百炼文本对话家族(qwen-max/plus/turbo/flash/long/coder/math、qwen3.x 同族、qwq、deepseek)钉死为
    // 纯文本 chat:实测百炼兼容端点对这些模型拒绝图像内容(InvalidParameter),而公开目录(LiteLLM)
    // 可能按国际站能力把它们标成支持视觉——若被翻转,历史图片会被重放给模型,整轮对话 400。
    // 置于列表末尾:视觉(vl)/音频/生成等更具体的规则先命中,不受影响
    pattern: /^qwen[0-9x.]*-?(max|plus|turbo|flash|long|coder|math)|^qwq|^deepseek/,
    capability: TASK_DEFAULTS.chat,
  },
];

// —— env ① JSON 覆盖:{"model-name": "image_gen"} 或 {"model-name": {"task":"chat","input":["text","image"]}}
// 键会做同样的归一化;按 env 原文缓存解析结果,进程内改 env(测试)也能即时生效
let envOverridesRaw: string | undefined;
let envOverridesMap: Map<string, ModelCapability> = new Map();

function getEnvOverride(name: string): ModelCapability | null {
  const raw = process.env.AI_MODEL_CAPABILITY_OVERRIDES;
  if (!raw) return null;
  if (raw !== envOverridesRaw) {
    envOverridesRaw = raw;
    envOverridesMap = new Map();
    try {
      const parsed = JSON.parse(raw) as Record<string, ModelTask | Partial<ModelCapability>>;
      for (const [key, value] of Object.entries(parsed)) {
        const entry =
          typeof value === 'string'
            ? TASK_DEFAULTS[value]
            : { ...TASK_DEFAULTS[(value?.task as ModelTask) || 'chat'], ...value };
        if (entry) envOverridesMap.set(normalizeModelName(key), entry);
      }
    } catch {
      // JSON 不合法:忽略该 env,走后续查找链
    }
  }
  return envOverridesMap.get(name) ?? null;
}

// —— env ② 历史正则扩展(AI_EMPLOYEE_IMAGE_GEN_MODELS / AI_EMPLOYEE_VIDEO_GEN_MODELS),按原始模型名匹配
function getLegacyEnvOverride(model: string): ModelCapability | null {
  const match = (envName: string) => {
    const pattern = process.env[envName];
    if (!pattern) return false;
    try {
      return new RegExp(pattern, 'i').test(model);
    } catch {
      return false;
    }
  };
  if (match('AI_EMPLOYEE_VIDEO_GEN_MODELS')) return TASK_DEFAULTS.video_gen;
  if (match('AI_EMPLOYEE_IMAGE_GEN_MODELS')) return TASK_DEFAULTS.image_gen;
  return null;
}

// —— ④ LiteLLM 公开目录(https://github.com/BerriAI/litellm 维护的 model_prices_and_context_window.json,
// 2900+ 模型含 mode/supports_vision/supports_audio_* 字段),作为内置规则未覆盖模型的兜底
const LITELLM_CATALOG_URL =
  'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json';
const CATALOG_REFRESH_INTERVAL = 24 * 60 * 60 * 1000;

interface LiteLLMEntry {
  mode?: string;
  supports_vision?: boolean;
  supports_function_calling?: boolean;
  supports_audio_input?: boolean;
  supports_audio_output?: boolean;
}

let catalogMap: Map<string, ModelCapability> = new Map();
let catalogFetchedAt = 0;
let catalogFetching = false;

function fromCatalogEntry(entry: LiteLLMEntry): ModelCapability | null {
  switch (entry?.mode) {
    case 'chat':
    case 'completion': {
      const input: ModalityInput[] = ['text'];
      const output: ModalityOutput[] = ['text'];
      if (entry.supports_vision) input.push('image');
      if (entry.supports_audio_input) input.push('audio');
      if (entry.supports_audio_output) output.push('audio');
      return capability({
        task: 'chat',
        input,
        output,
        // 目录缺失该字段时按支持工具处理,与现状(所有对话模型一律绑工具)保持一致
        supportsTools: entry.supports_function_calling !== false,
        supportsStreaming: true,
      });
    }
    case 'image_generation':
      return TASK_DEFAULTS.image_gen;
    case 'video_generation':
      return TASK_DEFAULTS.video_gen;
    case 'audio_speech':
      return TASK_DEFAULTS.tts;
    case 'audio_transcription':
      return TASK_DEFAULTS.asr;
    default:
      // embedding / rerank / moderation 等不会出现在对话模型选择里,交给后续查找链
      return null;
  }
}

// 测试与手动注入入口:把一份 LiteLLM 形状的目录 JSON 灌入缓存
export function applyCapabilityCatalog(json: Record<string, unknown>): void {
  const next = new Map<string, ModelCapability>();
  for (const [key, value] of Object.entries(json || {})) {
    if (key === 'sample_spec') continue;
    const entry = fromCatalogEntry(value as LiteLLMEntry);
    if (entry) next.set(normalizeModelName(key), entry);
  }
  catalogMap = next;
}

export function resetCapabilityCatalog(): void {
  catalogMap = new Map();
  catalogFetchedAt = 0;
}

// 首个查询触发后台拉取,之后每日刷新;失败静默(离线/被墙环境用内置表兜底),永不阻塞查询线程。
// 测试环境不发起网络请求。
function refreshCapabilityCatalog(): void {
  if (process.env.VITEST || process.env.NODE_ENV === 'test') return;
  const now = Date.now();
  if (catalogFetching || now - catalogFetchedAt < CATALOG_REFRESH_INTERVAL) return;
  catalogFetching = true;
  // 先记时间:失败也等下个周期再试,避免每次查询都发请求
  catalogFetchedAt = now;
  fetch(LITELLM_CATALOG_URL, { signal: AbortSignal.timeout(20000) })
    .then(async (resp) => {
      if (!resp.ok) return;
      applyCapabilityCatalog((await resp.json()) as Record<string, unknown>);
    })
    .finally(() => {
      catalogFetching = false;
    })
    .catch(() => {});
}

export function getModelCapability(model: string): ModelCapability {
  refreshCapabilityCatalog();
  const raw = String(model || '');
  const name = normalizeModelName(raw);
  if (!name) return TASK_DEFAULTS.chat;
  const envOverride = getEnvOverride(name) ?? getLegacyEnvOverride(raw);
  if (envOverride) return envOverride;
  for (const rule of BUILTIN_RULES) {
    if (rule.pattern.test(name)) return rule.capability;
  }
  return catalogMap.get(name) ?? TASK_DEFAULTS.chat;
}
