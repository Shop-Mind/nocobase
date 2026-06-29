/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// 审计写入：每次规则执行与字段变化都落 aiListingAuditLogs（PRD §6 / §7.9.4）。
// AI 员工写入用 actorType='ai_employee'，规则/系统写入用 actorType='system'；只记录字段级旧值/新值，不记录任何凭证。

export interface AuditEntry {
  actorType: 'user' | 'ai_employee' | 'system';
  actorId: string;
  action: string;
  resourceType: 'product' | 'rule' | 'publish' | 'account';
  resourceId: number;
  fieldName?: string;
  oldValue?: unknown;
  newValue?: unknown;
  reason?: string;
  traceId: string;
}

// 批量写入审计日志（单条失败不应阻断主流程，调用方已在 try/catch 内）。
export async function writeAudit(AuditLogs: any, entries: AuditEntry[]): Promise<void> {
  for (const e of entries) {
    await AuditLogs.create({
      values: {
        actorType: e.actorType,
        actorId: e.actorId,
        action: e.action,
        resourceType: e.resourceType,
        resourceId: e.resourceId,
        fieldName: e.fieldName,
        oldValue: e.oldValue ?? null,
        newValue: e.newValue ?? null,
        reason: e.reason,
        traceId: e.traceId,
      },
    });
  }
}
