/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import React from 'react';
import { AuditOutlined, CloudDownloadOutlined, CloudUploadOutlined, ToolOutlined } from '@ant-design/icons';
import { Instruction } from '@nocobase/plugin-workflow/client-v2';
import { tval } from '@nocobase/utils/client';

// 快速搬运工作流节点的画布注册（v1 画布复用 v2 Instruction 基类，plugin-ai 同款做法：一份类、双端注册）。
// 节点 config 由建链脚本预置（值为 {{$context.data.*}} / {{$jobsMapByNodeKey.*}} 模板串），画布侧先不做配置表单。

const NS = '@crossborder/plugin-ai-listing';
const GROUP = 'ai-listing';

type VariableNode = { title?: string; key: string };

class ListingCaptureInstruction extends Instruction {
  title = tval('Quick transfer · Capture', { ns: NS });
  type = 'listingCapture';
  group = GROUP;
  icon = (<CloudDownloadOutlined />);

  useVariables(node: VariableNode) {
    return {
      label: node.title ?? 'capture',
      value: node.key,
      children: [
        { value: 'productId', label: 'productId' },
        { value: 'captureTaskId', label: 'captureTaskId' },
        { value: 'taskNo', label: 'taskNo' },
      ],
    };
  }
}

class ListingProcessInstruction extends Instruction {
  title = tval('Quick transfer · Process', { ns: NS });
  type = 'listingProcess';
  group = GROUP;
  icon = (<ToolOutlined />);

  useVariables(node: VariableNode) {
    return {
      label: node.title ?? 'process',
      value: node.key,
      children: [
        { value: 'productId', label: 'productId' },
        { value: 'processingJobId', label: 'processingJobId' },
      ],
    };
  }
}

class ListingApproveInstruction extends Instruction {
  title = tval('Quick transfer · Approve', { ns: NS });
  type = 'listingApprove';
  group = GROUP;
  icon = (<AuditOutlined />);

  useVariables(node: VariableNode) {
    return {
      label: node.title ?? 'approve',
      value: node.key,
      children: [
        { value: 'productId', label: 'productId' },
        { value: 'titleAutoFilled', label: 'titleAutoFilled' },
      ],
    };
  }
}

class ListingPublishDraftInstruction extends Instruction {
  title = tval('Quick transfer · Publish draft', { ns: NS });
  type = 'listingPublishDraft';
  group = GROUP;
  icon = (<CloudUploadOutlined />);

  useVariables(node: VariableNode) {
    return {
      label: node.title ?? 'publishDraft',
      value: node.key,
      children: [
        { value: 'draftUrl', label: 'draftUrl' },
        { value: 'targetProductId', label: 'targetProductId' },
        { value: 'batchId', label: 'batchId' },
      ],
    };
  }
}

// 双端共用注册入口：v1/v2 客户端 load() 里各调一次（v1 允许 import v2，反向禁止）。
export function registerQuickTransferWorkflowNodes(pm: { get: (name: string) => unknown }): void {
  const workflow = pm.get('workflow') as
    | {
        registerInstructionGroup?: (key: string, options: { label: unknown }) => void;
        registerInstruction?: (type: string, instruction: unknown) => void;
      }
    | undefined;
  if (!workflow || typeof workflow.registerInstruction !== 'function') return;
  workflow.registerInstructionGroup?.(GROUP, { label: tval('AI listing transfer', { ns: NS }) });
  workflow.registerInstruction('listingCapture', ListingCaptureInstruction);
  workflow.registerInstruction('listingProcess', ListingProcessInstruction);
  workflow.registerInstruction('listingApprove', ListingApproveInstruction);
  workflow.registerInstruction('listingPublishDraft', ListingPublishDraftInstruction);
}
