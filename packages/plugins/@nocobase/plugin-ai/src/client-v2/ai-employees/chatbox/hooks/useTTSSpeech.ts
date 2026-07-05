/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// 助手回复"朗读"能力:ttsAvailable 探测(未配置 TTS 模型则隐藏按钮)+ 消息级合成播放。
// 服务端把合成结果缓存在消息 metadata,二次点击不会重复计费。

import { useApp } from '@nocobase/client-v2';
import { useEffect, useRef, useState } from 'react';

// 模块级缓存:每次页面加载只探测一次"是否配置了 TTS 模型"
let availabilityPromise: Promise<boolean> | null = null;

export function useTTSAvailable(): boolean {
  const app = useApp();
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    if (!availabilityPromise) {
      availabilityPromise = app.apiClient
        .resource('aiConversations')
        .ttsAvailable()
        .then((res: { data?: { data?: { available?: boolean } } }) => !!res?.data?.data?.available)
        .catch(() => false);
    }
    let mounted = true;
    availabilityPromise
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

export type TTSPlayState = 'idle' | 'loading' | 'playing';

export function useMessageTTS() {
  const app = useApp();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [state, setState] = useState<TTSPlayState>('idle');

  const stop = () => {
    audioRef.current?.pause();
    audioRef.current = null;
    setState('idle');
  };

  // 组件卸载时停止播放,避免残留音频
  useEffect(() => stop, []);

  const toggle = async (params: { sessionId: string; messageId: string }) => {
    if (state !== 'idle') {
      stop();
      return;
    }
    setState('loading');
    try {
      const res = await app.apiClient.resource('aiConversations').ttsMessage({ values: params });
      const url = (res as { data?: { data?: { url?: string } } })?.data?.data?.url;
      if (!url) {
        throw new Error('TTS returned no audio');
      }
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = stop;
      audio.onerror = stop;
      await audio.play();
      setState('playing');
    } catch (error) {
      stop();
      throw error;
    }
  };

  return { state, toggle, stop };
}
