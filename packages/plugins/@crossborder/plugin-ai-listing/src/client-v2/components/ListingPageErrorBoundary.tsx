/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { Button, Result, Space, Typography } from 'antd';
import React from 'react';
import { useT } from '../locale';

// 渲染崩溃没有服务端 traceId，生成一个客户端引用号，并打到控制台便于联调对照。
function makeClientTraceId(): string {
  return `ui-${Math.floor(Date.now())}-${Math.floor(Math.random() * 1e6)}`;
}

const ListingErrorFallback: React.FC<{ error?: Error; traceId: string; onRetry: () => void }> = ({
  error,
  traceId,
  onRetry,
}) => {
  const t = useT();
  return (
    <Result
      status="error"
      title={t('页面出错了')}
      subTitle={t('该页面渲染时发生异常，其他菜单仍可正常使用。')}
      extra={[
        <Button type="primary" key="retry" onClick={onRetry}>
          {t('重试')}
        </Button>,
        <Button key="reload" onClick={() => window.location.reload()}>
          {t('刷新页面')}
        </Button>,
      ]}
    >
      <Space direction="vertical" size={4}>
        <Typography.Text type="secondary">
          {t('错误码')}: {error?.name || 'RENDER_ERROR'}
        </Typography.Text>
        <Typography.Text type="secondary">
          {t('下一步')}: {t('请将下方 traceId 提供给管理员排查')}
        </Typography.Text>
        <Typography.Text copyable code>
          traceId: {traceId}
        </Typography.Text>
      </Space>
    </Result>
  );
};

interface Props {
  children: React.ReactNode;
}
interface State {
  hasError: boolean;
  error?: Error;
  traceId: string;
}

// 插件范围内的页面错误边界：单个页面渲染异常时显示友好错误态，不导致整页白屏。
export class ListingPageErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, traceId: '' };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error, traceId: makeClientTraceId() };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // 结构化打印，便于在控制台用 traceId 检索；不记录敏感数据。
    // eslint-disable-next-line no-console
    console.error(`[ai-listing][${this.state.traceId}] page render error:`, error, info.componentStack);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined, traceId: '' });
  };

  render() {
    if (this.state.hasError) {
      return <ListingErrorFallback error={this.state.error} traceId={this.state.traceId} onRetry={this.handleRetry} />;
    }
    return this.props.children;
  }
}

export default ListingPageErrorBoundary;
