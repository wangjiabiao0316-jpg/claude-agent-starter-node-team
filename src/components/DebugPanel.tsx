import { useEffect, useRef } from 'react';
import type { RawSseEvent } from '../api';
import { useT } from '../i18n';

/**
 * DebugPanel — SSE 原始事件流（V4.0 .trace-item / .trace-dot 体系）。
 *
 * 每个事件渲染为一行：时间戳（tabular-nums）+ 状态点 + 事件摘要。
 * 状态点颜色（.trace-dot）：
 *   agent_output / report_ready 等产出事件 → 绿
 *   error / abort 类事件                     → 警示金
 *   其余过程事件（text_delta / tool 等）       → 灰
 *
 * 事件摘要取 data 的关键标识（agent_id / type / 工具名），原始 JSON 折叠。
 */

interface Props {
  events: RawSseEvent[];
  onClear: () => void;
}

type DotKind = '' | 'warn' | 'idle';

function classifyEvent(evt: RawSseEvent): DotKind {
  const t = evt.eventType;
  if (t === 'error' || t === 'abort' || t === 'interrupt') return 'warn';
  if (t === 'agent_output' || t === 'report_ready' || t === 'suggest_actions' || t === 'image') return '';
  return 'idle';
}

/** 从 data 里提取一行人类可读摘要（不同事件取不同字段，兜底取前 80 字符）。 */
function summarize(evt: RawSseEvent): string {
  if (typeof evt.data === 'object' && evt.data !== null) {
    const d = evt.data as Record<string, unknown>;
    if (typeof d.agent_id === 'string') return `${evt.eventType} · ${d.agent_id}`;
    if (typeof d.tool === 'string') return `${evt.eventType} · ${d.tool}`;
    if (typeof d.type === 'string') return `${evt.eventType} · ${d.type}`;
    if (typeof d.action === 'string') return `${evt.eventType} · ${d.action}`;
  }
  const raw = typeof evt.data === 'object' ? JSON.stringify(evt.data) : String(evt.raw ?? '');
  const oneLine = raw.replace(/\s+/g, ' ').trim();
  return `${evt.eventType}${oneLine ? ` · ${oneLine.slice(0, 72)}` : ''}`;
}

export default function DebugPanel({ events, onClear }: Props) {
  const { t, lang } = useT();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [events]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
      <div className="panel-head">
        <div>
          <div className="panel-title">{t('debug.title')}</div>
          <div className="panel-sub">{events.length} {t('debug.events')}</div>
        </div>
        <button type="button" className="btn ghost" style={{ padding: '5px 10px', fontSize: 10 }} onClick={onClear}>
          {t('debug.clear')}
        </button>
      </div>

      <div className="trace-list" ref={scrollRef} style={{ flex: 1 }}>
        {events.length === 0 && (
          <div className="wx-empty" style={{ minHeight: 160 }}>
            <p style={{ fontSize: 10, color: 'var(--muted)', lineHeight: 1.8, margin: 0 }}>
              {t('debug.empty')}<br />{t('debug.emptyHint')}
            </p>
          </div>
        )}

        {events.map((evt, i) => (
          <details key={i} className="trace-item" style={{ display: 'block', padding: '8px 0' }}>
            <summary style={{ display: 'grid', gridTemplateColumns: '52px 12px minmax(0,1fr)', gap: 8, cursor: 'pointer', listStyle: 'none' }}>
              <span className="trace-time">
                {new Date(evt.timestamp).toLocaleTimeString(lang === 'zh' ? 'zh-CN' : 'en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
              <span className={`trace-dot ${classifyEvent(evt)}`} aria-hidden="true" />
              <span className="trace-text">{summarize(evt)}</span>
            </summary>
            <pre className="agentpane-json" style={{ marginTop: 6, maxHeight: 180 }}>
              {typeof evt.data === 'object' ? JSON.stringify(evt.data, null, 2) : evt.raw}
            </pre>
          </details>
        ))}
      </div>
    </div>
  );
}
