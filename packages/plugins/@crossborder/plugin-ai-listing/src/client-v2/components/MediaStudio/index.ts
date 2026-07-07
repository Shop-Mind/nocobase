/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { installMediaKit } from './media-kit';
import type { MediaStudioApp } from './types';

export { MediaStudio } from './MediaStudio';
export { installMediaKit } from './media-kit';
export type { MediaStudioApp, MediaAsset, MediaScene, MediaPanelData } from './types';

// 客户端入口:安装 window.__aiListingMediaKit(供预览编辑 jsBlock 挂载 AI 候选区)。全程 try/catch。
export function setupMediaKit(app: MediaStudioApp): void {
  try {
    installMediaKit(app);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[ai-listing] 安装 media kit 失败:', (e as Error)?.message);
  }
}
