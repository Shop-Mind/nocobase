/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// 预览编辑页「商品图片 · AI 改图」区(Creative Console 视觉,Phase 1)。卡壳 + 标题由外层 jsBlock 的 antd Card 提供,
// 本组件只渲染:工具栏 studio-tools + studio-body(左图集列 gcol/gscroll[视频入列 vslot] + 右舞台 stage)。
//   深墨区头 studio-head 归 Phase 3(jsBlock Card 头 → 深墨,随客户端一起上线,避免与卡壳标题重复/生产端无头)。
// 舞台双模式:预览(点任意缩略图/视频即大图) / 对比(选中候选 → 原图↔候选拉帘,复用 CompareView)。
// 安全铁律:生成只产候选(不进发布);采纳/弃用是用户显式动作,走受控 action + 审计。AI 改图重活交给原生抽屉。

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { App as AntdApp, Empty, InputNumber, Modal, Select, Spin, Typography } from 'antd';
import { CompareView } from './CompareModal';
import { AdoptModal, type AdoptChoice } from './AdoptModal';
import { CreativeWorkshop } from '../CreativeWorkshop/CreativeWorkshop';
import { AIC_SCOPE_CLASS } from '../shared/creative-console';
import { QUICK_SCENES, sceneLabel } from './scenes-meta';
import {
  callMediaApi,
  makeT,
  type MediaAsset,
  type MediaPanelData,
  type MediaScene,
  type MediaStudioApp,
} from './types';

const isVideoAsset = (a: MediaAsset | null | undefined): boolean =>
  Boolean(a && (a.assetType === 'video' || a.role === 'video'));

// 缩略图卡(.th):单击=选为当前图并大图预览;右上角小勾选=多选;角标 主图金星/已采纳翠✓。
function Thumb({
  asset,
  selected,
  checked,
  onSelect,
  onToggle,
  t,
}: {
  asset: MediaAsset;
  selected: boolean;
  checked: boolean;
  onSelect: () => void;
  onToggle: () => void;
  t: (k: string) => string;
}) {
  return (
    <div
      className={`th${selected ? ' sel' : ''}`}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      {asset.url ? (
        <img src={asset.url} alt={String(asset.role || asset.id)} />
      ) : (
        <div style={{ display: 'grid', placeItems: 'center', height: '100%' }}>
          <Typography.Text type="secondary">#{asset.id}</Typography.Text>
        </div>
      )}
      {asset.role === 'main' ? (
        <span className="star" title={t('Main')} aria-label={t('Main')}>
          ★
        </span>
      ) : null}
      {/* 多选勾选:未选时淡出小方块(hover 显),选中时紫色 .chk */}
      <span
        role="checkbox"
        aria-checked={checked}
        aria-label={t('Select')}
        tabIndex={-1}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        className={checked ? 'chk' : undefined}
        style={
          checked
            ? undefined
            : {
                position: 'absolute',
                right: 4,
                top: 4,
                width: 15,
                height: 15,
                borderRadius: 5,
                border: '1.5px solid #fff',
                background: 'rgba(20,18,30,.28)',
                cursor: 'pointer',
              }
        }
      >
        {checked ? '✓' : ''}
      </span>
      {asset.finalSelected ? (
        <span className="adp" title={t('Adopted')} aria-label={t('Adopted')}>
          ✓
        </span>
      ) : null}
    </div>
  );
}

export interface MediaStudioProps {
  app: MediaStudioApp;
  productId: number;
  // 采纳/弃用/生成后回调(供宿主刷新详情图集或标记状态变化)
  onChange?: () => void;
  // 打开原生 AI 抽屉找美工员工改图(注入选中图);由 kit 提供,缺省时该入口不显示
  openEditor?: (assetIds: number[], opts?: { scene?: string }) => void;
}

type GalleryTab = 'all' | 'main' | 'detail' | 'video';
type StageMode = 'preview' | 'compare';

