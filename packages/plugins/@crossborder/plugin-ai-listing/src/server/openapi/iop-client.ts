/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// IOP/GOP 网关传输核心（Alibaba.com ICBU / Lazada / AliExpress 同一套签名，复用本文件，仅换 gateway）。
// 签名算法（IOP）：把所有请求参数（系统参数 app_key/timestamp/sign_method + 业务参数，排除 sign 与空值）
//   按 key 升序拼成 `key1value1key2value2...`，前面拼上 API path，得到待签串；HMAC-SHA256(appSecret) → 大写 hex。
//   参考各平台 IOP SDK；`sign_method=sha256`，`timestamp` 用毫秒时间戳。
// 铁律：绝不记录 app_secret / access_token / sign；出错只带 code/message/traceId/http。

import { createHmac } from 'node:crypto';
import { OpenApiError, friendlyMessage } from './errors';

export const DEFAULT_GATEWAY = 'https://openapi-api.alibaba.com/rest';

export interface IopConfig {
  appKey: string;
  appSecret: string;
  gateway?: string;
}

export type IopParamValue = string | number | boolean | undefined | null | Record<string, unknown> | unknown[];

export interface IopCallInput {
  apiPath: string; // 如 /auth/token/create、/alibaba/icbu/product/get/v2
  params?: Record<string, IopParamValue>;
  accessToken?: string; // 业务接口需要；token 接口不传
  timeoutMs?: number;
  httpMethod?: 'GET' | 'POST'; // 默认 POST；buyer/eco 组接口需 GET，否则报 UnsupportedHTTPMethod
}

// 清洗业务参数：去掉 undefined/null，对象/数组序列化为 JSON 字符串，其余转字符串。
function normalizeParams(params?: Record<string, IopParamValue>): Record<string, string> {
  const out: Record<string, string> = {};
  if (!params) return out;
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || k === 'sign') continue;
    // 对象/数组序列化为 JSON 字符串（buyer 组的 query_req / param0 等嵌套对象参数需要）。
    out[k] = typeof v === 'string' ? v : typeof v === 'object' ? JSON.stringify(v) : String(v);
  }
  return out;
}

// IOP 签名：apiPath + 排序拼接的 key+value，HMAC-SHA256(appSecret)，大写 hex。
export function signIop(apiPath: string, params: Record<string, string>, appSecret: string): string {
  const keys = Object.keys(params)
    .filter((k) => k !== 'sign')
    .sort();
  let base = apiPath;
  for (const k of keys) base += k + params[k];
  return createHmac('sha256', appSecret).update(base, 'utf8').digest('hex').toUpperCase();
}

// 组装带签名的完整参数集（系统参数 + 业务参数 + sign）。timestamp 传入以便测试可复现。
export function buildSignedParams(config: IopConfig, input: IopCallInput, timestamp: number): Record<string, string> {
  const all: Record<string, string> = {
    app_key: config.appKey,
    sign_method: 'sha256',
    timestamp: String(timestamp),
    ...normalizeParams(input.params),
  };
  if (input.accessToken) all.access_token = input.accessToken;
  all.sign = signIop(input.apiPath, all, config.appSecret);
  return all;
}

// 从平台响应里判定错误：IOP 网关错误多为 { code, type, message, request_id }（code 非 '0'）；
// 业务 v2 接口为 { success:false, msg_code, message, trace_id }。命中则抛 OpenApiError，否则原样返回。
export function assertIopOk(json: Record<string, unknown>): Record<string, unknown> {
  const traceId = (json.request_id || json.trace_id || json._trace_id) as string | undefined;
  const gatewayCode = json.code as string | number | undefined;
  const isGatewayError = gatewayCode !== undefined && gatewayCode !== null && String(gatewayCode) !== '0';
  const isBizError = json.success === false;
  if (isGatewayError || isBizError) {
    const code = String((json.msg_code as string) || (json.code as string) || (json.type as string) || 'OPENAPI_ERROR');
    const friendly = friendlyMessage(code);
    const message = friendly?.userMessage || (json.message as string) || '平台接口调用失败';
    throw new OpenApiError(code, message, { retryable: friendly?.retryable ?? false, traceId });
  }
  return json;
}

