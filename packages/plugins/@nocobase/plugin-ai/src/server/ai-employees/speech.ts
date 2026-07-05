/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// 语音能力(朗读 TTS / 听写 ASR)的服务端支撑:默认模型解析 + 朗读文本清洗。
// 默认模型:env AI_DEFAULT_TTS_MODEL / AI_DEFAULT_ASR_MODEL(格式 `<llmService>:<model>` 或仅 `<model>`,
// 后者在启用服务中查找)优先;否则扫描各 LLM 服务的启用模型,取第一个能力注册中心判定为对应任务的模型。
// 未配置时前端隐藏朗读/麦克风按钮。

import { getModelCapability, ModelTask } from '../llm-providers/common/model-capability';
import type PluginAIServer from '../plugin';

export interface SpeechModelRef {
  llmService: string;
  model: string;
}

async function resolveDefaultSpeechModel(
  plugin: PluginAIServer,
  task: ModelTask,
  envName: string,
): Promise<SpeechModelRef | null> {
  const services = await plugin.aiManager.listAllEnabledModels();
  const env = process.env[envName]?.trim();
  if (env) {
    const [first, second] = env.split(':');
    if (second) return { llmService: first, model: second };
    for (const service of services) {
      if (service.enabledModels.some((m) => m.value === first)) {
        return { llmService: service.llmService, model: first };
      }
    }
    return null;
  }
  for (const service of services) {
    const hit = service.enabledModels.find((m) => getModelCapability(m.value).task === task);
    if (hit) return { llmService: service.llmService, model: hit.value };
  }
  return null;
}

export async function resolveDefaultTTSModel(plugin: PluginAIServer): Promise<SpeechModelRef | null> {
  return resolveDefaultSpeechModel(plugin, 'tts', 'AI_DEFAULT_TTS_MODEL');
}

export async function resolveDefaultASRModel(plugin: PluginAIServer): Promise<SpeechModelRef | null> {
  return resolveDefaultSpeechModel(plugin, 'asr', 'AI_DEFAULT_ASR_MODEL');
}

// 把 markdown 消息清洗为适合朗读的纯文本:去代码块/HTML 标签/图片,链接保留文字,压缩空白
export function extractSpeechText(markdown: string): string {
  return String(markdown || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#*_>`~|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
