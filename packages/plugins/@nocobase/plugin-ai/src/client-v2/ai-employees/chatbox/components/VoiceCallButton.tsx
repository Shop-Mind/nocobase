/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// 实时语音通话入口(Phase 8,业界范式:与听写分离的独立"通话"图标):
// HTTP 换一次性票据 → 连服务端中继 /ws/ai-realtime →(OpenAI Realtime 兼容协议)
// 麦克风 16kHz PCM16 持续上行,response.audio.delta(24kHz PCM16)排队播放,
// 助手字幕实时上屏;检测到用户开口(speech_started)立即清空本地播放队列实现打断。
// 未配置 realtime 模型(env AI_REALTIME_MODEL 或启用模型含 realtime)时按钮不渲染。

import React, { useEffect, useRef, useState } from 'react';
import { App as AntdApp, Button, Modal, Tag, theme, Tooltip, Typography } from 'antd';
import { PhoneOutlined } from '@ant-design/icons';
import { useApp } from '@nocobase/client-v2';
import { useT } from '../../../locale';

let realtimeAvailabilityPromise: Promise<boolean> | null = null;

function useRealtimeAvailable(): boolean {
  const app = useApp();
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia || !window.WebSocket) {
      return;
    }
    if (!realtimeAvailabilityPromise) {
      realtimeAvailabilityPromise = app.apiClient
        .resource('aiConversations')
        .realtimeAvailable()
        .then((res: { data?: { data?: { available?: boolean } } }) => !!res?.data?.data?.available)
        .catch(() => false);
    }
    let mounted = true;
    realtimeAvailabilityPromise
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

type CallStatus = 'idle' | 'connecting' | 'active' | 'ended';

interface TranscriptLine {
  key: number;
  text: string;
}

