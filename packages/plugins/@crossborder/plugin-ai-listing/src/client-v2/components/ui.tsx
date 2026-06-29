/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { Alert, Button, Card, Empty, Space, Tag, Typography } from 'antd';
import React, { useState } from 'react';
import { useT } from '../locale';
import { useRequestWithFriendlyError, type FriendlyError } from './request';

// 统一设计 token：卡片圆角、留白、主体最大宽度等，供页面壳与各页面复用，保证视觉一致。
export const listingTokens = {
  contentMaxWidth: 1280,
  cardRadius: 8,
  pageGap: 16,
  sectionGap: 24,
};

// 状态值 -> 颜色，全站统一（与服务端集合枚举颜色保持一致语义）。
const STATUS_COLORS: Record<string, string> = {
  pending: 'default',
  draft: 'default',
  running: 'processing',
  capturing: 'processing',
  processing: 'gold',
  publishing: 'geekblue',
  success: 'success',
  captured: 'cyan',
  processed: 'lime',
  reviewed: 'success',
  published: 'success',
  connected: 'success',
  active: 'success',
  partial_failed: 'warning',
  expired: 'warning',
  failed: 'error',
  process_failed: 'error',
  publish_failed: 'error',
  rejected: 'error',
  disconnected: 'error',
  skipped: 'default',
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  running: 'Running',
  success: 'Success',
  failed: 'Failed',
  partial_failed: 'Partial failed',
  connected: 'Connected',
  expired: 'Expired',
  disconnected: 'Disconnected',
};

// 全站统一状态标签。
export const StatusTag: React.FC<{ status?: string; label?: string }> = ({ status, label }) => {
  const t = useT();
  if (!status) return <Tag>-</Tag>;
  const color = STATUS_COLORS[status] || 'default';
  const text = label || STATUS_LABELS[status] || status;
  return <Tag color={color}>{t(text)}</Tag>;
};

// 全站统一空态。
export const ListingEmpty: React.FC<{ description?: string; action?: React.ReactNode }> = ({ description, action }) => {
  const t = useT();
  return (
    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={description || t('暂无数据')}>
      {action}
    </Empty>
  );
};

// 仅用于自检的“炸弹”组件：当 boom=true 时在渲染期抛错，用来验证 ListingPageErrorBoundary。
const Bomb: React.FC<{ boom: boolean }> = ({ boom }) => {
  if (boom) {
    throw new Error('Simulated render error for self-check');
  }
  return null;
};

// 开发自检区：手动触发“页面渲染异常”和“API 失败”，用于验证错误边界与 requestWithFriendlyError。
const DevSelfCheck: React.FC = () => {
  const t = useT();
  const request = useRequestWithFriendlyError();
  const [boom, setBoom] = useState(false);
  const [apiError, setApiError] = useState<FriendlyError | null>(null);

  const triggerApi = async () => {
    // 故意请求一个不存在的资源，触发标准错误结构解析。
    const res = await request({ url: 'aiListingSelfCheck:fail', method: 'get' }, { silent: false });
    if (!res.ok && res.error) setApiError(res.error);
  };

  return (
    <Card size="small" type="inner" title={t('开发自检（验证错误边界与 API 错误封装，可在正式上线前移除）')}>
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <Space wrap>
          <Button danger onClick={() => setBoom(true)}>
            {t('模拟页面渲染异常')}
          </Button>
          <Button onClick={triggerApi}>{t('模拟 API 失败')}</Button>
        </Space>
        <Bomb boom={boom} />
        {apiError && (
          <Alert
            type="error"
            showIcon
            message={`${apiError.friendlyMessage}（${apiError.errorCode}）`}
            description={
              <Space direction="vertical" size={2}>
                <Typography.Text type="secondary">
                  {t('下一步')}: {apiError.nextAction}
                </Typography.Text>
                <Typography.Text type="secondary">retryable: {String(apiError.retryable)}</Typography.Text>
                <Typography.Text copyable code>
                  traceId: {apiError.traceId}
                </Typography.Text>
              </Space>
            }
          />
        )}
      </Space>
    </Card>
  );
};

// 各业务页面在 Phase 2 的占位内容：清晰空态 + 本阶段说明，并附开发自检区。
export const PagePlaceholder: React.FC<{ title: string; description: string; upcoming?: string[] }> = ({
  title,
  description,
  upcoming,
}) => {
  const t = useT();
  return (
    <Space direction="vertical" size={listingTokens.sectionGap} style={{ width: '100%' }}>
      <Card style={{ borderRadius: listingTokens.cardRadius }}>
        <ListingEmpty description={t(description)} />
        {upcoming && upcoming.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <Typography.Text strong>{t('本阶段说明')}</Typography.Text>
            <ul style={{ marginTop: 8, color: 'rgba(0,0,0,0.45)' }}>
              {upcoming.map((item) => (
                <li key={item}>{t(item)}</li>
              ))}
            </ul>
          </div>
        )}
      </Card>
      <DevSelfCheck />
      <Typography.Text type="secondary">{t(title)}</Typography.Text>
    </Space>
  );
};
