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
import {
  App as AntdApp,
  Button,
  Empty,
  Input,
  Modal,
  Popconfirm,
  Segmented,
  Select,
  Space,
  Spin,
  Tabs,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
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
  t: (key: string, options?: Record<string, unknown>) => string;
}

// 视频子类型(对标官方):i2v 已上线,其余占位置灰。
const VIDEO_MODES: Array<{ key: string; label: string; enabled: boolean }> = [
  { key: 'i2v', label: '图生视频', enabled: true },
  // t2v 经 grok imagine 实测可用(2026-07-10);首尾帧/数字人需专用端点,待账号/线路就绪
  { key: 't2v', label: '文生视频', enabled: true },
  { key: 'keyframe', label: '首尾帧', enabled: false },
  { key: 'digital_human', label: '数字人', enabled: false },
];
// 分线参数集:imagine(grok2api video_config 实测生效:seconds/resolution_name/size)vs 万相(dashscope 原生)
const IMAGINE_DURATIONS = [6, 10];
const WAN_DURATIONS = [5, 10];
const IMAGINE_RESOLUTIONS = ['480p', '720p'];
const WAN_RESOLUTIONS = ['720P', '1080P'];
// 画幅(imagine 线 video_config.size):电商三常用档;万相线按源图画幅,不出此控件
const IMAGINE_SIZES = [
  { key: '9:16', size: '720x1280', labelKey: '9:16 portrait' },
  { key: '16:9', size: '1280x720', labelKey: '16:9 landscape' },
  { key: '1:1', size: '1024x1024', labelKey: '1:1 square' },
];
const POLL_MS = 5000;

// 快捷模板(对齐旧版「视频参数设置」弹窗的快捷模板,话术按专业电商产品视频重写):点击整填提示词,可再手改。
// 每条都带商品保护约束(真实/不变形/外观一致)——图生视频最常见的翻车是商品被模型改样。
// 「智能推理(推荐)」不在此列:它复用推荐提示词三级链(看图/看标题),在组件内单独处理。
const QUICK_TEMPLATES: Array<{ key: string; labelKey: string; prompt: string }> = [
  {
    key: 'detail',
    labelKey: 'Product detail showcase',
    prompt:
      '微距特写镜头沿商品表面缓慢平移,逐一展示材质纹理、缝线与工艺细节,焦点精准,柔和棚拍侧光,背景虚化,商品保持真实不变形',
  },
  {
    key: 'usage',
    labelKey: 'Usage demonstration',
    prompt:
      '真人手部自然入镜,演示商品核心使用方式,动作流畅清晰,中景切换特写,明亮生活化光线,突出使用效果与便利性,商品保持真实原貌',
  },
  {
    key: 'rotate',
    labelKey: '360° panorama showcase',
    prompt:
      '商品置于纯色摄影棚背景中央,360度匀速旋转完整展示各个角度,专业三点布光,台面倒影细腻,画面稳定无抖动,商品比例真实',
  },
  {
    key: 'lifestyle',
    labelKey: 'Lifestyle & outfit showcase',
    prompt:
      '真实生活场景中自然使用与穿搭商品,镜头缓慢环绕或平滑跟随,氛围光影层次丰富,突出上身与使用效果,商品外观细节保持一致',
  },
];

type JobState = 'idle' | 'running' | 'success' | 'failed';

