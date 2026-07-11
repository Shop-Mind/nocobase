/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import PluginWorkflowServer, { Instruction, JOB_STATUS } from '@nocobase/plugin-workflow';
import type { FlowNodeModel, Processor } from '@nocobase/plugin-workflow';
import type Plugin from '../plugin';
import { executeUrlCapture } from '../capture';
import { ProcessingServiceError, runProcessingForProducts } from '../processing';
import { approveProductDraft, ReviewServiceError } from '../review';
import { PublishServiceError, runPublishBatch } from '../publish';

// 快速搬运工作流节点（用户拍板的「官方工作流可视化编排」路线）：每个节点是既有服务函数的薄封装，
// 失败统一返回 JOB_STATUS.ERROR + { errorCode, message }（执行记录节点上直接可见）。
// 改图卡点/条件分支用官方 manual/condition 节点，无需在此自定义。

type NodeErrorResult = { errorCode: string; message: string; [key: string]: unknown };

function nodeError(errorCode: string, message: string, extra: Record<string, unknown> = {}) {
  return { status: JOB_STATUS.ERROR, result: { errorCode, message, ...extra } as NodeErrorResult };
}

function traceOf(processor: Processor): string {
  return `wf-${(processor as { execution?: { id?: number | string } }).execution?.id ?? 'exec'}`;
}

// ① 抓取：URL → 商品草稿（status=captured）。输出 { productId, captureTaskId, taskNo }。
export class ListingCaptureInstruction extends Instruction {
  constructor(
    workflow: PluginWorkflowServer,
    private readonly plugin: Plugin,
  ) {
    super(workflow);
  }

  async run(node: FlowNodeModel, input: unknown, processor: Processor) {
    const config = processor.getParsedValue(node.config, node.id) as { url?: string; sourcePlatform?: string };
    const url = String(config?.url || '').trim();
    if (!url) {
      return nodeError('QUICK_URL_REQUIRED', '缺少商品链接：请在触发表单里填写 sourceUrl');
    }
    const r = await executeUrlCapture(this.plugin, {
      url,
      sourcePlatform: config?.sourcePlatform,
      options: {},
      traceId: traceOf(processor),
    });
    if (!r.ok) {
      return nodeError(r.code || 'CAPTURE_FAILED', r.message || '抓取失败', {
        retryable: r.retryable,
        captureTaskId: r.taskId,
      });
    }
    return {
      status: JOB_STATUS.RESOLVED,
      result: { productId: Number(r.productId), captureTaskId: r.taskId, taskNo: r.taskNo },
    };
  }
}

// ② 信息处理：按规则跑规则引擎（titleProcessed/priceTarget/ladderTarget…，status=processed）。
// ruleId 兜底链：节点配置 → aiListingConfig.defaultRuleId → 第一条启用规则。
export class ListingProcessInstruction extends Instruction {
  constructor(
    workflow: PluginWorkflowServer,
    private readonly plugin: Plugin,
  ) {
    super(workflow);
  }

  private async resolveRuleId(configured: unknown): Promise<number | null> {
    const direct = Number(configured);
    if (direct) return direct;
    const db = this.plugin.app.db;
    try {
      const cfg = await db.getRepository('aiListingConfig').findOne({ filter: { scope: 'global' } });
      const fromCfg = Number(cfg?.get('defaultRuleId'));
      if (fromCfg) return fromCfg;
    } catch {
      // 配置表不存在/无行时静默走下一级兜底。
    }
    const rule = await db.getRepository('aiListingRules').findOne({ filter: { enabled: true }, sort: ['id'] });
    return rule ? Number(rule.get('id')) : null;
  }

  async run(node: FlowNodeModel, input: unknown, processor: Processor) {
    const config = processor.getParsedValue(node.config, node.id) as { productId?: unknown; ruleId?: unknown };
    const productId = Number(config?.productId);
    if (!productId) {
      return nodeError('QUICK_PRODUCT_REQUIRED', '缺少商品 ID：请把上游抓取节点的 productId 传入本节点配置');
    }
    const ruleId = await this.resolveRuleId(config?.ruleId);
    if (!ruleId) {
      return nodeError('NO_RULE_AVAILABLE', '没有可用的处理规则：请先在「规则管理」启用至少一条规则');
    }
    try {
      const r = await runProcessingForProducts(this.plugin, {
        productIds: [productId],
        ruleId,
        traceId: traceOf(processor),
      });
      if (r.failed > 0) {
        const outcome = r.outcomes?.[0];
        return nodeError(outcome?.errorCode || 'PROCESS_FAILED', outcome?.errorMessage || '信息处理失败', {
          processingJobId: r.jobId,
        });
      }
      return {
        status: JOB_STATUS.RESOLVED,
        result: { productId, ruleId, processingJobId: r.jobId, jobNo: r.jobNo },
      };
    } catch (e) {
      if (e instanceof ProcessingServiceError) return nodeError(e.code, e.message, { retryable: e.retryable });
      return nodeError('PROCESS_FAILED', (e as Error)?.message || '信息处理失败');
    }
  }
}

// ③ 提审锁定：approveDraft 服务化（titleFinal 自动兜底原标题）。人工卡点（manual 节点）在本节点上游，
// 用户提交待办即表示确认继续，故此处审计 actorType=system + actorId=wf-quick-transfer。
export class ListingApproveInstruction extends Instruction {
  constructor(
    workflow: PluginWorkflowServer,
    private readonly plugin: Plugin,
  ) {
    super(workflow);
  }

