/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { getConnector, findConnector, listConnectors, isRealEnabled } from '../registry';
import { OpenApiError } from '../../openapi/errors';

describe('平台连接器注册表', () => {
  it('按 connector id 取到 Alibaba 连接器', () => {
    const c = getConnector('alibaba-icbu');
    expect(c.id).toBe('alibaba-icbu');
    expect(c.family).toBe('iop');
    expect(c.capabilities).toContain('oauth');
    expect(typeof c.buildAuthorizeUrl).toBe('function');
    expect(typeof c.exchangeCode).toBe('function');
    expect(typeof c.refresh).toBe('function');
  });

  it('按平台展示名（数据库里的 platform 值）也能取到', () => {
    expect(getConnector('Alibaba.com').id).toBe('alibaba-icbu');
    expect(getConnector('1688 国际站').id).toBe('alibaba-icbu');
  });

  it('未支持平台：getConnector 抛 PLATFORM_NOT_SUPPORTED，findConnector 返回 undefined', () => {
    try {
      getConnector('taobao');
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(OpenApiError);
      expect((e as OpenApiError).code).toBe('PLATFORM_NOT_SUPPORTED');
    }
    expect(findConnector('taobao')).toBeUndefined();
  });

  it('listConnectors 至少含 alibaba-icbu', () => {
    expect(listConnectors().some((c) => c.id === 'alibaba-icbu')).toBe(true);
  });
});

describe('isRealEnabled 灰度开关（env AI_LISTING_REAL_<ID>）', () => {
  const KEY = 'AI_LISTING_REAL_ALIBABA_ICBU';
  const original = process.env[KEY];
  afterEach(() => {
    if (original === undefined) delete process.env[KEY];
    else process.env[KEY] = original;
  });

  it('未设置 / false → 关闭', () => {
    delete process.env[KEY];
    expect(isRealEnabled('alibaba-icbu')).toBe(false);
    process.env[KEY] = 'false';
    expect(isRealEnabled('alibaba-icbu')).toBe(false);
  });

  it('true（大小写不敏感）→ 开启；连字符 id 转下划线大写匹配 env', () => {
    process.env[KEY] = 'true';
    expect(isRealEnabled('alibaba-icbu')).toBe(true);
    process.env[KEY] = 'TRUE';
    expect(isRealEnabled('alibaba-icbu')).toBe(true);
  });
});
