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

// Match section headers like `## 🏠 agent1 固有对象判定` in the streamed text.
//
// Empirically the LLM (Claude / GLM running super-skill) emits headers with
// these characteristics, observed across multiple production SSE captures:
//   - Emoji prefix (🏠 / 📋 / 💰 / 📊 / ⚠️ / 🚦). NOTE: emoji choice is not
//     stable — agent2 has been observed using either 📑 or 📋. So we DON'T
//     match by specific emoji; we accept any single non-letter symbol.
//   - The literal token "agent{N}" — case-insensitive (LLM mixes "Agent1"
//     and "agent1"). Sometimes there's a space: "Agent 1" / "agent 1".
//   - The Chinese role name (固有对象 / 政策应答 / 多元融资 / 财务模型 /
//     失败案例 / 双层决策). This is the most stable identifier.
//
// We DON'T match transition headers like `## 🔄 Phase 2 启动:agent3 多元融资`
// because the regex requires the agent token to immediately follow the
// `## {emoji}` prefix — the word "Phase" between emoji and agent token
// breaks the match.
const SECTION_PATTERNS: ReadonlyArray<{ regex: RegExp; agentId: string }> = [
  // ## {optional non-letter symbol + space} agent{N} {Chinese role name}
  { regex: /##\s+(?:[^\sa-zA-Z]+\s*)?[Aa]gent\s*1\s*固有对象/g, agentId: 'agent1-固有对象' },
  { regex: /##\s+(?:[^\sa-zA-Z]+\s*)?[Aa]gent\s*2\s*政策应答/g, agentId: 'agent2-政策应答' },
  { regex: /##\s+(?:[^\sa-zA-Z]+\s*)?[Aa]gent\s*3\s*多元融资/g, agentId: 'agent3-多元融资' },
  { regex: /##\s+(?:[^\sa-zA-Z]+\s*)?[Aa]gent\s*4\s*财务模型/g, agentId: 'agent4-财务模型' },
  { regex: /##\s+(?:[^\sa-zA-Z]+\s*)?[Aa]gent\s*5\s*失败案例/g, agentId: 'agent5-失败案例' },
  { regex: /##\s+(?:[^\sa-zA-Z]+\s*)?[Aa]gent\s*6\s*双层决策/g, agentId: 'agent6-双层决策' },
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
