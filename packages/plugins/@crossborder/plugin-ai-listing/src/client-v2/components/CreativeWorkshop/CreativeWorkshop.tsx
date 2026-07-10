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

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  App as AntdApp,
  Button,
  ColorPicker,
  Empty,
  Input,
  Modal,
  Popconfirm,
  Popover,
  Progress,
  Segmented,
  Select,
  Space,
  Spin,
  Switch,
  Tabs,
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
import { WorkshopHistory } from './WorkshopHistory';
import {
  composeInstruction,
  recolorInstructions,
  ERASE_TARGETS,
  MODEL_AGES,
  MODEL_BACKGROUNDS,
  MODEL_GENDERS,
  MODEL_RACES,
  RECOLOR_COLORS,
  type ModelSpec,
} from './prompt-compose';

// 带入区的一张图:来自商品图集(assetId)或用户新上传(sourceImageUrl)
interface CarryImage {
  key: string;
  assetId?: number;
  url: string | null;
  role?: string | null;
  finalSelected?: boolean;
  uploaded?: boolean;
  // W3 再次编辑:AI 生成的候选被拉回带入区作源图(角标显示 AI)
  ai?: boolean;
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

// —— W2 风格模版体系 —— 类目 key → i18n 键(与服务端 STYLE_TEMPLATE_CATEGORIES 的 label 一致)
const TPL_CAT_LABELS: Record<string, string> = {
  festive: 'Festive & Gifts',
  bags: 'Bags & Luggage',
  home: 'Home & Storage',
  food: 'Food & Beverage',
  apparel: 'Apparel & Accessories',
  industrial: 'Industrial & Tools',
  general: 'General',
};

// aiListingMedia:styleTemplates 返回的一条模版
interface StyleTemplate {
  id: number;
  title: string;
  category: string;
  scene: string;
  prompt: string;
  thumbUrl: string | null;
  source: 'builtin' | 'user';
  sort: number;
}

interface StyleTemplateData {
  templates: StyleTemplate[];
  mine: StyleTemplate[];
  categories: Array<{ key: string; label: string; count: number }>;
  recommended: string;
}

// 模版图卡:有 thumbUrl 显示小图,否则文字卡(prompt 摘要铺渐变底);选中高亮描边 + ✓ 角标;
// mine 卡带删除角标(Popconfirm 确认,阻止冒泡不触发选中)。
function TplCard({
  tpl,
  selected,
  onClick,
  onDelete,
  t,
}: {
  tpl: StyleTemplate;
  selected: boolean;
  onClick: () => void;
  onDelete?: () => void;
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      data-testid="ws-tpl-card"
      data-selected={selected ? '1' : '0'}
      onClick={onClick}
      onKeyDown={(e) => (e.key === 'Enter' ? onClick() : undefined)}
      title={tpl.prompt}
      style={{
        position: 'relative',
        border: selected ? '2px solid #7a5cff' : '1px solid #e5e7eb',
        borderRadius: 8,
        overflow: 'hidden',
        cursor: 'pointer',
        background: '#fff',
      }}
    >
      <div style={{ aspectRatio: '1 / 1', background: '#f4f5f7' }}>
        {tpl.thumbUrl ? (
          <img src={tpl.thumbUrl} alt={tpl.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              padding: '8px 8px 0',
              background: 'linear-gradient(150deg,#f6f2ff,#fdf3ee)',
              color: '#6b6580',
              fontSize: 10.5,
              lineHeight: '15px',
              overflow: 'hidden',
            }}
          >
            {tpl.prompt}
          </div>
        )}
      </div>
      <div
        style={{
          padding: '4px 6px',
          fontSize: 11.5,
          fontWeight: selected ? 600 : 400,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          borderTop: '1px solid #f0f0f0',
        }}
      >
        {tpl.title}
      </div>
      {selected ? (
        <span
          style={{
            position: 'absolute',
            top: 4,
            left: 4,
            width: 18,
            height: 18,
            borderRadius: '50%',
            background: '#7a5cff',
            color: '#fff',
            fontSize: 11,
            display: 'grid',
            placeItems: 'center',
          }}
        >
          ✓
        </span>
      ) : null}
      {onDelete ? (
        <Popconfirm
          title={t('Delete this template?')}
          okText={t('Delete')}
          cancelText={t('Cancel')}
          onConfirm={(e) => {
            e?.stopPropagation();
            onDelete();
          }}
          onCancel={(e) => e?.stopPropagation()}
        >
          <span
            role="button"
            tabIndex={0}
            aria-label={t('Delete template')}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'absolute',
              top: 4,
              right: 4,
              width: 18,
              height: 18,
              borderRadius: '50%',
              background: 'rgba(0,0,0,.45)',
              color: '#fff',
              fontSize: 11,
              display: 'grid',
              placeItems: 'center',
            }}
          >
            ✕
          </span>
        </Popconfirm>
      ) : null}
    </div>
  );
}

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
  // W1:可缺省 —— 独立菜单页裸进入时组件内置商品选择器,选完再进工坊主体
  productId?: number;
  productTitle?: string;
  // 从候选区跳入时预选的图(URL 带入)
  initialAssetIds?: number[];
  // 返回候选区/上一页;缺省不显示返回按钮
  onBack?: () => void;
  // 独立页模式:允许顶部「切换商品」;每次切换回调(jsBlock 用它同步 URL ?productId=)
  allowSwitch?: boolean;
  onProductChange?: (id: number, title?: string) => void;
}

// 商品选择器里的一行(aiListingReview:list 返回)
interface PickerProduct {
  id: number;
  title: string;
  status: string;
  mainImage: string | null;
}

// 外层:持有「当前商品」;裸进入(独立菜单页)先走商品选择器,选定后主体按 key=pid 重挂载(天然重置全部状态)。
// 自由改图模式(W1.5 用户反馈):不选商品也能进工坊 —— 只上传图/生成/对比/下载,产物不归属任何商品。
export function CreativeWorkshop(props: CreativeWorkshopProps) {
  const t = useMemo(() => makeT(props.app), [props.app]);
  const [pid, setPid] = useState<number | undefined>(props.productId || undefined);
  const [pidTitle, setPidTitle] = useState<string | undefined>(props.productTitle);
  const [freeMode, setFreeMode] = useState(false);
  if (!pid && !freeMode) {
    return (
      <ProductPicker
        app={props.app}
        t={t}
        onPick={(p) => {
          setPid(p.id);
          setPidTitle(p.title);
          props.onProductChange?.(p.id, p.title);
        }}
        onFree={() => setFreeMode(true)}
      />
    );
  }
  return (
    <WorkshopBody
      {...props}
      key={pid ?? 'free'}
      productId={pid ?? 0}
      freeMode={!pid}
      productTitle={pid ? pidTitle : undefined}
      onSwitchProduct={
        props.allowSwitch
          ? () => {
              setFreeMode(false);
              setPid(undefined);
            }
          : undefined
      }
    />
  );
}

