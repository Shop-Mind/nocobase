/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { describe, it, expect } from 'vitest';
import { signIop, buildSignedParams, assertIopOk } from '../iop-client';
import { OpenApiError } from '../errors';

describe('signIop 锁定 IOP 签名算法（防回归）', () => {
  it('固定向量产出稳定签名（改算法即报警）', () => {
    const params = { app_key: '502870', sign_method: 'sha256', timestamp: '1700000000000', code: 'test_code_123' };
    const sign = signIop('/auth/token/create', params, 'test_secret');
    expect(sign).toBe('4D081E2ED2D393AF23DB1C715A944B5355EBB3F189D01DFEC0306F723C1610C0');
  });

  it('签名与参数插入顺序无关（内部按 key 排序）', () => {
    const a = signIop('/x', { b: '2', a: '1', c: '3' }, 's');
    const b = signIop('/x', { c: '3', a: '1', b: '2' }, 's');
    expect(a).toBe(b);
  });

  it('sign 字段本身不参与签名', () => {
    const withSign = signIop('/x', { a: '1', sign: 'SHOULD_BE_IGNORED' }, 's');
    const without = signIop('/x', { a: '1' }, 's');
    expect(withSign).toBe(without);
  });

  it('apiPath 参与签名（不同 path 不同签名）', () => {
    expect(signIop('/a', { k: '1' }, 's')).not.toBe(signIop('/b', { k: '1' }, 's'));
  });
});

describe('buildSignedParams 组装系统参数 + 签名', () => {
  const config = { appKey: '502870', appSecret: 'test_secret' };

  it('注入 app_key/sign_method/timestamp/sign，token 接口不含 access_token', () => {
    const p = buildSignedParams(config, { apiPath: '/auth/token/create', params: { code: 'c1' } }, 1700000000000);
    expect(p.app_key).toBe('502870');
    expect(p.sign_method).toBe('sha256');
    expect(p.timestamp).toBe('1700000000000');
    expect(p.code).toBe('c1');
    expect(p.access_token).toBeUndefined();
    expect(p.sign).toMatch(/^[0-9A-F]{64}$/);
  });

  it('业务接口注入 access_token 并参与签名', () => {
    const withTok = buildSignedParams(config, { apiPath: '/x', accessToken: 'AT' }, 1700000000000);
    const without = buildSignedParams(config, { apiPath: '/x' }, 1700000000000);
    expect(withTok.access_token).toBe('AT');
    expect(withTok.sign).not.toBe(without.sign);
  });

  it('对象/数字参数被序列化为字符串', () => {
    const p = buildSignedParams(config, { apiPath: '/x', params: { n: 5, s: 'a' } }, 1700000000000);
    expect(p.n).toBe('5');
    expect(p.s).toBe('a');
  });
});

describe('assertIopOk 平台错误识别', () => {
  it('success:false → 抛 OpenApiError 带 msg_code/trace_id', () => {
    try {
      assertIopOk({ success: false, msg_code: 'B_PRODUCT_NOT_FOUND', message: 'not found', trace_id: 'tid-1' });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(OpenApiError);
      expect((e as OpenApiError).code).toBe('B_PRODUCT_NOT_FOUND');
      expect((e as OpenApiError).traceId).toBe('tid-1');
    }
  });

  it('网关 code 非 0 → 抛错', () => {
    expect(() => assertIopOk({ code: '15', message: 'AppWhiteIpLimit', type: 'AppWhiteIpLimit' })).toThrow(
      OpenApiError,
    );
  });

  it('code=0 / success 缺省 → 视为成功，原样返回', () => {
    const ok = { access_token: 'AT', expires_in: 86400 };
    expect(assertIopOk(ok)).toBe(ok);
    expect(assertIopOk({ code: '0', data: 1 })).toEqual({ code: '0', data: 1 });
  });
});
