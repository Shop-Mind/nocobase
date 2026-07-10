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

import { scanBannedWords } from '../assistant/knowledge';
import { stripEmbeddedFaqSection } from '../shared/text-clean';

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
  // SKU 原价（有则逐条按同一价格规则计算 skuPatches 的目标价，让草稿引擎能走「SKU 规格价」而非单档阶梯价）。
  skus?: Array<{ id: number; priceOriginal?: number | string | null; priceTarget?: number | string | null }>;
  // 源站采购阶梯（抓取时随 SKU 落库）：≥2 档时按同一价格规则逐档生成发布阶梯 ladderTarget（档数跟随源站）。
  ladderOriginal?: Array<{ minQuantity?: number | string; price?: number | string; currency?: string }> | null;
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
  // 逐 SKU 的目标价补丁（与商品价同一规则换算）；空数组表示无 SKU 或 SKU 无原价。
  skuPatches: Array<{ id: number; priceTarget: number }>;
}

// 处理阶段标识，与 PRD §5.3「阶段状态」对齐：参数替换 / 文案改写本地化 / 价格转换 / 媒体任务 / 信息存档。
export const STAGES = {
  attrMapping: 'attr_mapping', // 参数替换 / 字段映射
  rewriteI18n: 'rewrite_i18n', // 文案改写 + 翻译本地化（AI 结构化输出）
  priceConvert: 'price_convert', // 价格转换
  mediaPlan: 'media_plan', // 媒体任务占位
  archive: 'archive', // 信息存档
} as const;

// 标题清洗（确定性规则，真实 AI 改写在预览编辑的建议按钮里）：
// ① 去批发噪声词（wholesale/oem/moq/free shipping/hot sale 等对买家搜索无意义、且部分平台判违规的词）；
// ② 去 emoji 与装饰符号（平台标题禁用）；③ 英文重复词去堆砌（连续/间隔重复只保留首次，大小写不敏感）；
// ④ 空白归一；⑤ 超长截断（Alibaba.com 上限 128 字符，按词边界截）。
const TITLE_NOISE =
  /\b(wholesale|oem|odm|moq\s*\d+\s*(pcs?|pieces?)?|free\s+shipping|hot\s+sale|hot\s+selling|best\s+quality|factory\s+price|cheap(est)?|promotion)\b/gi;
// emoji / 符号区（BMP 外的补充符号 + 常见装饰符）；变体选择符 U+FE0F 是组合字符，需在字符类外单独匹配。
const TITLE_EMOJI = /[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{2B50}\u{2B55}★☆✔✅❤♥•◆■]|\uFE0F/gu;
const TITLE_MAX_CHARS = 128;

