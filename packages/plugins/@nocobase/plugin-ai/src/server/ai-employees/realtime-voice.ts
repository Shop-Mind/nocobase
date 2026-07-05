/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// 实时语音通话(Phase 8):浏览器绝不持有 API Key,采用「HTTP 换一次性票据 → WS 中继」架构——
// aiConversations:realtimeSession 发 60s 一次性 ticket;浏览器连 /ws/ai-realtime?ticket=…;
// 中继验票后持服务端 Key 直连百炼 Realtime(OpenAI Realtime 兼容协议),双向原样透传,
// 协议语义(session.update / input_audio_buffer.append / response.audio.delta…)完全由客户端驱动,
// 中继保持协议无关,未来接其他 Realtime 服务商无需改动。

import crypto from 'node:crypto';
import { parse } from 'node:url';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import WebSocket, { WebSocketServer } from 'ws';
import { Gateway } from '@nocobase/server';
import type PluginAIServer from '../plugin';

export const REALTIME_WS_PATH = '/ws/ai-realtime';
const TICKET_TTL_MS = 60000;

interface RealtimeTicket {
  userId: number;
  model: string;
  apiKey: string;
  upstreamUrl: string;
  expiresAt: number;
}

const tickets = new Map<string, RealtimeTicket>();

export interface RealtimeModelRef {
  llmService: string;
  model: string;
}

// 实时模型解析:env AI_REALTIME_MODEL(`<llmService>:<model>` 或仅 `<model>`)优先;
// 否则扫描启用模型中名称含 realtime 的第一个。未配置时前端隐藏通话入口。
export async function resolveRealtimeModel(plugin: PluginAIServer): Promise<RealtimeModelRef | null> {
  const services = await plugin.aiManager.listAllEnabledModels();
  const env = process.env.AI_REALTIME_MODEL?.trim();
  if (env) {
    const [first, second] = env.split(':');
    if (second) return { llmService: first, model: second };
    for (const service of services) {
      if (service.enabledModels.some((m) => m.value === first)) {
        return { llmService: service.llmService, model: first };
      }
    }
    const dashscope = services.find((service) => service.provider === 'dashscope');
    return dashscope ? { llmService: dashscope.llmService, model: first } : null;
  }
  for (const service of services) {
    const hit = service.enabledModels.find((m) => /realtime/i.test(m.value));
    if (hit) return { llmService: service.llmService, model: hit.value };
  }
  return null;
}

export async function createRealtimeTicket(
  plugin: PluginAIServer,
  userId: number,
): Promise<{ ticket: string; model: string; path: string; expiresIn: number } | null> {
  const target = await resolveRealtimeModel(plugin);
  if (!target) return null;
  const service = await plugin.db.getRepository('llmServices').findOne({ filter: { name: target.llmService } });
  const apiKey = service?.options?.apiKey;
  if (!apiKey) return null;
  const upstreamUrl = `wss://dashscope.aliyuncs.com/api-ws/v1/realtime?model=${encodeURIComponent(target.model)}`;
  const ticket = crypto.randomUUID();
  tickets.set(ticket, { userId, model: target.model, apiKey, upstreamUrl, expiresAt: Date.now() + TICKET_TTL_MS });
  return { ticket, model: target.model, path: REALTIME_WS_PATH, expiresIn: TICKET_TTL_MS / 1000 };
}

// 一次性消费:取出即删除;过期票据同样拒绝
export function consumeRealtimeTicket(ticket: string): RealtimeTicket | null {
  const found = tickets.get(ticket);
  tickets.delete(ticket);
  if (!found || found.expiresAt < Date.now()) return null;
  return found;
}

const wss = new WebSocketServer({ noServer: true });
let registered = false;

export function registerRealtimeVoiceGateway(plugin: PluginAIServer) {
  if (registered) return;
  registered = true;
  Gateway.registerWsHandler((req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const { pathname, query } = parse(req.url || '', true);
    if (pathname !== REALTIME_WS_PATH) return false;
    const ticket = consumeRealtimeTicket(String(query?.ticket || ''));
    if (!ticket) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return true;
    }
    wss.handleUpgrade(req, socket, head, (client) => relay(plugin, client, ticket));
    return true;
  });
}

function relay(plugin: PluginAIServer, client: WebSocket, ticket: RealtimeTicket) {
  const logger = plugin.app.logger;
  logger?.info?.(`[ai realtime] session start user=${ticket.userId} model=${ticket.model}`);
  const upstream = new WebSocket(ticket.upstreamUrl, {
    headers: { Authorization: `bearer ${ticket.apiKey}` },
  });
  // 上游握手完成前客户端消息先缓冲(session.update 通常最先到达)
  const pending: Array<string | Buffer> = [];
  let upstreamOpen = false;

  upstream.on('open', () => {
    upstreamOpen = true;
    for (const message of pending) upstream.send(message);
    pending.length = 0;
  });
  upstream.on('message', (data, isBinary) => {
    if (client.readyState === WebSocket.OPEN) client.send(data, { binary: isBinary });
  });
  upstream.on('close', () => {
    try {
      client.close(1000);
    } catch {
      client.terminate();
    }
  });
  upstream.on('error', (error) => {
    logger?.warn?.(`[ai realtime] upstream error: ${(error as Error).message}`);
    try {
      client.close(1011, 'upstream error');
    } catch {
      client.terminate();
    }
  });

  client.on('message', (data, isBinary) => {
    const payload = isBinary ? (data as Buffer) : data.toString();
    if (upstreamOpen) upstream.send(payload);
    else pending.push(payload);
  });
  client.on('close', () => {
    logger?.info?.(`[ai realtime] session end user=${ticket.userId}`);
    try {
      upstream.close(1000);
    } catch {
      upstream.terminate();
    }
  });
  client.on('error', () => {
    try {
      upstream.close(1000);
    } catch {
      upstream.terminate();
    }
  });
}
