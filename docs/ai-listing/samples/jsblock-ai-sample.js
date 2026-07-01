// ============================================================================
// 本文件为「jsBlock 原生 AI 能力」的参考样板（勿删）。
//
// 它是 AI 员工 Demo 页（区块 key: demo-review-toby）已端到端验证通过的 jsBlock 源码：
// 点原生头像 → 原生 plugin-ai 抽屉对话 → AI 调 jsBlockApplyPatch 改「暂存」→ 点「提交」才入库。
//
// 接入新 jsBlock 时，照 docs/ai-listing/jsblock-ai-integration-recipe.md 的三步，可直接以本文件为模板复制修改：
//   ① BLOCK_KEY / FIELDS（可编辑字段=写白名单）+ kit.register/unregister
//   ② kit.getAvatar 两态头像（转头）+ kit.openAI 打开抽屉
//   ③「提交」按钮走受控服务端 action（唯一写库口，逐字段审计 actorType=user）
// ============================================================================

const { React, antd } = ctx.libs;
const { useState, useEffect, useRef, useCallback } = React;
const {
  Card,
  Avatar,
  Tag,
  Typography,
  Space,
  Button,
  Input,
  Select,
  message,
  Alert,
  Tooltip,
  Spin,
  Divider,
} = antd;

// 本 jsBlock 的注册 key（全局唯一即可）。AI 通过 jsBlockApplyPatch({ block: KEY, patch }) 改本块暂存。
const BLOCK_KEY = 'demo-review-toby';

// 声明「可编辑字段」——同时用于：① 页面渲染 ② 喂给 AI 的 system 上下文 ③ 前端工具的白名单校验。
const FIELDS = [
  {
    name: 'title',
    label: '标题',
    type: 'string',
    hint: '面向目标平台(如 Lazada)的商品标题，突出关键词与卖点',
  },
  {
    name: 'description',
    label: '描述',
    type: 'string',
    hint: '商品详情描述，可补充材质/规格/卖点',
  },
  { name: 'stock', label: '库存', type: 'number', hint: '目标平台库存数量' },
  {
    name: 'attributes',
    label: '参数',
    type: 'object',
    hint: '键值对形式的商品参数，如 {"材质":"棉"}',
  },
];

const callApi = async (url, data) => {
  const res = await ctx.request({
    url,
    method: 'post',
    data: data || {},
    skipNotify: true,
  });
  let b = res && res.data;
  if (b && b.data && typeof b.data === 'object' && 'ok' in b.data) b = b.data;
  return b;
};

const emptyStaged = () => ({
  title: '',
  description: '',
  stock: 0,
  attributes: {},
});

const PendingTag = () => (
  <Tag color="gold" style={{ marginLeft: 6 }}>
    待提交
  </Tag>
);

