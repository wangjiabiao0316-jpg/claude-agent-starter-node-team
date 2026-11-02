import React, { useMemo } from 'react';
import type { Message, AgentOutput } from '../types';
import type { RawSseEvent } from '../api';
import AgentBoard from './AgentBoard';
import ChatDock from './ChatDock';
import { AGENT_TABS } from './AgentPane';
import { readLamp } from '../lib/pipeline';
import { useT } from '../i18n';

/**
 * AgentsView — V4.1 七 agent 工作台（agent-shell 三栏）。
 *
 *   页眉 .page-head —— 主题词左对齐 + skill/停止按钮右对齐（.page-head-tools）
 *   左 .agent-sidebar —— 七 agent-item（A1~A7 金码块 + 名称前状态灯点）
 *   中 .agent-main    —— agent-banner（选中 agent 大标题+灯）
 *                        + AgentBoard 结论看板（输入/输出/判定三段，不滚动；
 *                          运行中显示 per-agent 小动效）
 *   右 .agent-right   —— EVIDENCE（缩高）+ ChatDock 对话框
 *                        （对话流 + 底部输入行追问；TRACE/代码为附属 tab）
 *
 * 业务逻辑（SSE 回调、agentOutputs、readLamp）全由 App.tsx 驱动。
 * dockMode：'chat' 对话（默认）/ 'debug' TRACE / 'code' 代码视图。
 */
interface Props {
  skillInUse: string | null;
  onStop: () => void;
  loading: boolean;
  messages: Message[];
  outputs: Record<string, AgentOutput>;
  activeAgentId: string;
  onAgentSelect: (id: string) => void;
  debugEvents: RawSseEvent[];
  onClearDebug: () => void;
  dockMode: 'chat' | 'code' | 'debug';
  onDockModeChange: (mode: 'chat' | 'code' | 'debug') => void;
  onSend: (text: string) => void;
}

/** agent id → 展示码（agent1-固有对象 → A1；编号取自 id，与后端 stage 编号一致） */
function agentCode(id: string, index: number): string {
  const m = /^agent(\d+)/.exec(id);
  return `A${m ? m[1] : index + 1}`;
}

export const AgentsView: React.FC<Props> = ({
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
  onSend,
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

  // agent-screen：锁定视口高度，内容只在面板内滚动，页面本身不延伸
  return (
    <section className="screen active agent-screen">
      <div className="shell">
        {/* —— 页眉：主题词左对齐 + 功能按钮右对齐，三屏高度与位置统一 —— */}
        <div className="page-head">
          <div>
            <h1>{t('agents.title')}</h1>
            <p>Seven-Agent Workspace</p>
          </div>
          <div className="page-head-tools">
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
                    <span className={`agent-code ${lamp === 'green' ? 'done' : ''}`}>{agentCode(a.id, i)}</span>
                    <span style={{ minWidth: 0 }}>
                      <span className="agent-label">
                        <i className={`agent-dot ${lamp ?? ''}`} aria-hidden="true" />
                        {a.name}
                      </span>
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

          {/* —— 中：选中 agent banner + 结论看板 —— */}
          <div className="agent-main">
            <div className="panel agent-banner">
              <div style={{ minWidth: 0 }}>
                <p className="eyebrow">AGENT WORKSPACE · {agentCode(activeAgentId, AGENT_TABS.findIndex((a) => a.id === activeAgentId))}</p>
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
              <AgentBoard
                outputs={outputs}
                messages={messages}
                loading={loading}
                activeAgentId={activeAgentId}
              />
            </div>
          </div>

          {/* —— 右：证据链（缩高）+ 对话框 —— */}
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
              <ChatDock
                messages={messages}
                loading={loading}
                onSend={onSend}
                dockMode={dockMode}
                onDockModeChange={onDockModeChange}
                debugEvents={debugEvents}
                onClearDebug={onClearDebug}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default AgentsView;
