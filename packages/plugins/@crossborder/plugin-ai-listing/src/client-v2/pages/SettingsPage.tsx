/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { ApiOutlined, CloudServerOutlined, SafetyCertificateOutlined, SettingOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Col, Row, Select, Skeleton, Space, Switch, Table, Tag, Tooltip, Typography } from 'antd';
import React, { useCallback, useEffect, useState } from 'react';
import { ListingPageErrorBoundary } from '../components/ListingPageErrorBoundary';
import { StatusTag, listingTokens } from '../components/ui';
import { useRequestWithFriendlyError } from '../components/request';
import { useT } from '../locale';

const { Title, Text, Paragraph } = Typography;

interface AccountRow {
  id: number;
  platform: string;
  storeName?: string;
  authStatus: 'connected' | 'expired' | 'disconnected';
  expiresAt?: string | null;
  expiringSoon?: boolean;
  expired?: boolean;
}
interface OverviewData {
  accounts: AccountRow[];
  config: {
    defaultPlatform: string | null;
    defaultRuleId: number | null;
    crawl4aiEnabled: boolean;
    openApiIpWhitelisted: boolean;
  };
  rules: Array<{ id: number; name: string; enabled: boolean }>;
  platformOptions: string[];
  crawl4ai: { enabled: boolean; configured: boolean; hint: string };
  openApi: {
    mode: string;
    tokenExpired: boolean;
    ipWhitelisted: boolean;
    hints: Array<{ level: 'info' | 'warning' | 'error'; code?: string; message: string }>;
  };
}

const AUTH_LABEL: Record<string, string> = { connected: '已授权', expired: '已过期', disconnected: '未连接' };

