/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// 草稿发布（schema 流程，主引擎）：/alibaba/icbu/product/schema/get 拿类目规则 XML →
// buildDraftXml 按官方接入文档（developer.alibaba.com 119213）的示例格式填值 →
// /icbu/product/schema/add/draft 创建草稿（不上架、不触发平台审核；人工在编辑页提交时才审核）。
//
// ⚠️ 值 XML 格式以官方示例为准（曾用 <fields> 包装导致字段被平台静默丢弃，只有顶层 input 落库）：
//   complex      → <complex-value>…</complex-value>（不是 <fields>！）
//   multiComplex → <complex-values><complex-value>…</complex-value>…</complex-values>
//   singleCheck  → <value>optionId</value>；自定义 <value inputValue="自定义名">-1</value>（负数）
//   multiCheck   → <values><value …>…</value></values>；自定义色可带色卡 <value img="…" inputValue="灰色">-1</value>
//   主图 scImages_n → <value fileId="图片银行ID">图片银行URL</value>（必须来自 photobank.upload）
//   商详         → productDescType=2（普通编辑）+ superText（富文本 HTML，可嵌图片银行图；
//                  官方明确「api 只支持普通编辑类型的商品详情」，结构化商详无 API，编辑页「一键回填」转换）
//
// 类目相关字段（p-* 属性）每个类目不同：必填项从规则 XML 解析，能按值匹配的匹配，
// 匹配不上的取第一个选项并记入 notes——草稿本来就要人工审核，宁可留给人改也不能发不出去。

import type { PublishPayload } from '../../publish/adapters';
import { stripThumbSuffix } from './publish-mappers';

// 常见中文材质/风格值 → 平台选项英文关键词（用于把抓取的中文属性值匹配到类目选项）。
const CN_VALUE_HINTS: Record<string, string[]> = {
  超细纤维: ['microfiber'],
  麂皮: ['suede'],
  绒面: ['suede'],
  涤纶: ['polyester'],
  尼龙: ['nylon'],
  棉: ['cotton'],
  帆布: ['canvas'],
  皮革: ['leather'],
  真皮: ['genuine leather'],
  绒布: ['velvet'],
  丝绸: ['silk'],
  无纺布: ['non-woven'],
  麻: ['linen', 'jute'],
};

// CNY→USD 估算汇率：schema 价格字段是 USD；草稿由人工审核，后台可修正。
const CNY_PER_USD = 7.2;

export interface SchemaField {
  id: string;
  name?: string;
  type: string;
  required: boolean;
  customInput: boolean;
  options: Array<{ name: string; value: string }>;
  pos: number;
}

// 平铺解析规则 XML：按 <field id=…> 切块，块内（到下一个 field 前）的 rules/options 属于该字段。
export function parseSchemaFields(schemaXml: string): SchemaField[] {
  const out: SchemaField[] = [];
  const re = /<field id="([^"]+)"(?: name="([^"]*)")? type="([^"]+)"/g;
  const matches = [...schemaXml.matchAll(re)];
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const start = m.index ?? 0;
    const end = i + 1 < matches.length ? matches[i + 1].index ?? schemaXml.length : schemaXml.length;
    const chunk = schemaXml.slice(start, end);
    out.push({
      id: m[1],
      name: m[2] || undefined,
      type: m[3],
      required: /name="requiredRule" value="true"/.test(chunk),
      customInput: /valueAttributeRule" value="inputValue"/.test(chunk),
      options: [...chunk.matchAll(/<option displayName="([^"]*)" value="([^"]*)"/g)].map((o) => ({
        name: o[1],
        value: o[2],
      })),
      pos: start,
    });
  }
  return out;
}

// 取 parentId 与 nextTopId 之间的字段（icbuCatProp / saleProp 的子属性按位置归属）。
export function fieldsBetween(fields: SchemaField[], parentId: string, nextTopId: string): SchemaField[] {
  const from = fields.find((f) => f.id === parentId);
  const to = fields.find((f) => f.id === nextTopId);
  if (!from) return [];
  return fields.filter((f) => f.pos > from.pos && (!to || f.pos < to.pos));
}

