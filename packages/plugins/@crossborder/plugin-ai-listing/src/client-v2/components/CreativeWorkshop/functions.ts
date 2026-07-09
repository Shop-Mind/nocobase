/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// 创意工坊「功能栏 + 专属表单」的前端元数据(对标阿里国际站创意工坊 14 功能)。
// 进度:P1 上线 9 个已支持功能(key 与服务端 scenes.ts 一一对应),P4 加 detail、P5 加 logo、
// P6 加 translate(lang)/model_shot(modelGrid)、P7 加 process(styleSeg)+ selling_point 卖点多选,14 功能全部启用。
// W1(对齐阿里体验):数组顺序 = 阿里功能轨顺序(扩图/改尺寸为我们的超集殿后);isNew 渲染「新」角标;
// heroSub/heroValue 供画布空闲态 hero;defaultCount 为该功能的默认张数(网关单张 2-3 分钟,阿里默认 3 的场景图配 2)。
// 字段声明(fields)驱动表单渲染:prompt/ratio/secondImage/craft/lang/modelGrid/styleSeg/sellingPoints 已接线,
// 其余字段类型(mask/color/scaleSeg)为后续阶段的占位契约。

export type WorkshopFieldType =
  | 'prompt'
  | 'ratio'
  | 'mask'
  | 'secondImage'
  | 'lang'
  | 'color'
  | 'craft'
  | 'modelGrid'
  | 'sellingPoints'
  | 'styleSeg'
  | 'scaleSeg';

export interface WorkshopField {
  type: WorkshopFieldType;
  // 占位提示(中文兜底文案;i18n 由 FunctionForm 用 label key 覆盖)
  placeholder?: string;
  required?: boolean;
  // P2+ 才接线的字段先标 planned,P1 不渲染
  planned?: boolean;
}

export interface WorkshopFunction {
  // 已启用功能:与服务端场景 key 完全一致(generate 传 scene=key);未启用功能自定义 key
  key: string;
  icon: string;
  // 中文兜底 label(i18n 键 = `workshop.func.<key>`)
  label: string;
  // 一句话说明(i18n 键 = `workshop.func.<key>.sub`)
  sub: string;
  // 画布空闲态 hero 副标题/价值句(i18n 键 = `.heroSub` / `.heroValue`)
  heroSub: string;
  heroValue: string;
  enabled: boolean;
  // 「新」角标(对齐阿里功能轨)
  isNew?: boolean;
  // 单图功能=只处理一张(带入区单选切换);多图功能=可勾选多张逐张出候选
  single: boolean;
  // 是否必须填提示词(与服务端 scene.instructionRequired 对齐)
  instructionRequired: boolean;
  // 提示词框占位
  promptPlaceholder?: string;
  // 提示词框预填(如去 logo 水印),用户可改
  promptDefault?: string;
  // 模型档语义:'basic'≈标准/flash,'advanced'≈pro/plus/max(P2 映射具体模型)
  tier: 'basic' | 'advanced';
  // 参考消耗 i豆(展示用;W6 起随档位/张数动态化)
  cost: number;
  // 每原图默认张数(1-4;缺省 1)
  defaultCount?: number;
  // W2 模版风格选择三 tab(推荐提示词/推荐风格模版/自定义模版);scene_gen 先开,selling_point/model_shot 第二批
  templateTabs?: boolean;
  // 专属表单字段声明(P1 仅渲染非 planned 的 prompt)
  fields: WorkshopField[];
  // 未启用功能的落地阶段标注(灰态 tooltip)
  comingSoon?: string;
}

