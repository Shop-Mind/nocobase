/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// 创意工坊「智能视频」tab(对标官方 4 类:图生/首尾帧/文生/数字人;P8 优先落地图生视频 i2v)。
// 铁律不变:生成只产视频候选(origin=ai_candidate,不进发布),采纳=用户显式动作(actorType=user)后进商品视频位。
// 视频耗时数分钟 → 异步:generateVideo 建任务拿 jobId → 轮询 videoJobStatus 推进进度 → 完成落视频候选可播放/采纳。
// 视频端点(DashScope 万相 i2v)强制公网 img_url,源图由后端 toPublicUrl 归一化(生产配 AI_LISTING_PUBLIC_BASE_URL)。

import React, { useCallback, useEffect, useState } from 'react';
import { App as AntdApp, Button, Empty, Input, Segmented, Space, Spin, Tag, Tooltip, Typography } from 'antd';
import { callMediaApi, type MediaAsset, type MediaStudioApp } from '../MediaStudio/types';

// 与 CreativeWorkshop.CarryImage 结构兼容(只取视频源需要的字段)
export interface VideoSource {
  key: string;
  assetId?: number;
  url: string | null;
  role?: string | null;
}

interface VideoPaneProps {
  app: MediaStudioApp;
  productId: number;
  sources: VideoSource[];
  loadingSources?: boolean;
  t: (key: string) => string;
}

// 视频子类型(对标官方):i2v 已上线,其余占位置灰。
const VIDEO_MODES: Array<{ key: string; label: string; enabled: boolean }> = [
  { key: 'i2v', label: '图生视频', enabled: true },
  { key: 'keyframe', label: '首尾帧', enabled: false },
  { key: 't2v', label: '文生视频', enabled: false },
  { key: 'digital_human', label: '数字人', enabled: false },
];
const DURATIONS = [3, 5];
const RESOLUTIONS = ['720P', '1080P'];
const POLL_MS = 5000;

type JobState = 'idle' | 'running' | 'success' | 'failed';