function escXml(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// 从抓取属性值/标题里为类目选项字段挑一个匹配项；匹配不上取第一个选项。
function pickOption(field: SchemaField, candidates: string[], notes: string[]): string | undefined {
  if (!field.options.length) return undefined;
  const lowerOptions = field.options.map((o) => ({ ...o, lower: o.name.toLowerCase() }));
  for (const cand of candidates) {
    const text = String(cand);
    // 英文候选直接子串匹配
    const direct = lowerOptions.find((o) => o.lower && text.toLowerCase().includes(o.lower));
    if (direct) return direct.value;
    // 中文候选经关键词提示匹配
    for (const [cn, hints] of Object.entries(CN_VALUE_HINTS)) {
      if (!text.includes(cn)) continue;
      const hit = lowerOptions.find((o) => hints.some((h) => o.lower.includes(h)));
      if (hit) return hit.value;
    }
  }
  notes.push(
    `类目属性「${field.name || field.id}」未能从商品数据匹配选项，暂取「${field.options[0].name}」，请人工核对`,
  );
  return field.options[0].value;
}

export interface DraftXmlResult {
  xml: string;
  notes: string[];
}

// 图片银行图（photobank.upload 返回）：发布用 URL + fileId。
export interface PhotobankImage {
  url: string;
  fileId?: string;
}

export interface DraftMedia {
  mainImages: PhotobankImage[];
  detailImages?: string[];
}

// PublishPayload + 类目规则 XML + 图片银行媒体 → schema.add.draft 的值 XML（官方示例格式）。
export function buildDraftXml(payload: PublishPayload, schemaXml: string, media?: DraftMedia): DraftXmlResult {
  const notes: string[] = [];
  const fields = parseSchemaFields(schemaXml);
  const byId = new Map(fields.map((f) => [f.id, f] as const));
  const attrValues = Object.values(payload.attributes || {}).map((v) => String(v ?? ''));
  const candidates = [...attrValues, payload.title || ''];

  const parts: string[] = [];

  // 标题
  parts.push(`<field id="productTitle" type="input"><value>${escXml(payload.title || '')}</value></field>`);

  // 关键词（productKeywords，最多 3 个）：优先用 payload.keywords（空格分词），否则取标题前 30 字。
  if (byId.get('productKeywords')) {
    const kws = (payload.keywords ? payload.keywords.split(/[,，;；]/) : [String(payload.title || '').slice(0, 30)])
      .map((k) => k.trim())
      .filter(Boolean)
      .slice(0, 3);
    if (kws.length) {
      const inner = kws
        .map((k, i) => `<field id="productKeywords_${i}" type="input"><value>${escXml(k)}</value></field>`)
        .join('');
      parts.push(`<field id="productKeywords" type="complex"><complex-value>${inner}</complex-value></field>`);
    }
  }

  // 类目属性（icbuCatProp 下的必填项）：能匹配就匹配，否则取第一项并记 notes。
  const catProps = fieldsBetween(fields, 'icbuCatProp', 'saleProp').filter(
    (f) => f.required && f.id.startsWith('p-') && (f.type === 'singleCheck' || f.type === 'multiCheck'),
  );
  if (catProps.length) {
    const inner = catProps
      .map((f) => {
        const v = pickOption(f, candidates, notes);
        if (!v) return '';
        return f.type === 'singleCheck'
          ? `<field id="${f.id}" type="singleCheck"><value>${v}</value></field>`
          : `<field id="${f.id}" type="multiCheck"><values><value>${v}</value></values></field>`;
      })
      .join('');
    parts.push(`<field id="icbuCatProp" type="complex"><complex-value>${inner}</complex-value></field>`);
  }

  // 销售属性（saleProp 下必填、支持自定义输入的 multiCheck，如 color）：
  // 取 SKU 第一个规格维度的去重值作为自定义值（负数编号），并带色卡图（img 属性，官方示例支持）。
  const saleProps = fieldsBetween(fields, 'saleProp', 'sku').filter(
    (f) => f.required && f.id.startsWith('p-') && f.customInput,
  );
  if (saleProps.length) {
    const seen = new Map<string, string | undefined>();
    for (const v of payload.variants || []) {
      const a = v.attrs?.[0];
      if (a?.value && !seen.has(a.value)) seen.set(a.value, v.imageUrl ? stripThumbSuffix(v.imageUrl) : undefined);
    }
    const firstDim = [...seen.entries()].slice(0, 40);
    if (firstDim.length) {
      const target = saleProps[0];
      const values = firstDim
        .map(
          ([name, img], i) =>
            `<value${img ? ` img="${escXml(img)}"` : ''} inputValue="${escXml(name)}">-${i + 1}</value>`,
        )
        .join('');
      parts.push(
        `<field id="saleProp" type="complex"><complex-value>` +
          `<field id="${target.id}" type="multiCheck"><values>${values}</values></field>` +
          `</complex-value></field>`,
      );
      if (saleProps.length > 1) {
        notes.push(`类目有多个必填销售属性，仅填充「${target.name || target.id}」，其余请人工在后台补充`);
      }
      const dims = new Set((payload.variants || []).flatMap((v) => (v.attrs || []).map((a) => a.name)));
      if (dims.size > 1) {
        notes.push('草稿仅带入第一个规格维度作为销售属性，逐 SKU 价格/库存在编辑页按规格自动生成后调整');
      }
    } else {
      notes.push('商品无结构化规格值，必填销售属性留空，请人工在后台补充');
    }
  }

  // 主图（≤6）：必须来自图片银行，value 带 fileId 属性（官方示例格式）。
  const mainImages = (media?.mainImages || []).slice(0, 6);
  if (mainImages.length) {
    const inner = mainImages
      .map(
        (img, i) =>
          `<field id="scImages_${i}" type="input"><value${img.fileId ? ` fileId="${escXml(img.fileId)}"` : ''}>${escXml(
            img.url,
          )}</value></field>`,
      )
      .join('');
    parts.push(`<field id="scImages" type="complex"><complex-value>${inner}</complex-value></field>`);
  }

  // 售卖与价格：按件（normal）+ 数量阶梯价（scPrice=1）。价格字段为 USD，非 USD 按估算汇率折算。
  const rawPrice = payload.price != null && payload.price > 0 ? payload.price : undefined;
  let usdPrice = rawPrice;
  if (rawPrice != null && payload.currency && payload.currency !== 'USD') {
    usdPrice = Math.round((rawPrice / CNY_PER_USD) * 100) / 100;
    notes.push(
      `价格字段为 USD：已按 1 USD≈${CNY_PER_USD} ${payload.currency} 估算折算（${rawPrice} → ${usdPrice}），请人工核对`,
    );
  }
  const moq = payload.moq != null && payload.moq > 0 ? Math.round(payload.moq) : 1;
  parts.push(`<field id="saleType" type="singleCheck"><value>normal</value></field>`);
  parts.push(`<field id="scPrice" type="singleCheck"><value>1</value></field>`);

  // 售卖单位：按单位名匹配选项（Bag → Bag/Bags），匹配不上取 Piece 或第一项。
  const priceUnit = byId.get('priceUnit');
  if (priceUnit?.options.length) {
    const unitName = (payload.unit || 'Piece').toLowerCase();
    const hit =
      priceUnit.options.find((o) => o.name.toLowerCase().startsWith(unitName)) ||
      priceUnit.options.find((o) => o.name.toLowerCase().startsWith('piece')) ||
      priceUnit.options[0];
    parts.push(`<field id="priceUnit" type="singleCheck"><value>${hit.value}</value></field>`);
  }

  parts.push(`<field id="minOrderQuantity" type="input"><value>${moq}</value></field>`);
  if (usdPrice != null) {
    parts.push(
      `<field id="ladderPrice" type="complex"><complex-value>` +
        `<field id="ladderPrice_0" type="complex"><complex-value>` +
        `<field id="quantity" type="input"><value>${moq}</value></field>` +
        `<field id="price" type="input"><value>${usdPrice.toFixed(2)}</value></field>` +
        `</complex-value></field>` +
        `</complex-value></field>`,
    );
  }

  // 物流：无运费模板时用「买卖双方协商物流」；有模板 ID 则用商家模板。
  if (payload.shippingTemplateId) {
    parts.push(
      `<field id="shippingTemplate" type="complex"><complex-value>` +
        `<field id="templateType" type="singleCheck"><value>aliLogistics</value></field>` +
        `<field id="shippingTemplateId" type="singleCheck"><value>${escXml(
          payload.shippingTemplateId,
        )}</value></field>` +
        `</complex-value></field>`,
    );
  } else {
    parts.push(
      `<field id="shippingTemplate" type="complex"><complex-value>` +
        `<field id="templateType" type="singleCheck"><value>freightNegotiation</value></field>` +
        `</complex-value></field>`,
    );
  }

  // 自定义属性（≤10 组，平台限制；值 ≤70 字符）
  const customAttrs = Object.entries(payload.attributes || {})
    .map(([k, v]) => [k, String(v ?? '').trim()] as const)
    .filter(([k, v]) => k.trim() && v && v.length <= 70 && k.length <= 40)
    .slice(0, 10);
  if (customAttrs.length) {
    const inner = customAttrs
      .map(
        ([k, v], i) =>
          `<field id="customMoreProperty_${i}" type="complex"><complex-value>` +
          `<field id="propName" type="input"><value>${escXml(k)}</value></field>` +
          `<field id="valueName" type="input"><value>${escXml(v)}</value></field>` +
          `</complex-value></field>`,
      )
      .join('');
    parts.push(`<field id="customMoreProperty" type="complex"><complex-value>${inner}</complex-value></field>`);
  }

  // ⚠️ 商品详情不随草稿写入：真机 5 组对照实验（superText 中/英/转义/CDATA/纯文本 + 智能编辑
  // detailImage 模块）均不落库，浏览器编辑页确认为空——平台对「草稿商详」无 API 写入口子
  // （官方 superText 文档面向 schema.add 正式发布）。详情图已备于图片银行，编辑页组装。
  if (media?.detailImages?.length || payload.description) {
    notes.push(
      '商品详情无法随草稿 API 写入（平台限制）：详情图已备在图片银行，请在编辑页「详情图片 → 从图片银行选取」组装，卖点/描述可用编辑页 AI 一键生成',
    );
  }

  return { xml: `<itemSchema>${parts.join('')}</itemSchema>`, notes };
}
