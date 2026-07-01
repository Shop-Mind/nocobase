/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import type { ToolsOptions } from '@nocobase/client-v2';
import { openNativeAssistant, fetchEmployee, type HostApp } from '../components/assistant-bridge';

// ───────────────────────────────────────────────────────────────────────────────────────────────
// jsBlock 通用能力：AI 员工原生抽屉对话 → 直接改本区块的「暂存数据」→ 用户点「提交」才入库。
// 与原生表单 formFiller 完全对齐：
//   原生表单： formFiller(setFieldsValue 改表单字段) → 表单 Submit 落库
//   jsBlock ： jsBlockApplyPatch(改区块 React 暂存 state) → 区块「提交」按钮走受控 action 落库
// 任意 jsBlock 只需在 window.__aiListingBlockKit 上 register 一次（getData/getSchema/applyPatch），
// 即获得「右上原生紫色头像 → 对话改暂存 → 提交入库」。本文件负责：①注册前端工具 invoke ②安装 window kit。
// 安全铁律：AI 只改暂存（内存），绝不写库；入库只发生在用户点提交时。
// ───────────────────────────────────────────────────────────────────────────────────────────────

// jsBlock 向 kit 声明的接口（沙箱内实现，闭包持有 React setState）。
export type JsBlockField = { name: string; label?: string; type?: string; hint?: string };
export type JsBlockApi = {
  title?: string; // 区块显示名（进 system prompt，帮助 AI 理解语境）
  getData: () => Record<string, unknown>; // 当前暂存值（含 AI 已改、未提交部分）
  getSchema: () => JsBlockField[]; // 可编辑字段声明
  applyPatch: (patch: Record<string, unknown>) => void; // AI 写暂存（更新 React state）
  // 可选：返回一段「只读背景信息」，进入 system prompt（用户看不到）。用于给 AI 记录主键 ID、状态、可用读取工具等技术细节，
  // 从而让「用户可见的输入框提示语」保持自然口语、不含 ID/工具名等开发术语。
  getSystemContext?: () => string;
  // 可选：本区块「提交入库」按钮的真实名称（如「保存」「模拟发布」）。用于让 AI 提示用户点对按钮，默认「提交」。
  submitLabel?: string;
};

type BlockKit = {
  blocks: Record<string, JsBlockApi>;
  register: (key: string, api: JsBlockApi) => void;
  unregister: (key: string) => void;
  applyPatch: (key: string, patch: Record<string, unknown>) => boolean;
  openAI: (key: string, opts?: { username?: string; prompt?: string }) => Promise<boolean>;
  // 返回 AI 员工「原生头像」data URI（dicebear，紫底人像）。options 直接透传给 plugin-ai 的 avatars()，
  // 用于复刻原生 AIEmployeeShortcut 的 hover 转头：常态 { mouth: undefined, mask: ['dark'] }；hover { mask: undefined, flip: true }。
  getAvatar: (username: string, options?: Record<string, unknown>) => Promise<string | undefined>;
};

function buildSystemMessage(key: string, api: JsBlockApi): string {
  let data: Record<string, unknown> = {};
  let schema: JsBlockField[] = [];
  try {
    data = api.getData?.() || {};
  } catch {
    /* ignore */
  }
  try {
    schema = api.getSchema?.() || [];
  } catch {
    /* ignore */
  }
  const fieldLines = schema
    .map((f) => `- ${f.name}（${f.label || f.name}${f.type ? '，' + f.type : ''}）${f.hint ? '：' + f.hint : ''}`)
    .join('\n');
  let contextNote = '';
  try {
    contextNote = api.getSystemContext?.() || '';
  } catch {
    /* ignore */
  }
  return [
    `你正在协助用户编辑页面上的一个区块「${api.title || key}」（jsBlock）。`,
    '你可以通过调用工具 `jsBlockApplyPatch` 修改它的**暂存数据**：改动会立即显示在页面上并标记为「待提交」，' +
      '但**不会立即入库**；只有用户点该区块的「提交」按钮，才会真正保存到数据库。',
    '',
    '调用方式：jsBlockApplyPatch({ block: "' + key + '", patch: { 字段名: 新值, ... } })',
    '区块 key（必须原样使用）：' + key,
    '可编辑字段：',
    fieldLines || '（无声明字段）',
    '',
    '当前暂存数据（JSON）：',
    '```json',
    JSON.stringify(data, null, 2),
    '```',
    ...(contextNote ? ['', '背景信息（只读，供你参考，请勿直接展示给用户）：', contextNote] : []),
    '',
    '铁律：',
    '1. 只允许修改上面声明的可编辑字段；不要臆造字段。',
    `2. 你只改「暂存」，绝不代替用户保存；改完用一句话说明你改了哪些字段，并提示「确认后请点区块上的『${
      api.submitLabel || '提交'
    }』按钮」。`,
    '3. 中文回复，简洁。',
  ].join('\n');
}

