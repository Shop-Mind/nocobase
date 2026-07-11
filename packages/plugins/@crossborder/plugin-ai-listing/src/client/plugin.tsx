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
import { injectCreativeConsole } from '../client-v2/components/shared/inject-styles';
import { registerQuickTransferWorkflowNodes } from '../client-v2/workflow/quick-transfer-nodes';

export class PluginAiListingClient extends Plugin {
  async load() {
    this.flowEngine.registerModels(models);
    // Creative Console 设计系统（预览编辑页视觉重设计的唯一样式真源）：幂等注入全局 <style>。
    // 运行中的 /admin 应用加载的是本插件 v1 入口，故此处注入才会作用于真实页面（与 kit 安装同理）。
    // 规则绝大多数作用域在 .aic-scope 下，容器未挂 aic-scope 前对页面零影响；独立 try/catch，不阻断后续。
    try {
      injectCreativeConsole();
    } catch {
      // 样式注入失败不影响主应用（页面回退到无 Creative Console 皮肤）。
    }
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
    // 快速搬运工作流节点的画布注册（节点标题/图标/输出变量；不注册画布会显示 Unknown node 占位）。
    try {
      registerQuickTransferWorkflowNodes(this.app.pm);
    } catch {
      // plugin-workflow 客户端不可用时静默跳过。
    }
  }
}

export default PluginAiListingClient;
