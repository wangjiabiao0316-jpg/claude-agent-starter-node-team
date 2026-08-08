import { describe, it, expect } from 'vitest';
import { detectSseEvent } from '../chat/_stream';

describe('detectSseEvent', () => {
  it('returns suggest_actions when tool name = super-skill.complete', () => {
    expect(detectSseEvent('super-skill.complete')).toBe('suggest_actions');
  });

  it('returns report_ready when tool name = agent6.export_report', () => {
    expect(detectSseEvent('agent6.export_report')).toBe('report_ready');
  });

  it('returns agent_output when tool name matches agent<N>-<中文>', () => {
    expect(detectSseEvent('agent1-固有对象')).toBe('agent_output');
    expect(detectSseEvent('agent2-政策应答')).toBe('agent_output');
    expect(detectSseEvent('agent3-多元融资')).toBe('agent_output');
    expect(detectSseEvent('agent4-财务模型')).toBe('agent_output');
    expect(detectSseEvent('agent5-失败案例')).toBe('agent_output');
    expect(detectSseEvent('agent6-双层决策')).toBe('agent_output');
  });

  it('returns null for unrelated tools', () => {
    expect(detectSseEvent('web_search')).toBeNull();
    expect(detectSseEvent('commands')).toBeNull();
    expect(detectSseEvent('Skill')).toBeNull();
    expect(detectSseEvent('load_skill')).toBeNull();
  });

  it('returns null for empty or undefined input', () => {
    expect(detectSseEvent('')).toBeNull();
    expect(detectSseEvent(undefined as any)).toBeNull();
    expect(detectSseEvent(null as any)).toBeNull();
  });
});