// float32(源采样率)→ 16kHz PCM16 base64:线性插值降采样,分帧上行
function encodePCM16Base64(input: Float32Array, fromRate: number, toRate = 16000): string {
  const ratio = fromRate / toRate;
  const length = Math.floor(input.length / ratio);
  const bytes = new Uint8Array(length * 2);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < length; i++) {
    const position = i * ratio;
    const index = Math.floor(position);
    const next = Math.min(index + 1, input.length - 1);
    const sample = input[index] + (input[next] - input[index]) * (position - index);
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  }
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export const VoiceCallButton: React.FC<{ disabled?: boolean }> = ({ disabled }) => {
  const t = useT();
  const app = useApp();
  const { token } = theme.useToken();
  const { message: antdMessage } = AntdApp.useApp();
  const available = useRealtimeAvailable();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<CallStatus>('idle');
  const [model, setModel] = useState('');
  const [lines, setLines] = useState<TranscriptLine[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const captureCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const playbackCtxRef = useRef<AudioContext | null>(null);
  const playCursorRef = useRef(0);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const lineKeyRef = useRef(0);

  const stopPlayback = () => {
    for (const source of activeSourcesRef.current) {
      try {
        source.stop();
      } catch {
        // 已结束的 source 忽略
      }
    }
    activeSourcesRef.current = [];
    playCursorRef.current = 0;
  };

  const cleanup = () => {
    wsRef.current?.close();
    wsRef.current = null;
    processorRef.current?.disconnect();
    processorRef.current = null;
    micStreamRef.current?.getTracks().forEach((track) => track.stop());
    micStreamRef.current = null;
    captureCtxRef.current?.close().catch(() => {});
    captureCtxRef.current = null;
    stopPlayback();
    playbackCtxRef.current?.close().catch(() => {});
    playbackCtxRef.current = null;
  };

  useEffect(() => cleanup, []);

  const playAudioDelta = (base64: string) => {
    const ctx = playbackCtxRef.current;
    if (!ctx) return;
    const binary = atob(base64);
    const samples = new Int16Array(binary.length / 2);
    const view = new DataView(new ArrayBuffer(binary.length));
    for (let i = 0; i < binary.length; i++) view.setUint8(i, binary.charCodeAt(i));
    for (let i = 0; i < samples.length; i++) samples[i] = view.getInt16(i * 2, true);
    const buffer = ctx.createBuffer(1, samples.length, 24000);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) channel[i] = samples[i] / 0x8000;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    const startAt = Math.max(ctx.currentTime, playCursorRef.current);
    source.start(startAt);
    playCursorRef.current = startAt + buffer.duration;
    activeSourcesRef.current.push(source);
    source.onended = () => {
      activeSourcesRef.current = activeSourcesRef.current.filter((item) => item !== source);
    };
  };

  const appendTranscript = (delta: string) => {
    setLines((previous) => {
      if (!previous.length) return [{ key: ++lineKeyRef.current, text: delta }];
      const last = previous[previous.length - 1];
      return [...previous.slice(0, -1), { ...last, text: last.text + delta }];
    });
  };

  const newTranscriptLine = () => {
    setLines((previous) => [...previous, { key: ++lineKeyRef.current, text: '' }]);
  };

  const startCall = async () => {
    setLines([]);
    setStatus('connecting');
    try {
      const res = await app.apiClient.resource('aiConversations').realtimeSession();
      const session = (res as { data?: { data?: { ticket?: string; path?: string; model?: string } } })?.data?.data;
      if (!session?.ticket) throw new Error('no ticket');
      setModel(session.model || '');

      const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${protocol}://${window.location.host}${session.path}?ticket=${session.ticket}`);
      wsRef.current = ws;
      playbackCtxRef.current = new AudioContext({ sampleRate: 24000 });

      ws.onopen = async () => {
        ws.send(
          JSON.stringify({
            type: 'session.update',
            session: {
              modalities: ['text', 'audio'],
              voice: 'Cherry',
              input_audio_format: 'pcm16',
              output_audio_format: 'pcm16',
              turn_detection: { type: 'server_vad' },
            },
          }),
        );
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
          });
          micStreamRef.current = stream;
          const captureCtx = new AudioContext();
          captureCtxRef.current = captureCtx;
          const source = captureCtx.createMediaStreamSource(stream);
          const processor = captureCtx.createScriptProcessor(4096, 1, 1);
          processorRef.current = processor;
          processor.onaudioprocess = (event) => {
            if (ws.readyState !== WebSocket.OPEN) return;
            const audio = encodePCM16Base64(event.inputBuffer.getChannelData(0), captureCtx.sampleRate);
            ws.send(JSON.stringify({ type: 'input_audio_buffer.append', audio }));
          };
          source.connect(processor);
          processor.connect(captureCtx.destination);
          setStatus('active');
        } catch {
          antdMessage.error(t('Microphone permission denied'));
          endCall();
        }
      };

      ws.onmessage = (event) => {
        let payload: { type?: string; delta?: string; error?: { message?: string } };
        try {
          payload = JSON.parse(String(event.data));
        } catch {
          return;
        }
        switch (payload.type) {
          case 'response.audio.delta':
            if (payload.delta) playAudioDelta(payload.delta);
            break;
          case 'response.audio_transcript.delta':
            if (payload.delta) appendTranscript(payload.delta);
            break;
          case 'response.created':
            newTranscriptLine();
            break;
          case 'input_audio_buffer.speech_started':
            // 用户开口打断:立即清空本地未播完的音频
            stopPlayback();
            break;
          case 'error':
            antdMessage.error(payload.error?.message || t('Voice call failed'));
            break;
          default:
            break;
        }
      };

      ws.onclose = () => setStatus((previous) => (previous === 'idle' ? previous : 'ended'));
      ws.onerror = () => {
        antdMessage.error(t('Voice call failed'));
        endCall();
      };
    } catch (error) {
      const detail = (error as { response?: { data?: { errors?: Array<{ message?: string }> } } })?.response?.data
        ?.errors?.[0]?.message;
      antdMessage.error(detail || t('Voice call failed'));
      setStatus('idle');
    }
  };

  const endCall = () => {
    cleanup();
    setStatus('ended');
  };

  const openModal = () => {
    setOpen(true);
    startCall();
  };

  const closeModal = () => {
    cleanup();
    setStatus('idle');
    setOpen(false);
  };

  if (!available) return null;

  const statusText: Record<CallStatus, string> = {
    idle: t('Voice call'),
    connecting: t('Connecting'),
    active: t('In call, speak now'),
    ended: t('Call ended'),
  };

  return (
    <>
      <Tooltip title={t('Voice call')} arrow={false}>
        <Button
          type="text"
          aria-label={t('Voice call')}
          icon={<PhoneOutlined />}
          onClick={openModal}
          disabled={disabled}
        />
      </Tooltip>
      <Modal
        title={
          <span>
            {t('Voice call')} {model ? <Tag style={{ marginLeft: 8 }}>{model}</Tag> : null}
          </span>
        }
        open={open}
        onCancel={closeModal}
        maskClosable={false}
        footer={
          <Button danger onClick={status === 'active' || status === 'connecting' ? endCall : closeModal}>
            {status === 'active' || status === 'connecting' ? t('End call') : t('Close')}
          </Button>
        }
      >
        <Typography.Text type={status === 'active' ? 'success' : 'secondary'}>{statusText[status]}</Typography.Text>
        <div
          style={{
            marginTop: 12,
            maxHeight: 260,
            overflowY: 'auto',
            background: token.colorFillQuaternary,
            borderRadius: 8,
            padding: 12,
            minHeight: 80,
          }}
        >
          {lines.filter((line) => line.text).length ? (
            lines
              .filter((line) => line.text)
              .map((line) => (
                <Typography.Paragraph key={line.key} style={{ marginBottom: 8 }}>
                  {line.text}
                </Typography.Paragraph>
              ))
          ) : (
            <Typography.Text type="secondary">{t('Assistant transcript will appear here')}</Typography.Text>
          )}
        </div>
      </Modal>
    </>
  );
};
