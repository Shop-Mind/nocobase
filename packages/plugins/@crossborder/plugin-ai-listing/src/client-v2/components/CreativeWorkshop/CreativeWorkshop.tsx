/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// 创意工坊独立页(对标阿里国际站创意工坊):三栏 = 功能栏 / 商品图带入+专属表单 / 示例+结果。
// P1:9 个已支持功能各有专属表单,商品图自动带入(可勾选/切换/再上传),生成走 aiListingMedia:generate
// 产候选并回流该商品候选区,复用 CompareView / AdoptModal 采纳/弃用。铁律不变:生成只产候选,采纳=用户显式动作。
// 复用候选区(MediaStudio)的数据契约与基元:callMediaApi / makeT / 类型 / CompareView / AdoptModal。

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  App as AntdApp,
  Button,
  Empty,
  Input,
  InputNumber,
  Progress,
  Segmented,
  Select,
  Space,
  Spin,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import { CompareView } from '../MediaStudio/CompareModal';
import { AdoptModal, type AdoptChoice } from '../MediaStudio/AdoptModal';
import { sceneLabel } from '../MediaStudio/scenes-meta';
import { callMediaApi, makeT, type MediaAsset, type MediaPanelData, type MediaStudioApp } from '../MediaStudio/types';
import { WORKSHOP_FUNCTIONS, getWorkshopFunction, type WorkshopFunction } from './functions';
import { VideoPane } from './VideoPane';

// 带入区的一张图:来自商品图集(assetId)或用户新上传(sourceImageUrl)
interface CarryImage {
  key: string;
  assetId?: number;
  url: string | null;
  role?: string | null;
  finalSelected?: boolean;
  uploaded?: boolean;
}

// 对标官方创意工坊的 10 档常用比例;'' = 原图/默认(不透传 size)。服务端 ratioToSize 换算成「宽*高」。
const RATIOS = ['1:1', '4:3', '3:4', '16:9', '9:16', '3:2', '2:3', '4:5', '5:4', '21:9'];
// Logo定制:工艺 + 位置(对标官方 12+ 工艺)。仅拼进提示词,不耗额外接口。
const CRAFTS = ['丝网印', '热转印', '烫金', '刺绣', '压印', '激光雕刻', '数码直喷', 'UV 打印', '贴纸', '立体浮雕'];
const LOGO_POSITIONS = ['正面中间', '左上角', '右上角', '左下角', '右下角', '顶部居中', '底部居中'];
// 图片翻译:9 档目标语种(对标官方创意工坊)。value = 注入模板 {target_language} 的语种名,label 展示。
const LANGS: Array<{ value: string; label: string }> = [
  { value: 'English', label: 'English · 英语' },
  { value: '日本語', label: '日本語 · 日语' },
  { value: '한국어', label: '한국어 · 韩语' },
  { value: 'Español', label: 'Español · 西语' },
  { value: 'Français', label: 'Français · 法语' },
  { value: 'Deutsch', label: 'Deutsch · 德语' },
  { value: 'Português', label: 'Português · 葡语' },
  { value: 'Русский', label: 'Русский · 俄语' },
  { value: '中文', label: '中文 · 中文' },
];
// 模特图:预置模特库(对标官方模特网格)。desc = 注入 model_shot 模板的模特描述;也可上传自有模特图作第二张图。
const MODEL_PRESETS: Array<{ key: string; label: string; desc: string }> = [
  { key: 'asian_f', label: '亚洲女模', desc: '一位亚洲年轻女性模特,自然妆容,气质清新' },
  { key: 'asian_m', label: '亚洲男模', desc: '一位亚洲年轻男性模特,阳光帅气,身形挺拔' },
  { key: 'euro_f', label: '欧美女模', desc: '一位欧美年轻女性模特,时尚大气,轮廓立体' },
  { key: 'euro_m', label: '欧美男模', desc: '一位欧美年轻男性模特,硬朗有型' },
  { key: 'child', label: '儿童模特', desc: '一位可爱的儿童模特,活泼自然' },
  { key: 'mature', label: '成熟商务', desc: '一位成熟的商务人士模特,专业稳重' },
];
// 生产流程图:3 档风格(对标官方信息图风格)。值即注入 process 模板 {style} 的风格名。
const STYLES = ['商务信息图', '实物写实', '简约卡通'];

function galleryToCarry(gallery: MediaAsset[]): CarryImage[] {
  return gallery.map((g) => ({
    key: `a${g.id}`,
    assetId: g.id,
    url: g.url,
    role: g.role,
    finalSelected: g.finalSelected,
  }));
}

export interface CreativeWorkshopProps {
  app: MediaStudioApp;
  productId: number;
  productTitle?: string;
  // 从候选区跳入时预选的图(URL 带入)
  initialAssetIds?: number[];
  // 返回候选区/上一页;缺省不显示返回按钮
  onBack?: () => void;
}

