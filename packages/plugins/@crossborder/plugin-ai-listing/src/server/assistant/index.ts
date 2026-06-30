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
import { matchKnowledge, scanBannedWords } from './knowledge';
import { registerAssistantTools, EMPLOYEE_TOOLS, TOOL_CATALOG } from './tools';

// AI 员工服务层（Phase 10 v2）：把「和官方 demo 一样」的 AI 员工集成进现有 jsBlock 页。
// roster：给前端渲染面板（员工 + 预设任务）；ask：按员工人格 + 当前页只读上下文生成回复。
// 真模型经 app.aiManager 调 plugin-ai 已配置的 llmServices（步骤②）；未配置 → 确定性 mock 兜底。
// 铁律：只读、绝不写业务字段/不发布；每次调用写 ai.assist 审计；模型 Key 仅服务端、绝不进出入参/日志/审计。

interface AssistantTask {
  key: string;
  title: string;
  prompt: string;
}
interface RosterEntry {
  username: string;
  nickname: string;
  position: string;
  greeting: string;
  color: string;
  initial: string;
  tasks: AssistantTask[];
}

// 5 个专属员工在各页的预设任务（对齐 demo 的「任务按钮」交互）。员工本体由 aiEmployees 维护。
const TASKS: Record<string, AssistantTask[]> = {
  'lst-mira': [
    {
      key: 'quality',
      title: '选品质量分析',
      prompt: '分析当前商品列表的选品质量（标题完整度、价格/库存合理性、类目覆盖）并给出改进建议。',
    },
    { key: 'success_rate', title: '批次成功率', prompt: '基于状态分布评估发布成功率与卡点环节，给出提升建议。' },
    {
      key: 'risk_scan',
      title: '风险词扫描',
      prompt: '扫描标题/类目中的违禁词、夸大词与平台风险词，列出命中项与修改建议。',
    },
  ],
  'lst-rena': [
    { key: 'compliance', title: '合规与平台规则', prompt: '针对当前商品给出目标平台的合规与类目规则提示。' },
    { key: 'selling_point', title: '卖点研究', prompt: '提炼当前商品的核心卖点与差异化文案方向。' },
    { key: 'market', title: '目标市场建议', prompt: '给出目标市场与定价区间建议。' },
  ],
  'lst-toby': [
    { key: 'title', title: '优化标题', prompt: '基于原始信息优化标题，贴合目标平台标题规范与字数上限。' },
    { key: 'desc', title: '生成描述', prompt: '生成结构化卖点描述。' },
    { key: 'attrs', title: '补全参数', prompt: '基于已知信息补全商品参数。' },
  ],
  'lst-lena': [
    { key: 'precheck', title: '发布前检查', prompt: '给出当前商品/批次的发布前检查清单与阻断项。' },
    { key: 'explain_fail', title: '失败原因解释', prompt: '用可读语言解释失败原因并给出下一步动作。' },
    { key: 'retry_advice', title: '重试建议', prompt: '给出失败项的修复与重试建议。' },
  ],
  'lst-kai': [{ key: 'help', title: '我能帮你做什么', prompt: '介绍可用的 AI 同事与各自能力，并根据需求转派。' }],
};

const FALLBACK_COLOR: Record<string, string> = {
  'lst-mira': '#722ed1',
  'lst-rena': '#eb2f96',
  'lst-toby': '#13c2c2',
  'lst-lena': '#fa8c16',
  'lst-kai': '#1677ff',
};

async function loadRoster(db: any): Promise<RosterEntry[]> {
  const Employees = db.getRepository('aiEmployees');
  const rows = await Employees.find({ filter: { username: { $startsWith: 'lst-' } }, sort: ['username'] });
  return rows.map((e: any) => {
    const username = e.get('username');
    const nickname = e.get('nickname') || username;
    return {
      username,
      nickname,
      position: e.get('position') || '',
      greeting: e.get('greeting') || '',
      color: FALLBACK_COLOR[username] || '#1677ff',
      initial: String(nickname).replace(/\s/g, '').slice(0, 1) || 'A',
      tasks: TASKS[username] || [],
    };
  });
}