const App = () => {
  const [products, setProducts] = useState([]);
  const [pid, setPid] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [staged, setStaged] = useState(emptyStaged());
  const [baseline, setBaseline] = useState(emptyStaged()); // 载入/提交后的基准值，用于标「待提交」
  // Toby 原生头像两态（复刻原生 AIEmployeeShortcut 的 hover 转头）：常态明亮、hover flip 转头。
  const [avatarNormal, setAvatarNormal] = useState(null);
  const [avatarHover, setAvatarHover] = useState(null);
  const [avatarFocus, setAvatarFocus] = useState(false);

  // getData / applyPatch 需要读到最新 staged —— 用 ref 避免闭包过期。
  const stagedRef = useRef(staged);
  stagedRef.current = staged;

  const kit =
    (typeof window !== 'undefined' && window.__aiListingBlockKit) || null;

  // 取 Toby 的原生头像两态：常态明亮（无 dark 遮罩，避免发黑），hover flip 转头。
  useEffect(() => {
    if (!kit || !kit.getAvatar) return;
    kit
      .getAvatar('lst-toby', { mouth: undefined, mask: undefined })
      .then((u) => u && setAvatarNormal(u))
      .catch(() => {});
    kit
      .getAvatar('lst-toby', { mask: undefined, flip: true })
      .then((u) => u && setAvatarHover(u))
      .catch(() => {});
  }, [kit]);

  // 载入审核商品列表（下拉选择演示商品，非手填 ID）。
  useEffect(() => {
    callApi('aiListingReview:list', {}).then((b) => {
      const ps = (b && b.data && b.data.products) || [];
      setProducts(ps);
      if (ps[0]) setPid(ps[0].id);
    });
  }, []);

  const loadDetail = useCallback((id) => {
    if (!id) return;
    setLoading(true);
    callApi('aiListingReview:detail', { id })
      .then((b) => {
        const p = (b && b.data && b.data.product) || {};
        const next = {
          title: p.titleFinal || p.titleProcessed || p.titleOriginal || '',
          description:
            p.descriptionFinal ||
            p.descriptionProcessed ||
            p.descriptionOriginal ||
            '',
          stock: typeof p.stock === 'number' ? p.stock : 0,
          attributes: p.attributesProcessed || p.attributesOriginal || {},
        };
        setStaged(next);
        setBaseline(next);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (pid) loadDetail(pid);
  }, [pid, loadDetail]);

  // 向 kit 注册本块能力（每次渲染刷新闭包；卸载时注销）。这就是「一处声明即获得 AI 改暂存能力」。
  useEffect(() => {
    if (!kit) return undefined;
    kit.register(BLOCK_KEY, {
      title: '商品信息整理（Toby）',
      getData: () => stagedRef.current,
      getSchema: () => FIELDS,
      applyPatch: (patch) =>
        setStaged((prev) => {
          const nextAttrs =
            patch && patch.attributes && typeof patch.attributes === 'object'
              ? { ...(prev.attributes || {}), ...patch.attributes }
              : prev.attributes;
          return { ...prev, ...patch, attributes: nextAttrs };
        }),
    });
    return () => kit.unregister(BLOCK_KEY);
  });

  const isDirty = (field) =>
    JSON.stringify(staged[field]) !== JSON.stringify(baseline[field]);
  const dirtyCount = FIELDS.filter((f) => isDirty(f.name)).length;

  const openAI = async () => {
    if (!kit) {
      message.warning('AI 能力未就绪（请刷新页面）');
      return;
    }
    const ok = await kit.openAI(BLOCK_KEY, {
      username: 'lst-toby',
      prompt: '请把标题优化得更适合 Lazada，并补充 2 条描述卖点。',
    });
    if (!ok) message.warning('打开原生 AI 抽屉失败');
  };

  // 唯一写库口：受控服务端 action。AI 只改暂存，只有此按钮把暂存落库（服务端做锁定/权限/逐字段审计 actorType=user）。
  const submit = async () => {
    if (!pid) return;
    setSaving(true);
    try {
      const b = await callApi('aiListingReview:saveFinal', {
        id: pid,
        values: {
          titleFinal: staged.title,
          descriptionFinal: staged.description,
          stock: Number(staged.stock) || 0,
          attributesProcessed: staged.attributes || {},
        },
      });
      if (b && b.ok) {
        message.success(`已提交入库（变更 ${b.data ? b.data.changed : 0} 项）`);
        setBaseline(staged);
        loadDetail(pid);
      } else {
        message.error(
          (b && b.errors && b.errors[0] && b.errors[0].message) || '提交失败'
        );
      }
    } catch (e) {
      message.error('提交失败：' + (e && e.message));
    } finally {
      setSaving(false);
    }
  };

  const attrsText = JSON.stringify(staged.attributes || {}, null, 0);

  return (
    <Card
      title="AI 员工 · 商品信息整理（对话改暂存 → 提交入库）· 能力样板（勿删）"
      extra={
        <Space size={10}>
          <Select
            size="small"
            style={{ width: 240 }}
            value={pid}
            onChange={setPid}
            placeholder="选择演示商品"
            options={products.map((p) => ({
              label: `#${p.id} ${p.title || ''}`,
              value: p.id,
            }))}
          />
          <Tooltip title="点我打开原生 AI 抽屉，让文案管家 Toby 帮你改这个区块（改动先暂存，点提交才入库）">
            <span
              style={{ cursor: 'pointer', display: 'inline-block' }}
              onMouseEnter={() => setAvatarFocus(true)}
              onMouseLeave={() => setAvatarFocus(false)}
              onClick={openAI}
            >
              <Avatar
                size={40}
                shape="circle"
                src={(avatarFocus ? avatarHover : avatarNormal) || undefined}
                style={{ background: avatarNormal ? undefined : '#722ed1' }}
              >
                {avatarNormal ? null : 'AI'}
              </Avatar>
            </span>
          </Tooltip>
        </Space>
      }
    >
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 12 }}
        message="点右上头像 → 原生 AI 抽屉里对话（例：把标题改得更适合 Lazada）。AI 直接改下面字段的「暂存」值并标「待提交」；只有点「提交」才真正入库。"
      />
      {loading ? (
        <Spin />
      ) : (
        <Space direction="vertical" size={14} style={{ width: '100%' }}>
          <div>
            <Typography.Text strong>标题</Typography.Text>
            {isDirty('title') ? <PendingTag /> : null}
            <Input
              value={staged.title}
              onChange={(e) =>
                setStaged((s) => ({ ...s, title: e.target.value }))
              }
              placeholder="商品标题"
            />
          </div>
          <div>
            <Typography.Text strong>描述</Typography.Text>
            {isDirty('description') ? <PendingTag /> : null}
            <Input.TextArea
              rows={3}
              value={staged.description}
              onChange={(e) =>
                setStaged((s) => ({ ...s, description: e.target.value }))
              }
              placeholder="商品描述"
            />
          </div>
          <Space size={24} align="start" style={{ width: '100%' }}>
            <div>
              <Typography.Text strong>库存</Typography.Text>
              {isDirty('stock') ? <PendingTag /> : null}
              <Input
                type="number"
                style={{ width: 160, display: 'block' }}
                value={staged.stock}
                onChange={(e) =>
                  setStaged((s) => ({ ...s, stock: e.target.value }))
                }
              />
            </div>
            <div style={{ flex: 1 }}>
              <Typography.Text strong>参数</Typography.Text>
              {isDirty('attributes') ? <PendingTag /> : null}
              <Typography.Paragraph
                code
                style={{ margin: '4px 0 0', wordBreak: 'break-all' }}
              >
                {attrsText}
              </Typography.Paragraph>
            </div>
          </Space>
          <Divider style={{ margin: '4px 0' }} />
          <div style={{ textAlign: 'right' }}>
            {dirtyCount > 0 ? (
              <Typography.Text type="warning" style={{ marginRight: 12 }}>
                有 {dirtyCount} 项待提交
              </Typography.Text>
            ) : (
              <Typography.Text type="secondary" style={{ marginRight: 12 }}>
                无未提交改动
              </Typography.Text>
            )}
            <Button
              type="primary"
              loading={saving}
              disabled={!pid || dirtyCount === 0}
              onClick={submit}
            >
              提 交
            </Button>
          </div>
        </Space>
      )}
    </Card>
  );
};

ctx.render(<App />);
