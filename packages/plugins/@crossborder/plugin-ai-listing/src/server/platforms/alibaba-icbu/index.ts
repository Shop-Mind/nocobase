/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// Alibaba.com（1688 国际站 / ICBU）连接器。IOP 家族，走 openapi/ 传输层。
// Phase D：OAuth 三方法（授权URL / 换token / 刷新）已接真实实现（delegate 到 openapi/oauth，已真机验证）。
// capabilities 只声明「已实现」的能力：当前 = oauth；capture/publish 在 Phase E/F 补上 fetchProduct/publish + mappers。

import { buildAuthorizeUrl, exchangeCode, refreshAccessToken } from '../../openapi/oauth';
import { PlatformConnector } from '../types';

export const alibabaIcbuConnector: PlatformConnector = {
  id: 'alibaba-icbu',
  label: 'Alibaba.com（1688 国际站）',
  family: 'iop',
  capabilities: ['oauth'],

  buildAuthorizeUrl,
  exchangeCode,
  refresh: refreshAccessToken,
  // fetchProduct / publish / queryStatus → Phase E/F（用 openapi/iop-client.callIop + alibaba-icbu/mappers）。
};
