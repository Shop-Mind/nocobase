/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// 平台连接器抽象（Phase D）：把「一个平台怎么授权 / 怎么抓 / 怎么发」收敛到一个 PlatformConnector 后面，
// 让接第 2、3…个平台（1688 国内、Lazada、拼多多、抖音）只需新增一个 connector + 在 registry 加一行。
//
// 设计：connector 是**纯逻辑**，不依赖 NocoBase ctx/db。业务方法接收「已解析好的 access_token」，
// token 的读取/刷新/落库由上层（token-store + resource 层）负责。这样 connector 可单测、可跨平台复用。

import type { CaptureOptions, NormalizedProduct } from '../adapters';
import type { PublishPayload, PublishResult } from '../publish/adapters';
import type { TokenBundle } from '../openapi/oauth';

// IOP 家族（Alibaba.com / Lazada / AliExpress 同一套 HMAC-SHA256 签名，复用 openapi/iop-client）；
// custom = 自有签名（拼多多 MD5 pop 签名、抖音 open api 签名等），在各自 connector 内实现。
export type PlatformFamily = 'iop' | 'custom';

export type PlatformCapability = 'oauth' | 'capture' | 'publish' | 'inventory' | 'price' | 'status';

// 抓取目标：商品 ID 或商品链接（connector 内部自行解析）。
export interface ProductRef {
  productId?: string;
  url?: string;
}

// 类目预测结果（发布前把源商品标题/图喂给平台类目预测接口，拿到目标平台叶子类目）。
export interface CategoryPrediction {
  categoryId: string;
  categoryName?: string;
  categoryPath?: string;
}

// 店铺（自有）商品概要：卖家侧商品列表接口返回，供「店铺抓取」勾选后按 detailUrl/productId 走买家侧详情抓取。
export interface StoreProductSummary {
  productId: string;
  title: string;
  imageUrl?: string;
  detailUrl?: string;
  status?: string;
  display?: boolean;
}

export interface StoreProductPage {
  total: number;
  page: number;
  pageSize: number;
  products: StoreProductSummary[];
}

// 全网关键词搜索结果（买家侧搜索接口，不限店铺——搬运他人商品的主通道之一）。
export interface MarketProductCard {
  productId: string;
  title: string;
  priceText?: string;
  currency?: string;
  imageUrl?: string;
  detailUrl?: string;
}

export interface MarketSearchPage {
  total: number;
  page: number;
  pageSize: number;
  products: MarketProductCard[];
}

export interface PlatformConnector {
  id: string; // 稳定标识：'alibaba-icbu' | '1688-domestic' | 'lazada' | 'pdd' | 'douyin'
  label: string; // 展示名
  family: PlatformFamily;
  capabilities: PlatformCapability[]; // 声明实际已实现的能力，调用前据此判断

  // —— OAuth（所有平台必备）——
  buildAuthorizeUrl(state: string): string;
  exchangeCode(code: string): Promise<TokenBundle>;
  refresh(refreshToken: string): Promise<TokenBundle>;

  // —— 业务（可选，按 capabilities；入参是已解析好的 access_token）——
  fetchProduct?(accessToken: string, ref: ProductRef, options?: CaptureOptions): Promise<NormalizedProduct>;
  // 列出已授权店铺自己的商品（卖家侧接口）。买家侧无「按店铺列商品」且公开页有反爬，「店铺抓取」靠此枚举自家店。
  listOwnProducts?(
    accessToken: string,
    query: { page?: number; pageSize?: number; subject?: string },
  ): Promise<StoreProductPage>;
  // 全网关键词搜索（买家侧接口，不限店铺）：搜索他人商品 → 选中后按 productId 走 fetchProduct 真实抓取。
  searchProducts?(
    accessToken: string,
    query: { keyword: string; page?: number; pageSize?: number; language?: string; currency?: string },
  ): Promise<MarketSearchPage>;
  // 轻量查询商品的供应商公司（单跳 description）：「按制造商归组搜索」用；买家侧没有独立的工厂/公司搜索接口。
  fetchSupplier?(accessToken: string, productId: string): Promise<{ supplierName?: string; companyId?: string }>;
  publish?(accessToken: string, payload: PublishPayload): Promise<PublishResult>;
  // 发布为草稿（进卖家后台草稿箱，不上架、不触发平台审核；人工确认提交上架时才审核）。
  publishDraft?(accessToken: string, payload: PublishPayload): Promise<PublishResult>;
  queryStatus?(
    accessToken: string,
    targetProductId: string,
  ): Promise<{ status: 'online' | 'draft' | 'failed' | 'pending'; description?: string }>;
  predictCategory?(
    accessToken: string,
    input: { title: string; description?: string; imageUrl?: string },
  ): Promise<CategoryPrediction>;
}
