/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import type { Context, Next } from '@nocobase/actions';
import type Plugin from '../plugin';
import { fail } from '../capture/shared';
import { writeAudit, type AuditEntry } from './audit';
import {
  applyRule,
  ProcessingValidationError,
  STAGES,
  type MappingRow,
  type ProductInput,
  type RuleConfig,
} from './engine';

// 处理批次可处理的商品入口状态：仅「已抓取」或「处理失败（重试）」可进入处理。
const PROCESSABLE_STATUS = new Set(['captured', 'process_failed']);

// 阶段中文标签，用于 job.currentStage 与进度展示。
const STAGE_LABELS: Record<string, string> = {
  [STAGES.attrMapping]: '参数替换',
  [STAGES.rewriteI18n]: '文案改写/本地化',
  [STAGES.priceConvert]: '价格转换',
  [STAGES.mediaPlan]: '媒体任务',
  [STAGES.archive]: '信息存档',
};

interface ProcessRepos {
  Jobs: any;
  Steps: any;
  Products: any;
  Skus: any;
  Media: any;
  MediaJobs: any;
  AuditLogs: any;
  Rules: any;
}

function getProcessRepos(db: any): ProcessRepos {
  return {
    Jobs: db.getRepository('aiListingProcessingJobs'),
    Steps: db.getRepository('aiListingTaskSteps'),
    Products: db.getRepository('aiListingProducts'),
    Skus: db.getRepository('aiListingSkus'),
    Media: db.getRepository('aiListingMediaAssets'),
    MediaJobs: db.getRepository('aiListingMediaJobs'),
    AuditLogs: db.getRepository('aiListingAuditLogs'),
    Rules: db.getRepository('aiListingRules'),
  };
}

interface ItemOutcome {
  productId: number;
  ok: boolean;
  errorCode?: string;
  errorMessage?: string;
  retryable?: boolean;
  stage?: string;
  changedFields?: string[];
  mediaJobs?: number;
}

