import React, { useEffect, useMemo, useRef } from 'react';
import type { Message, AgentOutput } from '../types';
import type { RawSseEvent } from '../api';
import AgentBoard from './AgentBoard';
import ChatDock from './ChatDock';
import { AGENT_TABS } from './AgentPane';
import { readLamp, resolveNodeState } from '../lib/pipeline';
import { useT } from '../i18n';

/**
 * AgentsView — V4.1 七 agent 工作台（agent-shell 三栏）。
 *
 *   页眉 .page-head —— 主题词左对齐 + skill/停止按钮右对齐（.page-head-tools）
 *   左 .agent-sidebar —— 七 agent-item（A1~A7 金码块 + 名称前状态灯点）
 *   中 .agent-main    —— AgentBoard 结论看板撑满（固定模板三态 + 迷你图表）
 *   右 .agent-right   —— EVIDENCE（缩高）+ ChatDock 对话框
 *                        （对话流 + 底部输入行追问；TRACE/代码为附属 tab）
 *
 * 业务逻辑（SSE 回调、agentOutputs、readLamp）全由 App.tsx 驱动。
 * dockMode：'chat' 对话（默认）/ 'debug' TRACE / 'code' 代码视图。
 */
interface Props {
  /** 页眉主题词后缀：当前选中项目名（App.tsx projectLabel） */
  activeProjectName: string;
  skillInUse: string | null;
  onStop: () => void;
  loading: boolean;
  messages: Message[];
  outputs: Record<string, AgentOutput>;
  activeAgentId: string;
  onAgentSelect: (id: string) => void;
  /** 重跑：'all' 整链重跑（重发原输入）；具体 agentId 仅重跑该智能体（App.tsx handleRerun） */
  onRerun: (target: string | 'all') => void;
  debugEvents: RawSseEvent[];
  onClearDebug: () => void;
  dockMode: 'chat' | 'code' | 'debug';
  onDockModeChange: (mode: 'chat' | 'code' | 'debug') => void;
  onSend: (text: string) => void;
}

/** 展示码：按 AGENT_TABS 执行序位次编号（第 6 位建造判别 = A6、第 7 位双层决策 = A7；id 数字 ≠ 执行序） */
function agentCode(index: number): string {
  return `A${index + 1}`;
}

export const AgentsView: React.FC<Props> = ({
  activeProjectName,
  skillInUse,
  onStop,
  loading,
  messages,
  outputs,
  activeAgentId,
  onAgentSelect,
  onRerun,
  debugEvents,
  onClearDebug,
  dockMode,
  onDockModeChange,
  onSend,
}) => {
  const { t, lang } = useT();

  // 证据链 = 排除 text_delta 噪音后的最近 30 条事件（倒序展示最新在上）
  const evidenceEvents = useMemo(() => {
    return debugEvents
      .filter((e) => e.eventType !== 'text_delta')
      .slice(-30)
      .reverse();
  }, [debugEvents]);

  // 自动跟随（V4.4.9）：运行中展板自动切到正在执行的 agent。
  // runningId = DAG 判定的首个 running 环节；用户手动点选某 agent 后本轮
  // 不再抢跳（视口交还给用户），下一轮流水线启动时自动恢复跟随。
  const runningId = useMemo(() => {
    if (!loading) return null;
    for (const a of AGENT_TABS) {
      if (resolveNodeState(a.id, (id) => Boolean(outputs[id]), loading) === 'running') return a.id;
    }
    return null;
  }, [outputs, loading]);

  const autoFollowRef = useRef(true);
  const wasLoadingRef = useRef(false);
  useEffect(() => {
    if (loading && !wasLoadingRef.current) autoFollowRef.current = true;
    wasLoadingRef.current = loading;
  }, [loading]);

  useEffect(() => {
    if (loading && autoFollowRef.current && runningId && runningId !== activeAgentId) {
      onAgentSelect(runningId);
    }
  }, [loading, runningId, activeAgentId, onAgentSelect]);

  const handleAgentSelect = (id: string) => {
    if (loading) autoFollowRef.current = false;
    onAgentSelect(id);
  };

  // agent-screen：锁定视口高度，内容只在面板内滚动，页面本身不延伸
  return (
    <section className="screen active agent-screen">
      <div className="shell">
        {/* —— 页眉：主题词左对齐 + 功能按钮右对齐，三屏高度与位置统一 —— */}
        <div className="page-head">
          <div>
            <h1>
              {t('agents.title')}
              <span className="page-head-proj">——{activeProjectName}</span>
            </h1>
            <p>Seven-Agent Workspace</p>
          </div>
          <div className="page-head-tools">
            {/* 重跑菜单：details 原生展开；运行中隐藏（停止按钮占位该区域） */}
            {!loading && (
              <details className="rerun-menu">
                <summary className="rerun-btn" aria-label={lang === 'zh' ? '重跑智能体' : 'Rerun agent'}>
                  ↻ {lang === 'zh' ? '重跑' : 'Rerun'}
                </summary>
                <div
                  className="rerun-pop"
                  onClick={(e) => {
                    // 选中即收起：从点击项向上找 details 关闭
                    const menu = (e.target as HTMLElement).closest('details');
                    if (menu) menu.removeAttribute('open');
                  }}
                >
                  <button type="button" className="rerun-item all" onClick={() => onRerun('all')}>
                    ↻ {lang === 'zh' ? '全部重跑' : 'Rerun all'}
                  </button>
                  {AGENT_TABS.map(a => (
                    <button key={a.id} type="button" className="rerun-item" onClick={() => onRerun(a.id)}>
                      ↻ {lang === 'zh' ? `重跑 ${a.name}` : `Rerun ${a.name}`}
                    </button>
                  ))}
                </div>
              </details>
            )}
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
                // 运行态由 DAG 判定：loading 中 + 本环节无输出 + 上游全部完成
                const state = resolveNodeState(a.id, (id) => Boolean(outputs[id]), loading);
                const running = state === 'running';
                return (
                  <button
                    key={a.id}
                    type="button"
                    className={`agent-item ${activeAgentId === a.id ? 'active' : ''} ${running ? 'running' : ''}`}
                    onClick={() => handleAgentSelect(a.id)}
                    aria-pressed={activeAgentId === a.id}
                    title={out ? `${a.name} · 已完成` : running ? `${a.name} · 执行中` : `${a.name} · 待命`}
                  >
                    <span className={`agent-code ${lamp === 'green' ? 'done' : ''}`}>{agentCode(i)}</span>
                    <span style={{ minWidth: 0 }}>
                      <span className="agent-label">
                        <i className={`agent-dot ${lamp ?? ''} ${running ? 'running' : ''}`} aria-hidden="true" />
                        {a.name}
                        {out && lamp && !running && <i className={`agent-lampdot ${lamp}`} aria-hidden="true" />}
                      </span>
                      <span className="agent-caption">
                        {running
                          ? (lang === 'zh' ? '正在输入' : 'typing')
                          : out
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

          {/* —— 中：结论看板（撑满，agent 信息由看板状态条承载） —— */}
          <div className="agent-main">
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
