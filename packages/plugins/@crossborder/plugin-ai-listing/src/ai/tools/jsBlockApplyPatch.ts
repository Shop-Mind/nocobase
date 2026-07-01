/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { defineTools } from '@nocobase/ai';

// 通用前端工具：AI 员工在原生抽屉里对话，直接修改「任意 jsBlock」的暂存数据（等价原生表单的 formFiller）。
// 机制与 formFiller 完全一致：GENERAL（所有员工可用）+ ALLOW（自动执行，无需审批）+ execution:'frontend'
//（真正的执行在客户端 —— 见 client-v2/ai/jsblock-ai.ts 里注册的同名 invoke，定位 window.__aiListingBlockKit
// 的目标区块并写入其 React 暂存 state）。服务端 invoke 只返回占位说明，不触库。
// 安全铁律：本工具只改「暂存」（内存 state），绝不写数据库；入库只发生在用户点「提交」时（走受控服务端 action + 审计）。
//
// schema 用「纯 JSON Schema」（与 data-source-manager 的 dataQuery 等内置工具同款）：LangChain 的 tool() 对 JSON Schema
// 走 @cfworker/json-schema 校验，绕开 zod v4 interop，最稳。zod 亦可（formFiller 即 zod），但需注意 zod v4 里
// `z.record(...)` 必须传 key+value 两个参数（`z.record(z.string(), z.any())`），单参 `z.record(z.any())` 会让
// LangChain 绑定时崩「reading '_zod'」——此坑曾由 assistant/tools.ts 的 reviewWriteSuggestion 触发，已修。
export default defineTools({
  scope: 'GENERAL',
  defaultPermission: 'ALLOW',
  execution: 'frontend',
  introduction: {
    title: 'Apply changes to a JS block (staged)',
    about:
      'Modify the staged data of a JS block through conversation; changes are not saved until the user clicks Submit.',
  },
  definition: {
    name: 'jsBlockApplyPatch',
    description: [
      "Apply staged edits to a JS block's editable fields. This only updates the block's in-memory staged data",
      '(shown immediately in the UI, marked as pending); it does NOT write to the database. The user must click the',
      "block's Submit button to persist. Use the block key and editable fields provided in the work context.",
    ].join(' '),
    schema: {
      type: 'object',
      properties: {
        block: {
          type: 'string',
          description: 'The registry key of the target JS block to modify. It is provided in the work context.',
        },
        patch: {
          type: 'object',
          additionalProperties: true,
          description:
            "Key-value pairs of staged field updates, keyed by the block's declared editable field names. " +
            'Only declared editable fields are accepted; unknown keys are ignored. ' +
            'Example: { "title": "New title for Lazada", "stock": 500 }',
        },
      },
      required: ['block', 'patch'],
    },
  },
  invoke: async () => {
    return {
      status: 'success',
      content: 'Staged edits were applied to the JS block. They are not saved until the user clicks Submit.',
    };
  },
});
