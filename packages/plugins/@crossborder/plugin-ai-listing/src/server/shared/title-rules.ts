/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// Alibaba.com 官方商品标题规范。来源：帮助中心《如何设置商品标题？》（knowledge 20142419，
// 即类目 schema 里 productTitle tipRule 引用的那篇）+ 官方发布接入文档 3.3.1 填写标题。
// 注入点：AI 标题建议 prompt（review aiSuggestTitle）、知识库（assistant/knowledge）、
// 预览编辑页标题提示与 Toby 对话上下文（jsBlock）。硬校验（≤128 字节/非法字符）在 schema-draft 按类目规则执行。
export const ALIBABA_TITLE_RULES =
  'Alibaba.com 商品标题官方规范：' +
  '① 结构=核心品名+产品特征（属性）+行业标准/认证+型号，与买家搜索词强相关，不为凑搜索词重复铺货；' +
  '② 可用 with/for 突出属性与用途，但核心词必须放在 with/for 之前（正例：steel pipe with ASTM DIN JIS Standard；15mm film faced plywood for construction）；' +
  '③ 长度适当：平台上限 128 英文字符（字节），买家搜索词仅 50 字符，过长降低匹配度，也不要过短；' +
  '④ 严禁关键词罗列堆砌（多个同义品名重复累加会降低与买家搜索词的匹配精度、拉低排序）；' +
  '⑤ 慎用特殊符号 / – ( ) 等（可能被判为不可识别字符影响排序），必须使用时前后加空格；' +
  '⑥ 不含 script/邮箱等非法字符，不用夸大词、绝对化用语与平台违禁词。';

// 中文标题的等效长度提示（中文标题发布后在编辑页翻译为英文，按 128 英文字符上限预留余量）。
export const ALIBABA_TITLE_CN_LENGTH_HINT = '中文标题建议控制在 40 字以内（对应平台 128 英文字符上限）';
