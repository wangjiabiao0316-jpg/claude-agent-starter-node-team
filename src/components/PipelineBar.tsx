import React from 'react';
import type { AgentOutput } from '../types';
import { readLamp, resolveNodeState } from '../lib/pipeline';
import styles from './PipelineBar.module.css';

/**
 * PipelineBar — 6-agent orchestration visualiser.
 *
 * Layout mirrors the super-skill call graph:
 *   agent1 ∥ agent2 → agent3 → agent4 → agent5 → agent6
 *
 * Node states:
 *   standby — dim, waiting for the orchestrator
 *   running — streaming && upstream satisfied && no output yet (breathing)
 *   done    — agent_output received; tinted by output_json.灯色 when present
 *
 * Clicking a node asks the parent to focus that agent in the dock.
 */

interface AgentMeta {
  id: string;
  short: string;   // e.g. "agent1"
  label: string;   // e.g. "固有对象"
  emoji: string;
}

const AGENTS: AgentMeta[] = [
  { id: 'agent1-固有对象', short: 'agent1', label: '固有对象', emoji: '🏠' },
  { id: 'agent2-政策应答', short: 'agent2', label: '政策应答', emoji: '📑' },
  { id: 'agent3-多元融资', short: 'agent3', label: '多元融资', emoji: '💰' },
  { id: 'agent4-财务模型', short: 'agent4', label: '财务模型', emoji: '📊' },
  { id: 'agent5-失败案例', short: 'agent5', label: '失败案例', emoji: '⚠️' },
  { id: 'agent6-双层决策', short: 'agent6', label: '双层决策', emoji: '🚦' },
];

interface Props {
  outputs: Record<string, AgentOutput>;
  activeAgentId: string;
  streaming: boolean;
  onSelect: (agentId: string) => void;
}

export const PipelineBar: React.FC<Props> = ({ outputs, activeAgentId, streaming, onSelect }) => {
  const stateOf = (id: string) => resolveNodeState(id, agentId => Boolean(outputs[agentId]), streaming);

  const renderNode = (meta: AgentMeta) => {
    const state = stateOf(meta.id);
    const lamp = readLamp(outputs[meta.id]?.output_json);
    const cls = [
      styles.node,
      state === 'running' ? styles.nodeRunning : '',
      state === 'done' ? styles.nodeDone : '',
      lamp === 'green' ? styles.lampGreen : '',
      lamp === 'yellow' ? styles.lampYellow : '',
      lamp === 'red' ? styles.lampRed : '',
      activeAgentId === meta.id ? styles.nodeActive : '',
    ].filter(Boolean).join(' ');

    return (
      <button
        key={meta.id}
        type="button"
        className={cls}
        onClick={() => onSelect(meta.id)}
        title={`${meta.short} · ${meta.label}${state === 'done' ? '（已完成，点击查看输出）' : state === 'running' ? '（运行中…）' : '（待命）'}`}
      >
        <span className={styles.nodeDot} />
        <span className={styles.nodeText}>
          <span className={styles.nodeShort}>{meta.short}</span>
          <span className={styles.nodeLabel}>{meta.emoji} {meta.label}</span>
        </span>
      </button>
    );
  };

  /** Connector between pipeline phases — flows while the next phase runs. */
  const renderConnector = (nextId: string, key: string) => {
    const flowing = stateOf(nextId) === 'running';
    const lit = Boolean(outputs[nextId]);
    return (
      <span
        key={key}
        className={`${styles.connector} ${flowing ? styles.connectorFlow : ''} ${lit ? styles.connectorLit : ''}`}
      />
    );
  };

  return (
    <div className={styles.bar} role="group" aria-label="六智能体编排流水线">
      <div className={styles.parallelGroup}>
        <span className={styles.parallelBracket} />
        <div className={styles.parallelStack}>
          {renderNode(AGENTS[0])}
          {renderNode(AGENTS[1])}
        </div>
      </div>
      {renderConnector(AGENTS[2].id, 'c2')}
      {renderNode(AGENTS[2])}
      {renderConnector(AGENTS[3].id, 'c3')}
      {renderNode(AGENTS[3])}
      {renderConnector(AGENTS[4].id, 'c4')}
      {renderNode(AGENTS[4])}
      {renderConnector(AGENTS[5].id, 'c5')}
      {renderNode(AGENTS[5])}
    </div>
  );
};

export default PipelineBar;
