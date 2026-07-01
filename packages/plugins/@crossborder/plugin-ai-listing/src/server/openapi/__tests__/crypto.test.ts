/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { encryptSecret, decryptSecret, isEncrypted, __resetKeyCacheForTest } from '../crypto';

const KEY = '580636dd9ce27113c6450aee3209a03fee8570f9b0816811a6c59119e89fed49';

describe('crypto AES-256-GCM token 加解密', () => {
  beforeEach(() => {
    process.env.AI_LISTING_TOKEN_SECRET = KEY;
    __resetKeyCacheForTest();
  });

  it('往返：decrypt(encrypt(x)) === x', () => {
    const plain = 'access_token_50000501_2DL4DV3jcU1UOT7WGI1A4rY91';
    const enc = encryptSecret(plain);
    expect(enc).not.toContain(plain); // 密文不含明文
    expect(isEncrypted(enc)).toBe(true);
    expect(decryptSecret(enc)).toBe(plain);
  });

  it('同一明文两次加密密文不同（随机 IV），但都能解回', () => {
    const p = 'refresh_token_xyz';
    const a = encryptSecret(p);
    const b = encryptSecret(p);
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe(p);
    expect(decryptSecret(b)).toBe(p);
  });

  it('篡改密文 → 解密抛错（GCM 认证）', () => {
    const enc = encryptSecret('secret');
    const parts = enc.split(':');
    const tampered = [parts[0], parts[1], parts[2], Buffer.from('evil').toString('base64')].join(':');
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it('换密钥 → 无法解密旧密文', () => {
    const enc = encryptSecret('secret');
    process.env.AI_LISTING_TOKEN_SECRET = 'a-completely-different-secret-key-value';
    __resetKeyCacheForTest();
    expect(() => decryptSecret(enc)).toThrow();
  });

  it('格式非法 → 抛错；isEncrypted 正确判别', () => {
    expect(() => decryptSecret('not-encrypted')).toThrow();
    expect(isEncrypted('plain')).toBe(false);
    expect(isEncrypted(undefined)).toBe(false);
  });
});
