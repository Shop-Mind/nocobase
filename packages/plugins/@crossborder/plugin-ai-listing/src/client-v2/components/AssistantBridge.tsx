/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import React from 'react';
import { useAIConfigRepository, useChatBoxActions } from '@nocobase/plugin-ai/client-v2';

// Phase 10 v2 适配器：把现有 jsBlock 页的「AI 员工」按钮接到 **plugin-ai 原生 AI 面板**（与官方 demo 同一套）。
// 参照官方 plugin-data-visualization 的 DaraButton：用 useChatBoxActions().triggerTask({aiEmployee, tasks}) 打开原生右侧抽屉。
// 本组件经 app.addProvider 全局挂载（渲染 null），在 window 上暴露 aiListingOpenAssistant，供 jsBlock 沙箱调用（沙箱可访问 window）。
// 安全：仅打开原生面板并把「当前页只读上下文」放进任务 prompt；AI 读/写一律走 plugin-ai 原生权限与工具，本适配器不写库。

// 各专属员工的系统约束（人格已在 aiEmployees.about；此处再加铁律，确保只读/不发布）。
const SYSTEM: Record<string, string> = {
  'lst-mira': '你是跨境选品分析师 Mira。只读分析，绝不修改数据或触发发布。用中文，结构化输出。',
  'lst-rena': '你是合规与市场研究员 Rena。只读研究，不写库、不发布。用中文，分点输出。',
  'lst-toby': '你是商品信息整理员 Toby。只给优化建议（标题/描述/参数），不直接写库；保存与否由用户决定。用中文。',
  'lst-lena': '你是发布助理 Lena。只读协助：发布前检查、失败解释、重试建议；绝不触发真实发布。用中文。',
  'lst-kai': '你是搬运主管 Kai，统筹选品(Mira)/合规(Rena)/文案(Toby)/发布(Lena)。只读或转派，不写库。用中文。',
};

// 各员工在页面上的预设任务（标题 + 用户提示）。对齐官方 demo 的「任务按钮」。
const TASKS: Record<string, Array<{ title: string; user: string }>> = {
  'lst-mira': [
    {
      title: '选品质量分析',
      user: '分析当前商品列表的选品质量（标题完整度、价格/库存合理性、类目覆盖），给出改进建议。',
    },
    { title: '批次成功率', user: '基于状态分布评估发布成功率与卡点环节，给出提升建议。' },
    { title: '风险词扫描', user: '扫描标题/类目中的违禁词、夸大词与平台风险词，列出命中项与修改建议。' },
  ],
  'lst-rena': [
    { title: '合规与平台规则', user: '针对当前商品给出目标平台的合规与类目规则提示。' },
    { title: '卖点研究', user: '提炼当前商品的核心卖点与差异化文案方向。' },
    { title: '目标市场建议', user: '给出目标市场与定价区间建议。' },
  ],
  'lst-toby': [
    { title: '优化标题', user: '基于原始信息优化标题，贴合目标平台标题规范与字数上限。' },
    { title: '生成描述', user: '生成结构化卖点描述。' },
    { title: '补全参数', user: '基于已知信息补全商品参数。' },
  ],
  'lst-lena': [
    { title: '发布前检查', user: '给出当前商品/批次的发布前检查清单与阻断项。' },
    { title: '失败原因解释', user: '用可读语言解释失败原因并给出下一步动作。' },
    { title: '重试建议', user: '给出失败项的修复与重试建议。' },
  ],
  'lst-kai': [{ title: '我能帮你做什么', user: '介绍可用的 AI 同事与各自能力，并根据我的需求转派。' }],
};

interface OpenArgs {
  title?: string;
  content?: string;
}

export const AssistantBridge: React.FC = () => {
  const repo = useAIConfigRepository();
  const employees = repo?.aiEmployees;
  const { triggerTask } = useChatBoxActions();

  // 用 ref 持有最新的 employees/triggerTask，供 window 上的稳定函数读取（避免闭包过期）。
  const ref = React.useRef<{ employees: any; triggerTask: any }>({ employees: undefined, triggerTask: undefined });
  ref.current.employees = employees;
  ref.current.triggerTask = triggerTask;

  React.useEffect(() => {
    repo?.getAIEmployees?.();
  }, [repo]);

  React.useEffect(() => {
    // 暴露给 jsBlock 沙箱：window.aiListingOpenAssistant(username, { title, content })
    (window as unknown as Record<string, unknown>).aiListingOpenAssistant = (username: string, context?: OpenArgs) => {
      const { employees: emps, triggerTask: trigger } = ref.current;
      const emp = (emps || []).find((e: { username?: string }) => e.username === username);
      if (!emp || !trigger) {
        // eslint-disable-next-line no-console
        console.warn('[ai-listing] 原生 AI 未就绪或未找到员工：', username);
        return false;
      }
      const sys = SYSTEM[username] || '';
      const ctxNote = context?.content ? `\n\n【当前页只读上下文】\n${context.content}` : '';
      const tasks = (TASKS[username] || []).map((t) => ({
        title: t.title,
        message: { user: t.user + ctxNote, system: sys },
        autoSend: false,
      }));
      trigger({ aiEmployee: emp, tasks });
      return true;
    };
    return () => {
      try {
        delete (window as unknown as Record<string, unknown>).aiListingOpenAssistant;
      } catch {
        /* noop */
      }
    };
  }, []);

  return null;
};

export default AssistantBridge;
