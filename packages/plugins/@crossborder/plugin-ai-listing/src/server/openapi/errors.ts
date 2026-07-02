/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// 平台 OpenAPI 统一错误 + 运营友好提示映射。IOP 家族（Alibaba.com / Lazada / AliExpress）通用。
// 铁律：错误对象与日志绝不含 access_token / app_secret / 完整响应体，只带 code / message / traceId / http。

export class OpenApiError extends Error {
  code: string;
  retryable: boolean;
  traceId?: string;
  httpStatus?: number;

  constructor(code: string, message: string, opts?: { retryable?: boolean; traceId?: string; httpStatus?: number }) {
    super(message);
    this.name = 'OpenApiError';
    this.code = code;
    this.retryable = opts?.retryable ?? false;
    this.traceId = opts?.traceId;
    this.httpStatus = opts?.httpStatus;
  }
}

// msg_code / 错误码 → 运营友好提示（zh）。未知码回退到原始 message。
const FRIENDLY: Record<string, { userMessage: string; retryable: boolean; action?: string }> = {
  OPENAPI_NOT_CONFIGURED: {
    userMessage: '平台接口未配置（缺少 AppKey / AppSecret）',
    retryable: false,
    action: '在服务端 .env 配置 ALIBABA_ICBU_APP_KEY / APP_SECRET',
  },
  OPENAPI_NOT_CONNECTED: {
    userMessage: '尚未连接平台店铺，请先完成授权',
    retryable: false,
    action: '到设置页点「连接店铺」完成 OAuth 授权',
  },
  OPENAPI_NEEDS_REAUTH: {
    userMessage: '平台授权已过期，需要重新授权店铺',
    retryable: false,
    action: '到设置页重新「连接店铺」',
  },
  OPENAPI_TOKEN_EXCHANGE_FAILED: {
    userMessage: '换取访问令牌失败（授权码可能已过期，请重新授权）',
    retryable: false,
    action: '重新发起「连接店铺」，授权码一次性且快速过期',
  },
  InvalidCode: {
    userMessage: '授权码无效或已过期，请重新授权',
    retryable: false,
    action: '重新发起「连接店铺」，授权码一次性且快速过期',
  },
  InvalidAppKey: {
    userMessage: '网关或 AppKey 配置错误',
    retryable: false,
    action: '确认网关为 openapi-api.alibaba.com/rest、AppKey 正确',
  },
  IncompleteSignature: { userMessage: '请求签名不完整/无效', retryable: false, action: '检查签名算法与参数拼接' },
  InvalidSignature: { userMessage: '请求签名无效', retryable: false, action: '检查 AppSecret 与签名算法' },
  'invalid-signature': { userMessage: '请求签名无效', retryable: false, action: '检查 AppSecret 与签名算法' },
  AppWhiteIpLimit: {
    userMessage: '当前出口 IP 不在平台白名单内',
    retryable: false,
    action: '到控制台 IP Whitelist 加入服务器出口公网 IP',
  },
  InsufficientPermission: {
    userMessage: 'App 尚无该接口的调用权限',
    retryable: false,
    action: '到控制台 Apply process / API Permission Group 申请 Product(ICBU) 相关 API 权限，审批通过后重试',
  },
  IllegalAccessToken: { userMessage: '访问令牌无效或已过期', retryable: false, action: '触发刷新或重新授权' },
  'invalid-timestamp': { userMessage: '请求时间戳误差过大', retryable: true, action: '校准服务器时钟（NTP）' },
  ServiceUnavailable: { userMessage: '平台服务暂不可用', retryable: true, action: '稍后重试' },
  'system-busy': { userMessage: '平台繁忙，请稍后重试', retryable: true, action: '稍后重试' },
  // 实测 category/predict/v2 等接口偶发返回该错误（平台内部 RPC 超时），重试即可恢复。
  ServiceTimeout: { userMessage: '平台服务响应超时（接口偶发抖动）', retryable: true, action: '稍后重试' },

  // —— 商品发布/编辑业务错误码（官方 wiki《商品API相关常见错误码说明》+ 发布接入文档错误表）——
  PUB_BIZCHECK_DESCRIPTION_IS_REQUIRED: {
    userMessage: '商品详情不能为空（平台 2025-10 起详情必填）',
    retryable: false,
    action: '草稿引擎已写入结构化详描；若为直接上架请确认描述与详情图非空',
  },
  PUB_BIZCHECK_PRODUCT_COUNT_EXCEED: {
    userMessage: '店铺发布的商品总量已超出平台限制',
    retryable: false,
    action: '清理店铺内滞销/重复商品后重试，或尝试保存为草稿',
  },
  PUB_BIZCHECK_PRODUCT_SKETCH_COUNT_EXCEED: {
    userMessage: '店铺草稿商品总量已超出平台限制',
    retryable: false,
    action: '到卖家后台清理无用草稿（或用发布记录页的草稿链接逐一处理）后重试',
  },
  PUB_BIZCHECK_CAT_PUB_RESTRICT: {
    userMessage: '目标类目不在店铺经营类目范围内，不可发布',
    retryable: false,
    action: '换用经营范围内的类目，或到卖家后台扩充经营类目',
  },
  PUB_BIZCHECK_CAT_PUB_LIMIT: {
    userMessage: '该类目平台正在调整，暂时不能发布商品',
    retryable: true,
    action: '稍后重试或临时换相近叶子类目',
  },
  PUB_BIZCHECK_CAT_ID_NOTEXIST: {
    userMessage: '类目 ID 不能为空',
    retryable: false,
    action: '先设置或 AI 预测目标类目',
  },
  PUB_BIZCHECK_CAT_DATA_NOTEXIST: {
    userMessage: '类目不存在或已失效',
    retryable: false,
    action: '重新用「AI 预测类目」获取有效叶子类目',
  },
  CHK_CAT_NOT_LEAF: { userMessage: '只有叶子类目可发布商品', retryable: false, action: '选择更下一级的叶子类目' },
  PUB_BIZCHECK_PRODUCT_IN_AUDITING: {
    userMessage: '商品已在平台审核中，请勿重复提交',
    retryable: false,
    action: '等待平台审核结束后再操作',
  },
  PUB_BIZCHECK_ASSURANCE_ACCOUNT_REQUIRED: {
    userMessage: '账号未开通 Trade Assurance（信保），无法发布在线交易品',
    retryable: false,
    action: '到卖家后台开通信保，或改发询盘品',
  },
  PUB_BIZCHECK_PRIVILEGE_REQUIRED: {
    userMessage: '账号没有该类发品权限（在线交易品需开通信保）',
    retryable: false,
    action: '到卖家后台开通对应权限后重试',
  },
  PUB_BIZCHECK_POST_TYPE_CONFIRM: {
    userMessage: '账号没有询盘发品权限（仅有出口通权限）',
    retryable: false,
    action: '确认店铺会员类型支持该发品方式',
  },
  PUB_BIZCHECK_TEMPLATE_OWNER_ERROR: {
    userMessage: '运费模板不属于当前授权店铺',
    retryable: false,
    action: '发布配置里换成本店铺的运费模板，或留空走「买卖双方协商物流」',
  },
  PUB_BIZCHECK_SUSPICIOUS: {
    userMessage: '账号因禁限售/违规被平台限制发布',
    retryable: false,
    action: '联系平台客服处理违规状态后重试',
  },
  PUB_BIZCHECK_AUDITING_COMPANY_INFO: {
    userMessage: '公司资料审核通过后才能展示新品',
    retryable: false,
    action: '到卖家后台完善并提交公司信息审核',
  },
  PUB_BIZCHECK_INVENTORY_REQUIRED: {
    userMessage: '库存不能为空',
    retryable: false,
    action: '为商品/SKU 补充库存后重发',
  },
  PUB_BIZCHECK_PRICE_TYPE_REQUIRED: {
    userMessage: '价格币种/类型必须填写',
    retryable: false,
    action: '检查价格与币种设置',
  },
  PUB_BIZCHECK_SKU_PRICE: {
    userMessage: '存在无效的 SKU 价格（0 或负数）',
    retryable: false,
    action: '在预览编辑页修正对应 SKU 的售价后重发',
  },
  PUB_BIZCHECK_SALE_PROPERTY_VALEU_IS_NOT_EXPECT: {
    userMessage: '销售/类目属性的值不在平台候选项内',
    retryable: false,
    action: '属性值需取自类目选项（自定义值须用负数编号 inputValue 格式）',
  },
  PUB_BIZCHECK_SALE_PROPERTY_IMAGE_ERROR: {
    userMessage: '自定义属性的色卡图片链接不合规',
    retryable: false,
    action: '色卡图建议使用平台图床/图片银行链接',
  },
  PUB_BIZCHECK_DESCRIPTION_IMAGE_COUNT_EXCEED: {
    userMessage: '详情内嵌图片数量超限（最多 15 张）',
    retryable: false,
    action: '减少描述内嵌图片数量',
  },
  CHK_IMAGE_FILE_COUNT_EXCEED: {
    userMessage: '主图数量超限（最多 6 张）',
    retryable: false,
    action: '保留 6 张以内主图',
  },
  CHK_STEP_LADDER_PERIOD_QUANTITY_EMPTY_ERROR: {
    userMessage: '阶梯交期数量不能为空',
    retryable: false,
    action: '发货期组件每档需填数量与天数',
  },
  CHK_STEP_LADDER_PERIOD_VALUE_ERROR: {
    userMessage: '阶梯交期数量必须由小到大递增',
    retryable: false,
    action: '按起订量从小到大排列各档交期',
  },
  CHK_STEP_CATEGORY_QUALITY_MINSIZE_ERROR: {
    userMessage: '该类目与计量单位下起订量低于平台下限',
    retryable: false,
    action: '调大最小起订量（受类目 + 售卖单位限制）',
  },
  PUB_BIZCHECK_LADDER_PRICE_COUNTRY_LADDER: {
    userMessage: '阶梯价与国别化阶梯价数目不一致',
    retryable: false,
    action: '删除国别差异价或保持档位一致',
  },
  PUB_EDIT_PROMOTION_LOCK: {
    userMessage: '商品参加促销活动中，暂不能编辑',
    retryable: true,
    action: '活动结束后再操作',
  },
  PUB_BIZCHECK_COMP_PROMOTION_LOCK_ERROR: {
    userMessage: '商品在促销/折扣活动中，暂不能编辑',
    retryable: true,
    action: '活动结束后再操作',
  },
  PUB_BIZCHECK_BW_PRODUCT_NOT_EDITABLE: {
    userMessage: '商品在顶展投放中，无法修改或删除',
    retryable: true,
    action: '投放结束后再操作',
  },
  PUB_BIZCHECK_DZ_PRODUCT_NOT_EDITABLE: {
    userMessage: '商品已绑定顶展关键词/明星展播，无法编辑删除',
    retryable: false,
    action: '先在营销后台解绑展位',
  },
  PUB_BIZCHECK_ZZ_PRODUCT_NOT_EDITABLE: {
    userMessage: '商品已绑定明星展播展位，无法编辑',
    retryable: false,
    action: '先在营销后台解绑展位',
  },
  NOT_PRODUCT_OWNER: {
    userMessage: '授权账号不是该商品的创建人，无编辑权限',
    retryable: false,
    action: '用商品创建人的账号授权后操作',
  },
};

export function friendlyMessage(code?: string): { userMessage: string; retryable: boolean; action?: string } | null {
  if (!code) return null;
  return FRIENDLY[code] ?? null;
}
