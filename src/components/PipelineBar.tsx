import React from 'react';
import type { AgentOutput } from '../types';
import { readLamp, resolveNodeState } from '../lib/pipeline';

/**
 * PipelineBar — 七 agent 编排流水线（V4.0 大气版皮肤）。
 *
 * 调用图与业务逻辑不变：
 *   agent1 ∥ agent2 → agent3 → agent4 → agent5 → agent6 → agent7
 *
 * 视觉映射 V4.0 .pipeline 体系：
 *   节点 .pipeline-node（灰=待命 / .done 绿=完成 / .current 金=运行中呼吸点）
 *   并行组 agent1∥agent2 用「∥」箭头连接，其余用「→」。
 * 完成节点按 output_json.灯色 染色（readLamp）。
 * 点击节点 → 父组件聚焦该 agent（切换左栏选中 + 中栏详情）。
 */

interface AgentMeta {
  id: string;
  short: string;   // e.g. "A1"
  label: string;   // e.g. "固有对象"
}

const AGENTS: AgentMeta[] = [
  { id: 'agent1-固有对象', short: 'A1', label: '前置闸门' },
  { id: 'agent2-政策应答', short: 'A2', label: '政策应答' },
  { id: 'agent3-多元融资', short: 'A3', label: '多元融资' },
  { id: 'agent4-财务模型', short: 'A4', label: '通用财务' },
  { id: 'agent5-失败案例', short: 'A5', label: '失败校验' },
  { id: 'agent6-双层决策', short: 'A6', label: '双层决策' },
  { id: 'agent7-成果交付', short: 'A7', label: '成果交付' },
];

interface Props {
  outputs: Record<string, AgentOutput>;
  activeAgentId: string;
  streaming: boolean;
  onSelect: (agentId: string) => void;
}

export const PipelineBar: React.FC<Props> = ({ outputs, activeAgentId, streaming, onSelect }) => {
  const stateOf = (id: string) => resolveNodeState(id, (agentId) => Boolean(outputs[agentId]), streaming);

  const renderNode = (meta: AgentMeta) => {
    const state = stateOf(meta.id);
    const lamp = readLamp(outputs[meta.id]?.output_json);
    const cls = [
      'pipeline-node',
      state === 'done' ? 'done' : '',
      state === 'running' ? 'current' : '',
      lamp === 'green' ? 'done' : '',
      activeAgentId === meta.id ? 'current' : '',
    ].filter(Boolean).join(' ');

    return (
      <button
        key={meta.id}
        type="button"
        className={cls}
        onClick={() => onSelect(meta.id)}
        title={`${meta.short} ${meta.label}${state === 'done' ? '（已完成，点击查看输出）' : state === 'running' ? '（运行中…）' : '（待命）'}`}
      >
        <span className="dot" aria-hidden="true" />
        {meta.short} {meta.label}
      </button>
    );
  };

  return (
    <div className="pipeline" role="group" aria-label="七智能体编排流水线">
      {renderNode(AGENTS[0])}
      <span className="pipeline-arrow" title="并行执行">∥</span>
      {renderNode(AGENTS[1])}
      <span className="pipeline-arrow">→</span>
      {renderNode(AGENTS[2])}
      <span className="pipeline-arrow">→</span>
      {renderNode(AGENTS[3])}
      <span className="pipeline-arrow">→</span>
      {renderNode(AGENTS[4])}
      <span className="pipeline-arrow">→</span>
      {renderNode(AGENTS[5])}
      <span className="pipeline-arrow">→</span>
      {renderNode(AGENTS[6])}
    </div>
  );
};

export default PipelineBar;