export function MediaStudio({ app, productId, onChange, openEditor }: MediaStudioProps) {
  const { message } = AntdApp.useApp();
  const t = useMemo(() => makeT(app), [app]);
  const [data, setData] = useState<MediaPanelData>({ gallery: [], candidates: [], adopted: [] });
  const [scenes, setScenes] = useState<MediaScene[]>([]);
  const [models, setModels] = useState<Array<{ llmService: string; model: string; label: string }>>([]);
  const [modelKey, setModelKey] = useState<string>(''); // '' = 自动;否则 `${llmService}:${model}`
  const [count, setCount] = useState<number>(1); // 每次出图数量
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<GalleryTab>('all');
  const [currentId, setCurrentId] = useState<number | null>(null); // 左栏单选:当前图 + 改图源(仅图片)
  const [previewVideoId, setPreviewVideoId] = useState<number | null>(null); // 舞台正在预览的视频(不改改图源)
  const [picked, setPicked] = useState<Set<number>>(new Set()); // 多选批量
  const [viewCandidateId, setViewCandidateId] = useState<number | null>(null); // 对比展示的候选
  const [compareMode, setCompareMode] = useState<'side' | 'slider' | null>(null); // null=跟随候选场景
  const [stageMode, setStageMode] = useState<StageMode>('preview'); // 舞台:预览 / 对比
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);
  const [adoptTarget, setAdoptTarget] = useState<MediaAsset | null>(null);
  const [adopting, setAdopting] = useState(false);
  // 找美工改图后,员工在原生抽屉里产候选;这里轮询刷新让候选回流页面(双端同步)。设一个观察截止点。
  const [watchUntil, setWatchUntil] = useState(0);
  // 创意工坊全屏 Modal:带当前商品 + 选中图进独立工坊页;关闭时刷新候选区
  const [workshopOpen, setWorkshopOpen] = useState(false);

  const refresh = useCallback(
    async (opts?: { focusCandidateId?: number }) => {
      setLoading(true);
      const res = await callMediaApi<MediaPanelData>(app, 'aiListingMedia:candidates', { productId });
      setLoading(false);
      if (res.ok && res.data) {
        const panel = res.data;
        setData(panel);
        setCurrentId((prev) => {
          if (prev && panel.gallery.some((g) => g.id === prev)) return prev;
          const main = panel.gallery.find((g) => g.role === 'main') || panel.gallery[0];
          return main?.id ?? null;
        });
        if (opts?.focusCandidateId) {
          setViewCandidateId(opts.focusCandidateId);
          setStageMode('compare');
        }
      } else if (res.message) {
        message.error(res.message);
      }
    },
    [app, productId, message],
  );

  useEffect(() => {
    const load = async () => {
      await refresh();
      const sc = await callMediaApi<{ scenes: MediaScene[] }>(app, 'aiListingMedia:scenes');
      if (sc.ok && sc.data?.scenes) setScenes(sc.data.scenes);
      const md = await callMediaApi<{ models: Array<{ llmService: string; model: string; label: string }> }>(
        app,
        'aiListingMedia:imageModels',
      );
      if (md.ok && md.data?.models) setModels(md.data.models);
    };
    load();
  }, [app, refresh]);

  // 候选回流轮询:找美工改图后 ~3 分钟内每 5s 刷新一次,员工在抽屉产的候选自动出现在候选区。
  useEffect(() => {
    if (!watchUntil) return;
    const iv = setInterval(() => {
      if (Date.now() > watchUntil) {
        clearInterval(iv);
        return;
      }
      refresh();
    }, 5000);
    return () => clearInterval(iv);
  }, [watchUntil, refresh]);

  const galleryFiltered = useMemo(() => {
    const main = data.gallery.filter((g) => g.role === 'main' || (!g.role && g.origin === 'source'));
    const detail = data.gallery.filter((g) => !main.includes(g));
    return { main, detail };
  }, [data.gallery]);

  // 视频:优先服务端聚合的 videos(全部未弃用,采纳优先);回退到 videoAdopted∪videoCandidates。
  const videos = useMemo<MediaAsset[]>(() => {
    if (data.videos?.length) return data.videos;
    return [...(data.videoAdopted || []), ...(data.videoCandidates || [])];
  }, [data.videos, data.videoAdopted, data.videoCandidates]);

  const current = data.gallery.find((g) => g.id === currentId) || null;
  const previewVideo = previewVideoId ? videos.find((v) => v.id === previewVideoId) || null : null;
  const previewAsset: MediaAsset | null = previewVideo || current;
  const viewCandidate = data.candidates.find((c) => c.id === viewCandidateId) || null;
  const compareOriginalUrl = viewCandidate
    ? data.gallery.find((g) => g.id === viewCandidate.parentAssetId)?.url ||
      viewCandidate.genParams?.sourceImageUrl ||
      current?.url ||
      null
    : current?.url || null;

  // 生成目标:多选优先(批量),否则当前图
  const genTargets = useCallback((): number[] => {
    if (picked.size) return [...picked];
    return currentId ? [currentId] : [];
  }, [picked, currentId]);

  // 快捷直连:对目标逐张生成候选(受服务端日限额保护)
  const quickGenerate = useCallback(
    async (sceneKey: string, instruction?: string) => {
      const targets = genTargets();
      if (!targets.length) {
        message.warning(t('Select a source image first'));
        return;
      }
      setBusy({ done: 0, total: targets.length * count });
      const [llmService, model] = modelKey ? modelKey.split(/:(.+)/) : [undefined, undefined];
      let firstAssetId: number | undefined;
      let failed = 0;
      let done = 0;
      for (let i = 0; i < targets.length; i++) {
        const res = await callMediaApi<{ assets: Array<{ assetId: number; url: string }> }>(
          app,
          'aiListingMedia:generate',
          {
            productId,
            assetId: targets[i],
            scene: sceneKey,
            instruction: instruction || '',
            n: count,
            llmService,
            model,
          },
        );
        if (res.ok) {
          if (!firstAssetId) firstAssetId = res.data?.assets?.[0]?.assetId;
        } else {
          failed++;
          message.error(res.message || t('Generation failed'));
        }
        done += count;
        setBusy({ done, total: targets.length * count });
      }
      setBusy(null);
      if (failed < targets.length) {
        message.success(t('Candidates generated'));
        await refresh(firstAssetId ? { focusCandidateId: firstAssetId } : undefined);
        onChange?.();
      }
    },
    [app, productId, genTargets, refresh, onChange, message, t, modelKey, count],
  );

  const doAdopt = useCallback(
    async (choice: AdoptChoice) => {
      if (!adoptTarget) return;
      setAdopting(true);
      const res = await callMediaApi(app, 'aiListingMedia:adopt', {
        assetId: adoptTarget.id,
        mode: choice.mode,
        replaceAssetId: choice.replaceAssetId,
      });
      setAdopting(false);
      if (res.ok) {
        message.success(t('Adopted'));
        setAdoptTarget(null);
        setViewCandidateId(null);
        setStageMode('preview');
        await refresh();
        onChange?.();
      } else {
        message.error(res.message || t('Adopt failed'));
      }
    },
    [app, adoptTarget, refresh, onChange, message, t],
  );

  // 采纳视频为主视频:视频采纳无 replace 语义,直接受控 action(服务端只保留一条 finalSelected 视频)。
  const doAdoptVideo = useCallback(
    async (v: MediaAsset) => {
      const res = await callMediaApi(app, 'aiListingMedia:adopt', { assetId: v.id, mode: 'append' });
      if (res.ok) {
        message.success(t('Adopted as main video'));
        await refresh();
        onChange?.();
      } else {
        message.error(res.message || t('Adopt failed'));
      }
    },
    [app, refresh, onChange, message, t],
  );

  const doDiscard = useCallback(
    async (asset: MediaAsset) => {
      const res = await callMediaApi(app, 'aiListingMedia:discard', { assetId: asset.id });
      if (res.ok) {
        message.success(t('Discarded'));
        if (viewCandidateId === asset.id) {
          setViewCandidateId(null);
          setStageMode('preview');
        }
        await refresh();
        onChange?.();
      } else {
        message.error(res.message || t('Discard failed'));
      }
    },
    [app, viewCandidateId, refresh, onChange, message, t],
  );

  const togglePick = useCallback((id: number) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const openDrawer = useCallback(
    (sceneKey?: string) => {
      if (!openEditor) return;
      const targets = genTargets();
      openEditor(targets.length ? targets : current ? [current.id] : [], sceneKey ? { scene: sceneKey } : undefined);
      // 开始轮询回流:员工在抽屉产候选后,页面候选区自动刷新出现
      setWatchUntil(Date.now() + 180000);
    },
    [openEditor, genTargets, current],
  );

  // 点缩略图:选为当前图(改图源)并进入预览大图
  const selectImage = useCallback((id: number) => {
    setCurrentId(id);
    setPreviewVideoId(null);
    setStageMode('preview');
  }, []);

  // 点视频缩略:舞台预览该视频(不改改图源)
  const selectVideo = useCallback((id: number) => {
    setPreviewVideoId(id);
    setStageMode('preview');
  }, []);

  // 点候选:进入原图↔候选对比
  const selectCandidate = useCallback((id: number) => {
    setViewCandidateId(id);
    setPreviewVideoId(null);
    setStageMode('compare');
  }, []);

  const scene = viewCandidate?.genParams?.scene;
  const effectiveMode: 'side' | 'slider' =
    compareMode || (viewCandidate?.genParams?.compareMode === 'slider' ? 'slider' : 'side');

  const TABS: Array<{ key: GalleryTab; label: string }> = [
    { key: 'all', label: t('All') },
    { key: 'main', label: t('Main') },
    { key: 'detail', label: t('Detail') },
    { key: 'video', label: t('Videos') },
  ];

  const renderGroup = (title: string, list: MediaAsset[], roll?: React.ReactNode) =>
    list.length ? (
      <>
        <div className="glbl">
          {title} <b>{list.length}</b>
          {roll ? <span className="roll">{roll}</span> : null}
        </div>
        <div className="ggrid">
          {list.map((g) => (
            <Thumb
              key={g.id}
              asset={g}
              selected={g.id === currentId && !previewVideoId}
              checked={picked.has(g.id)}
              onSelect={() => selectImage(g.id)}
              onToggle={() => togglePick(g.id)}
              t={t}
            />
          ))}
        </div>
      </>
    ) : null;

  const previewLabel = previewAsset
    ? isVideoAsset(previewAsset)
      ? t('Videos')
      : previewAsset.role === 'main'
        ? t('Main')
        : t('Detail')
    : '';

  const renderStage = () => {
    if (stageMode === 'compare' && viewCandidate) {
      return (
        <CompareView
          originalUrl={compareOriginalUrl}
          candidateUrl={viewCandidate.url}
          mode={effectiveMode}
          t={t}
          emptyHint={t('Pick a scene above or ask the design AI — candidates will show here')}
        />
      );
    }
    if (previewAsset && isVideoAsset(previewAsset) && previewAsset.url) {
      return (
        <div className="stage">
          <video
            src={previewAsset.url}
            controls
            style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000' }}
          />
        </div>
      );
    }
    if (previewAsset?.url) {
      return (
        <div className="stage">
          <div className="layer full" style={{ backgroundImage: `url("${previewAsset.url}")` }} />
          {previewLabel ? <span className="plabel">{previewLabel}</span> : null}
        </div>
      );
    }
    return (
      <div className="stage" style={{ display: 'grid', placeItems: 'center' }}>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {current
            ? t('Pick a scene above or ask the design AI — candidates will show here')
            : t('Select a source image first')}
        </Typography.Text>
      </div>
    );
  };

  const galleryEmpty = !data.gallery.length && !videos.length;

  return (
    <div className={AIC_SCOPE_CLASS}>
      {/* 卡壳 + 标题(「商品图片 · AI 改图」)由外层 jsBlock 的 antd Card 提供;深墨区头 studio-head 归 Phase 3
          (jsBlock Card 头 → 深墨,随客户端一起上线,避免与卡壳标题重复/生产端无头)。此处 MediaStudio 只渲染工具栏 + 主体。 */}
      <div className="studio-tools">
        <button type="button" className="tbtn go" onClick={() => setWorkshopOpen(true)}>
          🎨 {t('Creative Workshop')}
        </button>
        {openEditor ? (
          <button type="button" className="tbtn" onClick={() => openDrawer()}>
            💬 {t('Ask the design AI')}
          </button>
        ) : null}
        {QUICK_SCENES.map((q) => (
          <button
            type="button"
            key={q.key}
            className="tbtn"
            disabled={Boolean(busy)}
            onClick={() => quickGenerate(q.key, q.instruction)}
          >
            {q.icon} {q.label}
          </button>
        ))}
        <button type="button" className="tbtn" onClick={() => setWorkshopOpen(true)}>
          🎬 {t('Image to video')}
        </button>
        <div className="mc">
          {t('Model')}
          <Select
            size="small"
            variant="borderless"
            style={{ minWidth: 96 }}
            value={modelKey}
            onChange={setModelKey}
            title={t('Model used for quick edits')}
            options={[
              { value: '', label: t('Auto model') },
              ...models.map((m) => ({ value: `${m.llmService}:${m.model}`, label: m.label })),
            ]}
          />
          {t('Count')}
          <InputNumber
            size="small"
            min={1}
            max={4}
            value={count}
            onChange={(v) => setCount(Number(v) || 1)}
            title={t('Number of candidates per image')}
            style={{ width: 52 }}
          />
          {busy ? (
            <span style={{ color: 'var(--violet)', fontWeight: 600 }}>
              {t('Generating')} {busy.done}/{busy.total}…
            </span>
          ) : null}
          {picked.size ? (
            <span>
              · {t('Selected')} <b style={{ color: 'var(--violet)' }}>{picked.size}</b>{' '}
              <a onClick={() => setPicked(new Set())}>{t('Clear')}</a>
            </span>
          ) : null}
        </div>
      </div>

      <Spin spinning={loading}>
        <div className="studio-body">
          {/* 左:图集列(tabs 固定 + gscroll 独立竖滚 + 视频入列) */}
          <div className="gcol">
            <div className="gtabs">
              {TABS.map((tb) => (
                <button
                  type="button"
                  key={tb.key}
                  className={tab === tb.key ? 'on' : undefined}
                  onClick={() => setTab(tb.key)}
                >
                  {tb.label}
                </button>
              ))}
            </div>
            {galleryEmpty ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('No images yet')} />
            ) : (
              <div className="gscroll">
                {(tab === 'all' || tab === 'video') && videos.length ? (
                  <div className="vslot">
                    <div className="glbl">
                      {t('Videos')} <b>{videos.length}</b>{' '}
                      <span style={{ color: 'var(--text-3)', fontWeight: 500 }}>· {t('Main video slot')}</span>
                    </div>
                    {videos.slice(0, 1).map((v) => (
                      <React.Fragment key={v.id}>
                        <div
                          className="vthumb"
                          role="button"
                          tabIndex={0}
                          onClick={() => selectVideo(v.id)}
                          onKeyDown={(e) => (e.key === 'Enter' ? selectVideo(v.id) : undefined)}
                        >
                          {v.url ? <video src={v.url} muted preload="metadata" /> : null}
                          <span className="vplay">▶</span>
                          <span className="vbadge">{v.finalSelected ? t('Adopted') : t('Downloaded')}</span>
                        </div>
                        <div className="vcap">
                          <span className="vt">
                            {v.genParams?.model ? `${v.genParams.model} · ${t('Image to video')}` : t('Source video')}
                          </span>
                          {v.finalSelected ? (
                            <a style={{ color: 'var(--jade)', cursor: 'default' }}>✓ {t('Adopted as main video')}</a>
                          ) : (
                            <a onClick={() => doAdoptVideo(v)}>✓ {t('Adopt as main video')}</a>
                          )}
                        </div>
                      </React.Fragment>
                    ))}
                  </div>
                ) : null}
                {(tab === 'all' || tab === 'main') &&
                  renderGroup(
                    t('Main image'),
                    galleryFiltered.main,
                    picked.size ? `${t('Selected')} ${picked.size}` : null,
                  )}
                {(tab === 'all' || tab === 'detail') &&
                  renderGroup(
                    t('Detail images'),
                    galleryFiltered.detail,
                    galleryFiltered.detail.length > 9 ? `↓ ${t('Scroll to see all')}` : null,
                  )}
              </div>
            )}
          </div>

          {/* 右:舞台(预览 / 对比)+ 候选 + 操作 */}
          <div>
            <div className="stagelbl">
              <span className="t">{stageMode === 'compare' ? t('Compare') : t('Preview')}</span>
              {scene && stageMode === 'compare' ? <span className="scene">{sceneLabel(scene)}</span> : null}
              <span className="modes">
                <button
                  type="button"
                  className={stageMode === 'preview' ? 'on' : undefined}
                  onClick={() => setStageMode('preview')}
                >
                  {t('Preview')}
                </button>
                <button
                  type="button"
                  className={stageMode === 'compare' ? 'on' : undefined}
                  disabled={!viewCandidate}
                  onClick={() => viewCandidate && setStageMode('compare')}
                >
                  {t('Compare')}
                </button>
              </span>
            </div>

            {renderStage()}

            {/* 候选条(Phase 1 基础版;场景/时间角标与批量逐张见 Phase 2) */}
            {data.candidates.length ? (
              <div className="candbar">
                <div className="candhead">
                  <span className="cl">
                    {t('Candidates')} <b>{data.candidates.length}</b>
                  </span>
                  <span className="candhint">{t('Click a candidate → original / candidate compare')}</span>
                </div>
                <div className="candstrip">
                  {data.candidates.map((c) => (
                    <div
                      key={c.id}
                      className={`ccard${c.id === viewCandidateId ? ' on' : ''}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => selectCandidate(c.id)}
                      onKeyDown={(e) => (e.key === 'Enter' ? selectCandidate(c.id) : undefined)}
                    >
                      <div className="cimg">
                        {c.url ? <img src={c.url} alt={sceneLabel(c.genParams?.scene)} /> : null}
                        <span className="cchk">✓</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {/* 操作条:采纳选中候选 / 以此再改 / 弃用(无选中候选时禁用) */}
            <div className="actbar">
              <button
                type="button"
                className={`act adopt${viewCandidate ? '' : ' mut'}`}
                disabled={!viewCandidate}
                onClick={() => viewCandidate && setAdoptTarget(viewCandidate)}
              >
                ✓ {t('Adopt selected candidate')}
              </button>
              {openEditor ? (
                <button
                  type="button"
                  className={`act iter${viewCandidate ? '' : ' mut'}`}
                  disabled={!viewCandidate}
                  onClick={() => viewCandidate && openDrawer()}
                >
                  ↻ {t('Iterate')}
                </button>
              ) : null}
              <button
                type="button"
                className={`act discard${viewCandidate ? '' : ' mut'}`}
                disabled={!viewCandidate}
                onClick={() => viewCandidate && doDiscard(viewCandidate)}
              >
                ✕ {t('Discard')}
              </button>
            </div>
          </div>
        </div>
      </Spin>

      <AdoptModal
        candidate={adoptTarget}
        gallery={data.gallery}
        onConfirm={doAdopt}
        onClose={() => setAdoptTarget(null)}
        loading={adopting}
        t={t}
      />

      {/* 创意工坊全屏页(带入当前商品 + 选中图);关闭后刷新候选区(工坊产的候选已回流) */}
      <Modal
        open={workshopOpen}
        onCancel={() => {
          setWorkshopOpen(false);
          refresh();
          onChange?.();
        }}
        footer={null}
        width="92%"
        style={{ top: 16, maxWidth: 1340, paddingBottom: 0 }}
        styles={{ body: { padding: 0 } }}
        destroyOnClose
      >
        {workshopOpen ? (
          <CreativeWorkshop
            app={app}
            productId={productId}
            initialAssetIds={picked.size ? [...picked] : current ? [current.id] : []}
            onBack={() => {
              setWorkshopOpen(false);
              refresh();
              onChange?.();
            }}
          />
        ) : null}
      </Modal>
    </div>
  );
}
