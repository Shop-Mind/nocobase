// 快速搬运看板（QT1）—— 真源文件：docs/jsblocks/quick-transfer-board.js
// 铁律：以后功能迭代只改本真源并经 create-quick-transfer-tab.js 同步写库，不要直接在页面设计器里改代码。
// 数据源：aiListingQuickTransfer:board（服务端聚合 请求行→执行状态/待办/草稿链接，jsBlock 沙箱允许在 handler/useEffect 里 ctx.request 自定义 action）。
const { useState, useEffect, useCallback } = ctx.libs.React;
const { Card, Table, Tag, Button, Space, Typography, Tooltip, Empty, message, InputNumber } = ctx.libs.antd;
const dayjs = ctx.libs.dayjs;

const STATE_META = {
  queueing: { color: 'default', text: '排队中' },
  running: { color: 'processing', text: '自动处理中' },
  waiting: { color: 'gold', text: '等待改图确认' },
  done: { color: 'green', text: '已出草稿' },
  failed: { color: 'red', text: '失败' },
};

// 三层信封剥壳:HTTP data → 业务 {ok,data} → 载荷
function unwrap(resp) {
  const payload = (resp && resp.data && resp.data.data) || (resp && resp.data) || resp || {};
  return (payload && payload.data) || payload || {};
}

function QuickTransferBoard() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  // 缺省库存(QT4):>0 时工作流发布节点对无库存商品兜底写入;0=关闭。存 aiListingConfig.defaultStock。
  const [defaultStock, setDefaultStock] = useState(null);
  const [stockSaving, setStockSaving] = useState(false);

  useEffect(() => {
    async function loadCfg() {
      try {
        const resp = await ctx.request({ url: 'aiListingSettings:overview', method: 'get' });
        const data = unwrap(resp);
        setDefaultStock((data.config && data.config.defaultStock) || 0);
      } catch (e) {
        setDefaultStock(0);
      }
    }
    loadCfg();
  }, []);

  const saveDefaultStock = useCallback(async () => {
    setStockSaving(true);
    try {
      await ctx.request({
        url: 'aiListingSettings:saveConfig',
        method: 'post',
        data: { defaultStock: Number(defaultStock) || 0 },
      });
      message.success(Number(defaultStock) > 0 ? `缺省库存已开启：${Number(defaultStock)}` : '缺省库存已关闭');
    } catch (e) {
      message.error('保存失败：' + ((e && e.message) || String(e)));
    } finally {
      setStockSaving(false);
    }
  }, [defaultStock]);

  const load = useCallback(async (silent) => {
    if (!silent) setLoading(true);
    try {
      const resp = await ctx.request({ url: 'aiListingQuickTransfer:board', method: 'post', data: { limit: 20 } });
      const inner = unwrap(resp);
      setRows(Array.isArray(inner.rows) ? inner.rows : []);
    } catch (e) {
      if (!silent) message.error('看板加载失败：' + ((e && e.message) || String(e)));
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(false);
    const timer = setInterval(() => load(true), 8000);
    return () => clearInterval(timer);
  }, [load]);

  const columns = [
    { title: '#', dataIndex: 'requestId', width: 60 },
    {
      title: '商品链接',
      dataIndex: 'sourceUrl',
      render: (url) => (
        <Typography.Text style={{ maxWidth: 300, display: 'inline-block' }} ellipsis={{ tooltip: url }}>
          {url || '—'}
        </Typography.Text>
      ),
    },
    {
      title: '状态',
      dataIndex: 'state',
      width: 130,
      render: (state, row) => {
        const meta = STATE_META[state] || STATE_META.queueing;
        const tag = <Tag color={meta.color}>{meta.text}</Tag>;
        if (state !== 'failed' || (!row.errorCode && !row.errorMessage)) return tag;
        // 失败原因 + 下一步指引(QT4:服务端 nextAction 映射)
        const tip = (
          <div>
            <div>{`${row.errorCode || ''} ${row.errorMessage || ''}`.trim()}</div>
            {row.nextAction ? <div style={{ marginTop: 4 }}>👉 {row.nextAction}</div> : null}
          </div>
        );
        return <Tooltip title={tip}>{tag}</Tooltip>;
      },
    },
    { title: '商品', dataIndex: 'productId', width: 80, render: (v) => (v ? `#${v}` : '—') },
    { title: '直通', dataIndex: 'skipMedia', width: 70, render: (v) => (v ? '跳过改图' : '—') },
    {
      title: '提交时间',
      dataIndex: 'createdAt',
      width: 120,
      render: (v) => (v ? dayjs(v).format('MM-DD HH:mm') : '—'),
    },
    {
      title: '操作',
      key: 'ops',
      width: 250,
      render: (_, row) => (
        <Space size={4} wrap>
          {row.state === 'waiting' ? (
            <Button size="small" type="primary" onClick={() => ctx.router.navigate('/admin/workflow/tasks')}>
              去处理待办
            </Button>
          ) : null}
          {row.draftUrl ? (
            <Button size="small" type="link" href={row.draftUrl} target="_blank" rel="noreferrer">
              打开草稿 ↗
            </Button>
          ) : null}
          {row.executionId ? (
            <Button
              size="small"
              type="link"
              onClick={() => ctx.router.navigate(`/admin/settings/workflow/executions/${row.executionId}`)}
            >
              执行记录
            </Button>
          ) : null}
        </Space>
      ),
    },
  ];

  return (
    <Card
      size="small"
      title="搬运看板"
      extra={
        <Space size={8} wrap>
          <Tooltip title="大于 0 时：直通/发布前对无库存商品自动补写该库存值（只影响快速搬运工作流）；0 = 关闭">
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              缺省库存
            </Typography.Text>
          </Tooltip>
          <InputNumber
            size="small"
            min={0}
            max={999999}
            precision={0}
            style={{ width: 90 }}
            value={defaultStock}
            onChange={(v) => setDefaultStock(v)}
            aria-label="缺省库存"
          />
          <Button size="small" loading={stockSaving} disabled={defaultStock === null} onClick={saveDefaultStock}>
            保存
          </Button>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            每 8 秒自动刷新
          </Typography.Text>
          <Button size="small" loading={loading} onClick={() => load(false)}>
            刷新
          </Button>
        </Space>
      }
    >
      <Table
        rowKey="requestId"
        size="small"
        columns={columns}
        dataSource={rows}
        loading={loading && rows.length === 0}
        pagination={false}
        locale={{
          emptyText: (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="还没有搬运记录 —— 在上方表单粘贴商品链接并提交，工作流会自动抓取、处理，改图确认后生成上架草稿"
            />
          ),
        }}
      />
    </Card>
  );
}

ctx.render(<QuickTransferBoard />);