// 安装 window.__aiListingBlockKit（幂等）。jsBlock 沙箱通过 window 读写，与主应用共享同一 globalThis。
export function installBlockKit(app: HostApp): BlockKit {
  const w = window as unknown as { __aiListingBlockKit?: BlockKit };
  if (w.__aiListingBlockKit) return w.__aiListingBlockKit;
  const kit: BlockKit = {
    blocks: {},
    register(key, api) {
      this.blocks[key] = api;
    },
    unregister(key) {
      delete this.blocks[key];
    },
    applyPatch(key, patch) {
      const b = this.blocks[key];
      if (!b?.applyPatch) return false;
      b.applyPatch(patch);
      return true;
    },
    async openAI(key, opts) {
      const api = this.blocks[key];
      if (!api) {
        // eslint-disable-next-line no-console
        console.warn('[ai-listing] jsBlock 未注册：', key);
        return false;
      }
      return openNativeAssistant(app, {
        username: opts?.username || 'lst-toby',
        systemMessage: buildSystemMessage(key, api),
        userPrompt: opts?.prompt || '',
      });
    },
    async getAvatar(username, options) {
      try {
        const emp = await fetchEmployee(app, username);
        const seed = emp?.avatar as string | undefined;
        if (!seed) return undefined;
        const mod = (await import('@nocobase/plugin-ai/client-v2')) as unknown as {
          avatars?: (seed: string, options?: Record<string, unknown>) => string;
        };
        return mod.avatars?.(seed, options);
      } catch {
        return undefined;
      }
    },
  };
  w.__aiListingBlockKit = kit;
  return kit;
}

// 前端工具：LLM 发出 jsBlockApplyPatch 调用 → 客户端在此执行，定位目标 jsBlock 并写入其暂存 state。
export const jsBlockApplyPatchTool: [string, ToolsOptions] = [
  'jsBlockApplyPatch',
  {
    invoke: async (_app, params) => {
      const { block, patch } = (params || {}) as { block?: string; patch?: Record<string, unknown> };
      const kit = (window as unknown as { __aiListingBlockKit?: BlockKit }).__aiListingBlockKit;
      if (!block || !kit?.blocks?.[block]?.applyPatch) {
        return {
          status: 'error',
          content: `未找到已注册的可编辑区块：block="${block}"。请使用工作上下文中给出的区块 key。`,
        };
      }
      if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
        return { status: 'error', content: 'patch 必须是「字段名→新值」的对象。' };
      }
      // 仅接受该区块声明过的可编辑字段，未知字段忽略（防止 AI 越权写入）。
      let allowed: string[] = [];
      try {
        allowed = (kit.blocks[block] as JsBlockApi).getSchema?.().map((f) => f.name) || [];
      } catch {
        allowed = [];
      }
      const safePatch: Record<string, unknown> = {};
      const ignored: string[] = [];
      for (const [k, v] of Object.entries(patch)) {
        if (!allowed.length || allowed.includes(k)) safePatch[k] = v;
        else ignored.push(k);
      }
      if (!Object.keys(safePatch).length) {
        return {
          status: 'error',
          content: `patch 中没有可编辑字段。可编辑字段：${allowed.join('、') || '（未声明）'}。`,
        };
      }
      kit.applyPatch(block, safePatch);
      const changed = Object.keys(safePatch).join('、');
      const note = ignored.length ? `（已忽略非可编辑字段：${ignored.join('、')}）` : '';
      const submitLabel = (kit.blocks[block] as JsBlockApi).submitLabel || '提交';
      return {
        status: 'success',
        content: `已把改动写入区块「${block}」的暂存：${changed}${note}。尚未入库，请提醒用户点「${submitLabel}」按钮保存。`,
      };
    },
  },
];

// 客户端入口：注册前端工具 + 安装 window kit。
export function setupJsBlockAI(app: HostApp): void {
  try {
    (
      app as unknown as {
        aiManager?: { toolsManager?: { registerTools: (name: string, options: ToolsOptions) => void } };
      }
    ).aiManager?.toolsManager?.registerTools(...jsBlockApplyPatchTool);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[ai-listing] 注册 jsBlockApplyPatch 前端工具失败：', (e as Error)?.message);
  }
  installBlockKit(app);
}
