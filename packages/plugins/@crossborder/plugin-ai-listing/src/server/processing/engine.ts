/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// 信息处理引擎（PRD §8.2）。把一条商品草稿按规则转换为「建议字段」与「目标字段」，不写任何最终字段（*Final）。
// 引擎是纯函数：只读入参、产出变更描述，不碰数据库、不依赖 ctx，便于单测与替换为真实 AI 调用。
//
// 关键约束（用户要求 #3）：AI 员工只能写建议字段（titleProcessed / descriptionProcessed / attributesProcessed）。
// 价格目标字段（priceTarget / listPriceTarget）属于规则确定性计算，actorType=system；最终字段（*Final）本阶段完全不写。

export interface RuleConfig {
  targetPlatform?: string;
  translate?: { enabled?: boolean; sourceLang?: string; targetLang?: string };
  price?: { fromCurrency?: string; toCurrency?: string; rate?: number; markupPct?: number; ending?: string };
  media?: { jobs?: Array<'remove_watermark' | 'white_bg' | 'crop' | 'scene' | 'video'> };
}

export interface MappingRow {
  source?: string;
  match?: string;
  target?: string;
  replace?: string;
  type?: string;
}

export interface ProductInput {
  id: number;
  titleOriginal?: string;
  descriptionOriginal?: string;
  priceOriginal?: number | string | null;
  currencyOriginal?: string;
  attributesOriginal?: Record<string, unknown> | null;
}

// 单个字段变更，用于审计与任务步骤展示。stage 对应处理阶段；actorType 区分 AI 建议与系统计算。
export interface FieldChange {
  stage: string;
  field: string;
  oldValue: unknown;
  newValue: unknown;
  actorType: 'ai_employee' | 'system';
  actorId: string;
  reason: string;
}

export interface EngineResult {
  // 写入商品的字段补丁（仅建议字段 + 目标字段，绝不含 *Final）。
  patch: Record<string, unknown>;
  changes: FieldChange[];
  // 媒体任务占位规格（不做真实处理，仅建任务结构与状态）。
  mediaJobSpecs: Array<{ jobType: string }>;
}

// 处理阶段标识，与 PRD §5.3「阶段状态」对齐：参数替换 / 文案改写本地化 / 价格转换 / 媒体任务 / 信息存档。
export const STAGES = {
  attrMapping: 'attr_mapping', // 参数替换 / 字段映射
  rewriteI18n: 'rewrite_i18n', // 文案改写 + 翻译本地化（AI 结构化输出）
  priceConvert: 'price_convert', // 价格转换
  mediaPlan: 'media_plan', // 媒体任务占位
  archive: 'archive', // 信息存档
} as const;

// 去掉批发噪声词并做基础清洗，得到可读标题（确定性 mock，真实实现替换为 AI 改写/翻译）。
function cleanTitle(raw: string): string {
  return raw
    .replace(/\b(wholesale|oem|moq\s*\d+\s*pcs?)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s*-\s*$/, '')
    .trim();
}

// 字段映射：按 mappingRows 把来源属性 key 改名/补值，未命中的属性原样保留。
function applyAttributeMapping(attrs: Record<string, unknown>, rows: MappingRow[]): Record<string, unknown> {
  if (!rows?.length) return { ...attrs };
  const out: Record<string, unknown> = { ...attrs };
  for (const row of rows) {
    if (!row.source) continue;
    if (!(row.source in out)) {
      // 来源字段不存在但规则给了固定替换值时，补一条目标属性。
      if (row.target && row.replace) out[row.target] = row.replace;
      continue;
    }
    const value = row.replace || out[row.source];
    if (row.target && row.target !== row.source) {
      out[row.target] = value;
      delete out[row.source];
    } else {
      out[row.source] = value;
    }
  }
  return out;
}

// 价格转换：原币种 -> 目标币种（汇率）+ 加价 + 尾数策略。返回 undefined 表示原价缺失（由调用方按校验失败处理）。
function convertPrice(
  priceOriginal: number,
  cfg: NonNullable<RuleConfig['price']>,
): { price: number; listPrice: number } {
  const rate = cfg.rate ?? 1;
  const markup = (cfg.markupPct ?? 0) / 100;
  let price = priceOriginal * rate * (1 + markup);
  if (cfg.ending && /^\.\d+$/.test(cfg.ending)) {
    price = Math.floor(price) + Number(cfg.ending);
  } else {
    price = Math.round(price * 100) / 100;
  }
  const listPrice = Math.round(price * 1.2 * 100) / 100;
  return { price, listPrice };
}

