/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// 媒体生成 Provider 抽象(Media Studio / 多模态抽屉共用)。设计依据 docs/media-studio-design.md §5:
// 生成服务商的 Key 复用 plugin-ai「LLM 服务」(llmServices) 配置,本层只说"任务式生成 API"的协议
// (提交→轮询→结果 URL),不持有任何业务语义。若未来 plugin-ai 官方支持图像生成服务类型,替换本接口实现即可。

export interface MediaGenInput {
  prompt: string;
  // 提供源图 URL 时为"改图/图生视频",否则为"文生图/文生视频"
  sourceImageUrl?: string;
  // 生成参数(如视频 resolution/duration,透传给服务商 parameters);为空则用服务商默认
  parameters?: Record<string, unknown>;
}

export interface MediaSubmitResult {
  providerTaskId: string;
  model: string;
}

export interface MediaTaskResult {
  status: 'running' | 'success' | 'failed';
  resultUrl?: string;
  errorMessage?: string;
}

export interface MediaProvider {
  readonly name: string;
  submitImage(input: MediaGenInput): Promise<MediaSubmitResult>;
  submitVideo(input: MediaGenInput): Promise<MediaSubmitResult>;
  pollTask(providerTaskId: string): Promise<MediaTaskResult>;
}
