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
  publish?(accessToken: string, payload: PublishPayload): Promise<PublishResult>;
  queryStatus?(accessToken: string, targetProductId: string): Promise<'online' | 'draft' | 'failed' | 'pending'>;
}
