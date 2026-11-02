import React, { useMemo } from 'react';
import type { ToolLampState, Message, AgentOutput } from '../types';
import type { RawSseEvent } from '../api';
import PipelineBar from './PipelineBar';
import ChatWindow from './ChatWindow';
import { AgentPane, AGENT_TABS } from './AgentPane';
import { readLamp } from '../lib/pipeline';
import DebugPanel from './DebugPanel';
import CodeViewer from './CodeViewer';
import { useT } from '../i18n';

/**
 * AgentsView — V4.0 大气版七 agent 工作台（agent-shell 三栏）。
 *
 *   顶 .agent-topline —— 编排流水线（.pipeline）+ 工具灯 / skill / 停止按钮
 *   左 .agent-sidebar —— 七 agent-item（A1~A7 金码块，完成态灯点）
 *   中 .agent-main    —— agent-banner（选中 agent 大标题+灯）+ agent-content
 *                        （上：选中 agent 结构化输出 .agent-body（限高滚动）；
 *                         下：ChatWindow 实时 SSE 流 .stream-feed）
 *   右 .agent-right   —— EVIDENCE（非 text_delta 事件证据链）
 *                        + TRACE/代码 双 tab（DebugPanel / CodeViewer）
 *
 * 业务逻辑（SSE 回调、agentOutputs、readLamp）全由 App.tsx 驱动。
 * dockMode 语义：'code' = 右栏代码视图；'agents'/'debug' = 右栏 Trace 视图
 * （座舱职能已分布到左栏列表与中栏详情，'agents' 保留为默认值兼容 App.tsx）。
 */
interface Props {
  lamps: ToolLampState[];
  skillInUse: string | null;
  onStop: () => void;
  loading: boolean;
  messages: Message[];
  outputs: Record<string, AgentOutput>;
  activeAgentId: string;
  onAgentSelect: (id: string) => void;
  debugEvents: RawSseEvent[];
  onClearDebug: () => void;
  dockMode: 'agents' | 'code' | 'debug';
  onDockModeChange: (mode: 'agents' | 'code' | 'debug') => void;
}

/** agent 序号 → 展示码（agent1-固有对象 → A1） */
function agentCode(index: number): string {
  return `A${index + 1}`;
}

