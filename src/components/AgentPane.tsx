import React from 'react';
import type { AgentOutput } from '../types';

/**
 * Phase 4 Task 10 — Right-side multi-tab pane that surfaces individual
 * sub-agent outputs (agent1 ~ agent6).
 *
 * Tabs follow the super-skill orchestrator's agent naming convention
 * (matches `detectSseEvent` regex `agent{1-6}-<中文名>` in
 * agents/chat/_stream.ts). Default tab is the synthesis agent (agent6).
 */

interface AgentTabDef {
  id: string;
  label: string;
  default?: boolean;
}

export const AGENT_TABS: AgentTabDef[] = [
  { id: 'agent6-双层决策', label: '🚦 决策', default: true },
  { id: 'agent1-固有对象', label: '🏠 agent1' },
  { id: 'agent2-政策应答', label: '📑 agent2' },
  { id: 'agent3-多元融资', label: '💰 agent3' },
  { id: 'agent4-财务模型', label: '📊 agent4' },
  { id: 'agent5-失败案例', label: '⚠️ agent5' },
];

export const DEFAULT_AGENT_TAB = AGENT_TABS.find(t => t.default)?.id ?? AGENT_TABS[0].id;

interface Props {
  outputs: Record<string, AgentOutput>;
  activeTab: string;
  onTabChange: (id: string) => void;
}

export const AgentPane: React.FC<Props> = ({ outputs, activeTab, onTabChange }) => {
  const current = outputs[activeTab];

  return (
    <aside
      style={{
        width: '380px',
        borderLeft: '1px solid #ddd',
        padding: '12px',
        overflowY: 'auto',
        background: '#fafafa',
      }}
    >
      <div
        className="tabs"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '4px',
          marginBottom: '12px',
        }}
      >
        {AGENT_TABS.map(t => {
          const hasOutput = Boolean(outputs[t.id]);
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onTabChange(t.id)}
              style={{
                padding: '4px 8px',
                background: activeTab === t.id ? '#e0e0e0' : 'transparent',
                border: '1px solid #ccc',
                borderRadius: '4px',
                cursor: 'pointer',
                opacity: hasOutput ? 1 : 0.5,
                fontSize: '12px',
              }}
              title={hasOutput ? `View ${t.id} output` : `${t.id} has no output yet`}
            >
              {t.label}
              {hasOutput && (
                <span style={{ marginLeft: 4, color: '#2c8a3a' }}>●</span>
              )}
            </button>
          );
        })}
      </div>
      <div className="output">
        {current ? (
          <>
            {current.summary && (
              <p style={{ fontSize: '13px', margin: '0 0 8px 0', color: '#333' }}>
                {current.summary}
              </p>
            )}
            <pre
              style={{
                fontSize: '12px',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                background: '#fff',
                padding: '8px',
                borderRadius: '4px',
                border: '1px solid #eee',
                margin: 0,
              }}
            >
              {JSON.stringify(current.output_json, null, 2)}
            </pre>
          </>
        ) : (
          <p style={{ color: '#999', fontSize: '13px' }}>（无输出）</p>
        )}
      </div>
    </aside>
  );
};

export default AgentPane;