export function VideoPane({ app, productId, sources, loadingSources, t }: VideoPaneProps) {
  const { message } = AntdApp.useApp();
  const [mode, setMode] = useState<string>('i2v');
  const [sel, setSel] = useState<string>(''); // 选中源图 key(单选)
  // 多图 AI 成片:勾选 2-5 张(独立于单选;≥2 时生成按钮切换为多图成片)
  const [multi, setMulti] = useState<Set<string>>(new Set());
  const [duration, setDuration] = useState<number>(6);
  const [resolution, setResolution] = useState<string>('720p');
  const [aspect, setAspect] = useState<string>('9:16');
  const [prompt, setPrompt] = useState<string>('');
  const [jobId, setJobId] = useState<number | null>(null);
  const [jobState, setJobState] = useState<JobState>('idle');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [videoCandidates, setVideoCandidates] = useState<MediaAsset[]>([]);
  const [videoAdopted, setVideoAdopted] = useState<MediaAsset[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [adoptingId, setAdoptingId] = useState<number | null>(null);
  // 模版风格选择(对齐阿里场景视频:推荐提示词 / 自定义模版 两 tab)
  const [tplTab, setTplTab] = useState<string>('reco');
  const [recos, setRecos] = useState<string[]>([]);
  const [recosLoading, setRecosLoading] = useState(false);
  const [recosBasis, setRecosBasis] = useState<'image' | 'title' | 'static'>('static');
  const [recosModel, setRecosModel] = useState<string | null>(null);
  const [myTpls, setMyTpls] = useState<Array<{ id: number; title: string; prompt: string; thumbUrl: string | null }>>(
    [],
  );
  const [tplSelected, setTplSelected] = useState<number | null>(null);
  const [newTplOpen, setNewTplOpen] = useState(false);
  const [newTpl, setNewTpl] = useState<{ title: string; prompt: string }>({ title: '', prompt: '' });
  const [newTplSaving, setNewTplSaving] = useState(false);
  // 模型可选(用户反馈):视频生成模型(video_gen)与推荐词模型(chat)都可显式指定,'' = 自动
  const [videoModels, setVideoModels] = useState<Array<{ llmService: string; model: string; label: string }>>([]);
  const [videoModelKey, setVideoModelKey] = useState<string>('');
  // imagine 系(grok2api 线):video_config 通道实测生效(seconds 10→10.04s 片、size 1280x720→横屏),参数真实可控
  const isImagine = /grok|imagine/i.test(videoModelKey);
  const [chatModels, setChatModels] = useState<Array<{ llmService: string; model: string; label: string }>>([]);
  const [recoModelKey, setRecoModelKey] = useState<string>('');

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

  // 推荐提示词(视频运镜创意,scene='video' 走 suggest 三级链):选中源图变化即重新出词。
  // 返回本次拿到的词列表,供「智能推理」快捷模板直接消费(避免读 state 的旧闭包)。
  const fetchRecos = useCallback(async (): Promise<string[]> => {
    const src = sources.find((x) => x.key === sel);
    if (!src) return [];
    setRecosLoading(true);
    const [recoSvc, recoModel] = recoModelKey ? recoModelKey.split(/:(.+)/) : [undefined, undefined];
    const res = await callMediaApi<{
      prompts: string[];
      fallback: boolean;
      model: string | null;
      basis?: 'image' | 'title' | 'static';
    }>(app, 'aiListingMedia:suggestPrompts', {
      assetId: src.assetId,
      sourceImageUrl: src.assetId ? undefined : src.url || undefined,
      scene: 'video',
      n: 3,
      llmService: recoSvc,
      model: recoModel,
    });
    setRecosLoading(false);
    if (res.ok && res.data) {
      setRecos(res.data.prompts || []);
      setRecosBasis(res.data.basis || (res.data.fallback ? 'static' : 'image'));
      setRecosModel(res.data.model || null);
      return res.data.prompts || [];
    }
    return [];
  }, [app, sources, sel, recoModelKey]);

  // 快捷模板「智能推理(推荐)」:填入 AI 推荐词首条;已是推荐词时再点循环换下一条;还没出词就现场拉一次
  const applySmart = useCallback(async () => {
    if (recosLoading) {
      message.info(t('AI is composing recommendations — one moment…'));
      return;
    }
    let list = recos;
    if (!list.length) list = await fetchRecos();
    if (!list.length) {
      message.warning(t('No recommendations — enter manually below'));
      return;
    }
    const idx = list.indexOf(prompt);
    setPrompt(list[(idx + 1) % list.length]);
  }, [recos, recosLoading, prompt, fetchRecos, message, t]);

  useEffect(() => {
    if (sel) fetchRecos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel]);

  // 自定义模版(scene='video' 的个人模版,复用 W2 模版体系)
  const loadMyTpls = useCallback(async () => {
    const res = await callMediaApi<{
      mine: Array<{ id: number; title: string; prompt: string; thumbUrl: string | null }>;
    }>(app, 'aiListingMedia:styleTemplates', { scene: 'video' });
    if (res.ok && res.data) setMyTpls(res.data.mine || []);
  }, [app]);

  useEffect(() => {
    loadMyTpls();
  }, [loadMyTpls]);

  // 默认选中只在模型列表加载完成时做一次(load() 里 prev || …):这里绝不能再放「videoModelKey 为空就回填」
  // 的 effect——那会把用户手选的「自动选模型」('')瞬间弹回 grok,导致自动线永远选不上
  useEffect(() => {
    const load = async () => {
      const vm = await callMediaApi<{ models: Array<{ llmService: string; model: string; label: string }> }>(
        app,
        'aiListingMedia:listModels',
        { task: 'video_gen' },
      );
      if (vm.ok && vm.data?.models) {
        setVideoModels(vm.data.models);
        // 默认优先 grok imagine(实测可用线路);否则首个。DashScope Key 恢复后可切回「自动」走万相异步任务
        if (vm.data.models.length) {
          const preferred = vm.data.models.find((m) => /grok|imagine/i.test(m.model)) || vm.data.models[0];
          setVideoModelKey((prev) => prev || `${preferred.llmService}:${preferred.model}`);
        }
      }
      const cm = await callMediaApi<{ models: Array<{ llmService: string; model: string; label: string }> }>(
        app,
        'aiListingMedia:listModels',
        { task: 'chat' },
      );
      if (cm.ok && cm.data?.models) setChatModels(cm.data.models);
    };
    load();
  }, [app]);

  // 切换模型线时把时长/分辨率校正到该线的合法档(两线档位命名不同:6s/10s·480p/720p vs 5s/10s·720P/1080P)
  useEffect(() => {
    if (isImagine) {
      setDuration((d) => (IMAGINE_DURATIONS.includes(d) ? d : 6));
      setResolution((r) => (IMAGINE_RESOLUTIONS.includes(r) ? r : '720p'));
    } else {
      setDuration((d) => (WAN_DURATIONS.includes(d) ? d : 5));
      setResolution((r) => (WAN_RESOLUTIONS.includes(r) ? r : '720P'));
    }
  }, [isImagine]);

  const saveNewTpl = useCallback(async () => {
    const title = newTpl.title.trim();
    const tplPrompt = newTpl.prompt.trim();
    if (!title || !tplPrompt) {
      message.warning(t('Template title and prompt are required'));
      return;
    }
    setNewTplSaving(true);
    const res = await callMediaApi(app, 'aiListingMedia:saveStyleTemplate', {
      title,
      category: 'general',
      scene: 'video',
      prompt: tplPrompt,
    });
    setNewTplSaving(false);
    if (res.ok) {
      message.success(t('Template saved'));
      setNewTplOpen(false);
      setNewTpl({ title: '', prompt: '' });
      loadMyTpls();
    } else if (res.message) {
      message.error(res.message);
    }
  }, [app, newTpl, message, t, loadMyTpls]);

  const deleteTpl = useCallback(
    async (id: number) => {
      const res = await callMediaApi(app, 'aiListingMedia:deleteStyleTemplate', { id });
      if (res.ok) {
        message.success(t('Template deleted'));
        if (tplSelected === id) setTplSelected(null);
        loadMyTpls();
      } else if (res.message) {
        message.error(res.message);
      }
    },
    [app, message, t, loadMyTpls, tplSelected],
  );

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

  // 多图成片选中数(仅 i2v 模式生效)
  const multiCount = mode === 'i2v' ? multi.size : 0;

  const doGenerate = useCallback(async () => {
    const isT2V = mode === 't2v';
    const isMulti = !isT2V && multi.size >= 2;
    const src = sources.find((s) => s.key === sel);
    if (!isT2V && !isMulti && !src) {
      message.warning(t('Select a source image first'));
      return;
    }
    if (isT2V && !prompt.trim()) {
      message.warning(t('Describe the video you want first'));
      return;
    }
    if (isMulti && !isImagine) {
      message.warning(t('Multi-image film needs an explicit video model (grok line)'));
      return;
    }
    setSubmitting(true);
    setErrorMsg('');
    const [vSvc, vModel] = videoModelKey ? videoModelKey.split(/:(.+)/) : [undefined, undefined];
    const multiAssetIds = isMulti
      ? sources.filter((x) => multi.has(x.key) && x.assetId).map((x) => x.assetId as number)
      : undefined;
    const res = await callMediaApi<{ jobId: number }>(app, 'aiListingMedia:generateVideo', {
      productId,
      assetId: isT2V || isMulti ? undefined : src?.assetId,
      assetIds: multiAssetIds,
      sourceImageUrl: isT2V || isMulti ? undefined : src?.assetId ? undefined : src?.url || undefined,
      textToVideo: isT2V || undefined,
      prompt: prompt.trim() || undefined,
      duration,
      resolution,
      size: isImagine ? IMAGINE_SIZES.find((s) => s.key === aspect)?.size : undefined,
      llmService: vSvc,
      model: vModel,
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
  }, [
    app,
    productId,
    sources,
    sel,
    multi,
    mode,
    prompt,
    duration,
    resolution,
    aspect,
    isImagine,
    videoModelKey,
    message,
    t,
  ]);

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
          🎬 {mode === 't2v' ? t('Text to video') : t('Image to video')} <Tag color="purple">{t('Advanced tier')}</Tag>
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ fontSize: 12.5, marginBottom: 16 }}>
          {t('Turn a product image into a short dynamic showcase video.')}
        </Typography.Paragraph>

        {/* 选源图(单选);t2v 无需源图 */}
        {mode === 't2v' ? (
          <Typography.Paragraph type="secondary" style={{ fontSize: 12, margin: '4px 0 14px' }}>
            💡 {t('Text-to-video needs no source image — describe the scene in the prompt below.')}
          </Typography.Paragraph>
        ) : null}
        {mode !== 't2v' ? (
          <>
            <Typography.Text strong style={{ fontSize: 13 }}>
              🖼️ {t('Source image')}{' '}
              <Typography.Text type="secondary" style={{ fontWeight: 400, fontSize: 11 }}>
                {t('single image · click to switch')} · {t('tick 2-5 thumbnails for a multi-image film')}
              </Typography.Text>
            </Typography.Text>
            {/* 对齐阿里+用户反馈「图片改小」:64px 横排缩略条(横向滚动),不再整屏大网格 */}
            <Spin spinning={Boolean(loadingSources)}>
              {sources.length ? (
                <div style={{ display: 'flex', gap: 8, margin: '8px 0 16px', overflowX: 'auto', paddingBottom: 4 }}>
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
                          width: 64,
                          height: 64,
                          flexShrink: 0,
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
                        {/* 左上勾选=多图成片选择(与右上单选✓互不影响);仅有 assetId 的图可入选 */}
                        {s.assetId ? (
                          <span
                            role="checkbox"
                            aria-checked={multi.has(s.key)}
                            aria-label={t('Pick for multi-image film')}
                            tabIndex={0}
                            onClick={(e) => {
                              e.stopPropagation();
                              setMulti((prev) => {
                                const next = new Set(prev);
                                if (next.has(s.key)) next.delete(s.key);
                                else if (next.size < 5) next.add(s.key);
                                return next;
                              });
                            }}
                            onKeyDown={(e) => e.stopPropagation()}
                            style={{
                              position: 'absolute',
                              left: 3,
                              top: 3,
                              width: 15,
                              height: 15,
                              borderRadius: 4,
                              border: '1.5px solid #fff',
                              background: multi.has(s.key) ? '#16a34a' : 'rgba(20,18,30,.35)',
                              color: '#fff',
                              fontSize: 10,
                              lineHeight: '13px',
                              textAlign: 'center',
                              cursor: 'pointer',
                            }}
                          >
                            {multi.has(s.key) ? '✓' : ''}
                          </span>
                        ) : null}
                        {on ? (
                          <span
                            aria-hidden
                            style={{
                              position: 'absolute',
                              right: 3,
                              top: 3,
                              width: 15,
                              height: 15,
                              borderRadius: 4,
                              background: '#722ed1',
                              color: '#fff',
                              fontSize: 10,
                              lineHeight: '15px',
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
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={t('No images yet')}
                  style={{ margin: '12px 0' }}
                />
              )}
            </Spin>
          </>
        ) : null}

        {/* 模版风格选择(对齐阿里场景视频):推荐提示词(AI 看图出运镜创意)/ 自定义模版(scene='video' 个人库) */}
        <div style={{ marginBottom: 16 }} data-testid="ws-video-tpl-tabs">
          <Typography.Text strong style={{ fontSize: 13 }}>
            🎨 {t('Template styles')}
          </Typography.Text>
          <Tabs
            size="small"
            activeKey={tplTab}
            onChange={setTplTab}
            style={{ marginTop: 2 }}
            tabBarGutter={14}
            items={[
              {
                key: 'reco',
                label: t('Recommended prompts'),
                children: (
                  <div style={{ background: '#f9f0ff', border: '1px solid #efdbff', borderRadius: 10, padding: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 9, flexWrap: 'wrap' }}>
                      <Tag
                        color={recosBasis === 'static' && !recosLoading ? 'default' : 'purple'}
                        style={{ margin: 0 }}
                      >
                        {recosBasis === 'static' && !recosLoading ? t('Examples') : 'AI'}
                      </Tag>
                      <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                        {recosLoading
                          ? ''
                          : recosBasis === 'static'
                            ? t('vision model unavailable — static examples, editable')
                            : recosBasis === 'title'
                              ? `${t('based on the product title (image not analyzed)')} · ${recosModel || ''}`
                              : `${t('based on this product image')} · ${recosModel || ''}`}
                      </Typography.Text>
                      <Select
                        size="small"
                        style={{ marginLeft: 'auto', minWidth: 132, maxWidth: 200 }}
                        value={recoModelKey}
                        onChange={setRecoModelKey}
                        options={[
                          { value: '', label: t('Auto model') },
                          ...chatModels.map((m) => ({ value: `${m.llmService}:${m.model}`, label: m.label })),
                        ]}
                      />
                      <a onClick={() => fetchRecos()} style={{ fontSize: 11.5, color: '#722ed1' }}>
                        🔄 {t('Refresh')}
                      </a>
                    </div>
                    {recosLoading ? (
                      <div style={{ padding: '8px 0' }}>
                        <Spin size="small" />
                      </div>
                    ) : recos.length ? (
                      <Space direction="vertical" style={{ width: '100%' }} size={7}>
                        {recos.map((p, i) => (
                          <div
                            key={i}
                            style={{
                              display: 'flex',
                              gap: 8,
                              alignItems: 'center',
                              background: '#fff',
                              border: '1px solid #efdbff',
                              borderRadius: 8,
                              padding: '8px 10px',
                            }}
                          >
                            <Typography.Text style={{ flex: 1, fontSize: 12.5 }}>{p}</Typography.Text>
                            <Button
                              size="small"
                              onClick={() => setPrompt(p)}
                              style={{ color: '#722ed1', borderColor: '#d3adf7' }}
                            >
                              {t('Fill in')}
                            </Button>
                          </div>
                        ))}
                      </Space>
                    ) : (
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {t('No recommendations — enter manually below')}
                      </Typography.Text>
                    )}
                  </div>
                ),
              },
              {
                key: 'mine',
                label: t('My templates'),
                children: (
                  <div data-testid="ws-video-tpl-mine">
                    {myTpls.length ? (
                      <Space direction="vertical" style={{ width: '100%' }} size={7}>
                        {myTpls.map((tpl) => (
                          <div
                            key={tpl.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => {
                              if (tplSelected === tpl.id) {
                                setTplSelected(null);
                                setPrompt((prev) => (prev === tpl.prompt ? '' : prev));
                              } else {
                                setTplSelected(tpl.id);
                                setPrompt(tpl.prompt);
                              }
                            }}
                            onKeyDown={(e) => (e.key === 'Enter' ? setPrompt(tpl.prompt) : undefined)}
                            style={{
                              display: 'flex',
                              gap: 8,
                              alignItems: 'center',
                              border: tplSelected === tpl.id ? '2px solid #7a5cff' : '1px solid #e5e7eb',
                              borderRadius: 8,
                              padding: '8px 10px',
                              cursor: 'pointer',
                              background: '#fff',
                            }}
                          >
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <Typography.Text strong style={{ fontSize: 12.5, display: 'block' }}>
                                {tpl.title}
                              </Typography.Text>
                              <Typography.Text type="secondary" style={{ fontSize: 11.5 }} ellipsis>
                                {tpl.prompt}
                              </Typography.Text>
                            </div>
                            <Popconfirm
                              title={t('Delete this template?')}
                              okText={t('Delete')}
                              cancelText={t('Cancel')}
                              onConfirm={(e) => {
                                e?.stopPropagation();
                                deleteTpl(tpl.id);
                              }}
                              onCancel={(e) => e?.stopPropagation()}
                            >
                              <Button size="small" danger type="text" onClick={(e) => e.stopPropagation()}>
                                ✕
                              </Button>
                            </Popconfirm>
                          </div>
                        ))}
                      </Space>
                    ) : (
                      <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
                        {t('No custom templates yet — save a good result as a template, or create one below.')}
                      </Typography.Text>
                    )}
                    <Button
                      size="small"
                      style={{ marginTop: 10 }}
                      onClick={() => {
                        setNewTpl({ title: '', prompt: prompt || '' });
                        setNewTplOpen(true);
                      }}
                    >
                      ＋ {t('New template')}
                    </Button>
                  </div>
                ),
              },
            ]}
          />
        </div>

        {/* 快捷模板(参考旧版视频参数设置):智能推理=推荐词三级链;其余为专业运镜预设,点击整填、再点取消 */}
        <div style={{ marginBottom: 6 }}>
          <Typography.Text strong style={{ fontSize: 13 }}>
            ⚡ {t('Quick templates')}
          </Typography.Text>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }} data-testid="ws-video-quick-tpl">
          {/* CheckableTag 类型不收 tabIndex/onKeyDown,键盘可达性放外层 span */}
          <span
            role="button"
            tabIndex={0}
            onKeyDown={(e) => (e.key === 'Enter' ? applySmart() : undefined)}
            style={{ display: 'inline-block' }}
          >
            <Tag.CheckableTag
              checked={Boolean(prompt) && recos.includes(prompt)}
              onChange={() => applySmart()}
              style={{ border: '1px solid #d3adf7', borderRadius: 14, padding: '2px 10px', fontSize: 12 }}
            >
              🪄 {t('Smart suggest (recommended)')}
              {recosLoading ? ' …' : ''}
            </Tag.CheckableTag>
          </span>
          {QUICK_TEMPLATES.map((q) => (
            <span
              key={q.key}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => (e.key === 'Enter' ? setPrompt(prompt === q.prompt ? '' : q.prompt) : undefined)}
              style={{ display: 'inline-block' }}
            >
              <Tag.CheckableTag
                checked={prompt === q.prompt}
                onChange={(on) => setPrompt(on ? q.prompt : '')}
                style={{ border: '1px solid #e5e7eb', borderRadius: 14, padding: '2px 10px', fontSize: 12 }}
              >
                {t(q.labelKey)}
              </Tag.CheckableTag>
            </span>
          ))}
        </div>

        {/* 提示词描述(对齐阿里;含运镜/画面要求) */}
        <Typography.Text strong style={{ fontSize: 13 }}>
          🎥 {t('Prompt')}{' '}
          <Typography.Text type="secondary" style={{ fontWeight: 400, fontSize: 11 }}>
            {t('optional')}
          </Typography.Text>
        </Typography.Text>
        <Input.TextArea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={t('e.g. slowly rotate the product, camera pushes in to show detail')}
          maxLength={500}
          showCount
          rows={4}
          style={{ margin: '8px 0 16px' }}
        />

        {/* 时长 + 分辨率:imagine 系走 chat 形状,时长/分辨率参数无通道送达模型(固定 ~6s·720×1280),
            两个控件置灰并说明,避免「选了 10s 却出 6s」的误导;万相线真透传,切模型即恢复可选 */}
        <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', marginBottom: 16 }}>
          <div>
            <Typography.Text strong style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>
              ⏱️ {t('Duration')}
            </Typography.Text>
            <Segmented
              value={duration}
              onChange={(v) => setDuration(Number(v))}
              options={(isImagine ? IMAGINE_DURATIONS : WAN_DURATIONS).map((d) => ({ value: d, label: `${d}s` }))}
            />
          </div>
          <div>
            <Typography.Text strong style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>
              🖥️ {t('Resolution')}
            </Typography.Text>
            <Segmented
              value={resolution}
              onChange={(v) => setResolution(String(v))}
              options={isImagine ? IMAGINE_RESOLUTIONS : WAN_RESOLUTIONS}
            />
          </div>
          {isImagine ? (
            <div>
              <Typography.Text strong style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>
                🎞️ {t('Aspect')}
              </Typography.Text>
              <Segmented
                value={aspect}
                onChange={(v) => setAspect(String(v))}
                options={IMAGINE_SIZES.map((s) => ({ value: s.key, label: t(s.labelKey) }))}
              />
            </div>
          ) : null}
          <div style={{ minWidth: 220 }}>
            <Typography.Text strong style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>
              ⚙️ {t('Video model')}
            </Typography.Text>
            <Select
              size="small"
              style={{ width: '100%' }}
              value={videoModelKey}
              onChange={setVideoModelKey}
              data-testid="ws-video-model"
              options={[
                { value: '', label: t('Auto model') },
                ...videoModels.map((m) => ({ value: `${m.llmService}:${m.model}`, label: m.label })),
              ]}
            />
          </div>
        </div>

        {/* 生成 + 进度态 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, borderTop: '1px solid #f0f0f0', paddingTop: 14 }}>
          <Button
            type="primary"
            size="large"
            loading={submitting || jobState === 'running'}
            disabled={
              mode === 't2v'
                ? !prompt.trim() || !videoModelKey
                : multiCount >= 2
                  ? !videoModelKey
                  : !sel || !activeMode.enabled
            }
            onClick={doGenerate}
          >
            🎬{' '}
            {jobState === 'running'
              ? t('Generating…')
              : multiCount >= 2
                ? `${t('Generate multi-image film')} (${multiCount})`
                : t('Generate video')}
          </Button>
          {multiCount >= 2 && jobState !== 'running' ? (
            <Typography.Text type="secondary" style={{ fontSize: 11 }}>
              {t('{{n}} segments, generated one by one then stitched into a single film', { n: multiCount })}
            </Typography.Text>
          ) : null}
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

      {/* 新建视频自定义模版(scene='video',复用 W2 模版体系) */}
      <Modal
        title={t('New template')}
        open={newTplOpen}
        onCancel={() => setNewTplOpen(false)}
        onOk={() => saveNewTpl()}
        okText={t('Save')}
        cancelText={t('Cancel')}
        confirmLoading={newTplSaving}
        width={460}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
          <div>
            <Typography.Text strong style={{ fontSize: 12.5 }}>
              {t('Template title')} <span style={{ color: '#ff4d4f' }}>*</span>
            </Typography.Text>
            <Input
              value={newTpl.title}
              maxLength={30}
              showCount
              onChange={(e) => setNewTpl((prev) => ({ ...prev, title: e.target.value }))}
              style={{ marginTop: 6 }}
            />
          </div>
          <div>
            <Typography.Text strong style={{ fontSize: 12.5 }}>
              {t('Template prompt')} <span style={{ color: '#ff4d4f' }}>*</span>
            </Typography.Text>
            <Input.TextArea
              value={newTpl.prompt}
              maxLength={500}
              showCount
              rows={4}
              onChange={(e) => setNewTpl((prev) => ({ ...prev, prompt: e.target.value }))}
              style={{ marginTop: 6 }}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
