/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// 源站详情页文本的通用清洗。抓取的 descriptionOriginal 是整页文本提取，源卖家常把「FAQ 问答段」
// 直接写在详情尾部——这属于公司层信息（我们有专门的 companyFaqDesc 结构化字段），混进商品描述/卖点
// 会重复且拉低商详质量（用户反馈的「商品描述里怎么有 FAQs」即此）。

// 从文本中剥离内嵌的「FAQ 问答段」：FAQ 标题 + 紧随其后的 Q:/A: 列表，从标题处截断到结尾。
// 保守约束：① 标题后必须紧跟 Q（问答形态才算 FAQ 段，正文里提到 "FAQ" 一词不动）；
// ② 标题须出现在文本 30% 之后（源站 FAQ 几乎总在详情末尾，防止把以 FAQ 开头的短文清空）。
export function stripEmbeddedFaqSection(text: string): string {
  const s = String(text ?? '');
  const re = /(FAQs?|常见问题|Frequently Asked Questions)\s*[:：]?\s*Q\s*(?:\d+\s*)?[:：.]/i;
  const m = re.exec(s);
  if (!m || m.index < s.length * 0.3) return s;
  return s
    .slice(0, m.index)
    .replace(/[\s|·•\-–—:,;，；]+$/g, '')
    .trim();
}