export const AgentsView: React.FC<Props> = ({
  lamps,
  skillInUse,
  onStop,
  loading,
  messages,
  outputs,
  activeAgentId,
  onAgentSelect,
  debugEvents,
  onClearDebug,
  dockMode,
  onDockModeChange,
}) => {
  const { t, lang } = useT();

  const activeMeta = AGENT_TABS.find((a) => a.id === activeAgentId) ?? AGENT_TABS[0];
  const activeOutput = outputs[activeAgentId];
  const activeLamp = readLamp(activeOutput?.output_json);

  // 证据链 = 排除 text_delta 噪音后的最近 30 条事件（倒序展示最新在上）
  const evidenceEvents = useMemo(() => {
    return debugEvents
      .filter((e) => e.eventType !== 'text_delta')
      .slice(-30)
      .reverse();
  }, [debugEvents]);

  return (
    <section className="screen active">
      <div className="shell">
        {/* —— 顶：编排流水线 + 工具状态 —— */}
        <div className="agent-topline">
          <PipelineBar
            outputs={outputs}
            activeAgentId={activeAgentId}
            streaming={loading}
            onSelect={(agentId) => {
              onAgentSelect(agentId);
              onDockModeChange('agents');
            }}
          />
          <div className="tool-lamps">
            {lamps.map((lamp) => (
              <span key={lamp.id} className={`tool-lamp ${lamp.active ? 'on' : ''}`} title={lamp.label}>
                {lamp.icon} {lamp.label}
              </span>
            ))}
            {skillInUse && <span className="skill-pill">⚡ {skillInUse}</span>}
            {loading && (
              <button type="button" className="stop-btn" onClick={onStop} aria-label={t('aria.stopGeneration')}>
                ■ {t('aria.stopGeneration')}
              </button>
            )}
          </div>
        </div>

        <div className="agent-shell">
          {/* —— 左：七 agent 列表 —— */}
          <div className="panel agent-sidebar">
            <div className="agent-sidebar-title">
              {lang === 'zh' ? 'AGENTS · 七大智能体' : 'AGENTS'}
            </div>
            <div className="agent-list">
              {AGENT_TABS.map((a, i) => {
                const out = outputs[a.id];
                const lamp = readLamp(out?.output_json);
                return (
                  <button
                    key={a.id}
                    type="button"
                    className={`agent-item ${activeAgentId === a.id ? 'active' : ''}`}
                    onClick={() => onAgentSelect(a.id)}
                    aria-pressed={activeAgentId === a.id}
                    title={out ? `${a.name} · 已完成` : `${a.name} · 待命`}
                  >
                    <span className={`agent-code ${lamp === 'green' ? 'done' : ''}`}>{agentCode(i)}</span>
                    <span>
                      <span className="agent-label">{a.name}</span>
                      <span className="agent-caption">
                        {out
                          ? lamp === 'green'
                            ? (lang === 'zh' ? '已完成 · 通过' : 'done · pass')
                            : lamp === 'yellow'
                              ? (lang === 'zh' ? '已完成 · 有条件' : 'done · conditional')
                              : lamp === 'red'
                                ? (lang === 'zh' ? '已完成 · 不通过' : 'done · blocked')
                                : (lang === 'zh' ? '已完成' : 'done')
                          : (lang === 'zh' ? '待命' : 'standby')}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>

            <hr className="rule" />
            <p className="dim" style={{ fontSize: 9, lineHeight: 1.8, margin: 0, letterSpacing: 0.5 }}>
              {t('welcome.foot')}
            </p>
          </div>

          {/* —— 中：选中 agent banner + 实时流 —— */}
          <div className="agent-main">
            <div className="panel agent-banner">
              <div style={{ minWidth: 0 }}>
                <p className="eyebrow">AGENT WORKSPACE · {agentCode(AGENT_TABS.findIndex((a) => a.id === activeAgentId))}</p>
                <h2 className="agent-title">{activeMeta.emoji} {activeMeta.name}</h2>
                <p className="agent-description">{activeMeta.role}</p>
              </div>
              {activeLamp && (
                <span className={`lamp-badge ${activeLamp}`}>
                  {activeLamp === 'green' ? (lang === 'zh' ? '绿灯 · 通过' : 'Pass') : activeLamp === 'yellow' ? (lang === 'zh' ? '黄灯 · 有条件通过' : 'Conditional') : (lang === 'zh' ? '红灯 · 不通过' : 'Blocked')}
                </span>
              )}
            </div>

            <div className="panel agent-content">
              {/* 选中 agent 已有输出：结构化详情（限高滚动） */}
              {activeOutput && (
                <div style={{ maxHeight: '44%', minHeight: 0, overflowY: 'auto', flex: 'none', display: 'flex', flexDirection: 'column' }}>
                  <AgentPane outputs={outputs} activeTab={activeAgentId} />
                </div>
              )}
              {/* 实时 SSE 流（常驻） */}
              <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', marginTop: activeOutput ? 12 : 0 }}>
                <ChatWindow messages={messages} loading={loading} />
              </div>
            </div>
          </div>

          {/* —— 右：证据链 + Trace/代码 —— */}
          <div className="agent-right">
            <div className="panel">
              <div className="panel-head">
                <div>
                  <div className="panel-title">{lang === 'zh' ? 'EVIDENCE · 执行证据' : 'EVIDENCE'}</div>
                  <div className="panel-sub">{lang === 'zh' ? '编排器事件链（最新在上）' : 'orchestrator events'}</div>
                </div>
                <span className="tag neutral">{evidenceEvents.length}</span>
              </div>
              <div style={{ overflowY: 'auto', minHeight: 0, flex: 1 }}>
                {evidenceEvents.length === 0 ? (
                  <p className="muted" style={{ fontSize: 10, lineHeight: 1.8 }}>
                    {lang === 'zh' ? '暂无证据。发送项目后，智能体的每次调用与产出都会在这里留痕。' : 'No evidence yet.'}
                  </p>
                ) : (
                  evidenceEvents.map((evt, i) => (
                    <div key={`${evt.timestamp}-${i}`} className="evidence-item">
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {evt.eventType}
                      </span>
                      <span className="trace-time">
                        {new Date(evt.timestamp).toLocaleTimeString(lang === 'zh' ? 'zh-CN' : 'en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="panel">
              <div className="tabs" style={{ marginBottom: 12 }}>
                <button
                  type="button"
                  className={dockMode !== 'code' ? 'active' : ''}
                  onClick={() => onDockModeChange('debug')}
                >
                  TRACE
                </button>
                <button
                  type="button"
                  className={dockMode === 'code' ? 'active' : ''}
                  onClick={() => onDockModeChange('code')}
                >
                  {lang === 'zh' ? '代码' : 'CODE'}
                </button>
              </div>
              {dockMode === 'code' ? <CodeViewer /> : <DebugPanel events={debugEvents} onClear={onClearDebug} />}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default AgentsView;
