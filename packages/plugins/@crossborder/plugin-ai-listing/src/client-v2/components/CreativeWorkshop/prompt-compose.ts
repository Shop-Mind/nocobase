/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// 工坊表单 → 生成指令的组合纯函数(W5 从 doGenerate 提炼,便于单测):各功能的档位/开关/勾选如何注入
// instruction。服务端场景模板(scenes.ts)负责「功能语义 + 硬约束」,本层负责把用户在表单里点的东西变成
// 模板 {instruction} 槽里的自然语言。中文文案直接内联(送给模型的 prompt,非 UI 文案,不走 i18n)。

// —— 商品换色(W5-1):预置 12 色板;value 直接注入 prompt ——
export const RECOLOR_COLORS = [
  '正红色',
  '藏青色',
  '军绿色',
  '米白色',
  '纯黑色',
  '浅灰色',
  '驼色',
  '粉色',
  '天蓝色',
  '姜黄色',
  '酒红色',
  '紫色',
];

// 多色批量:每个目标色一条独立指令(逐张生成);region = 用户填的「要换色的部位」描述
export function recolorInstructions(region: string, colors: string[]): string[] {
  const r = region.trim();
  return colors.map((color) => `${r}换成${color}`);
}

// —— 模特图档位(W5-2):人种/性别/年龄/背景;与预置模特二选一 ——
export const MODEL_RACES = ['欧美白人', '非裔黑人', '亚洲', '拉美裔'];
export const MODEL_GENDERS = ['女性', '男性'];
export const MODEL_AGES = ['青年', '中年', '老年'];
// 背景档:'' = 保留原背景(注入「保持原图背景」)
export const MODEL_BACKGROUNDS = ['简约影棚', '温馨室内', '欧洲街景', '阳光海滩'];

export interface ModelSpec {
  race?: string;
  gender?: string;
  age?: string;
  bg?: string;
}

export function hasModelSpec(spec?: ModelSpec): boolean {
  return Boolean(spec && (spec.race || spec.gender || spec.age || spec.bg));
}

// 档位 → 模特描述:「一位亚洲青年女性模特,气质自然」+ 背景句
export function describeModelSpec(spec: ModelSpec): string {
  const person = `一位${spec.race || ''}${spec.age || ''}${spec.gender || ''}模特,气质自然`;
  const bg = spec.bg ? `,拍摄背景为${spec.bg}` : '';
  return `${person}${bg}`;
}

// —— 擦除元素(W5-5):常见元素 chips;value 直接注入 ——
export const ERASE_TARGETS = ['水印', '文字', '品牌 Logo', '人物', '背景杂物', '边框装饰'];

export interface ComposeInput {
  funcKey: string;
  // 用户手填提示词(未 trim 也可)
  instruction: string;
  // Logo定制/换材质/模特图的第二张参考图是否已上传
  hasRefImage?: boolean;
  // Logo定制:工艺 + 位置
  craft?: string;
  logoPos?: string;
  // 模特图:预置模特描述('' = 未选预置);档位与预置互斥,预置优先
  modelPreset?: string;
  modelSpec?: ModelSpec;
  // 营销卖点图:勾选的卖点
  pickedPoints?: string[];
  // 擦除:勾选的元素
  eraseTargets?: string[];
  // 图片翻译:翻译商品实物上的文字(默认否)/品牌词不翻译(默认是)
  translateProductText?: boolean;
  keepBrandWords?: boolean;
  // 场景图:允许重新摆放商品(默认否=严格保持原位)
  sceneRelayout?: boolean;
}

// 单条指令组合(换色多色批量走 recolorInstructions,不经此函数)
export function composeInstruction(i: ComposeInput): string {
  const instr = (i.instruction || '').trim();
  switch (i.funcKey) {
    case 'logo':
      return `印在商品的${i.logoPos || '正面中间'}${i.craft ? `,采用${i.craft}工艺` : ''}${instr ? `;${instr}` : ''}`;
    case 'material':
      if (i.hasRefImage) return instr ? `${instr}(材质参考第二张图)` : '把商品材质换成第二张图所示的材质质感';
      return instr;
    case 'model_shot': {
      // 参考图 > 预置模特 > 档位组合 > 通用兜底;用户补充指令追加其后
      const base = i.hasRefImage
        ? '第二张图中的模特'
        : i.modelPreset || (hasModelSpec(i.modelSpec) ? describeModelSpec(i.modelSpec!) : '一位气质自然的模特');
      return instr ? `${base};${instr}` : base;
    }
    case 'selling_point': {
      const joined = (i.pickedPoints || []).join(' · ');
      return joined ? (instr ? `${joined} · ${instr}` : joined) : instr;
    }
    case 'erase': {
      // chips + 手填合并去重;为空回落手填(必填校验在调用方)
      const parts = [...(i.eraseTargets || []), instr].filter(Boolean);
      return [...new Set(parts)].join('、');
    }
    case 'translate': {
      const constraints = [
        i.keepBrandWords !== false ? '品牌名与商标词保留原文,不要翻译' : '',
        i.translateProductText
          ? '商品实物上印制的文字(印花/刻字/标签)也一并翻译'
          : '商品实物上印制的文字(印花/刻字/标签品名)保持原样,不要翻译',
      ].filter(Boolean);
      return [instr, ...constraints].filter(Boolean).join(';');
    }
    case 'scene_gen': {
      const layout = i.sceneRelayout
        ? '可适当重新摆放商品位置与调整拍摄视角,使商品更自然地融入场景'
        : '严格保持商品原有的位置、比例与朝向';
      return instr ? `${instr};${layout}` : instr;
    }
    default:
      return instr;
  }
}
