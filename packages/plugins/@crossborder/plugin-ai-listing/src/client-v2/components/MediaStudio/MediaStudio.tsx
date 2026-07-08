/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// 预览编辑页「AI 候选区」(内嵌横向两栏):左=商品图集(主图/详情图分组 + 多选),右=对比/候选
// (原图↔候选常驻并排/拉帘 + 采纳/以此再改/弃用)。头部:找美工改图(开原生抽屉)+ 2-3 快捷直连 + 已选 N 张。
// 安全铁律:生成只产候选(不进发布);采纳/弃用是用户显式动作,走受控 action + 审计。AI 改图重活交给原生抽屉。

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { App as AntdApp, Button, Empty, InputNumber, Modal, Select, Space, Spin, Tag, Tooltip, Typography } from 'antd';
import { CompareView } from './CompareModal';
import { AdoptModal, type AdoptChoice } from './AdoptModal';
import { CreativeWorkshop } from '../CreativeWorkshop/CreativeWorkshop';
import { QUICK_SCENES, sceneLabel } from './scenes-meta';
import {
  callMediaApi,
  makeT,
  type MediaAsset,
  type MediaPanelData,
  type MediaScene,
  type MediaStudioApp,
} from './types';

// 图集缩略图栅格:3 列(角标已瘦身不再挡图,左栏加宽后 3 列缩略图 ~74px,比原来大且能一屏看更多)
const NAV_GRID: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 };

function assetUrl(a: MediaAsset | undefined | null): string | null {
  return a?.url || null;
}

