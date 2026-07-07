/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// 商品状态锁的共享定义:预览编辑 saveFinal(review)与媒体采纳/弃用(media/service)同守一把锁,
// 避免两处枚举漂移。状态机全景见 review/index.ts 头部注释。

// 允许直接写入最终内容(字段/图集)的状态;publish_failed 编辑后自动收敛回 reviewing。
export const EDITABLE_STATUS = ['processed', 'reviewing', 'publish_failed'];
