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

type NodeErrorResult = { errorCode: string; message: string; nextAction?: string; [key: string]: unknown };

// errorCode → 下一步指引（QT4）：随节点 ERROR result 落进执行记录，看板 tooltip 直接展示。
export const NEXT_ACTIONS: Record<string, string> = {
  QUICK_URL_REQUIRED: '在表单填写商品链接后重新提交',
  QUICK_DUPLICATE_URL: '同一链接已有进行中的搬运，等它完成（或在执行记录里取消）后再提交',
  QUICK_PRODUCT_REQUIRED: '检查工作流节点配置里 productId 是否指向上游抓取节点的结果',
  INVALID_URL: '检查链接是否以 http/https 开头、是否为商品详情页链接',
  OPENAPI_NOT_CONNECTED: '到「平台连接」页授权店铺后重新提交',
  OPENAPI_TOKEN_EXPIRED: '到「平台连接」页重新授权后重新提交',
  NO_RULE_AVAILABLE: '到「规则管理」启用至少一条处理规则后重新提交',
  PROCESS_FAILED: '到「信息处理」页查看任务详情，修正规则或商品数据后重新提交',
  PUBLISH_STOCK_INVALID: '到「预览编辑」补库存，或到「设置」开启缺省库存后重新提交',
  PUBLISH_STORE_NOT_SELECTED: '到「平台连接」授权目标店铺，或在表单指定目标店铺 ID',
  PUBLISH_DRAFT_UNSUPPORTED: '该平台不支持草稿发布，联系管理员确认目标平台',
  VALIDATION_REQUIRED_FIELD_MISSING: '到「预览编辑」补齐缺失字段（标题/价格/库存/图片）后重新提交',
  PRODUCT_NOT_FOUND: '商品不存在或已被删除，重新提交链接抓取',
  CAPTURE_FAILED: '稍后重试；持续失败请检查链接有效性与平台授权状态',
  PUBLISH_FAILED: '到「发布记录」查看失败原因，处理后重新提交',
};

function nodeError(errorCode: string, message: string, extra: Record<string, unknown> = {}) {
  const nextAction = NEXT_ACTIONS[errorCode];
  return {
    status: JOB_STATUS.ERROR,
    result: { errorCode, message, ...(nextAction ? { nextAction } : {}), ...extra } as NodeErrorResult,
  };
}

// 缺省库存兜底判定（QT4，纯函数供单测）：当前库存 >0 不动；否则配置了正整数缺省值就返回它，没配返回 null。
export function computeStockFallback(currentStock: unknown, configuredDefault: unknown): number | null {
  const cur = Number(currentStock) || 0;
  if (cur > 0) return null;
  const def = Math.floor(Number(configuredDefault) || 0);
  return def > 0 ? def : null;
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
    // 同 URL 防重（QT4）：同一工作流已有「进行中」执行在搬同一条链接时拦下本次，防重复建商品。
    // 只看非终态（status=0），已完成/失败的历史执行不拦；查询失败不阻断主流程。
    try {
      const execution = (processor as { execution?: { id?: number; workflowId?: number } }).execution;
      if (execution?.workflowId) {
        const running = (await this.plugin.app.db.getRepository('executions').find({
          filter: { workflowId: execution.workflowId, status: 0, id: { $ne: execution.id } },
          fields: ['id', 'context'],
          sort: ['-id'],
          limit: 20,
        })) as Array<{ get: (k: string) => unknown }>;
        const dup = running.find(
          (e) => String((e.get('context') as { data?: { sourceUrl?: string } })?.data?.sourceUrl || '').trim() === url,
        );
        if (dup) {
          return nodeError('QUICK_DUPLICATE_URL', '同一商品链接已有进行中的搬运任务', {
            duplicateExecutionId: Number(dup.get('id')),
          });
        }
      }
    } catch {
      // 防重查询失败不阻断抓取。
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
      // 商品展示字段（QT3）：供下游 manual 待办的标题模板/商品摘要引用（$jobsMapByNodeKey.<本节点key>.title 等）。
      // 查询失败不阻断流程——摘要属于体验增强，缺失时待办仍可提交。
      let display: { title?: string; image?: string; price?: number | null } = {};
      try {
        const db = this.plugin.app.db;
        const product = await db.getRepository('aiListingProducts').findOne({ filterByTk: productId });
        const mainImage = await db
          .getRepository('aiListingMediaAssets')
          .findOne({ filter: { productId, role: 'main' }, sort: ['sort', 'id'] });
        display = {
          title: String(product?.get('titleProcessed') || product?.get('titleOriginal') || `商品 #${productId}`),
          image: mainImage ? String(mainImage.get('sourceUrl') || '') : '',
          price: product?.get('priceTarget') != null ? Number(product.get('priceTarget')) : null,
        };
      } catch {
        display = { title: `商品 #${productId}` };
      }
      return {
        status: JOB_STATUS.RESOLVED,
        result: { productId, ruleId, processingJobId: r.jobId, jobNo: r.jobNo, ...display },
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
    // 缺省库存兜底（QT4）：设置了 aiListingConfig.defaultStock 且商品无库存时，precheck 前补写库存。
    // 只作用于快速搬运工作流（发布页行为不变）；未配置（null/0）时完全不动，行为与历史一致。
    let defaultStockApplied: number | null = null;
    try {
      const db = this.plugin.app.db;
      const productRepo = db.getRepository('aiListingProducts');
      const product = await productRepo.findOne({ filterByTk: productId, fields: ['id', 'stock'] });
      if (product) {
        const cfg = await db.getRepository('aiListingConfig').findOne({ filter: { scope: 'global' } });
        const fallback = computeStockFallback(product.get('stock'), cfg?.get('defaultStock'));
        if (fallback != null) {
          await productRepo.update({ filterByTk: productId, values: { stock: fallback } });
          defaultStockApplied = fallback;
        }
      }
    } catch {
      // 兜底失败不阻断，让 precheck 按原样报 PUBLISH_STOCK_INVALID。
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
            ...(defaultStockApplied != null ? { defaultStockApplied } : {}),
          },
        };
      }
      if (outcome?.result === 'skipped') {
        return { status: JOB_STATUS.RESOLVED, result: { batchId: r.batchId, skipped: true, reason: outcome.reason } };
      }
      return nodeError(outcome?.errorCode || 'PUBLISH_FAILED', '发布草稿失败，详见发布记录', {
        batchId: r.batchId,
        ...(defaultStockApplied != null ? { defaultStockApplied } : {}),
      });
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
