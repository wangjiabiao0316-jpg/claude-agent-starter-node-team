import { describe, it, expect } from 'vitest';
import { detectSseEvent, decodeEdgeOneSkillNameEscape } from '../chat/_stream';

describe('decodeEdgeOneSkillNameEscape', () => {
  it('decodes #Uxxxx escapes to Chinese characters (EdgeOne sandbox format)', () => {
    // Production-captured escape sequence:
    //   agent1-#U56fa#U6709#U5bf9#U8c61  →  agent1-固有对象
    expect(decodeEdgeOneSkillNameEscape('agent1-#U56fa#U6709#U5bf9#U8c61')).toBe('agent1-固有对象');
    expect(decodeEdgeOneSkillNameEscape('agent2-#U653f#U7b56#U5e94#U7b54')).toBe('agent2-政策应答');
    expect(decodeEdgeOneSkillNameEscape('agent3-#U591a#U5143#U878d#U8d44')).toBe('agent3-多元融资');
    expect(decodeEdgeOneSkillNameEscape('agent4-#U8d22#U52a1#U6a21#U578b')).toBe('agent4-财务模型');
    expect(decodeEdgeOneSkillNameEscape('agent5-#U5931#U8d25#U6848#U4f8b')).toBe('agent5-失败案例');
    expect(decodeEdgeOneSkillNameEscape('agent6-#U53cc#U5c42#U51b3#U7b56')).toBe('agent6-双层决策');
  });

  it('handles uppercase and lowercase hex digits', () => {
    expect(decodeEdgeOneSkillNameEscape('x-#U56FA')).toBe('x-固'); // uppercase hex
    expect(decodeEdgeOneSkillNameEscape('x-#U56fa')).toBe('x-固'); // lowercase hex
    expect(decodeEdgeOneSkillNameEscape('x-#U56Fa')).toBe('x-固'); // mixed case
  });

  it('passes through strings without #U escape unchanged', () => {
    expect(decodeEdgeOneSkillNameEscape('agent1-固有对象')).toBe('agent1-固有对象');
    expect(decodeEdgeOneSkillNameEscape('web_search')).toBe('web_search');
    expect(decodeEdgeOneSkillNameEscape('')).toBe('');
  });

  it('handles partial escape (no #U prefix or malformed) without throwing', () => {
    expect(decodeEdgeOneSkillNameEscape('#U123')).toBe('#U123'); // only 3 hex — no match
    expect(decodeEdgeOneSkillNameEscape('foo bar')).toBe('foo bar');
  });
});

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

  it('decodes EdgeOne #Uxxxx escape BEFORE matching agent pattern', () => {
    // Production bug: skill names arrive URL-encoded by EdgeOne sandbox.
    // detectSseEvent must decode first to fire agent_output correctly.
    expect(detectSseEvent('agent1-#U56fa#U6709#U5bf9#U8c61')).toBe('agent_output');
    expect(detectSseEvent('agent6-#U53cc#U5c42#U51b3#U7b56')).toBe('agent_output');
  });
});