// 处理单个商品：置 processing → 跑引擎各阶段 → 写建议字段 → 建媒体任务占位 → 审计 → 置 processed。
// 任何阶段失败：置 process_failed，写 failed 任务步骤（errorCode/traceId/retryable），返回失败结果（不抛出，保证批次隔离）。
async function processOneProduct(
  repos: ProcessRepos,
  jobId: number,
  productId: number,
  rule: { id: number; name: string; config: RuleConfig; mappingRows: MappingRow[] },
  traceId: string,
): Promise<ItemOutcome> {
  const t = Date.now();
  const product = await repos.Products.findOne({ filterByTk: productId });
  if (!product) {
    await repos.Steps.create({
      values: {
        taskType: 'process',
        taskId: jobId,
        productId,
        stepName: 'process_item',
        status: 'failed',
        traceId,
        errorCode: 'PRODUCT_NOT_FOUND',
        errorMessage: `商品不存在（id=${productId}）`,
        retryable: false,
        inputSnapshot: { productId },
        durationMs: Date.now() - t,
      },
    });
    return { productId, ok: false, errorCode: 'PRODUCT_NOT_FOUND', errorMessage: '商品不存在', retryable: false };
  }

  const status = product.get('status');
  if (!PROCESSABLE_STATUS.has(status)) {
    await repos.Steps.create({
      values: {
        taskType: 'process',
        taskId: jobId,
        productId,
        stepName: 'process_item',
        status: 'failed',
        traceId,
        errorCode: 'PRODUCT_NOT_PROCESSABLE',
        errorMessage: `商品当前状态「${status}」不可处理，仅 captured/process_failed 可处理`,
        retryable: false,
        inputSnapshot: { productId, status },
        durationMs: Date.now() - t,
      },
    });
    return {
      productId,
      ok: false,
      errorCode: 'PRODUCT_NOT_PROCESSABLE',
      errorMessage: `商品状态 ${status} 不可处理`,
      retryable: false,
    };
  }

  // 进入处理中。
  await repos.Products.update({ filterByTk: productId, values: { status: 'processing' } });

  const skuRows = await repos.Skus.find({ filter: { productId }, sort: ['id'] });
  const input: ProductInput = {
    id: productId,
    titleOriginal: product.get('titleOriginal'),
    descriptionOriginal: product.get('descriptionOriginal'),
    priceOriginal: product.get('priceOriginal'),
    currencyOriginal: product.get('currencyOriginal'),
    attributesOriginal: product.get('attributesOriginal'),
    skus: skuRows.map((s: any) => ({
      id: s.get('id'),
      priceOriginal: s.get('priceOriginal'),
      priceTarget: s.get('priceTarget'),
    })),
    // 源站采购阶梯：抓取时随 SKU 落库（各 SKU 通常共享同一 wholesale 阶梯），取第一个非空的。
    ladderOriginal: skuRows.map((s: any) => s.get('ladderPrice')).find((l: unknown) => Array.isArray(l) && l.length),
  };

  try {
    const result = applyRule(input, rule.config || {}, rule.mappingRows || [], rule.name);

    // 写入建议字段 + 目标字段（绝不写 *Final）。
    await repos.Products.update({ filterByTk: productId, values: result.patch });

    // SKU 逐条目标价：与商品价同一规则换算（发布草稿可走 SKU 规格价）。
    for (const sp of result.skuPatches) {
      await repos.Skus.update({ filterByTk: sp.id, values: { priceTarget: sp.priceTarget } });
    }

    // 审计：每个字段变更一条（AI 建议 actorType=ai_employee，价格 actorType=system）。
    const audits: AuditEntry[] = result.changes.map((c) => ({
      actorType: c.actorType,
      actorId: c.actorId,
      action: `process.${c.stage}`,
      resourceType: 'product',
      resourceId: productId,
      fieldName: c.field,
      oldValue: c.oldValue,
      newValue: c.newValue,
      reason: c.reason,
      traceId,
    }));

    // 媒体处理任务（白底图/去水印等）：原图/视频已在抓取阶段真实下载落存储，这里按规则登记后续图像处理任务。
    // 白底图/去水印本身待接入图像服务，先建 pending 任务（在已下载的原图上执行）。为每个图片资产建对应类型任务。
    const assets = await repos.Media.find({ filter: { productId, assetType: 'image' }, sort: ['sort'] });
    let mediaJobCount = 0;
    for (const spec of result.mediaJobSpecs) {
      const targets = assets.length ? assets : [null];
      for (const asset of targets) {
        await repos.MediaJobs.create({
          values: {
            productId,
            assetId: asset ? asset.get('id') : null,
            jobType: spec.jobType,
            status: 'pending',
            traceId,
            metadata: { placeholder: true, note: '图像处理占位（在已下载原图上执行），待接入白底图/去水印服务' },
          },
        });
        mediaJobCount++;
      }
    }
    if (result.mediaJobSpecs.length) {
      audits.push({
        actorType: 'system',
        actorId: 'media-runner',
        action: `process.${STAGES.mediaPlan}`,
        resourceType: 'product',
        resourceId: productId,
        fieldName: 'mediaJobs',
        oldValue: null,
        newValue: { created: mediaJobCount, types: result.mediaJobSpecs.map((s) => s.jobType) },
        reason: '创建媒体处理占位任务',
        traceId,
      });
    }

    await writeAudit(repos.AuditLogs, audits);

    // 信息存档：置已处理。
    await repos.Products.update({ filterByTk: productId, values: { status: 'processed' } });

    const changedFields = result.changes.map((c) => c.field);
    await repos.Steps.create({
      values: {
        taskType: 'process',
        taskId: jobId,
        productId,
        stepName: 'process_item',
        status: 'success',
        traceId,
        inputSnapshot: { productId, ruleId: rule.id },
        outputSnapshot: { changedFields, stages: Object.values(STAGES), mediaJobs: mediaJobCount },
        durationMs: Date.now() - t,
      },
    });
    return { productId, ok: true, changedFields, mediaJobs: mediaJobCount };
  } catch (e) {
    const isVal = e instanceof ProcessingValidationError;
    const errorCode = isVal ? (e as ProcessingValidationError).code : 'PROCESS_FAILED';
    const retryable = isVal ? (e as ProcessingValidationError).retryable : true;
    const message = (e as Error)?.message || '处理失败';
    const field = isVal ? (e as ProcessingValidationError).field : undefined;
    await repos.Products.update({ filterByTk: productId, values: { status: 'process_failed' } });
    await repos.Steps.create({
      values: {
        taskType: 'process',
        taskId: jobId,
        productId,
        stepName: 'process_item',
        status: 'failed',
        traceId,
        errorCode,
        errorMessage: message,
        retryable,
        inputSnapshot: { productId, ruleId: rule.id, field },
        durationMs: Date.now() - t,
      },
    });
    return { productId, ok: false, errorCode, errorMessage: message, retryable, stage: field };
  }
}