export const WORKSHOP_FUNCTIONS: WorkshopFunction[] = [
  {
    key: 'white_bg',
    icon: '⬜',
    label: '白底图',
    sub: '一键抠图换纯白电商主图,主体不变、无 logo 无水印',
    heroSub: '上传商品图,一键生成纯白背景主图',
    heroValue: '主体不变、边缘干净,直接可用作平台合规主图',
    enabled: true,
    single: false,
    instructionRequired: false,
    tier: 'basic',
    cost: 7,
    fields: [],
  },
  {
    key: 'scene_gen',
    icon: '🏞️',
    label: '场景图',
    sub: '把商品放进理想使用场景(桌面/户外/生活方式)',
    heroSub: '上传商品图,即可快速更换场景',
    heroValue: '一键生成商品场景,大幅降低真实拍摄成本,轻松打造专业级产品展示效果',
    enabled: true,
    single: true,
    instructionRequired: true,
    promptPlaceholder: '描述你想要的场景,如:北欧风木桌 + 晨光 + 咖啡杯',
    tier: 'advanced',
    cost: 51,
    defaultCount: 2,
    templateTabs: true,
    fields: [
      { type: 'ratio', planned: true },
      { type: 'prompt', required: true },
    ],
  },
  {
    key: 'erase',
    icon: '🧽',
    label: '图片擦除',
    sub: '擦掉 logo / 水印 / 多余元素',
    heroSub: '智能擦除图上的多余元素',
    heroValue: '水印、文字、杂物一键去除,背景自动补全无痕迹',
    enabled: true,
    single: false,
    instructionRequired: true,
    promptPlaceholder: '填要去除的对象,如:品牌 logo 和所有文字水印',
    promptDefault: '品牌 logo 和所有文字水印',
    tier: 'basic',
    cost: 7,
    fields: [
      { type: 'mask', planned: true },
      { type: 'prompt', required: true },
    ],
  },
  {
    key: 'recolor',
    icon: '🎨',
    label: '商品换色',
    sub: '精准换某个部位的颜色,其余完全保留',
    heroSub: '一张图快速产出多色 SKU 展示',
    heroValue: '精准只改目标部位颜色,其余像素完全保留',
    enabled: true,
    single: true,
    instructionRequired: true,
    promptPlaceholder: '填「哪个部位换成什么颜色」,如:红色的酒瓶套 换成 藏青色',
    tier: 'advanced',
    cost: 17,
    fields: [
      { type: 'mask', planned: true },
      { type: 'color', planned: true },
      { type: 'prompt', required: true },
    ],
  },
  {
    key: 'logo',
    icon: '🏷️',
    label: 'Logo定制',
    sub: '把品牌 Logo 以真实工艺贴合到商品上',
    heroSub: '把你的 Logo 印上商品',
    heroValue: '丝网印 / 烫金 / 刺绣等 10 种工艺,轻定制效果图即刻呈现',
    enabled: true,
    single: true,
    instructionRequired: false,
    tier: 'advanced',
    cost: 17,
    fields: [{ type: 'secondImage' }, { type: 'craft' }],
  },
  {
    key: 'model_shot',
    icon: '👤',
    label: '模特图',
    sub: '为服饰/配饰生成 AI 模特上身图',
    heroSub: 'AI 模特实拍级上身效果',
    heroValue: '免拍摄免模特费,多风格模特随选,商品保持完全不变',
    enabled: true,
    single: true,
    instructionRequired: false,
    promptDefault: '',
    tier: 'advanced',
    cost: 17,
    fields: [{ type: 'modelGrid' }, { type: 'secondImage' }],
  },
  {
    key: 'hd',
    icon: '🔍',
    label: '高清增强',
    sub: '无损放大分辨率、增强清晰度(不改构图)',
    heroSub: '低清小图一键变高清',
    heroValue: '放大分辨率同时增强纹理细节,构图与内容不变',
    enabled: true,
    single: false,
    instructionRequired: false,
    tier: 'basic',
    cost: 3,
    fields: [{ type: 'scaleSeg', planned: true }],
  },
  {
    key: 'detail',
    icon: '🔬',
    label: '细节图',
    sub: '把某个局部裁切放大成高清细节特写',
    heroSub: '局部放大生成细节特写',
    heroValue: '材质与工艺看得清,详情页信任感直接拉满',
    enabled: true,
    isNew: true,
    single: true,
    instructionRequired: true,
    promptPlaceholder: '填要突出的局部,如:雪人娃娃的针织纹理与纽扣',
    tier: 'advanced',
    cost: 10,
    fields: [{ type: 'prompt', required: true }],
  },
  {
    key: 'custom',
    icon: '💬',
    label: '指令生图',
    sub: '最自由:选图 + 一句话指令让 AI 按你说的改',
    heroSub: '一句话指令自由改图',
    heroValue: '最灵活的兜底能力,说什么改什么',
    enabled: true,
    single: false,
    instructionRequired: true,
    promptPlaceholder: '例:把背景换成海边黄昏,商品加一点暖色反光',
    tier: 'advanced',
    cost: 10,
    fields: [
      { type: 'ratio', planned: true },
      { type: 'prompt', required: true },
    ],
  },
  {
    key: 'translate',
    icon: '🌐',
    label: '图片翻译',
    sub: '把详情图文字翻成目标语言,版式不变',
    heroSub: '图内文字一键翻译',
    heroValue: '版式排版原样保留,详情图快速多语言化',
    enabled: true,
    isNew: true,
    single: false,
    instructionRequired: false,
    promptPlaceholder: '可选:补充翻译要求,如 保留品牌名不翻译 / 语气更正式',
    tier: 'basic',
    cost: 3,
    fields: [{ type: 'lang' }, { type: 'prompt' }],
  },
  {
    key: 'material',
    icon: '🧵',
    label: '换材质',
    sub: '换商品材质表现(木纹/金属/皮革/磨砂)',
    heroSub: '一键更换商品材质质感',
    heroValue: '木纹 / 金属 / 皮革随心切换,快速验证设计方向',
    enabled: true,
    isNew: true,
    single: true,
    instructionRequired: true,
    promptPlaceholder: '填目标材质,如:拉丝铝金属质感',
    tier: 'advanced',
    cost: 17,
    fields: [{ type: 'secondImage' }, { type: 'mask', planned: true }, { type: 'prompt', required: true }],
  },
  {
    key: 'process',
    icon: '🏭',
    label: '生产流程图',
    sub: '把生产步骤生成图文并茂的信息图',
    heroSub: '生产步骤变专业信息图',
    heroValue: '图文并茂展示工厂实力,B2B 建立信任的利器',
    enabled: true,
    isNew: true,
    single: true,
    instructionRequired: true,
    promptPlaceholder: '一行一个步骤,如:\n1. 精选原料裁剪\n2. 高温压制成型\n3. 手工缝合封边\n4. 质检包装出厂',
    tier: 'advanced',
    cost: 17,
    fields: [{ type: 'styleSeg' }, { type: 'ratio' }, { type: 'prompt', required: true }],
  },
  {
    key: 'selling_point',
    icon: '⭐',
    label: '营销卖点图',
    sub: '在图上叠加醒目的营销卖点文案',
    heroSub: 'AI 提炼卖点,生成营销主图',
    heroValue: '醒目文案排版直出,打造点击率更高的首图',
    enabled: true,
    isNew: true,
    single: true,
    instructionRequired: true,
    promptPlaceholder: '勾选上方 AI 卖点,或直接填卖点文案,如:大容量 · 环保帆布 · 定制印花',
    tier: 'advanced',
    cost: 17,
    fields: [{ type: 'sellingPoints' }, { type: 'ratio', planned: true }, { type: 'prompt', required: true }],
  },
  {
    key: 'expand',
    icon: '📐',
    label: '扩图/改尺寸',
    sub: '向四周外补画布到目标比例(主体不裁切)',
    heroSub: '外扩画布到目标比例',
    heroValue: 'AI 补全新增区域,主体不裁切即适配平台规格',
    enabled: true,
    single: true,
    instructionRequired: false,
    promptPlaceholder: '可选:描述新增区域内容',
    tier: 'basic',
    cost: 5,
    fields: [{ type: 'ratio', planned: true }, { type: 'prompt' }],
  },
];

export function getWorkshopFunction(key: string): WorkshopFunction | undefined {
  return WORKSHOP_FUNCTIONS.find((f) => f.key === key);
}
