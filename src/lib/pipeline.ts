/**
 * Pure helpers for the 6-agent orchestration pipeline visualisation.
 *
 * Extracted from PipelineBar.tsx so the state machine can be unit-tested
 * without React / CSS-module imports.
 */

export type LampColor = 'green' | 'yellow' | 'red';

export type PipelineNodeState = 'standby' | 'running' | 'done';

/**
 * Upstream dependencies that must be done before a node can be "running".
 * Mirrors the super-skill call graph: agent1 ∥ agent2 → 3 → 4 → 5 → 6.
 */
export const PIPELINE_UPSTREAM: Record<string, string[]> = {
  'agent1-固有对象': [],
  'agent2-政策应答': [],
  'agent3-多元融资': ['agent1-固有对象', 'agent2-政策应答'],
  'agent4-财务模型': ['agent3-多元融资'],
  'agent5-失败案例': ['agent4-财务模型'],
  'agent6-双层决策': ['agent5-失败案例'],
};

/**
 * Read the 三色灯 verdict out of an agent's output_json.
 * Returns null when the field is missing or not a valid lamp value.
 */
export function readLamp(outputJson: Record<string, unknown> | null | undefined): LampColor | null {
  if (!outputJson || typeof outputJson !== 'object') return null;
  const raw = outputJson['灯色'];
  if (raw === 'green' || raw === 'yellow' || raw === 'red') return raw;
  return null;
}

/**
 * Resolve a pipeline node's visual state.
 *
 * - done:    the orchestrator has delivered this agent's output
 * - running: a stream is active and all upstream agents are done
 * - standby: otherwise
 */
export function resolveNodeState(
  agentId: string,
  hasOutput: (id: string) => boolean,
  streaming: boolean,
): PipelineNodeState {
  if (hasOutput(agentId)) return 'done';
  if (!streaming) return 'standby';
  const deps = PIPELINE_UPSTREAM[agentId] ?? [];
  return deps.every(hasOutput) ? 'running' : 'standby';
}