function SettingsInner() {
  const t = useT();
  const request = useRequestWithFriendlyError();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<OverviewData | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await request<{ data?: OverviewData } & OverviewData>({
      url: 'aiListingSettings:overview',
      method: 'post',
    });
    // 自定义 action 返回统一信封 { ok, data, traceId }，业务对象在 data.data 层；做一次安全解包。
    if (res.ok && res.data) {
      const env = res.data;
      const real = (env.data && (env.data as OverviewData).config ? env.data : env) as OverviewData;
      setData(real);
    }
    setLoading(false);
  }, [request]);

  useEffect(() => {
    load();
  }, [load]);

  const saveConfig = useCallback(
    async (patch: Record<string, unknown>) => {
      setSaving(true);
      const res = await request({ url: 'aiListingSettings:saveConfig', method: 'post', data: patch });
      setSaving(false);
      if (res.ok) load();
      return res.ok;
    },
    [request, load],
  );

  if (loading && !data) return <Skeleton active paragraph={{ rows: 8 }} style={{ padding: 24 }} />;
  if (!data) return <Alert type="error" showIcon message={t('设置加载失败，请稍后重试')} style={{ margin: 24 }} />;

  const { accounts, config, rules, platformOptions, crawl4ai, openApi } = data;

  const accountColumns = [
    { title: t('平台'), dataIndex: 'platform', key: 'platform', render: (v: string) => <Text strong>{v}</Text> },
    {
      title: t('店铺'),
      dataIndex: 'storeName',
      key: 'storeName',
      render: (v: string) => v || <Text type="secondary">—</Text>,
    },
    {
      title: t('授权状态'),
      dataIndex: 'authStatus',
      key: 'authStatus',
      render: (v: string) => <StatusTag status={v} label={t(AUTH_LABEL[v] || v)} />,
    },
    {
      title: t('有效期'),
      dataIndex: 'expiresAt',
      key: 'expiresAt',
      render: (v: string | null, row: AccountRow) => {
        if (!v) return <Text type="secondary">—</Text>;
        const date = new Date(v).toLocaleDateString('zh-CN');
        if (row.expired)
          return (
            <Tag color="error">
              {t('已过期')} · {date}
            </Tag>
          );
        if (row.expiringSoon)
          return (
            <Tag color="warning">
              {t('即将过期')} · {date}
            </Tag>
          );
        return <Text type="secondary">{date}</Text>;
      },
    },
    {
      title: t('操作'),
      key: 'action',
      render: (_: unknown, row: AccountRow) =>
        row.authStatus === 'connected' ? (
          <Text type="secondary">{t('正常')}</Text>
        ) : (
          <Tooltip title={t('真实重新授权流程将在接入生产 OpenAPI 时开放')}>
            <Button type="link" size="small" disabled aria-label={t('重新授权')}>
              {row.authStatus === 'expired' ? t('重新授权') : t('去连接')}
            </Button>
          </Tooltip>
        ),
    },
  ];

  return (
    <div style={{ maxWidth: listingTokens.contentMaxWidth, margin: '0 auto', padding: 4 }}>
      <Title level={4} style={{ marginBottom: 4 }}>
        {t('设置')}
      </Title>
      <Paragraph type="secondary" style={{ marginBottom: listingTokens.sectionGap }}>
        {t('平台账号授权、默认参数与采集 / 发布接口状态。出于安全，本页只展示授权状态，不展示任何密钥。')}
      </Paragraph>

      <Space direction="vertical" size={listingTokens.sectionGap} style={{ width: '100%' }}>
        {/* 平台账号 */}
        <Card
          title={
            <Space>
              <SafetyCertificateOutlined />
              {t('平台账号')}
            </Space>
          }
          extra={
            <Button size="small" onClick={load} loading={loading}>
              {t('刷新')}
            </Button>
          }
        >
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            message={t('凭证密钥仅保存在服务端密钥库，前端与接口均不返回；此处只反映授权状态与有效期。')}
          />
          <Table
            rowKey="id"
            size="middle"
            pagination={false}
            columns={accountColumns}
            dataSource={accounts}
            aria-label={t('平台账号授权状态')}
          />
        </Card>

        {/* 默认参数 */}
        <Card
          title={
            <Space>
              <SettingOutlined />
              {t('默认参数')}
            </Space>
          }
        >
          <Row gutter={[24, 16]}>
            <Col xs={24} md={12}>
              <Text type="secondary">{t('默认目标平台')}</Text>
              <div style={{ marginTop: 6 }}>
                <Select
                  style={{ width: '100%' }}
                  placeholder={t('选择默认目标平台')}
                  allowClear
                  value={config.defaultPlatform || undefined}
                  options={platformOptions.map((p) => ({ value: p, label: p }))}
                  onChange={(v) => saveConfig({ defaultPlatform: v || '' })}
                  aria-label={t('默认目标平台')}
                />
              </div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {t('新建发布任务时预选的目标平台。')}
              </Text>
            </Col>
            <Col xs={24} md={12}>
              <Text type="secondary">{t('默认处理规则')}</Text>
              <div style={{ marginTop: 6 }}>
                <Select
                  style={{ width: '100%' }}
                  placeholder={t('选择默认处理规则')}
                  allowClear
                  value={config.defaultRuleId || undefined}
                  options={rules.map((r) => ({ value: r.id, label: `${r.name}${r.enabled ? '' : t('（已停用）')}` }))}
                  onChange={(v) => saveConfig({ defaultRuleId: v ?? null })}
                  aria-label={t('默认处理规则')}
                />
              </div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {t('信息处理时默认套用的规则。')}
              </Text>
            </Col>
          </Row>
        </Card>

        {/* 采集与接口 */}
        <Card
          title={
            <Space>
              <CloudServerOutlined />
              {t('采集与接口')}
            </Space>
          }
        >
          <Row gutter={[24, 16]}>
            <Col xs={24} md={12}>
              <Space align="start" style={{ width: '100%', justifyContent: 'space-between' }}>
                <div>
                  <Space>
                    <CloudServerOutlined />
                    <Text strong>{t('Crawl4AI 兜底抓取')}</Text>
                    {crawl4ai.configured ? (
                      <Tag color="success">{t('已配置')}</Tag>
                    ) : (
                      <Tag color="default">{t('未配置 worker')}</Tag>
                    )}
                  </Space>
                  <Paragraph type="secondary" style={{ fontSize: 12, marginTop: 6, marginBottom: 0, maxWidth: 460 }}>
                    {t(crawl4ai.hint)}
                  </Paragraph>
                </div>
                <Switch
                  checked={config.crawl4aiEnabled}
                  loading={saving}
                  onChange={(v) => saveConfig({ crawl4aiEnabled: v })}
                  aria-label={t('Crawl4AI 兜底抓取开关')}
                />
              </Space>
            </Col>
            <Col xs={24} md={12}>
              <Space align="start" style={{ width: '100%', justifyContent: 'space-between' }}>
                <div>
                  <Space>
                    <ApiOutlined />
                    <Text strong>{t('OpenAPI 出口 IP 白名单')}</Text>
                  </Space>
                  <Paragraph type="secondary" style={{ fontSize: 12, marginTop: 6, marginBottom: 0, maxWidth: 460 }}>
                    {t('服务器出口 IP 已在平台后台加入 OpenAPI 白名单后开启；未加白时调用会被拒绝。')}
                  </Paragraph>
                </div>
                <Switch
                  checked={config.openApiIpWhitelisted}
                  loading={saving}
                  onChange={(v) => saveConfig({ openApiIpWhitelisted: v })}
                  aria-label={t('OpenAPI IP 白名单开关')}
                />
              </Space>
            </Col>
          </Row>

          <div style={{ marginTop: 20 }}>
            <Space style={{ marginBottom: 8 }}>
              <ApiOutlined />
              <Text strong>{t('OpenAPI 状态')}</Text>
              <Tag color={openApi.mode === 'mock' ? 'blue' : 'green'}>
                {openApi.mode === 'mock' ? t('Mock 模式') : t('已接入')}
              </Tag>
            </Space>
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
              {openApi.hints.map((h, i) => (
                <Alert
                  key={i}
                  type={h.level}
                  showIcon
                  message={h.code ? `${t(h.message)}（${h.code}）` : t(h.message)}
                />
              ))}
            </Space>
          </div>
        </Card>
      </Space>
    </div>
  );
}

// 插件设置页，位于 /v/admin/settings/ai-listing，渲染在后台设置布局内，不套用 ListingShell。
export default function ListingSettingsPage() {
  return (
    <ListingPageErrorBoundary>
      <SettingsInner />
    </ListingPageErrorBoundary>
  );
}
