import { describe, expect, it } from 'vitest';
import { readLamp, resolveNodeState, PIPELINE_UPSTREAM } from '../pipeline';

const A1 = 'agent1-固有对象';
const A2 = 'agent2-政策应答';
const A3 = 'agent3-多元融资';
const A6 = 'agent6-双层决策';

/** Build a hasOutput predicate from a list of completed agent ids. */
const done = (...ids: string[]) => (id: string) => ids.includes(id);

describe('readLamp', () => {
  it('returns the lamp colour for valid values', () => {
    expect(readLamp({ '灯色': 'green' })).toBe('green');
    expect(readLamp({ '灯色': 'yellow' })).toBe('yellow');
    expect(readLamp({ '灯色': 'red' })).toBe('red');
  });

  it('returns null for missing or invalid values', () => {
    expect(readLamp({})).toBeNull();
    expect(readLamp({ '灯色': 'blue' })).toBeNull();
    expect(readLamp({ '灯色': 42 })).toBeNull();
    expect(readLamp(null)).toBeNull();
    expect(readLamp(undefined)).toBeNull();
  });
});

describe('resolveNodeState', () => {
  it('is done when output exists, even without streaming', () => {
    expect(resolveNodeState(A1, done(A1), false)).toBe('done');
  });

  it('is standby when idle with no output', () => {
    expect(resolveNodeState(A1, done(), false)).toBe('standby');
  });

  it('phase-1 agents run in parallel while streaming', () => {
    expect(resolveNodeState(A1, done(), true)).toBe('running');
    expect(resolveNodeState(A2, done(), true)).toBe('running');
  });

  it('agent3 waits for both agent1 and agent2', () => {
    expect(resolveNodeState(A3, done(), true)).toBe('standby');
    expect(resolveNodeState(A3, done(A1), true)).toBe('standby');
    expect(resolveNodeState(A3, done(A1, A2), true)).toBe('running');
  });

  it('agent6 only runs after the whole chain completes', () => {
    const partial = done(A1, A2, A3, 'agent4-财务模型');
    expect(resolveNodeState(A6, partial, true)).toBe('standby');
    const full = done(A1, A2, A3, 'agent4-财务模型', 'agent5-失败案例');
    expect(resolveNodeState(A6, full, true)).toBe('running');
  });

  it('unknown agents run immediately while streaming (no deps)', () => {
    expect(resolveNodeState('agentX-未知', done(), true)).toBe('running');
  });

  it('every upstream reference points at a known agent id set', () => {
    for (const deps of Object.values(PIPELINE_UPSTREAM)) {
      for (const d of deps) {
        expect(Object.keys(PIPELINE_UPSTREAM)).toContain(d);
      }
    }
  });
});
