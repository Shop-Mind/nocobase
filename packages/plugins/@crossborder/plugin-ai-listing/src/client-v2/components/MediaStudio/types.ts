/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// MediaStudio 与 media-kit 共享的最小类型:兼容 v1/v2 两套 client 的 Application 实例
// (运行中的 /admin 应用加载 v1 入口,kit 从 v1 plugin.load() 安装)。

export type MediaStudioApp = {
  apiClient: { request: (options: unknown) => Promise<{ data?: unknown }> };
  i18n?: { t?: (key: string, options?: Record<string, unknown>) => string };
};

export interface MediaAsset {
  id: number;
  url: string | null;
  origin: string | null;
  role: string | null;
  // 'image' | 'video'(视频入列需要区分;role==='video' 亦可判定,assetType 更稳)
  assetType?: string | null;
  sort: number | null;
  finalSelected: boolean;
  discarded: boolean;
  parentAssetId: number | null;
  genParams: {
    scene?: string | null;
    instruction?: string;
    prompt?: string;
    compareMode?: string;
    model?: string;
    sourceAssetId?: number | null;
    sourceImageUrl?: string;
  } | null;
  createdAt?: string;
}

export interface MediaScene {
  key: string;
  title: string;
  route: string;
  compareMode: string;
  defaultN: number;
  instructionRequired: boolean;
  hint: string;
}

export interface MediaPanelData {
  gallery: MediaAsset[];
  candidates: MediaAsset[];
  adopted: MediaAsset[];
  // 视频(P1「视频入列」):videos=全部未弃用视频(采纳优先);videoCandidates/videoAdopted 为细分。
  videos?: MediaAsset[];
  videoCandidates?: MediaAsset[];
  videoAdopted?: MediaAsset[];
}

// 自定义 action 的 {ok,...} 载荷被 koa 再包一层 data;这里剥掉并归一化错误
export async function callMediaApi<T>(
  app: MediaStudioApp,
  url: string,
  data?: Record<string, unknown>,
): Promise<{ ok: boolean; data?: T; message?: string; code?: string }> {
  try {
    const res = await app.apiClient.request({ url, method: 'post', data: data || {} });
    let body = res?.data as Record<string, unknown> | undefined;
    if (body && typeof body.data === 'object' && body.data && 'ok' in (body.data as Record<string, unknown>)) {
      body = body.data as Record<string, unknown>;
    }
    if (body?.ok) return { ok: true, data: body.data as T };
    const err = (body?.errors as Array<{ code?: string; message?: string }> | undefined)?.[0];
    return { ok: false, message: err?.message || '请求失败', code: err?.code };
  } catch (e) {
    const resp = (e as { response?: { data?: { data?: { errors?: Array<{ code?: string; message?: string }> } } } })
      .response;
    const err = resp?.data?.data?.errors?.[0];
    return { ok: false, message: err?.message || (e as Error).message || '网络错误', code: err?.code };
  }
}

export function makeT(app: MediaStudioApp): (key: string, options?: Record<string, unknown>) => string {
  return (key: string, options?: Record<string, unknown>) => {
    try {
      return app.i18n?.t?.(key, { ns: ['@crossborder/plugin-ai-listing', 'client'], ...options }) || key;
    } catch {
      return key;
    }
  };
}