export function CreativeWorkshop({ app, productId, productTitle, initialAssetIds, onBack }: CreativeWorkshopProps) {
  const { message } = AntdApp.useApp();
  const t = useMemo(() => makeT(app), [app]);

  const [data, setData] = useState<MediaPanelData>({ gallery: [], candidates: [], adopted: [] });
  const [tab, setTab] = useState<'image' | 'video'>('image'); // 顶部:智能图片 / 智能视频
  const [uploaded, setUploaded] = useState<CarryImage[]>([]); // 用户新上传的图(sourceImageUrl)
  const [models, setModels] = useState<Array<{ llmService: string; model: string; label: string }>>([]);
  const [modelKey, setModelKey] = useState<string>(''); // '' = 自动
  // 默认每图 1 张:gpt-image-2 网关每次 /images/edits 只回 1 张,多张靠前端按 n=1 循环出图(带进度);
  // 用户想要更多变体时上调(2-4),逐张生成、逐张回流、部分成功也保留。
  const [count, setCount] = useState<number>(1);
  const [activeKey, setActiveKey] = useState<string>('white_bg');
  const [picked, setPicked] = useState<Set<string>>(new Set()); // 带入区勾选(CarryImage.key)
  const [instruction, setInstruction] = useState<string>('');
  const [aspect, setAspect] = useState<string>(''); // 图片比例;'' = 原图/默认
  const [tier, setTier] = useState<'basic' | 'advanced'>('basic'); // 模型档:基础/进阶
  const [recos, setRecos] = useState<string[]>([]); // 推荐提示词(看图出)
  const [recosLoading, setRecosLoading] = useState(false);
  const [recosFallback, setRecosFallback] = useState(false); // true=静态兜底(无视觉模型)
  const [refImage, setRefImage] = useState<{ url: string; name: string } | null>(null); // 第二张图(Logo/材质参考)
  const [refUploading, setRefUploading] = useState(false);
  const [craft, setCraft] = useState<string>(''); // Logo 工艺
  const [logoPos, setLogoPos] = useState<string>('正面中间'); // Logo 位置
  const [lang, setLang] = useState<string>('English'); // 图片翻译目标语种
  const [modelPreset, setModelPreset] = useState<string>(MODEL_PRESETS[0].desc); // 模特图选中的模特描述
  const [procStyle, setProcStyle] = useState<string>(STYLES[0]); // 生产流程图风格
  const [pickedPoints, setPickedPoints] = useState<string[]>([]); // 营销卖点图:勾选的 AI 卖点
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);
  const [viewCandidateId, setViewCandidateId] = useState<number | null>(null);
  const [adoptTarget, setAdoptTarget] = useState<MediaAsset | null>(null);
  const [adopting, setAdopting] = useState(false);
  const [watchUntil, setWatchUntil] = useState(0);

  const activeFunc = useMemo<WorkshopFunction>(
    () => getWorkshopFunction(activeKey) || WORKSHOP_FUNCTIONS[0],
    [activeKey],
  );

  // 带入区全部图 = 商品图集 + 用户上传
  const carryImages = useMemo<CarryImage[]>(
    () => [...galleryToCarry(data.gallery), ...uploaded],
    [data.gallery, uploaded],
  );

  const refresh = useCallback(
    async (opts?: { focusCandidateId?: number }) => {
      setLoading(true);
      const res = await callMediaApi<MediaPanelData>(app, 'aiListingMedia:candidates', { productId });
      setLoading(false);
      if (res.ok && res.data) {
        setData(res.data);
        if (opts?.focusCandidateId) setViewCandidateId(opts.focusCandidateId);
      } else if (res.message) {
        message.error(res.message);
      }
    },
    [app, productId, message],
  );

  // 首次:拉候选面板 + 模型清单
  useEffect(() => {
    const load = async () => {
      await refresh();
      const md = await callMediaApi<{ models: Array<{ llmService: string; model: string; label: string }> }>(
        app,
        'aiListingMedia:imageModels',
      );
      if (md.ok && md.data?.models) setModels(md.data.models);
    };
    load();
  }, [app, refresh]);

  // 初始带入选择:优先 URL 带入的 assetIds,否则主图
  useEffect(() => {
    if (picked.size || !data.gallery.length) return;
    const initial = new Set<string>();
    if (initialAssetIds?.length) {
      for (const g of data.gallery) if (initialAssetIds.includes(g.id)) initial.add(`a${g.id}`);
    }
    if (!initial.size) {
      const main = data.gallery.find((g) => g.role === 'main') || data.gallery[0];
      if (main) initial.add(`a${main.id}`);
    }
    setPicked(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.gallery]);

  // 候选回流轮询(生成/找美工后 3 分钟内每 5s 刷新)
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

  // 切功能:预填默认指令;单图功能把多选收敛为一张
  const selectFunc = useCallback((fn: WorkshopFunction) => {
    if (!fn.enabled) return;
    setActiveKey(fn.key);
    setInstruction(fn.promptDefault || '');
    setAspect('');
    setTier(fn.tier);
    setRefImage(null);
    setCraft('');
    setLogoPos('正面中间');
    setLang('English');
    setModelPreset(MODEL_PRESETS[0].desc);
    setProcStyle(STYLES[0]);
    setPickedPoints([]);
    setViewCandidateId(null);
    if (fn.single) {
      setPicked((prev) => {
        const first = [...prev][0];
        return new Set(first ? [first] : []);
      });
    }
  }, []);

  const togglePick = useCallback(
    (key: string) => {
      setPicked((prev) => {
        const next = new Set(prev);
        if (activeFunc.single) {
          // 单图:点选即替换
          next.clear();
          next.add(key);
          return next;
        }
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
    },
    [activeFunc.single],
  );

  // 上传新图 → File Manager attachments → 加入带入区(sourceImageUrl)
  const onUpload = useCallback(
    async (file: File) => {
      setUploading(true);
      try {
        const form = new FormData();
        form.append('file', file);
        const res = await app.apiClient.request({ url: 'attachments:create', method: 'post', data: form });
        const rec = (res?.data as { data?: { url?: string } })?.data;
        const url = rec?.url || null;
        if (!url) {
          message.error(t('Upload failed'));
          return;
        }
        const key = `u${Date.now()}`;
        setUploaded((prev) => [...prev, { key, url, uploaded: true }]);
        setPicked((prev) => {
          const next = activeFunc.single ? new Set<string>() : new Set(prev);
          next.add(key);
          return next;
        });
      } catch (e) {
        message.error((e as Error)?.message || t('Upload failed'));
      } finally {
        setUploading(false);
      }
    },
    [app, message, t, activeFunc.single],
  );

  // 上传第二张图(Logo / 材质参考)→ File Manager attachments → 记 refImage(生成时传 refImageUrl)
  const onRefUpload = useCallback(
    async (file: File) => {
      setRefUploading(true);
      try {
        const form = new FormData();
        form.append('file', file);
        const res = await app.apiClient.request({ url: 'attachments:create', method: 'post', data: form });
        const rec = (res?.data as { data?: { url?: string } })?.data;
        if (rec?.url) setRefImage({ url: rec.url, name: file.name });
        else message.error(t('Upload failed'));
      } catch (e) {
        message.error((e as Error)?.message || t('Upload failed'));
      } finally {
        setRefUploading(false);
      }
    },
    [app, message, t],
  );

  // 生成:对每张选中图逐张出候选(受服务端日限额保护)
  const doGenerate = useCallback(async () => {
    const targets = carryImages.filter((c) => picked.has(c.key));
    if (!targets.length) {
      message.warning(t('Select a source image first'));
      return;
    }
    const instr = instruction.trim();
    // selling_point 由勾选卖点或手填其一满足,单独校验(见下);其余必填功能沿用通用校验
    if (activeFunc.instructionRequired && !instr && activeFunc.key !== 'selling_point') {
      message.warning(t('Please describe what you want'));
      return;
    }
    // Logo定制:必须上传 Logo 图(第二张图);指令由「位置+工艺」组合。换材质:参考图可选,有则提示模型参考。
    if (activeFunc.key === 'logo' && !refImage) {
      message.warning(t('Please upload the logo image'));
      return;
    }
    let effInstr = instr;
    if (activeFunc.key === 'logo') {
      effInstr = `印在商品的${logoPos}${craft ? `,采用${craft}工艺` : ''}${instr ? `;${instr}` : ''}`;
    } else if (activeFunc.key === 'material' && refImage) {
      effInstr = instr ? `${instr}(材质参考第二张图)` : '把商品材质换成第二张图所示的材质质感';
    } else if (activeFunc.key === 'model_shot') {
      // 模特描述来自预置库(或自传模特图作第二张图);用户额外指令追加其后
      const base = refImage ? '第二张图中的模特' : modelPreset || '一位气质自然的模特';
      effInstr = instr ? `${base};${instr}` : base;
    } else if (activeFunc.key === 'selling_point') {
      // 营销卖点图:勾选的 AI 卖点用 · 连接,叠加用户额外文案
      const joined = pickedPoints.join(' · ');
      effInstr = joined ? (instr ? `${joined} · ${instr}` : joined) : instr;
    }
    // 卖点图:必须有卖点(勾选或手填其一)
    if (activeFunc.key === 'selling_point' && !effInstr.trim()) {
      message.warning(t('Pick or enter at least one selling point'));
      return;
    }
    // 图片翻译:目标语种注入 {target_language};生产流程图:风格注入 {style}
    const targetLanguage = activeFunc.key === 'translate' ? lang : undefined;
    const style = activeFunc.key === 'process' ? procStyle : undefined;
    const refImageUrl = refImage?.url || undefined;
    const [llmService, model] = modelKey ? modelKey.split(/:(.+)/) : [undefined, undefined];
    // 每张源图出 count 张候选;gpt-image-2 网关每次只回 1 张,故按 n=1 逐张循环,进度 = 已出/总数。
    const perImage = Math.min(Math.max(count, 1), 4);
    const total = targets.length * perImage;
    setBusy({ done: 0, total });
    // 带图编辑经 codex 上游偏慢(单张 ~2–3 分钟),放宽候选回流轮询窗口以兜住 apiClient 可能的提前超时
    setWatchUntil(Date.now() + 240000);
    let firstAssetId: number | undefined;
    let done = 0;
    let ok = 0;
    let lastError = '';
    for (const src of targets) {
      for (let k = 0; k < perImage; k++) {
        const res = await callMediaApi<{ assets: Array<{ assetId: number; url: string }> }>(
          app,
          'aiListingMedia:generate',
          {
            productId,
            assetId: src.assetId,
            sourceImageUrl: src.assetId ? undefined : src.url || undefined,
            scene: activeFunc.key,
            instruction: effInstr,
            n: 1,
            llmService,
            model,
            aspect: aspect || undefined,
            tier,
            refImageUrl,
            targetLanguage,
            style,
          },
        );
        done += 1;
        setBusy({ done, total });
        if (res.ok) {
          ok += 1;
          if (!firstAssetId) firstAssetId = res.data?.assets?.[0]?.assetId;
          // 逐张回流:每出一张就刷新候选区,让候选一张张出现(部分成功也已入库)
          await refresh(firstAssetId ? { focusCandidateId: firstAssetId } : undefined);
        } else {
          lastError = res.message || t('Generation failed');
        }
      }
    }
    setBusy(null);
    if (ok > 0) {
      message.success(`${t('Candidates generated')}${total > 1 ? ` (${ok}/${total})` : ''}`);
    } else {
      message.error(lastError || t('Generation failed'));
    }
  }, [
    app,
    productId,
    carryImages,
    picked,
    instruction,
    activeFunc,
    modelKey,
    count,
    aspect,
    tier,
    refImage,
    craft,
    logoPos,
    lang,
    modelPreset,
    procStyle,
    pickedPoints,
    refresh,
    message,
    t,
  ]);

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
      } else {
        message.error(res.message || t('Adopt failed'));
      }
    },
    [app, adoptTarget, refresh, message, t],
  );

  const doDiscard = useCallback(
    async (asset: MediaAsset) => {
      const res = await callMediaApi(app, 'aiListingMedia:discard', { assetId: asset.id });
      if (res.ok) {
        message.success(t('Discarded'));
        if (viewCandidateId === asset.id) setViewCandidateId(null);
        await refresh();
      } else {
        message.error(res.message || t('Discard failed'));
      }
    },
    [app, viewCandidateId, refresh, message, t],
  );

  // 推荐提示词(点图出 3 条):仅场景图/卖点图支持
  const supportsReco = (k: string) => k === 'scene_gen' || k === 'selling_point';
  const firstPickedKey = useMemo(() => [...picked][0] || '', [picked]);

  const fetchRecos = useCallback(async () => {
    const src = carryImages.find((c) => picked.has(c.key));
    if (!src) return;
    setRecosLoading(true);
    const res = await callMediaApi<{ prompts: string[]; fallback: boolean }>(app, 'aiListingMedia:suggestPrompts', {
      assetId: src.assetId,
      sourceImageUrl: src.assetId ? undefined : src.url || undefined,
      scene: activeFunc.key,
      n: 3,
    });
    setRecosLoading(false);
    if (res.ok && res.data) {
      setRecos(res.data.prompts || []);
      setRecosFallback(Boolean(res.data.fallback));
    } else {
      setRecos([]);
    }
  }, [app, carryImages, picked, activeFunc.key]);

  // 进入推荐功能 / 切换源图时自动出一次推荐词(切到非推荐功能则清空)
  useEffect(() => {
    if (supportsReco(activeKey) && firstPickedKey) {
      fetchRecos();
    } else {
      setRecos([]);
      setRecosFallback(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey, firstPickedKey]);

  // 当前作为「对比原图」的选中图(第一张选中)
  const currentSrc = carryImages.find((c) => picked.has(c.key)) || null;
  const viewCandidate = data.candidates.find((c) => c.id === viewCandidateId) || null;
  const compareOriginalUrl = viewCandidate
    ? carryImages.find((c) => c.assetId === viewCandidate.parentAssetId)?.url ||
      viewCandidate.genParams?.sourceImageUrl ||
      currentSrc?.url ||
      null
    : currentSrc?.url || null;

  // 缺 i18n 键时回退到 functions.ts 的中文兜底(makeT 找不到会原样返回键名)
  const funcLabel = (fn: WorkshopFunction) => {
    const k = `workshop.func.${fn.key}`;
    const r = t(k);
    return r && r !== k ? r : fn.label;
  };
  const funcSub = (fn: WorkshopFunction) => {
    const k = `workshop.func.${fn.key}.sub`;
    const r = t(k);
    return r && r !== k ? r : fn.sub;
  };

  return (
    <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', border: '1px solid #e5e7eb' }}>
      {/* 顶部栏 */}
      <div
        style={{
          height: 52,
          background: 'linear-gradient(90deg,#0f1f3d,#15264a)',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          padding: '0 16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontWeight: 600, fontSize: 15 }}>
          <span
            style={{
              width: 26,
              height: 26,
              borderRadius: 7,
              background: 'linear-gradient(135deg,#a06bff,#1677ff)',
              display: 'grid',
              placeItems: 'center',
            }}
          >
            🎨
          </span>
          {t('Creative Workshop')}
        </div>
        <Segmented
          size="small"
          value={tab}
          onChange={(v) => setTab(v as 'image' | 'video')}
          options={[
            { value: 'image', label: `🖼️ ${t('Smart image')}` },
            { value: 'video', label: `🎬 ${t('Smart video')}` },
          ]}
        />
        <div
          style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: '#c7d2e5' }}
        >
          {productTitle ? (
            <span style={{ background: 'rgba(255,255,255,.1)', padding: '4px 10px', borderRadius: 16 }}>
              {t('Current product')}: {productTitle}
            </span>
          ) : null}
          {onBack ? (
            <Button size="small" ghost onClick={onBack}>
              ← {t('Back to candidates')}
            </Button>
          ) : null}
        </div>
      </div>

      {tab === 'image' ? (
        <div style={{ display: 'flex', minHeight: 560 }}>
          {/* 左:功能栏 */}
          <div
            style={{
              width: 92,
              borderRight: '1px solid #f0f0f0',
              background: '#fafbfc',
              padding: '8px 0',
              overflowY: 'auto',
            }}
          >
            {WORKSHOP_FUNCTIONS.map((fn) => {
              const on = fn.key === activeKey;
              const inner = (
                <div
                  key={fn.key}
                  role="button"
                  tabIndex={fn.enabled ? 0 : -1}
                  aria-disabled={!fn.enabled}
                  onClick={() => selectFunc(fn)}
                  onKeyDown={(e) => (e.key === 'Enter' && fn.enabled ? selectFunc(fn) : undefined)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 3,
                    padding: '9px 4px',
                    cursor: fn.enabled ? 'pointer' : 'not-allowed',
                    opacity: fn.enabled ? 1 : 0.4,
                    color: on ? '#1677ff' : '#6b7280',
                    fontWeight: on ? 600 : 400,
                    position: 'relative',
                  }}
                >
                  <span
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 10,
                      background: on ? '#e6f4ff' : '#fff',
                      border: `1px solid ${on ? '#1677ff' : '#e5e7eb'}`,
                      display: 'grid',
                      placeItems: 'center',
                      fontSize: 19,
                    }}
                  >
                    {fn.icon}
                  </span>
                  <span style={{ fontSize: 11, whiteSpace: 'nowrap' }}>{funcLabel(fn)}</span>
                  {!fn.enabled ? (
                    <span
                      style={{
                        position: 'absolute',
                        top: 4,
                        right: 10,
                        fontSize: 9,
                        background: '#bfbfbf',
                        color: '#fff',
                        borderRadius: 6,
                        padding: '0 4px',
                      }}
                    >
                      {fn.comingSoon}
                    </span>
                  ) : null}
                </div>
              );
              return fn.enabled ? (
                inner
              ) : (
                <Tooltip key={fn.key} title={`${funcLabel(fn)} · ${t('Coming soon')}(${fn.comingSoon})`}>
                  {inner}
                </Tooltip>
              );
            })}
          </div>

          {/* 中:带入 + 专属表单 */}
          <div
            style={{ flex: 1, minWidth: 0, padding: '18px 22px', borderRight: '1px solid #f0f0f0', overflowY: 'auto' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <Typography.Title level={4} style={{ margin: 0 }}>
                {activeFunc.icon} {funcLabel(activeFunc)}
              </Typography.Title>
              <Tag color={activeFunc.tier === 'advanced' ? 'purple' : 'blue'}>
                {activeFunc.tier === 'advanced' ? t('Advanced tier') : t('Basic tier')}
              </Tag>
            </div>
            <Typography.Paragraph type="secondary" style={{ fontSize: 12.5, marginBottom: 16 }}>
              {funcSub(activeFunc)}
            </Typography.Paragraph>

            {/* 商品图带入 */}
            <div style={{ marginBottom: 18 }}>
              <Typography.Text strong style={{ fontSize: 13 }}>
                🖼️ {t('Product images')}{' '}
                <Typography.Text type="secondary" style={{ fontWeight: 400, fontSize: 11 }}>
                  {activeFunc.single ? t('single image · click to switch') : t('max 9 · multi-select')}
                </Typography.Text>
              </Typography.Text>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  background: '#f6ffed',
                  border: '1px solid #b7eb8f',
                  borderRadius: 9,
                  padding: '8px 12px',
                  margin: '8px 0 10px',
                  fontSize: 12.5,
                  color: '#389e0d',
                }}
              >
                ✅ {t('Product images auto-loaded — no re-upload needed. Pick images to process, or upload extra.')}
                <Tag color="green" style={{ marginLeft: 'auto' }}>
                  {t('Selected')} {picked.size}
                </Tag>
              </div>
              <Spin spinning={loading}>
                {carryImages.length ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
                    {carryImages.map((c) => {
                      const on = picked.has(c.key);
                      return (
                        <div
                          key={c.key}
                          role="button"
                          tabIndex={0}
                          onClick={() => togglePick(c.key)}
                          onKeyDown={(e) => (e.key === 'Enter' ? togglePick(c.key) : undefined)}
                          style={{
                            position: 'relative',
                            aspectRatio: '1 / 1',
                            borderRadius: 8,
                            overflow: 'hidden',
                            border: on ? '2px solid #52c41a' : '1px solid #e5e7eb',
                            boxShadow: on ? '0 0 0 2px rgba(82,196,26,.12)' : 'none',
                            cursor: 'pointer',
                            background: '#f4f5f7',
                          }}
                        >
                          {c.url ? (
                            <img
                              src={c.url}
                              alt={String(c.role || c.key)}
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                          ) : null}
                          <span
                            style={{
                              position: 'absolute',
                              left: 4,
                              top: 4,
                              fontSize: 9,
                              color: '#fff',
                              borderRadius: 3,
                              padding: '0 4px',
                              lineHeight: '15px',
                              background: c.uploaded ? '#722ed1' : c.role === 'main' ? '#faad14' : '#40a9ff',
                            }}
                          >
                            {c.uploaded ? t('Uploaded') : c.role === 'main' ? t('Main') : t('Detail')}
                          </span>
                          <span
                            aria-hidden
                            style={{
                              position: 'absolute',
                              right: 4,
                              top: 4,
                              width: 17,
                              height: 17,
                              borderRadius: 5,
                              border: '1.5px solid #fff',
                              background: on ? '#52c41a' : 'rgba(0,0,0,.28)',
                              color: '#fff',
                              fontSize: 11,
                              lineHeight: '15px',
                              textAlign: 'center',
                            }}
                          >
                            {on ? '✓' : ''}
                          </span>
                        </div>
                      );
                    })}
                    {/* 上传新图 */}
                    <label
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 4,
                        border: '1.5px dashed #e5e7eb',
                        borderRadius: 8,
                        color: '#9ca3af',
                        cursor: 'pointer',
                        aspectRatio: '1 / 1',
                        background: '#fafbfc',
                      }}
                    >
                      <input
                        type="file"
                        accept="image/*"
                        style={{ display: 'none' }}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) onUpload(f);
                          e.target.value = '';
                        }}
                      />
                      <span style={{ fontSize: 20 }}>{uploading ? '…' : '+'}</span>
                      <span style={{ fontSize: 11 }}>{t('Upload')}</span>
                    </label>
                  </div>
                ) : (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('No images yet')} />
                )}
              </Spin>
            </div>

            {/* 第二张图(Logo定制的 Logo 图 / 换材质的材质参考图) */}
            {activeFunc.fields.some((f) => f.type === 'secondImage') ? (
              <div style={{ marginBottom: 18 }}>
                <Typography.Text strong style={{ fontSize: 13 }}>
                  ➕{' '}
                  {activeKey === 'logo'
                    ? t('Upload logo image')
                    : activeKey === 'model_shot'
                      ? t('Model reference image')
                      : t('Material reference image')}
                  {activeKey === 'logo' ? (
                    <span style={{ color: '#ff4d4f' }}> *</span>
                  ) : (
                    <Typography.Text type="secondary" style={{ fontWeight: 400, fontSize: 11 }}>
                      {' '}
                      {t('optional')}
                    </Typography.Text>
                  )}
                </Typography.Text>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
                  {refImage ? (
                    <div
                      style={{
                        width: 72,
                        height: 72,
                        borderRadius: 8,
                        overflow: 'hidden',
                        border: '1px solid #e5e7eb',
                        flexShrink: 0,
                      }}
                    >
                      <img
                        src={refImage.url}
                        alt={refImage.name}
                        style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#f4f5f7' }}
                      />
                    </div>
                  ) : null}
                  <label
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 3,
                      width: 72,
                      height: 72,
                      border: '1.5px dashed #e5e7eb',
                      borderRadius: 8,
                      color: '#9ca3af',
                      cursor: 'pointer',
                      background: '#fafbfc',
                      flexShrink: 0,
                    }}
                  >
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) onRefUpload(f);
                        e.target.value = '';
                      }}
                    />
                    <span style={{ fontSize: 18 }}>{refUploading ? '…' : '+'}</span>
                    <span style={{ fontSize: 11 }}>{refImage ? t('Replace') : t('Upload')}</span>
                  </label>
                  {refImage ? (
                    <a onClick={() => setRefImage(null)} style={{ fontSize: 12 }}>
                      {t('Remove')}
                    </a>
                  ) : null}
                </div>
              </div>
            ) : null}

            {/* Logo 工艺 + 位置 */}
            {activeFunc.fields.some((f) => f.type === 'craft') ? (
              <>
                <div style={{ marginBottom: 14 }}>
                  <Typography.Text strong style={{ fontSize: 13 }}>
                    🛠️ {t('Craft')}
                  </Typography.Text>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                    {CRAFTS.map((c) => (
                      <Tag.CheckableTag key={c} checked={craft === c} onChange={(on) => setCraft(on ? c : '')}>
                        {c}
                      </Tag.CheckableTag>
                    ))}
                  </div>
                </div>
                <div style={{ marginBottom: 18 }}>
                  <Typography.Text strong style={{ fontSize: 13 }}>
                    📍 {t('Logo position')}
                  </Typography.Text>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                    {LOGO_POSITIONS.map((p) => (
                      <Tag.CheckableTag key={p} checked={logoPos === p} onChange={() => setLogoPos(p)}>
                        {p}
                      </Tag.CheckableTag>
                    ))}
                  </div>
                </div>
              </>
            ) : null}

            {/* 图片翻译:目标语种 + 当前为近似翻译模式的提示 */}
            {activeFunc.fields.some((f) => f.type === 'lang') ? (
              <div style={{ marginBottom: 18 }}>
                <Typography.Text strong style={{ fontSize: 13 }}>
                  🌐 {t('Target language')} <span style={{ color: '#ff4d4f' }}>*</span>
                </Typography.Text>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                  {LANGS.map((l) => (
                    <Tag.CheckableTag key={l.value} checked={lang === l.value} onChange={() => setLang(l.value)}>
                      {l.label}
                    </Tag.CheckableTag>
                  ))}
                </div>
                <Typography.Text type="secondary" style={{ fontSize: 11.5, display: 'block', marginTop: 8 }}>
                  ℹ️{' '}
                  {t(
                    'Translation is approximated by the general image model; a layout-locked production translation endpoint can be switched in later.',
                  )}
                </Typography.Text>
              </div>
            ) : null}

            {/* 模特图:预置模特库(选一;也可在上方上传自有模特图作第二张图,优先用自传图) */}
            {activeFunc.fields.some((f) => f.type === 'modelGrid') ? (
              <div style={{ marginBottom: 18 }}>
                <Typography.Text strong style={{ fontSize: 13 }}>
                  🧍 {t('Model library')}{' '}
                  <Typography.Text type="secondary" style={{ fontWeight: 400, fontSize: 11 }}>
                    {refImage ? t('using your uploaded model image') : t('pick one, or upload your own above')}
                  </Typography.Text>
                </Typography.Text>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8, opacity: refImage ? 0.45 : 1 }}>
                  {MODEL_PRESETS.map((m) => (
                    <Tag.CheckableTag
                      key={m.key}
                      checked={!refImage && modelPreset === m.desc}
                      onChange={() => setModelPreset(m.desc)}
                    >
                      {m.label}
                    </Tag.CheckableTag>
                  ))}
                </div>
              </div>
            ) : null}

            {/* 生产流程图:信息图风格 + 文字渲染提示 */}
            {activeFunc.fields.some((f) => f.type === 'styleSeg') ? (
              <div style={{ marginBottom: 18 }}>
                <Typography.Text strong style={{ fontSize: 13 }}>
                  🎨 {t('Infographic style')}
                </Typography.Text>
                <div style={{ marginTop: 8 }}>
                  <Segmented
                    value={procStyle}
                    onChange={(v) => setProcStyle(v as string)}
                    options={STYLES.map((s) => ({ value: s, label: s }))}
                  />
                </div>
                <Typography.Text type="secondary" style={{ fontSize: 11.5, display: 'block', marginTop: 8 }}>
                  ℹ️{' '}
                  {t(
                    'Text rendering depends on the image model; a strong-text production endpoint can be switched in later.',
                  )}
                </Typography.Text>
              </div>
            ) : null}

            {/* 推荐提示词(点图出 3 条,看图生成;可填入/换一换) */}
            {supportsReco(activeKey) ? (
              <div
                style={{
                  marginBottom: 18,
                  background: '#f9f0ff',
                  border: '1px solid #efdbff',
                  borderRadius: 10,
                  padding: 12,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 9 }}>
                  <Tag color="purple" style={{ margin: 0 }}>
                    AI
                  </Tag>
                  <Typography.Text strong style={{ fontSize: 12.5, color: '#722ed1' }}>
                    {t('Recommended prompts')}
                  </Typography.Text>
                  <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                    {recosFallback ? t('example · editable') : t('based on this product image')}
                  </Typography.Text>
                  <a onClick={() => fetchRecos()} style={{ marginLeft: 'auto', fontSize: 11.5, color: '#722ed1' }}>
                    🔄 {t('Refresh')}
                  </a>
                </div>
                {recosLoading ? (
                  <div style={{ padding: '8px 0' }}>
                    <Spin size="small" />{' '}
                    <Typography.Text type="secondary" style={{ fontSize: 12, marginLeft: 6 }}>
                      {t('AI is analyzing this product…')}
                    </Typography.Text>
                  </div>
                ) : recos.length ? (
                  activeKey === 'selling_point' ? (
                    // 卖点图:多选勾选(可选多个卖点,叠加到主图文案)
                    <>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {recos.map((p, i) => (
                          <Tag.CheckableTag
                            key={i}
                            checked={pickedPoints.includes(p)}
                            onChange={(on) =>
                              setPickedPoints((prev) => (on ? [...prev, p] : prev.filter((x) => x !== p)))
                            }
                          >
                            {p}
                          </Tag.CheckableTag>
                        ))}
                      </div>
                      <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 8 }}>
                        {pickedPoints.length
                          ? `${t('Selected')} ${pickedPoints.length} · ${pickedPoints.join(' · ')}`
                          : t('Tick the selling points to overlay (multi-select)')}
                      </Typography.Text>
                    </>
                  ) : (
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
                            onClick={() => setInstruction(p)}
                            style={{ color: '#722ed1', borderColor: '#d3adf7' }}
                          >
                            {t('Fill in')}
                          </Button>
                        </div>
                      ))}
                    </Space>
                  )
                ) : (
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {t('No recommendations — enter manually below')}
                  </Typography.Text>
                )}
              </div>
            ) : null}

            {/* 专属表单:P1 只渲染提示词(其余字段 P2+) */}
            {activeFunc.fields.some((f) => f.type === 'prompt' && !f.planned) || activeFunc.promptPlaceholder ? (
              <div style={{ marginBottom: 18 }}>
                <Typography.Text strong style={{ fontSize: 13 }}>
                  ✏️ {t('Prompt')}{' '}
                  {activeFunc.instructionRequired ? (
                    <span style={{ color: '#ff4d4f' }}>*</span>
                  ) : (
                    <Typography.Text type="secondary" style={{ fontWeight: 400, fontSize: 11 }}>
                      {t('optional')}
                    </Typography.Text>
                  )}
                </Typography.Text>
                {/* 固定 rows 而非 autoSize:autoSize 走 rc-resize-observer,在独立 React root(jsBlock/Modal)里
                  卸载瞬间会测到 NaN 高度报 warning;固定行高彻底避开该 ResizeObserver。 */}
                <Input.TextArea
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  placeholder={activeFunc.promptPlaceholder}
                  maxLength={500}
                  showCount
                  rows={4}
                  style={{ marginTop: 8 }}
                />
                {['recolor', 'erase', 'detail'].includes(activeKey) ? (
                  <Typography.Text type="secondary" style={{ fontSize: 11.5, display: 'block', marginTop: 6 }}>
                    💡 {t('Describe the exact part precisely — everything else stays unchanged.')}
                  </Typography.Text>
                ) : null}
              </div>
            ) : (
              <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
                {t('This function needs no prompt — just pick images and generate.')}
              </Typography.Paragraph>
            )}

            {/* 图片比例(仅支持比例的功能显示;'' = 原图/默认,不透传 size) */}
            {activeFunc.fields.some((f) => f.type === 'ratio') ? (
              <div style={{ marginBottom: 18 }}>
                <Typography.Text strong style={{ fontSize: 13 }}>
                  📐 {t('Aspect ratio')}{' '}
                  <Typography.Text type="secondary" style={{ fontWeight: 400, fontSize: 11 }}>
                    {t('optional')}
                  </Typography.Text>
                </Typography.Text>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                  {['', ...RATIOS].map((r) => (
                    <Tag.CheckableTag key={r || 'orig'} checked={aspect === r} onChange={() => setAspect(r)}>
                      {r || t('Original')}
                    </Tag.CheckableTag>
                  ))}
                </div>
              </div>
            ) : null}

            {/* 生成栏 */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 20,
                flexWrap: 'wrap',
                padding: '14px 0 4px',
                borderTop: '1px solid #f0f0f0',
                marginTop: 6,
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                  {t('Count per image')}
                </Typography.Text>
                <InputNumber
                  min={1}
                  max={4}
                  value={count}
                  onChange={(v) => setCount(Number(v) || 1)}
                  style={{ width: 70 }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                  {t('Model tier')}
                </Typography.Text>
                <Segmented
                  value={tier}
                  onChange={(v) => setTier(v as 'basic' | 'advanced')}
                  options={[
                    { value: 'basic', label: t('Basic tier') },
                    { value: 'advanced', label: t('Advanced tier') },
                  ]}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                  {t('Model')}
                </Typography.Text>
                <Select
                  style={{ minWidth: 170 }}
                  value={modelKey}
                  onChange={setModelKey}
                  options={[
                    { value: '', label: t('Auto model') },
                    ...models.map((m) => ({ value: `${m.llmService}:${m.model}`, label: m.label })),
                  ]}
                />
              </div>
              <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block' }}>
                  {t('Est. cost')}
                </Typography.Text>
                <Typography.Text strong style={{ color: '#faad14' }}>
                  {activeFunc.cost * count} {t('beans')}
                </Typography.Text>
              </div>
              <Button type="primary" size="large" loading={Boolean(busy)} onClick={doGenerate} disabled={!picked.size}>
                ✨ {busy ? `${t('Generating')} ${busy.done}/${busy.total}` : t('Start generating')}
              </Button>
            </div>

            {/* 出图进度条:多张时逐张生成,进度 = 已出/总数;候选逐张在右侧回流 */}
            {busy ? (
              <div style={{ marginTop: 12 }}>
                <Progress
                  percent={busy.total ? Math.round((busy.done / busy.total) * 100) : 0}
                  status="active"
                  format={() => `${busy.done}/${busy.total}`}
                />
                <Typography.Text type="secondary" style={{ fontSize: 11.5 }}>
                  ⏳ {t('Generating one by one — candidates appear on the right as each finishes (upstream is slow).')}
                </Typography.Text>
              </div>
            ) : null}
          </div>

          {/* 右:示例 / 结果 */}
          <div style={{ width: 326, flexShrink: 0, padding: '18px 16px', background: '#fafbfc', overflowY: 'auto' }}>
            <Typography.Text type="secondary" style={{ fontSize: 12.5, fontWeight: 600 }}>
              📎 {t('Preview (before · after)')}
            </Typography.Text>
            <div style={{ marginTop: 10, marginBottom: 18 }}>
              <CompareView
                originalUrl={compareOriginalUrl}
                candidateUrl={viewCandidate?.url || null}
                mode="side"
                t={t}
                emptyHint={
                  currentSrc
                    ? t('Pick a function and generate — candidates show here')
                    : t('Select a source image first')
                }
              />
            </div>

            <Typography.Text type="secondary" style={{ fontSize: 12.5, fontWeight: 600 }}>
              🎉 {t('Generated candidates')}
              {data.candidates.length ? (
                <Typography.Text style={{ color: '#1677ff' }}> ({data.candidates.length})</Typography.Text>
              ) : null}
            </Typography.Text>
            {data.candidates.length ? (
              <>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '10px 0' }}>
                  {data.candidates.map((c) => (
                    <div
                      key={c.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setViewCandidateId(c.id)}
                      onKeyDown={(e) => (e.key === 'Enter' ? setViewCandidateId(c.id) : undefined)}
                      style={{
                        width: 62,
                        height: 62,
                        borderRadius: 8,
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
                {viewCandidate ? (
                  <Space wrap>
                    <Button type="primary" onClick={() => setAdoptTarget(viewCandidate)}>
                      ✓ {t('Adopt')}
                    </Button>
                    <Button danger onClick={() => doDiscard(viewCandidate)}>
                      {t('Discard')}
                    </Button>
                  </Space>
                ) : (
                  <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                    {t('Click a candidate to compare / adopt')}
                  </Typography.Text>
                )}
                <Typography.Paragraph type="secondary" style={{ fontSize: 11, marginTop: 8 }}>
                  {t('Adopting writes the product final image (audit as user); publish prefers the adopted set.')}
                </Typography.Paragraph>
              </>
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
                🖼️ {t('Candidates will appear here → compare / adopt / discard')}
              </div>
            )}
          </div>
        </div>
      ) : (
        <VideoPane app={app} productId={productId} sources={carryImages} loadingSources={loading} t={t} />
      )}

      <AdoptModal
        candidate={adoptTarget}
        gallery={data.gallery}
        onConfirm={doAdopt}
        onClose={() => setAdoptTarget(null)}
        loading={adopting}
        t={t}
      />
    </div>
  );
}
