/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import type { Application } from '@nocobase/client-v2';
import { Plugin } from '@nocobase/client-v2';
import { setupAssistantBridge } from './components/assistant-bridge';
import { setupJsBlockAI } from './ai/jsblock-ai';
import { setupMediaKit } from './components/MediaStudio';
import { injectCreativeConsole } from './components/shared/inject-styles';

// 业务页面采用 NocoBase 原生页面（在 admin 框架内，通过 flow-surfaces 菜单+页面创建），不再注册脱离框架的自定义路由。
// 本插件客户端只保留：设置页注册，以及 components 下的 requestWithFriendlyError / ListingPageErrorBoundary 等工具，供后续自定义区块复用。
export class PluginAiListingClientV2 extends Plugin<any, Application> {
  async load() {
    // Creative Console 设计系统（预览编辑页视觉重设计的唯一样式真源）：幂等注入全局 <style>。
    // 规则绝大多数作用域在 .aic-scope 下，容器未挂 aic-scope 前对页面零影响；独立 try/catch，不阻断后续 kit。
    try {
      injectCreativeConsole();
    } catch {
      // 样式注入失败不影响主应用（页面回退到无 Creative Console 皮肤）。
    }

    // jsBlock → plugin-ai 原生 AI 抽屉 的桥接（在 window 暴露 aiListingOpenAssistant）。无 hook、懒加载、全程 try/catch，绝不影响主应用。
    try {
      setupAssistantBridge(this.app);
      // jsBlock 通用能力：注册 jsBlockApplyPatch 前端工具 + 安装 window.__aiListingBlockKit。
      setupJsBlockAI(this.app);
      // 预览编辑「AI 候选区」：安装 window.__aiListingMediaKit。
      setupMediaKit(this.app);
    } catch {
      // 桥接失败不影响主应用（jsBlock 可回退）。
    }

    // 设置页：/v/admin/settings/ai-listing。
    this.pluginSettingsManager.addMenuItem({
      key: 'ai-listing',
      title: this.t('AI 商品搬运工具'),
      icon: 'AppstoreOutlined',
    });
    this.pluginSettingsManager.addPageTabItem({
      menuKey: 'ai-listing',
      key: 'index',
      title: this.t('设置'),
      componentLoader: () => import('./pages/SettingsPage'),
    });
  }
}

export default PluginAiListingClientV2;
