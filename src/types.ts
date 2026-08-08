/**
 * Image attachment reference stored in message state.
 * Contains metadata and a runtime blob: URL for rendering.
 * The `url` field is runtime-only — not persisted to IndexedDB snapshots.
 */
export interface ImageAttachment {
  id: string;              // Unique image ID (from SSE payload)
  storageKey: string;      // IndexedDB key: `${conversationId}/${id}`
  url: string;             // Runtime blob: URL (or empty string if not yet loaded)
  mimeType: string;
  size: number;
  createdAt: number;
  persistent: boolean;     // Whether successfully saved to IndexedDB
}

/**
 * SSE image event payload — enriched with metadata.
 * base64 is transmitted once for frontend persistence, then discarded.
 */
export interface ImageSsePayload {
  imageId: string;
  base64: string;
  mimeType?: string;
  size?: number;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  images?: (ImageAttachment | string)[];  // ImageAttachment (new) or base64 string (legacy compat)
  activity?: {
    type: 'web_search';
    label: string;
    status: 'active' | 'done' | 'error';
    /**
     * Optional in-memory error code that drives the in-bubble chip's CTA.
     * Currently only `wsa_missing` is recognised — emitted by the frontend
     * detector in App.tsx when a debug_msg surfaces a WSA_API_KEY-missing
     * tool error. Not persisted to /history; cleared the next time the
     * activity transitions back to `active`.
     */
    errorCode?: 'wsa_missing';
  };
  /**
   * True while the assistant is actively producing this message
   * (between the first text_delta and the final done/error event).
   * Drives the in-bubble blinking caret to give the user feedback
   * that more content is still streaming. Cleared once done/error fires.
   */
  streaming?: boolean;
}

export interface ToolLampState {
  id: string;
  label: string;
  icon: string;
  active: boolean;
  animKey: number;   // Incremented on each activation to remount and replay animation
}

/**
 * Lightweight summary of a conversation, returned by /conversations.
 * Used to render the left sidebar — does NOT contain full message content.
 */
export interface ConversationSummary {
  id: string;
  title: string;
  preview?: string;
  lastMessageAt?: number;
  createdAt?: number;
  userId?: string;
  messageCount?: number;
}

export interface ListConversationsParams {
  userId: string;
  limit?: number;
  order?: 'asc' | 'desc';
  after?: string;
  before?: string;
}

export interface ListConversationsResponse {
  conversations: ConversationSummary[];
  nextCursor?: string;
  previousCursor?: string;
}

// === Phase 4 Task 10: SSE event 新类型 ===

/**
 * Suggested action button surfaced after super-skill completes.
 * Backend emits via SSE event `suggest_actions` (triggered when
 * tool name = `super-skill.complete` in agents/chat/_stream.ts).
 */
export interface SuggestAction {
  id: string;            // e.g. "view_agent1-固有对象" / "export_report" / "rerun_agent"
  emoji: string;         // e.g. "🏠" / "📑" / "📤"
  title: string;         // short label
  description: string;   // longer tooltip text
}

/**
 * Output produced by an individual sub-agent (agent1 ~ agent6).
 * Backend emits via SSE event `agent_output` when tool name matches
 * `agent{1-6}-<中文名>`.
 */
export interface AgentOutput {
  agent_id: string;                          // e.g. "agent1-固有对象"
  output_json: Record<string, unknown>;      // structured payload
  summary: string;                           // human-readable summary
}

/**
 * Final HTML report ready for display in modal.
 * Backend emits via SSE event `report_ready` when tool name = `agent6.export_report`.
 */
export interface ReportReady {
  report_type: '投资人版' | '政府版' | '业主版' | '内部决策版';
  html_content: string;
}
