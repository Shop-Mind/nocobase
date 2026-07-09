/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// 创作历史抽屉(W4,对齐阿里):跨会话回看该商品(或自由模式)的全部生成记录——候选中/已采纳/已弃用/生成失败
// 合并时间倒序流。图片/视频 tab + 功能 chips 过滤 + 加载更多;操作:下载 / 再次编辑(关抽屉回填表单)/
// 弃用(仅候选中)/ 失败条目红 tag + 错误摘要 + 按原参数重试。只读展示,写操作全部复用工坊既有回调。

import React, { useCallback, useEffect, useState } from 'react';
import { Button, Drawer, Empty, Segmented, Spin, Tag, Typography } from 'antd';
import { callMediaApi, type MediaAsset, type MediaStudioApp } from '../MediaStudio/types';
import { WORKSHOP_FUNCTIONS } from './functions';

export interface HistoryItem {
  kind: 'asset' | 'failed';
  id: number;
  url: string | null;
  assetType: 'image' | 'video';
  status: 'candidate' | 'adopted' | 'discarded' | 'failed';
  scene: string | null;
  // 与 MediaAsset 同型:历史条目可直接喂给工坊的 下载/再次编辑/重新生成 回调
  genParams: MediaAsset['genParams'];
  errorMessage: string | null;
  createdAt: string | null;
  parentAssetId: number | null;
}

interface HistoryData {
  items: HistoryItem[];
  total: number;
  page: number;
  pageSize: number;
}

// 相对时间(分钟/小时/天),超 7 天落日期;历史卡片扫读用,不求精确
function relTime(iso: string | null, t: (k: string, o?: Record<string, unknown>) => string): string {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return t('just now');
  if (min < 60) return t('{{n}} min ago', { n: min });
  const h = Math.floor(min / 60);
  if (h < 24) return t('{{n}} h ago', { n: h });
  const d = Math.floor(h / 24);
  if (d <= 7) return t('{{n}} d ago', { n: d });
  return iso.slice(0, 10);
}

const STATUS_TAG: Record<HistoryItem['status'], { color: string; label: string }> = {
  candidate: { color: 'blue', label: 'Pending candidate' },
  adopted: { color: 'green', label: 'Adopted' },
  discarded: { color: 'default', label: 'Discarded (history)' },
  failed: { color: 'red', label: 'Generation failed' },
};

const PAGE_SIZE = 20;

