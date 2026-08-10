import { describe, it, expect } from 'vitest';
import { sliceAgentSections, detectCurrentAgent, parseAgentOutputs } from '../agentSections';

/**
 * Tests for the section-header-based parser.
 *
 * The previous implementation tracked "current agent" by the most recent
 * `agent_output` SSE event, which broke for parallel agents: super-skill
 * fires agent1 + agent2 agent_output within ms of each other in Phase 1,
 * then streams BOTH results in a single text_delta prefixed by markdown
 * headers like `## 🏠 Agent1 ...` and `## 📑 Agent2 ...`.
 *
 * These tests use real production-shaped text to verify the new parser
 * distributes content correctly regardless of SSE event timing.
 */
describe('sliceAgentSections', () => {
  it('returns empty map for empty input', () => {
    expect(sliceAgentSections('')).toEqual({});
  });

  it('returns empty map when no section headers are present', () => {
    const text = '收到完整项目上会请求。先读取 references 文档。\n\n## Phase 1：触发 agent';
    expect(sliceAgentSections(text)).toEqual({});
  });

  it('splits a single agent section from preamble', () => {
    const text = [
      '收到完整项目上会请求。',
      '',
      '## 🏠 Agent1 固有对象输出（三色灯判定）',
      '',
      '```json',
      '{ "灯色": "yellow" }',
      '```',
    ].join('\n');

    const result = sliceAgentSections(text);
    expect(Object.keys(result)).toEqual(['agent1-固有对象']);
    expect(result['agent1-固有对象']).toContain('## 🏠 Agent1 固有对象输出');
    expect(result['agent1-固有对象']).toContain('"灯色": "yellow"');
    // Preamble must NOT leak into any agent section
    expect(result['agent1-固有对象']).not.toContain('收到完整项目');
  });

  it('PRODUCTION FORMAT — H3 header with traffic-light emoji + em-dash', () => {
    // Captured from zhisuanchip.cn production:
    //   ### 🔴🟡🟢 Agent1 固有对象 — 三色灯闸门判定
    const text = [
      '## 🚀 Phase 1(并行)— agent1 固有对象 + agent2 政策应答',
      '',
      '### 🔴🟡🟢 Agent1 固有对象 — 三色灯闸门判定',
      '',
      '| 检查项 | 项目信息 | 命中 |',
      '|---|---|---|',
      '| H1.red.A | 用户未提供证号 | ❌ 触发降级 |',
      '',
      '```json',
      '{ "agent": "agent1-固有对象", "灯色": "yellow" }',
      '```',
      '',
      '### 🔴🟡🟢 Agent2 政策应答 — 政策清单',
      '',
      '```json',
      '{ "可适用政策清单": [] }',
      '```',
    ].join('\n');

    const result = sliceAgentSections(text);
    expect(Object.keys(result).sort()).toEqual(['agent1-固有对象', 'agent2-政策应答']);
    expect(result['agent1-固有对象']).toContain('### 🔴🟡🟢 Agent1 固有对象');
    expect(result['agent1-固有对象']).toContain('H1.red.A');
    expect(result['agent1-固有对象']).not.toContain('Agent2');
    expect(result['agent2-政策应答']).toContain('### 🔴🟡🟢 Agent2 政策应答');
    expect(result['agent2-政策应答']).toContain('可适用政策清单');
    // Transition header (## 🚀 Phase 1) must NOT be matched as an agent section
    expect(result['agent3-多元融资']).toBeUndefined();
  });

  it('PARALLEL AGENTS CASE — splits combined agent1+agent2 text correctly', () => {
    // Production-captured failure mode: orchestrator runs agent1 + agent2
    // in parallel, both fire agent_output events within 1ms, then ONE
    // text_delta arrives containing BOTH agents' results. The LLM also
    // uses LOWERCASE "agent1" / "agent2" and may pick different emojis
    // (📋 instead of 📑 for agent2). Section header parsing must be
    // case-insensitive and emoji-agnostic.
    const text = [
      '规则查表完成。先输出 agent1 + agent2 结果：',
      '',
      '---',
      '',
      '## 🏠 agent1 固有对象判定',
      '',
      '```json',
      '{ "agent": "agent1-固有对象", "灯色": "yellow" }',
      '```',
      '',
      '---',
      '',
      '## 📋 agent2 政策应答',
      '',
      '```json',
      '{ "可适用政策清单": [] }',
      '```',
      '',
      '---',
      '',
      '## 🔄 Phase 2 启动:agent3 多元融资(消费 agent1 + agent2 输出)',
    ].join('\n');

    const result = sliceAgentSections(text);

    // Two distinct agent sections, despite no SSE signal between them
    expect(Object.keys(result).sort()).toEqual(['agent1-固有对象', 'agent2-政策应答']);

    // agent1 must contain ONLY agent1's content (header + json), NOT agent2's
    expect(result['agent1-固有对象']).toContain('## 🏠 agent1 固有对象判定');
    expect(result['agent1-固有对象']).toContain('"agent": "agent1-固有对象"');
    expect(result['agent1-固有对象']).toContain('"灯色": "yellow"');
    expect(result['agent1-固有对象']).not.toContain('agent2');
    expect(result['agent1-固有对象']).not.toContain('政策应答');

    // agent2 must contain agent2's content (and trailing transition text —
    // not ideal but acceptable since the transition isn't an agent section)
    expect(result['agent2-政策应答']).toContain('## 📋 agent2 政策应答');
    expect(result['agent2-政策应答']).toContain('可适用政策清单');
    expect(result['agent2-政策应答']).not.toContain('"灯色": "yellow"');

    // CRITICAL: transition header "## 🔄 Phase 2 启动:agent3 多元融资"
    // must NOT be recognized as an agent3 section (it's a transition).
    expect(result['agent3-多元融资']).toBeUndefined();
  });

  it('handles all 6 agents in sequence (real LLM casing)', () => {
    // Uses lowercase agent{N} with varied emojis — mirrors production.
    const text = [
      '## 🏠 agent1 固有对象判定',
      'agent1 body',
      '## 📋 agent2 政策应答',
      'agent2 body',
      '## 💰 agent3 多元融资结果',
      'agent3 body',
      '## 📊 agent4 财务模型',
      'agent4 body',
      '## ⚠️ agent5 失败案例',
      'agent5 body',
      '## 🚦 agent6 双层决策',
      'agent6 body',
    ].join('\n\n');

    const result = sliceAgentSections(text);
    expect(Object.keys(result).length).toBe(6);
    expect(result['agent1-固有对象']).toContain('agent1 body');
    expect(result['agent6-双层决策']).toContain('agent6 body');
    expect(result['agent3-多元融资']).not.toContain('agent4 body');
  });

  it('handles re-runs: later section overrides earlier one with same agentId', () => {
    const text = [
      '## 🏠 agent1 固有对象判定',
      'old content',
      '## 🏠 agent1 固有对象判定（重算）',
      'new content',
    ].join('\n\n');

    const result = sliceAgentSections(text);
    expect(result['agent1-固有对象']).toContain('new content');
    expect(result['agent1-固有对象']).not.toContain('old content');
  });

  it('survives partial header in flight (only matches complete Agent{N} token)', () => {
    // New regex matches `## + emoji + Agent{N}` without requiring role name,
    // so these now MATCH:
    expect(Object.keys(sliceAgentSections('## 🏠 agent1'))).toContain('agent1-固有对象');
    expect(Object.keys(sliceAgentSections('## 🏠 agent1 固有'))).toContain('agent1-固有对象');
    // But truncated agent token (no digit) still doesn't match:
    expect(sliceAgentSections('## 🏠 a')).toEqual({});
    expect(sliceAgentSections('## 🏠 agent')).toEqual({});
  });

  it('USER-REPORTED FORMAT — matches "## 🔍 Agent1 处理执行" (no role name in header)', () => {
    // Captured from zhisuanchip.cn production on 2026-08-10:
    // LLM used different format where header has Agent{N} but not the
    // role name (固有对象). The role name only appears in transition
    // Phase headers (which we still correctly reject).
    const text = [
      '## 🚀 Phase 1 启动 — agent1 固有对象识别',
      '',
      '## 🔍 Agent1 处理执行（Step 1-6 逐项查表）',
      '',
      'agent1 详细内容：H1 产权... H2 文保...',
      '',
      '## 📦 Agent1 输出',
      '',
      '```json',
      '{ "灯色": "yellow" }',
      '```',
      '',
      '## 🚀 Phase 1 继续 — Agent2 政策应答',
      '',
      '## 🔍 Agent2 处理执行',
      '',
      'agent2 详细内容',
    ].join('\n');

    const result = sliceAgentSections(text);
    // agent1 detected — last occurrence wins (## 📦 Agent1 输出 overwrites
    // earlier ## 🔍 Agent1 处理执行). Both are valid agent1 sections; the
    // "later wins" rule is intentional for re-run support.
    expect(result['agent1-固有对象']).toBeDefined();
    expect(result['agent1-固有对象']).toContain('灯色'); // from the 输出 block
    // agent2 detected
    expect(result['agent2-政策应答']).toBeDefined();
    expect(result['agent2-政策应答']).toContain('agent2 详细内容');
    // Phase transition lines must NOT be matched as their own sections
    expect(result['agent3-多元融资']).toBeUndefined();
  });

  it('works with mixed casing (Agent1 / agent1 / AGENT1)', () => {
    expect(Object.keys(sliceAgentSections('## 🏠 Agent1 固有对象'))).toContain('agent1-固有对象');
    expect(Object.keys(sliceAgentSections('## 🏠 agent1 固有对象'))).toContain('agent1-固有对象');
  });

  it('works without emoji prefix', () => {
    const text = '## agent1 固有对象\nbody content';
    const result = sliceAgentSections(text);
    expect(result['agent1-固有对象']).toBeDefined();
    expect(result['agent1-固有对象']).toContain('body content');
  });

  it('rejects transition headers with "Phase" between emoji and agent', () => {
    const text = '## 🔄 Phase 2 启动:agent3 多元融资(消费 agent1 + agent2 输出)';
    expect(sliceAgentSections(text)).toEqual({});
  });
});

