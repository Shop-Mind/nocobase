/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// 采纳候选图:默认「追加为新详情图」;「替换指定图」需二次确认(被替换原图不删除、仅移出发布集)。
// 替换主图额外提示平台白底合规规则。安全铁律:采纳是用户显式动作,服务端置 finalSelected + 审计 actorType=user。

import React, { useState } from 'react';
import { Alert, Modal, Radio, Select, Space, Typography } from 'antd';
import type { MediaAsset } from './types';

export interface AdoptChoice {
  mode: 'append' | 'replace';
  replaceAssetId?: number;
}

export function AdoptModal({
  candidate,
  gallery,
  onConfirm,
  onClose,
  t,
  loading,
}: {
  candidate: MediaAsset | null;
  gallery: MediaAsset[];
  onConfirm: (choice: AdoptChoice) => void;
  onClose: () => void;
  t: (k: string) => string;
  loading?: boolean;
}) {
  const [mode, setMode] = useState<'append' | 'replace'>('append');
  const [replaceAssetId, setReplaceAssetId] = useState<number | undefined>(undefined);

  const replaceTarget = gallery.find((g) => g.id === replaceAssetId);
  const replacingMain = replaceTarget?.role === 'main';
  const canConfirm = mode === 'append' || Boolean(replaceAssetId);

  return (
    <Modal
      open={Boolean(candidate)}
      onCancel={onClose}
      onOk={() => onConfirm({ mode, replaceAssetId: mode === 'replace' ? replaceAssetId : undefined })}
      okButtonProps={{ disabled: !canConfirm, loading }}
      okText={t('Adopt')}
      cancelText={t('Cancel')}
      title={t('Adopt candidate image')}
      destroyOnClose
    >
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        {candidate?.url ? (
          <img
            src={candidate.url}
            alt={t('Candidate')}
            style={{ width: 160, borderRadius: 8, background: '#f5f5f5', display: 'block', margin: '0 auto' }}
          />
        ) : null}
        <Radio.Group value={mode} onChange={(e) => setMode(e.target.value)} style={{ width: '100%' }}>
          <Space direction="vertical">
            <Radio value="append">
              <Typography.Text strong>{t('Append as new image')}</Typography.Text>
              <br />
              <Typography.Text type="secondary">{t('Adds to the end of the image set')}</Typography.Text>
            </Radio>
            <Radio value="replace">
              <Typography.Text strong>{t('Replace an existing image')}</Typography.Text>
              <br />
              <Typography.Text type="secondary">
                {t('The replaced image is kept but removed from publishing')}
              </Typography.Text>
            </Radio>
          </Space>
        </Radio.Group>
        {mode === 'replace' ? (
          <Select
            style={{ width: '100%' }}
            placeholder={t('Select the image to replace')}
            value={replaceAssetId}
            onChange={setReplaceAssetId}
            options={gallery.map((g) => ({
              value: g.id,
              label: `${g.role === 'main' ? '★ ' : ''}#${g.id}${g.role ? ` (${g.role})` : ''}`,
            }))}
          />
        ) : null}
        {replacingMain ? (
          <Alert
            type="warning"
            showIcon
            message={t('Replacing the main image: ensure it meets the platform pure-white-background rule')}
          />
        ) : null}
      </Space>
    </Modal>
  );
}