export function VideoPane({ app, productId, sources, loadingSources, t }: VideoPaneProps) {
  const { message } = AntdApp.useApp();
  const [mode, setMode] = useState<string>('i2v');
  const [sel, setSel] = useState<string>(''); // 选中源图 key(单选)
  const [duration, setDuration] = useState<number>(5);
  const [resolution, setResolution] = useState<string>('720P');
  const [prompt, setPrompt] = useState<string>('');
  const [jobId, setJobId] = useState<number | null>(null);
  const [jobState, setJobState] = useState<JobState>('idle');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [videoCandidates, setVideoCandidates] = useState<MediaAsset[]>([]);
  const [videoAdopted, setVideoAdopted] = useState<MediaAsset[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [adoptingId, setAdoptingId] = useState<number | null>(null);

  // 默认选中主图(或第一张)
  useEffect(() => {
    if (sel || !sources.length) return;
    const main = sources.find((s) => s.role === 'main') || sources[0];
    if (main) setSel(main.key);
  }, [sources, sel]);

  const refresh = useCallback(async () => {
    const res = await callMediaApi<{ videoCandidates?: MediaAsset[]; videoAdopted?: MediaAsset[] }>(
      app,
      'aiListingMedia:candidates',
      { productId },
    );
    if (res.ok && res.data) {
      setVideoCandidates(res.data.videoCandidates || []);
      setVideoAdopted(res.data.videoAdopted || []);
    }
  }, [app, productId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // 轮询任务态(video 耗时数分钟):running 时每 5s 查一次;成功/失败停轮询并刷新候选
  useEffect(() => {
    if (jobState !== 'running' || !jobId) return;
    const iv = setInterval(async () => {
      const res = await callMediaApi<{ status: string; assetId?: number; errorMessage?: string }>(
        app,
        'aiListingMedia:videoJobStatus',
        { jobId },
      );
      if (!res.ok) return;
      const st = res.data?.status;
      if (st === 'success') {
        clearInterval(iv);
        setJobState('success');
        message.success(t('Video candidate ready'));
        refresh();
      } else if (st === 'failed') {
        clearInterval(iv);
        setJobState('failed');
        setErrorMsg(res.data?.errorMessage || t('Video generation failed'));
      }
    }, POLL_MS);
    return () => clearInterval(iv);
  }, [jobState, jobId, app, message, t, refresh]);

  const doGenerate = useCallback(async () => {
    const src = sources.find((s) => s.key === sel);
    if (!src) {
      message.warning(t('Select a source image first'));
      return;
    }
    setSubmitting(true);
    setErrorMsg('');
    const res = await callMediaApi<{ jobId: number }>(app, 'aiListingMedia:generateVideo', {
      productId,
      assetId: src.assetId,
      sourceImageUrl: src.assetId ? undefined : src.url || undefined,
      prompt: prompt.trim() || undefined,
      duration,
      resolution,
    });
    setSubmitting(false);
    if (res.ok && res.data?.jobId) {
      setJobId(res.data.jobId);
      setJobState('running');
      message.success(t('Video task submitted — generating…'));
    } else {
      setJobState('failed');
      setErrorMsg(res.message || t('Video generation failed'));
      message.error(res.message || t('Video generation failed'));
    }
  }, [app, productId, sources, sel, prompt, duration, resolution, message, t]);

  const doAdopt = useCallback(
    async (asset: MediaAsset) => {
      setAdoptingId(asset.id);
      const res = await callMediaApi(app, 'aiListingMedia:adopt', { assetId: asset.id });
      setAdoptingId(null);
      if (res.ok) {
        message.success(t('Adopted as product video'));
        refresh();
      } else {
        message.error(res.message || t('Adopt failed'));
      }
    },
    [app, message, t, refresh],
  );

  const doDiscard = useCallback(
    async (asset: MediaAsset) => {
      const res = await callMediaApi(app, 'aiListingMedia:discard', { assetId: asset.id });
      if (res.ok) {
        message.success(t('Discarded'));
        refresh();
      } else {
        message.error(res.message || t('Discard failed'));
      }
    },
    [app, message, t, refresh],
  );

  const activeMode = VIDEO_MODES.find((m) => m.key === mode) || VIDEO_MODES[0];

  return (
    <div style={{ display: 'flex', minHeight: 560 }}>
      {/* 左:视频子类型 */}
      <div style={{ width: 108, borderRight: '1px solid #f0f0f0', background: '#fafbfc', padding: '10px 0' }}>
        {VIDEO_MODES.map((m) => {
          const on = m.key === mode;
          const inner = (
            <div
              key={m.key}
              role="button"
              tabIndex={m.enabled ? 0 : -1}
              aria-disabled={!m.enabled}
              onClick={() => (m.enabled ? setMode(m.key) : undefined)}
              onKeyDown={(e) => (e.key === 'Enter' && m.enabled ? setMode(m.key) : undefined)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 12px',
                cursor: m.enabled ? 'pointer' : 'not-allowed',
                opacity: m.enabled ? 1 : 0.4,
                color: on ? '#1677ff' : '#6b7280',
                fontWeight: on ? 600 : 400,
                borderLeft: `3px solid ${on ? '#1677ff' : 'transparent'}`,
                fontSize: 13,
              }}
            >
              🎬 {t(`workshop.video.${m.key}`) !== `workshop.video.${m.key}` ? t(`workshop.video.${m.key}`) : m.label}
              {!m.enabled ? (
                <span
                  style={{
                    marginLeft: 'auto',
                    fontSize: 9,
                    background: '#bfbfbf',
                    color: '#fff',
                    borderRadius: 6,
                    padding: '0 4px',
                  }}
                >
                  {t('Soon')}
                </span>
              ) : null}
            </div>
          );
          return m.enabled ? (
            inner
          ) : (
            <Tooltip key={m.key} title={`${m.label} · ${t('Coming soon')}`}>
              {inner}
            </Tooltip>
          );
        })}
      </div>

      {/* 中:图生视频表单 */}
      <div style={{ flex: 1, minWidth: 0, padding: '18px 22px', borderRight: '1px solid #f0f0f0', overflowY: 'auto' }}>
        <Typography.Title level={4} style={{ margin: '0 0 4px' }}>
          🎬 {t('Image to video')} <Tag color="purple">{t('Advanced tier')}</Tag>
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ fontSize: 12.5, marginBottom: 16 }}>
          {t('Turn a product image into a short dynamic showcase video.')}
        </Typography.Paragraph>

        {/* 选源图(单选) */}
        <Typography.Text strong style={{ fontSize: 13 }}>
          🖼️ {t('Source image')}{' '}
          <Typography.Text type="secondary" style={{ fontWeight: 400, fontSize: 11 }}>
            {t('single image · click to switch')}
          </Typography.Text>
        </Typography.Text>
        <Spin spinning={Boolean(loadingSources)}>
          {sources.length ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, margin: '8px 0 16px' }}>
              {sources.map((s) => {
                const on = s.key === sel;
                return (
                  <div
                    key={s.key}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSel(s.key)}
                    onKeyDown={(e) => (e.key === 'Enter' ? setSel(s.key) : undefined)}
                    style={{
                      position: 'relative',
                      aspectRatio: '1 / 1',
                      borderRadius: 8,
                      overflow: 'hidden',
                      border: on ? '2px solid #722ed1' : '1px solid #e5e7eb',
                      boxShadow: on ? '0 0 0 2px rgba(114,46,209,.12)' : 'none',
                      cursor: 'pointer',
                      background: '#f4f5f7',
                    }}
                  >
                    {s.url ? (
                      <img
                        src={s.url}
                        alt={String(s.role || s.key)}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : null}
                    {on ? (
                      <span
                        aria-hidden
                        style={{
                          position: 'absolute',
                          right: 4,
                          top: 4,
                          width: 17,
                          height: 17,
                          borderRadius: 5,
                          background: '#722ed1',
                          color: '#fff',
                          fontSize: 11,
                          lineHeight: '17px',
                          textAlign: 'center',
                        }}
                      >
                        ✓
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('No images yet')} style={{ margin: '12px 0' }} />
          )}
        </Spin>

        {/* 时长 + 分辨率 */}
        <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', marginBottom: 16 }}>
          <div>
            <Typography.Text strong style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>
              ⏱️ {t('Duration')}
            </Typography.Text>
            <Segmented
              value={duration}
              onChange={(v) => setDuration(Number(v))}
              options={DURATIONS.map((d) => ({ value: d, label: `${d}s` }))}
            />
          </div>
          <div>
            <Typography.Text strong style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>
              🖥️ {t('Resolution')}
            </Typography.Text>
            <Segmented value={resolution} onChange={(v) => setResolution(String(v))} options={RESOLUTIONS} />
          </div>
        </div>

        {/* 运镜 / 画面描述 */}
        <Typography.Text strong style={{ fontSize: 13 }}>
          🎥 {t('Camera / motion')}{' '}
          <Typography.Text type="secondary" style={{ fontWeight: 400, fontSize: 11 }}>
            {t('optional')}
          </Typography.Text>
        </Typography.Text>
        <Input.TextArea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={t('e.g. slowly rotate the product, camera pushes in to show detail')}
          maxLength={300}
          showCount
          rows={3}
          style={{ margin: '8px 0 16px' }}
        />

        {/* 生成 + 进度态 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, borderTop: '1px solid #f0f0f0', paddingTop: 14 }}>
          <Button
            type="primary"
            size="large"
            loading={submitting || jobState === 'running'}
            disabled={!sel || !activeMode.enabled}
            onClick={doGenerate}
          >
            🎬 {jobState === 'running' ? t('Generating…') : t('Generate video')}
          </Button>
          {jobState === 'running' ? (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              <Spin size="small" />{' '}
              {t('Video takes a few minutes — you can keep working; it will appear below when ready.')}
            </Typography.Text>
          ) : null}
          {jobState === 'failed' ? (
            <Space>
              <Typography.Text type="danger" style={{ fontSize: 12 }}>
                {errorMsg || t('Video generation failed')}
              </Typography.Text>
              <Button size="small" onClick={doGenerate}>
                {t('Retry')}
              </Button>
            </Space>
          ) : null}
        </div>
      </div>

      {/* 右:视频候选 / 已采纳 */}
      <div style={{ width: 340, flexShrink: 0, padding: '18px 16px', background: '#fafbfc', overflowY: 'auto' }}>
        {videoAdopted.length ? (
          <div style={{ marginBottom: 18 }}>
            <Typography.Text type="secondary" style={{ fontSize: 12.5, fontWeight: 600 }}>
              ✅ {t('Product video (adopted)')}
            </Typography.Text>
            {videoAdopted.map((v) => (
              <div key={v.id} style={{ marginTop: 10 }}>
                {v.url ? (
                  <video src={v.url} controls style={{ width: '100%', borderRadius: 8, background: '#000' }} />
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        <Typography.Text type="secondary" style={{ fontSize: 12.5, fontWeight: 600 }}>
          🎉 {t('Video candidates')}
          {videoCandidates.length ? (
            <Typography.Text style={{ color: '#722ed1' }}> ({videoCandidates.length})</Typography.Text>
          ) : null}
        </Typography.Text>
        {videoCandidates.length ? (
          <Space direction="vertical" style={{ width: '100%', marginTop: 10 }} size={14}>
            {videoCandidates.map((v) => (
              <div
                key={v.id}
                style={{ border: '1px solid #efdbff', borderRadius: 10, padding: 10, background: '#fff' }}
              >
                {v.url ? (
                  <video src={v.url} controls style={{ width: '100%', borderRadius: 6, background: '#000' }} />
                ) : null}
                <Space style={{ marginTop: 8 }}>
                  <Button type="primary" loading={adoptingId === v.id} onClick={() => doAdopt(v)}>
                    ✓ {t('Adopt')}
                  </Button>
                  <Button danger onClick={() => doDiscard(v)}>
                    {t('Discard')}
                  </Button>
                </Space>
              </div>
            ))}
          </Space>
        ) : (
          <div
            style={{
              border: '1.5px dashed #e5e7eb',
              borderRadius: 10,
              padding: '24px 12px',
              textAlign: 'center',
              color: '#9ca3af',
              fontSize: 12,
              marginTop: 10,
            }}
          >
            🎬 {t('Video candidates will appear here → play / adopt / discard')}
          </div>
        )}
        <Typography.Paragraph type="secondary" style={{ fontSize: 11, marginTop: 12 }}>
          {t('Adopting sets the product video (audit as user); publish carries the adopted video.')}
        </Typography.Paragraph>
      </div>
    </div>
  );
}
