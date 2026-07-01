/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// 平台 OpenAPI 统一错误 + 运营友好提示映射。IOP 家族（Alibaba.com / Lazada / AliExpress）通用。
// 铁律：错误对象与日志绝不含 access_token / app_secret / 完整响应体，只带 code / message / traceId / http。

export class OpenApiError extends Error {
  code: string;
  retryable: boolean;
  traceId?: string;
  httpStatus?: number;

  constructor(code: string, message: string, opts?: { retryable?: boolean; traceId?: string; httpStatus?: number }) {
    super(message);
    this.name = 'OpenApiError';
    this.code = code;
    this.retryable = opts?.retryable ?? false;
    this.traceId = opts?.traceId;
    this.httpStatus = opts?.httpStatus;
  }
}

// msg_code / 错误码 → 运营友好提示（zh）。未知码回退到原始 message。
const FRIENDLY: Record<string, { userMessage: string; retryable: boolean; action?: string }> = {
  OPENAPI_NOT_CONFIGURED: {
    userMessage: '平台接口未配置（缺少 AppKey / AppSecret）',
    retryable: false,
    action: '在服务端 .env 配置 ALIBABA_ICBU_APP_KEY / APP_SECRET',
  },
  OPENAPI_NOT_CONNECTED: {
    userMessage: '尚未连接平台店铺，请先完成授权',
    retryable: false,
    action: '到设置页点「连接店铺」完成 OAuth 授权',
  },
  OPENAPI_NEEDS_REAUTH: {
    userMessage: '平台授权已过期，需要重新授权店铺',
    retryable: false,
    action: '到设置页重新「连接店铺」',
  },
  OPENAPI_TOKEN_EXCHANGE_FAILED: {
    userMessage: '换取访问令牌失败（授权码可能已过期，请重新授权）',
    retryable: false,
    action: '重新发起「连接店铺」，授权码一次性且快速过期',
  },
  InvalidCode: {
    userMessage: '授权码无效或已过期，请重新授权',
    retryable: false,
    action: '重新发起「连接店铺」，授权码一次性且快速过期',
  },
  InvalidAppKey: {
    userMessage: '网关或 AppKey 配置错误',
    retryable: false,
    action: '确认网关为 openapi-api.alibaba.com/rest、AppKey 正确',
  },
  IncompleteSignature: { userMessage: '请求签名不完整/无效', retryable: false, action: '检查签名算法与参数拼接' },
  InvalidSignature: { userMessage: '请求签名无效', retryable: false, action: '检查 AppSecret 与签名算法' },
  'invalid-signature': { userMessage: '请求签名无效', retryable: false, action: '检查 AppSecret 与签名算法' },
  AppWhiteIpLimit: {
    userMessage: '当前出口 IP 不在平台白名单内',
    retryable: false,
    action: '到控制台 IP Whitelist 加入服务器出口公网 IP',
  },
  IllegalAccessToken: { userMessage: '访问令牌无效或已过期', retryable: false, action: '触发刷新或重新授权' },
  'invalid-timestamp': { userMessage: '请求时间戳误差过大', retryable: true, action: '校准服务器时钟（NTP）' },
  ServiceUnavailable: { userMessage: '平台服务暂不可用', retryable: true, action: '稍后重试' },
  'system-busy': { userMessage: '平台繁忙，请稍后重试', retryable: true, action: '稍后重试' },
};

export function friendlyMessage(code?: string): { userMessage: string; retryable: boolean; action?: string } | null {
  if (!code) return null;
  return FRIENDLY[code] ?? null;
}