export function cleanTitle(raw: string): string {
  let s = raw
    .replace(TITLE_NOISE, '')
    .replace(TITLE_EMOJI, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s*-\s*$/, '')
    .trim();
  // 英文去堆砌：同一单词（≥3 字符）重复出现只保留第一次；中文不做词级去重（无空格分词不可靠）。
  const seen = new Set<string>();
  s = s
    .split(' ')
    .filter((w) => {
      const key = w.toLowerCase();
      if (!/^[a-z][a-z0-9-]{2,}$/i.test(w)) return true;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join(' ');
  if (s.length > TITLE_MAX_CHARS) {
    const cut = s.slice(0, TITLE_MAX_CHARS);
    const lastSpace = cut.lastIndexOf(' ');
    s = (lastSpace > TITLE_MAX_CHARS * 0.6 ? cut.slice(0, lastSpace) : cut).trim();
  }
  return s;
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

// 价格转换：原币种 -> 目标币种（汇率）+ 加价 + 尾数策略。
// 专业保护：① 币种不匹配（商品原币种 ≠ 规则 fromCurrency）时跳过汇率只做加价，避免把 USD 价再按 THB 汇率折一次；
// ② 尾数策略只对 ≥2 的价格生效——低价商品套 .99 尾数会把 0.66 抬成 0.99（+50% 隐性涨价），B2B 小额单价按两位小数走。
function convertPrice(
  priceOriginal: number,
  cfg: NonNullable<RuleConfig['price']>,
  productCurrency?: string,
): { price: number; listPrice: number; rateApplied: boolean } {
  const currencyMismatch = Boolean(
    cfg.fromCurrency && productCurrency && cfg.fromCurrency.toUpperCase() !== productCurrency.toUpperCase(),
  );
  const rate = currencyMismatch ? 1 : cfg.rate ?? 1;
  const markup = (cfg.markupPct ?? 0) / 100;
  let price = priceOriginal * rate * (1 + markup);
  if (cfg.ending && /^\.\d+$/.test(cfg.ending) && price >= 2) {
    price = Math.floor(price) + Number(cfg.ending);
  } else {
    price = Math.round(price * 100) / 100;
  }
  const listPrice = Math.round(price * 1.2 * 100) / 100;
  return { price, listPrice, rateApplied: !currencyMismatch };
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

  // 源站整页文本常在尾部嵌着卖家 FAQ 问答段——属公司层信息（companyFaqDesc 专字段承载），先剥掉再截断。
  const descRaw = stripEmbeddedFaqSection((product.descriptionOriginal || '').trim());
  const descProcessed = descRaw ? descRaw.slice(0, 2000) : `${titleProcessed}. High quality, fast shipping.`;
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

  // 违禁/风险词扫描：命中的词不做自动删除（中文风险词按包含匹配，盲删会伤正常词——如「最新」里的「最」），
  // 而是写入 riskFlags 让预览编辑页醒目提示，由人工/AI 建议改写。
  const riskHits = [
    ...scanBannedWords(titleProcessed).map((h) => ({ ...h, field: 'title' })),
    ...scanBannedWords(descProcessed).map((h) => ({ ...h, field: 'description' })),
  ];
  if (riskHits.length) {
    patch.riskFlags = riskHits;
    changes.push({
      stage: STAGES.rewriteI18n,
      field: 'riskFlags',
      oldValue: null,
      newValue: riskHits,
      actorType: 'system',
      actorId: 'rule-engine',
      reason: `违禁/风险词扫描命中 ${riskHits.length} 处（${[...new Set(riskHits.map((h) => h.word))].join(
        '、',
      )}），请在预览编辑中改写`,
    });
  } else {
    patch.riskFlags = [];
  }

  // 阶段 3：价格转换（系统确定性计算，写目标字段，不是最终字段）。
  const skuPatches: Array<{ id: number; priceTarget: number }> = [];
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
    const { price, listPrice, rateApplied } = convertPrice(priceOriginal, config.price, product.currencyOriginal);
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
      reason: rateApplied
        ? `汇率 ${config.price.rate} + 加价 ${config.price.markupPct ?? 0}%（${config.price.fromCurrency}→${
            config.price.toCurrency
          }）`
        : `商品原币种 ${product.currencyOriginal} 与规则 ${config.price.fromCurrency} 不一致，跳过汇率仅加价 ${
            config.price.markupPct ?? 0
          }%（防止二次换汇）`,
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

    // 发布阶梯价：源站有 ≥2 档采购阶梯时，按同一规则逐档换算生成 ladderTarget（档数跟随源站，预览编辑可增删改）。
    // 源站固定价（无阶梯/单档）不生成——草稿保持固定价形态，人工可在预览编辑手动加档转为阶梯。
    const priceCfg = config.price;
    const srcLadder = (product.ladderOriginal || [])
      .map((t) => ({ minQuantity: Math.round(Number(t.minQuantity)), price: Number(t.price), currency: t.currency }))
      .filter((t) => Number.isInteger(t.minQuantity) && t.minQuantity > 0 && Number.isFinite(t.price) && t.price > 0)
      .sort((a, b) => a.minQuantity - b.minQuantity);
    if (srcLadder.length >= 2) {
      // 逐档换算后必须严格递减(平台 CHK_STEP_PRICE 校验,相等档也被拒):.99 尾数策略会把相邻成本档抹平
      // (6.3/6.0 都变 6.99)。撞档的档位退回精确两位小数换算保住档数;仍不低于前一档时压到前一档 -0.01。
      const ladderTarget: Array<{ minQuantity: number; price: number }> = [];
      for (const t of srcLadder) {
        const cur = t.currency || product.currencyOriginal;
        let price = convertPrice(t.price, priceCfg, cur).price;
        const prev = ladderTarget[ladderTarget.length - 1]?.price;
        if (prev != null && price >= prev) {
          price = convertPrice(t.price, { ...priceCfg, ending: '' }, cur).price;
        }
        if (prev != null && price >= prev) price = Math.round((prev - 0.01) * 100) / 100;
        if (price <= 0) continue;
        ladderTarget.push({ minQuantity: t.minQuantity, price });
      }
      patch.ladderTarget = ladderTarget;
      changes.push({
        stage: STAGES.priceConvert,
        field: 'ladderTarget',
        oldValue: srcLadder.map((t) => `≥${t.minQuantity}:${t.price}`).join(' / '),
        newValue: ladderTarget.map((t) => `≥${t.minQuantity}:${t.price}`).join(' / '),
        actorType: 'system',
        actorId: 'rule-engine',
        reason: `源站 ${srcLadder.length} 档采购阶梯按同一价格规则逐档生成发布阶梯（草稿将按阶梯价写入）`,
      });
    }

    // SKU 逐条定价：有原价的 SKU 按同一规则换算目标价。SKU 全有售价后，发布草稿可走「SKU 规格价」
    // 而不是退化成单档阶梯价（此前 SKU 无目标价是草稿只有一档价的根因）。
    for (const sku of product.skus || []) {
      const skuPrice = Number(sku.priceOriginal);
      if (!sku.priceOriginal || Number.isNaN(skuPrice) || skuPrice <= 0) continue;
      const converted = convertPrice(skuPrice, config.price, product.currencyOriginal);
      skuPatches.push({ id: sku.id, priceTarget: converted.price });
    }
    if (skuPatches.length) {
      changes.push({
        stage: STAGES.priceConvert,
        field: 'skus.priceTarget',
        oldValue: null,
        newValue: { count: skuPatches.length },
        actorType: 'system',
        actorId: 'rule-engine',
        reason: `按同一价格规则为 ${skuPatches.length} 个 SKU 生成目标价（发布时可走 SKU 规格价）`,
      });
    }
  }

  // 阶段 4：媒体任务占位（仅建结构与状态，不做真实去水印/白底图）。
  const mediaJobSpecs = (config.media?.jobs || []).map((jobType) => ({ jobType }));

  return { patch, changes, mediaJobSpecs, skuPatches };
}