export class ProcessingValidationError extends Error {
  code: string;
  field?: string;
  retryable: boolean;
  constructor(code: string, message: string, field?: string, retryable = true) {
    super(message);
    this.name = 'ProcessingValidationError';
    this.code = code;
    this.field = field;
    this.retryable = retryable;
  }
}

// 把规则应用到一条商品，产出建议字段补丁 + 变更明细 + 媒体任务规格。
// 抛出 ProcessingValidationError 表示该商品处理失败（带错误码/字段/可重试），由调用方落任务步骤与 process_failed。
export function applyRule(
  product: ProductInput,
  config: RuleConfig,
  mappingRows: MappingRow[],
  ruleName: string,
): EngineResult {
  const changes: FieldChange[] = [];
  const patch: Record<string, unknown> = {};

  // 阶段 1：参数替换 / 字段映射（信息整理员 dex）。
  const srcAttrs = (
    product.attributesOriginal && typeof product.attributesOriginal === 'object' ? product.attributesOriginal : {}
  ) as Record<string, unknown>;
  const mappedAttrs = applyAttributeMapping(srcAttrs, mappingRows);
  patch.attributesProcessed = mappedAttrs;
  changes.push({
    stage: STAGES.attrMapping,
    field: 'attributesProcessed',
    oldValue: srcAttrs,
    newValue: mappedAttrs,
    actorType: 'ai_employee',
    actorId: 'dex',
    reason: `按规则「${ruleName}」做字段映射/参数替换`,
  });

  // 阶段 2：文案改写 + 翻译本地化（翻译助理 lexi）。校验：标题缺失则失败。
  const titleRaw = (product.titleOriginal || '').trim();
  if (!titleRaw) {
    throw new ProcessingValidationError(
      'VALIDATION_REQUIRED_FIELD_MISSING',
      '商品缺少原始标题，无法生成处理标题',
      'titleOriginal',
      true,
    );
  }
  const titleProcessed = cleanTitle(titleRaw);
  patch.titleProcessed = titleProcessed;
  changes.push({
    stage: STAGES.rewriteI18n,
    field: 'titleProcessed',
    oldValue: titleRaw,
    newValue: titleProcessed,
    actorType: 'ai_employee',
    actorId: 'lexi',
    reason: config.translate?.enabled ? `改写并本地化为 ${config.translate?.targetLang || 'en'}` : '清洗并改写标题',
  });

  const descRaw = (product.descriptionOriginal || '').trim();
  const descProcessed = descRaw
    ? `${titleProcessed}. ${descRaw}`.slice(0, 2000)
    : `${titleProcessed}. High quality, fast shipping.`;
  patch.descriptionProcessed = descProcessed;
  changes.push({
    stage: STAGES.rewriteI18n,
    field: 'descriptionProcessed',
    oldValue: descRaw || null,
    newValue: descProcessed,
    actorType: 'ai_employee',
    actorId: 'lexi',
    reason: '生成本地化描述建议',
  });

  // 阶段 3：价格转换（系统确定性计算，写目标字段，不是最终字段）。
  if (config.price) {
    const priceOriginal = Number(product.priceOriginal);
    if (!product.priceOriginal || Number.isNaN(priceOriginal)) {
      throw new ProcessingValidationError(
        'VALIDATION_REQUIRED_FIELD_MISSING',
        '商品缺少原价，无法做价格转换',
        'priceOriginal',
        true,
      );
    }
    const { price, listPrice } = convertPrice(priceOriginal, config.price);
    patch.priceTarget = price;
    patch.listPriceTarget = listPrice;
    if (config.targetPlatform) patch.targetPlatform = config.targetPlatform;
    changes.push({
      stage: STAGES.priceConvert,
      field: 'priceTarget',
      oldValue: priceOriginal,
      newValue: price,
      actorType: 'system',
      actorId: 'rule-engine',
      reason: `汇率 ${config.price.rate} + 加价 ${config.price.markupPct ?? 0}%（${config.price.fromCurrency}→${
        config.price.toCurrency
      }）`,
    });
    changes.push({
      stage: STAGES.priceConvert,
      field: 'listPriceTarget',
      oldValue: null,
      newValue: listPrice,
      actorType: 'system',
      actorId: 'rule-engine',
      reason: '按目标价 1.2 倍生成划线价',
    });
  }

  // 阶段 4：媒体任务占位（仅建结构与状态，不做真实去水印/白底图）。
  const mediaJobSpecs = (config.media?.jobs || []).map((jobType) => ({ jobType }));

  return { patch, changes, mediaJobSpecs };
}