// 跑一个处理批次：逐条处理 + 实时更新 job 进度/统计，最后汇总终态。
async function runJob(
  repos: ProcessRepos,
  jobId: number,
  productIds: number[],
  rule: { id: number; name: string; config: RuleConfig; mappingRows: MappingRow[] },
  traceId: string,
) {
  let success = 0;
  let failed = 0;
  const outcomes: ItemOutcome[] = [];
  for (let i = 0; i < productIds.length; i++) {
    await repos.Jobs.update({
      filterByTk: jobId,
      values: { currentStage: `处理中（${i + 1}/${productIds.length}）` },
    });
    const outcome = await processOneProduct(repos, jobId, productIds[i], rule, traceId);
    outcomes.push(outcome);
    if (outcome.ok) success++;
    else failed++;
    await repos.Jobs.update({
      filterByTk: jobId,
      values: { successCount: success, failedCount: failed, progress: Math.round(((i + 1) / productIds.length) * 100) },
    });
  }
  const status = failed === 0 ? 'success' : success === 0 ? 'failed' : 'partial_failed';
  const logs = Object.entries(STAGE_LABELS).map(([stage, label]) => ({ stage, label, status: 'done' }));
  // 终态 update：把 status 置为终态会命中 wf_product_processing 的触发条件（仅终态触发，进度更新不触发）。
  await repos.Jobs.update({
    filterByTk: jobId,
    values: { status, progress: 100, currentStage: '信息存档', logs, successCount: success, failedCount: failed },
  });
  return { total: productIds.length, success, failed, status, outcomes };
}

