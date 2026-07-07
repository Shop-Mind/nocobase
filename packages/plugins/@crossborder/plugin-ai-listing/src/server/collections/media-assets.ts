/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { defineCollection } from '@nocobase/database';
import { selectField } from '../shared/tracing-fields';

// 图片 / 视频资产表。sourceFileId / processedFileId 指向 File Manager 的文件记录，后续阶段接入。
export default defineCollection({
  dataCategory: 'business',
  name: 'aiListingMediaAssets',
  title: 'Media assets',
  fields: [
    {
      type: 'belongsTo',
      name: 'product',
      target: 'aiListingProducts',
      foreignKey: 'productId',
      targetKey: 'id',
      interface: 'm2o',
      title: 'Product',
    },
    selectField('assetType', 'Asset type', [
      { value: 'image', label: 'Image', color: 'blue' },
      { value: 'video', label: 'Video', color: 'purple' },
    ]),
    { type: 'text', name: 'sourceUrl', interface: 'url', title: 'Source URL' },
    { type: 'bigInt', name: 'sourceFileId', interface: 'integer', title: 'Source file' },
    { type: 'bigInt', name: 'processedFileId', interface: 'integer', title: 'Processed file' },
    selectField('role', 'Role', [
      { value: 'main', label: 'Main', color: 'gold' },
      { value: 'detail', label: 'Detail', color: 'default' },
      { value: 'sku', label: 'SKU', color: 'cyan' },
      { value: 'video', label: 'Video', color: 'purple' },
    ]),
    { type: 'integer', name: 'sort', interface: 'integer', title: 'Sort' },
    // —— AI 改图候选/采纳生命周期(图片编辑闭环 Phase 0)——
    // origin:资产来源。空/source=抓取原图;ai_candidate=AI 生成的候选(不进发布);ai_adopted=用户显式采纳进最终集。
    selectField('origin', 'Origin', [
      { value: 'source', label: 'Source', color: 'default' },
      { value: 'ai_candidate', label: 'AI candidate', color: 'blue' },
      { value: 'ai_adopted', label: 'AI adopted', color: 'green' },
    ]),
    // 采纳进「最终图集」:发布装配取图时采纳集优先。采纳是用户显式动作,AI 永不写此字段。
    { type: 'boolean', name: 'finalSelected', interface: 'checkbox', title: 'Final selected', defaultValue: false },
    // 弃用/被替换移出最终集:不删行,原图与候选都可经审计回滚。
    { type: 'boolean', name: 'discarded', interface: 'checkbox', title: 'Discarded', defaultValue: false },
    // 变体溯源:候选图由哪张原图生成。
    { type: 'bigInt', name: 'parentAssetId', interface: 'integer', title: 'Parent asset' },
    // 生成参数快照 {scene, instruction, editFunction, model, llmService, n, sourceImageUrl}:多轮增量修改与复现依据。
    { type: 'jsonb', name: 'genParams', interface: 'json', title: 'Generation params' },
    selectField(
      'processStatus',
      'Process status',
      [
        { value: 'pending', label: 'Pending', color: 'default' },
        { value: 'running', label: 'Running', color: 'blue' },
        { value: 'success', label: 'Success', color: 'green' },
        { value: 'failed', label: 'Failed', color: 'red' },
      ],
      { defaultValue: 'pending' },
    ),
    { type: 'string', name: 'processType', interface: 'input', title: 'Process type' },
    { type: 'jsonb', name: 'meta', interface: 'json', title: 'Meta' },
  ],
});
