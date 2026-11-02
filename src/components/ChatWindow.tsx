import { useEffect, useRef } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Message, ImageAttachment } from '../types';
import { useT } from '../i18n';

/**
 * ChatWindow — 实时执行流（V4.0 .stream-feed / .stream-msg 体系）。
 *
 * 原 ChatBubble 组件的职责内联至此（V4.0 单卡流式视觉，无头像气泡对）：
 *   - user 消息：金 role-line + 深底卡
 *   - assistant 消息：md 卡（react-markdown + 紧凑表格归一化）+ 图片列表
 *   - web_search activity 行（含 WSA 缺失提示，保留原文案与链接）
 *   - streaming 时尾部金色 caret 闪烁；等待首 token 时 typing 条
 * 自动滚底逻辑不变（流式 instant / 完成 smooth）。
 */

/** Where the inline `WSA` link in the wsa_missing label points. */
const WSA_DOC_URL = 'https://pages.edgeone.ai/document/sandbox-network-search-tool';

function renderWsaMissingLabel(template: string) {
  const parts = template.split('{0}');
  if (parts.length !== 2) return template;
  return (
    <>
      {parts[0]}
      <a href={WSA_DOC_URL} target="_blank" rel="noreferrer noopener" style={{ color: 'var(--gold2)' }}>WSA</a>
      {parts[1]}
    </>
  );
}

const TABLE_ROW_BOUNDARY = /\|\s+\|/g;
const TABLE_SEPARATOR_ROW = /^\|\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/;

function normalizeCompactTableLine(line: string): string {
  if (!line.includes('| |')) return line;
  const pipeIndexes = [...line.matchAll(/\|/g)]
    .map((match) => match.index ?? -1)
    .filter((index) => index >= 0);
  for (const index of pipeIndexes) {
    const table = line.slice(index);
    const normalizedTable = table.replace(TABLE_ROW_BOUNDARY, '|\n|');
    const rows = normalizedTable.split('\n').map((row) => row.trim()).filter(Boolean);
    if (rows.length >= 2 && TABLE_SEPARATOR_ROW.test(rows[1])) {
      const prefix = line.slice(0, index).trimEnd();
      return prefix ? `${prefix}\n${normalizedTable}` : normalizedTable;
    }
  }
  return line;
}

function normalizeMarkdown(content: string): string {
  let inCodeFence = false;
  return content
    .split('\n')
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) {
        inCodeFence = !inCodeFence;
        return line;
      }
      return inCodeFence ? line : normalizeCompactTableLine(line);
    })
    .join('\n');
}

function getImageSrc(img: ImageAttachment | string): string {
  if (typeof img === 'string') return `data:image/png;base64,${img}`;
  return img.url || '';
}

interface Props {
  messages: Message[];
  loading: boolean;
}

export default function ChatWindow({ messages, loading }: Props) {
  const { t, lang } = useT();
  const windowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (messages.length === 0 && !loading) return;
    const el = windowRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: loading ? 'instant' : 'smooth' });
  }, [messages, loading]);

  const lastMsg = messages[messages.length - 1];
  const showTypingIndicator =
    loading && !(lastMsg?.role === 'assistant' && (lastMsg.content.length > 0 || lastMsg.activity));

  return (
    <div ref={windowRef} className="stream-feed">
      {messages.map((msg) => {
        const isUser = msg.role === 'user';
        const content = isUser ? msg.content : normalizeMarkdown(msg.content);
        const images = msg.images || [];
        const activity = msg.activity;

        if (!isUser && !msg.content && images.length === 0 && !activity) return null;

        return (
          <div key={msg.id} className={`stream-msg ${isUser ? 'user' : ''}`}>
            <div className="role-line">
              {isUser ? 'USER' : 'ORCHESTRATOR'}
              <span style={{ marginLeft: 'auto', opacity: 0.7 }}>
                {new Date(msg.timestamp).toLocaleTimeString(lang === 'zh' ? 'zh-CN' : 'en-US', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>

            {!isUser && activity?.type === 'web_search' && (
              <div
                role="status"
                aria-live="polite"
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
                  padding: '6px 0', fontSize: 10,
                  color: activity.status === 'error' ? 'var(--red)' : activity.status === 'done' ? 'var(--green)' : 'var(--muted)',
                }}
              >
                <span aria-hidden="true">🔍</span>
                <span>
                  {activity.status === 'error' && activity.errorCode === 'wsa_missing'
                    ? renderWsaMissingLabel(t('webSearch.error.wsaMissing'))
                    : activity.label}
                </span>
                {activity.status === 'error' ? (
                  <>
                    <span aria-hidden="true">⚠️</span>
                    {activity.errorCode === 'wsa_missing' && (
                      <a href={WSA_DOC_URL} target="_blank" rel="noreferrer noopener" style={{ color: 'var(--gold2)' }}>
                        {t('webSearch.error.wsaCta')} →
                      </a>
                    )}
                  </>
                ) : activity.status !== 'done' ? (
                  <span className="dim">···</span>
                ) : null}
              </div>
            )}

            {isUser ? (
              <div className="md">{content}</div>
            ) : (
              content && (
                <div className="md">
                  <Markdown remarkPlugins={[remarkGfm]}>{content}</Markdown>
                  {msg.streaming && <span className="stream-caret" aria-hidden="true" />}
                </div>
              )
            )}

            {images.length > 0 && (
              <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
                {images.map((img, idx) => {
                  const src = getImageSrc(img);
                  if (!src) return null;
                  const alt = typeof img === 'string' ? `tool result ${idx + 1}` : `screenshot ${img.id.slice(0, 8)}`;
                  return <img key={typeof img === 'string' ? idx : img.id} src={src} alt={alt} style={{ maxWidth: '100%', borderRadius: 7 }} />;
                })}
              </div>
            )}
          </div>
        );
      })}

      {showTypingIndicator && (
        <div className="stream-msg">
          <div className="role-line">ORCHESTRATOR</div>
          <div className="md dim">
            <span className="stream-caret" aria-hidden="true" />
          </div>
        </div>
      )}
    </div>
  );
}
