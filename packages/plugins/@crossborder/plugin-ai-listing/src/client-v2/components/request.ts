/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { useFlowContext } from '@nocobase/flow-engine';
import { useCallback } from 'react';
import { useT } from '../locale';

// 自定义 API 统一返回结构（见 PRD §7.5）：成功 { ok, data, warnings, errors, traceId }，
// 失败 { ok:false, errors:[{ code, message, field, recoverable }], traceId }。
export interface FriendlyError {
  friendlyMessage: string;
  errorCode: string;
  traceId: string;
  retryable: boolean;
  nextAction: string;
  field?: string;
}

export interface FriendlyResult<T = unknown> {
  ok: boolean;
  data?: T;
  warnings?: unknown[];
  error?: FriendlyError;
}

interface RequestConfig {
  url: string;
  method?: string;
  params?: Record<string, unknown>;
  data?: unknown;
  headers?: Record<string, string>;
}

interface RequestOptions {
  // 静默模式：不弹出 message，仅返回结构化错误（用于由调用方自行渲染错误态时）。
  silent?: boolean;
}

type T = (key: string, options?: Record<string, unknown>) => string;

function pickTraceId(
  payload: Record<string, unknown> | undefined,
  headers: Record<string, unknown> | undefined,
): string {
  const fromBody = payload && typeof payload.traceId === 'string' ? payload.traceId : '';
  if (fromBody) return fromBody;
  const h = headers || {};
  const candidate = h['x-trace-id'] || h['x-request-id'] || h['x-response-id'] || h['x-reqid'];
  return typeof candidate === 'string' && candidate ? candidate : `client-${Math.floor(Date.now())}`;
}

// 根据错误码给出“下一步动作”建议。未命中时回落到通用提示，始终带上 traceId 便于排查。
function resolveNextAction(t: T, errorCode: string, retryable: boolean, traceId: string): string {
  const map: Record<string, string> = {
    INVALID_TOKEN: t('登录已过期，请重新登录后再试'),
    FORBIDDEN: t('当前角色无权限，请联系管理员开通'),
    CATEGORY_MISSING: t('请先选择目标平台类目后再操作'),
  };
  if (map[errorCode]) return map[errorCode];
  if (retryable) return t('可点击重试；若多次失败，请把 traceId 提供给管理员：{{traceId}}', { traceId });
  return t('请将 traceId 提供给管理员排查：{{traceId}}', { traceId });
}

export function parseFriendlyError(error: unknown, t: T): FriendlyError {
  // axios 风格错误：error.response.data / error.response.headers。
  const resp = (error as { response?: { data?: Record<string, unknown>; headers?: Record<string, unknown> } })
    ?.response;
  const body = resp?.data;
  const headers = resp?.headers;
  const errors =
    (body?.errors as Array<{ code?: string; message?: string; field?: string; recoverable?: boolean }>) || [];
  const first = errors[0] || {};
  const traceId = pickTraceId(body, headers);
  const errorCode = first.code || (body?.code as string) || 'UNKNOWN_ERROR';
  const retryable = typeof first.recoverable === 'boolean' ? first.recoverable : false;
  const friendlyMessage =
    first.message || (body?.message as string) || (error as Error)?.message || t('请求失败，请稍后再试');
  return {
    friendlyMessage,
    errorCode,
    traceId,
    retryable,
    field: first.field,
    nextAction: resolveNextAction(t, errorCode, retryable, traceId),
  };
}

// 统一的“带友好错误”请求封装：成功返回 { ok:true, data }，失败返回 { ok:false, error } 并默认弹出中文提示。
// 用法：const request = useRequestWithFriendlyError(); const res = await request({ url, method });
export function useRequestWithFriendlyError() {
  const ctx = useFlowContext();
  const t = useT() as T;
  return useCallback(
    async <R = unknown>(config: RequestConfig, options: RequestOptions = {}): Promise<FriendlyResult<R>> => {
      try {
        const response = await ctx.api.request(config);
        const payload = response?.data as { ok?: boolean; data?: R; warnings?: unknown[]; errors?: unknown[] };
        // 自定义 API 即使 HTTP 200 也可能 ok=false（含 errors）：按失败处理。
        if (payload && payload.ok === false) {
          const friendly = parseFriendlyError({ response: { data: payload, headers: response?.headers } }, t);
          if (!options.silent) ctx.message.error(`${friendly.friendlyMessage}（${friendly.errorCode}）`);
          return { ok: false, error: friendly };
        }
        const data = (payload && 'data' in payload ? payload.data : (payload as unknown)) as R;
        return { ok: true, data, warnings: payload?.warnings };
      } catch (error) {
        const friendly = parseFriendlyError(error, t);
        if (!options.silent) ctx.message.error(`${friendly.friendlyMessage}（${friendly.errorCode}）`);
        return { ok: false, error: friendly };
      }
    },
    [ctx, t],
  );
}
