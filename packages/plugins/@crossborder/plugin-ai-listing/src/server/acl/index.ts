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

// AI Listing 业务角色骨架。超级管理员复用内置 `root`，此处只定义业务侧角色。
// strategy.actions 为该角色对所有集合的默认动作（NocoBase 全局策略），构成 Phase 1 的粗粒度骨架；
// 更细的“运营不能直接发布”等独立资源权限留待对应业务 Phase 用 nocobase-acl-manage 细化。
// 标题直接用中文：角色标题在 UI 走全局 i18n 命名空间、不查插件 locale，故不能依赖插件翻译，直接存目标语言最稳。
export const roleSeeds: Array<{
  name: string;
  title: string;
  strategy: { actions: string[] };
  hidden?: boolean;
}> = [
  {
    name: 'r_store_admin',
    title: '店铺管理员',
    strategy: { actions: ['view', 'create', 'update', 'destroy', 'export', 'importXlsx'] },
  },
  { name: 'r_operator', title: '运营', strategy: { actions: ['view', 'create', 'update', 'export'] } },
  { name: 'r_reviewer', title: '审核人员', strategy: { actions: ['view', 'update', 'export'] } },
  { name: 'r_viewer', title: '只读观察者', strategy: { actions: ['view', 'export'] } },
  // AI 员工工具角色：非 UI 登录角色，仅供 AI 员工自定义工具受控读取，故 hidden。
  { name: 'r_ai_tool', title: 'AI 工具', strategy: { actions: ['view'] }, hidden: true },
];

// 可读取平台凭证引用字段的特权角色。其余角色读取平台账号时会被剥离 credentialRef。
const CREDENTIAL_PRIVILEGED_ROLES = new Set(['root', 'admin', 'r_store_admin']);
const PLATFORM_ACCOUNTS = 'aiListingPlatformAccounts';
const SENSITIVE_FIELD = 'credentialRef';

function stripSensitiveField(payload: unknown, roles: string[]): void {
  if (roles.some((r) => CREDENTIAL_PRIVILEGED_ROLES.has(r))) return;
  const scrub = (row: unknown) => {
    if (row && typeof row === 'object' && SENSITIVE_FIELD in (row as Record<string, unknown>)) {
      delete (row as Record<string, unknown>)[SENSITIVE_FIELD];
    }
  };
  if (Array.isArray(payload)) {
    payload.forEach(scrub);
  } else if (payload && typeof payload === 'object') {
    const body = payload as Record<string, unknown>;
    if (Array.isArray(body.rows)) {
      body.rows.forEach(scrub);
    } else {
      scrub(body);
    }
  }
}

// 在插件 load() 中调用：注册业务集合的基础 ACL 与平台凭证字段保护中间件。
export function setupAcl(plugin: Plugin): void {
  const { app } = plugin;

  // 平台凭证只允许管理员配置：非特权角色仅可读取连接状态，写操作收敛到 store_admin / root。
  app.acl.allow(PLATFORM_ACCOUNTS, ['list', 'get'], 'loggedIn');

  // 读取平台账号时为非特权角色剥离 credentialRef，保证“运营看不到平台凭证明文字段”。
  app.resourceManager.use(
    async (ctx: Context, next: Next) => {
      await next();
      const resourceName = ctx.action?.resourceName;
      const actionName = ctx.action?.actionName;
      if (resourceName === PLATFORM_ACCOUNTS && (actionName === 'list' || actionName === 'get')) {
        const currentRoles: string[] = Array.isArray(ctx.state?.currentRoles)
          ? ctx.state.currentRoles
          : ctx.state?.currentRole
            ? [ctx.state.currentRole]
            : [];
        stripSensitiveField(ctx.body, currentRoles);
      }
    },
    { tag: 'aiListingStripCredential', after: 'acl' },
  );
}

// 在插件 install() 中调用：幂等地创建业务角色记录，使其出现在角色列表中。
export async function seedRoles(plugin: Plugin): Promise<void> {
  const repo = plugin.app.db.getRepository('roles');
  for (const seed of roleSeeds) {
    const existing = await repo.findOne({ filter: { name: seed.name } });
    if (existing) continue;
    await repo.create({
      values: {
        name: seed.name,
        title: seed.title,
        strategy: seed.strategy,
        hidden: seed.hidden ?? false,
        // 业务角色不授予插件管理 / UI 配置类系统能力。
        snippets: ['!ui.*', '!pm', '!pm.*'],
      },
    });
  }
}
