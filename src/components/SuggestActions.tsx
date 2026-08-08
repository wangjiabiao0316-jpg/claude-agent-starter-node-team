import React from 'react';
import type { SuggestAction } from '../types';

interface Props {
  actions: SuggestAction[];
  onClick: (action: SuggestAction) => void;
}

/**
 * Phase 4 Task 10 — Suggested-action button group.
 *
 * Rendered below the chat input after the super-skill orchestrator completes
 * (SSE event `suggest_actions`, fired by `super-skill.complete` tool).
 *
 * Typical button set (7 total):
 *   - view_agent1-固有对象 / view_agent2-政策应答 / ... view_agent5-失败案例
 *   - export_report
 *   - rerun_agent
 *
 * Click handler lives in the parent (App.tsx) so it can wire to the right
 * state mutators (setActiveTab / trigger export / re-run).
 */
export const SuggestActions: React.FC<Props> = ({ actions, onClick }) => {
  if (!actions || actions.length === 0) return null;

  return (
    <div
      className="suggest-actions"
      style={{
        display: 'flex',
        gap: '8px',
        flexWrap: 'wrap',
        marginTop: '12px',
        padding: '8px',
      }}
    >
      {actions.map(a => (
        <button
          key={a.id}
          type="button"
          onClick={() => onClick(a)}
          title={a.description}
          style={{
            padding: '8px 12px',
            borderRadius: '8px',
            border: '1px solid #ddd',
            cursor: 'pointer',
            background: '#fff',
            fontSize: '13px',
            transition: 'background 0.15s ease',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.background = '#f5f5f5';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.background = '#fff';
          }}
        >
          <span style={{ marginRight: '6px' }}>{a.emoji}</span>
          {a.title}
        </button>
      ))}
    </div>
  );
};

export default SuggestActions;
