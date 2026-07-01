/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import type Plugin from '../plugin';

// 服务端调用 plugin-ai 已配置的 LLM（DeepSeek 等）的统一入口。
// 链路（已查证）：app.aiManager.resolveModel() 自动选首个已启用模型 → getLLMService({llmService,model}) 取 provider
//   → provider.invoke({messages}) 返回 LangChain AIMessage（content 为文本或内容块）。
// 设计原则：① 只读生成，不写任何业务库；② 无模型 / 调用失败 / 超时 → 返回 null，由调用方走确定性 mock 兜底（绝不报错给前端）；
// ③ 模型 API Key 仅在服务端 llmServices.options 内，本函数出入参与日志绝不含 Key。

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// 把 LangChain 返回的 content（string | 内容块数组）规整成纯文本。
function contentToText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((c) => (typeof c === 'string' ? c : (c as { text?: string })?.text ?? ''))
      .join('')
      .trim();
  }
  return content != null ? String(content) : '';
}

interface AiManagerLike {
  resolveModel: (model?: unknown) => Promise<{ llmService?: string; model?: string } | undefined>;
  getLLMService: (options: {
    llmService: string;
    model: string;
  }) => Promise<{ provider?: { invoke: (ctx: { messages: LlmMessage[] }) => Promise<{ content?: unknown }> } }>;
}

// 取真正的 AIManager（带 resolveModel/getLLMService）。注意：`app.aiManager` 存在但**不含 resolveModel**（是另一对象），
// 真正可解析模型的在 plugin-ai 插件实例 `pm.get('ai').aiManager` 上。故按「是否有 resolveModel 方法」择一，prefer 插件实例。
function getAiManager(plugin: Plugin): AiManagerLike | undefined {
  const app = plugin.app as unknown as {
    aiManager?: Partial<AiManagerLike>;
    pm?: { get?: (name: string) => { aiManager?: Partial<AiManagerLike> } | undefined };
  };
  const candidates = [app.pm?.get?.('ai')?.aiManager, app.aiManager];
  return candidates.find((m): m is AiManagerLike => typeof m?.resolveModel === 'function');
}

// 调用已配置模型，返回纯文本；无模型 / 失败 → null（调用方走 mock）。timeoutMs 防止挂死阻塞 action。
export async function callModel(plugin: Plugin, messages: LlmMessage[], timeoutMs = 20000): Promise<string | null> {
  const app = plugin.app as unknown as { logger?: { warn?: (msg: string, meta?: unknown) => void } };
  const aiManager = getAiManager(plugin);
  if (!aiManager) return null;
  try {
    const resolved = await aiManager.resolveModel();
    if (!resolved?.llmService || !resolved?.model) return null;
    const { provider } = await aiManager.getLLMService({ llmService: resolved.llmService, model: resolved.model });
    if (!provider?.invoke) return null;
    const invocation = provider.invoke({ messages });
    const timeout = new Promise<never>((_resolve, reject) =>
      setTimeout(() => reject(new Error('LLM_TIMEOUT')), timeoutMs),
    );
    const res = await Promise.race([invocation, timeout]);
    const text = contentToText(res?.content);
    return text.trim() ? text.trim() : null;
  } catch (e) {
    app.logger?.warn?.('[ai-listing] callModel failed, fallback to mock', { message: (e as Error)?.message });
    return null;
  }
}

// 解析模型返回的 JSON（容忍 ```json 代码块围栏与前后噪声）。失败 → null。
export function parseJsonObject(text: string | null): Record<string, unknown> | null {
  if (!text) return null;
  let s = text.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    const obj = JSON.parse(s.slice(start, end + 1));
    return obj && typeof obj === 'object' && !Array.isArray(obj) ? (obj as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
