/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// MediaStudio 交互测试:点缩略图 → 舞台大图预览;点候选 → 对比模式(A5 起 = 背景层拉帘舞台
// .stage .layer.full ×2 + .handle,不再渲染 CompareView 的 <img>);视频入列 vslot(预览为独立 <video controls>,
// 不包在 .stage 里)。布局类断言(gscroll 固定高度独立竖滚)属浏览器渲染,由 Playwright 覆盖,这里只测交互逻辑。

import React from 'react';
import { App as AntdApp } from 'antd';
import { render, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MediaStudio } from '../MediaStudio';

// 工坊是全屏 Modal,默认不渲染;mock 掉避免拉入其重依赖。
vi.mock('../../CreativeWorkshop/CreativeWorkshop', () => ({ CreativeWorkshop: () => null }));

const img = (id: number, role: string, url: string, extra: Record<string, unknown> = {}) => ({
  id,
  url,
  role,
  assetType: 'image',
  origin: 'source',
  sort: id,
  finalSelected: false,
  discarded: false,
  parentAssetId: null,
  genParams: null,
  ...extra,
});

const PANEL = {
  gallery: [
    img(1, 'main', 'http://x/main1.jpg'),
    img(2, 'detail', 'http://x/detail-two.jpg'),
    img(3, 'detail', 'http://x/detail-three.jpg'),
  ],
  candidates: [
    {
      id: 91,
      url: 'http://x/cand.jpg',
      role: 'detail',
      assetType: 'image',
      origin: 'ai_candidate',
      sort: null,
      finalSelected: false,
      discarded: false,
      parentAssetId: 1,
      genParams: { scene: 'white_bg', compareMode: 'slider' },
      createdAt: '2026-07-08T00:00:00Z',
    },
  ],
  adopted: [],
  videos: [
    {
      id: 50,
      url: 'http://x/clip.mp4',
      role: 'video',
      assetType: 'video',
      origin: null,
      sort: null,
      finalSelected: false,
      discarded: false,
      parentAssetId: null,
      genParams: null,
    },
  ],
};

function makeApp() {
  return {
    apiClient: {
      request: vi.fn(async ({ url }: { url: string }) => {
        if (url === 'aiListingMedia:candidates') return { data: { ok: true, data: PANEL } };
        if (url === 'aiListingMedia:scenes') return { data: { ok: true, data: { scenes: [] } } };
        if (url === 'aiListingMedia:imageModels') return { data: { ok: true, data: { models: [] } } };
        return { data: { ok: true, data: {} } };
      }),
    },
    // makeT 直接返回 key(英文),断言用英文文案
    i18n: { t: (k: string) => k },
  };
}

function renderStudio() {
  const app = makeApp();
  const utils = render(
    <AntdApp>
      <MediaStudio app={app as never} productId={1} />
    </AntdApp>,
  );
  return { app, ...utils };
}

const stageBg = (c: HTMLElement) =>
  (c.querySelector('.stage .layer.full') as HTMLElement | null)?.style.backgroundImage || '';
const compareBtn = (c: HTMLElement) =>
  Array.from(c.querySelectorAll('.stagelbl .modes button')).find((b) => b.textContent?.includes('Compare')) as
    | HTMLButtonElement
    | undefined;

describe('MediaStudio interactions (Phase 1)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders the gallery (main + detail) and previews the main image by default', async () => {
    const { container } = renderStudio();
    await waitFor(() => expect(container.querySelectorAll('.ggrid .th').length).toBe(3));
    // 默认选中主图(id 1),舞台预览其大图
    expect(container.querySelector('.th.sel')).toBeTruthy();
    expect(stageBg(container)).toContain('main1.jpg');
  });

  it('clicking a thumbnail previews that image large in the stage', async () => {
    const { container } = renderStudio();
    await waitFor(() => expect(container.querySelectorAll('.ggrid .th').length).toBe(3));
    const thumbs = container.querySelectorAll('.ggrid .th');
    fireEvent.click(thumbs[1]); // 详情图 detail-two
    await waitFor(() => expect(stageBg(container)).toContain('detail-two.jpg'));
  });

  it('compare is disabled until a candidate is picked; picking one enters compare mode with CompareView', async () => {
    const { container } = renderStudio();
    await waitFor(() => expect(container.querySelector('.candstrip .ccard')).toBeTruthy());
    // 无选中候选 → 对比禁用
    expect(compareBtn(container)?.disabled).toBe(true);
    // 点候选 → 进对比,ccard 高亮,拉帘舞台渲染:原图/候选两层背景 + 可拖手柄
    fireEvent.click(container.querySelector('.candstrip .ccard') as Element);
    await waitFor(() => {
      expect(container.querySelector('.ccard.on')).toBeTruthy();
      expect(compareBtn(container)?.className).toContain('on');
      expect(compareBtn(container)?.disabled).toBe(false);
      const layers = container.querySelectorAll('.stage .layer.full');
      expect(layers.length).toBe(2);
      expect((layers[1] as HTMLElement).style.backgroundImage).toContain('cand.jpg');
      expect(container.querySelector('.stage .handle[role="slider"]')).toBeTruthy();
    });
  });

  it('merges the video into the gallery column (vslot) with a playable element', async () => {
    const { container } = renderStudio();
    await waitFor(() => expect(container.querySelector('.vslot')).toBeTruthy());
    expect(container.querySelector('.vslot video')).toBeTruthy();
    // 点视频缩略 → 预览区放可播视频(按自身比例居中,不包在 .stage 里)
    fireEvent.click(container.querySelector('.vslot .vthumb') as Element);
    await waitFor(() => {
      const v = container.querySelector('video[controls]');
      expect(v).toBeTruthy();
      expect(v?.getAttribute('src')).toContain('clip.mp4');
    });
  });
});
