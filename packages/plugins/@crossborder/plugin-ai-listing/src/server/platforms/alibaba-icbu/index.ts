/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// Alibaba.com（1688 国际站 / ICBU）连接器。IOP 家族，走 openapi/ 传输层。
// OAuth 三方法 delegate 到 openapi/oauth（已真机验证）。fetchProduct 用 /alibaba/icbu/product/get/v2 拉真实商品。

import { parseAlibabaProductId } from '../../adapters';
import { callIop } from '../../openapi/iop-client';
import { OpenApiError } from '../../openapi/errors';
import { buildAuthorizeUrl, exchangeCode, getIopConfig, refreshAccessToken } from '../../openapi/oauth';
import { PlatformConnector } from '../types';
import {
  applyInventoryToSkus,
  mapBuyerCertificates,
  mapBuyerInventory,
  mapBuyerKeyAttributes,
  toNormalizedFromBuyerDescription,
} from './mappers';

export const alibabaIcbuConnector: PlatformConnector = {
  id: 'alibaba-icbu',
  label: 'Alibaba.com（1688 国际站）',
  family: 'iop',
  capabilities: ['oauth', 'capture'],

  buildAuthorizeUrl,
  exchangeCode,
  refresh: refreshAccessToken,

  // 抓取（搬运他人商品）：从链接/ID 解析 product_id → /eco/buyer/product/description（买家选品接口，GET）→ 归一化。
  // 按抓取选项补充调用 keyattributes（关键属性）/ inventory（实时库存）/ cert（证书）——每个都是独立 GET，
  // 单项失败只记入 captureWarnings、不影响主详情落库。店铺信息（supplier/eCompanyId）已含在 description 响应里。
  // 注意：product/get/v2 只查“自己店铺”的商品，搬运别家须走 buyer 组。accessToken 由上层解析好传入；
  // 网关错误（AppWhiteIpLimit / InsufficientPermission / PRODUCT_NOT_FOUND 等）以 OpenApiError 抛出。
  async fetchProduct(accessToken, ref, options) {
    const productId = ref.productId || (ref.url ? parseAlibabaProductId(ref.url) : undefined);
    if (!productId) {
      throw new OpenApiError('PRODUCT_ID_NOT_FOUND', '无法从链接解析 Alibaba 商品 ID，请检查是否为商品详情页链接');
    }
    const cfg = getIopConfig();
    const pid = Number(productId);
    // 语言/币种与源页展示对齐（默认中文 + 人民币，标题/描述语言与价格币种随之）。
    const language = options?.language || 'zh-CN';
    const currency = options?.currency || 'CNY';
    const country = language.startsWith('zh') ? 'CN' : 'US';
    const json = await callIop(cfg, {
      apiPath: '/eco/buyer/product/description',
      httpMethod: 'GET',
      params: { query_req: { product_id: pid, language, currency } },
      accessToken,
    });
    const normalized = toNormalizedFromBuyerDescription(json, ref.url, productId);

    // 缺省（未传 fields）全抓（评论除外，需显式勾选），与 CaptureOptions 约定一致。
    const wants = (key: string) => !options?.fields || options.fields.includes(key);
    const warnings: string[] = [];

    if (wants('attributes')) {
      try {
        const attrJson = await callIop(cfg, {
          apiPath: '/eco/buyer/product/keyattributes',
          httpMethod: 'GET',
          params: { query_req: { product_id: pid, country } },
          accessToken,
        });
        const attrs = mapBuyerKeyAttributes(attrJson);
        if (Object.keys(attrs).length) normalized.attributesOriginal = attrs;
      } catch (e) {
        warnings.push(`关键属性获取失败：${(e as Error)?.message || e}`);
      }
    }

    if (wants('inventory')) {
      try {
        const invJson = await callIop(cfg, {
          apiPath: '/eco/buyer/product/inventory',
          httpMethod: 'GET',
          params: { inv_req: { product_id: pid, shipping_from: 'CN' } },
          accessToken,
        });
        const inventory = mapBuyerInventory(invJson);
        if (inventory.total > 0 || Object.keys(inventory.bySkuId).length) {
          applyInventoryToSkus(normalized.skus || [], inventory);
          normalized.stock = inventory.total;
        }
      } catch (e) {
        warnings.push(`实时库存获取失败：${(e as Error)?.message || e}`);
      }
    }

    if (wants('cert')) {
      try {
        const certJson = await callIop(cfg, {
          apiPath: '/eco/buyer/product/cert',
          httpMethod: 'GET',
          params: { req: { product_id: pid } },
          accessToken,
        });
        const certs = mapBuyerCertificates(certJson);
        if (certs.length) normalized.certifications = certs;
      } catch (e) {
        warnings.push(`证书获取失败：${(e as Error)?.message || e}`);
      }
    }

    // 评论：Alibaba 买家 OpenAPI 没有产品评价/店铺评价接口（06-buyer-product 全组核对过），
    // 勾选时给出明确告警而非静默忽略；真实抓取需接入独立爬虫 worker 后由其填充。
    if (options?.fields?.includes('productReviews')) {
      warnings.push('产品评价：Alibaba OpenAPI 未提供评论接口，本次未抓取（需接入爬虫服务后支持）');
    }
    if (options?.fields?.includes('shopReviews')) {
      warnings.push('店铺评价：Alibaba OpenAPI 未提供店铺评分/评价接口，本次未抓取（需接入爬虫服务后支持）');
    }

    if (warnings.length) normalized.captureWarnings = warnings;
    return normalized;
  },
  // publish / queryStatus → Phase F。
};
