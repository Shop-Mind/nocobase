/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// 能力驱动 UI 的统一入口:当前选中模型的能力(读服务端能力注册中心随 listAllEnabledModels 下发的数据)。
// 消费组件需要是 observer(repository.llmServices 为 flow-engine observable)。

import { useEffect, useMemo } from 'react';
import { useAIConfigRepository } from '../../../repositories/hooks/useAIConfigRepository';
import type { LLMServiceItem, ModelCapabilityInfo } from '../../../repositories/AIConfigRepository';
import { useChatBoxStore, type ModelRef } from '../stores/chat-box';

export function findModelCapability(services: LLMServiceItem[], model?: ModelRef | null): ModelCapabilityInfo | null {
  if (!model) return null;
  const service = services.find((item) => item.llmService === model.llmService);
  return service?.enabledModels.find((item) => item.value === model.model)?.capability ?? null;
}

export function useCurrentModelCapability(): ModelCapabilityInfo | null {
  const repository = useAIConfigRepository();
  const model = useChatBoxStore.use.model();
  useEffect(() => {
    repository.getLLMServices().catch(() => {});
  }, [repository]);
  return useMemo(() => findModelCapability(repository.llmServices, model), [repository.llmServices, model]);
}

// 模型能力徽标:👁 看图(对话) / 🎤 听音 / 🎨 生图 / 🎬 生视频 / 🔊 语音输出
export function capabilityBadges(capability?: ModelCapabilityInfo | null): string {
  if (!capability) return '';
  const badges: string[] = [];
  if (capability.task === 'image_gen') badges.push('🎨');
  if (capability.task === 'video_gen') badges.push('🎬');
  if (capability.task === 'chat' && capability.input?.includes('image')) badges.push('👁');
  if (capability.input?.includes('audio')) badges.push('🎤');
  if (capability.task === 'tts' || (capability.task === 'chat' && capability.output?.includes('audio'))) {
    badges.push('🔊');
  }
  return badges.join(' ');
}
