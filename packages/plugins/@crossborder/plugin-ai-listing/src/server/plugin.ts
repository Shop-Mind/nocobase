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
import { setupPublish } from './publish';
import { setupLibrary } from './library';
import { setupHistory } from './history';
import { seedPlatformAccounts, setupSettings } from './settings';
import { setupAssistant } from './assistant';
import { setupOpenApi } from './openapi';
import { setupMedia } from './media/actions';
import { seedStyleTemplates } from './media/style-templates-seed';
import { setupQuickTransferWorkflowNodes } from './workflow/quick-transfer-nodes';

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
    // 发布前校验与模拟发布（Phase 8）：aiListingPublish precheck/publish(幂等)/retryFailed + mock 发布 adapter（真实发布只留接口不启用）。
    setupPublish(this);
    // 商品库（Phase 9）：aiListingLibrary stats/list/export，主数据台账 + 发布链接聚合。
    setupLibrary(this);
    // 发布记录（Phase 9）：aiListingHistory stats/list/export，发布结果历史 + 失败原因；重试复用 aiListingPublish:retryFailed。
    setupHistory(this);
    // 设置（Phase 9）：aiListingSettings overview(平台状态脱敏 + OpenAPI/Crawl4AI 提示)/saveConfig。
    setupSettings(this);
    // AI 员工服务层（Phase 10 v2）：aiListingAssistant roster/ask（persona+只读上下文→aiManager LLM，mock 兜底，审计，Key 脱敏）。
    setupAssistant(this);
    // 真接入 OpenAPI（Phase C）：OAuth 授权闭环。oauthStart/oauthCallback 浏览器直达端点 + status/disconnect 受控 action。
    setupOpenApi(this);
    // 图片编辑闭环（Phase 0）：aiListingMedia candidates/generate/jobStatus/adopt/discard——AI 只产候选、用户显式采纳。
    setupMedia(this);
    // 快速搬运工作流节点（listingCapture/Process/Approve/PublishDraft）：官方工作流可视化编排路线；
    // plugin-workflow 不可用时安全跳过，不阻断插件加载。
    try {
      setupQuickTransferWorkflowNodes(this);
    } catch (e) {
      this.app.logger.warn(`[ai-listing] quick transfer workflow nodes skipped: ${(e as Error)?.message}`);
    }
    // 创意工坊内置风格模版（W2）：启动后按 title+category 幂等补种（只补缺，不覆盖已有行），install/upgrade 之外的老库也能拿到。
    this.app.on('afterStart', async () => {
      try {
        await seedStyleTemplates(this.app);
      } catch (e) {
        this.app.logger.warn(`[ai-listing] style templates seeding skipped: ${(e as Error)?.message}`);
      }
    });
  }

  async install() {
    // 首次启用时幂等创建业务角色骨架（店铺管理员 / 运营 / 审核 / 只读 / AI 工具）。
    await seedRoles(this);
    // 幂等创建 Phase 6 默认处理规则（Shopee→Lazada / Amazon→Temu / 通用快速处理）。
    await seedRules(this);
    // 幂等播种平台账号示例（Phase 9 设置页，仅授权状态，不含明文密钥）。
    await seedPlatformAccounts(this);
  }

  async afterEnable() {}

  async afterDisable() {}

  async remove() {}
}

export default PluginAiListingServer;
