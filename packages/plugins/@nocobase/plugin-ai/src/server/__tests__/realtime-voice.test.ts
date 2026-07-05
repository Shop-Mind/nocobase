/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { consumeRealtimeTicket, createRealtimeTicket, resolveRealtimeModel } from '../ai-employees/realtime-voice';
import type PluginAIServer from '../plugin';

const pluginWith = (services: Array<{ llmService: string; provider?: string; models: string[] }>) =>
  ({
    aiManager: {
      listAllEnabledModels: async () =>
        services.map((s) => ({
          llmService: s.llmService,
          provider: s.provider || 'dashscope',
          enabledModels: s.models.map((value) => ({ label: value, value })),
        })),
    },
    db: {
      getRepository: () => ({
        findOne: async () => ({ options: { apiKey: 'sk-test' } }),
      }),
    },
  }) as unknown as PluginAIServer;

afterEach(() => {
  delete process.env.AI_REALTIME_MODEL;
});

describe('resolveRealtimeModel', () => {
  it('honors AI_REALTIME_MODEL with service prefix', async () => {
    process.env.AI_REALTIME_MODEL = 'svc-x:qwen3-omni-flash-realtime';
    expect(await resolveRealtimeModel(pluginWith([]))).toEqual({
      llmService: 'svc-x',
      model: 'qwen3-omni-flash-realtime',
    });
  });

  it('falls back to enabled models containing realtime', async () => {
    const plugin = pluginWith([{ llmService: 'svc-a', models: ['qwen-max', 'qwen-omni-turbo-realtime'] }]);
    expect(await resolveRealtimeModel(plugin)).toEqual({ llmService: 'svc-a', model: 'qwen-omni-turbo-realtime' });
  });

  it('returns null when nothing is configured', async () => {
    expect(await resolveRealtimeModel(pluginWith([{ llmService: 'svc-a', models: ['qwen-max'] }]))).toBeNull();
  });
});

describe('realtime tickets', () => {
  it('issues one-time tickets that cannot be reused', async () => {
    process.env.AI_REALTIME_MODEL = 'svc-x:qwen3-omni-flash-realtime';
    const session = await createRealtimeTicket(pluginWith([]), 1);
    expect(session?.ticket).toBeTruthy();
    expect(session?.path).toBe('/ws/ai-realtime');
    const first = consumeRealtimeTicket(session.ticket);
    expect(first?.userId).toBe(1);
    expect(first?.apiKey).toBe('sk-test');
    // 二次消费必须失败(一次性)
    expect(consumeRealtimeTicket(session.ticket)).toBeNull();
    // 伪造票据拒绝
    expect(consumeRealtimeTicket('bogus')).toBeNull();
  });
});