describe('detectCurrentAgent', () => {
  it('returns null for text without headers', () => {
    expect(detectCurrentAgent('收到完整项目上会请求。')).toBeNull();
  });

  it('returns the agent for the most recent header', () => {
    const text = [
      '## 🏠 agent1 固有对象判定',
      'agent1 body',
      '## 📋 agent2 政策应答',
    ].join('\n\n');
    expect(detectCurrentAgent(text)).toBe('agent2-政策应答');
  });

  it('PARALLEL CASE — returns agent2 when both headers fire back-to-back and agent2 is later', () => {
    const text = [
      '## 🏠 agent1 固有对象判定',
      'agent1 content',
      '## 📋 agent2 政策应答',
      'agent2 streaming tail...',
    ].join('\n');
    expect(detectCurrentAgent(text)).toBe('agent2-政策应答');
  });

  it('returns null when only transition header exists', () => {
    const text = '收到完整项目上会请求。\n\n## 🔄 Phase 1 启动:agent1 + agent2 并行';
    expect(detectCurrentAgent(text)).toBeNull();
  });
});

describe('parseAgentOutputs (with summary table fallback)', () => {
  it('returns empty for empty input', () => {
    expect(parseAgentOutputs('')).toEqual({});
  });

  it('uses individual sections when present', () => {
    const text = [
      '## 🏠 agent1 固有对象判定',
      'agent1 详细内容',
      '## 📋 agent2 政策应答',
      'agent2 详细内容',
    ].join('\n\n');
    const result = parseAgentOutputs(text);
    expect(result['agent1-固有对象']).toContain('agent1 详细内容');
    expect(result['agent2-政策应答']).toContain('agent2 详细内容');
  });

  it('PRODUCTION FALLBACK — synthesizes from agent6 summary table when individual sections absent', () => {
    // Captured real production scenario: LLM only streamed agent4-6 sections,
    // agent1/2/3 outputs were kept internal as tool_result. But agent6 always
    // finishes with a "六 agent 灯色一览" summary table containing all 6 rows.
    const text = [
      '## 📊 Agent4 — 财务模型',
      'agent4 详细内容',
      '## 🚦 Agent6 — 双层决策',
      'agent6 详细内容',
      '',
      '## 六 agent 灯色一览',
      '',
      '| Agent | 类型 | 灯色 | 核心结论 |',
      '|---|---|---|---|',
      '| **agent1** 固有对象 | 闸门型 | 🟡 YELLOW | H1.yellow.A（证号待补） |',
      '| **agent2** 政策应答 | 规则查表 | 📋 3条 | 专项债(83.5) |',
      '| **agent3** 多元融资 | 计算型 | 🟢 GREEN | 5/6工具可用 |',
      '| **agent4** 财务模型 | 计算型 | 🟢 GREEN | IRR=54.83% |',
      '| **agent5** 失败案例 | 检索型 | 🟢 GREEN | 五类全未触发 |',
      '| **agent6** 双层决策 | 聚合型 | 🟡 YELLOW | 顶层=yellow |',
    ].join('\n');

    const result = parseAgentOutputs(text);

    // agent4 has its own section — should be the full version
    expect(result['agent4-财务模型']).toContain('agent4 详细内容');
    // agent6 has its own section — full version
    expect(result['agent6-双层决策']).toContain('agent6 详细内容');

    // agent1/2/3/5 don't have individual sections — should be synthesized from table
    expect(result['agent1-固有对象']).toBeDefined();
    expect(result['agent1-固有对象']).toContain('H1.yellow.A');
    expect(result['agent1-固有对象']).toContain('汇总');

    expect(result['agent2-政策应答']).toBeDefined();
    expect(result['agent2-政策应答']).toContain('专项债');

    expect(result['agent3-多元融资']).toBeDefined();
    expect(result['agent3-多元融资']).toContain('5/6工具可用');

    expect(result['agent5-失败案例']).toBeDefined();
    expect(result['agent5-失败案例']).toContain('五类全未触发');
  });

  it('does not synthesize from table when individual section exists', () => {
    const text = [
      '## 🏠 agent1 固有对象判定',
      'individual section content',
      '',
      '## 六 agent 灯色一览',
      '',
      '| Agent | 类型 | 灯色 | 核心结论 |',
      '|---|---|---|---|',
      '| **agent1** 固有对象 | 闸门型 | 🟡 YELLOW | 简表内容 |',
    ].join('\n');

    const result = parseAgentOutputs(text);
    // Individual section wins: result contains the individual section's body text
    expect(result['agent1-固有对象']).toContain('individual section content');
    // And does NOT contain the synthesized fallback marker
    expect(result['agent1-固有对象']).not.toContain('内容由 agent6 汇总表回填');
  });

  it('returns empty when neither sections nor summary table present', () => {
    expect(parseAgentOutputs('just some random text without structure')).toEqual({});
  });
});