  async run(node: FlowNodeModel, input: unknown, processor: Processor) {
    const config = processor.getParsedValue(node.config, node.id) as { productId?: unknown };
    const productId = Number(config?.productId);
    if (!productId) {
      return nodeError('QUICK_PRODUCT_REQUIRED', '缺少商品 ID：请把上游抓取节点的 productId 传入本节点配置');
    }
    try {
      const r = await approveProductDraft(this.plugin, {
        productId,
        actor: { type: 'system', id: 'wf-quick-transfer' },
        traceId: traceOf(processor),
      });
      return {
        status: JOB_STATUS.RESOLVED,
        result: { productId, status: r.status, already: r.already, titleAutoFilled: Boolean(r.titleAutoFilled) },
      };
    } catch (e) {
      if (e instanceof ReviewServiceError) return nodeError(e.code, e.message, { retryable: e.retryable });
      return nodeError('APPROVE_FAILED', (e as Error)?.message || '提审失败');
    }
  }
}

// ④ 发布草稿：strategy 固定 'draft'（只进卖家后台草稿箱，绝不直接上架）。幂等键 = 执行 id，节点重跑不重复建草稿。
// 店铺兜底链：节点配置 → isDefault 店铺 → 第一家已授权店铺。输出 { draftUrl, targetProductId, batchId }。
export class ListingPublishDraftInstruction extends Instruction {
  constructor(
    workflow: PluginWorkflowServer,
    private readonly plugin: Plugin,
  ) {
    super(workflow);
  }

  private async resolveStoreId(configured: unknown, platform: string): Promise<number | null> {
    const direct = Number(configured);
    if (direct) return direct;
    const rows = await this.plugin.app.db
      .getRepository('aiListingPlatformAccounts')
      .find({ filter: { platform, authStatus: 'connected' } });
    const preferred =
      rows.find((r: { get: (k: string) => unknown }) =>
        Boolean((r.get('settings') as { isDefault?: boolean })?.isDefault),
      ) || rows[0];
    return preferred ? Number(preferred.get('id')) : null;
  }

  async run(node: FlowNodeModel, input: unknown, processor: Processor) {
    const config = processor.getParsedValue(node.config, node.id) as {
      productId?: unknown;
      targetStoreId?: unknown;
      targetPlatform?: string;
    };
    const productId = Number(config?.productId);
    if (!productId) {
      return nodeError('QUICK_PRODUCT_REQUIRED', '缺少商品 ID：请把上游抓取节点的 productId 传入本节点配置');
    }
    const targetPlatform = String(config?.targetPlatform || 'Alibaba.com');
    const targetStoreId = await this.resolveStoreId(config?.targetStoreId, targetPlatform);
    if (!targetStoreId) {
      return nodeError(
        'PUBLISH_STORE_NOT_SELECTED',
        `平台「${targetPlatform}」没有已授权的店铺，请先到「平台连接」授权`,
      );
    }
    try {
      const r = await runPublishBatch(this.plugin, {
        productIds: [productId],
        config: { targetPlatform, targetStoreId, strategy: 'draft' },
        idempotencyKey: `wf-exec-${(processor as { execution?: { id?: number | string } }).execution?.id ?? node.id}`,
        traceId: traceOf(processor),
      });
      if (r.idempotent) {
        return { status: JOB_STATUS.RESOLVED, result: { idempotent: true, batchId: r.batchId, status: r.status } };
      }
      const outcome = (r.outcomes || [])[0] as
        | {
            result?: string;
            errorCode?: string;
            targetProductId?: string;
            targetUrl?: string;
            notes?: unknown;
            reason?: string;
          }
        | undefined;
      if (outcome?.result === 'success') {
        return {
          status: JOB_STATUS.RESOLVED,
          result: {
            batchId: r.batchId,
            draft: true,
            targetProductId: outcome.targetProductId,
            draftUrl: outcome.targetUrl,
            notes: outcome.notes,
          },
        };
      }
      if (outcome?.result === 'skipped') {
        return { status: JOB_STATUS.RESOLVED, result: { batchId: r.batchId, skipped: true, reason: outcome.reason } };
      }
      return nodeError(outcome?.errorCode || 'PUBLISH_FAILED', '发布草稿失败，详见发布记录', { batchId: r.batchId });
    } catch (e) {
      if (e instanceof PublishServiceError) return nodeError(e.code, e.message, { retryable: e.retryable });
      return nodeError('PUBLISH_FAILED', (e as Error)?.message || '发布草稿失败');
    }
  }
}

// 注册（plugin.load() 里调用，plugin-ai 同款时机）。plugin-workflow 未启用时安全跳过。
export function setupQuickTransferWorkflowNodes(plugin: Plugin): void {
  const workflow = plugin.app.pm.get('workflow') as PluginWorkflowServer | undefined;
  if (!workflow || typeof workflow.registerInstruction !== 'function') {
    plugin.app.logger?.warn?.('[ai-listing] plugin-workflow 不可用，快速搬运工作流节点未注册');
    return;
  }
  workflow.registerInstruction('listingCapture', new ListingCaptureInstruction(workflow, plugin));
  workflow.registerInstruction('listingProcess', new ListingProcessInstruction(workflow, plugin));
  workflow.registerInstruction('listingApprove', new ListingApproveInstruction(workflow, plugin));
  workflow.registerInstruction('listingPublishDraft', new ListingPublishDraftInstruction(workflow, plugin));
  plugin.app.logger?.info?.(
    '[ai-listing] 已注册快速搬运工作流节点：listingCapture/listingProcess/listingApprove/listingPublishDraft',
  );
}
