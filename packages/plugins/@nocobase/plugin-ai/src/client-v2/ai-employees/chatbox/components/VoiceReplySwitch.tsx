/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// 语音回复开关(仅全模态 omni 模型可见):开启后回复为 文字(transcript)+ 音频气泡。
// Phase 6 将把"是否支持语音输出"改为读服务端能力注册中心,当前以模型名 omni 启发式判断。

import React, { useEffect } from 'react';
import { Button, Tooltip } from 'antd';
import { CustomerServiceOutlined } from '@ant-design/icons';
import { observer } from '@nocobase/flow-engine';
import { useT } from '../../../locale';
import { useChatBoxStore } from '../stores/chat-box';
import { useChatConversationsStore } from '../stores/chat-conversations';

export const VoiceReplySwitch: React.FC<{ disabled?: boolean }> = observer(({ disabled }) => {
  const t = useT();
  const voiceReply = useChatConversationsStore.use.voiceReply();
  const setVoiceReply = useChatConversationsStore.use.setVoiceReply();
  const model = useChatBoxStore.use.model();
  const supported = /omni/i.test(model?.model || '');

  useEffect(() => {
    if (!supported && voiceReply) {
      setVoiceReply(false);
    }
  }, [supported, voiceReply, setVoiceReply]);

  if (!supported) {
    return null;
  }

  if (voiceReply) {
    return (
      <Tooltip title={t('Disable voice reply')} arrow={false}>
        <Button
          color="primary"
          variant="filled"
          icon={<CustomerServiceOutlined />}
          onClick={() => setVoiceReply(false)}
          disabled={disabled}
        />
      </Tooltip>
    );
  }

  return (
    <Tooltip title={t('Enable voice reply')} arrow={false}>
      <Button type="text" icon={<CustomerServiceOutlined />} onClick={() => setVoiceReply(true)} disabled={disabled} />
    </Tooltip>
  );
});
