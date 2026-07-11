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

// 快速搬运看板（QT1）：把「请求行 → 对应工作流执行 → 当前节点/错误/待办/草稿链接」聚合成一次只读查询，
// 供商品抓取页「快速搬运」tab 的 jsBlock 轮询渲染（jsBlock 沙箱里自定义 action 可在 handler/useEffect 经 ctx.request 调用）。

type ModelLike = { get: (k: string) => unknown };

// 执行状态 → 看板展示态。EXECUTION_STATUS：null=排队 0=进行中 1=完成 负数=失败/取消。
function executionState(status: number | null): 'queueing' | 'running' | 'done' | 'failed' {
  if (status === null) return 'queueing';
  if (status === 0) return 'running';
  return status === 1 ? 'done' : 'failed';
}

export function setupQuickTransferBoard(plugin: Plugin): void {
  const { app } = plugin;

  app.resourceManager.define({
    name: 'aiListingQuickTransfer',
    actions: {
      board: async (ctx: Context, next: Next) => {
        const traceId = ctx.reqId || `srv-${Date.now()}`;
        const db = app.db;
        const values = (ctx.action?.params?.values || {}) as { limit?: number };
        const limit = Math.min(Math.max(Number(values.limit) || 20, 1), 50);

        const requests = (await db
          .getRepository('aiListingQuickTransferRequests')
          .find({ sort: ['-id'], limit })) as ModelLike[];

        // 绑定本触发集合的 collection 工作流（不锁死 id，重建工作流后看板照常工作）。
        const workflows = (await db
          .getRepository('workflows')
          .find({ filter: { type: 'collection' }, fields: ['id', 'config', 'enabled'] })) as ModelLike[];
        const wfIds = workflows
          .filter((w) => (w.get('config') as { collection?: string })?.collection === 'aiListingQuickTransferRequests')
          .map((w) => Number(w.get('id')));

        let executions: ModelLike[] = [];
        if (wfIds.length && requests.length) {
          executions = (await db.getRepository('executions').find({
            filter: { workflowId: { $in: wfIds } },
            sort: ['-id'],
            limit: Math.max(limit * 3, 60),
            appends: ['jobs'],
          })) as ModelLike[];
        }
        // 每个请求行取最新一次执行（executions 已按 -id 排序，首个命中即最新）。
        const byRequestId = new Map<number, ModelLike>();
        for (const e of executions) {
          const rid = Number((e.get('context') as { data?: { id?: number } })?.data?.id);
          if (rid && !byRequestId.has(rid)) byRequestId.set(rid, e);
        }

        const Tasks = db.getRepository('workflowManualTasks');
        const rows = [] as Record<string, unknown>[];
        for (const r of requests) {
          const requestId = Number(r.get('id'));
          const row: Record<string, unknown> = {
            requestId,
            sourceUrl: r.get('sourceUrl'),
            skipMedia: Boolean(r.get('skipMedia')),
            createdAt: r.get('createdAt'),
            state: 'queueing',
          };
          const e = byRequestId.get(requestId);
          if (e) {
            const executionId = Number(e.get('id'));
            const status = e.get('status') as number | null;
            row.executionId = executionId;
            row.state = executionState(status);
            const jobs = ((e.get('jobs') as ModelLike[]) || [])
              .map((j) => ({
                nodeKey: String(j.get('nodeKey') || ''),
                status: Number(j.get('status')),
                result: j.get('result') as Record<string, unknown> | null,
              }))
              // jobs 无稳定顺序，按「负数错误优先、0 进行中其次」提炼当前焦点。
              .filter((j) => j.nodeKey);
            row.productId = jobs.map((j) => j.result?.productId).find(Boolean) ?? null;
            row.draftUrl = jobs.map((j) => j.result?.draftUrl).find(Boolean) ?? null;
            const errJob = jobs.find((j) => j.status < 0);
            if (errJob) {
              row.errorCode = errJob.result?.errorCode ?? null;
              row.errorMessage = errJob.result?.message ?? null;
            }
            const pending = jobs.find((j) => j.status === 0);
            if (pending) {
              row.state = 'waiting';
              const todo = (await Tasks.findOne({
                filter: { executionId, status: 0 },
                fields: ['id'],
              })) as ModelLike | null;
              row.todoId = todo ? Number(todo.get('id')) : null;
            }
          }
          rows.push(row);
        }

        ctx.body = { ok: true, data: { rows }, warnings: [], errors: [], traceId };
        await next();
      },
    },
  });

  app.acl.allow('aiListingQuickTransfer', 'board', 'loggedIn');
}