// 文件上传（multipart/form-data）：签名只覆盖普通参数（文件字节不参与签名，与 IOP SDK 一致），
// 文件作为独立 part 附加。用于 photobank.upload 等 byte[] 参数接口。
export interface IopUploadFile {
  field: string; // 文件参数名，如 image_bytes
  fileName: string;
  data: Buffer | Uint8Array;
  contentType?: string;
}

export async function callIopUpload(
  config: IopConfig,
  input: IopCallInput & { file: IopUploadFile },
): Promise<Record<string, unknown>> {
  if (!config.appKey || !config.appSecret) {
    throw new OpenApiError('OPENAPI_NOT_CONFIGURED', '缺少 AppKey / AppSecret');
  }
  const gateway = config.gateway || DEFAULT_GATEWAY;
  const signed = buildSignedParams(config, input, Date.now());
  const form = new FormData();
  for (const [k, v] of Object.entries(signed)) form.append(k, v);
  const bytes = input.file.data instanceof Uint8Array ? input.file.data : new Uint8Array(input.file.data);
  form.append(
    input.file.field,
    new Blob([bytes as BlobPart], { type: input.file.contentType || 'application/octet-stream' }),
    input.file.fileName,
  );
  let resp: Response;
  try {
    resp = await fetch(gateway + input.apiPath, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(input.timeoutMs ?? 60000),
    });
  } catch (e) {
    const msg = (e as Error)?.name === 'TimeoutError' ? '平台接口超时' : '平台接口网络错误';
    throw new OpenApiError('OPENAPI_NETWORK_ERROR', msg, { retryable: true });
  }
  let json: Record<string, unknown>;
  try {
    json = (await resp.json()) as Record<string, unknown>;
  } catch {
    throw new OpenApiError('OPENAPI_BAD_RESPONSE', '平台返回非 JSON 响应', {
      retryable: resp.status >= 500,
      httpStatus: resp.status,
    });
  }
  return assertIopOk(json);
}

// 调 IOP 网关（POST，application/x-www-form-urlencoded）。HTTP/解析/业务错误统一抛 OpenApiError。
export async function callIop(config: IopConfig, input: IopCallInput): Promise<Record<string, unknown>> {
  if (!config.appKey || !config.appSecret) {
    throw new OpenApiError('OPENAPI_NOT_CONFIGURED', '缺少 AppKey / AppSecret');
  }
  const gateway = config.gateway || DEFAULT_GATEWAY;
  const url = gateway + input.apiPath;
  const signed = buildSignedParams(config, input, Date.now());
  const form = new URLSearchParams();
  for (const [k, v] of Object.entries(signed)) form.append(k, v);
  const method = input.httpMethod ?? 'POST';

  let resp: Response;
  try {
    resp = await fetch(
      method === 'GET' ? `${url}?${form.toString()}` : url,
      method === 'GET'
        ? { method: 'GET', signal: AbortSignal.timeout(input.timeoutMs ?? 20000) }
        : {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: form,
            signal: AbortSignal.timeout(input.timeoutMs ?? 20000),
          },
    );
  } catch (e) {
    const msg = (e as Error)?.name === 'TimeoutError' ? '平台接口超时' : '平台接口网络错误';
    throw new OpenApiError('OPENAPI_NETWORK_ERROR', msg, { retryable: true });
  }

  let json: Record<string, unknown>;
  try {
    json = (await resp.json()) as Record<string, unknown>;
  } catch {
    throw new OpenApiError('OPENAPI_BAD_RESPONSE', '平台返回非 JSON 响应', {
      retryable: resp.status >= 500,
      httpStatus: resp.status,
    });
  }
  if (!resp.ok && json.success === undefined && json.code === undefined) {
    throw new OpenApiError('OPENAPI_HTTP_ERROR', `平台 HTTP ${resp.status}`, {
      retryable: resp.status >= 500,
      httpStatus: resp.status,
    });
  }
  return assertIopOk(json);
}
