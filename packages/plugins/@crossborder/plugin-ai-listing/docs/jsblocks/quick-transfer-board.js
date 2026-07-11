// 快速搬运看板（QT1，QT4 缺省库存/指引，QT5 批量粘贴/重跑/耗时/并发观测）—— 真源文件：docs/jsblocks/quick-transfer-board.js
// 铁律：以后功能迭代只改本真源并经 create-quick-transfer-tab.js 同步写库，不要直接在页面设计器里改代码。
// 数据源：aiListingQuickTransfer:board（服务端聚合 请求行→执行状态/待办/草稿链接，jsBlock 沙箱允许在 handler/useEffect 里 ctx.request 自定义 action）。
const { useState, useEffect, useCallback, useMemo } = ctx.libs.React;
const {
  Card,
  Table,
  Tag,
  Button,
  Space,
  Typography,
  Tooltip,
  Empty,
  message,
  InputNumber,
  Input,
  Checkbox,
} = ctx.libs.antd;
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

// 耗时展示:终态 = finishedAt - startedAt;进行中 = now - startedAt(随 8 秒轮询自然刷新)
function fmtDuration(row) {
  if (!row.startedAt) return '—';
  const end = row.finishedAt ? dayjs(row.finishedAt) : dayjs();
  const sec = Math.max(0, end.diff(dayjs(row.startedAt), 'second'));
  if (sec < 60) return `${sec}s`;
  return `${Math.floor(sec / 60)}m${sec % 60}s`;
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
      const resp = await ctx.request({ url: 'aiListingQuickTransfer:board', method: 'post', data: { limit: 30 } });
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

  // 批量粘贴(QT5):每行一条链接,逐行建请求行=逐行独立执行(发布限速已内置于工作流下游)
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchText, setBatchText] = useState('');
  const [batchSkipMedia, setBatchSkipMedia] = useState(false);
  const [batchRunning, setBatchRunning] = useState(false);

  const submitBatch = useCallback(async () => {
    const lines = batchText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    if (!lines.length) {
      message.warning('请先粘贴商品链接（每行一条）');
      return;
    }
    if (lines.length > 30) {
      message.warning('一次最多 30 条');
      return;
    }
    setBatchRunning(true);
    let ok = 0;
    const bad = [];
    for (const url of lines) {
      if (!/^https?:\/\//i.test(url)) {
        bad.push(url);
        continue;
      }
      try {
        await ctx.request({
          url: 'aiListingQuickTransferRequests:create',
          method: 'post',
          data: { sourceUrl: url, skipMedia: batchSkipMedia },
        });
        ok += 1;
      } catch (e) {
        bad.push(url);
      }
    }
    setBatchRunning(false);
    setBatchText('');
    setBatchOpen(false);
    message.success(`已提交 ${ok} 条${bad.length ? `，${bad.length} 条无效/失败未提交` : ''}`);
    load(false);
  }, [batchText, batchSkipMedia, load]);

  // 重跑(QT5):对失败行按原参数新建请求行 = 全新执行(同 URL 防重只拦「进行中」,终态失败可重跑)
  const rerun = useCallback(
    async (row) => {
      try {
        await ctx.request({
          url: 'aiListingQuickTransferRequests:create',
          method: 'post',
          data: {
            sourceUrl: row.sourceUrl,
            ruleId: row.ruleId || undefined,
            targetStoreId: row.targetStoreId || undefined,
            skipMedia: Boolean(row.skipMedia),
          },
        });
        message.success(`已重新提交 #${row.requestId} 的链接，看板将跟踪新执行`);
        load(false);
      } catch (e) {
        message.error('重跑失败：' + ((e && e.message) || String(e)));
      }
    },
    [load],
  );

  // 并发观测(QT5):各状态计数
  const stats = useMemo(() => {
    const acc = { queueing: 0, running: 0, waiting: 0, done: 0, failed: 0 };
    for (const r of rows) acc[r.state] = (acc[r.state] || 0) + 1;
    return acc;
  }, [rows]);

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
    { title: '耗时', key: 'duration', width: 80, render: (_, row) => fmtDuration(row) },
    {
      title: '操作',
      key: 'ops',
      width: 280,
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
          {row.state === 'failed' ? (
            <Button size="small" danger onClick={() => rerun(row)}>
              重跑
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
          <Button
            size="small"
            type={batchOpen ? 'default' : 'primary'}
            ghost={!batchOpen}
            onClick={() => setBatchOpen(!batchOpen)}
          >
            {batchOpen ? '收起批量' : '批量粘贴'}
          </Button>
        </Space>
      }
    >
      {batchOpen ? (
        <div style={{ marginBottom: 12, padding: 12, background: 'rgba(0,0,0,0.02)', borderRadius: 8 }}>
          <Input.TextArea
            rows={5}
            value={batchText}
            onChange={(e) => setBatchText(e.target.value)}
            placeholder={
              '每行粘贴一条 Alibaba.com 商品链接（最多 30 条），逐行独立执行\nhttps://www.alibaba.com/product-detail/...\nhttps://www.alibaba.com/product-detail/...'
            }
            aria-label="批量商品链接"
          />
          <Space style={{ marginTop: 8 }}>
            <Checkbox checked={batchSkipMedia} onChange={(e) => setBatchSkipMedia(e.target.checked)}>
              跳过改图直出草稿
            </Checkbox>
            <Button type="primary" loading={batchRunning} onClick={submitBatch}>
              开始批量搬运
            </Button>
          </Space>
        </div>
      ) : null}
      <Space size={6} style={{ marginBottom: 8 }} wrap>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          并发观测：
        </Typography.Text>
        {Object.keys(STATE_META).map((k) =>
          stats[k] ? (
            <Tag key={k} color={STATE_META[k].color}>
              {STATE_META[k].text} {stats[k]}
            </Tag>
          ) : null,
        )}
        {!rows.length ? (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            （暂无记录）
          </Typography.Text>
        ) : null}
      </Space>
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
