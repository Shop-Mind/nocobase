/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// 麦克风听写(业界范式):录音 → ASR 转文字 → 回填输入框供编辑后发送,绝不直接发送。
// 未配置 ASR 模型或浏览器不支持录音时按钮不渲染;录音上限 60 秒自动停止。

import React, { useEffect, useRef, useState } from 'react';
import { App as AntdApp, Button, theme, Tooltip } from 'antd';
import { AudioOutlined, LoadingOutlined } from '@ant-design/icons';
import { useApp } from '@nocobase/client-v2';
import { useT } from '../../../locale';
import { useChatBoxStore } from '../stores/chat-box';

// 模块级缓存:每次页面加载只探测一次"是否配置了 ASR 模型"
let asrAvailabilityPromise: Promise<boolean> | null = null;

function useASRAvailable(): boolean {
  const app = useApp();
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      return;
    }
    if (!asrAvailabilityPromise) {
      asrAvailabilityPromise = app.apiClient
        .resource('aiConversations')
        .asrAvailable()
        .then((res: { data?: { data?: { available?: boolean } } }) => !!res?.data?.data?.available)
        .catch(() => false);
    }
    let mounted = true;
    asrAvailabilityPromise
      .then((value) => {
        if (mounted) setAvailable(value);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [app]);
  return available;
}

const MAX_RECORDING_MS = 60000;

type DictationState = 'idle' | 'recording' | 'transcribing';

export const DictationButton: React.FC<{ disabled?: boolean }> = ({ disabled }) => {
  const t = useT();
  const app = useApp();
  const { token } = theme.useToken();
  const { message: antdMessage } = AntdApp.useApp();
  const available = useASRAvailable();
  const setSenderValue = useChatBoxStore.use.setSenderValue();
  const [state, setState] = useState<DictationState>('idle');
  const recorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cleanup = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    recorderRef.current?.stream?.getTracks().forEach((track) => track.stop());
    recorderRef.current = null;
  };

  useEffect(() => cleanup, []);

  const transcribe = async (blob: Blob) => {
    setState('transcribing');
    try {
      const dataUri = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
      const res = await app.apiClient.resource('aiConversations').asrTranscribe({ values: { audio: dataUri } });
      const text = (res as { data?: { data?: { text?: string } } })?.data?.data?.text?.trim();
      if (text) {
        const current = useChatBoxStore.getState().senderValue;
        setSenderValue(current ? `${current}${text}` : text);
      } else {
        antdMessage.info(t('No speech detected'));
      }
    } catch (error) {
      const detail = (error as { response?: { data?: { errors?: Array<{ message?: string }> } } })?.response?.data
        ?.errors?.[0]?.message;
      antdMessage.error(detail || (error as Error)?.message || t('Speech recognition failed'));
    } finally {
      setState('idle');
    }
  };

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => {
        if (event.data?.size) chunks.push(event.data);
      };
      recorder.onstop = () => {
        const mimeType = recorder.mimeType || 'audio/webm';
        cleanup();
        transcribe(new Blob(chunks, { type: mimeType }));
      };
      recorderRef.current = recorder;
      recorder.start();
      setState('recording');
      timerRef.current = setTimeout(() => recorderRef.current?.stop(), MAX_RECORDING_MS);
    } catch {
      antdMessage.error(t('Microphone permission denied'));
      cleanup();
      setState('idle');
    }
  };

  const toggle = () => {
    if (state === 'transcribing') return;
    if (state === 'recording') {
      recorderRef.current?.stop();
      return;
    }
    start();
  };

  if (!available) return null;

  const label = state === 'recording' ? t('Stop recording') : t('Voice input');
  return (
    <Tooltip title={state === 'transcribing' ? t('Transcribing') : label}>
      <Button
        type="text"
        aria-label={label}
        disabled={disabled}
        onClick={toggle}
        icon={
          state === 'transcribing' ? (
            <LoadingOutlined />
          ) : (
            <AudioOutlined style={state === 'recording' ? { color: token.colorError } : undefined} />
          )
        }
      />
    </Tooltip>
  );
};
