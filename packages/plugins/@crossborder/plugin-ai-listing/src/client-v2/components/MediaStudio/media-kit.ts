/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// window.__aiListingMediaKit:预览编辑 jsBlock 用它把「AI 候选区」React 面板挂进自己的容器。
// 与 __aiListingBlockKit 对齐(jsBlock 沙箱只调 window,组件与 React 都在插件 bundle 里)。
// mount(container,{productId,onChange}) 返回卸载函数;沙箱在 unmount 时调用它。
// 独立 React root:不共享主应用的 React 树,故内部自带 antd <App> 提供 message/modal 上下文。

import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { App as AntdApp, ConfigProvider } from 'antd';
import { MediaStudio } from './MediaStudio';
import { openMediaEditor, type HostApp } from '../assistant-bridge';
import type { MediaStudioApp } from './types';

export interface MediaKitMountOptions {
  productId: number | string;
  onChange?: () => void;
}

type MediaKit = {
  // 返回卸载函数;宿主容器移除前调用以清理 React root
  mount: (container: HTMLElement, opts: MediaKitMountOptions) => () => void;
};

const roots = new WeakMap<HTMLElement, Root>();

export function installMediaKit(app: MediaStudioApp): MediaKit {
  const w = window as unknown as { __aiListingMediaKit?: MediaKit };
  if (w.__aiListingMediaKit) return w.__aiListingMediaKit;
  const kit: MediaKit = {
    mount(container, opts) {
      const productId = Number(opts.productId);
      if (!container || !productId) {
        // eslint-disable-next-line no-console
        console.warn('[ai-listing] media kit mount: 缺少容器或 productId');
        return () => undefined;
      }
      // 同一容器重复 mount:先卸载旧 root(jsBlock 每次 render 都会调 mount)
      const existing = roots.get(container);
      if (existing) existing.unmount();
      const root = createRoot(container);
      roots.set(container, root);
      // AI 改图重活交给原生抽屉:找美工员工 lst-ivy,注入选中图。产物回流候选区(MediaStudio 轮询刷新)。
      const openEditor = (assetIds: number[], o?: { scene?: string }) =>
        openMediaEditor(app as unknown as HostApp, { productId, assetIds, scene: o?.scene });
      root.render(
        React.createElement(
          ConfigProvider,
          null,
          React.createElement(
            AntdApp,
            { component: false },
            React.createElement(MediaStudio, { app, productId, onChange: opts.onChange, openEditor }),
          ),
        ),
      );
      return () => {
        root.unmount();
        roots.delete(container);
      };
    },
  };
  w.__aiListingMediaKit = kit;
  return kit;
}
