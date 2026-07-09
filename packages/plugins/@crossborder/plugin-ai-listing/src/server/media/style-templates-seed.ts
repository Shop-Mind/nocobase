/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// 创意工坊内置风格模版种子(W2):7 类目 ×37 条,对齐我们商品盘(包袋箱包/家居收纳/节日礼品/食品饮料/
// 服饰配件/工业工具/通用)。prompt 参照阿里创意工坊模版文案五要素:材质台面 / 背景氛围 / 光线 / 构图 / 点缀物。
// 播种按 title+category 幂等 upsert:只补缺行,绝不覆盖已有行(运营可能在后台改过文案)。

export interface StyleTemplateSeed {
  title: string;
  category: string;
  scene: string;
  prompt: string;
  sort: number;
}

const T = (category: string, sort: number, title: string, prompt: string): StyleTemplateSeed => ({
  title,
  category,
  scene: 'scene_gen',
  prompt,
  sort,
});

export const STYLE_TEMPLATE_SEEDS: StyleTemplateSeed[] = [
  // —— 包袋箱包 bags ——
  T(
    'bags',
    1,
    '街拍通勤',
    '城市街头人行道旁的浅灰石质台面,背景是虚化的玻璃幕墙写字楼,清晨柔和自然光,45 度俯拍构图,旁边放一杯外带咖啡和一副墨镜,现代通勤氛围',
  ),
  T(
    'bags',
    2,
    '复古皮革工坊',
    '深棕色做旧实木工作台,背景是皮革工坊的工具墙,暖黄色钨丝灯光,平视特写构图,点缀几卷皮革边角料与黄铜扣件,复古手工质感',
  ),
  T(
    'bags',
    3,
    '极简云石展台',
    '白色云石圆形展台,浅灰渐变无缝背景,顶部柔光箱均匀打光,居中正面构图,台面仅点缀一枝干花,高级极简氛围',
  ),
  T(
    'bags',
    4,
    '度假沙滩',
    '细白沙滩上的原色草编垫,背景是虚化的碧海与棕榈叶,正午明亮阳光带轻微硬影,斜 30 度俯拍构图,点缀贝壳与草帽一角,度假出行氛围',
  ),
  T(
    'bags',
    5,
    '轻奢橱窗陈列',
    '米色绒布包裹的阶梯式橱窗展台,背景带品牌灯箱光晕,顶部射灯重点照明,三分法侧面构图,点缀金属立牌与散落珍珠,轻奢陈列氛围',
  ),
  // —— 家居收纳 home ——
  T(
    'home',
    1,
    '北欧客厅',
    '浅橡木地板与白色边几台面,背景是米白布艺沙发与龟背竹绿植,午后窗光斜入,平视构图留白充足,点缀针织盖毯一角,北欧居家氛围',
  ),
  T(
    'home',
    2,
    '日式原木桌面',
    '原木色矮桌台面,背景是障子门透出的柔光,清晨漫射光,俯视 60 度构图,点缀一杯清茶与亚麻布,日式侘寂氛围',
  ),
  T(
    'home',
    3,
    '现代厨房台面',
    '白色石英石厨房岛台,背景是灰色哑光橱柜与吊灯,顶部白色主光加窗侧补光,水平线构图,点缀切菜板上的柠檬与香草,清爽料理氛围',
  ),
  T(
    'home',
    4,
    '衣帽间收纳',
    '胡桃木衣帽间层板台面,背景是排列整齐的衣物与藤编筐,暖白筒灯照明,斜侧纵深构图,点缀香薰蜡烛,整洁收纳氛围',
  ),
  T(
    'home',
    5,
    '浴室大理石',
    '白色大理石浴室台面,背景是雾面玻璃与浅绿墙砖,明亮均匀的漫射光,正面平视构图,点缀白色毛巾卷与尤加利叶,清洁 SPA 氛围',
  ),
  // —— 节日礼品 festive ——
  T(
    'festive',
    1,
    '圣诞暖炉夜',
    '深色纹理木板桌面,背景是虚化的壁炉火光与圣诞树彩灯,温暖橙红色调光线,平视特写构图,点缀松果、肉桂棒与红色缎带,浓郁圣诞夜氛围',
  ),
  T(
    'festive',
    2,
    '雪地圣诞晨光',
    '铺着人造雪的白色台面,背景是挂满装饰球的圣诞树虚化景深,清晨冷白光带暖色点缀,居中构图,点缀迷你礼物盒与冬青果枝,清新圣诞氛围',
  ),
  T(
    'festive',
    3,
    '新年红金礼盒',
    '红色丝绒桌布台面,背景是金色光斑与灯笼虚影,暖金色重点照明,对称居中构图,点缀金色流苏与福字利是封,中式新年送礼氛围',
  ),
  T(
    'festive',
    4,
    '万圣夜派对',
    '做旧黑色木桌台面,背景是南瓜灯与紫橙色雾光,低调暗调布光,斜侧构图,点缀小蜘蛛装饰与糖果,万圣节派对氛围',
  ),
  T(
    'festive',
    5,
    '生日派对甜彩',
    '奶油色圆桌台面,背景是粉蓝气球束与彩带虚化,明亮高调光,俯拍 45 度构图,点缀纸杯蛋糕与彩色纸屑,欢乐生日氛围',
  ),
  T(
    'festive',
    6,
    '情人节玫瑰',
    '粉色磨砂石面台面,背景是深红玫瑰花墙虚化,柔和粉调侧光,三分法构图,点缀玫瑰花瓣与丝带蝴蝶结,浪漫礼赠氛围',
  ),
  // —— 食品饮料 food ——
  T(
    'food',
    1,
    '早餐木桌',
    '原木纹理早餐桌台面,背景是虚化的白色窗帘与绿植,清晨侧逆光,俯拍 45 度构图,点缀牛奶杯、燕麦碗与亚麻餐巾,健康早餐氛围',
  ),
  T(
    'food',
    2,
    '咖啡馆吧台',
    '深色胡桃木吧台台面,背景是咖啡机与暖光吊灯虚化,暖黄色环境光,平视特写构图,点缀散落咖啡豆与拉花杯,手作咖啡馆氛围',
  ),
  T(
    'food',
    3,
    '野餐草地',
    '格纹野餐布铺在草地上,背景是虚化的树影与阳光斑点,正午明亮自然光,俯视构图,点缀法棍、水果与藤编篮,户外野餐氛围',
  ),
  T(
    'food',
    4,
    '暗调美食摄影',
    '黑色板岩台面,深灰色纹理背景,单侧硬光塑造立体阴影,低角度特写构图,点缀香料粉末与新鲜香草,高级暗调食摄氛围',
  ),
  T(
    'food',
    5,
    '夏日冷饮',
    '带水珠凝结的玻璃桌面,背景是虚化的泳池蓝与棕榈影,通透明亮阳光,平视构图,点缀冰块、柠檬片与薄荷叶,清凉夏日氛围',
  ),
  // —— 服饰配件 apparel ——
  T(
    'apparel',
    1,
    '法式优雅陈列',
    '奶白色石膏纹理台面,背景是拱形门洞与藤编帽虚影,午后柔和暖光,平视构图,点缀珍珠项链与丝巾一角,法式优雅氛围',
  ),
  T(
    'apparel',
    2,
    '街头潮流工业风',
    '水泥灰台面,背景是金属网架与霓虹灯管,冷暖对撞的霓虹光,低角度仰拍构图,点缀滑板与链条配饰,街头潮流氛围',
  ),
  T(
    'apparel',
    3,
    '珠宝丝绒特写',
    '深蓝丝绒衬布台面,纯黑渐变背景,顶部聚光灯打出高光点,微距特写构图,点缀细碎光斑与镜面倒影,高级珠宝氛围',
  ),
  T(
    'apparel',
    4,
    '秋冬针织暖调',
    '米色粗针织毯台面,背景是虚化的暖炉光与干枝,温暖橙调光线,俯拍构图,点缀热可可杯与摊开的书本,秋冬慵懒氛围',
  ),
  T(
    'apparel',
    5,
    '运动活力棚拍',
    '哑光地胶台面,亮橙色渐变无缝纸背景,双侧硬光营造运动感,斜对角动感构图,点缀飞溅水珠与运动毛巾,运动活力氛围',
  ),
  // —— 工业工具 industrial ——
  T(
    'industrial',
    1,
    '车间工作台',
    '磨损钢板工作台台面,背景是虚化的车床与工具挂板,冷白顶光加局部暖光,平视特写构图,点缀螺栓、扳手与图纸,真实车间氛围',
  ),
  T(
    'industrial',
    2,
    '蓝调科技棚拍',
    '黑色哑光展台,深蓝渐变背景,边缘蓝色轮廓光,居中对称构图,点缀光线拉丝与网格投影,工业科技感氛围',
  ),
  T(
    'industrial',
    3,
    '户外工地实景',
    '粗糙水泥地面台面,背景是虚化的脚手架与安全网,正午强烈日光带硬影,低角度构图,点缀安全帽与卷尺,耐用工地氛围',
  ),
  T(
    'industrial',
    4,
    '精密仪器白棚',
    '亚克力展台,纯白无缝背景,均匀无影布光,正面产品图构图,点缀极简标注线与刻度元素,精密仪器目录氛围',
  ),
  T(
    'industrial',
    5,
    '重工金属质感',
    '拉丝不锈钢台面,深灰金属波纹背景,侧向硬光突出金属纹理,45 度构图,点缀铁屑与机油光泽,硬核重工氛围',
  ),
  // —— 通用 general ——
  T(
    'general',
    1,
    '纯色渐变棚拍',
    '同色系亚克力圆台,莫兰迪色渐变无缝纸背景,柔光箱均匀照明,居中构图,点缀简洁几何体道具,通用电商棚拍氛围',
  ),
  T(
    'general',
    2,
    '自然窗光桌面',
    '浅色原木桌面,背景是白纱窗帘透光,午后自然窗光带植物影子,平视构图,点缀陶瓷杯与书本,生活方式氛围',
  ),
  T('general', 3, '高级黑金', '黑色镜面台面,深黑渐变背景,金色轮廓光勾边,低机位仰拍构图,点缀金箔碎片,高端黑金氛围'),
  T(
    'general',
    4,
    '清新绿植',
    '白色石纹台面,背景是散焦的绿植墙,明亮清透自然光,三分法构图,点缀散落绿叶与水珠,清新自然氛围',
  ),
  T(
    'general',
    5,
    '云端悬浮',
    '白色悬浮平台,淡蓝天空与云层背景,顶部天光照明,居中悬浮构图,点缀漂浮的轻纱与光斑,梦幻悬浮氛围',
  ),
  T(
    'general',
    6,
    '水面倒影',
    '浅水面台面带涟漪倒影,背景是日落橙紫渐变天空,黄昏逆光,对称倒影构图,点缀水波纹与飞溅水花,唯美水景氛围',
  ),
];

// 最小仓库契约(与单测内存仓库对齐):只用 findOne/create
interface SeedRepo {
  findOne(q: { filter: Record<string, unknown> }): Promise<unknown>;
  create(q: { values: Record<string, unknown> }): Promise<unknown>;
}

interface SeedApp {
  db: { getRepository: (name: string) => SeedRepo };
  logger: { info: (msg: string) => void; warn: (msg: string) => void };
}

// 幂等播种:按 title+category+source=builtin 查重,缺则建。重启/多实例重复执行安全。
export async function seedStyleTemplates(app: SeedApp): Promise<{ created: number; skipped: number }> {
  const repo = app.db.getRepository('aiListingStyleTemplates');
  let created = 0;
  let skipped = 0;
  for (const seed of STYLE_TEMPLATE_SEEDS) {
    const exists = await repo.findOne({ filter: { title: seed.title, category: seed.category, source: 'builtin' } });
    if (exists) {
      skipped += 1;
      continue;
    }
    await repo.create({ values: { ...seed, source: 'builtin', enabled: true } });
    created += 1;
  }
  if (created) app.logger.info(`[ai-listing] style templates seeded: +${created} (skipped ${skipped})`);
  return { created, skipped };
}
