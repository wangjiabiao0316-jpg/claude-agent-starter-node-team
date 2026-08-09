import React from 'react';
import type { SuggestAction } from '../types';
import styles from './SuggestActions.module.css';

interface Props {
  actions: SuggestAction[];
  onClick: (action: SuggestAction) => void;
}

/**
 * Suggested-action button group, rendered below the chat input after the
 * super-skill orchestrator completes (SSE event `suggest_actions`).
 *
 * Typical button set (7 total): view_agent1..5, export_report, rerun_agent.
 * Click handling lives in App.tsx.
 */
export const SuggestActions: React.FC<Props> = ({ actions, onClick }) => {
  if (!actions || actions.length === 0) return null;

  return (
    <div className={styles.wrap}>
      <span className={styles.label}>下一步</span>
      <div className={styles.row}>
        {actions.map(a => (
          <button
            key={a.id}
            type="button"
            className={styles.chip}
            onClick={() => onClick(a)}
            title={a.description}
          >
            {a.emoji && <span className={styles.chipEmoji}>{a.emoji}</span>}
            {a.title}
          </button>
        ))}
      </div>
    </div>
  );
};

export default SuggestActions;
