/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { Plugin } from '@nocobase/client';
import models from './models';
// v1 → v2 单向导入（AGENTS 规则允许）：运行中的 /admin 应用加载的是本插件 v1 入口，
// 故 jsBlock 通用 AI 能力（桥接 + kit + 前端工具）需在此 v1 client 安装，才能进入正在运行的 app.aiManager.toolsManager。
import { setupAssistantBridge } from '../client-v2/components/assistant-bridge';
import { setupJsBlockAI } from '../client-v2/ai/jsblock-ai';
import { setupMediaKit } from '../client-v2/components/MediaStudio';
import { setupWorkshopKit } from '../client-v2/components/CreativeWorkshop';

export class PluginAiListingClient extends Plugin {
  async load() {
    this.flowEngine.registerModels(models);
    // jsBlock 通用能力：window.aiListingOpenAssistant + window.__aiListingBlockKit + 注册 jsBlockApplyPatch 前端工具。
    // 全程 try/catch，失败不影响主应用（jsBlock 会回退）。
    try {
      setupAssistantBridge(this.app);
      setupJsBlockAI(this.app);
      // 预览编辑「AI 候选区」：window.__aiListingMediaKit(jsBlock 挂载 MediaStudio 面板)。
      setupMediaKit(this.app);
      // 独立「创意工坊」页：window.__aiListingWorkshopKit(admin 页面 jsBlock 挂载 CreativeWorkshop)。
      setupWorkshopKit(this.app);
    } catch {
      // 安装失败静默（不阻断插件加载）。
    }
  }
}

export default PluginAiListingClient;
