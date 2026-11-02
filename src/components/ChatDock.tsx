import React, { useState } from 'react';
import type { Message } from '../types';
import type { RawSseEvent } from '../api';
import ChatWindow from './ChatWindow';
import DebugPanel from './DebugPanel';
import CodeViewer from './CodeViewer';
import { useT } from '../i18n';

/**
 * ChatDock —— 右栏下部对话框（V4.1）。
 *
 * 默认视图：实时对话流（ChatWindow）+ 底部一行输入框，
 * 可对当前 agent / 编排过程追问（走 /chat SSE，与主输入同链路）。
 * TRACE 与代码降级为附属 tab，不再占据默认视图。
 */

type DockTab = 'chat' | 'debug' | 'code';

interface Props {
  messages: Message[];
  loading: boolean;
  onSend: (text: string) => void;
  dockMode: DockTab;
  onDockModeChange: (mode: DockTab) => void;
  debugEvents: RawSseEvent[];
  onClearDebug: () => void;
}

export const ChatDock: React.FC<Props> = ({
  messages,
  loading,
  onSend,
  dockMode,
  onDockModeChange,
  debugEvents,
  onClearDebug,
}) => {
  const { lang } = useT();
  const zh = lang === 'zh';
  const [draft, setDraft] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || loading) return;
    onSend(text);
    setDraft('');
  };

  return (
    <div className="chat-dock">
      <div className="tabs" style={{ marginBottom: 8 }}>
        <button
          type="button"
          className={dockMode === 'chat' ? 'active' : ''}
          onClick={() => onDockModeChange('chat')}
        >
          {zh ? '对话' : 'CHAT'}
        </button>
        <button
          type="button"
          className={dockMode === 'debug' ? 'active' : ''}
          onClick={() => onDockModeChange('debug')}
        >
          TRACE
        </button>
        <button
          type="button"
          className={dockMode === 'code' ? 'active' : ''}
          onClick={() => onDockModeChange('code')}
        >
          {zh ? '代码' : 'CODE'}
        </button>
      </div>

      <div className="chat-dock-body">
        {dockMode === 'code' ? (
          <CodeViewer />
        ) : dockMode === 'debug' ? (
          <DebugPanel events={debugEvents} onClear={onClearDebug} />
        ) : (
          <ChatWindow messages={messages} loading={loading} />
        )}
      </div>

      {dockMode === 'chat' && (
        <form className="chat-inputrow" onSubmit={submit}>
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={zh ? '追问当前智能体，如：为什么黄灯？' : 'Ask about this agent…'}
            disabled={loading}
            aria-label={zh ? '追问输入框' : 'follow-up input'}
          />
          <button type="submit" disabled={loading || !draft.trim()}>
            {zh ? '发送' : 'Send'}
          </button>
        </form>
      )}
    </div>
  );
};

export default ChatDock;
