/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// 发布前校验（PRD §5.5 校验规则）。纯函数：读入商品/SKU/媒体/发布配置，产出阻断项与警告。
// block = 阻断发布；warn = 提示但不阻断。ready = 无 block 项。

export interface PrecheckIssue {
  level: 'block' | 'warn';
  code: string;
  field: string;
  message: string;
}

export interface PrecheckInput {
  product: {
    titleFinal?: string;
    titleProcessed?: string;
    priceTarget?: number | string | null;
    stock?: number | null;
    categoryTargetId?: string | null;
    // 源平台类目 ID + 源平台：同平台搬运时源类目可直接作为发布类目（与 buildPublishPayload 的兜底链一致）。
    categoryOriginalId?: string | null;
    sourcePlatform?: string | null;
    attributes?: Record<string, unknown> | null;
  };
  skus: Array<{ sku?: string; priceTarget?: number | string | null; stock?: number | null }>;
  hasMainImage: boolean;
  imageCount: number;
  config: { targetPlatform?: string; targetStoreId?: number; categoryTargetId?: string };
}

const TITLE_MAX = 200;

// 运行发布前校验，返回 { ready, issues }。
export function runPrecheck(input: PrecheckInput): { ready: boolean; issues: PrecheckIssue[] } {
  const { product, skus, config } = input;
  const issues: PrecheckIssue[] = [];

  // 目标店铺：未选择视为未授权（mock）。
  if (!config.targetStoreId) {
    issues.push({
      level: 'block',
      code: 'PUBLISH_STORE_NOT_SELECTED',
      field: 'targetStoreId',
      message: '未选择目标店铺或店铺未授权',
    });
  }

  // 类目：与发布时同一条兜底链——发布配置 > 商品目标类目 > 同平台搬运时的源商品类目 ID。
  const category =
    config.categoryTargetId ||
    product.categoryTargetId ||
    (config.targetPlatform && config.targetPlatform === product.sourcePlatform
      ? product.categoryOriginalId
      : undefined);
  if (!category || !String(category).trim()) {
    issues.push({
      level: 'block',
      code: 'PUBLISH_CATEGORY_MISSING',
      field: 'categoryTargetId',
      message: '发布类目未设置',
    });
  }

  // 商品属性：类目必填属性为空则阻断（真实平台如 Lazada 要求填写类目必填属性：材质/容量/颜色等）。
  const attrs = product.attributes;
  const attrCount =
    attrs && typeof attrs === 'object'
      ? Object.values(attrs).filter((v) => v != null && String(v).trim() !== '').length
      : 0;
  if (attrCount === 0) {
    issues.push({
      level: 'block',
      code: 'PUBLISH_ATTRIBUTES_MISSING',
      field: 'attributesProcessed',
      message: '商品属性为空，平台要求填写类目必填属性（如材质/容量/颜色等）',
    });
  }

  // 图片：主图缺失阻断；数量不足（<3）提示。
  if (!input.hasMainImage) {
    issues.push({ level: 'block', code: 'PUBLISH_IMAGE_MISSING', field: 'mainImage', message: '主图缺失，无法发布' });
  } else if (input.imageCount < 3) {
    issues.push({
      level: 'warn',
      code: 'PUBLISH_IMAGE_TOO_FEW',
      field: 'images',
      message: `图片数量偏少（${input.imageCount} 张），建议补充至 3 张以上`,
    });
  }

  // 标题：为空或超长。
  const title = (product.titleFinal || '').trim();
  if (!title) {
    issues.push({ level: 'block', code: 'PUBLISH_TITLE_INVALID', field: 'titleFinal', message: '最终标题为空' });
  } else if (title.length > TITLE_MAX) {
    issues.push({
      level: 'block',
      code: 'PUBLISH_TITLE_INVALID',
      field: 'titleFinal',
      message: `标题超长（${title.length} 字，上限 ${TITLE_MAX}）`,
    });
  }

  // 价格：为空或 <= 0。
  const price = Number(product.priceTarget);
  if (product.priceTarget == null || Number.isNaN(price) || price <= 0) {
    issues.push({
      level: 'block',
      code: 'PUBLISH_PRICE_INVALID',
      field: 'priceTarget',
      message: '目标售价无效（需大于 0）',
    });
  }

  // 库存：为空或为 0。
  const stock = Number(product.stock);
  if (product.stock == null || Number.isNaN(stock) || stock <= 0) {
    issues.push({ level: 'block', code: 'PUBLISH_STOCK_INVALID', field: 'stock', message: '库存为空或为 0' });
  }

  // SKU：规格价格/库存缺失提示。
  const badSku = skus.filter((s) => s.priceTarget == null || s.stock == null);
  if (skus.length && badSku.length) {
    issues.push({
      level: 'warn',
      code: 'PUBLISH_SKU_INCOMPLETE',
      field: 'skus',
      message: `${badSku.length} 个 SKU 缺少目标价或库存`,
    });
  }

  const ready = issues.filter((i) => i.level === 'block').length === 0;
  return { ready, issues };
}
