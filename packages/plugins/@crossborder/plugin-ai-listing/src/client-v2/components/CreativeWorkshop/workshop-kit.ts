/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// window.__aiListingWorkshopKit:创意工坊 admin 页面里的 jsBlock 用它把「创意工坊」React 页挂进容器。
// 与 __aiListingMediaKit 完全同构(jsBlock 沙箱只调 window,组件与 React 都在插件 bundle 里)。
// mount(container,{productId,assetIds,productTitle,onBack}) 返回卸载函数;沙箱在 unmount 时调用它。
// 独立 React root:自带 antd <App> 提供 message/modal 上下文。

import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { App as AntdApp, ConfigProvider } from 'antd';
import { CreativeWorkshop } from './CreativeWorkshop';
import type { MediaStudioApp } from '../MediaStudio/types';

export interface WorkshopKitMountOptions {
  productId: number | string;
  assetIds?: Array<number | string>;
  productTitle?: string;
  onBack?: () => void;
}

type WorkshopKit = {
  mount: (container: HTMLElement, opts: WorkshopKitMountOptions) => () => void;
};

const roots = new WeakMap<HTMLElement, Root>();

export function installWorkshopKit(app: MediaStudioApp): WorkshopKit {
  const w = window as unknown as { __aiListingWorkshopKit?: WorkshopKit };
  if (w.__aiListingWorkshopKit) return w.__aiListingWorkshopKit;
  const kit: WorkshopKit = {
    mount(container, opts) {
      const productId = Number(opts.productId);
      if (!container || !productId) {
        // eslint-disable-next-line no-console
        console.warn('[ai-listing] workshop kit mount: 缺少容器或 productId');
        return () => undefined;
      }
      // 同一容器重复 mount:先卸载旧 root
      const existing = roots.get(container);
      if (existing) existing.unmount();
      const root = createRoot(container);
      roots.set(container, root);
      const initialAssetIds = (opts.assetIds || []).map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0);
      root.render(
        React.createElement(
          ConfigProvider,
          null,
          React.createElement(
            AntdApp,
            { component: false },
            React.createElement(CreativeWorkshop, {
              app,
              productId,
              productTitle: opts.productTitle,
              initialAssetIds,
              onBack: opts.onBack,
            }),
          ),
        ),
      );
      return () => {
        root.unmount();
        roots.delete(container);
      };
    },
  };
  w.__aiListingWorkshopKit = kit;
  return kit;
}

// 客户端入口:安装 window.__aiListingWorkshopKit(供创意工坊页 jsBlock 挂载)。全程 try/catch。
export function setupWorkshopKit(app: MediaStudioApp): void {
  try {
    installWorkshopKit(app);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[ai-listing] 安装 workshop kit 失败:', (e as Error)?.message);
  }
}
