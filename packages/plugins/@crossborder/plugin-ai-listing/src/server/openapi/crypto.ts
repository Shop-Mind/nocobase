/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// access_token / refresh_token 落库前的对称加密（AES-256-GCM）。
// 密钥来自 env AI_LISTING_TOKEN_SECRET（任意足够随机的字符串，推荐 `openssl rand -hex 32`），
// 用 scrypt 派生 32 字节密钥。密文格式：`v1:<ivB64>:<tagB64>:<cipherB64>`。
// 铁律：明文 token 只在内存短暂存在，落库一律密文；本模块不打印任何明文/密钥。

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

let keyCache: Buffer | null = null;

function getKey(): Buffer {
  if (keyCache) return keyCache;
  const secret = process.env.AI_LISTING_TOKEN_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error('AI_LISTING_TOKEN_SECRET 未配置或过短（需 ≥16 字符，推荐 openssl rand -hex 32）');
  }
  // 固定盐：真正的机密是 env 里的 secret；盐只用于把任意字符串规整为 32 字节强密钥。
  keyCache = scryptSync(secret, 'ai-listing-token-kdf-v1', 32);
  return keyCache;
}

// 仅供测试在切换 env 后重置派生密钥缓存，业务代码勿用。
export function __resetKeyCacheForTest(): void {
  keyCache = null;
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
}

export function decryptSecret(payload: string): string {
  const parts = payload.split(':');
  if (parts.length !== 4 || parts[0] !== 'v1') {
    throw new Error('密文格式非法（期望 v1:iv:tag:cipher）');
  }
  const [, ivB64, tagB64, dataB64] = parts;
  const decipher = createDecipheriv('aes-256-gcm', getKey(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
}

export function isEncrypted(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('v1:') && value.split(':').length === 4;
}
