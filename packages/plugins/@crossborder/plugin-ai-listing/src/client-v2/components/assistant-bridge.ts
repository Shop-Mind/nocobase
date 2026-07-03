/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// 结构化最小类型：同时兼容 v1（@nocobase/client）与 v2（@nocobase/client-v2）的 Application 实例，
// 使本桥可被两套 client 的插件 load() 复用（运行中的 /admin 应用加载的是本插件 src/client 即 v1 入口）。
export type HostApp = {
  apiClient: { request: (options: unknown) => Promise<{ data?: { data?: unknown[] } }> };
};

// jsBlock → plugin-ai 原生 AI 抽屉 的桥接（与官方 demo / 商品抓取同一套原生面板）。
// 关键设计（避开 Phase 10 白屏坑）：**完全不渲染 plugin-ai 的 React hook**，只在 window 上挂函数，
// 函数内**懒加载** `@nocobase/plugin-ai/client-v2` 的全局 zustand store，用 `.getState()` 复刻 `triggerTask` 的单任务路径
// （setOpen/setCurrentEmployee/setSenderValue/setModel + setSessionMessages/SystemMessage）。
// 全程 try/catch，导入或 store 未就绪即静默返回 false（jsBlock 可回退），**绝不影响主应用**。
// 安全铁律：只打开原生面板 + 把上下文放进 system prompt；AI 读/写一律走 plugin-ai 原生权限与工具，本桥不写库。

type OpenContext = { productId?: number | string; title?: string; content?: string; prompt?: string };

// 各专属员工的系统约束（人格已在 aiEmployees.about；此处再加铁律，确保只读/不发布）。
const SYSTEM: Record<string, string> = {
  'lst-mira': '你是跨境选品分析师 Mira。只读分析，绝不修改数据或触发发布。中文、结构化输出。',
  'lst-rena': '你是合规与市场研究员 Rena。只读研究，不写库、不发布。中文、分点输出。',
  'lst-toby': '你是商品信息整理员 Toby。只给优化建议（标题/描述/参数），不直接写库；是否保存由用户决定。中文。',
  'lst-lena': '你是发布助理 Lena。只读协助：发布前检查、失败解释、重试建议；绝不触发真实发布。中文。',
  'lst-kai': '你是搬运主管 Kai，统筹选品(Mira)/合规(Rena)/文案(Toby)/发布(Lena)。只读或转派，不写库。中文。',
};

const employeeCache: Record<string, unknown> = {};

export async function fetchEmployee(app: HostApp, username: string): Promise<Record<string, unknown> | undefined> {
  if (employeeCache[username]) return employeeCache[username] as Record<string, unknown>;
  try {
    // 必须用 listByUser：它对所有登录用户开放并按当前角色过滤；aiEmployees:list 属于管理员设置页快照，
    // 普通角色（如店铺管理员）调用会 403 "No permissions"，导致头像点开抽屉失败。与原生 AIEmployeeShortcut 同源。
    const res = await app.apiClient.request({
      resource: 'aiEmployees',
      action: 'listByUser',
    });
    const rows = (res?.data?.data as Record<string, unknown>[] | undefined) || [];
    for (const row of rows) {
      if (row && typeof row.username === 'string') employeeCache[row.username] = row;
    }
    return employeeCache[username] as Record<string, unknown> | undefined;
  } catch {
    return undefined;
  }
}

function randomKey(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// 复用的原生抽屉打开器：绑定员工 + 预置 system/user 消息，打开 plugin-ai 原生右侧抽屉。
// 供 aiListingOpenAssistant（旧「问 Toby」入口）与 jsBlock kit（新紫色头像入口）共用。
export async function openNativeAssistant(
  app: HostApp,
  opts: { username: string; systemMessage?: string; userPrompt?: string },
): Promise<boolean> {
  try {
    const emp = await fetchEmployee(app, opts.username);
    if (!emp) {
      // eslint-disable-next-line no-console
      console.warn('[ai-listing] 未找到 AI 员工：', opts.username);
      return false;
    }
    const mod = (await import('@nocobase/plugin-ai/client-v2')) as unknown as {
      useChatBoxStore?: { getState: () => Record<string, (...args: unknown[]) => unknown> & { open?: boolean } };
      useChatMessagesStore?: { getState: () => Record<string, (...args: unknown[]) => unknown> };
      useChatConversationsStore?: { getState: () => Record<string, (...args: unknown[]) => unknown> };
    };
    const cb = mod.useChatBoxStore?.getState?.();
    const cm = mod.useChatMessagesStore?.getState?.();
    const cc = mod.useChatConversationsStore?.getState?.();
    if (!cb || !cm) {
      // eslint-disable-next-line no-console
      console.warn('[ai-listing] plugin-ai 聊天 store 未就绪');
      return false;
    }
    const KEY = '__draft__';
    const greeting = (emp.greeting as string) || `你好，我是 ${(emp.nickname as string) || (emp.username as string)}。`;

    cb.setReadonly?.(false);
    cm.setSessionResponseLoading?.(KEY, false);
    cc?.setCurrentConversation?.(undefined);
    cb.setCurrentEmployee?.(emp);
    cm.setSessionMessages?.(KEY, [
      { key: randomKey(), role: emp.username, content: { type: 'greeting', content: greeting } },
    ]);
    cb.setModel?.(null);
    if (opts.systemMessage) cm.setSessionSystemMessage?.(KEY, opts.systemMessage);
    if (opts.userPrompt) cb.setSenderValue?.(opts.userPrompt);
    cb.setOpen?.(true);
    return true;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[ai-listing] 打开原生 AI 面板失败：', (e as Error)?.message);
    return false;
  }
}

// 在 window 上暴露 aiListingOpenAssistant(username, context)：打开 plugin-ai 原生右侧抽屉并预绑员工 + 预填上下文 prompt。
export function setupAssistantBridge(app: HostApp): void {
  const w = window as unknown as Record<string, unknown>;
  w.aiListingOpenAssistant = async (username: string, context?: OpenContext): Promise<boolean> => {
    const sys = SYSTEM[username] || '';
    // 只读上下文放进「系统消息」（用户看不到）；「输入框预填」只留自然口语提示，避免把 ID/字段明细暴露给运营人员。
    const systemMessage = context?.content ? `${sys}\n\n【当前商品只读上下文】\n${context.content}`.trim() : sys;
    return openNativeAssistant(app, {
      username,
      systemMessage,
      userPrompt: (context?.prompt || '').trim(),
    });
  };
}

export function teardownAssistantBridge(): void {
  try {
    delete (window as unknown as Record<string, unknown>).aiListingOpenAssistant;
  } catch {
    /* noop */
  }
}
