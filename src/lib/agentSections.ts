/**
 * Parse per-agent sections from the super-skill orchestrator's streamed text.
 *
 * PROBLEM THIS SOLVES
 * -------------------
 * The super-skill orchestrator runs sub-agents in parallel for Phase 1
 * (agent1 固有对象 + agent2 政策应答). Their `agent_output` SSE events
 * fire back-to-back (milliseconds apart), then a single subsequent
 * `text_delta` contains BOTH agents' results concatenated, prefixed by
 * markdown section headers like:
 *
 *   ## 🏠 Agent1 固有对象输出（三色灯判定）
 *   ```json ... ```
 *   ## 📑 Agent2 政策应答输出（4 字段应答结论）
 *   ```json ... ```
 *
 * Tracking "current agent" by the most recent `agent_output` event assigns
 * the entire combined blob to whichever sub-skill loaded last — losing the
 * other agent's content. The correct signal is the section HEADER in the
 * text itself, not the SSE event order.
 *
 * USAGE
 * -----
 * Call `sliceAgentSections(text)` on the accumulated assistant text and
 * use the returned `Record<agentId, sectionText>` to populate each
 * agent's `summary` field in the right AgentPane slot.
 */

// Match section headers in the streamed text. Observed formats across
// different LLMs / runs:
//
//   glm-5.2 style:   `## 🏠 agent1 固有对象判定`
//   Claude style:    `### 🔴🟡🟢 Agent1 固有对象 — 三色灯闸门判定`
//   Capital style:   `## 🟡 Agent1 — 固有对象识别（闸门型）`
//   Process style:   `## 🔍 Agent1 处理执行（Step 1-6 逐项查表）`
//   Output style:    `## 📦 Agent1 输出`
//   Summary section: `## 📦 Agent6 输出（最终聚合）`
//
// The role-name (固有对象/政策应答/多元融资/...) is NOT stable across
// runs — some LLM outputs use it, others don't. The only stable signal
// is `## ` (or `### `) + (optional emoji/symbol prefix) + `Agent{N}`
// token. We match on that, and rely on the prefix-symbol check to reject
// transition headers like `## 🚀 Phase 2 — Agent3 多元融资` (Phase starts
// with a letter, fails the [^\sa-zA-Z]+ symbol-only match).
//
// Risk: a header like `## 关于 Agent1 的补充` would also match. That's
// acceptable — if the LLM writes such a header, the content is about
// agent1 anyway.
const SECTION_PATTERNS: ReadonlyArray<{ regex: RegExp; agentId: string }> = [
  // ## {optional non-letter symbol + space} Agent{N} (word boundary, no immediately-following letter)
  { regex: /#{2,3}\s+(?:[^\sa-zA-Z]+\s*)?[Aa]gent\s*1(?![a-zA-Z])/g, agentId: 'agent1-固有对象' },
  { regex: /#{2,3}\s+(?:[^\sa-zA-Z]+\s*)?[Aa]gent\s*2(?![a-zA-Z])/g, agentId: 'agent2-政策应答' },
  { regex: /#{2,3}\s+(?:[^\sa-zA-Z]+\s*)?[Aa]gent\s*3(?![a-zA-Z])/g, agentId: 'agent3-多元融资' },
  { regex: /#{2,3}\s+(?:[^\sa-zA-Z]+\s*)?[Aa]gent\s*4(?![a-zA-Z])/g, agentId: 'agent4-财务模型' },
  { regex: /#{2,3}\s+(?:[^\sa-zA-Z]+\s*)?[Aa]gent\s*5(?![a-zA-Z])/g, agentId: 'agent5-失败案例' },
  { regex: /#{2,3}\s+(?:[^\sa-zA-Z]+\s*)?[Aa]gent\s*6(?![a-zA-Z])/g, agentId: 'agent6-双层决策' },
];

interface SectionMarker {
  idx: number;       // start index of the header in source text
  end: number;       // index just past the header (start of body)
  agentId: string;
}

/** Find all section headers in the text, in order of appearance. */
function findSectionMarkers(text: string): SectionMarker[] {
  const markers: SectionMarker[] = [];
  for (const { regex, agentId } of SECTION_PATTERNS) {
    regex.lastIndex = 0; // reset global regex state
    let m: RegExpExecArray | null;
    while ((m = regex.exec(text)) !== null) {
      markers.push({
        idx: m.index,
        end: m.index + m[0].length,
        agentId,
      });
    }
  }
  markers.sort((a, b) => a.idx - b.idx);

  // NOTE: We deliberately do NOT de-duplicate adjacent markers with the
  // same agentId. Re-runs (same agent invoked twice) must produce two
  // slices; the second slice overrides the first via the natural
  // "last write wins" semantics of the result map.
  return markers;
}

/**
 * Slice the accumulated text into per-agent sections.
 *
 * Returns a map of `agentId → sectionText` where each section INCLUDES the
 * `## {emoji} Agent{N} ...` header line, so the renderer can display it as
 * a self-contained markdown block.
 *
 * Text BEFORE the first recognized section header (e.g. orchestrator
 * preamble like "收到完整项目上会请求...") is dropped — it's not agent
 * output, just narratology.
 */
export function sliceAgentSections(text: string): Record<string, string> {
  if (!text) return {};
  const markers = findSectionMarkers(text);
  if (markers.length === 0) return {};

  const result: Record<string, string> = {};
  for (let i = 0; i < markers.length; i++) {
    const cur = markers[i];
    const next = markers[i + 1];
    const endIdx = next ? next.idx : text.length;
    const sectionText = text.slice(cur.idx, endIdx).trim();
    if (sectionText) {
      // Later sections override earlier ones with the same agentId
      // (rare, but handles re-runs).
      result[cur.agentId] = sectionText;
    }
  }
  return result;
}

/**
 * Find the agent that "owns" the current write position — i.e. the agent
 * whose section header appears most recently in the text so far.
 *
 * Used to give real-time feedback while streaming: as soon as
 * `## 🏠 Agent1` appears, we know subsequent text belongs to agent1
 * until another header arrives.
 *
 * Returns null if no section header has appeared yet (e.g. orchestrator
 * preamble phase).
 */
export function detectCurrentAgent(text: string): string | null {
  if (!text) return null;
  const markers = findSectionMarkers(text);
  if (markers.length === 0) return null;
  return markers[markers.length - 1].agentId;
}

// ───────────────────────────────────────────────────────────────────────
// FALLBACK: parse agent6's summary table for tabs without their own section
// ───────────────────────────────────────────────────────────────────────
//
// PROBLEM: The LLM (glm-5.2 / Claude / etc.) is non-deterministic about
// whether it streams individual H2/H3 sections for agent1/2/3. Sometimes
// it does, sometimes it keeps their output internal as tool_result blocks
// and only streams the final agent6 summary section. When individual
// sections are missing, those agent tabs stay empty — bad UX.
//
// OBSERVATION: agent6 ALWAYS finishes with a "六 agent 灯色一览" summary
// table containing one row per agent with type / lamp color / core
// conclusion. This is the LLM's own final aggregated report.
//
// STRATEGY: After parsing individual sections, also parse the summary
// table. For any agent that didn't get its own section, use its table
// row as the summary fallback — at least the user sees SOMETHING.

const SUMMARY_TABLE_HEADER_PATTERNS = [
  /六\s*[Aa]gent\s*灯色一览/,
  /六\s*[Aa]gent\s*总览/,
  /六\s*[Aa]gent\s*输出摘要/,
  /六\s*[Aa]gent\s*汇总/,
  /[Aa]gent\s*灯色一览/,
  /[Aa]gent\s*汇总表/,
  /[Aa]gent\s*输出摘要/,
];

interface SummaryRow {
  agentId: string;
  rowText: string;       // the full markdown table row, minus the leading `|` and trailing `|`
  cells: string[];       // parsed cells
}

/**
 * Parse agent6's summary table near the end of the streamed text.
 * Returns one row per agent that appeared in the table.
 */
function parseSummaryTable(text: string): SummaryRow[] {
  if (!text) return [];

  // Find the summary table header
  let headerIdx = -1;
  for (const pat of SUMMARY_TABLE_HEADER_PATTERNS) {
    const m = text.match(pat);
    if (m && m.index !== undefined) {
      headerIdx = m.index;
      break;
    }
  }
  if (headerIdx < 0) return [];

  // Take the next ~3000 chars after the header (table is usually < 2000 chars)
  const region = text.slice(headerIdx, headerIdx + 3000);

  // Collect markdown table rows. Skip the separator row (|---|---|...).
  const rows: string[] = [];
  const lines = region.split('\n');
  let inTable = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) {
      if (inTable) break; // table ended
      continue;
    }
    inTable = true;
    if (/^\|\s*[-:|\s]+\|\s*$/.test(trimmed)) continue; // separator
    rows.push(trimmed);
    if (rows.length > 10) break; // safety cap
  }

  // Identify which column is "Agent" (usually first). For each row, if the
  // Agent cell matches `agent{N}`, attribute the row to that agent.
  const result: SummaryRow[] = [];
  for (const row of rows) {
    const cells = row.split('|').slice(1, -1).map(c => c.trim());
    if (cells.length < 2) continue;

    // Agent cell is usually cells[0]. Match patterns like "**agent1** 固有对象" or "agent1".
    const agentCell = cells[0];
    const agentMatch = agentCell.match(/agent\s*(\d)/i);
    if (!agentMatch) continue;

    const agentNum = parseInt(agentMatch[1], 10);
    if (agentNum < 1 || agentNum > 6) continue;

    const agentId = `agent${agentNum}-${ROLE_BY_NUM[agentNum]}`;
    result.push({ agentId, rowText: row, cells });
  }
  return result;
}

const ROLE_BY_NUM: Record<number, string> = {
  1: '固有对象',
  2: '政策应答',
  3: '多元融资',
  4: '财务模型',
  5: '失败案例',
  6: '双层决策',
};

/**
 * Build the final per-agent sections map.
 *
 * 1. Parse individual H2/H3 sections (preferred — full content).
 * 2. Parse agent6's summary table (fallback — brief one-liner).
 * 3. For agents that have an individual section, keep it as-is.
 * 4. For agents that ONLY appear in the summary table, synthesize a
 *    minimal section block with the table row.
 */
export function parseAgentOutputs(text: string): Record<string, string> {
  if (!text) return {};
  const sections = sliceAgentSections(text);
  const summaryRows = parseSummaryTable(text);

  for (const row of summaryRows) {
    if (sections[row.agentId]) continue; // individual section wins
    // Synthesize a minimal block. Include the summary header line + the row,
    // so the markdown renderer shows a meaningful card.
    sections[row.agentId] = [
      `### ${row.cells[0]} — 汇总`,
      '',
      `| 类型 | 灯色 | 核心结论 |`,
      `|---|---|---|`,
      `| ${row.cells[1] || '-'} | ${row.cells[2] || '-'} | ${row.cells[3] || '-'} |`,
      '',
      `_该 agent 未单独流式输出，内容由 agent6 汇总表回填。详细输出请见主对话窗。_`,
    ].join('\n');
  }

  return sections;
}