// 缩略图卡:单击选为当前图;可选勾选框做多选。
function Thumb({
  asset,
  current,
  checked,
  onSelect,
  onToggle,
  badges,
  adopted,
  t,
}: {
  asset: MediaAsset;
  current?: boolean;
  checked?: boolean;
  onSelect: () => void;
  onToggle: () => void;
  badges?: React.ReactNode;
  // 已采纳:右下角绿 ✓ 角标(与左上角色标、右上勾选框分处不同角,不再叠一起挡图)
  adopted?: boolean;
  t: (k: string) => string;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      style={{
        position: 'relative',
        aspectRatio: '1 / 1',
        borderRadius: 6,
        overflow: 'hidden',
        border: current ? '2px solid #1677ff' : '2px solid transparent',
        cursor: 'pointer',
        background: '#f0f0f0',
      }}
    >
      {asset.url ? (
        <img
          src={asset.url}
          alt={String(asset.role || asset.id)}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
          <Typography.Text type="secondary">#{asset.id}</Typography.Text>
        </div>
      )}
      {badges ? (
        <div style={{ position: 'absolute', left: 3, top: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {badges}
        </div>
      ) : null}
      <span
        role="checkbox"
        aria-checked={checked}
        aria-label={t('Select')}
        tabIndex={-1}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        style={{
          position: 'absolute',
          right: 3,
          top: 3,
          width: 16,
          height: 16,
          borderRadius: 4,
          border: '1.5px solid #fff',
          background: checked ? '#1677ff' : 'rgba(0,0,0,0.28)',
          color: '#fff',
          fontSize: 11,
          lineHeight: '14px',
          textAlign: 'center',
        }}
      >
        {checked ? '✓' : ''}
      </span>
      {adopted ? (
        <span
          title={t('Adopted')}
          aria-label={t('Adopted')}
          style={{
            position: 'absolute',
            right: 3,
            bottom: 3,
            minWidth: 16,
            height: 16,
            borderRadius: 8,
            padding: '0 5px',
            background: '#52c41a',
            border: '1.5px solid #fff',
            color: '#fff',
            fontSize: 10,
            lineHeight: '14px',
            textAlign: 'center',
            fontWeight: 600,
          }}
        >
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

export function MediaStudio({ app, productId, onChange, openEditor }: MediaStudioProps) {
  const { message } = AntdApp.useApp();
  const t = useMemo(() => makeT(app), [app]);
  const [data, setData] = useState<MediaPanelData>({ gallery: [], candidates: [], adopted: [] });
  const [scenes, setScenes] = useState<MediaScene[]>([]);
  const [models, setModels] = useState<Array<{ llmService: string; model: string; label: string }>>([]);
  const [modelKey, setModelKey] = useState<string>(''); // '' = 自动;否则 `${llmService}:${model}`
  const [count, setCount] = useState<number>(2); // 每次出图数量(默认 2)
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<'all' | 'main' | 'detail'>('all');
  const [currentId, setCurrentId] = useState<number | null>(null); // 左栏单选:当前图 + 改图源
  const [picked, setPicked] = useState<Set<number>>(new Set()); // 多选批量
  const [viewCandidateId, setViewCandidateId] = useState<number | null>(null); // 右侧对比展示的候选
  const [compareMode, setCompareMode] = useState<'side' | 'slider' | null>(null); // null=跟随候选场景
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);
  const [adoptTarget, setAdoptTarget] = useState<MediaAsset | null>(null);
  const [adopting, setAdopting] = useState(false);
  // 找美工改图后,员工在原生抽屉里产候选;这里轮询刷新让候选回流页面(双端同步)。设一个观察截止点。
  const [watchUntil, setWatchUntil] = useState(0);
  // 创意工坊全屏 Modal:带当前商品 + 选中图进独立工坊页(9 功能专属表单);关闭时刷新候选区
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
        if (opts?.focusCandidateId) setViewCandidateId(opts.focusCandidateId);
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

  const current = data.gallery.find((g) => g.id === currentId) || null;
  const viewCandidate = data.candidates.find((c) => c.id === viewCandidateId) || null;
  const compareOriginalUrl = viewCandidate
    ? assetUrl(data.gallery.find((g) => g.id === viewCandidate.parentAssetId)) ||
      viewCandidate.genParams?.sourceImageUrl ||
      assetUrl(current)
    : assetUrl(current);

  // 生成目标:多选优先(批量),否则当前图
  const genTargets = useCallback((): number[] => {
    if (picked.size) return [...picked];
    return currentId ? [currentId] : [];
  }, [picked, currentId]);

  // 快捷直连:对目标逐张生成候选(受服务端日限额保护)
  const quickGenerate = useCallback(
    async (scene: string, instruction?: string) => {
      const targets = genTargets();
      if (!targets.length) {
        message.warning(t('Select a source image first'));
        return;
      }
      setBusy({ done: 0, total: targets.length });
      const [llmService, model] = modelKey ? modelKey.split(/:(.+)/) : [undefined, undefined];
      let firstAssetId: number | undefined;
      let failed = 0;
      for (let i = 0; i < targets.length; i++) {
        const res = await callMediaApi<{ assets: Array<{ assetId: number; url: string }> }>(
          app,
          'aiListingMedia:generate',
          {
            productId,
            assetId: targets[i],
            scene,
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
        setBusy({ done: i + 1, total: targets.length });
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
        await refresh();
        onChange?.();
      } else {
        message.error(res.message || t('Adopt failed'));
      }
    },
    [app, adoptTarget, refresh, onChange, message, t],
  );

  const doDiscard = useCallback(
    async (asset: MediaAsset) => {
      const res = await callMediaApi(app, 'aiListingMedia:discard', { assetId: asset.id });
      if (res.ok) {
        message.success(t('Discarded'));
        if (viewCandidateId === asset.id) setViewCandidateId(null);
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
    (scene?: string) => {
      if (!openEditor) return;
      const targets = genTargets();
      openEditor(targets.length ? targets : current ? [current.id] : [], scene ? { scene } : undefined);
      // 开始轮询回流:员工在抽屉产候选后,页面候选区自动刷新出现
      setWatchUntil(Date.now() + 180000);
    },
    [openEditor, genTargets, current],
  );

  const scene = viewCandidate?.genParams?.scene;
  const effectiveMode = compareMode || (viewCandidate?.genParams?.compareMode === 'slider' ? 'slider' : 'side');

  const renderGroup = (title: string, list: MediaAsset[]) =>
    list.length ? (
      <div style={{ marginBottom: 10 }}>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {title} <span style={{ color: '#bbb' }}>{list.length}</span>
        </Typography.Text>
        <div style={{ ...NAV_GRID, marginTop: 6 }}>
          {list.map((g) => (
            <Thumb
              key={g.id}
              asset={g}
              current={g.id === currentId}
              checked={picked.has(g.id)}
              onSelect={() => setCurrentId(g.id)}
              onToggle={() => togglePick(g.id)}
              t={t}
              adopted={g.finalSelected}
              badges={
                // 角色标瘦身:去掉冗余「主图/详情」文字标(分组标题已表明),仅主图留一个小金星,不挡图
                g.role === 'main' ? (
                  <span
                    title={t('Main')}
                    aria-label={t('Main')}
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: 8,
                      background: '#faad14',
                      border: '1.5px solid #fff',
                      color: '#fff',
                      fontSize: 10,
                      lineHeight: '14px',
                      textAlign: 'center',
                      display: 'inline-block',
                    }}
                  >
                    ★
                  </span>
                ) : null
              }
            />
          ))}
        </div>
      </div>
    ) : null;

  return (
    <div>
      {/* 头部:找美工改图 + 快捷直连 + 已选 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <Button type="primary" size="small" onClick={() => setWorkshopOpen(true)}>
          🎨 {t('Creative Workshop')}
        </Button>
        {openEditor ? (
          <Button size="small" onClick={() => openDrawer()}>
            💬 {t('Ask the design AI')}
          </Button>
        ) : null}
        <Space size={6}>
          {QUICK_SCENES.map((q) => (
            <Tooltip key={q.key} title={t('Quick edit — generates candidates directly')}>
              <Button size="small" loading={Boolean(busy)} onClick={() => quickGenerate(q.key, q.instruction)}>
                {q.icon} {q.label}
              </Button>
            </Tooltip>
          ))}
        </Space>
        {/* 选模型 + 数量(对快捷直连生效)。不套 Tooltip:Tooltip 包 Select/InputNumber 会触发 resize 死循环 */}
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {t('Model')}
        </Typography.Text>
        <Select
          size="small"
          style={{ minWidth: 150 }}
          value={modelKey}
          onChange={setModelKey}
          title={t('Model used for quick edits')}
          options={[
            { value: '', label: t('Auto model') },
            ...models.map((m) => ({ value: `${m.llmService}:${m.model}`, label: m.label })),
          ]}
        />
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {t('Count')}
        </Typography.Text>
        <InputNumber
          size="small"
          min={1}
          max={4}
          value={count}
          onChange={(v) => setCount(Number(v) || 1)}
          title={t('Number of candidates per image')}
          style={{ width: 56 }}
        />
        {busy ? (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {t('Generating')} {busy.done}/{busy.total}…
          </Typography.Text>
        ) : null}
        {picked.size ? (
          <Space size={6} style={{ marginLeft: 'auto' }}>
            <Tag color="blue" style={{ margin: 0 }}>
              {t('Selected')} {picked.size}
            </Tag>
            <a onClick={() => setPicked(new Set())}>{t('Clear')}</a>
          </Space>
        ) : null}
      </div>

      <Spin spinning={loading}>
        <div style={{ display: 'flex', gap: 14, minHeight: 300 }}>
          {/* 左:图集(分组 + 多选) */}
          <div
            style={{
              width: 248,
              flexShrink: 0,
              borderRight: '1px solid #f0f0f0',
              paddingRight: 12,
              overflowY: 'auto',
              maxHeight: 420,
            }}
          >
            <Space size={4} style={{ marginBottom: 8 }}>
              {(['all', 'main', 'detail'] as const).map((k) => (
                <a
                  key={k}
                  onClick={() => setTab(k)}
                  style={{
                    fontSize: 12,
                    padding: '2px 9px',
                    borderRadius: 6,
                    background: tab === k ? '#e6f4ff' : 'transparent',
                    color: tab === k ? '#1677ff' : '#6b7280',
                    fontWeight: tab === k ? 600 : 400,
                  }}
                >
                  {k === 'all' ? t('All') : k === 'main' ? t('Main') : t('Detail')}
                </a>
              ))}
            </Space>
            {data.gallery.length ? (
              <>
                {(tab === 'all' || tab === 'main') && renderGroup(t('Main image'), galleryFiltered.main)}
                {(tab === 'all' || tab === 'detail') && renderGroup(t('Detail images'), galleryFiltered.detail)}
              </>
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('No images yet')} />
            )}
          </div>

          {/* 右:对比 / 候选 */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <Typography.Text strong>{t('Compare')}</Typography.Text>
              {scene ? <Tag color="blue">{sceneLabel(scene)}</Tag> : null}
              {viewCandidate ? (
                <Space.Compact size="small" style={{ marginLeft: 'auto' }}>
                  <Button
                    type={effectiveMode === 'side' ? 'primary' : 'default'}
                    onClick={() => setCompareMode('side')}
                  >
                    {t('Side by side')}
                  </Button>
                  <Button
                    type={effectiveMode === 'slider' ? 'primary' : 'default'}
                    onClick={() => setCompareMode('slider')}
                  >
                    {t('Slider')}
                  </Button>
                </Space.Compact>
              ) : null}
            </div>

            <CompareView
              originalUrl={compareOriginalUrl}
              candidateUrl={assetUrl(viewCandidate)}
              mode={effectiveMode}
              t={t}
              emptyHint={
                current
                  ? t('Pick a scene above or ask the design AI — candidates will show here')
                  : t('Select a source image first')
              }
            />

            {/* 候选缩略条 */}
            {data.candidates.length ? (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '12px 0 10px', flexWrap: 'wrap' }}>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {t('Candidates')}({data.candidates.length}):
                </Typography.Text>
                {data.candidates.map((c) => (
                  <div
                    key={c.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setViewCandidateId(c.id)}
                    onKeyDown={(e) => (e.key === 'Enter' ? setViewCandidateId(c.id) : undefined)}
                    style={{
                      width: 52,
                      height: 52,
                      borderRadius: 6,
                      overflow: 'hidden',
                      cursor: 'pointer',
                      border: c.id === viewCandidateId ? '2px solid #1677ff' : '2px solid transparent',
                    }}
                  >
                    {c.url ? (
                      <img
                        src={c.url}
                        alt={sceneLabel(c.genParams?.scene)}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}

            {/* 操作 */}
            {viewCandidate ? (
              <Space wrap>
                <Button type="primary" onClick={() => setAdoptTarget(viewCandidate)}>
                  ✓ {t('Adopt')}
                </Button>
                {openEditor ? (
                  <Tooltip title={t('Iterate from this candidate in the drawer')}>
                    <Button onClick={() => openDrawer()}>{t('Iterate')}</Button>
                  </Tooltip>
                ) : null}
                <Button danger onClick={() => doDiscard(viewCandidate)}>
                  {t('Discard')}
                </Button>
              </Space>
            ) : null}
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
