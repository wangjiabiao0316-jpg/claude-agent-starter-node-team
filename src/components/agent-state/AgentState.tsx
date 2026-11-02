import type { ReactNode } from 'react';
import styles from './AgentState.module.css';

/**
 * Agent 状态枚举（六态）。
 *
 * 前四态可从现有 SSE 数据真实推导（对应 lib/pipeline.ts 的
 * resolveNodeState 细分）；failed / blocked 为「预留态」——
 * 当前 SSE 无 per-agent 失败/阻塞信号源，需由未来后端显式下发，
 * 或 Phase 5 接线时从 debug_msg 推断。组件不虚构这两态的数据来源。
 */
export type AgentStateKind =
  | 'idle'      // 待命：未开始，等待编排器调度
  | 'queued'    // 排队：上游依赖未完成，被阻塞等待
  | 'running'   // 运行中：流激活且上游已就绪
  | 'completed' // 已完成：已收到 agent_output
  | 'failed'    // 失败（预留：无 SSE 信号源）
  | 'blocked';  // 已拦截（预留：无 SSE 信号源，语义=被上游红灯/闸门拦下）

/** 灯色（决策语义），映射到 --lamp-green / --lamp-yellow / --lamp-red */
export type AgentLamp = 'green' | 'yellow' | 'red';

/** 状态默认文案（可被 label prop 覆盖） */
export const STATE_LABEL: Record<AgentStateKind, string> = {
  idle: '待命',
  queued: '排队中',
  running: '运行中',
  completed: '已完成',
  failed: '失败',
  blocked: '已拦截',
};

/** deriveAgentState 的输入信号 */
export interface AgentStateSignals {
  /** 是否已收到该 agent 的输出（agent_output） */
  hasOutput: boolean;
  /** 编排器是否在流式运行中 */
  streaming: boolean;
  /** 上游依赖是否全部完成（可由 lib/pipeline.ts 的 PIPELINE_UPSTREAM 计算） */
  upstreamDone: boolean;
  /** 显式失败（预留，当前无信号源） */
  failed?: boolean;
  /** 显式阻塞（预留，当前无信号源） */
  blocked?: boolean;
}

/**
 * 由信号推导六态。纯函数，无 React 依赖。
 * 与 lib/pipeline.ts 的 resolveNodeState 对齐：把它的 standby 细分为
 * idle（整体未跑）与 queued（跑起来但上游未就绪）。
 */
export function deriveAgentState(s: AgentStateSignals): AgentStateKind {
  if (s.failed) return 'failed';
  if (s.blocked) return 'blocked';
  if (s.hasOutput) return 'completed';
  if (!s.streaming) return 'idle';
  return s.upstreamDone ? 'running' : 'queued';
}

export interface AgentStateProps {
  /** 当前状态 */
  state: AgentStateKind;
  /** 灯色：completed 态可叠加三色灯语义（其余态忽略） */
  lamp?: AgentLamp | null;
  /** 尺寸 */
  size?: 'sm' | 'md' | 'lg';
  /** 是否显示文本标签 */
  showLabel?: boolean;
  /** 自定义标签（覆盖 STATE_LABEL 默认文案） */
  label?: ReactNode;
}

/**
 * Agent 状态展示组件：状态环（外圈 + 中心点）+ 可选文本标签。
 * 纯展示，不含业务推断——状态由调用方传入或经 deriveAgentState 计算。
 */
export function AgentState({
  state,
  lamp,
  size = 'md',
  showLabel = false,
  label,
}: AgentStateProps) {
  const lampCls = state === 'completed' && lamp ? styles[`lamp_${lamp}`] : '';
  const cls = [
    styles.state,
    styles[`size_${size}`],
    styles[`state_${state}`],
    lampCls,
  ].filter(Boolean).join(' ');

  return (
    <span className={styles.wrap}>
      <span className={cls} role="status" aria-label={STATE_LABEL[state]} />
      {showLabel && <span className={styles.label}>{label ?? STATE_LABEL[state]}</span>}
    </span>
  );
}

export default AgentState;
