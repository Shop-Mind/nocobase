/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { Plugin } from '@nocobase/server';
import { seedRoles, setupAcl } from './acl';
import { setupCapture } from './capture';
import { setupCaptureExtended } from './capture/extended';
import { setupDashboard } from './dashboard';
import { setupProcessing } from './processing';
import { seedRules } from './processing/rules-seed';
import { setupReview } from './review';

export class PluginAiListingServer extends Plugin {
  async afterAdd() {}

  async beforeLoad() {}

  async load() {
    // 集合通过 src/server/collections/ 目录自动加载；此处注册业务 ACL 与平台凭证字段保护。
    setupAcl(this);
    // 工作台聚合接口 aiListingDashboard:summary（Phase 3，占位 mock，结构稳定）。
    setupDashboard(this);
    // URL 抓取 MVP（Phase 4）：startUrlCapture / getProgress + adapters（Alibaba OpenAPI mock，Crawl4AI 兜底接口）。
    setupCapture(this);
    // 抓取扩展（Phase 5）：店铺 analyzeStore/startStoreCapture、关键词 searchKeyword/startKeywordCapture、批量 aiListingBatchImport parse/start。
    setupCaptureExtended(this);
    // 信息处理与规则管理（Phase 6）：aiListingProcessing runRule/retry/getJobProgress + 审计 + 媒体任务占位。
    setupProcessing(this);
    // 预览编辑与人工审核（Phase 7）：aiListingReview list/detail/saveFinal/approveDraft/rollbackReview/changeLog + AI 建议按钮。
    setupReview(this);
  }

  async install() {
    // 首次启用时幂等创建业务角色骨架（店铺管理员 / 运营 / 审核 / 只读 / AI 工具）。
    await seedRoles(this);
    // 幂等创建 Phase 6 默认处理规则（Shopee→Lazada / Amazon→Temu / 通用快速处理）。
    await seedRules(this);
  }

  async afterEnable() {}

  async afterDisable() {}

  async remove() {}
}

export default PluginAiListingServer;
