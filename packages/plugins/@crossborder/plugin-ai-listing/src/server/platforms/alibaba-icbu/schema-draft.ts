/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// 草稿发布（schema 流程，主引擎）：/alibaba/icbu/product/schema/get 拿类目规则 XML →
// buildDraftXml 按官方《【交易/商机】商品发布接入文档》（alibabawork.yuque.com ohmqh3/hwnrm9w9felq7ibv）填值 →
// /icbu/product/schema/add/draft 创建草稿（不上架、不触发平台审核；人工在编辑页提交时才审核）。
//
// ⚠️ 值 XML 格式以官方接入文档为准（两次真机踩坑：<fields> 包装、multiComplex 用 complex-value 包装，都会被平台静默丢弃）：
//   complex      → <complex-value>…</complex-value>（不是 <fields>！）
//   multiComplex → 每个实例一个 <complex-values>…</complex-values>，字段直挂其中（不是 <complex-values><complex-value>！）
//   singleCheck  → <value>optionId</value>；自定义 <value inputValue="自定义名">-1</value>（负数）
//   multiCheck   → <values><value …>…</value></values>；自定义色可带色卡 <value img="…" inputValue="灰色">-1</value>
//   主图 scImages_n → <value fileId="图片银行ID">图片银行URL</value>（必须来自 photobank.upload）
//   关键词       → 只有一组 productKeywords_0（≤384 字节），多个词用换行分隔，禁 [;:,，]（官方 demo 格式）
//   商详（结构化）→ 顶层结构化详描字段 detailImage（产品图片，按图集分组）+ textDesc（卖点）等，
//                  用官方 multiComplex 格式真机验证草稿可落库；不设 productDescType/superText（那是普通编辑的字段）
//   主图视频     → imageVideo=视频银行 video_id（singleCheck 直填）
//
// 类目相关字段（p-* 属性）每个类目不同：必填项从规则 XML 解析，能按值匹配的匹配，
// 匹配不上的取第一个选项并记入 notes——草稿本来就要人工审核，宁可留给人改也不能发不出去。
// 文本值发布前按 schema rule 做本地预检/清洗（长度按 byte/character、非法字符正则），违规自动修正并记 notes。

import type { PublishPayload } from '../../publish/adapters';
import { stripThumbSuffix } from './publish-mappers';
import { stripEmbeddedFaqSection } from '../../shared/text-clean';

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

// —— 校验层：按 schema rule 做本地预检/清洗（官方 2.3 字段规则）——

export interface FieldRules {
  required: boolean;
  // maxLengthRule：unit=byte 按 UTF-8 字节数截断，unit=character 按字符数截断。
  maxLength?: { value: number; unit: 'byte' | 'character' };
  // regexRule exProperty="not include"：命中即非法，本地直接剔除命中片段。
  notInclude: string[];
}

// 从规则 XML 提取指定字段的本地可执行规则（长度/非法字符/必填）。
export function parseFieldRules(schemaXml: string, fieldId: string): FieldRules {
  const rules: FieldRules = { required: false, notInclude: [] };
  const m = schemaXml.match(new RegExp(`<field id="${fieldId}"[^>]*>`));
  if (!m || m.index === undefined) return rules;
  const next = schemaXml.slice(m.index + m[0].length).search(/<field id="/);
  const chunk = schemaXml.slice(m.index, next >= 0 ? m.index + m[0].length + next : undefined);
  rules.required = /name="requiredRule" value="true"/.test(chunk);
  const len = chunk.match(/name="maxLengthRule" value="(\d+)"[^/]*?unit="(byte|character)"/);
  if (len) rules.maxLength = { value: Number(len[1]), unit: len[2] as 'byte' | 'character' };
  for (const r of chunk.matchAll(/name="regexRule" value="([^"]+)" exProperty="not include"/g)) {
    rules.notInclude.push(r[1]);
  }
  return rules;
}

