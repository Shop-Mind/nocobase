/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// 原图↔候选对比视图(内嵌候选区右栏常驻):结构性改动并排,像素级增强(hd/expand)拉帘滑块。
// 无候选时显示占位提示;只有原图时显示原图。

import React, { useState } from 'react';
import { Empty, Slider, Typography } from 'antd';

function SliderCompare({
  originalUrl,
  candidateUrl,
  t,
}: {
  originalUrl: string;
  candidateUrl: string;
  t: (k: string) => string;
}) {
  const [percent, setPercent] = useState(50);
  return (
    <div>
      <div style={{ position: 'relative', width: '100%', overflow: 'hidden', borderRadius: 8, background: '#f5f5f5' }}>
        <img src={candidateUrl} alt={t('Candidate')} style={{ display: 'block', width: '100%' }} />
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', width: `${percent}%` }} aria-hidden>
          <img
            src={originalUrl}
            alt={t('Original')}
            style={{ display: 'block', width: '100%', maxWidth: 'none' }}
            // 上层原图必须与下层候选同宽:按容器宽度渲染,裁切只发生在外层 div
            ref={(el) => {
              if (el?.parentElement?.parentElement) {
                el.style.width = `${el.parentElement.parentElement.clientWidth}px`;
              }
            }}
          />
        </div>
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: `${percent}%`,
            width: 2,
            background: '#fff',
            boxShadow: '0 0 0 1px rgba(0,0,0,.1)',
          }}
        />
        <span style={badge('left')}>{t('Original')}</span>
        <span style={badge('right')}>{t('Candidate')}</span>
      </div>
      <Slider
        value={percent}
        onChange={setPercent}
        tooltip={{ open: false }}
        aria-label={t('Drag to compare')}
        style={{ marginTop: 10 }}
      />
    </div>
  );
}

function badge(side: 'left' | 'right'): React.CSSProperties {
  return {
    position: 'absolute',
    [side]: 8,
    top: 8,
    background: side === 'left' ? 'rgba(20,18,30,.5)' : 'linear-gradient(120deg,#7a5cff,#ff6a4d)',
    color: '#fff',
    padding: '2px 9px',
    borderRadius: 20,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '.4px',
    backdropFilter: 'blur(3px)',
  } as React.CSSProperties;
}

function SideBySide({
  originalUrl,
  candidateUrl,
  t,
}: {
  originalUrl: string;
  candidateUrl: string;
  t: (k: string) => string;
}) {
  const cell: React.CSSProperties = { flex: 1, minWidth: 0, textAlign: 'center' };
  const imgStyle: React.CSSProperties = { width: '100%', borderRadius: 8, background: '#f5f5f5' };
  return (
    <div style={{ display: 'flex', gap: 12 }}>
      <figure style={{ ...cell, margin: 0 }}>
        <img src={originalUrl} alt={t('Original')} style={imgStyle} />
        <figcaption>
          <Typography.Text type="secondary">{t('Original')}</Typography.Text>
        </figcaption>
      </figure>
      <figure style={{ ...cell, margin: 0 }}>
        <img src={candidateUrl} alt={t('Candidate')} style={imgStyle} />
        <figcaption>
          <Typography.Text strong>{t('Candidate')}</Typography.Text>
        </figcaption>
      </figure>
    </div>
  );
}

export function CompareView({
  originalUrl,
  candidateUrl,
  mode,
  emptyHint,
  t,
}: {
  originalUrl: string | null;
  candidateUrl: string | null;
  mode: 'side' | 'slider';
  emptyHint: string;
  t: (k: string) => string;
}) {
  // 有候选:并排/拉帘对比
  if (candidateUrl && originalUrl) {
    return mode === 'slider' ? (
      <SliderCompare originalUrl={originalUrl} candidateUrl={candidateUrl} t={t} />
    ) : (
      <SideBySide originalUrl={originalUrl} candidateUrl={candidateUrl} t={t} />
    );
  }
  // 只有原图:展示原图 + 提示
  if (originalUrl) {
    return (
      <div style={{ textAlign: 'center' }}>
        <img
          src={originalUrl}
          alt={t('Original')}
          style={{ maxWidth: '100%', maxHeight: 320, borderRadius: 8, background: '#f5f5f5' }}
        />
        <div style={{ marginTop: 8 }}>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {emptyHint}
          </Typography.Text>
        </div>
      </div>
    );
  }
  return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyHint} />;
}
