/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// MediaStudio 候选区增强测试(Phase 2):候选场景/相对时间/NEW 角标;批量逐张 ‹ › 第 N/M 张。
// 横滑(scrollWidth>clientWidth)属浏览器布局,由 Playwright 覆盖,这里测角标文案与批量逻辑。

import React from 'react';
import { App as AntdApp } from 'antd';
import { render, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MediaStudio } from '../MediaStudio';

vi.mock('../../CreativeWorkshop/CreativeWorkshop', () => ({ CreativeWorkshop: () => null }));

const isoAgo = (min: number) => new Date(Date.now() - min * 60000).toISOString();

const img = (id: number, role: string, url: string) => ({
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
});

const cand = (id: number, scene: string, min: number) => ({
  id,
  url: `http://x/cand${id}.jpg`,
  role: 'detail',
  assetType: 'image',
  origin: 'ai_candidate',
  sort: null,
  finalSelected: false,
  discarded: false,
  parentAssetId: 1,
  genParams: { scene, compareMode: 'slider' },
  createdAt: isoAgo(min),
});

const PANEL = {
  gallery: [
    img(1, 'main', 'http://x/main1.jpg'),
    img(2, 'detail', 'http://x/detail-a.jpg'),
    img(3, 'detail', 'http://x/detail-b.jpg'),
    img(4, 'detail', 'http://x/detail-c.jpg'),
  ],
  candidates: [
    cand(91, 'white_bg', 0), // 刚刚 → NEW
    cand(92, 'scene_gen', 5), // 5 分钟
    cand(93, 'erase', 20), // 20 分钟
    cand(94, 'hd', 120), // 2 小时
  ],
  adopted: [],
  videos: [],
};

function makeApp() {
  return {
    apiClient: {
      request: vi.fn(async ({ url }: { url: string }) => {
        if (url === 'aiListingMedia:candidates') return { data: { ok: true, data: PANEL } };
        return { data: { ok: true, data: { scenes: [], models: [] } } };
      }),
    },
    i18n: { t: (k: string) => k },
  };
}

function renderStudio() {
  return render(
    <AntdApp>
      <MediaStudio app={makeApp() as never} productId={1} />
    </AntdApp>,
  );
}

describe('MediaStudio candidates (Phase 2)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders scene + relative-time + NEW badges per candidate', async () => {
    const { container } = renderStudio();
    await waitFor(() => expect(container.querySelectorAll('.candstrip .ccard').length).toBe(4));
    const cards = container.querySelectorAll('.candstrip .ccard');
    // 场景角标(sceneMeta,中文兜底,不走 i18n)
    expect(cards[0].querySelector('.cscene')?.textContent).toContain('白底图');
    expect(cards[1].querySelector('.cscene')?.textContent).toContain('场景图');
    expect(cards[2].querySelector('.cscene')?.textContent).toContain('图片擦除');
    // 相对时间
    expect(cards[0].querySelector('.ctime')?.textContent).toContain('刚刚');
    expect(cards[1].querySelector('.ctime')?.textContent).toContain('5 分钟');
    // NEW:仅刚出的那张
    expect(cards[0].className).toContain('newgen');
    expect(cards[1].className).not.toContain('newgen');
  });

  it('picking ≥2 images shows batch step-through and ‹ › pages through them', async () => {
    const { container } = renderStudio();
    await waitFor(() => expect(container.querySelectorAll('.ggrid .th').length).toBe(4));
    // 无多选时无 .batch
    expect(container.querySelector('.stagelbl .batch')).toBeNull();
    // 勾选 3 张(主图 + 2 详情)
    const checks = container.querySelectorAll('.ggrid .th [role="checkbox"]');
    fireEvent.click(checks[0]);
    fireEvent.click(checks[1]);
    fireEvent.click(checks[2]);
    await waitFor(() => expect(container.querySelector('.stagelbl .batch')).toBeTruthy());
    const batch = () => container.querySelector('.stagelbl .batch')?.textContent?.replace(/\s+/g, ' ') || '';
    expect(batch()).toContain('1 / 3');
    // 点 › 翻到第 2 张
    const navs = container.querySelectorAll('.stagelbl .batch .nav');
    fireEvent.click(navs[1]); // ›
    await waitFor(() => expect(batch()).toContain('2 / 3'));
    // 点 ‹ 回到第 1 张
    fireEvent.click(navs[0]); // ‹
    await waitFor(() => expect(batch()).toContain('1 / 3'));
  });
});