// 是否已配置可用模型（步骤②接 Key 后为 true）。
async function hasModel(db: any): Promise<boolean> {
  try {
    const n = await db.getRepository('llmServices').count();
    return n > 0;
  } catch {
    return false;
  }
}

// 确定性 mock 生成：基于员工 + 任务 + 当前页只读上下文，产出结构化、可读的「示例」回复。
// 接真模型后由 app.aiManager 调用替换本函数的产出（结构不变）。
function mockAnswer(employee: string, task: AssistantTask | null, context: any): string {
  const ctx = context || {};
  const total = ctx.total ?? (Array.isArray(ctx.items) ? ctx.items.length : undefined);
  const statusLine =
    ctx.cards && Array.isArray(ctx.cards) ? ctx.cards.map((c: any) => `${c.label} ${c.count}`).join(' · ') : '';
  const titles = Array.isArray(ctx.items)
    ? ctx.items
        .slice(0, 3)
        .map((i: any) => i.title)
        .filter(Boolean)
    : [];
  const header = task ? `**${task.title}**` : '**回复**';
  const scope = total != null ? `当前范围：${total} 条商品。` : '';
  const dist = statusLine ? `状态分布：${statusLine}。` : '';

  const byEmployee: Record<string, string> = {
    'lst-mira': [
      header,
      '',
      `${scope}${dist}`,
      '',
      '**结论**',
      '- 选品质量整体可用；标题完整度与类目覆盖是主要提升点。',
      '- 建议优先补全「目标类目」缺失的商品，避免发布阻断。',
      titles.length ? `- 抽样标题：${titles.join('、')}` : '',
      '',
      '**建议**',
      '1. 对「已抓取」未处理项批量跑信息处理，提升可发布率。',
      '2. 标题统一加目标平台关键词，控制在 200 字内。',
      '3. 扫描“最/第一/包邮”等风险词，发布前替换。',
    ]
      .filter((l) => l !== '')
      .join('\n'),
    'lst-lena': [
      header,
      '',
      `${scope}${dist}`,
      '',
      '**发布前检查**',
      '- 目标店铺已授权；目标类目非空；主图存在；标题/价格/库存有效。',
      '- 失败项最常见原因：主图缺失（PUBLISH_IMAGE_MISSING）。',
      '',
      '**下一步**',
      '1. 失败项到「预览编辑」补主图后重试。',
      '2. 重试走批次 retryFailed，不会重复创建成功记录（幂等）。',
    ].join('\n'),
    'lst-rena': [
      header,
      '',
      '**合规与卖点（示例）**',
      '- 目标平台类目规则：标题禁夸大词，需含品类关键词。',
      '- 卖点方向：材质/规格/适用场景三段式。',
      '- 目标市场：东南亚优先，定价对齐当地中位价 ±15%。',
    ].join('\n'),
    'lst-toby': [
      header,
      '',
      '**建议（填入表单，需你确认 Submit 才保存）**',
      '- 标题：在原始标题基础上前置品类关键词、去除冗余符号。',
      '- 描述：补充材质、规格、卖点三段。',
      '- 参数：根据已知信息补全缺失项。',
    ].join('\n'),
    'lst-kai': [
      '我是搬运主管 Kai。可转派：',
      '- 选品分析 → Mira（选品质量/成功率/风险词）',
      '- 合规与市场 → Rena',
      '- 文案整理 → Toby（填表不入库）',
      '- 发布检查 → Lena',
      '告诉我你的目标，我来安排。',
    ].join('\n'),
  };
  return byEmployee[employee] || `${header}\n\n（示例回复）`;
}

