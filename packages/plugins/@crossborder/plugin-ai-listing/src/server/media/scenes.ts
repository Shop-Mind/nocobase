/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// 图片编辑场景库(对标阿里创意工坊菜单,见 docs/plans/2026-07-06-image-edit-adopt-plan.md 1.3 节)。
// 每个场景 = 一条提示词模板 + 路由方式:route='instruct' 走通用指令改图(qwen-image-edit 系优先),
// route='function' 走 wanx image2image 专项通道(super_resolution/expand 等,由 editImage 按路由选型)。
// 场景对 UI(Phase 2 候选区)、会话工具(aiListingEditImage)、抽屉快捷按钮(Phase 4)三方复用。
// env AI_LISTING_MEDIA_SCENES 可用 JSON 数组按 key 增补/覆盖场景,零发版扩展。

export interface MediaScene {
  key: string;
  // 英文标题,同时作为 i18n 键(locale JSON 里翻译)
  title: string;
  // 提示词模板;{instruction} 占位符注入用户指令,支持任意 {param} 占位(buildScenePrompt params)
  promptTemplate: string;
  route: 'instruct' | 'function';
  // route='function' 时 wanx image2image 的 function 取值
  editFunction?: string;
  // 默认请求参数(如 upscale_factor、四向 scale),可被调用方 parameters 覆盖
  defaultParameters?: Record<string, unknown>;
  // 'upscale':editImage 按源图尺寸 × upscale_factor 计算 parameters.size(qwen-image-edit 系,
  // 两边夹在 512~2048)——实测 wanx super_resolution 恒输出 ~1MP 不放大,真超分只能走 size 指定
  sizeStrategy?: 'upscale';
  // 候选对比 UI 形态:结构性改动并排,像素级增强用拉帘滑块
  compareMode: 'side_by_side' | 'slider';
  defaultN: number;
  // 是否必须提供用户指令(模板 {instruction} 不能为空)
  instructionRequired: boolean;
  // 给 LLM 工具与前端的场景说明(什么时候选它、instruction 该填什么)
  hint: string;
}