// 独立页裸进入时的商品选择器:搜索 + 卡片网格,选一个进工坊;也可不选商品直接上传改图
function ProductPicker({
  app,
  t,
  onPick,
  onFree,
}: {
  app: MediaStudioApp;
  t: (key: string, options?: Record<string, unknown>) => string;
  onPick: (p: PickerProduct) => void;
  onFree: () => void;
}) {
  const [items, setItems] = useState<PickerProduct[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(false);
  const load = useCallback(
    async (p: number, kw: string, append: boolean) => {
      setLoading(true);
      const res = await callMediaApi<{ products: PickerProduct[]; total: number }>(app, 'aiListingReview:list', {
        page: p,
        pageSize: 24,
        keyword: kw || undefined,
      });
      setLoading(false);
      if (res.ok && res.data) {
        setItems((prev) => (append ? [...prev, ...res.data.products] : res.data.products));
        setTotal(res.data.total);
      }
    },
    [app],
  );
  useEffect(() => {
    load(1, '', false);
  }, [load]);
  return (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', minHeight: 560 }}>
      <div
        style={{
          height: 52,
          background: 'linear-gradient(90deg,#0f1f3d,#15264a)',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '0 16px',
          borderRadius: '12px 12px 0 0',
        }}
      >
        <span style={{ fontWeight: 600, fontSize: 15 }}>🎨 {t('Creative Workshop')}</span>
        <span style={{ fontSize: 12, color: '#c7d2e5' }}>{t('Pick a product to start')}</span>
      </div>
      <div style={{ padding: 20, maxWidth: 1200, margin: '0 auto' }} data-testid="ws-picker">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <Input.Search
            allowClear
            placeholder={t('Search product title')}
            style={{ maxWidth: 380 }}
            onSearch={(v) => {
              setKeyword(v);
              setPage(1);
              load(1, v, false);
            }}
          />
          <Button onClick={onFree}>🖼️ {t('Edit images without a product')} →</Button>
        </div>
        <Spin spinning={loading}>
          {items.length ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14 }}>
              {items.map((p) => (
                <div
                  key={p.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onPick(p)}
                  onKeyDown={(e) => (e.key === 'Enter' ? onPick(p) : undefined)}
                  style={{
                    border: '1px solid #e5e7eb',
                    borderRadius: 10,
                    overflow: 'hidden',
                    cursor: 'pointer',
                    background: '#fff',
                  }}
                >
                  <div style={{ aspectRatio: '1 / 1', background: '#f4f5f7' }}>
                    {p.mainImage ? (
                      <img
                        src={p.mainImage}
                        alt={p.title}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : null}
                  </div>
                  <div style={{ padding: '8px 10px' }}>
                    <div
                      style={{
                        fontSize: 12.5,
                        lineHeight: '17px',
                        height: 34,
                        overflow: 'hidden',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                      }}
                      title={p.title}
                    >
                      {p.title}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Empty description={t('No products yet')} />
          )}
        </Spin>
        {items.length < total ? (
          <div style={{ textAlign: 'center', marginTop: 16 }}>
            <Button
              loading={loading}
              onClick={() => {
                const next = page + 1;
                setPage(next);
                load(next, keyword, true);
              }}
            >
              {t('Load more')} ({items.length}/{total})
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

interface WorkshopBodyProps extends CreativeWorkshopProps {
  // 0 = 自由改图模式(不绑定商品:只上传/生成/对比/下载,无图集无采纳位)
  productId: number;
  freeMode?: boolean;
  onSwitchProduct?: () => void;
}

function WorkshopBody({
  app,
  productId,
  productTitle,
  initialAssetIds,
  onBack,
  onSwitchProduct,
  freeMode,
  allowSwitch,
}: WorkshopBodyProps) {
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
  const [recosModel, setRecosModel] = useState<string | null>(null); // 实际产词的模型名(兜底时 null)
  const [recosBasis, setRecosBasis] = useState<'image' | 'title' | 'static'>('static'); // 产词依据(三级链)
  const [refImage, setRefImage] = useState<{ url: string; name: string } | null>(null); // 第二张图(Logo/材质参考)
  const [refUploading, setRefUploading] = useState(false);
  const [craft, setCraft] = useState<string>(''); // Logo 工艺
  const [logoPos, setLogoPos] = useState<string>('正面中间'); // Logo 位置
  const [lang, setLang] = useState<string>('English'); // 图片翻译目标语种
  const [modelPreset, setModelPreset] = useState<string>(MODEL_PRESETS[0].desc); // 模特图选中的模特描述
  const [procStyle, setProcStyle] = useState<string>(STYLES[0]); // 生产流程图风格
  // —— W5 功能表单深化 ——
  const [recolorColors, setRecolorColors] = useState<string[]>([]); // 换色目标色(多选,一色一张)
  const [customColor, setCustomColor] = useState<string>(''); // 换色自定义色(ColorPicker,hex 注入 prompt)
  const [modelSpec, setModelSpec] = useState<ModelSpec>({}); // 模特档位(与预置模特互斥)
  const [translateProductText, setTranslateProductText] = useState(false); // 翻译商品实物上的文字
  const [keepBrandWords, setKeepBrandWords] = useState(true); // 品牌词不翻译
  const [hdScale, setHdScale] = useState<2 | 4>(2); // 高清放大倍数
  const [eraseTargets, setEraseTargets] = useState<string[]>([]); // 擦除元素勾选
  const [sceneRelayout, setSceneRelayout] = useState(false); // 场景图:允许重新摆放商品
  // W6 i豆动态估算(服务端价目;失败回退 functions.ts 静态 cost)
  const [est, setEst] = useState<{
    beans: number;
    breakdown: { scene: string; tier: string; unit: number; count: number; sources: number; images: number };
  } | null>(null);
  const [pickedPoints, setPickedPoints] = useState<string[]>([]); // 营销卖点图:勾选的 AI 卖点
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);
  const [viewCandidateId, setViewCandidateId] = useState<number | null>(null);
  const [adoptTarget, setAdoptTarget] = useState<MediaAsset | null>(null);
  const [adopting, setAdopting] = useState(false);
  const [watchUntil, setWatchUntil] = useState(0);
  const [manageOpen, setManageOpen] = useState(false); // 管理图片弹层(完整网格)
  const [advOpen, setAdvOpen] = useState(false); // 高级:显式指定模型(默认收起)
  const [cmpMode, setCmpMode] = useState<'slider' | 'side'>('slider'); // 画布大图对比:拉帘(默认)/并排
  // —— W2 模版风格选择(templateTabs 功能才拉)——
  const [tplData, setTplData] = useState<StyleTemplateData | null>(null);
  const [tplTab, setTplTab] = useState<string>('reco'); // reco 推荐提示词 / builtin 推荐风格模版 / mine 自定义模版
  const [tplCat, setTplCat] = useState<string>('general'); // 当前类目(默认=按商品推荐)
  const [tplSelected, setTplSelected] = useState<number | null>(null); // 选中的模版 id(再点取消)
  const [tplLoading, setTplLoading] = useState(false);
  const [tplMoreOpen, setTplMoreOpen] = useState(false); // 「更多 >」全量浏览弹层
  const [newTplOpen, setNewTplOpen] = useState(false); // 新建模版弹层
  // W3 保存为模版:thumbUrl 预填结果图,让自定义模版也是图文卡
  const promptRef = useRef<HTMLDivElement>(null); // 再次编辑回填后滚到提示词
  const [newTpl, setNewTpl] = useState<{ title: string; category: string; prompt: string; thumbUrl?: string }>({
    title: '',
    category: 'general',
    prompt: '',
  });
  const [newTplSaving, setNewTplSaving] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false); // W4 创作历史抽屉

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

  // W2:拉风格模版(builtin+mine+类目聚合);带 productId 自动推荐类目并默认选中,自由模式落「通用」
  const loadTpls = useCallback(
    async (opts?: { keepCat?: boolean }) => {
      setTplLoading(true);
      const res = await callMediaApi<StyleTemplateData>(app, 'aiListingMedia:styleTemplates', {
        scene: activeKey,
        productId: productId || undefined,
      });
      setTplLoading(false);
      if (res.ok && res.data) {
        setTplData(res.data);
        if (!opts?.keepCat) {
          const rec = res.data.recommended;
          const has = res.data.categories.some((c) => c.key === rec);
          setTplCat(has ? rec : res.data.categories[0]?.key || 'general');
        }
      }
    },
    [app, activeKey, productId],
  );

  useEffect(() => {
    if (!activeFunc.templateTabs) return;
    loadTpls();
  }, [activeFunc.templateTabs, loadTpls]);

  // W6:预计消耗动态估算(防抖 350ms):功能/档位/张数/源图数/换色色数任一变化即重估;失败保持上次或回退静态
  useEffect(() => {
    const timer = setTimeout(async () => {
      const colorCount = activeFunc.key === 'recolor' ? recolorColors.length + (customColor ? 1 : 0) : 0;
      const res = await callMediaApi<{
        beans: number;
        breakdown: { scene: string; tier: string; unit: number; count: number; sources: number; images: number };
      }>(app, 'aiListingMedia:estimateCost', {
        scene: activeKey,
        tier,
        count: colorCount || count,
        sources: Math.max(picked.size, 1),
      });
      if (res.ok && res.data) setEst(res.data);
    }, 350);
    return () => clearTimeout(timer);
  }, [app, activeKey, activeFunc.key, tier, count, picked, recolorColors, customColor]);

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

  // 切功能:预填默认指令 + 该功能默认张数;单图功能把多选收敛为一张
  const selectFunc = useCallback((fn: WorkshopFunction) => {
    if (!fn.enabled) return;
    setActiveKey(fn.key);
    setInstruction(fn.promptDefault || '');
    setAspect('');
    setTier(fn.tier);
    setCount(fn.defaultCount || 1);
    setRefImage(null);
    setCraft('');
    setLogoPos('正面中间');
    setLang('English');
    setModelPreset(MODEL_PRESETS[0].desc);
    setProcStyle(STYLES[0]);
    setPickedPoints([]);
    setRecolorColors([]);
    setCustomColor('');
    setModelSpec({});
    setTranslateProductText(false);
    setKeepBrandWords(true);
    setHdScale(2);
    setEraseTargets([]);
    setSceneRelayout(false);
    setViewCandidateId(null);
    setTplSelected(null);
    setTplTab('reco');
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
        if (next.has(key)) {
          next.delete(key);
        } else {
          // 对齐阿里「上传图片 (n/9)」:多图功能硬上限 9 张
          if (next.size >= 9) {
            message.warning(t('Up to 9 images per batch'));
            return prev;
          }
          next.add(key);
        }
        return next;
      });
    },
    [activeFunc.single, message, t],
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
          // 9 张硬上限:满了则只入库不自动勾选
          if (next.size >= 9) {
            message.warning(t('Up to 9 images per batch'));
            return prev;
          }
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

  // W2:点模版卡 = 选中 + prompt 全文填入提示词框(可再手改);再点同卡取消(提示词未被手改才一并清空)
  const toggleTpl = useCallback(
    (tpl: StyleTemplate) => {
      if (tplSelected === tpl.id) {
        setTplSelected(null);
        setInstruction((prev) => (prev === tpl.prompt ? '' : prev));
      } else {
        setTplSelected(tpl.id);
        setInstruction(tpl.prompt);
      }
    },
    [tplSelected],
  );

  // 新建自定义模版(标题/类目/提示词;缩略图留给 W3「保存为模版」带结果图)
  const saveNewTpl = useCallback(async () => {
    const title = newTpl.title.trim();
    const prompt = newTpl.prompt.trim();
    if (!title || !prompt) {
      message.warning(t('Template title and prompt are required'));
      return;
    }
    setNewTplSaving(true);
    const res = await callMediaApi<StyleTemplate>(app, 'aiListingMedia:saveStyleTemplate', {
      title,
      category: newTpl.category,
      scene: activeKey,
      prompt,
      thumbUrl: newTpl.thumbUrl || undefined,
    });
    setNewTplSaving(false);
    if (res.ok) {
      message.success(t('Template saved'));
      setNewTplOpen(false);
      setNewTpl({ title: '', category: 'general', prompt: '' });
      setTplTab('mine');
      loadTpls({ keepCat: true });
    } else if (res.message) {
      message.error(res.message);
    }
  }, [app, newTpl, activeKey, message, t, loadTpls]);

  // 删除自定义模版(仅本人;服务端二次校验)
  const deleteTpl = useCallback(
    async (id: number) => {
      const res = await callMediaApi(app, 'aiListingMedia:deleteStyleTemplate', { id });
      if (res.ok) {
        message.success(t('Template deleted'));
        if (tplSelected === id) setTplSelected(null);
        loadTpls({ keepCat: true });
      } else if (res.message) {
        message.error(res.message);
      }
    },
    [app, message, t, loadTpls, tplSelected],
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

  // 生成:对每张选中图逐张出候选(受服务端日限额保护);多图上限 9 张(与选图区一致)
  const doGenerate = useCallback(async () => {
    const targets = carryImages.filter((c) => picked.has(c.key)).slice(0, 9);
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
    // 表单档位/开关 → 指令(W5 提炼为纯函数 prompt-compose.ts,便于单测)
    const effInstr = composeInstruction({
      funcKey: activeFunc.key,
      instruction: instr,
      hasRefImage: Boolean(refImage),
      craft,
      logoPos,
      modelPreset: refImage ? '' : modelPreset,
      modelSpec,
      pickedPoints,
      eraseTargets,
      translateProductText,
      keepBrandWords,
      sceneRelayout,
    });
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
    // 换色多色批量(W5):选了 N 个目标色 = 每源图一色一张(取代张数),targetColor 记进 parameters 供历史/色标签。
    const allColors = activeFunc.key === 'recolor' ? [...recolorColors, ...(customColor ? [customColor] : [])] : [];
    const colorInstrs = allColors.length ? recolorInstructions(instr, allColors) : null;
    const perImage = colorInstrs ? colorInstrs.length : Math.min(Math.max(count, 1), 4);
    const total = targets.length * perImage;
    // 全功能放开批量后源图×张数(或×色数)可能到几十张:大批量给一次性提示(网关单张 20s-3min),不拦截
    if (total >= 10) {
      message.info(t('This batch will generate {{n}} images — it may take a while.', { n: total }));
    }
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
            instruction: colorInstrs ? colorInstrs[k] : effInstr,
            n: 1,
            llmService,
            model,
            aspect: aspect || undefined,
            tier,
            parameters: colorInstrs
              ? { targetColor: allColors[k] }
              : activeFunc.key === 'hd'
                ? { upscale_factor: hdScale }
                : undefined,
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
    modelSpec,
    procStyle,
    pickedPoints,
    recolorColors,
    customColor,
    hdScale,
    eraseTargets,
    translateProductText,
    keepBrandWords,
    sceneRelayout,
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
    async (asset: Pick<MediaAsset, 'id'>) => {
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

  // —— W3 结果画布操作闭环:下载 / 再次编辑 / 重新生成 / 保存为模版(对齐阿里,加上我们的采纳/弃用)——

  // 下载:取本地落库原图(meta.storedUrl 即 url),blob + a.download 命名「商品ID_功能_序号.扩展名」;
  // 跨域或取流失败时退化为新窗口打开
  const doDownload = useCallback(
    async (cand: Pick<MediaAsset, 'id' | 'url' | 'genParams'>) => {
      const url = cand.url;
      if (!url) return;
      const fnKey = cand.genParams?.scene || 'image';
      const ext = url.match(/\.(png|jpe?g|webp|gif)(?:$|\?)/i)?.[1] || 'png';
      const name = `${productId || 'free'}_${fnKey}_${cand.id}.${ext}`;
      try {
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(String(resp.status));
        const blob = await resp.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = name;
        a.click();
        URL.revokeObjectURL(a.href);
      } catch {
        window.open(url, '_blank');
      }
    },
    [productId],
  );

  // 再次编辑:候选拉回带入区作源图(AI 角标)+ 回填该次 genParams(功能/指令/比例/档位)→ 滚到提示词,
  // 用户微调后再生成,parentAssetId 自然形成迭代链
  const doEditAgain = useCallback(
    (cand: Pick<MediaAsset, 'id' | 'url' | 'genParams'>) => {
      const gp = cand.genParams || {};
      const key = `c${cand.id}`;
      setUploaded((prev) =>
        prev.some((u) => u.key === key) ? prev : [...prev, { key, assetId: cand.id, url: cand.url, ai: true }],
      );
      const fn = typeof gp.scene === 'string' ? getWorkshopFunction(gp.scene) : undefined;
      if (fn && fn.key !== activeKey) selectFunc(fn);
      // selectFunc 会重置表单,以下覆盖必须排在其后(同一批 state 更新,后写胜出)
      setPicked(new Set([key]));
      setInstruction(String(gp.instruction || ''));
      setAspect(String(gp.aspect || ''));
      if (gp.tier === 'basic' || gp.tier === 'advanced') setTier(gp.tier);
      setViewCandidateId(null);
      promptRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      message.success(t('Loaded as source — tweak the settings and generate again'));
    },
    [activeKey, selectFunc, message, t],
  );

  // 重新生成:原源图 + 原参数(genParams 快照)原样再跑一次,产出新候选(与被重生成者同源同参)
  const doRegenerate = useCallback(
    async (cand: Pick<MediaAsset, 'genParams' | 'parentAssetId'>) => {
      const gp = cand.genParams || {};
      const sourceAssetId = gp.sourceAssetId || cand.parentAssetId || undefined;
      const sourceImageUrl = !sourceAssetId ? gp.sourceImageUrl || undefined : undefined;
      setBusy({ done: 0, total: 1 });
      setWatchUntil(Date.now() + 240000);
      const res = await callMediaApi<{ assets: Array<{ assetId: number; url: string }> }>(
        app,
        'aiListingMedia:generate',
        {
          productId: productId || undefined,
          assetId: sourceAssetId,
          sourceImageUrl,
          // 无任何源图的候选(t2i 产物)按原样走纯文生图
          textToImage: !sourceAssetId && !sourceImageUrl ? true : undefined,
          scene: gp.scene || undefined,
          instruction: gp.instruction || '',
          n: 1,
          aspect: gp.aspect || undefined,
          tier: gp.tier || undefined,
          llmService: gp.llmService || undefined,
          model: gp.model || undefined,
          refImageUrl: gp.refImageUrl || undefined,
          targetLanguage: gp.targetLanguage || undefined,
          style: gp.style || undefined,
        },
      );
      setBusy(null);
      if (res.ok) {
        message.success(t('Candidates generated'));
        await refresh({ focusCandidateId: res.data?.assets?.[0]?.assetId });
      } else {
        message.error(res.message || t('Generation failed'));
      }
    },
    [app, productId, refresh, message, t],
  );

  // 保存为模版:复用 W2 新建模版弹层,prompt 预填该次 instruction、缩略图 = 该结果图;仅有 instruction 时显示
  const saveCandidateAsTemplate = useCallback(
    (cand: MediaAsset) => {
      setNewTpl({
        title: '',
        category: tplData?.recommended || tplCat || 'general',
        prompt: String(cand.genParams?.instruction || ''),
        thumbUrl: cand.url || undefined,
      });
      setNewTplOpen(true);
    },
    [tplData, tplCat],
  );

  // 推荐提示词(点图出 3 条):仅场景图/卖点图支持
  const supportsReco = (k: string) => k === 'scene_gen' || k === 'selling_point';
  const firstPickedKey = useMemo(() => [...picked][0] || '', [picked]);

  const fetchRecos = useCallback(async () => {
    const src = carryImages.find((c) => picked.has(c.key));
    if (!src) return;
    setRecosLoading(true);
    const res = await callMediaApi<{
      prompts: string[];
      fallback: boolean;
      model: string | null;
      basis?: 'image' | 'title' | 'static';
    }>(app, 'aiListingMedia:suggestPrompts', {
      assetId: src.assetId,
      sourceImageUrl: src.assetId ? undefined : src.url || undefined,
      scene: activeFunc.key,
      n: 3,
    });
    setRecosLoading(false);
    if (res.ok && res.data) {
      setRecos(res.data.prompts || []);
      setRecosFallback(Boolean(res.data.fallback));
      setRecosModel(res.data.model || null);
      setRecosBasis(res.data.basis || (res.data.fallback ? 'static' : 'image'));
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
  const funcHeroSub = (fn: WorkshopFunction) => {
    const k = `workshop.func.${fn.key}.heroSub`;
    const r = t(k);
    return r && r !== k ? r : fn.heroSub;
  };
  const funcHeroValue = (fn: WorkshopFunction) => {
    const k = `workshop.func.${fn.key}.heroValue`;
    const r = t(k);
    return r && r !== k ? r : fn.heroValue;
  };

  // —— W2 模版风格选择三 tab 的各 pane(templateTabs 功能才用;recoBox 同时是非 tab 功能的独立块)——
  const catTpls = (tplData?.templates || []).filter((tpl) => tpl.category === tplCat);
  const recoBox = (
    <div style={{ background: '#f9f0ff', border: '1px solid #efdbff', borderRadius: 10, padding: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 9, flexWrap: 'wrap' }}>
        {/* 透明化(用户反馈):真看图=紫 AI 标 + 模型名;静态兜底=灰「示例」标 + 明确说明,不再含糊 */}
        <Tag color={recosFallback && !recosLoading ? 'default' : 'purple'} style={{ margin: 0 }}>
          {recosFallback && !recosLoading ? t('Examples') : 'AI'}
        </Tag>
        <Typography.Text
          strong
          style={{ fontSize: 12.5, color: recosFallback && !recosLoading ? undefined : '#722ed1' }}
        >
          {t('Recommended prompts')}
        </Typography.Text>
        <Typography.Text type="secondary" style={{ fontSize: 11 }}>
          {recosLoading
            ? ''
            : recosFallback
              ? t('vision model unavailable — static examples, editable')
              : recosBasis === 'title'
                ? `${t('based on the product title (image not analyzed)')} · ${recosModel || ''}`
                : recosModel
                  ? `${t('based on this product image')} · ${recosModel}`
                  : t('based on this product image')}
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
                  onChange={(on) => setPickedPoints((prev) => (on ? [...prev, p] : prev.filter((x) => x !== p)))}
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
  );
  // tab2 推荐风格模版:类目下拉(按商品自动推荐默认选中)+ 2×3 图卡 + 「更多 >」全量浏览
  const builtinPane =
    tplLoading && !tplData ? (
      <div style={{ padding: '8px 0' }}>
        <Spin size="small" />
      </div>
    ) : (
      <div data-testid="ws-tpl-builtin">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <Select
            size="small"
            style={{ flex: 1, minWidth: 0 }}
            value={tplCat}
            onChange={(v) => setTplCat(v)}
            options={(tplData?.categories || []).map((c) => ({
              value: c.key,
              label: `${t(TPL_CAT_LABELS[c.key] || c.key)} (${c.count})${
                c.key === tplData?.recommended ? ` · ${t('Recommended')}` : ''
              }`,
            }))}
          />
          <a onClick={() => setTplMoreOpen(true)} style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
            {t('More')} &gt;
          </a>
        </div>
        {catTpls.length ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
            {catTpls.slice(0, 6).map((tpl) => (
              <TplCard key={tpl.id} tpl={tpl} selected={tplSelected === tpl.id} onClick={() => toggleTpl(tpl)} t={t} />
            ))}
          </div>
        ) : (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {t('No templates in this category yet')}
          </Typography.Text>
        )}
        <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 8 }}>
          💡 {t('Click a card to fill the prompt; click again to deselect')}
        </Typography.Text>
      </div>
    );
  // tab3 自定义模版:我的模版网格(删除角标)+ 空态引导 + 新建
  const minePane = (
    <div data-testid="ws-tpl-mine">
      {tplData?.mine.length ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
          {tplData.mine.map((tpl) => (
            <TplCard
              key={tpl.id}
              tpl={tpl}
              selected={tplSelected === tpl.id}
              onClick={() => toggleTpl(tpl)}
              onDelete={() => deleteTpl(tpl.id)}
              t={t}
            />
          ))}
        </div>
      ) : (
        <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
          {t('No custom templates yet — save a good result as a template, or create one below.')}
        </Typography.Text>
      )}
      <Button
        size="small"
        style={{ marginTop: 10 }}
        onClick={() => {
          setNewTpl({ title: '', category: tplCat || 'general', prompt: instruction || '' });
          setNewTplOpen(true);
        }}
      >
        ＋ {t('New template')}
      </Button>
    </div>
  );

  return (
    <div
      data-testid="ws-root"
      style={{
        background: '#fff',
        borderRadius: 12,
        overflow: 'hidden',
        border: '1px solid #e5e7eb',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* 顶部栏:标题居左 / tab 绝对居中(对齐阿里) / 右上 商品名 + 切换商品 + 创作历史 + 返回 */}
      <div
        style={{
          height: 52,
          background: 'linear-gradient(90deg,#0f1f3d,#15264a)',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          padding: '0 16px',
          position: 'relative',
          flexShrink: 0,
        }}
      >
        {/* 独立页(allowSwitch)时页面标题已是「创意工坊」,块内不再重复;Modal 承载无页面标题才显示 */}
        {allowSwitch ? null : (
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
        )}
        <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}>
          <Segmented
            size="small"
            value={tab}
            onChange={(v) => setTab(v as 'image' | 'video')}
            options={[
              { value: 'image', label: `🖼️ ${t('Smart image')}` },
              // 自由改图不绑定商品,视频产物必须归属商品(视频位/发布),故禁用
              { value: 'video', label: `🎬 ${t('Smart video')}`, disabled: freeMode },
            ]}
          />
        </div>
        <div
          style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: '#c7d2e5' }}
        >
          {freeMode ? (
            <span style={{ background: 'rgba(255,255,255,.1)', padding: '4px 10px', borderRadius: 16 }}>
              🖼️ {t('Free editing · not linked to a product')}
            </span>
          ) : productTitle ? (
            <span
              style={{
                background: 'rgba(255,255,255,.1)',
                padding: '4px 10px',
                borderRadius: 16,
                maxWidth: 240,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={productTitle}
            >
              {t('Current product')}: {productTitle}
            </span>
          ) : null}
          {onSwitchProduct ? (
            <Button size="small" ghost onClick={onSwitchProduct}>
              ⇄ {t('Switch product')}
            </Button>
          ) : null}
          {/* 创作历史(W4):跨会话回看全部生成记录 */}
          <Button size="small" ghost onClick={() => setHistoryOpen(true)} data-testid="ws-history-btn">
            🕘 {t('Creation history')}
          </Button>
          {onBack ? (
            <Button size="small" ghost onClick={onBack}>
              ← {t('Back to candidates')}
            </Button>
          ) : null}
        </div>
      </div>

      {tab === 'image' ? (
        // 有界高度是配置列内滚 + 底部生成栏常驻的前提(独立页/Modal 两种承载都按视口扣顶部)
        <div style={{ display: 'flex', alignItems: 'stretch', height: 'calc(100vh - 175px)', minHeight: 560 }}>
          {/* 左:功能轨(素材生成分组 + 「新」角标,对齐阿里) */}
          <div
            data-testid="ws-rail"
            style={{
              width: 76,
              flexShrink: 0,
              borderRight: '1px solid #f0f0f0',
              background: '#fafbfc',
              padding: '10px 0 8px',
              overflowY: 'auto',
            }}
          >
            <div style={{ fontSize: 10.5, color: '#9ca3af', textAlign: 'center', marginBottom: 4, letterSpacing: 1 }}>
              {t('Material generation')}
            </div>
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
                    padding: '8px 2px',
                    cursor: fn.enabled ? 'pointer' : 'not-allowed',
                    opacity: fn.enabled ? 1 : 0.4,
                    color: on ? '#1677ff' : '#6b7280',
                    fontWeight: on ? 600 : 400,
                    position: 'relative',
                  }}
                >
                  <span
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 9,
                      background: on ? '#e6f4ff' : '#fff',
                      border: `1px solid ${on ? '#1677ff' : '#e5e7eb'}`,
                      display: 'grid',
                      placeItems: 'center',
                      fontSize: 17,
                    }}
                  >
                    {fn.icon}
                  </span>
                  <span style={{ fontSize: 10.5, whiteSpace: 'nowrap' }}>{funcLabel(fn)}</span>
                  {fn.isNew ? (
                    <span
                      style={{
                        position: 'absolute',
                        top: 2,
                        right: 5,
                        fontSize: 9,
                        background: '#52c41a',
                        color: '#fff',
                        borderRadius: 6,
                        padding: '0 4px',
                        lineHeight: '14px',
                      }}
                    >
                      {t('New')}
                    </span>
                  ) : null}
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

          {/* 中:窄配置列(对齐阿里 ~320px;内部自身滚动,底部生成栏固定) */}
          <div
            data-testid="ws-config"
            style={{
              width: 320,
              flexShrink: 0,
              borderRight: '1px solid #f0f0f0',
              display: 'flex',
              flexDirection: 'column',
              minHeight: 0,
            }}
          >
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '16px 16px 8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <Typography.Title level={5} style={{ margin: 0 }}>
                  {activeFunc.icon} {funcLabel(activeFunc)}
                </Typography.Title>
                <Tag color={activeFunc.tier === 'advanced' ? 'purple' : 'blue'}>
                  {activeFunc.tier === 'advanced' ? t('Advanced tier') : t('Basic tier')}
                </Tag>
              </div>
              <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 14 }}>
                {funcSub(activeFunc)}
              </Typography.Paragraph>

              {/* 商品图带入(压缩条:「*上传图片 (n/9)」+ 横排缩略;完整网格在「管理图片」弹层) */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <Typography.Text strong style={{ fontSize: 13 }}>
                    🖼️ {t('Upload images')} <span style={{ color: '#ff4d4f' }}>*</span>{' '}
                    <Typography.Text type="secondary" style={{ fontWeight: 400, fontSize: 11 }}>
                      {activeFunc.single ? t('single image · click to switch') : `(${picked.size}/9)`}
                    </Typography.Text>
                  </Typography.Text>
                  <a style={{ marginLeft: 'auto', fontSize: 12 }} onClick={() => setManageOpen(true)}>
                    {t('Manage images')}
                  </a>
                </div>
                <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block', margin: '4px 0 8px' }}>
                  {freeMode
                    ? `📤 ${t('Upload the images you want to edit — results appear on the canvas.')}`
                    : `✅ ${t('Product images auto-loaded — tick to pick, or manage to upload more.')}`}
                </Typography.Text>
                <Spin spinning={loading}>
                  {carryImages.length ? (
                    <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
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
                              width: 52,
                              height: 52,
                              flexShrink: 0,
                              borderRadius: 8,
                              overflow: 'hidden',
                              border: on ? '2px solid #52c41a' : '1px solid #e5e7eb',
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
                            {/* W3 再次编辑:AI 候选回带入区时,迷你缩略位也标 AI 来源 */}
                            {c.ai ? (
                              <span
                                style={{
                                  position: 'absolute',
                                  left: 2,
                                  top: 2,
                                  fontSize: 8,
                                  color: '#fff',
                                  borderRadius: 3,
                                  padding: '0 3px',
                                  lineHeight: '12px',
                                  background: '#722ed1',
                                }}
                              >
                                AI
                              </span>
                            ) : null}
                            <span
                              aria-hidden
                              style={{
                                position: 'absolute',
                                right: 2,
                                top: 2,
                                width: 15,
                                height: 15,
                                borderRadius: 4,
                                border: '1.5px solid #fff',
                                background: on ? '#52c41a' : 'rgba(0,0,0,.28)',
                                color: '#fff',
                                fontSize: 10,
                                lineHeight: '13px',
                                textAlign: 'center',
                              }}
                            >
                              {on ? '✓' : ''}
                            </span>
                          </div>
                        );
                      })}
                      {/* 上传新图(迷你位;更多操作进「管理图片」) */}
                      <label
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: 52,
                          height: 52,
                          flexShrink: 0,
                          border: '1.5px dashed #e5e7eb',
                          borderRadius: 8,
                          color: '#9ca3af',
                          cursor: 'pointer',
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
                        <span style={{ fontSize: 16 }}>{uploading ? '…' : '+'}</span>
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
                  {/* W5-3 保护开关:商品实物文字/品牌词,注入 prompt 强约束 */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, cursor: 'pointer' }}>
                      <Switch size="small" checked={translateProductText} onChange={setTranslateProductText} />
                      {t('Translate text printed on the product')}
                      <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                        {t('off = printed text / labels stay untouched')}
                      </Typography.Text>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, cursor: 'pointer' }}>
                      <Switch size="small" checked={keepBrandWords} onChange={setKeepBrandWords} />
                      {t('Keep brand words untranslated')}
                    </label>
                  </div>
                  <Typography.Text type="secondary" style={{ fontSize: 11.5, display: 'block', marginTop: 8 }}>
                    {t('Source language: auto-detect')} · ℹ️{' '}
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
                  <div
                    style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8, opacity: refImage ? 0.45 : 1 }}
                  >
                    {MODEL_PRESETS.map((m) => (
                      <Tag.CheckableTag
                        key={m.key}
                        checked={!refImage && modelPreset === m.desc}
                        onChange={() => {
                          setModelPreset(m.desc);
                          setModelSpec({}); // 与档位互斥:选预置清档位
                        }}
                      >
                        {m.label}
                      </Tag.CheckableTag>
                    ))}
                  </div>
                  {/* W5-2 档位组合(人种/性别/年龄/背景):点任一档 = 放弃预置,按描述生成 */}
                  <Typography.Text type="secondary" style={{ fontSize: 11.5, display: 'block', marginTop: 10 }}>
                    {t('Or combine persona traits (overrides the preset above)')}
                  </Typography.Text>
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6,
                      marginTop: 6,
                      opacity: refImage ? 0.45 : 1,
                    }}
                  >
                    {(
                      [
                        ['race', t('Race'), MODEL_RACES],
                        ['gender', t('Gender'), MODEL_GENDERS],
                        ['age', t('Age'), MODEL_AGES],
                        ['bg', t('Background'), MODEL_BACKGROUNDS],
                      ] as Array<[keyof ModelSpec, string, string[]]>
                    ).map(([dim, label, options]) => (
                      <div key={dim} style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                        <Typography.Text type="secondary" style={{ fontSize: 11.5, width: 34, flexShrink: 0 }}>
                          {label}
                        </Typography.Text>
                        {options.map((opt) => (
                          <Tag.CheckableTag
                            key={opt}
                            checked={modelSpec[dim] === opt}
                            onChange={(on) => {
                              setModelSpec((prev) => ({ ...prev, [dim]: on ? opt : undefined }));
                              if (on) setModelPreset(''); // 与预置互斥:选档位清预置
                            }}
                          >
                            {opt}
                          </Tag.CheckableTag>
                        ))}
                      </div>
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

              {/* 模版风格选择(W2):templateTabs 功能 = 三 tab(推荐提示词/推荐风格模版/自定义模版);
              其余支持推荐的功能保留单一推荐提示词块 */}
              {activeFunc.templateTabs ? (
                <div style={{ marginBottom: 18 }} data-testid="ws-tpl-tabs">
                  <Typography.Text strong style={{ fontSize: 13 }}>
                    🎨 {t('Template styles')}
                  </Typography.Text>
                  <Tabs
                    size="small"
                    activeKey={tplTab}
                    onChange={(k) => setTplTab(k)}
                    style={{ marginTop: 2 }}
                    // 320px 配置列放三枚中文 tab:默认 gutter(32)会溢出折叠成「···」,压缩间距+字号保证三 tab 全显
                    tabBarGutter={14}
                    tabBarStyle={{ fontSize: 13 }}
                    items={[
                      { key: 'reco', label: t('Recommended prompts'), children: recoBox },
                      { key: 'builtin', label: t('Style templates'), children: builtinPane },
                      { key: 'mine', label: t('My templates'), children: minePane },
                    ]}
                  />
                </div>
              ) : supportsReco(activeKey) ? (
                <div style={{ marginBottom: 18 }}>{recoBox}</div>
              ) : null}

              {/* 擦除(W5-5):常见元素多选,与手填合并成指令 */}
              {activeFunc.key === 'erase' ? (
                <div style={{ marginBottom: 18 }} data-testid="ws-erase-chips">
                  <Typography.Text strong style={{ fontSize: 13 }}>
                    🧽 {t('Elements to erase')}{' '}
                    <Typography.Text type="secondary" style={{ fontWeight: 400, fontSize: 11 }}>
                      {t('multi-select; add specifics below')}
                    </Typography.Text>
                  </Typography.Text>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                    {ERASE_TARGETS.map((tg) => (
                      <Tag.CheckableTag
                        key={tg}
                        checked={eraseTargets.includes(tg)}
                        onChange={(on) =>
                          setEraseTargets((prev) => (on ? [...prev, tg] : prev.filter((x) => x !== tg)))
                        }
                      >
                        {tg}
                      </Tag.CheckableTag>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* 专属表单:P1 只渲染提示词(其余字段 P2+);ref 供「再次编辑」回填后滚动定位 */}
              {activeFunc.fields.some((f) => f.type === 'prompt' && !f.planned) || activeFunc.promptPlaceholder ? (
                <div style={{ marginBottom: 18 }} ref={promptRef}>
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

              {/* 商品换色(W5-1):12 色板多选 + 自定义色;一色一张批量出图 */}
              {activeFunc.key === 'recolor' ? (
                <div style={{ marginBottom: 18 }} data-testid="ws-recolor-colors">
                  <Typography.Text strong style={{ fontSize: 13 }}>
                    🎨 {t('Target colors')}{' '}
                    <Typography.Text type="secondary" style={{ fontWeight: 400, fontSize: 11 }}>
                      {t('multi-select — one image per color; prompt above describes which part')}
                    </Typography.Text>
                  </Typography.Text>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8, alignItems: 'center' }}>
                    {RECOLOR_COLORS.map((color) => (
                      <Tag.CheckableTag
                        key={color}
                        checked={recolorColors.includes(color)}
                        onChange={(on) =>
                          setRecolorColors((prev) => (on ? [...prev, color] : prev.filter((x) => x !== color)))
                        }
                      >
                        {color}
                      </Tag.CheckableTag>
                    ))}
                    <ColorPicker
                      size="small"
                      value={customColor || null}
                      onChangeComplete={(c) => setCustomColor(c.toHexString())}
                      showText={() => (customColor ? customColor : t('Custom'))}
                      allowClear
                      onClear={() => setCustomColor('')}
                    />
                  </div>
                  {recolorColors.length + (customColor ? 1 : 0) > 0 ? (
                    <Typography.Text type="secondary" style={{ fontSize: 11.5, display: 'block', marginTop: 8 }}>
                      💡{' '}
                      {t('{{n}} colors selected — one candidate per color will be generated', {
                        n: recolorColors.length + (customColor ? 1 : 0),
                      })}
                    </Typography.Text>
                  ) : null}
                </div>
              ) : null}

              {/* 高清增强(W5-4):放大倍数档(服务端按源图尺寸×倍数换算 size,输出上限 2048px) */}
              {activeFunc.key === 'hd' ? (
                <div style={{ marginBottom: 18 }} data-testid="ws-hd-scale">
                  <Typography.Text strong style={{ fontSize: 13 }}>
                    🔍 {t('Upscale factor')}
                  </Typography.Text>
                  <div style={{ marginTop: 8 }}>
                    <Segmented
                      value={hdScale}
                      onChange={(v) => setHdScale(v as 2 | 4)}
                      options={[
                        { value: 2, label: '2x' },
                        { value: 4, label: '4x' },
                      ]}
                    />
                  </div>
                  <Typography.Text type="secondary" style={{ fontSize: 11.5, display: 'block', marginTop: 8 }}>
                    ℹ️ {t('Output capped at 2048px')}
                  </Typography.Text>
                </div>
              ) : null}

              {/* 场景图(W5-6):重排构图开关(对应阿里 needLayout) */}
              {activeFunc.key === 'scene_gen' ? (
                <div style={{ marginBottom: 18 }} data-testid="ws-scene-relayout">
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, cursor: 'pointer' }}>
                    <Switch size="small" checked={sceneRelayout} onChange={setSceneRelayout} />
                    <Typography.Text strong style={{ fontSize: 13 }}>
                      {t('Allow re-arranging the product')}
                    </Typography.Text>
                    <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                      {t('off = keep the original placement strictly')}
                    </Typography.Text>
                  </label>
                </div>
              ) : null}

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
            </div>

            {/* 底部生成栏(常驻配置列底部,对齐阿里:张数下拉 / 档位ⓘ / 消耗ⓘ / 开始生成) */}
            <div
              style={{ flexShrink: 0, borderTop: '1px solid #f0f0f0', padding: '10px 16px 12px', background: '#fff' }}
            >
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>
                    {t('Count per image')}
                  </Typography.Text>
                  <Select
                    size="small"
                    style={{ width: '100%' }}
                    value={count}
                    onChange={(v) => setCount(Number(v) || 1)}
                    options={[1, 2, 3, 4].map((n) => ({ value: n, label: t('{{n}} images', { n }) }))}
                  />
                </div>
                <div style={{ flex: 1.5 }}>
                  <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>
                    {t('Model tier')}{' '}
                    <Tooltip title={t('Advanced tier uses a stronger model — better quality, higher cost.')}>
                      <span style={{ cursor: 'help' }}>ⓘ</span>
                    </Tooltip>
                  </Typography.Text>
                  <Segmented
                    size="small"
                    block
                    value={tier}
                    onChange={(v) => setTier(v as 'basic' | 'advanced')}
                    options={[
                      { value: 'basic', label: t('Basic tier') },
                      { value: 'advanced', label: t('Advanced tier') },
                    ]}
                  />
                </div>
              </div>
              {/* 高级:显式指定模型(我们的超集能力,默认收起不干扰主流程) */}
              <a
                style={{ fontSize: 11.5, display: 'inline-block', marginTop: 8 }}
                onClick={() => setAdvOpen((v) => !v)}
              >
                ⚙️ {t('Advanced: choose model')} {advOpen ? '▴' : '▾'}
              </a>
              {advOpen ? (
                <Select
                  size="small"
                  style={{ width: '100%', marginTop: 6 }}
                  value={modelKey}
                  onChange={setModelKey}
                  options={[
                    { value: '', label: t('Auto model') },
                    ...models.map((m) => ({ value: `${m.llmService}:${m.model}`, label: m.label })),
                  ]}
                />
              ) : null}
              <div style={{ display: 'flex', alignItems: 'center', marginTop: 10 }}>
                <span style={{ fontSize: 11, color: '#6b7280' }} data-testid="ws-est-cost">
                  {t('Est. cost')}{' '}
                  <Typography.Text strong style={{ color: '#faad14', fontSize: 13 }}>
                    {est ? est.beans : activeFunc.cost * count} {t('beans')}
                  </Typography.Text>{' '}
                  <Popover
                    title={t('Cost breakdown')}
                    content={
                      est ? (
                        <div style={{ fontSize: 12, lineHeight: '20px' }}>
                          <div>
                            {t(
                              '{{unit}} beans/image × {{count}} per source × {{sources}} source(s) = {{beans}} beans',
                              {
                                unit: est.breakdown.unit,
                                count: est.breakdown.count,
                                sources: est.breakdown.sources,
                                beans: est.beans,
                              },
                            )}
                          </div>
                          <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                            {t('Priced by function × tier; recorded per generation, no balance deduction yet.')}
                          </Typography.Text>
                        </div>
                      ) : (
                        t('Reference price: function base cost × count. Dynamic pricing arrives later.')
                      )
                    }
                  >
                    <span style={{ cursor: 'help' }}>ⓘ</span>
                  </Popover>
                </span>
                <Button
                  type="primary"
                  style={{ marginLeft: 'auto' }}
                  loading={Boolean(busy)}
                  onClick={doGenerate}
                  disabled={!picked.size}
                >
                  ✨ {busy ? `${t('Generating')} ${busy.done}/${busy.total}` : t('Start generating')}
                </Button>
              </div>
              {busy ? (
                <div style={{ marginTop: 8 }}>
                  <Progress
                    percent={busy.total ? Math.round((busy.done / busy.total) * 100) : 0}
                    status="active"
                    format={() => `${busy.done}/${busy.total}`}
                  />
                </div>
              ) : null}
            </div>
          </div>

          {/* 右:大结果画布(空闲=功能介绍 hero;有候选=结果网格 + 大图对比,对齐阿里「结果优先」) */}
          <div
            data-testid="ws-canvas"
            style={{ flex: 1, minWidth: 0, background: '#f7f8fa', overflowY: 'auto', padding: 24 }}
          >
            {data.candidates.length || busy ? (
              <div data-testid="ws-results">
                {busy ? (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      marginBottom: 14,
                      fontSize: 12.5,
                      color: '#6b7280',
                    }}
                  >
                    <Spin size="small" />{' '}
                    {t('Generating one by one — candidates appear here as each finishes (upstream is slow).')}
                  </div>
                ) : null}
                {viewCandidate ? (
                  <div
                    style={{
                      background: '#fff',
                      border: '1px solid #e5e7eb',
                      borderRadius: 12,
                      padding: 16,
                      marginBottom: 18,
                    }}
                  >
                    {/* 对比模式:拉帘(默认,原图/候选同位滑动细查)/ 并排;t2i 候选无源图无从对比,隐藏切换 */}
                    {compareOriginalUrl ? (
                      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
                        <Segmented
                          size="small"
                          value={cmpMode}
                          onChange={(v) => setCmpMode(v as 'slider' | 'side')}
                          options={[
                            { value: 'slider', label: `🪟 ${t('Curtain')}` },
                            { value: 'side', label: `◫ ${t('Side by side')}` },
                          ]}
                        />
                      </div>
                    ) : null}
                    <CompareView
                      originalUrl={compareOriginalUrl}
                      candidateUrl={viewCandidate.url || null}
                      mode={cmpMode}
                      emptyHint={t('Select a source image first')}
                      // 限高:对比图 + 操作条要在画布视口内放得下,不许整屏都是图
                      maxHeight="max(280px, calc(100vh - 500px))"
                      t={t}
                    />
                    {/* 操作一字排开(对齐阿里):下载/再次编辑/重新生成/保存为模版 + 我们的采纳/弃用 */}
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 12, flexWrap: 'wrap' }}>
                      {!freeMode ? (
                        <Button type="primary" onClick={() => setAdoptTarget(viewCandidate)}>
                          ✓ {t('Adopt')}
                        </Button>
                      ) : null}
                      {viewCandidate.url ? (
                        <Button onClick={() => doDownload(viewCandidate)}>⬇ {t('Download')}</Button>
                      ) : null}
                      <Button onClick={() => doEditAgain(viewCandidate)}>✏️ {t('Edit again')}</Button>
                      <Button disabled={!!busy} onClick={() => doRegenerate(viewCandidate)}>
                        🔄 {t('Regenerate')}
                      </Button>
                      {viewCandidate.genParams?.instruction ? (
                        <Button onClick={() => saveCandidateAsTemplate(viewCandidate)}>
                          ⭐ {t('Save as template')}
                        </Button>
                      ) : null}
                      <Button danger onClick={() => doDiscard(viewCandidate)}>
                        {t('Discard')}
                      </Button>
                      <Button onClick={() => setViewCandidateId(null)}>{t('Close preview')}</Button>
                    </div>
                  </div>
                ) : null}
                <Typography.Text type="secondary" style={{ fontSize: 12.5, fontWeight: 600 }}>
                  🎉 {t('Generated candidates')} ({data.candidates.length})
                  {!viewCandidate && data.candidates.length ? (
                    <span style={{ fontWeight: 400 }}> · {t('Click a candidate to compare / adopt')}</span>
                  ) : null}
                </Typography.Text>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
                    gap: 12,
                    marginTop: 10,
                  }}
                >
                  {data.candidates.map((c) => (
                    <div
                      key={c.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setViewCandidateId(c.id === viewCandidateId ? null : c.id)}
                      onKeyDown={(e) => (e.key === 'Enter' ? setViewCandidateId(c.id) : undefined)}
                      style={{
                        borderRadius: 10,
                        overflow: 'hidden',
                        cursor: 'pointer',
                        background: '#fff',
                        border: c.id === viewCandidateId ? '2px solid #1677ff' : '1px solid #e5e7eb',
                      }}
                    >
                      <div style={{ aspectRatio: '1 / 1', background: '#f4f5f7' }}>
                        {c.url ? (
                          <img
                            src={c.url}
                            alt={sceneLabel(c.genParams?.scene)}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        ) : null}
                      </div>
                      <div
                        style={{
                          padding: '5px 8px',
                          fontSize: 11,
                          color: '#6b7280',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {/* 换色批量(W5):结果卡带目标色标签,一眼分辨各 SKU 色 */}
                        {(c.genParams?.parameters as { targetColor?: string } | undefined)?.targetColor ? (
                          <Tag style={{ marginRight: 4, fontSize: 10, lineHeight: '16px', padding: '0 4px' }}>
                            {(c.genParams?.parameters as { targetColor?: string }).targetColor}
                          </Tag>
                        ) : null}
                        {sceneLabel(c.genParams?.scene)}
                      </div>
                    </div>
                  ))}
                </div>
                <Typography.Paragraph type="secondary" style={{ fontSize: 11, marginTop: 12 }}>
                  {freeMode
                    ? t(
                        'Free-mode results are not linked to a product — download to use them; pick a product to adopt.',
                      )
                    : t('Adopting writes the product final image (audit as user); publish prefers the adopted set.')}
                </Typography.Paragraph>
              </div>
            ) : (
              <div
                data-testid="ws-hero"
                style={{
                  minHeight: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textAlign: 'center',
                  padding: '40px 24px',
                }}
              >
                <div style={{ fontSize: 26, fontWeight: 700, color: '#1677ff' }}>{funcLabel(activeFunc)}</div>
                <div style={{ fontSize: 14, color: '#6b7280', marginTop: 8 }}>{funcHeroSub(activeFunc)}</div>
                {currentSrc?.url ? (
                  <img
                    src={currentSrc.url}
                    alt={funcLabel(activeFunc)}
                    style={{
                      maxWidth: 420,
                      maxHeight: 360,
                      objectFit: 'contain',
                      marginTop: 24,
                      borderRadius: 12,
                      background: '#fff',
                      border: '1px solid #e5e7eb',
                      padding: 8,
                    }}
                  />
                ) : null}
                <div style={{ fontSize: 12.5, color: '#9ca3af', marginTop: 20, maxWidth: 460 }}>
                  {funcHeroValue(activeFunc)}
                </div>
                {freeMode && !currentSrc ? (
                  <Typography.Text type="secondary" style={{ fontSize: 12.5, marginTop: 16 }}>
                    📤 {t('Upload images on the left to get started.')}
                  </Typography.Text>
                ) : null}
              </div>
            )}
          </div>
        </div>
      ) : (
        <VideoPane app={app} productId={productId} sources={carryImages} loadingSources={loading} t={t} />
      )}

      {/* 管理图片:完整商品图网格(勾选/上传);配置列只放压缩条 */}
      <Modal
        title={`${t('Manage images')} (${picked.size}/9)`}
        open={manageOpen}
        onCancel={() => setManageOpen(false)}
        onOk={() => setManageOpen(false)}
        cancelButtonProps={{ style: { display: 'none' } }}
        okText={t('Done')}
        width={760}
      >
        <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 10 }}>
          ✅ {t('Product images auto-loaded — no re-upload needed. Pick images to process, or upload extra.')}
        </Typography.Text>
        <Spin spinning={loading}>
          {carryImages.length ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8 }}>
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
                        background: c.ai || c.uploaded ? '#722ed1' : c.role === 'main' ? '#faad14' : '#40a9ff',
                      }}
                    >
                      {c.ai ? 'AI' : c.uploaded ? t('Uploaded') : c.role === 'main' ? t('Main') : t('Detail')}
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
      </Modal>

      {/* W2「更多 >」:全量浏览内置模版(左类目侧栏 + 右大网格);点卡选中/填充后关闭回表单 */}
      <Modal
        title={t('All style templates')}
        open={tplMoreOpen}
        onCancel={() => setTplMoreOpen(false)}
        footer={null}
        width={760}
      >
        <div style={{ display: 'flex', gap: 14, minHeight: 380 }}>
          <div style={{ width: 130, flexShrink: 0, borderRight: '1px solid #f0f0f0', paddingRight: 8 }}>
            {(tplData?.categories || []).map((c) => (
              <div
                key={c.key}
                role="button"
                tabIndex={0}
                onClick={() => setTplCat(c.key)}
                onKeyDown={(e) => (e.key === 'Enter' ? setTplCat(c.key) : undefined)}
                style={{
                  padding: '7px 10px',
                  borderRadius: 8,
                  cursor: 'pointer',
                  fontSize: 12.5,
                  marginBottom: 2,
                  background: tplCat === c.key ? '#f4f0ff' : 'transparent',
                  color: tplCat === c.key ? '#5b3ddc' : undefined,
                  fontWeight: tplCat === c.key ? 600 : 400,
                }}
              >
                {t(TPL_CAT_LABELS[c.key] || c.key)} ({c.count}){c.key === tplData?.recommended ? ' ★' : ''}
              </div>
            ))}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            {catTpls.length ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                {catTpls.map((tpl) => (
                  <TplCard
                    key={tpl.id}
                    tpl={tpl}
                    selected={tplSelected === tpl.id}
                    onClick={() => {
                      toggleTpl(tpl);
                      setTplMoreOpen(false);
                    }}
                    t={t}
                  />
                ))}
              </div>
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('No templates in this category yet')} />
            )}
          </div>
        </div>
      </Modal>

      {/* W2 新建自定义模版:标题/类目/提示词(提示词预填当前输入框内容) */}
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
          {/* W3 保存为模版:结果图作缩略图(图文卡);手动新建无图则文字卡 */}
          {newTpl.thumbUrl ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <img
                src={newTpl.thumbUrl}
                alt={t('Template thumbnail')}
                style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8, border: '1px solid #e5e7eb' }}
              />
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {t('This result image will be the template thumbnail.')}
              </Typography.Text>
            </div>
          ) : null}
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
              {t('Category')}
            </Typography.Text>
            <Select
              style={{ width: '100%', marginTop: 6 }}
              value={newTpl.category}
              onChange={(v) => setNewTpl((prev) => ({ ...prev, category: v }))}
              options={Object.entries(TPL_CAT_LABELS).map(([key, label]) => ({ value: key, label: t(label) }))}
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

      {/* W4 创作历史:跨会话回看全部生成记录(候选/已采纳/已弃用/失败);操作复用工坊回调 */}
      <WorkshopHistory
        app={app}
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        productId={productId}
        t={t}
        funcLabel={(key) => {
          const fn = getWorkshopFunction(key);
          return fn ? funcLabel(fn) : key;
        }}
        onEditAgain={(it) => {
          setHistoryOpen(false);
          doEditAgain(it);
        }}
        onRetry={(it) => {
          setHistoryOpen(false);
          doRegenerate(it);
        }}
        onDownload={(it) => doDownload(it)}
        onDiscard={async (it) => {
          await doDiscard(it);
        }}
      />

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