// 按 byte 截断 UTF-8 字符串（不切断多字节字符）。
function truncateBytes(s: string, maxBytes: number): string {
  if (Buffer.byteLength(s, 'utf8') <= maxBytes) return s;
  let out = '';
  let used = 0;
  for (const ch of s) {
    const b = Buffer.byteLength(ch, 'utf8');
    if (used + b > maxBytes) break;
    out += ch;
    used += b;
  }
  return out;
}

// 文本预检清洗：剔除 not-include 正则命中的片段（HTML 实体形式的规则先反转义）、按规则截断长度。
// 修正过的内容记入 notes，让运营在编辑页知道哪里被动过。
// ⚠️ en_US 类目的标题规则会把非 ASCII（即全部中文）判为非法——我们有意保留中文原文给编辑页一键翻译，
// 所以命中过半内容的字符集类规则只提示不清洗，避免把标题洗成空串（真机踩坑）。
export function sanitizeByRules(text: string, rules: FieldRules, label: string, notes: string[]): string {
  let out = String(text ?? '');
  for (const raw of rules.notInclude) {
    const source = raw
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"');
    try {
      const re = new RegExp(source, 'g');
      const cleaned = out
        .replace(re, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim();
      if (cleaned === out) continue;
      if (cleaned.length < out.length / 2) {
        notes.push(
          `${label}多数内容命中平台字符限制（多为中文等非拉丁字符）：草稿保留原文，提交上架前请在编辑页翻译/修正`,
        );
        continue;
      }
      notes.push(`${label}含平台非法字符（规则 ${source.slice(0, 40)}…），已自动剔除，请人工复核`);
      out = cleaned;
    } catch {
      // Java 风格正则 JS 编译失败时跳过该条（平台侧仍会校验，草稿允许人工兜底）
    }
  }
  if (rules.maxLength) {
    const { value, unit } = rules.maxLength;
    const over = unit === 'byte' ? Buffer.byteLength(out, 'utf8') > value : [...out].length > value;
    if (over) {
      out = unit === 'byte' ? truncateBytes(out, value) : [...out].slice(0, value).join('');
      notes.push(`${label}超平台长度上限（${value} ${unit === 'byte' ? '字节' : '字符'}），已自动截断`);
    }
  }
  return out;
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
  // 视频银行 video_id（video/upload → upload/result COMPLETE 后获得），填入 imageVideo 字段。
  videoId?: string;
}

// 源站详情页的「栏目导航文字」清单：抓取的 descriptionOriginal 是整页文本提取，页尾常拖着源站模板的
// 章节标题/导航链接（Company Profile / FAQ / Back To Home / Contact Us…）。这些词不是商品内容，
// 直灌进卖点(textDesc)会让买家看到一串无意义导航词（用户反馈的「FAQ 上传到商品卖点」即此）。
// 做法：从文本**尾部**逐个剥离命中的导航短语（只剥尾部，正文中间出现同名词不受影响）。
const SOURCE_NAV_PHRASES = [
  'contact us',
  'back to home',
  'faq',
  'faqs',
  'packing & delivery',
  'packing &amp; delivery',
  'packaging & shipping',
  'packaging & delivery',
  'company profile',
  'company information',
  'company introduction',
  'about us',
  'certifications',
  'certification',
  'production process',
  'applicable scene',
  'application scenario',
  'oem&odm service',
  'oem & odm service',
  'oem&odm',
  'why choose us',
  'our service',
  'our services',
  'our factory',
  'customer photos',
  'customer reviews',
  'related products',
  'recommend products',
  'product description',
  'exhibition',
  'hot products',
];

export function stripSourceNavTail(text: string): string {
  let s = text.trim();
  let changed = true;
  while (changed && s) {
    changed = false;
    const lower = s.toLowerCase();
    for (const phrase of SOURCE_NAV_PHRASES) {
      if (lower.endsWith(phrase)) {
        s = s.slice(0, s.length - phrase.length).replace(/[\s|·•\-–—:,;，；:]+$/g, '');
        changed = true;
        break;
      }
    }
  }
  return s;
}

// 发布阶梯价规整（payload.currency 币种）：按起订量升序、同档去重（留低价）、价格随数量不升（违规档剔除）、
// 平台上限 4 档（超出截断）。返回空数组表示未设置阶梯 → 沿用固定价/SKU 规格价逻辑。
function normalizeLadder(
  ladder: PublishPayload['ladder'],
  notes: string[],
): Array<{ quantity: number; price: number }> {
  const sorted = (ladder || [])
    .map((t) => ({ quantity: Math.round(Number(t.minQuantity)), price: Number(t.price) }))
    .filter((t) => Number.isInteger(t.quantity) && t.quantity > 0 && Number.isFinite(t.price) && t.price > 0)
    .sort((a, b) => a.quantity - b.quantity);
  const byQty = new Map<number, { quantity: number; price: number }>();
  for (const t of sorted) {
    const prev = byQty.get(t.quantity);
    if (!prev || t.price < prev.price) byQty.set(t.quantity, t);
  }
  const kept: Array<{ quantity: number; price: number }> = [];
  for (const t of [...byQty.values()].sort((a, b) => a.quantity - b.quantity)) {
    if (kept.length && t.price > kept[kept.length - 1].price) {
      notes.push(`阶梯价「≥${t.quantity}」档价格高于前一档，已剔除（平台要求价格随数量增加而不升）`);
      continue;
    }
    kept.push(t);
  }
  if (kept.length > 4) {
    notes.push(`阶梯价共 ${kept.length} 档，超出平台上限 4 档，仅带入前 4 档`);
    return kept.slice(0, 4);
  }
  return kept;
}

// PublishPayload + 类目规则 XML + 图片银行媒体 → schema.add.draft 的值 XML（官方示例格式）。
export function buildDraftXml(payload: PublishPayload, schemaXml: string, media?: DraftMedia): DraftXmlResult {
  const notes: string[] = [];
  const fields = parseSchemaFields(schemaXml);
  const byId = new Map(fields.map((f) => [f.id, f] as const));
  const attrValues = Object.values(payload.attributes || {}).map((v) => String(v ?? ''));
  const candidates = [...attrValues, payload.title || ''];

  const parts: string[] = [];

  // 标题：按类目 schema 的 productTitle 规则本地预检（≤128 字节、剔除邮箱/HTML 标签等非法字符）。
  const title = sanitizeByRules(payload.title || '', parseFieldRules(schemaXml, 'productTitle'), '标题', notes);
  parts.push(`<field id="productTitle" type="input"><value>${escXml(title)}</value></field>`);

  // 关键词：官方规则只有一组 productKeywords_0（≤384 字节），多个词以换行分隔；禁 [;:,，] 等分隔符。
  if (byId.get('productKeywords')) {
    const kws = (payload.keywords ? payload.keywords.split(/[,，;；\n]/) : [String(payload.title || '').slice(0, 30)])
      .map((k) => k.trim())
      .filter(Boolean);
    if (kws.length) {
      const joined = sanitizeByRules(kws.join('\n'), parseFieldRules(schemaXml, 'productKeywords_0'), '关键词', notes);
      parts.push(
        `<field id="productKeywords" type="complex"><complex-value>` +
          `<field id="productKeywords_0" type="input"><value>${escXml(joined)}</value></field>` +
          `</complex-value></field>`,
      );
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

  // 非 USD 价格统一按估算汇率折 USD（草稿人工审核可修正），折算说明只记一次。
  let conversionNoted = false;
  const toUsd = (n: number): number => {
    if (!payload.currency || payload.currency === 'USD') return Math.round(n * 100) / 100;
    const v = Math.round((n / CNY_PER_USD) * 100) / 100;
    if (!conversionNoted) {
      conversionNoted = true;
      notes.push(`价格字段为 USD：已按 1 USD≈${CNY_PER_USD} ${payload.currency} 估算折算，请人工核对`);
    }
    return v;
  };

  // 发布阶梯价：payload.ladder 非空（档数跟随源站生成、预览编辑可增删改）→ 走「按数量阶梯价」，
  // 与 SKU 规格价平台二选一——设了阶梯就以阶梯为准，清空阶梯才按 SKU 售价走规格价。
  const ladderTiers = normalizeLadder(payload.ladder, notes);

  // 销售属性 + SKU 矩阵（官方 3.5.8/3.5.9）：把商品规格维度映射到类目 saleProp 字段，
  // 匹配上的维度全部写入（值优先匹配类目选项，匹配不上且允许自定义时用全局唯一负数编号），
  // 变体按匹配维度组合合并（库存求和、售价取最低、编码取首个），逐 SKU 写入 sku multiComplex。
  const skuInfo = buildSaleAndSku(payload, fields, byId, toUsd, notes, ladderTiers.length > 0);
  if (skuInfo) parts.push(skuInfo.salePropXml, skuInfo.skuXml);

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

  // 售卖与价格：按件（normal）。价格模式（官方 3.5.1：1=阶梯价、3=SKU 规格价）：
  // 设了发布阶梯（ladderTiers）→ scPrice=1 多档阶梯；否则变体齐备逐 SKU 售价且类目支持 → scPrice=3；
  // 都不满足 → scPrice=1 单档（≥起订量 × 目标价，即固定价形态，与源站固定价对齐）。
  const rawPrice = payload.price != null && payload.price > 0 ? payload.price : undefined;
  const usdPrice = rawPrice != null ? toUsd(rawPrice) : undefined;
  const baseMoq = payload.moq != null && payload.moq > 0 ? Math.round(payload.moq) : 1;
  // 起订量必须与阶梯首档一致（官方要求），设了阶梯以首档为准。
  const moq = !skuInfo?.skuPricing && ladderTiers.length ? ladderTiers[0].quantity : baseMoq;
  if (moq !== baseMoq) notes.push(`起订量按阶梯首档调整为 ${moq}（原 ${baseMoq}）`);
  parts.push(`<field id="saleType" type="singleCheck"><value>normal</value></field>`);
  parts.push(`<field id="scPrice" type="singleCheck"><value>${skuInfo?.skuPricing ? '3' : '1'}</value></field>`);

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
  // 阶梯价写入：设了发布阶梯 → 逐档写入（档数跟随源站/人工编辑，≤4 档）；未设 → 单档固定价（≥moq × 目标价）。
  const priceTiers = !skuInfo?.skuPricing
    ? ladderTiers.length
      ? ladderTiers
      : usdPrice != null && rawPrice != null
        ? [{ quantity: moq, price: rawPrice }]
        : []
    : [];
  if (priceTiers.length) {
    const inner = priceTiers
      .map(
        (t, i) =>
          `<field id="ladderPrice_${i}" type="complex"><complex-value>` +
          `<field id="quantity" type="input"><value>${t.quantity}</value></field>` +
          `<field id="price" type="input"><value>${toUsd(t.price).toFixed(2)}</value></field>` +
          `</complex-value></field>`,
      )
      .join('');
    parts.push(`<field id="ladderPrice" type="complex"><complex-value>${inner}</complex-value></field>`);
    if (ladderTiers.length > 1) {
      notes.push(
        `阶梯价 ${priceTiers.length} 档随草稿写入：${priceTiers
          .map((t) => `≥${t.quantity}→$${toUsd(t.price).toFixed(2)}`)
          .join('、')}`,
      );
    }
  }

  // 校验（G1.1）：起订量不应大于库存（官方 3.5.4），违规只警告不拦截（草稿人工兜底）。
  if (payload.stock != null && payload.stock > 0 && moq > payload.stock) {
    notes.push(`起订量(${moq})大于库存(${payload.stock})，平台校验可能不通过，请在编辑页调整`);
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

  // 发货期（官方 3.6.1，必填组件）：区间语义「≤数量 → 天数」，平台约束最多 3 个区间、天数必须由小到大递增
  // （编辑页校验「发货期必须由小到大」；发货期作为订单约定进入信保流程，帮助中心知识 20142120）。
  // 多档阶梯价时取价格档位的最后 ≤3 个数量作上界、天数 7/15/30 递增预填；单档/无阶梯保持 ≤moq → 7 天。
  if (byId.get('ladderPeriod')) {
    const PERIOD_DAYS = [7, 15, 30];
    const bounds = priceTiers.length > 1 ? priceTiers.slice(-3).map((t) => t.quantity) : [moq];
    const inner = bounds
      .map(
        (q, i) =>
          `<field id="ladderPeriod_${i}" type="complex"><complex-value>` +
          `<field id="quantity" type="input"><value>${q}</value></field>` +
          `<field id="day" type="input"><value>${PERIOD_DAYS[i]}</value></field>` +
          `</complex-value></field>`,
      )
      .join('');
    parts.push(`<field id="ladderPeriod" type="complex"><complex-value>${inner}</complex-value></field>`);
    notes.push(
      bounds.length > 1
        ? `发货期按数量区间预填：${bounds
            .map((q, i) => `≤${q}→${PERIOD_DAYS[i]}天`)
            .join('、')}（发货期是信保履约承诺），请按实际产能在编辑页调整`
        : '发货期默认按起订量档 7 天填写，请按实际交期在编辑页调整',
    );
  }

  // 物流属性（官方 3.6.2，必填）：默认「普货」，类目选项匹配不上取第一项并提示。
  const logisticsProperty = byId.get('logisticsProperty');
  if (logisticsProperty?.options.length) {
    const hit =
      logisticsProperty.options.find((o) => o.value === 'general_cargo_0' || o.name.includes('普货')) ||
      logisticsProperty.options[0];
    parts.push(
      `<field id="logisticsProperty" type="multiCheck"><values><value>${escXml(hit.value)}</value></values></field>`,
    );
    if (hit.value !== 'general_cargo_0') notes.push(`物流属性默认「${hit.name}」，请人工确认`);
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

  // 结构化详描（官方 3.4.5~3.4.9）：detailImage=产品图片（图集分组）+ textDesc=卖点 + companyDesc/companyFaqDesc=公司介绍/FAQ。
  // 真机验证：用官方 multiComplex 格式（重复 <complex-values>，不设 productDescType/superText）草稿可落库。
  // 曾经的失败根因是 multiComplex 用了 <complex-values><complex-value> 包装（平台静默丢弃整个字段）。
  const detailField = byId.get('detailImage');
  const detailImages = (media?.detailImages || []).slice(0, 30);
  if (detailField && detailImages.length) {
    // 图集从类目 schema 的 gallery 选项里选：优先「细节图」(300)，否则第一个选项。
    const galleryField = fieldsBetween(fields, 'detailImage', 'textDesc').find((f) => f.id === 'gallery');
    const gallery = galleryField?.options.find((o) => o.value === '300') || galleryField?.options[0];
    if (gallery) {
      const imgs = detailImages
        .map(
          (u) =>
            `<complex-values><field id="imageURL" type="input"><value>${escXml(u)}</value></field></complex-values>`,
        )
        .join('');
      parts.push(
        `<field id="detailImage" type="multiComplex">` +
          `<complex-values>` +
          `<field id="images" type="multiComplex">${imgs}</field>` +
          `<field id="gallery" type="singleCheck"><value displayName="${escXml(gallery.name)}">${
            gallery.value
          }</value></field>` +
          `</complex-values>` +
          `</field>`,
      );
      notes.push(`${detailImages.length} 张详情图已随草稿写入结构化详描（图集：${gallery.name}）`);
    }
  }
  if (byId.get('textDesc') && payload.description) {
    // 卖点为纯文本（官方 ≤2000 字符）：剥富文本标签 → 剥内嵌 FAQ 问答段（先剥，FAQ 连着尾巴一起去）
    // → 剥源站页尾导航词 → 按 schema rule 清洗截断。存量商品的旧描述也在此兜底清理。
    const plain = stripSourceNavTail(
      stripEmbeddedFaqSection(
        String(payload.description)
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim(),
      ),
    ).slice(0, 2000);
    if (plain) {
      const text = sanitizeByRules(plain, parseFieldRules(schemaXml, 'textDesc'), '商品卖点', notes);
      parts.push(`<field id="textDesc" type="input"><value>${escXml(text)}</value></field>`);
    }
  }

  // 公司介绍 + FAQ（官方 3.4.6/3.4.7）：来自账号级配置（平台连接页维护，发布时随账号注入 payload）。
  const profile = payload.companyProfile;
  const companyDesc = String(profile?.companyDesc || '').trim();
  if (byId.get('companyDesc') && companyDesc) {
    const text = sanitizeByRules(
      companyDesc.slice(0, 2000),
      parseFieldRules(schemaXml, 'companyDesc'),
      '公司介绍',
      notes,
    );
    parts.push(`<field id="companyDesc" type="input"><value>${escXml(text)}</value></field>`);
    notes.push('公司介绍已随草稿写入结构化详描（companyDesc）');
  }
  const faqs = (profile?.faqs || [])
    .map((f) => ({
      q: String(f?.q || '')
        .trim()
        .slice(0, 150),
      a: String(f?.a || '')
        .trim()
        .slice(0, 500),
    }))
    .filter((f) => f.q && f.a)
    .slice(0, 8);
  if (byId.get('companyFaqDesc') && faqs.length) {
    const inner = faqs
      .map(
        (f) =>
          `<complex-values>` +
          `<field id="question" type="input"><value>${escXml(f.q)}</value></field>` +
          `<field id="answers" type="input"><value>${escXml(f.a)}</value></field>` +
          `</complex-values>`,
      )
      .join('');
    parts.push(`<field id="companyFaqDesc" type="multiComplex">${inner}</field>`);
    notes.push(`${faqs.length} 条 FAQ 已随草稿写入结构化详描（companyFaqDesc）`);
  }
  if ((media?.detailImages?.length || payload.description) && !companyDesc && !faqs.length) {
    notes.push('公司介绍/FAQ 未配置：到「平台连接」店铺卡片配置（可 AI 一键生成），之后发布会自动随草稿写入');
  }
  if (companyDesc || faqs.length) {
    notes.push('公司图片（companyImage）暂需在平台编辑页补充（需图片银行图集）');
  }

  // 主图视频：视频银行 video_id 直填 imageVideo（视频已在发布前上传视频银行）。
  if (media?.videoId && byId.get('imageVideo')) {
    parts.push(`<field id="imageVideo" type="singleCheck"><value>${escXml(media.videoId)}</value></field>`);
    notes.push('主图视频已随草稿写入（imageVideo）');
  }

  return { xml: `<itemSchema>${parts.join('')}</itemSchema>`, notes };
}

// —— 销售属性 + SKU 矩阵组装（官方 3.5.8 设置规格属性 / 3.5.9 设置SKU信息）——

// 常见中文规格维度名 → 类目销售属性字段英文名关键词。
const CN_DIM_HINTS: Record<string, string[]> = {
  颜色: ['color', 'colour'],
  色: ['color', 'colour'],
  尺寸: ['size'],
  尺码: ['size'],
  大小: ['size'],
  规格: ['size', 'spec'],
  材质: ['material'],
  长度: ['length'],
  容量: ['capacity'],
};

interface SaleSkuResult {
  salePropXml: string;
  skuXml: string;
  // true = 走「SKU 规格价」（scPrice=3 + 逐 SKU price），false = 走商品级阶梯价。
  skuPricing: boolean;
}

// 规格维度名 ↔ saleProp 字段名匹配：同名（不区分大小写）或经中文提示词映射。
function dimMatchesField(dimName: string, fieldName: string): boolean {
  const dim = dimName.trim().toLowerCase();
  const field = fieldName.trim().toLowerCase();
  if (!dim || !field) return false;
  if (dim === field || field.includes(dim) || dim.includes(field)) return true;
  for (const [cn, hints] of Object.entries(CN_DIM_HINTS)) {
    if (dimName.includes(cn) && hints.some((h) => field.includes(h))) return true;
  }
  return false;
}

function buildSaleAndSku(
  payload: PublishPayload,
  fields: SchemaField[],
  byId: Map<string, SchemaField>,
  toUsd: (n: number) => number,
  notes: string[],
  ladderMode = false,
): SaleSkuResult | null {
  const saleFields = fieldsBetween(fields, 'saleProp', 'sku').filter(
    (f) => f.id.startsWith('p-') && f.type === 'multiCheck',
  );
  if (!saleFields.length) return null;
  const variants = (payload.variants || []).filter((v) => v.attrs?.length);
  if (!variants.length) {
    if (saleFields.some((f) => f.required)) {
      notes.push('商品无结构化规格值，必填销售属性留空，请人工在后台补充');
    }
    return null;
  }

  // 规格维度（按首个变体的出现顺序）↔ 销售属性字段配对；配不上时兜底「首字段 ↔ 首维度」。
  const dims: string[] = [];
  for (const v of variants) for (const a of v.attrs || []) if (a.name && !dims.includes(a.name)) dims.push(a.name);
  const matched: Array<{ field: SchemaField; dim: string }> = [];
  for (const field of saleFields) {
    const dim = dims.find((d) => !matched.some((m) => m.dim === d) && dimMatchesField(d, field.name || field.id));
    if (dim) matched.push({ field, dim });
  }
  if (!matched.length) {
    const fallbackField = saleFields.find((f) => f.customInput && f.required) || saleFields[0];
    matched.push({ field: fallbackField, dim: dims[0] });
    notes.push(`规格维度「${dims[0]}」与销售属性「${fallbackField.name || fallbackField.id}」按顺序配对，请人工核对`);
  }
  const droppedDims = dims.filter((d) => !matched.some((m) => m.dim === d));

  // 变体按匹配维度组合合并：库存求和、售价取最低、编码/色卡取首个非空。
  const merged = new Map<
    string,
    { labels: string[]; stock: number; price?: number; sku?: string; imageUrl?: string }
  >();
  let skippedVariants = 0;
  for (const v of variants) {
    const labels = matched.map(({ dim }) => (v.attrs || []).find((a) => a.name === dim)?.value?.trim() || '');
    if (labels.some((l) => !l)) {
      skippedVariants++;
      continue;
    }
    const key = labels.join('');
    const row = merged.get(key) || { labels, stock: 0, price: undefined, sku: undefined, imageUrl: undefined };
    row.stock += v.stock != null && v.stock > 0 ? Math.round(v.stock) : 0;
    if (v.price != null && v.price > 0 && (row.price == null || v.price < row.price)) row.price = v.price;
    if (!row.sku && v.sku) row.sku = v.sku;
    if (!row.imageUrl && v.imageUrl) row.imageUrl = stripThumbSuffix(v.imageUrl);
    merged.set(key, row);
  }
  const aligned = [...merged.values()];
  if (!aligned.length) return null;
  if (droppedDims.length || aligned.length !== variants.length) {
    notes.push(
      `SKU 按类目销售属性合并：${variants.length} → ${aligned.length}` +
        (droppedDims.length ? `（维度「${droppedDims.join('、')}」类目无对应销售属性，库存求和、价格取低）` : '') +
        (skippedVariants ? `；${skippedVariants} 个规格值缺失的变体未带入` : ''),
    );
  }

  // 每个（字段, 规格值）分配平台值 ID：类目选项精确匹配（不区分大小写）优先，
  // 否则自定义负数编号（全局唯一，官方要求多个自定义值负数不重复）；不允许自定义且无选项匹配 → 剔除该值。
  let nextCustomId = -1;
  const idOf = new Map<string, { id: string; label: string } | null>();
  const resolveValue = (field: SchemaField, label: string): { id: string; label: string } | null => {
    const key = `${field.id}${label}`;
    if (idOf.has(key)) return idOf.get(key) ?? null;
    const opt = field.options.find((o) => o.name.toLowerCase() === label.toLowerCase());
    let resolved: { id: string; label: string } | null = null;
    if (opt) resolved = { id: opt.value, label };
    else if (field.customInput) resolved = { id: String(nextCustomId--), label };
    else notes.push(`销售属性「${field.name || field.id}」不支持自定义，值「${label}」无匹配选项已剔除`);
    idOf.set(key, resolved);
    return resolved;
  };

  // saleProp：每字段列全部去重值；带色卡的维度（变体图所在维度）value 加 img 属性。每字段上限 40 值。
  const salePropInner = matched
    .map(({ field, dim }, di) => {
      const seen = new Map<string, string | undefined>();
      for (const row of aligned) {
        const label = row.labels[di];
        if (!seen.has(label)) seen.set(label, di === 0 ? row.imageUrl : undefined);
      }
      const entries = [...seen.entries()].slice(0, 40);
      if (seen.size > 40) notes.push(`销售属性「${dim}」超过平台 40 个值上限，仅带入前 40 个`);
      const values = entries
        .map(([label, img]) => {
          const r = resolveValue(field, label);
          if (!r) return '';
          return `<value${img ? ` img="${escXml(img)}"` : ''} inputValue="${escXml(label)}">${r.id}</value>`;
        })
        .join('');
      return values ? `<field id="${field.id}" type="multiCheck"><values>${values}</values></field>` : '';
    })
    .filter(Boolean)
    .join('');
  if (!salePropInner) return null;
  const salePropXml = `<field id="saleProp" type="complex"><complex-value>${salePropInner}</complex-value></field>`;

  // 定价模式：设了发布阶梯（ladderMode）→ 阶梯价优先（平台上阶梯价与规格价二选一）；
  // 否则类目支持 SKU 规格价（scPrice 选项含 3）且全部 SKU 有正售价 → 逐 SKU price（USD）。
  const supportsSkuPricing = !!byId.get('scPrice')?.options.some((o) => o.value === '3');
  const skuPricing = !ladderMode && supportsSkuPricing && aligned.every((r) => r.price != null && r.price > 0);
  if (aligned.some((r) => r.price != null && r.price > 0) && !skuPricing) {
    notes.push(
      ladderMode
        ? '已设置发布阶梯价，SKU 售价未带入（平台上阶梯价与规格价二选一；清空阶梯后重发可走规格价）'
        : supportsSkuPricing
          ? '部分 SKU 缺售价，整体走商品级阶梯价；逐 SKU 售价补齐后重发可切换为规格价'
          : '类目不支持 SKU 规格价，逐 SKU 售价未带入（走商品级阶梯价）',
    );
  }

  // sku 矩阵：官方 multiComplex 格式（每 SKU 一个 complex-values，字段直挂）。
  const skuRows: string[] = [];
  for (const row of aligned) {
    const props = matched
      .map(({ field }, di) => {
        const r = resolveValue(field, row.labels[di]);
        if (!r) return '';
        const propId = field.id.replace(/^p-/, '');
        return (
          `<value propValueId="${escXml(r.id)}" propId="${escXml(propId)}" propName="${field.id}" ` +
          `propValueName="${escXml(r.label)}">${escXml(propId)}:${escXml(r.id)}</value>`
        );
      })
      .filter(Boolean);
    if (props.length !== matched.length) continue; // 有维度值被剔除的组合不成立
    skuRows.push(
      `<complex-values>` +
        (row.sku ? `<field id="skuOuterId" type="input"><value>${escXml(row.sku.slice(0, 64))}</value></field>` : '') +
        `<field id="props" type="multiInput"><values>${props.join('')}</values></field>` +
        `<field id="skuStock" type="multiInput"><values>` +
        `<value srcValue="0" warehouseCode="CN_LOCAL_01">${row.stock}</value></values></field>` +
        (skuPricing && row.price != null
          ? `<field id="price" type="input"><value>${toUsd(row.price).toFixed(2)}</value></field>`
          : '') +
        `</complex-values>`,
    );
  }
  if (!skuRows.length) return null;
  if (skuPricing) notes.push(`已按「SKU 规格价」写入 ${skuRows.length} 个 SKU 的售价与库存（USD）`);
  return { salePropXml, skuXml: `<field id="sku" type="multiComplex">${skuRows.join('')}</field>`, skuPricing };
}