export function WorkshopHistory({
  app,
  open,
  onClose,
  productId,
  t,
  funcLabel,
  onEditAgain,
  onRetry,
  onDownload,
  onDiscard,
}: {
  app: MediaStudioApp;
  open: boolean;
  onClose: () => void;
  // 0 = 自由模式(无商品归属的记录)
  productId: number;
  t: (key: string, options?: Record<string, unknown>) => string;
  // 功能 key → 展示名(复用工坊的 i18n 回退逻辑)
  funcLabel: (key: string) => string;
  onEditAgain: (item: HistoryItem) => void;
  onRetry: (item: HistoryItem) => void;
  onDownload: (item: HistoryItem) => void;
  // 弃用后 resolve,抽屉自刷新
  onDiscard: (item: HistoryItem) => Promise<void>;
}) {
  const [tab, setTab] = useState<'image' | 'video'>('image');
  const [sceneFilter, setSceneFilter] = useState<string>('');
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  const load = useCallback(
    async (p: number, append: boolean) => {
      setLoading(true);
      const res = await callMediaApi<HistoryData>(app, 'aiListingMedia:history', {
        productId,
        assetType: tab,
        scene: sceneFilter || undefined,
        page: p,
        pageSize: PAGE_SIZE,
      });
      setLoading(false);
      if (res.ok && res.data) {
        setItems((prev) => (append ? [...prev, ...res.data.items] : res.data.items));
        setTotal(res.data.total);
        setPage(p);
      }
    },
    [app, productId, tab, sceneFilter],
  );

  // 打开/切 tab/换过滤:回第一页
  useEffect(() => {
    if (!open) return;
    load(1, false);
  }, [open, load]);

  const refresh = useCallback(() => load(1, false), [load]);

  return (
    <Drawer
      title={`🕘 ${t('Creation history')}`}
      width={720}
      open={open}
      onClose={onClose}
      styles={{ body: { padding: '12px 20px' } }}
      data-testid="ws-history"
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        <Segmented
          size="small"
          value={tab}
          onChange={(v) => setTab(v as 'image' | 'video')}
          options={[
            { value: 'image', label: `🖼 ${t('Images')}` },
            { value: 'video', label: `🎬 ${t('Videos')}` },
          ]}
        />
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {t('{{n}} records', { n: total })}
        </Typography.Text>
      </div>
      {/* 功能过滤 chips(仅图片 tab;视频无 scene 维度) */}
      {tab === 'image' ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
          <Tag.CheckableTag checked={!sceneFilter} onChange={() => setSceneFilter('')}>
            {t('All')}
          </Tag.CheckableTag>
          {WORKSHOP_FUNCTIONS.filter((fn) => fn.enabled).map((fn) => (
            <Tag.CheckableTag
              key={fn.key}
              checked={sceneFilter === fn.key}
              onChange={(on) => setSceneFilter(on ? fn.key : '')}
            >
              {funcLabel(fn.key)}
            </Tag.CheckableTag>
          ))}
        </div>
      ) : null}

      <Spin spinning={loading && !items.length}>
        {items.length ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {items.map((it) => {
              const tag = STATUS_TAG[it.status];
              const instr = String(it.genParams?.instruction || '');
              return (
                <div
                  key={`${it.kind}-${it.id}`}
                  data-testid="ws-history-item"
                  style={{
                    display: 'flex',
                    gap: 12,
                    alignItems: 'flex-start',
                    border: '1px solid #f0f0f0',
                    borderRadius: 10,
                    padding: 10,
                    background: '#fff',
                  }}
                >
                  <div
                    style={{
                      width: 72,
                      height: 72,
                      flexShrink: 0,
                      borderRadius: 8,
                      overflow: 'hidden',
                      background: '#f4f5f7',
                      display: 'grid',
                      placeItems: 'center',
                      // 已弃用的历史图降饱和,一眼与在役候选区分
                      filter: it.status === 'discarded' ? 'grayscale(.8)' : undefined,
                      opacity: it.status === 'discarded' ? 0.75 : 1,
                    }}
                  >
                    {it.url ? (
                      it.assetType === 'video' ? (
                        <video src={it.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted />
                      ) : (
                        <img
                          src={it.url}
                          alt={instr || String(it.id)}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      )
                    ) : (
                      <span style={{ fontSize: 22 }}>{it.status === 'failed' ? '⚠️' : '🖼'}</span>
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <Tag color={tag.color} style={{ margin: 0 }}>
                        {t(tag.label)}
                      </Tag>
                      <Typography.Text strong style={{ fontSize: 12.5 }}>
                        {it.scene ? funcLabel(it.scene) : t('Freeform')}
                      </Typography.Text>
                      <Typography.Text type="secondary" style={{ fontSize: 11.5 }}>
                        {relTime(it.createdAt, t)}
                      </Typography.Text>
                      {/* W6:当次消耗(记账值;失败任务无消耗) */}
                      {it.genParams?.estimatedBeans ? (
                        <Typography.Text style={{ fontSize: 11.5, color: '#faad14' }}>
                          {it.genParams.estimatedBeans} {t('beans')}
                        </Typography.Text>
                      ) : null}
                    </div>
                    {instr ? (
                      <Typography.Paragraph
                        type="secondary"
                        style={{ fontSize: 12, margin: '6px 0 0' }}
                        ellipsis={{ rows: 2 }}
                      >
                        {instr}
                      </Typography.Paragraph>
                    ) : null}
                    {it.errorMessage ? (
                      <Typography.Paragraph
                        style={{ fontSize: 12, margin: '6px 0 0', color: '#cf1322' }}
                        ellipsis={{ rows: 2 }}
                      >
                        {it.errorMessage}
                      </Typography.Paragraph>
                    ) : null}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
                    {it.kind === 'failed' ? (
                      <Button size="small" type="primary" ghost onClick={() => onRetry(it)}>
                        🔄 {t('Retry with same settings')}
                      </Button>
                    ) : (
                      <>
                        {it.url ? (
                          <Button size="small" onClick={() => onDownload(it)}>
                            ⬇ {t('Download')}
                          </Button>
                        ) : null}
                        {it.assetType === 'image' ? (
                          <Button size="small" onClick={() => onEditAgain(it)}>
                            ✏️ {t('Edit again')}
                          </Button>
                        ) : null}
                        {it.status === 'candidate' ? (
                          <Button
                            size="small"
                            danger
                            onClick={async () => {
                              await onDiscard(it);
                              refresh();
                            }}
                          >
                            {t('Discard')}
                          </Button>
                        ) : null}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : loading ? null : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('No generation records yet')} />
        )}
      </Spin>
      {items.length < total ? (
        <div style={{ textAlign: 'center', marginTop: 14 }}>
          <Button loading={loading} onClick={() => load(page + 1, true)}>
            {t('Load more')} ({items.length}/{total})
          </Button>
        </div>
      ) : null}
    </Drawer>
  );
}
