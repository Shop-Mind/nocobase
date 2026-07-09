/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// 原图↔候选对比视图(内嵌候选区右栏常驻):结构性改动并排,像素级增强(hd/expand)拉帘。
// 拉帘交互 = 手柄长在帘线上直接拖(对齐阿里/用户期望),不用图下独立滑杆;支持键盘 ←→ 微调。
// 无候选时显示占位提示;只有原图时显示原图。

import React, { useRef, useState } from 'react';
import { Empty, Typography } from 'antd';

function SliderCompare({
  originalUrl,
  candidateUrl,
  maxHeight,
  t,
}: {
  originalUrl: string;
  candidateUrl: string;
  maxHeight?: number | string;
  t: (k: string) => string;
}) {
  const [percent, setPercent] = useState(50);
  const wrapRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const updateFromX = (clientX: number) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect || !rect.width) return;
    setPercent(Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100)));
  };
  return (
    // 外层只负责居中;内层 inline-block 贴合候选图实际渲染尺寸(不占满容器 → 无两侧灰条,帘线只在图内)
    <div style={{ textAlign: 'center' }}>
      <div
        ref={wrapRef}
        style={{
          position: 'relative',
          display: 'inline-block',
          maxWidth: '100%',
          verticalAlign: 'top',
          overflow: 'hidden',
          borderRadius: 8,
          background: '#f5f5f5',
          cursor: 'ew-resize',
          touchAction: 'none',
          userSelect: 'none',
        }}
        // 帘线手柄式拖动:按下即吸附到指针、随移动更新;pointer capture 保证拖出图外不丢
        onPointerDown={(e) => {
          draggingRef.current = true;
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          updateFromX(e.clientX);
        }}
        onPointerMove={(e) => {
          if (draggingRef.current) updateFromX(e.clientX);
        }}
        onPointerUp={(e) => {
          draggingRef.current = false;
          (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
        }}
      >
        <img
          src={candidateUrl}
          alt={t('Candidate')}
          style={{ display: 'block', maxWidth: '100%', ...(maxHeight ? { maxHeight } : {}) }}
          draggable={false}
        />
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', width: `${percent}%` }} aria-hidden>
          <img
            src={originalUrl}
            alt={t('Original')}
            draggable={false}
            style={{ display: 'block', width: '100%', maxWidth: 'none', height: '100%', objectFit: 'cover' }}
            // 上层原图必须与下层候选同盒:按容器宽高渲染(原图/候选同源同比例,cover 即等比铺满),裁切只发生在外层 div
            ref={(el) => {
              if (el?.parentElement?.parentElement) {
                el.style.width = `${el.parentElement.parentElement.clientWidth}px`;
              }
            }}
          />
        </div>
        {/* 帘线 + 圆形 ⇄ 手柄(键盘可 ←→ 微调) */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: `${percent}%`,
            width: 2,
            background: '#fff',
            boxShadow: '0 0 0 1px rgba(0,0,0,.12)',
          }}
        />
        <div
          role="slider"
          tabIndex={0}
          aria-label={t('Drag to compare')}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(percent)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft') setPercent((p) => Math.max(0, p - 2));
            if (e.key === 'ArrowRight') setPercent((p) => Math.min(100, p + 2));
          }}
          style={{
            position: 'absolute',
            top: '50%',
            left: `${percent}%`,
            transform: 'translate(-50%, -50%)',
            width: 36,
            height: 36,
            borderRadius: '50%',
            background: '#fff',
            boxShadow: '0 2px 8px rgba(0,0,0,.22)',
            display: 'grid',
            placeItems: 'center',
            color: '#6a5cff',
            fontSize: 15,
            fontWeight: 700,
            cursor: 'ew-resize',
          }}
        >
          ⇄
        </div>
        <span style={badge('left')}>{t('Original')}</span>
        <span style={badge('right')}>{t('Candidate')}</span>
      </div>
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
  maxHeight,
  t,
}: {
  originalUrl: string;
  candidateUrl: string;
  maxHeight?: number | string;
  t: (k: string) => string;
}) {
  const cell: React.CSSProperties = { flex: 1, minWidth: 0, textAlign: 'center' };
  const imgStyle: React.CSSProperties = {
    width: '100%',
    borderRadius: 8,
    background: '#f5f5f5',
    ...(maxHeight ? { maxHeight, objectFit: 'contain' } : {}),
  };
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
  maxHeight,
  t,
}: {
  originalUrl: string | null;
  candidateUrl: string | null;
  mode: 'side' | 'slider';
  emptyHint: string;
  // 限高(数字或 CSS 长度):大画布场景防止图片撑满整屏;缺省保持原行为
  maxHeight?: number | string;
  t: (k: string) => string;
}) {
  // 有候选:并排/拉帘对比
  if (candidateUrl && originalUrl) {
    return mode === 'slider' ? (
      <SliderCompare originalUrl={originalUrl} candidateUrl={candidateUrl} maxHeight={maxHeight} t={t} />
    ) : (
      <SideBySide originalUrl={originalUrl} candidateUrl={candidateUrl} maxHeight={maxHeight} t={t} />
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
