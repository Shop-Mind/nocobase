/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// Phase 10：把搬运专属能力注册为 plugin-ai「原生工具」，让 5 个员工在原生聊天框里真实调用（与官方 demo 的 General tools 一致）。
// 工具全部只读或「只给建议不入库」，符合安全铁律；通过 plugin-ai 的 toolsManager.registerTools 注册，按 EMPLOYEE_TOOLS 绑定到各员工 skillSettings。

import { z } from 'zod';
import type { Context } from '@nocobase/actions';
import type Plugin from '../plugin';
import { matchKnowledge, scanBannedWords } from './knowledge';

type ToolResult = { status: 'success' | 'error'; content: string };
const ok = (data: unknown): ToolResult => ({ status: 'success', content: JSON.stringify(data) });
const fail = (message: string): ToolResult => ({ status: 'error', content: message });

// 工具名 = plugin-ai 工具注册表的唯一键，绑定员工 skillSettings.tools[].name 时需与此一致。
export const TOOL_NAMES = {
  knowledgeHit: 'aiListingKnowledgeHit',
  bannedScan: 'aiListingBannedWordScan',
  productStats: 'aiListingProductStats',
  fieldSuggest: 'aiListingFieldSuggest',
} as const;

// 员工 → 可调用工具（用于绑定 skillSettings 与「工具列表」交付物）。
export const EMPLOYEE_TOOLS: Record<string, string[]> = {
  'lst-mira': [TOOL_NAMES.knowledgeHit, TOOL_NAMES.bannedScan, TOOL_NAMES.productStats],
  'lst-rena': [TOOL_NAMES.knowledgeHit, TOOL_NAMES.bannedScan],
  'lst-toby': [TOOL_NAMES.bannedScan, TOOL_NAMES.fieldSuggest],
  'lst-lena': [TOOL_NAMES.knowledgeHit, TOOL_NAMES.productStats],
  'lst-kai': [TOOL_NAMES.knowledgeHit, TOOL_NAMES.productStats],
};

// 工具元数据（用于「工具列表 + 权限表」交付物）。
export const TOOL_CATALOG: {
  name: string;
  title: string;
  access: 'read-only' | 'suggest-only';
  permission: 'ALLOW' | 'ASK';
  description: string;
}[] = [
  {
    name: TOOL_NAMES.knowledgeHit,
    title: '知识库命中（平台规则/类目/标题规范/违禁词）',
    access: 'read-only',
    permission: 'ALLOW',
    description: '按 query(+platform) 命中结构化知识条目，返回规则正文与命中词。',
  },
  {
    name: TOOL_NAMES.bannedScan,
    title: '违禁/风险词扫描',
    access: 'read-only',
    permission: 'ALLOW',
    description: '扫描文本中的绝对化/医疗/夸大/保证类违禁词并给出原因。',
  },
  {
    name: TOOL_NAMES.productStats,
    title: '商品状态统计（只读）',
    access: 'read-only',
    permission: 'ALLOW',
    description: '按状态聚合商品数量，用于选品/发布卡点评估。',
  },
  {
    name: TOOL_NAMES.fieldSuggest,
    title: '字段优化建议（只给建议不入库）',
    access: 'suggest-only',
    permission: 'ASK',
    description: '对标题/描述/参数给出优化建议值；不写库，用户在表单 Submit 才保存。',
  },
];