const DEFAULT_SCENES: MediaScene[] = [
  {
    key: 'white_bg',
    title: 'White background image',
    promptTemplate:
      '将图片背景替换为纯白色电商白底,商品主体完整居中,边缘干净利落,保留商品原有光影与质感,不改变商品本身。{instruction}',
    route: 'instruct',
    compareMode: 'side_by_side',
    defaultN: 2,
    instructionRequired: false,
    hint: '生成电商白底图;instruction 可选(补充构图要求)',
  },
  {
    key: 'scene_gen',
    title: 'Scene image',
    promptTemplate:
      '将商品自然融入以下场景:{instruction}。保持商品主体、材质、比例与朝向不变,光影与场景融合自然,画面真实可信。',
    route: 'instruct',
    compareMode: 'side_by_side',
    defaultN: 2,
    instructionRequired: true,
    hint: '把商品放进指定使用场景;instruction 填场景描述(如"北欧风客厅的木桌上")',
  },
  {
    key: 'erase',
    title: 'Erase elements',
    promptTemplate:
      '精准地只去除图片中的{instruction},被去除区域用其紧邻的周边背景无缝、自然地填补;其余商品、构图、光影、文字排版与背景全部保持完全不变,不改动目标以外的任何像素。',
    route: 'instruct',
    compareMode: 'side_by_side',
    defaultN: 2,
    instructionRequired: true,
    hint: '擦除 logo/水印/杂物;instruction 填要去除的对象(如"品牌 logo 和文字水印")',
  },
  {
    key: 'recolor',
    title: 'Recolor product',
    // 区域编辑靠精准提示词:instruction 描述「哪个部位换成什么颜色」,模板强约束其余像素完全不变
    promptTemplate:
      '精准地只把图中{instruction};只改变该指定部位的颜色,保留其原有材质纹理与光影;商品的其余部位、构图与背景全部保持完全不变,不改动目标区域以外的任何像素。',
    route: 'instruct',
    compareMode: 'side_by_side',
    defaultN: 2,
    instructionRequired: true,
    hint: '商品换色;instruction 填"哪个部位换成什么颜色"(如"红色的酒瓶套换成藏青色")',
  },
  {
    key: 'detail',
    title: 'Detail shot',
    promptTemplate:
      '生成图中{instruction}的高清细节特写:裁切并放大该局部,突出做工、材质与纹理层次,主体清晰锐利、背景自然虚化,不改变商品本身的样式与颜色。',
    route: 'instruct',
    compareMode: 'side_by_side',
    defaultN: 2,
    instructionRequired: true,
    hint: '局部细节特写;instruction 填要突出的部位(如"雪人娃娃的针织纹理与纽扣")',
  },
  {
    key: 'selling_point',
    title: 'Selling point poster',
    promptTemplate:
      '在图片上添加醒目的电商营销卖点文字:{instruction}。排版美观、层次分明、字体清晰可读,不遮挡商品主体,风格与画面协调。',
    route: 'instruct',
    compareMode: 'side_by_side',
    defaultN: 2,
    instructionRequired: true,
    hint: '生成营销卖点图;instruction 填卖点文案(如"大容量 · 环保帆布 · 定制印花")',
  },
  {
    key: 'hd',
    title: 'HD enhance',
    promptTemplate: '图像高清放大:保持内容、构图与色彩完全不变,仅提升分辨率与细节清晰度。{instruction}',
    route: 'instruct',
    defaultParameters: { upscale_factor: 2 },
    sizeStrategy: 'upscale',
    compareMode: 'slider',
    defaultN: 1,
    instructionRequired: false,
    hint: '高清放大(默认 2 倍,输出上限 2048px);instruction 可选',
  },
  {
    key: 'expand',
    title: 'Expand image',
    promptTemplate: '按比例向四周扩展画面,新增区域与原图内容自然衔接,风格一致。{instruction}',
    route: 'function',
    editFunction: 'expand',
    defaultParameters: { top_scale: 1.5, bottom_scale: 1.5, left_scale: 1.5, right_scale: 1.5 },
    compareMode: 'slider',
    defaultN: 1,
    instructionRequired: false,
    hint: '扩图/改尺寸(默认四周各扩 1.5 倍);instruction 可选(描述新增区域内容)',
  },
  {
    key: 'material',
    title: 'Change material',
    promptTemplate: '将商品材质更换为{instruction},保持商品形状、构图、背景不变,新材质质感真实自然。',
    route: 'instruct',
    compareMode: 'side_by_side',
    defaultN: 2,
    instructionRequired: true,
    hint: '商品换材质;instruction 填目标材质(如"磨砂金属");可上传材质参考图作第二张图',
  },
  {
    key: 'logo',
    title: 'Logo customization',
    // 多图合成:image[0]=商品图,image[1]=Logo 图;instruction 描述位置与工艺(前端由「位置+工艺」组合而来)
    promptTemplate:
      '把第二张图中的品牌 Logo 自然、清晰地印制到商品上:{instruction}。Logo 要贴合商品的材质、光影与透视,边缘干净无白边;商品本身的款式、颜色、其余图案与背景保持完全不变。',
    route: 'instruct',
    compareMode: 'side_by_side',
    defaultN: 2,
    instructionRequired: false,
    hint: 'Logo定制;需上传 Logo 图(第二张图)+ 选位置/工艺',
  },
  {
    key: 'translate',
    title: 'Image translation',
    // 图片翻译:{target_language} 由前端语种选择注入,{instruction} 可选(补充要求)。强约束「只换文字、版式全保留」。
    // 生产可切 qwen-mt-image 真实翻译端点(需公网图 URL,见 public-url.ts);测试期用 gpt-image-2 编辑近似。
    promptTemplate:
      '把图片中出现的所有文字翻译成{target_language},只把文字内容替换为对应的准确译文,严格保持原有的排版、位置、字号、字体风格、颜色以及所有非文字的画面元素完全不变;译文自然、专业、无错别字。{instruction}',
    route: 'instruct',
    compareMode: 'side_by_side',
    defaultN: 1,
    instructionRequired: false,
    hint: '图片翻译(详情图文字翻成目标语言,版式不变);target_language 由语种选择注入,instruction 可选',
  },
  {
    key: 'model_shot',
    title: 'Model shot',
    // 模特图:{instruction} = 模特描述(前端预置模特库/自传模特图);可上传模特参考图作第二张图(image[1])。
    promptTemplate:
      '为这件商品生成专业、真实的电商模特上身展示图:{instruction},让 TA 自然地穿戴/使用该商品;商品本身的款式、颜色、图案、材质与所有细节保持完全不变,人物姿态自然、光影真实、构图专业、背景简洁不喧宾夺主。',
    route: 'instruct',
    compareMode: 'side_by_side',
    defaultN: 2,
    instructionRequired: false,
    hint: '模特图(为服饰/配饰生成 AI 模特上身图);instruction 填模特描述(如"一位亚洲年轻女性模特"),可上传模特参考图作第二张图',
  },
  {
    key: 'process',
    title: 'Production infographic',
    // 生产流程图:{style} 由前端风格选择注入,{instruction} = 生产/工艺步骤文本(一行一步)。图文混排、强文字渲染。
    // 生产可切 qwen-image/wan2.6-image(强中英文字渲染);测试期 gpt-image-2 兜底。
    promptTemplate:
      '把以下生产/工艺步骤制作成一张图文并茂的信息图,整体风格为{style}:{instruction}。每个步骤配示意图标与简明文字说明,按顺序编号,排版清晰、层次分明,中英文字清晰可读、无错别字,整体专业美观,适合电商详情页展示。',
    route: 'instruct',
    compareMode: 'side_by_side',
    defaultN: 1,
    instructionRequired: true,
    hint: '生产流程图(生产步骤→图文信息图);instruction 填步骤文本(一行一步),style 由风格选择注入',
  },
  {
    key: 'custom',
    title: 'Free-form edit',
    promptTemplate: '{instruction}',
    route: 'instruct',
    compareMode: 'side_by_side',
    defaultN: 2,
    instructionRequired: true,
    hint: '自由改图;instruction 填完整的修改指令',
  },
];

