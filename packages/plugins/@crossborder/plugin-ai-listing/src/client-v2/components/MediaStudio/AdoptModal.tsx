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
import { Alert, Modal, Radio, Space, Typography } from 'antd';
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
          <div>
            <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
              {t('Select the image to replace')}
            </Typography.Text>
            {/* 缩略图网格:一眼看清替换的是哪张(替代原来只显示 #ID 的下拉);点选高亮 */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: 8,
                maxHeight: 264,
                overflowY: 'auto',
                paddingRight: 2,
              }}
            >
              {gallery.map((g) => {
                const on = replaceAssetId === g.id;
                return (
                  <div
                    key={g.id}
                    role="button"
                    tabIndex={0}
                    aria-pressed={on}
                    onClick={() => setReplaceAssetId(g.id)}
                    onKeyDown={(e) => (e.key === 'Enter' ? setReplaceAssetId(g.id) : undefined)}
                    title={`#${g.id}${g.role ? ` · ${g.role}` : ''}`}
                    style={{
                      position: 'relative',
                      aspectRatio: '1 / 1',
                      borderRadius: 8,
                      overflow: 'hidden',
                      cursor: 'pointer',
                      border: on ? '2px solid #1677ff' : '1px solid #e5e7eb',
                      boxShadow: on ? '0 0 0 2px rgba(22,119,255,.15)' : 'none',
                      background: '#f4f5f7',
                    }}
                  >
                    {g.url ? (
                      <img
                        src={g.url}
                        alt={String(g.role || g.id)}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : null}
                    <span
                      style={{
                        position: 'absolute',
                        left: 4,
                        top: 4,
                        fontSize: 9,
                        color: '#fff',
                        borderRadius: 3,
                        padding: '0 4px',
                        lineHeight: '15px',
                        background: g.role === 'main' ? '#faad14' : '#40a9ff',
                      }}
                    >
                      {g.role === 'main' ? t('Main') : t('Detail')}
                    </span>
                    {on ? (
                      <span
                        aria-hidden
                        style={{
                          position: 'absolute',
                          right: 4,
                          top: 4,
                          width: 16,
                          height: 16,
                          borderRadius: 4,
                          background: '#1677ff',
                          color: '#fff',
                          fontSize: 11,
                          lineHeight: '16px',
                          textAlign: 'center',
                        }}
                      >
                        ✓
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
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