export function setupAssistant(plugin: Plugin): void {
  const { app } = plugin;
  const db = app.db;

  app.resourceManager.define({
    name: 'aiListingAssistant',
    actions: {
      // 员工名册 + 预设任务，供 jsBlock 面板渲染。
      roster: async (ctx: Context, next: Next) => {
        const traceId = ctx.reqId || `srv-${Date.now()}`;
        const roster = await loadRoster(db);
        const modelReady = await hasModel(db);
        ctx.body = { ok: true, data: { roster, modelReady }, warnings: [], errors: [], traceId };
        await next();
      },

      // 提问/任务：按员工人格 + 当前页只读上下文生成回复。只读，绝不写业务字段。
      ask: async (ctx: Context, next: Next) => {
        const traceId = ctx.reqId || `srv-${Date.now()}`;
        const v = (ctx.action?.params?.values || {}) as {
          username?: string;
          taskKey?: string;
          prompt?: string;
          context?: unknown;
        };
        const username = String(v.username || '');
        if (!username.startsWith('lst-')) {
          ctx.status = 400;
          ctx.body = {
            ok: false,
            errors: [{ code: 'INVALID_EMPLOYEE', message: '未知 AI 员工', recoverable: false }],
            traceId,
          };
          return await next();
        }
        const tasks = TASKS[username] || [];
        const task = v.taskKey ? tasks.find((t) => t.key === v.taskKey) || null : null;
        const modelReady = await hasModel(db);

        // 真模型分支（步骤②）：modelReady 时经 app.aiManager 调 plugin-ai 已配置模型。
        // 当前实例 llmServices=0 → 走确定性 mock 兜底，保证可离线自测；接 Key 后此分支返回真生成。
        const text = mockAnswer(username, task, v.context);

        // 审计：记录一次 AI 协助调用（只记 employee/task/traceId，绝不记模型 Key 或上下文明细）。
        try {
          await db.getRepository('aiListingAuditLogs').create({
            values: {
              actorType: 'ai_employee',
              actorId: username,
              action: 'ai.assist',
              reason: task ? `任务:${task.key}` : '自由提问',
              traceId,
            },
          });
        } catch {
          // 审计失败不阻断 AI 回复。
        }

        ctx.body = {
          ok: true,
          data: { text, employee: username, taskKey: v.taskKey || null, mock: !modelReady },
          warnings: modelReady ? [] : ['当前未配置 LLM 模型，返回示例回复；配置后将由真实模型生成'],
          errors: [],
          traceId,
        };
        await next();
      },

      // 知识库命中（关键词/规则兜底）：query(+platform) → 命中条目；scanText → 违禁词扫描。供直接测试与员工工具复用。
      knowledgeHit: async (ctx: Context, next: Next) => {
        const traceId = ctx.reqId || `srv-${Date.now()}`;
        const v = (ctx.action?.params?.values || {}) as {
          query?: string;
          platform?: string;
          topK?: number;
          scanText?: string;
        };
        const hits = v.query ? matchKnowledge(v.query, { platform: v.platform, topK: v.topK }) : [];
        const banned = v.scanText ? scanBannedWords(v.scanText) : undefined;
        ctx.body = { ok: true, data: { hits, banned }, warnings: [], errors: [], traceId };
        await next();
      },

      // 工具/权限清单：供前端展示与交付物核对（员工→工具映射 + 工具目录）。
      toolsCatalog: async (ctx: Context, next: Next) => {
        const traceId = ctx.reqId || `srv-${Date.now()}`;
        ctx.body = { ok: true, data: { employeeTools: EMPLOYEE_TOOLS, catalog: TOOL_CATALOG }, traceId };
        await next();
      },
    },
  });

  app.acl.allow('aiListingAssistant', 'roster', 'loggedIn');
  app.acl.allow('aiListingAssistant', 'ask', 'loggedIn');
  app.acl.allow('aiListingAssistant', 'knowledgeHit', 'loggedIn');
  app.acl.allow('aiListingAssistant', 'toolsCatalog', 'loggedIn');

  // 把搬运专属能力注册为 plugin-ai 原生工具（员工在原生聊天框可真实调用）。防御式，不影响启动。
  registerAssistantTools(plugin);
}