// env 增补/覆盖:JSON 数组,按 key 合并(部分字段即可,未给的沿用默认);解析失败静默回退默认场景
export function listMediaScenes(): MediaScene[] {
  const raw = (process.env.AI_LISTING_MEDIA_SCENES || '').trim();
  if (!raw) return DEFAULT_SCENES;
  try {
    const overrides = JSON.parse(raw) as Array<Partial<MediaScene> & { key: string }>;
    if (!Array.isArray(overrides)) return DEFAULT_SCENES;
    const merged = new Map<string, MediaScene>(DEFAULT_SCENES.map((s) => [s.key, s]));
    for (const item of overrides) {
      if (!item?.key) continue;
      const base = merged.get(item.key);
      merged.set(item.key, {
        route: 'instruct',
        compareMode: 'side_by_side',
        defaultN: 2,
        instructionRequired: true,
        title: item.key,
        promptTemplate: '{instruction}',
        hint: '',
        ...(base || {}),
        ...item,
      });
    }
    return Array.from(merged.values());
  } catch {
    return DEFAULT_SCENES;
  }
}

export function getMediaScene(key: string): MediaScene | undefined {
  return listMediaScenes().find((s) => s.key === key);
}

// 模板占位符注入:{instruction} 等替换为对应参数,未提供的占位符清为空串;结果去除多余空白
export function buildScenePrompt(scene: MediaScene, params: Record<string, string | undefined>): string {
  return scene.promptTemplate
    .replace(/\{(\w+)\}/g, (_, name: string) => (params[name] || '').trim())
    .replace(/\s{2,}/g, ' ')
    .trim();
}