function buildTools(plugin: Plugin) {
  const db = plugin.app.db;

  const knowledgeHit = {
    scope: 'GENERAL' as const,
    defaultPermission: 'ALLOW' as const,
    introduction: { title: '知识库命中', about: '命中平台规则/类目/标题规范/违禁词' },
    definition: {
      name: TOOL_NAMES.knowledgeHit,
      description:
        'Retrieve cross-border listing rules (platform rules, category attributes, title norms, banned words) by keyword. Read-only.',
      schema: z.object({
        query: z.string().min(1).describe('检索词，如「Shopee 标题多长」「类目必填属性」'),
        platform: z.string().optional().describe('目标平台：shopee/lazada/amazon/temu/alibaba（可选）'),
        topK: z.number().int().positive().max(10).optional().describe('返回条数，默认 5'),
      }),
    },
    invoke: async (_ctx: Context, args: { query?: string; platform?: string; topK?: number }): Promise<ToolResult> => {
      const hits = matchKnowledge(String(args?.query ?? ''), { platform: args?.platform, topK: args?.topK });
      return ok({ count: hits.length, hits });
    },
  };

  const bannedScan = {
    scope: 'GENERAL' as const,
    defaultPermission: 'ALLOW' as const,
    introduction: { title: '违禁词扫描', about: '扫描文本中的违禁/风险词' },
    definition: {
      name: TOOL_NAMES.bannedScan,
      description:
        'Scan text for prohibited/risky marketing words (absolute claims, medical, exaggeration). Read-only.',
      schema: z.object({ text: z.string().min(1).describe('待扫描文本，通常为商品标题或描述') }),
    },
    invoke: async (_ctx: Context, args: { text?: string }): Promise<ToolResult> => {
      const found = scanBannedWords(String(args?.text ?? ''));
      return ok({ count: found.length, words: found });
    },
  };

  const productStats = {
    scope: 'GENERAL' as const,
    defaultPermission: 'ALLOW' as const,
    introduction: { title: '商品状态统计', about: '按状态聚合商品数量（只读）' },
    definition: {
      name: TOOL_NAMES.productStats,
      description: 'Aggregate product counts grouped by status. Read-only.',
      schema: z.object({}),
    },
    invoke: async (): Promise<ToolResult> => {
      try {
        const repo = db.getRepository('aiListingProducts');
        const total = await repo.count();
        const statuses = ['captured', 'processing', 'processed', 'review_pending', 'reviewed', 'published'];
        const byStatus: Record<string, number> = {};
        for (const s of statuses) byStatus[s] = await repo.count({ filter: { status: s } });
        return ok({ total, byStatus });
      } catch (e) {
        return fail(`产品统计失败：${(e as Error).message}`);
      }
    },
  };

  const fieldSuggest = {
    scope: 'GENERAL' as const,
    defaultPermission: 'ASK' as const, // 建议类需 Ask，提醒用户「建议不入库，Submit 才保存」
    introduction: { title: '字段优化建议', about: '给标题/描述/参数优化建议（不入库）' },
    definition: {
      name: TOOL_NAMES.fieldSuggest,
      description:
        'Suggest optimized title/description/attributes for a product. Returns suggestions only; never writes. User must Submit to save.',
      schema: z.object({
        productId: z.union([z.string(), z.number()]).describe('商品 ID'),
        field: z.enum(['title', 'description', 'attributes']).describe('要优化的字段'),
      }),
    },
    invoke: async (_ctx: Context, args: { productId?: string | number; field?: string }): Promise<ToolResult> => {
      try {
        const repo = db.getRepository('aiListingProducts');
        const p: any = await repo.findOne({ filterByTk: args?.productId as any });
        if (!p) return fail('未找到该商品');
        const field = args?.field || 'title';
        const titleOriginal = p.get('titleOriginal') || p.get('titleProcessed') || '';
        const banned = scanBannedWords(String(titleOriginal));
        const suggestion: Record<string, unknown> = {
          field,
          writeBack: false,
          note: '建议值，不入库；用户在表单 Submit 才保存',
        };
        if (field === 'title') {
          suggestion.value = String(titleOriginal)
            .replace(/[!！。.]+$/g, '')
            .slice(0, 100);
          suggestion.removedBannedWords = banned.map((b) => b.word);
        } else if (field === 'description') {
          suggestion.value = '【卖点】材质/规格/适用场景三段式；【参数】补全类目必填属性；【合规】移除违禁词。';
        } else {
          suggestion.value = { 材质: '待补全', 规格: '待补全', 适用人群: '待补全' };
        }
        return ok(suggestion);
      } catch (e) {
        return fail(`字段建议失败：${(e as Error).message}`);
      }
    },
  };

  return [knowledgeHit, bannedScan, productStats, fieldSuggest];
}

/**
 * 把搬运工具注册到 plugin-ai 的 toolsManager（员工在原生聊天框可真实调用）。
 * 防御式：plugin-ai 未就绪/结构变化时静默跳过，绝不影响本插件与整个 app 启动。
 */
export function registerAssistantTools(plugin: Plugin): void {
  try {
    const aiPlugin: any = plugin.app.pm.get('ai');
    const toolsManager = aiPlugin?.ai?.toolsManager || aiPlugin?.aiManager?.toolsManager;
    if (!toolsManager?.registerTools) {
      plugin.app.logger?.warn?.(
        '[ai-listing] plugin-ai toolsManager 未就绪，跳过工具注册（员工仍可对话，工具不可调用）',
      );
      return;
    }
    toolsManager.registerTools(buildTools(plugin));
    plugin.app.logger?.info?.(`[ai-listing] 已注册 ${buildTools(plugin).length} 个 AI 工具到 plugin-ai`);
  } catch (e) {
    plugin.app.logger?.warn?.(`[ai-listing] AI 工具注册失败（已忽略）：${(e as Error).message}`);
  }
}
