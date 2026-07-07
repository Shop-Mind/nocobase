/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// 公网 URL 管线(P6):把一张内部资产(assetId 或 URL)归一化为「外部服务商可回源访问」的绝对 URL。
// 用途:图片翻译(qwen-mt-image)、模特图(virtualmodel/aitryon)、智能视频等生产端点强制要求传公网可访问的
// 图片 URL(不收 base64);本管线是切换到这些真实端点时的统一入图基座,也被视频(P8)复用。
// 测试期图像编辑走 gpt-image-2 的 /images/edits(base64 data URI 入图),不经本管线;故本管线独立成型 + 独立 E2E 验证。
//
// 归一化规则:
//   ① 已是绝对 http(s)(如抓取源 alicdn、或已配置公网存储直链)→ 原样返回,public=true(其本身即公网可达)。
//   ② 相对 /storage 路径 → 前置公网基址(env AI_LISTING_PUBLIC_BASE_URL,如 https://app.xuanwu.space;
//      未配置时用调用方传入的 baseUrl,通常取当前请求 origin)→ 绝对 URL,public=true。
//   ③ data: URI 或取不到基址的相对路径 → public=false,调用方据此回退(如退化为 data URI 直传 gpt-image-2)。
// 铁律:只归一化 URL,绝不把任何凭证拼进来;返回的是「已对外服务的资产地址」,不新增暴露面。

import type { Application } from '@nocobase/server';
import { MediaServiceError } from './service';

export interface PublicUrlInput {
  assetId?: number;
  url?: string;
}

export interface PublicUrlResult {
  // 归一化后的 URL(相对路径在无基址时按原样返回)
  url: string;
  // 是否公网可达(外部服务商能回源);false 时调用方需回退
  public: boolean;
  // 命中的归一化来源,便于排障
  source: 'remote' | 'public_base' | 'data' | 'relative';
}

// 公网基址:env AI_LISTING_PUBLIC_BASE_URL 优先(生产设为 https://app.xuanwu.space),否则调用方兜底(请求 origin)。
export function publicBaseUrl(fallbackBaseUrl?: string): string {
  return (process.env.AI_LISTING_PUBLIC_BASE_URL || fallbackBaseUrl || '').trim().replace(/\/+$/, '');
}

// 解析资产/URL → 公网可访问 URL。assetId 优先(读 meta.storedUrl → sourceUrl);否则用传入 url。
export async function toPublicUrl(
  app: Application,
  input: PublicUrlInput,
  opts?: { baseUrl?: string },
): Promise<PublicUrlResult> {
  let raw = (input.url || '').trim();
  if (input.assetId) {
    const asset = await app.db.getRepository('aiListingMediaAssets').findOne({ filterByTk: input.assetId });
    if (!asset) throw new MediaServiceError('MEDIA_SOURCE_NOT_FOUND', `资产 ${input.assetId} 不存在`);
    const meta = (asset.get('meta') as Record<string, unknown>) || {};
    raw = (meta.storedUrl as string) || (asset.get('sourceUrl') as string) || '';
  }
  if (!raw) throw new MediaServiceError('MEDIA_SOURCE_NOT_FOUND', '缺少资产 URL(assetId 或 url)');
  if (raw.startsWith('data:')) return { url: raw, public: false, source: 'data' };
  if (/^https?:\/\//i.test(raw)) return { url: raw, public: true, source: 'remote' };
  const base = publicBaseUrl(opts?.baseUrl);
  if (base) return { url: `${base}/${raw.replace(/^\/+/, '')}`, public: true, source: 'public_base' };
  return { url: raw, public: false, source: 'relative' };
}