export function setupProcessing(plugin: Plugin): void {
  const { app } = plugin;
  const db = app.db;

  app.resourceManager.define({
    name: 'aiListingProcessing',
    actions: {
      // 批量处理：对选中商品按规则执行处理流程。显式创建任务明细（不依赖 collection event 批量触发，PRD §7.6）。
      runRule: async (ctx: Context, next: Next) => {
        const traceId = ctx.reqId || `srv-${Date.now()}`;
        const values = (ctx.action?.params?.values || {}) as { productIds?: number[]; ruleId?: number };
        const productIds = Array.isArray(values.productIds)
          ? values.productIds.map(Number).filter((n) => !Number.isNaN(n))
          : [];
        const ruleId = Number(values.ruleId);

        if (!productIds.length) {
          ctx.status = 400;
          ctx.body = fail('NO_PRODUCTS_SELECTED', '请先选择要处理的商品', false, traceId);
          return await next();
        }
        if (!ruleId || Number.isNaN(ruleId)) {
          ctx.status = 400;
          ctx.body = fail('NO_RULE_SELECTED', '请选择一个处理规则', false, traceId);
          return await next();
        }

        const repos = getProcessRepos(db);
        const ruleRow = await repos.Rules.findOne({ filterByTk: ruleId });
        if (!ruleRow) {
          ctx.status = 404;
          ctx.body = fail('RULE_NOT_FOUND', '处理规则不存在', false, traceId);
          return await next();
        }
        if (!ruleRow.get('enabled')) {
          ctx.status = 400;
          ctx.body = fail('RULE_DISABLED', '该规则已禁用，请先启用或选择其它规则', true, traceId);
          return await next();
        }
        const rule = {
          id: ruleRow.get('id'),
          name: ruleRow.get('name'),
          config: (ruleRow.get('config') || {}) as RuleConfig,
          mappingRows: (ruleRow.get('mappingRows') || []) as MappingRow[],
        };

        const job = await repos.Jobs.create({
          values: {
            ruleId,
            productIds,
            status: 'running',
            currentStage: '参数替换',
            totalCount: productIds.length,
            successCount: 0,
            failedCount: 0,
            progress: 0,
            traceId,
          },
        });
        const jobId = job.get('id');

        const stats = await runJob(repos, jobId, productIds, rule, traceId);
        ctx.logger?.info(`[ai-listing][${traceId}] processing job ${jobId} done`, {
          jobId,
          ...{ total: stats.total, success: stats.success, failed: stats.failed, status: stats.status },
        });
        ctx.body = {
          ok: true,
          data: { jobId, jobNo: job.get('jobNo'), ...stats },
          warnings: stats.failed ? [`${stats.failed} 个商品处理失败，可在进度明细中重试`] : [],
          errors: [],
          traceId,
        };
        await next();
      },

      // 重试：对某个处理批次中失败（process_failed）的商品重新处理，复用该批次的规则。
      retry: async (ctx: Context, next: Next) => {
        const traceId = ctx.reqId || `srv-${Date.now()}`;
        const values = (ctx.action?.params?.values || {}) as { jobId?: number };
        const jobId = Number(values.jobId);
        if (!jobId || Number.isNaN(jobId)) {
          ctx.status = 400;
          ctx.body = fail('NO_JOB_ID', '缺少处理批次 jobId', false, traceId);
          return await next();
        }
        const repos = getProcessRepos(db);
        const job = await repos.Jobs.findOne({ filterByTk: jobId });
        if (!job) {
          ctx.status = 404;
          ctx.body = fail('JOB_NOT_FOUND', '处理批次不存在', false, traceId);
          return await next();
        }
        const ruleRow = await repos.Rules.findOne({ filterByTk: job.get('ruleId') });
        if (!ruleRow) {
          ctx.status = 404;
          ctx.body = fail('RULE_NOT_FOUND', '处理批次对应规则不存在', false, traceId);
          return await next();
        }
        const candidateIds = (job.get('productIds') || []) as number[];
        // 只重试当前仍处于 process_failed 的商品。
        const failedProducts = await repos.Products.find({
          filter: { id: { $in: candidateIds }, status: 'process_failed' },
        });
        const retryIds = failedProducts.map((p: any) => p.get('id'));
        if (!retryIds.length) {
          ctx.body = {
            ok: true,
            data: { jobId, retried: 0, message: '没有需要重试的失败商品' },
            warnings: [],
            errors: [],
            traceId,
          };
          return await next();
        }
        const rule = {
          id: ruleRow.get('id'),
          name: ruleRow.get('name'),
          config: (ruleRow.get('config') || {}) as RuleConfig,
          mappingRows: (ruleRow.get('mappingRows') || []) as MappingRow[],
        };
        await repos.Jobs.update({ filterByTk: jobId, values: { status: 'running', progress: 0 } });
        const stats = await runJob(repos, jobId, retryIds, rule, traceId);
        ctx.body = {
          ok: true,
          data: { jobId, jobNo: job.get('jobNo'), retried: retryIds.length, ...stats },
          warnings: stats.failed ? [`仍有 ${stats.failed} 个商品处理失败`] : [],
          errors: [],
          traceId,
        };
        await next();
      },

      // 查询处理批次进度：返回 job + 处理任务步骤明细（供进度条与失败重试入口）。
      getJobProgress: async (ctx: Context, next: Next) => {
        const traceId = ctx.reqId || `srv-${Date.now()}`;
        const params = ctx.action?.params || {};
        const jobId = (params.values && params.values.jobId) || params.jobId || params.filterByTk;
        if (!jobId) {
          ctx.status = 400;
          ctx.body = fail('NO_JOB_ID', '缺少 jobId', false, traceId);
          return await next();
        }
        const repos = getProcessRepos(db);
        const job = await repos.Jobs.findOne({ filterByTk: jobId, appends: ['rule'] });
        if (!job) {
          ctx.status = 404;
          ctx.body = fail('JOB_NOT_FOUND', '处理批次不存在', false, traceId);
          return await next();
        }
        const steps = await repos.Steps.find({ filter: { taskType: 'process', taskId: jobId }, sort: ['id'] });
        ctx.body = { ok: true, data: { job, steps }, warnings: [], errors: [], traceId };
        await next();
      },

      // 信息处理页的规则卡片数据：仅返回启用的处理规则（统一信封，供 jsBlock 用一致的 ctx.request 路径）。
      listRules: async (ctx: Context, next: Next) => {
        const traceId = ctx.reqId || `srv-${Date.now()}`;
        const Rules = db.getRepository('aiListingRules');
        const rows = await Rules.find({ filter: { enabled: true }, sort: ['id'] });
        const rules = rows.map((r: any) => ({
          id: r.get('id'),
          ruleCode: r.get('ruleCode'),
          name: r.get('name'),
          ruleType: r.get('ruleType'),
          sourcePlatform: r.get('sourcePlatform'),
          targetPlatform: r.get('targetPlatform'),
          config: r.get('config') || {},
        }));
        ctx.body = { ok: true, data: { rules }, warnings: [], errors: [], traceId };
        await next();
      },

      // 信息处理页的待处理商品表：仅返回 captured / process_failed 状态商品（待处理池）。
      pendingProducts: async (ctx: Context, next: Next) => {
        const traceId = ctx.reqId || `srv-${Date.now()}`;
        const Products = db.getRepository('aiListingProducts');
        const Skus = db.getRepository('aiListingSkus');
        const Media = db.getRepository('aiListingMediaAssets');
        const rows = await Products.find({
          filter: { status: { $in: ['captured', 'process_failed'] } },
          sort: ['-id'],
          limit: 200,
        });
        // 批量数 SKU / 媒体，避免 N+1：一次取回按 productId 分组计数。
        const ids = rows.map((p: any) => p.get('id'));
        const skuCounts: Record<number, number> = {};
        const mediaCounts: Record<number, number> = {};
        if (ids.length) {
          const skuRows = await Skus.find({ filter: { productId: { $in: ids } }, fields: ['id', 'productId'] });
          for (const s of skuRows) skuCounts[s.get('productId')] = (skuCounts[s.get('productId')] ?? 0) + 1;
          const mediaRows = await Media.find({ filter: { productId: { $in: ids } }, fields: ['id', 'productId'] });
          for (const m of mediaRows) mediaCounts[m.get('productId')] = (mediaCounts[m.get('productId')] ?? 0) + 1;
        }
        const products = rows.map((p: any) => ({
          id: p.get('id'),
          titleOriginal: p.get('titleOriginal'),
          sourcePlatform: p.get('sourcePlatform'),
          priceOriginal: p.get('priceOriginal'),
          currencyOriginal: p.get('currencyOriginal'),
          status: p.get('status'),
          createdAt: p.get('createdAt'),
          // 处理上下文：供应商 / 起订量 / SKU 与媒体数量 / 属性数，帮助判断这条商品信息完整度。
          supplierName: (p.get('shopInfo') || {}).supplierName || null,
          moq: p.get('moq'),
          skuCount: skuCounts[p.get('id')] ?? 0,
          mediaCount: mediaCounts[p.get('id')] ?? 0,
          attrCount: Object.keys(p.get('attributesOriginal') || {}).length,
        }));
        ctx.body = { ok: true, data: { products, total: products.length }, warnings: [], errors: [], traceId };
        await next();
      },

      // 规则管理页：列出全部规则（含禁用），返回完整字段供 CRUD 表单使用。
      manageRules: async (ctx: Context, next: Next) => {
        const traceId = ctx.reqId || `srv-${Date.now()}`;
        const Rules = db.getRepository('aiListingRules');
        const rows = await Rules.find({ sort: ['id'] });
        const rules = rows.map((r: any) => ({
          id: r.get('id'),
          ruleCode: r.get('ruleCode'),
          name: r.get('name'),
          ruleType: r.get('ruleType'),
          sourcePlatform: r.get('sourcePlatform'),
          targetPlatform: r.get('targetPlatform'),
          enabled: r.get('enabled'),
          config: r.get('config') || {},
          mappingRows: r.get('mappingRows') || [],
          promptTemplate: r.get('promptTemplate'),
          updatedAt: r.get('updatedAt'),
        }));
        ctx.body = { ok: true, data: { rules }, warnings: [], errors: [], traceId };
        await next();
      },

      // 新建 / 编辑规则。规则修改写审计日志（PRD §7.7.5）。
      saveRule: async (ctx: Context, next: Next) => {
        const traceId = ctx.reqId || `srv-${Date.now()}`;
        const v = (ctx.action?.params?.values || {}) as Record<string, any>;
        const actorId = String(ctx.state?.currentUser?.id ?? 'unknown');
        const Rules = db.getRepository('aiListingRules');
        const AuditLogs = db.getRepository('aiListingAuditLogs');
        if (!v.name || !String(v.name).trim()) {
          ctx.status = 400;
          ctx.body = fail('RULE_NAME_REQUIRED', '请填写规则名称', false, traceId);
          return await next();
        }
        const values = {
          name: v.name,
          ruleType: v.ruleType || 'info',
          sourcePlatform: v.sourcePlatform || '*',
          targetPlatform: v.targetPlatform || '*',
          enabled: v.enabled !== false,
          config: v.config || {},
          mappingRows: Array.isArray(v.mappingRows) ? v.mappingRows : [],
          promptTemplate: v.promptTemplate || '',
        };
        let ruleId = Number(v.id);
        let action = 'rule.update';
        if (ruleId && !Number.isNaN(ruleId)) {
          const existing = await Rules.findOne({ filterByTk: ruleId });
          if (!existing) {
            ctx.status = 404;
            ctx.body = fail('RULE_NOT_FOUND', '要编辑的规则不存在', false, traceId);
            return await next();
          }
          await Rules.update({ filterByTk: ruleId, values });
        } else {
          action = 'rule.create';
          const created = await Rules.create({
            values: { ...values, ruleCode: v.ruleCode || `rule_${Date.now()}` },
          });
          ruleId = created.get('id');
        }
        await AuditLogs.create({
          values: {
            actorType: 'user',
            actorId,
            action,
            resourceType: 'rule',
            resourceId: ruleId,
            newValue: values,
            reason: action === 'rule.create' ? '新建处理规则' : '编辑处理规则',
            traceId,
          },
        });
        ctx.body = { ok: true, data: { id: ruleId, action }, warnings: [], errors: [], traceId };
        await next();
      },

      // 启用 / 禁用规则。写审计日志。
      toggleRule: async (ctx: Context, next: Next) => {
        const traceId = ctx.reqId || `srv-${Date.now()}`;
        const v = (ctx.action?.params?.values || {}) as { id?: number; enabled?: boolean };
        const actorId = String(ctx.state?.currentUser?.id ?? 'unknown');
        const id = Number(v.id);
        if (!id || Number.isNaN(id)) {
          ctx.status = 400;
          ctx.body = fail('NO_RULE_ID', '缺少规则 id', false, traceId);
          return await next();
        }
        const Rules = db.getRepository('aiListingRules');
        const AuditLogs = db.getRepository('aiListingAuditLogs');
        const rule = await Rules.findOne({ filterByTk: id });
        if (!rule) {
          ctx.status = 404;
          ctx.body = fail('RULE_NOT_FOUND', '规则不存在', false, traceId);
          return await next();
        }
        const oldEnabled = rule.get('enabled');
        const enabled = !!v.enabled;
        await Rules.update({ filterByTk: id, values: { enabled } });
        await AuditLogs.create({
          values: {
            actorType: 'user',
            actorId,
            action: 'rule.toggle',
            resourceType: 'rule',
            resourceId: id,
            fieldName: 'enabled',
            oldValue: oldEnabled,
            newValue: enabled,
            reason: enabled ? '启用规则' : '禁用规则',
            traceId,
          },
        });
        ctx.body = { ok: true, data: { id, enabled }, warnings: [], errors: [], traceId };
        await next();
      },
    },
  });

  // ACL：登录用户可处理/重试/查询进度/读取规则与待处理列表/规则管理（细粒度「运营可处理、只读不可处理」留待 nocobase-acl-manage 细化）。
  app.acl.allow('aiListingProcessing', 'runRule', 'loggedIn');
  app.acl.allow('aiListingProcessing', 'retry', 'loggedIn');
  app.acl.allow('aiListingProcessing', 'getJobProgress', 'loggedIn');
  app.acl.allow('aiListingProcessing', 'listRules', 'loggedIn');
  app.acl.allow('aiListingProcessing', 'pendingProducts', 'loggedIn');
  app.acl.allow('aiListingProcessing', 'manageRules', 'loggedIn');
  app.acl.allow('aiListingProcessing', 'saveRule', 'loggedIn');
  app.acl.allow('aiListingProcessing', 'toggleRule', 'loggedIn');
}
