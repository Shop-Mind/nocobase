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

// 创意工坊风格模版库(W2):内置模版(source=builtin,启动时种子幂等 upsert)+ 用户自定义模版(source=user,
// 仅本人可删)。点选模版 = 把 prompt 全文填入提示词框,不直接触发生成;thumbUrl 缺省时前端渲染文字卡。
export default defineCollection({
  dataCategory: 'business',
  name: 'aiListingStyleTemplates',
  title: 'Style templates',
  fields: [
    { type: 'string', name: 'title', interface: 'input', title: 'Title' },
    // 类目 key(bags/home/festive/food/apparel/industrial/general),展示名由前端 i18n 映射
    { type: 'string', name: 'category', interface: 'input', title: 'Category' },
    // 适用功能(与 functions.ts / scenes.ts 的场景 key 一致);首批只有 scene_gen
    { type: 'string', name: 'scene', interface: 'input', title: 'Scene', defaultValue: 'scene_gen' },
    { type: 'text', name: 'prompt', interface: 'textarea', title: 'Prompt' },
    // 模版示例小图(gen-template-thumbs.js 批量回写);为空时 UI 显示文字卡
    { type: 'text', name: 'thumbUrl', interface: 'url', title: 'Thumbnail URL' },
    selectField('source', 'Source', [
      { value: 'builtin', label: 'Builtin', color: 'blue' },
      { value: 'user', label: 'User', color: 'green' },
    ]),
    // user 模版归属人(builtin 为空);删除权限校验依据
    { type: 'bigInt', name: 'createdById', interface: 'integer', title: 'Created by' },
    { type: 'integer', name: 'sort', interface: 'integer', title: 'Sort', defaultValue: 0 },
    { type: 'boolean', name: 'enabled', interface: 'checkbox', title: 'Enabled', defaultValue: true },
  ],
});
