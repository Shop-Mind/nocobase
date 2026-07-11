/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// ⚠️ 构建器外部化锚点：nocobase-build 只用行首静态 import 的文本扫描来决定哪些包进 externals（动态
// import() 不被识别）。没有这行 type-only import，`@nocobase/plugin-ai/client-v2` 会被从源码打进本插件
// 客户端包（拖入 handlebars→fs/path 直接构建失败）。它在编译期被完全擦除，不改变下方懒加载行为。
import type {} from '@nocobase/plugin-ai/client-v2';

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
  'lst-ivy':
    '你是美工员工 Ivy,专做商品图片处理。本对话处理复杂/多轮/需要来回沟通的改图需求:用 aiListingEditImage 工具对系统上下文给出的 assetId 逐张产候选;只产候选、绝不代替用户采纳或发布;增量修改只改说到的部分。中文、简洁,产出后提醒去「AI 候选区」采纳。若用户要的是标准功能(白底/场景图/去水印/换色/卖点/高清/扩图/换材质/Logo/翻译/模特图/生产流程图/智能视频),提示他用页面上的「🎨 创意工坊」更快更省心(有专属表单与比例/档位)。',
};

// 打开原生抽屉找美工员工改图:注入选中图(assetId)+商品 id,员工用 aiListingEditImage 逐张产候选。
// 候选进「AI 候选区」(页面)与气泡(抽屉)双端;采纳权始终在用户。
export async function openMediaEditor(
  app: HostApp,
  opts: {
    productId: number;
    assetIds: number[];
    images?: Array<{ id: number; role?: string }>;
    scene?: string;
    sceneLabel?: string;
  },
): Promise<boolean> {
  const username = (typeof process !== 'undefined' && process.env?.AI_LISTING_DESIGN_EMPLOYEE) || 'lst-ivy';
  const imgs: Array<{ id: number; role?: string }> =
    opts.images && opts.images.length ? opts.images : opts.assetIds.map((id) => ({ id }));
  const list = imgs.map((m) => `- assetId=${m.id}${m.role ? `(${m.role})` : ''}`);
  const systemMessage = [
    SYSTEM['lst-ivy'],
    '',
    `【当前商品】productId=${opts.productId}`,
    opts.assetIds.length
      ? `【用户已选中的待处理图】\n${list.join('\n')}`
      : '【用户未指定具体图,请让用户先在候选区选图】',
    '',
    '调用方式:对每个 assetId 调 aiListingEditImage({ productId, assetId, scene?, instruction })。',
    '可用场景 key:white_bg(白底) / scene_gen(场景图) / erase(去logo水印,instruction 填要去除的对象) / recolor(换色,填颜色) / selling_point(卖点图) / hd(高清) / expand(扩图) / material(换材质) / custom(自由改,填完整指令)。',
    '产出后用 markdown ![候选](url) 展示,并提醒用户去页面「AI 候选区」采纳。',
    '本对话用于复杂/多轮沟通的改图;标准一键功能引导用户去页面上的「🎨 创意工坊」(有专属表单、比例、档位,更快)。',
  ].join('\n');
  const userPrompt = opts.scene
    ? `把选中的${opts.assetIds.length > 1 ? ` ${opts.assetIds.length} 张` : ''}图做${opts.sceneLabel || opts.scene}`
    : '';
  // P9 抽屉收窄:移除原生 task 快捷按钮(plugin-ai 原生 task 点击后重置会话/按钮消失——「场景图点了按钮就没了」的根因)。
  // 抽屉回归「自由对话找 Ivy」(复杂/多轮),标准功能一律走独立创意工坊页(头部「🎨 创意工坊」)。仅注入选中图上下文。
  return openNativeAssistant(app, { username, systemMessage, userPrompt, autoSend: false });
}

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

// autoSend：抽屉打开后自动把预填的 prompt 发出去（仿平台官方「标题优化」一键即开始）。
// 原生 send 只能从 React hook（useChatBoxActions）拿到，桥接层拿不到；这里用「点原生发送按钮」等价触发：
// 轮询 chat-box store 里的 senderRef（Sender 组件挂载后写入），在其 nativeElement 内找唯一的 ant-btn-primary（发送键）点一次。
// 找不到/超时则静默放弃——prompt 仍留在输入框，用户手动点发送即可（渐进增强，绝不影响抽屉本身）。
function autoSendWhenReady(getChatBoxState: () => Record<string, unknown> | undefined): void {
  const deadline = Date.now() + 6000;
  const tick = () => {
    try {
      const st = getChatBoxState();
      const senderRef = st?.senderRef as { current?: { nativeElement?: HTMLElement } } | undefined;
      const rootEl = senderRef?.current?.nativeElement;
      const btn = rootEl?.querySelector('button.ant-btn-primary') as HTMLButtonElement | null;
      const value = st?.senderValue as string | undefined;
      if (!value) return; // 已发送（submit 会清空 senderValue）或被用户清空，停止
      if (btn && !btn.disabled) {
        btn.click();
        return;
      }
    } catch {
      /* ignore */
    }
    if (Date.now() < deadline) setTimeout(tick, 200);
  };
  setTimeout(tick, 300);
}

// 复用的原生抽屉打开器：绑定员工 + 预置 system/user 消息，打开 plugin-ai 原生右侧抽屉。
// 供 aiListingOpenAssistant（旧「问 Toby」入口）与 jsBlock kit（新紫色头像入口）共用。
// 抽屉快捷任务按钮(plugin-ai 原生 role:'task' 机制):每个 = { title, message:{user,system}, autoSend }。
// 点击后由 TaskMessage → triggerTask 应用该任务的 user/system 到输入框与系统消息。
export type QuickTask = { title: string; message?: { user?: string; system?: string }; autoSend?: boolean };

export async function openNativeAssistant(
  app: HostApp,
  opts: { username: string; systemMessage?: string; userPrompt?: string; autoSend?: boolean; tasks?: QuickTask[] },
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
    const messages: Array<Record<string, unknown>> = [
      { key: randomKey(), role: emp.username, content: { type: 'greeting', content: greeting } },
    ];
    // 快捷任务按钮:渲染成一排按钮,点一下预填该场景指令(带图片上下文的 system 每个任务自带,防止 triggerTask 重置丢失)
    if (opts.tasks?.length) {
      messages.push({ key: randomKey(), role: 'task', content: { content: opts.tasks } });
    }
    cm.setSessionMessages?.(KEY, messages);
    cb.setModel?.(null);
    if (opts.systemMessage) cm.setSessionSystemMessage?.(KEY, opts.systemMessage);
    if (opts.userPrompt) cb.setSenderValue?.(opts.userPrompt);
    cb.setOpen?.(true);
    if (opts.autoSend && opts.userPrompt) {
      autoSendWhenReady(() => mod.useChatBoxStore?.getState?.() as Record<string, unknown> | undefined);
    }
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
