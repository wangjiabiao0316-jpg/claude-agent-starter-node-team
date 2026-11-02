import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import type {
  Message,
  ToolLampState,
  ImageAttachment,
  ImageSsePayload,
  ConversationSummary,
  SuggestAction,
  AgentOutput,
  ReportReady,
  UiStage,
} from './types';
import {
  deleteConversation,
  fetchConversationHistory,
  listConversations,
  logMessage,
  sendMessageStream,
  stopAgent,
} from './api';
import type { RawSseEvent } from './api';
import { I18nProvider, LangToggle, useT, MessageKeys } from './i18n';
import {
  base64ToBlob,
  saveImage,
  loadConversationImages,
  deleteConversationImages,
  createObjectUrl,
  revokeAllObjectUrls,
  makeStorageKey,
} from './lib/imageStore';
import { saveSnapshot, loadSnapshot, deleteSnapshot } from './lib/chatUiStore';
import { detectCurrentAgent, parseAgentOutputs } from './lib/agentSections';
import IntakeWizard from './components/IntakeWizard';
import ProductHome from './components/ProductHome';
import GitHubLink from './components/GitHubLink';
import DeployLink from './components/DeployLink';
// === 六屏单屏导航视图 ===
import { ManagementView } from './components/ManagementView';
import { TransitionView } from './components/TransitionView';
import { AgentsView } from './components/AgentsView';
import { ConclusionView } from './components/ConclusionView';
// DEFAULT_AGENT_TAB 仍从 AgentPane 导出（activeAgentTab 初始值）
import { DEFAULT_AGENT_TAB } from './components/AgentPane';
import { AGENT_TABS } from './components/AgentPane';

const LAMP_IDS = ['commands', 'files', 'code_interpreter', 'browser'] as const;
type LampId = typeof LAMP_IDS[number];
const LAMP_ICONS: Record<string, string> = {
  commands: '⌨️',
  files: '📁',
  code_interpreter: '🐍',
  browser: '🌐',
};
const LAMP_I18N_KEYS: Record<string, string> = {
  commands: 'tool.commands',
  files: 'tool.files',
  code_interpreter: 'tool.codeRunner',
  browser: 'tool.browser',
};

// === 六屏单屏导航：顶部一级入口（transition/input 是 management 子屏，不进 nav） ===
const NAV_ITEMS: { stage: UiStage; label: MessageKeys }[] = [
  { stage: 'home', label: 'nav.home' },
  { stage: 'management', label: 'nav.management' },
  { stage: 'agents', label: 'nav.agents' },
  { stage: 'conclusion', label: 'nav.conclusion' },
];

/**
 * Map an EdgeOne platform tool name to a lamp group.
 *
 * The runtime exposes fine-grained tools (e.g. `browser_fetch`,
 * `browser_screenshot`, `files_read`, `commands_run`,
 * `code_interpreter_python`). The header only has 4 lamps, so we collapse
 * each family by prefix / keyword. Returns null for tools that don't belong
 * to any lamp group (e.g. `web_search`, `load_skill`).
 */
function toolToLampId(toolName: string): LampId | null {
  const name = toolName.toLowerCase();
  if (name.startsWith('browser') || name.includes('browse')) return 'browser';
  if (name.startsWith('code_interpreter') || name.startsWith('code-interpreter') || name.startsWith('interpreter')) return 'code_interpreter';
  if (name.startsWith('files') || name.startsWith('file_') || name.startsWith('fs_')) return 'files';
  if (name.startsWith('commands') || name.startsWith('command_') || name.startsWith('cmd_') || name.startsWith('shell') || name === 'exec') return 'commands';
  if ((LAMP_IDS as readonly string[]).includes(name)) return name as LampId;
  return null;
}

const CONVERSATION_ID_STORAGE_KEY = 'eo_conversation_id';
const EO_USER_ID_STORAGE_KEY = 'eo-uuid';
const CONVERSATIONS_PAGE_SIZE = 20;

/**
 * 模块加载时（早于 React 首渲染的 getOrCreateConversationId 写入）记录
 * 是否真的存在旧会话。仅此时存在的 id 才算"旧会话恢复"；
 * 首渲染刚生成的新空 id 不应触发"刷新跳 conclusion"。
 */
const BOOT_HAD_CONVERSATION = getExistingConversationId() !== null;

/** Returns existing conversation ID from localStorage, or null if first visit */
function getExistingConversationId(): string | null {
  return localStorage.getItem(CONVERSATION_ID_STORAGE_KEY);
}

/** Returns existing or creates a new conversation ID */
function getOrCreateConversationId(): string {
  const cached = getExistingConversationId();
  if (cached) return cached;

  const conversationId = crypto.randomUUID();
  localStorage.setItem(CONVERSATION_ID_STORAGE_KEY, conversationId);
  return conversationId;
}

/**
 * Stable user-level identifier persisted in localStorage.
 * All conversations created in this browser are scoped to this UUID,
 * which is sent to the backend as `userId` for filtering and indexing.
 */
function getOrCreateEoUuid(): string {
  const cached = localStorage.getItem(EO_USER_ID_STORAGE_KEY);
  if (cached) return cached;

  const eoUuid = crypto.randomUUID();
  localStorage.setItem(EO_USER_ID_STORAGE_KEY, eoUuid);
  return eoUuid;
}

function isWebSearchToolEvent(event: RawSseEvent): boolean {
  if (event.eventType !== 'tool_called' || !event.data || typeof event.data !== 'object') {
    return false;
  }
  const tool = (event.data as { tool?: unknown }).tool;
  return tool === 'web_search' || tool === 'browser';
}

// Module-level dedup flag — outside React lifecycle, unaffected by StrictMode
let _historyFetchInFlight = false;

export default function App() {
  return (
    <I18nProvider>
      <AppInner />
    </I18nProvider>
  );
}

function AppInner() {
  const { t, lang } = useT();

  const buildLamps = useCallback((): ToolLampState[] => LAMP_IDS.map(id => ({
    id,
    label: t(LAMP_I18N_KEYS[id] as MessageKeys),
    icon: LAMP_ICONS[id],
    active: false,
    animKey: 0,
  })), [t]);

  const [messages, setMessages] = useState<Message[]>([]);
  // 工具灯 UI 已从智能体顶栏移除；状态与 SSE 更新保留，便于日后恢复展示
  const [, setLamps]            = useState<ToolLampState[]>(buildLamps);
  const [loading, setLoading]   = useState(false);
  // === uiStage 状态机(改造引入)===
  // Top-level UI state machine. Drives conditional rendering in later tasks
  // (Task 3, 4, 12 ...) — replaces ad-hoc `messages.length === 0` / `loading`
  // checks. Initial value is 'home' (产品首页作为首屏入口;点 logo 也可回到此处)。
  const [uiStage, setUiStage] = useState<UiStage>('home');
  const [historyLoading, setHistoryLoading] = useState(true);
  // Name of the skill currently being loaded by the SDK. null when no skill
  // is in flight. Set by the `skill_loaded` SSE event (singular — fires
  // when the SDK ACTUALLY loads a skill for this turn), auto-cleared
  // after a short interval so the pill animates out.
  const [skillInUse, setSkillInUse] = useState<string | null>(null);
  /**
   * Right-dock tab. The agent cockpit ('agents') is the default and always
   * available — it shows the 6-agent standby view before any output arrives.
   * 'debug' (SSE trace) and 'code' (architecture viewer) are manual tabs.
   */
  const [dockMode, setDockMode] = useState<'chat' | 'code' | 'debug'>('chat');

  // === Phase 4 Task 10: super-skill orchestrator state ===
  // suggest_actions: button group rendered under chat input after super-skill completes
  const [suggestActions, setSuggestActions] = useState<SuggestAction[]>([]);
  // agent_outputs: keyed by agent_id (e.g. "agent1-固有对象"), shown in right AgentPane
  const [agentOutputs, setAgentOutputs] = useState<Record<string, AgentOutput>>({});
  // active agent tab in the right pane — defaults to the synthesis agent (agent6)
  const [activeAgentTab, setActiveAgentTab] = useState<string>(DEFAULT_AGENT_TAB);
  // currently visible report (set when report_ready SSE fires from agent6.export_report)
  const [report, setReport] = useState<ReportReady | null>(null);

  // === Capture per-agent streaming text ===
  // Backend emits `agent_output` SSE as a SECTION MARKER (only carries agent_id),
  // not as a complete payload. To make each agent tab clickable with real content
  // (during workflow AND after completion), we track which agent is currently
  // producing text and append every text_delta into its `summary` field.
  const currentAgentIdRef = useRef<string | null>(null);

  /**
   * Reset all super-skill orchestrator UI state. Must run on every
   * conversation switch / create / delete so the always-on cockpit and
   * pipeline never show stale outputs from another conversation.
   */
  const resetAgentState = useCallback(() => {
    setAgentOutputs({});
    setSuggestActions([]);
    setActiveAgentTab(DEFAULT_AGENT_TAB);
    setReport(null);
    currentAgentIdRef.current = null;
  }, []);

  // Conversation list state (left sidebar)
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [conversationsLoading, setConversationsLoading] = useState(true);
  const [conversationsLoadingMore, setConversationsLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined);
  const [activeConversationId, setActiveConversationId] = useState<string>(() =>
    getOrCreateConversationId(),
  );

  // Stable user identifier — derived once, never changes for the lifetime of this browser
  const eoUuidRef = useRef<string>(getOrCreateEoUuid());

  // Update lamp labels when language changes
  useEffect(() => {
    setLamps(prev => prev.map(l => ({
      ...l,
      label: t(LAMP_I18N_KEYS[l.id] as MessageKeys),
    })));
  }, [t]);

  const [debugEvents, setDebugEvents] = useState<RawSseEvent[]>([]);

  const botMsgIdRef = useRef<string>('');
  const abortCtrlRef = useRef<AbortController | null>(null);
  const conversationIdRef = useRef<string>(activeConversationId);

  // Keep ref in sync with state — sendMessageStream and other callbacks read from ref
  useEffect(() => {
    conversationIdRef.current = activeConversationId;
  }, [activeConversationId]);

  // Guard: don't overwrite snapshot during initial restore phase.
  // Only start persisting once user has interacted (sent a message).
  const initDoneRef = useRef(false);

  // Persist UI snapshot whenever messages change (debounced)
  const snapshotTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (messages.length === 0) return;
    if (!initDoneRef.current) return; // Skip snapshot save during restore phase

    if (snapshotTimerRef.current) clearTimeout(snapshotTimerRef.current);
    snapshotTimerRef.current = setTimeout(() => {
      saveSnapshot(conversationIdRef.current, messages);
    }, 500);

    return () => {
      if (snapshotTimerRef.current) clearTimeout(snapshotTimerRef.current);
    };
  }, [messages]);

  /**
   * Load a conversation's messages, snapshot and image cache and put them on screen.
   * Used both for the initial restore and for switching to another conversation.
   */
  const loadConversation = useCallback(async (convId: string) => {
    setHistoryLoading(true);
    setMessages([]);
    setDebugEvents([]);
    resetAgentState();
    initDoneRef.current = false;

    revokeAllObjectUrls();

    try {
      const [history, snapshot, storedImages] = await Promise.all([
        fetchConversationHistory(convId, eoUuidRef.current),
        loadSnapshot(convId),
        loadConversationImages(convId),
      ]);

      const imageUrlMap = new Map<string, { url: string; mimeType: string; size: number; storageKey: string }>();
      for (const record of storedImages) {
        const url = createObjectUrl(record.storageKey, record.blob);
        imageUrlMap.set(record.imageId, {
          url,
          mimeType: record.mimeType,
          size: record.size,
          storageKey: record.storageKey,
        });
      }

      function rebuildImages(images: Message['images']): Message['images'] {
        if (!images || images.length === 0) return images;
        return images.map(img => {
          if (typeof img === 'string') return img;
          const urlInfo = imageUrlMap.get(img.id);
          return urlInfo ? { ...img, url: urlInfo.url, persistent: true } : img;
        });
      }

      let merged: Message[];
      if (snapshot.length > 0) {
        merged = snapshot.map(msg => ({
          ...msg,
          images: rebuildImages(msg.images),
        }));
      } else if (history.length > 0) {
        merged = history;
      } else {
        merged = [];
      }

      setMessages(merged);

      // === Restore agent outputs from history ===
      // agent_outputs state is ephemeral by default — it only fills from
      // live SSE during a workflow. After page reload / conversation
      // switch, agentOutputs is empty (resetAgentState above), so all
      // agent tabs show "待命" — even though the assistant message text
      // contains the full workflow output.
      //
      // Reconstruction: concatenate all assistant message text from this
      // conversation, run parseAgentOutputs on it, populate agentOutputs.
      // This makes the agent tabs clickable post-load.
      const assistantText = merged
        .filter(m => m.role === 'assistant' && m.content)
        .map(m => m.content)
        .join('\n\n');
      if (assistantText) {
        const restoredSections = parseAgentOutputs(assistantText);
        if (Object.keys(restoredSections).length > 0) {
          const now = Date.now();
          const restoredOutputs: Record<string, AgentOutput> = {};
          for (const [agentId, summary] of Object.entries(restoredSections)) {
            restoredOutputs[agentId] = {
              agent_id: agentId,
              summary,
              output_json: {},
              timestamp: now,
            };
          }
          setAgentOutputs(prev => ({ ...prev, ...restoredOutputs }));
        }
      }
    } finally {
      setHistoryLoading(false);
    }
  }, [resetAgentState]);

  /** Refresh the sidebar conversation list — usually after sending or switching. */
  const refreshConversations = useCallback(async (mode: 'replace' | 'append' = 'replace', cursor?: string) => {
    if (mode === 'append') {
      setConversationsLoadingMore(true);
    } else {
      setConversationsLoading(true);
    }
    try {
      const res = await listConversations({
        userId: eoUuidRef.current,
        limit: CONVERSATIONS_PAGE_SIZE,
        order: 'desc',
        after: cursor,
      });

      setNextCursor(res.nextCursor);

      if (mode === 'append') {
        setConversations(prev => {
          const seen = new Set(prev.map(c => c.id));
          const merged = [...prev];
          for (const c of res.conversations) {
            if (!seen.has(c.id)) merged.push(c);
          }
          return merged;
        });
      } else {
        setConversations(res.conversations);
      }
    } finally {
      if (mode === 'append') {
        setConversationsLoadingMore(false);
      } else {
        setConversationsLoading(false);
      }
    }
  }, []);

  // Initial load: history (only if previously visited) + conversations list
  useEffect(() => {
    void refreshConversations('replace');

    if (!BOOT_HAD_CONVERSATION || _historyFetchInFlight) {
      // First visit OR a sibling fetch is in flight — skip history fetch
      if (!BOOT_HAD_CONVERSATION) setHistoryLoading(false);
      return;
    }

    _historyFetchInFlight = true;
    loadConversation(conversationIdRef.current).finally(() => {
      _historyFetchInFlight = false;
    });
    // 刷新恢复旧会话时停留在产品介绍页（uiStage 保持初始 'home'），由用户自行导航
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Update the current bot message's content via an updater function. */
  const updateBotMessage = useCallback((updater: (content: string) => string) => {
    setMessages(prev =>
      prev.map(m =>
        m.id === botMsgIdRef.current
          ? { ...m, content: updater(m.content) }
          : m
      )
    );
  }, []);

  const setBotActivity = useCallback((activity: Message['activity']) => {
    setMessages(prev =>
      prev.map(m =>
        m.id === botMsgIdRef.current
          ? { ...m, activity }
          : m
      )
    );
  }, []);

  const finishBotActivity = useCallback(() => {
    setMessages(prev => {
      let changed = false;
      const next = prev.map(m => {
        if (m.id === botMsgIdRef.current && m.activity?.status === 'active') {
          changed = true;
          return { ...m, activity: { ...m.activity, status: 'done' as const } };
        }
        return m;
      });
      return changed ? next : prev;
    });
  }, []);

  /** Clear the assistant message's `streaming` flag (hides the blinking caret). */
  const clearBotStreaming = useCallback(() => {
    setMessages(prev => {
      let changed = false;
      const next = prev.map(m => {
        if (m.id === botMsgIdRef.current && m.streaming) {
          changed = true;
          const { streaming, ...rest } = m;
          return rest;
        }
        return m;
      });
      return changed ? next : prev;
    });
  }, []);

  /** Handle an incoming image SSE event: persist to IndexedDB and append ref to message. */
  const handleImageEvent = useCallback(async (payload: ImageSsePayload) => {
    const { imageId, base64, mimeType = 'image/png', size } = payload;
    const convId = conversationIdRef.current;
    const msgId = botMsgIdRef.current;
    const storageKey = makeStorageKey(convId, imageId);

    const blob = base64ToBlob(base64, mimeType);
    const actualSize = size || blob.size;
    let persistent = false;

    try {
      await saveImage({
        conversationId: convId,
        messageId: msgId,
        imageId,
        blob,
        mimeType,
      });
      persistent = true;
    } catch (e) {
      console.warn('[image] IndexedDB save failed, using temporary URL:', e);
    }

    const url = persistent
      ? createObjectUrl(storageKey, blob)
      : URL.createObjectURL(blob);

    const attachment: ImageAttachment = {
      id: imageId,
      storageKey,
      url,
      mimeType,
      size: actualSize,
      createdAt: Date.now(),
      persistent,
    };

    setMessages(prev =>
      prev.map(m =>
        m.id === msgId
          ? { ...m, images: [...(m.images || []), attachment] }
          : m
      )
    );
  }, []);

  const finishStream = useCallback(() => {
    setLoading(false);
    // === uiStage 状态机(改造引入)===
    // SSE done/error fired — agent pipeline finished, user is now reviewing
    // the assistant's reply. (loading=false && messages.length>0 → 'conclusion'.)
    setUiStage('conclusion');
    abortCtrlRef.current = null;
    // Stop appending subsequent text_delta into any agent's summary —
    // the section marker is now closed.
    currentAgentIdRef.current = null;
  }, []);

  const handleSend = useCallback(async (text: string) => {
    initDoneRef.current = true;
    setDockMode('chat');
    setSuggestActions([]); // previous turn's follow-ups are stale the moment a new run starts
    // Reset the per-agent text accumulator at the start of each turn —
    // the next agent_output SSE event will re-bind text_delta to the
    // appropriate agent.
    currentAgentIdRef.current = null;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };

    const botMsgId = crypto.randomUUID();
    botMsgIdRef.current = botMsgId;
    const botMsg: Message = {
      id: botMsgId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      streaming: true,
    };

    setMessages(prev => [...prev, userMsg, botMsg]);
    setLoading(true);
    // === uiStage 状态机(改造引入)===
    // User just sent a message — agent pipeline is now running on the agents screen.
    setUiStage('agents');

    /**
     * Optimistic sidebar update — fires as soon as the backend emits its first
     * SSE event (matches ChatGPT's "new chat appears the moment streaming
     * starts" UX). For brand-new conversations we prepend a synthesized summary;
     * for existing ones we just bump them to the top.
     *
     * Server reconciliation still happens in onDone() via refreshConversations,
     * which can correct the title if the runtime later overrides it.
     */
    let sidebarPrimed = false;
    const cleanedText = text.replace(/\s+/g, ' ').trim();
    const optimisticTitle =
      cleanedText.length === 0 ? 'New chat'
        : cleanedText.length <= 8 ? cleanedText
          : `${cleanedText.slice(0, 8)}...`;

    const primeSidebar = () => {
      if (sidebarPrimed) return;
      sidebarPrimed = true;

      const convId = conversationIdRef.current;
      const now = Date.now();

      setConversations(prev => {
        const idx = prev.findIndex(c => c.id === convId);
        if (idx === -1) {
          // Brand-new conversation — prepend.
          const summary: ConversationSummary = {
            id: convId,
            title: optimisticTitle,
            lastMessageAt: now,
            userId: eoUuidRef.current,
          };
          return [summary, ...prev];
        }
        // Existing conversation — bump to top and refresh timestamp.
        const next = [...prev];
        const [moved] = next.splice(idx, 1);
        next.unshift({ ...moved, lastMessageAt: now });
        return next;
      });
    };

    // Local accumulator for the assistant's full streamed text. We cannot
    // read it back from React state inside onDone (state updates are async
    // and closure-bound), so the SSE text_delta handler appends here too.
    // Used only to fire-and-forget log the assistant message to /log-message.
    let assistantText = '';

    const ctrl = sendMessageStream(text, {
      onTextDelta(delta) {
        finishBotActivity();
        // Accumulate locally so onDone can fire-and-forget log the full
        // assistant text without having to read it back from state.
        assistantText += delta;
        updateBotMessage(content => content + delta);

        // === Capture per-agent streaming text by SECTION HEADER pattern ===
        // The super-skill orchestrator runs agent1 + agent2 IN PARALLEL for
        // Phase 1, so their `agent_output` SSE events fire back-to-back
        // (ms apart). A subsequent text_delta then carries BOTH agents'
        // results, separated by markdown headers like
        // "## 🏠 Agent1 固有对象输出" and "## 📑 Agent2 政策应答输出".
        //
        // Tracking "current agent" by the most recent agent_output event
        // would assign the entire combined blob to whichever sub-skill
        // loaded last. Instead, we slice the FULL accumulated text by
        // section header regex on every delta — this correctly attributes
        // each segment regardless of SSE event timing.
        // Use parseAgentOutputs (with summary-table fallback) instead of
        // sliceAgentSections alone — handles the case where LLM keeps
        // agent1/2/3 outputs internal and only emits the agent6 summary
        // table at the end.
        const sections = parseAgentOutputs(assistantText);

        // === DIAGNOSTIC LOG === gated by localStorage flag.
        // Enable in browser console:  localStorage.setItem('agentDebug', '1')
        // Disable:                     localStorage.removeItem('agentDebug')
        if (typeof localStorage !== 'undefined' && localStorage.getItem('agentDebug')) {
          // eslint-disable-next-line no-console
          console.log('[agentDebug] onTextDelta', {
            deltaLen: delta.length,
            accTextLen: assistantText.length,
            sectionsFound: Object.keys(sections),
            accTextHead: assistantText.slice(0, 150),
            accTextTail: assistantText.slice(-150),
            // Show all H2/H3 header lines found in accumulated text
            headerLines: (assistantText.match(/^#{2,3}[^\n]*$/gm) || []).slice(-12),
            // Show summary-table detection
            summaryHeaderMatch: /六\s*[Aa]gent\s*(?:灯色一览|总览|输出摘要|汇总)/.test(assistantText),
          });
        }

        if (Object.keys(sections).length > 0) {
          // Update currentAgentIdRef to the agent that owns the live tail
          // (so any post-section orchestrator text is attributed correctly).
          const liveAgent = detectCurrentAgent(assistantText);
          if (liveAgent) currentAgentIdRef.current = liveAgent;

          setAgentOutputs(prev => {
            let changed = false;
            const next = { ...prev };
            for (const [agentId, sectionText] of Object.entries(sections)) {
              const existing = next[agentId];
              // Skip if section text hasn't changed (avoid useless renders)
              if (existing?.summary === sectionText) continue;
              changed = true;
              next[agentId] = {
                agent_id: agentId,
                summary: sectionText,
                output_json: existing?.output_json ?? {},
                timestamp: existing?.timestamp,
              };
            }
            return changed ? next : prev;
          });
        }
      },

      onToolCalled(toolName) {
        if (toolName === 'web_search' || toolName === 'browser') {
          setBotActivity({ type: 'web_search', label: 'Web searching...', status: 'active' });
        }

        const lampId = toolToLampId(toolName);
        if (!lampId) return;

        setLamps(prev =>
          prev.map(l =>
            l.id === lampId
              ? { ...l, active: true, animKey: l.animKey + 1 }
              : l
          )
        );
        setTimeout(() => {
          setLamps(prev =>
            prev.map(l => (l.id === lampId ? { ...l, active: false } : l))
          );
        }, 1000);
      },

      onImage(payload) {
        finishBotActivity();
        handleImageEvent(payload);
      },

      // === Phase 4 Task 10: super-skill orchestrator SSE callbacks ===
      onSuggestActions(actions) {
        setSuggestActions(actions);
        // Bring the cockpit into focus when the orchestrator offers follow-ups
        if (actions.some(a => a.id.startsWith('view_agent'))) {
          setDockMode('chat');
        }
      },

      onAgentOutput(output) {
        // Backend sends `agent_output` SSE as a section marker — only the
        // agent_id, no payload. We initialize the slot if missing so the
        // PipelineBar tint and tab "已完成" indicator light up immediately
        // (visible feedback that the agent has been invoked).
        //
        // NOTE: we deliberately do NOT update `currentAgentIdRef` here.
        // The orchestrator runs agent1 + agent2 in parallel and their
        // agent_output events fire within milliseconds of each other;
        // then a single text_delta delivers BOTH results prefixed by
        // markdown section headers. Naively binding text_delta to the
        // most recent agent_output would mis-assign the combined text.
        // Instead, `onTextDelta` parses the full accumulated text by
        // section header regex (`## 🏠 Agent1` / `## 📑 Agent2` ...) and
        // distributes content correctly. See src/lib/agentSections.ts.
        const agentId = output.agent_id;
        setAgentOutputs(prev => {
          const existing = prev[agentId];
          if (existing) {
            // Already populated (e.g. by text-delta section parser) —
            // just refresh timestamp meta, keep content.
            if (existing.timestamp && output.timestamp && existing.timestamp <= output.timestamp) {
              return prev;
            }
            return {
              ...prev,
              [agentId]: { ...existing, ...output, summary: existing.summary ?? output.summary ?? '' },
            };
          }
          return {
            ...prev,
            [agentId]: {
              agent_id: agentId,
              summary: output.summary ?? '',
              output_json: output.output_json ?? {},
              timestamp: output.timestamp,
            },
          };
        });
        setDockMode('chat');
      },

      onReportReady(nextReport) {
        setReport(nextReport);
      },

      onRawEvent(event) {
        // Every backend SSE frame flows through here, so this is the cheapest
        // hook for "first byte from backend" — covers text_delta, tool_called,
        // skills_available, debug_msg, image, etc.
        primeSidebar();

        if (!isWebSearchToolEvent(event)) {
          finishBotActivity();
        }

        // Detect WSA_API_KEY-missing tool errors. The Claude SDK surfaces
        // tool errors as a `debug_msg` whose `preview` is a serialized
        // tool-result blob — but the shape differs by SDK language:
        //   TypeScript SDK → JSON-style:  "type":"tool_result", "is_error":true
        //   Python SDK     → repr-style:  ToolResultBlock(..., is_error=None)
        // (Yes, the Python SDK leaves is_error=None even on actual tool
        // failures; the failure is signalled only by the error message
        // text itself.) So we cannot rely on is_error and instead match:
        //   1. the literal env var name "WSA_API_KEY" (stable across
        //      locales — it's an env-var, not a translatable string), AND
        //   2. a tool-result context marker that survives both shapes.
        // The context guard prevents a user prompt that literally contains
        // "WSA_API_KEY" from flipping the chip to error.
        // Not persisted: a refresh clears the chip; a successful retry
        // calls setBotActivity({ status: 'active' }) and clears errorCode.
        if (event.eventType === 'debug_msg') {
          const preview = (event.data as { preview?: string } | null)?.preview;
          if (
            typeof preview === 'string' &&
            preview.includes('WSA_API_KEY') &&
            (
              preview.includes('tool_result') ||
              preview.includes('tool_use_result') ||
              preview.includes('ToolResultBlock')
            )
          ) {
            setBotActivity({
              type: 'web_search',
              label: 'Web search unavailable',
              status: 'error',
              errorCode: 'wsa_missing',
            });
          }
        }

        // Coalesce consecutive text_delta events into a single growing entry,
        // so a multi-paragraph response doesn't flood the debug panel with
        // hundreds of one-token rows.
        if (event.eventType === 'text_delta') {
          const delta = (event.data as { delta?: string } | null)?.delta ?? '';
          setDebugEvents(prev => {
            const last = prev[prev.length - 1];
            if (last && last.eventType === 'text_delta') {
              const prevDelta = (last.data as { delta?: string } | null)?.delta ?? '';
              const merged: RawSseEvent = {
                ...last,
                data: { delta: prevDelta + delta },
                raw: last.raw + delta,
                timestamp: event.timestamp,
              };
              return [...prev.slice(0, -1), merged];
            }
            return [...prev, event];
          });
          return;
        }
        setDebugEvents(prev => [...prev, event]);
        // Only react to `skill_loaded` (singular). The plural
        // `skills_available` / `skills_loaded` events fire on every
        // request as catalog/config announcements regardless of whether
        // the model actually uses a skill — they would flash the pill on
        // every chat. The event payload's `name` is the skill's identifier;
        // we surface it directly so the user sees WHICH skill is loading.
        if (event.eventType === 'skill_loaded') {
          const name =
            (event.data as { name?: unknown } | null)?.name;
          if (typeof name === 'string' && name.length > 0) {
            setSkillInUse(name);
            setTimeout(() => setSkillInUse(null), 2000);
          }
        }
      },

      onDone() {
        finishBotActivity();
        clearBotStreaming();
        finishStream();
        // Reconcile with backend so the title (and any other fields the runtime
        // synthesized) reflect the server's authoritative state.
        void refreshConversations('replace');

        // Fire-and-forget log of this complete turn (user + assistant) into
        // the libSQL `conversations` table via /log-message. Promise.allSettled
        // is intentionally NOT awaited — logging must never block the chat UX,
        // and any rejection is swallowed silently inside logMessage().
        const convId = conversationIdRef.current;
        const uid = eoUuidRef.current;
        const userContent = text;
        const assistantContent = assistantText;
        if (convId) {
          void Promise.allSettled([
            logMessage({ conversationId: convId, userId: uid, role: 'user', content: userContent }),
            logMessage({ conversationId: convId, userId: uid, role: 'assistant', content: assistantContent }),
          ]);
        }
      },

      onError() {
        finishBotActivity();
        clearBotStreaming();
        updateBotMessage(content => content || t("status.error"));
        finishStream();
      },
    }, conversationIdRef.current, { userMsgId: userMsg.id, botMsgId }, eoUuidRef.current);

    abortCtrlRef.current = ctrl;
  }, [updateBotMessage, setBotActivity, finishBotActivity, handleImageEvent, finishStream, refreshConversations, t]);

  // NOTE: `handleClearHistory` (formerly wired to ChatInput's trash button)
  // was removed in Task 3 along with the ChatInput component. Clearing the
  // current conversation is now functionally equivalent to deleting it via
  // the sidebar trash (see `handleDeleteConversation`). If a dedicated
  // "clear" affordance is reintroduced later (e.g. sidebar context menu),
  // resurrect this callback from git history at that time.

  const handleStop = useCallback(() => {
    if (abortCtrlRef.current) {
      abortCtrlRef.current.abort();
      abortCtrlRef.current = null;
    }

    finishBotActivity();
    // Clear the in-bubble blinking caret. onDone/onError normally do this,
    // but fetch.abort() throws AbortError that sendMessageStream silently
    // swallows — neither callback fires, so we have to do it here too.
    clearBotStreaming();
    updateBotMessage(content => content ? content + '\n\n' + t("status.stopped") : t("status.stopped"));
    setLoading(false);
    // === uiStage 状态机(改造引入)===
    // User aborted the run — they're now reviewing the partial reply
    // (loading=false && messages.length>0 → 'conclusion'.)
    setUiStage('conclusion');
    // Stop appending further text_delta into any agent's summary.
    currentAgentIdRef.current = null;

    stopAgent(conversationIdRef.current).then(ok => {
      if (!ok) {
        updateBotMessage(content => content + '\n\n' + t("status.backendError"));
      }
    });
  }, [finishBotActivity, clearBotStreaming, updateBotMessage, t]);

  /** User clicked a conversation in the sidebar. */
  const handleSelectConversation = useCallback((id: string) => {
    if (loading) return; // disabled while streaming
    if (id === conversationIdRef.current) return;
    resetAgentState();
    localStorage.setItem(CONVERSATION_ID_STORAGE_KEY, id);
    conversationIdRef.current = id;
    setActiveConversationId(id);
    setDockMode('chat');
    // === 切到旧会话跳结论屏,查看历史消息与结论 ===
    setUiStage('conclusion');
    void loadConversation(id);
  }, [loading, loadConversation, resetAgentState]);

  /** User clicked "New chat" in the sidebar. */
  const handleCreateConversation = useCallback(() => {
    if (loading) return;

    revokeAllObjectUrls();
    resetAgentState();

    const newId = crypto.randomUUID();
    localStorage.setItem(CONVERSATION_ID_STORAGE_KEY, newId);
    conversationIdRef.current = newId;
    setActiveConversationId(newId);
    setMessages([]);
    setDebugEvents([]);
    setDockMode('chat');
    initDoneRef.current = false;
    setHistoryLoading(false);
    // === 新建会话先进过渡页(transition),再进 22 字段采集 ===
    setUiStage('transition');
  }, [loading, resetAgentState]);

  const handleLoadMoreConversations = useCallback(() => {
    if (!nextCursor || conversationsLoadingMore) return;
    void refreshConversations('append', nextCursor);
  }, [nextCursor, conversationsLoadingMore, refreshConversations]);

  /**
   * Phase 4 Task 10 — Handle clicks on suggest_action buttons.
   *
   * Action id convention (set by super-skill orchestrator):
   *   - `view_agent<id>`      → switch the right AgentPane to that tab and expand it
   *   - `export_report`        → no-op client-side; the actual export is performed
   *                              server-side by agent6.export_report and arrives
   *                              later as a `report_ready` SSE event. The button
   *                              is still useful as an explicit "I want this" signal.
   *   - `rerun_agent`          → re-send the previous user message (best-effort
   *                              re-run; the orchestrator decides what to actually do)
   *   - any other id           → ignore (forward-compat for future actions)
   */
  const handleSuggestActionClick = useCallback((action: SuggestAction) => {
    if (action.id.startsWith('view_agent')) {
      // Strip "view_" prefix to get the agent_id (e.g. "agent1-固有对象")
      const agentId = action.id.replace(/^view_/, '');
      setActiveAgentTab(agentId);
      setDockMode('chat');
      return;
    }

    if (action.id === 'export_report') {
      // The export itself is server-driven: agent6.export_report emits
      // report_ready SSE which pops the modal. Nothing to do here but
      // mark intent — could be wired to a tracking event if needed.
      return;
    }

    if (action.id === 'rerun_agent') {
      // Re-run = re-send the most recent user message (best-effort).
      setSuggestActions([]); // clear suggestions to avoid stuck buttons
      const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
      if (lastUserMsg?.content) {
        void handleSend(lastUserMsg.content);
      }
      return;
    }
  }, [messages, handleSend]);

  /**
   * User clicked the trash icon on a sidebar item.
   *
   * Optimistic delete: immediately remove the item from local UI state and
   * fire-and-forget the backend request. We don't await or block the user —
   * if the network call fails, we log it but don't roll back, since reloading
   * the page will reconcile via /conversations anyway.
   */
  const handleDeleteConversation = useCallback((id: string) => {
    if (loading) return;        // never delete mid-stream
    if (!id) return;

    const confirmed = window.confirm(t('sidebar.deleteConfirm'));
    if (!confirmed) return;

    const isActive = id === conversationIdRef.current;

    // 1. Optimistically drop from sidebar.
    setConversations(prev => prev.filter(c => c.id !== id));

    // 2. If it was the active conversation, swap to a fresh empty one
    //    so the chat panel doesn't keep rendering stale messages.
    if (isActive) {
      revokeAllObjectUrls();
      resetAgentState();
      const newId = crypto.randomUUID();
      localStorage.setItem(CONVERSATION_ID_STORAGE_KEY, newId);
      conversationIdRef.current = newId;
      setActiveConversationId(newId);
      setMessages([]);
      setDebugEvents([]);
      setDockMode('chat');
      initDoneRef.current = false;
      setHistoryLoading(false);
    }

    // 3. Best-effort cleanup of local caches — user doesn't wait on these.
    void deleteSnapshot(id).catch(() => {});
    void deleteConversationImages(id).catch(() => {});

    // 4. Fire-and-forget backend delete. If it fails the user can refresh.
    void deleteConversation(id, eoUuidRef.current).catch(e => {
      console.warn('[delete-conversation] backend request failed:', e);
    });
  }, [loading, t, resetAgentState]);

  const sidebarHasMore = useMemo(() => Boolean(nextCursor), [nextCursor]);

  // 导航高亮：management 屏包含 transition/input 两个子屏
  const navIsActive = (stage: UiStage) => {
    if (stage === 'management') {
      return uiStage === 'management' || uiStage === 'transition' || uiStage === 'input';
    }
    return uiStage === stage;
  };

  // === V4.0 全局工具栏：搜索（⌘K）/ 通知 / 用户 popover ===
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // 工具栏少量文案（内联双语，避免为视觉件扩 i18n 表）
  const GT = {
    searchPh: { zh: '搜索页面、智能体…', en: 'Search screens, agents…' },
    heading: { zh: '快速跳转', en: 'Quick jump' },
    screen: { zh: '页面导航', en: 'Navigation' },
    agent: { zh: '智能体', en: 'Agent' },
    noticeTitle: { zh: '通知', en: 'Notifications' },
    noticeEmpty: { zh: '暂无新通知，智能体运行完成后会在这里推送。', en: 'No new notifications yet.' },
    agentDone: { zh: '已完成分析', en: 'finished analysis' },
    userTitle: { zh: '账号', en: 'Account' },
    version: { zh: '万象更芯 V4.0 · 大气版', en: 'WANXIANG CORE V4.0' },
    exit: { zh: '退出演示', en: 'Exit demo' },
  } as const;
  const gt = (k: keyof typeof GT) => GT[k][lang];

  // 搜索索引 = 四个一级屏 + 七个智能体 tab（点击直达）
  const searchIndex = useMemo(() => {
    const screens = NAV_ITEMS.map(n => ({
      label: t(n.label), sub: gt('screen'), stage: n.stage, agentId: undefined as string | undefined,
    }));
    const agents = AGENT_TABS.map(a => ({
      label: a.name, sub: gt('agent'), stage: 'agents' as UiStage, agentId: a.id as string | undefined,
    }));
    return [...screens, ...agents];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, lang]);

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return searchIndex;
    return searchIndex.filter(i => i.label.toLowerCase().includes(q));
  }, [searchIndex, searchQuery]);

  const handleSearchGo = useCallback((item: { stage: UiStage; agentId?: string }) => {
    setUiStage(item.stage);
    if (item.agentId) setActiveAgentTab(item.agentId);
    setSearchOpen(false);
    setSearchQuery('');
  }, []);

  // ⌘K / Ctrl+K 唤起搜索；Esc 关闭全部 popover
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setNoticeOpen(false); setUserOpen(false);
        setSearchOpen(true);
        requestAnimationFrame(() => searchInputRef.current?.focus());
      }
      if (e.key === 'Escape') {
        setSearchOpen(false); setNoticeOpen(false); setUserOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // 点击工具栏外部关闭 popover
  useEffect(() => {
    if (!searchOpen && !noticeOpen && !userOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest?.('.global-tools')) {
        setSearchOpen(false); setNoticeOpen(false); setUserOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [searchOpen, noticeOpen, userOpen]);

  // 通知 = 已完成的智能体（真实状态，不伪造）
  const notices = AGENT_TABS.filter(a => agentOutputs[a.id]);
  const activeConversation = conversations.find(c => c.id === activeConversationId);
  const projectLabel = activeConversation?.title || (lang === 'zh' ? '未命名项目' : 'Untitled Project');

  return (
    <div className={`app-root ${uiStage === 'home' ? 'home-fullscreen' : ''}`}>
      {/* === V4.0 顶栏：W 标 brand + 四导航 + 项目 pill + 全局工具 === */}
      <nav className="topbar">
        <button
          className="brand"
          onClick={() => setUiStage('home')}
          aria-label={t('app.title')}
          title={t('app.title')}
        >
          <span className="brand-mark">
            <span className="mark-niu">牛</span>
            <i className="mark-ai">AI</i>
          </span>
          <span className="brand-name">
            <span className="brand-title">{t('app.title')}</span>
            <span className="brand-en">{t('app.subtitle')}</span>
          </span>
        </button>

        <div className="mainnav" role="tablist">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.stage}
              type="button"
              role="tab"
              aria-selected={navIsActive(item.stage)}
              className={navIsActive(item.stage) ? 'active' : ''}
              onClick={() => setUiStage(item.stage)}
            >
              {t(item.label)}
            </button>
          ))}
        </div>

        <div className="topmeta">
          <span className="project-pill" title={projectLabel}>{projectLabel}</span>
          <span className="mode-pill">DECISION CORE</span>

          <div className="global-tools">
            {/* 全局搜索（⌘K）：屏 + 智能体直达 */}
            <div className="global-search">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <input
                ref={searchInputRef}
                value={searchQuery}
                onFocus={() => { setSearchOpen(true); setNoticeOpen(false); setUserOpen(false); }}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={gt('searchPh')}
                aria-label={gt('searchPh')}
              />
              <kbd>⌘K</kbd>
              {searchOpen && (
                <div className="tool-popover search-popover">
                  <div className="popover-heading">
                    {gt('heading')}
                    <span className="popover-count">{searchResults.length}</span>
                  </div>
                  {searchResults.slice(0, 8).map((item) => (
                    <button
                      key={`${item.stage}-${item.agentId ?? 'screen'}`}
                      type="button"
                      className="search-result"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleSearchGo(item)}
                    >
                      {item.label}
                      <small>{item.sub}</small>
                    </button>
                  ))}
                  {searchResults.length === 0 && (
                    <div className="popover-empty">{gt('searchPh')}</div>
                  )}
                </div>
              )}
            </div>

            {/* 通知：已完成的智能体（真实状态） */}
            <button
              type="button"
              className="tool-icon-btn"
              aria-label={gt('noticeTitle')}
              onClick={() => { setNoticeOpen(o => !o); setSearchOpen(false); setUserOpen(false); }}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M18 8a6 6 0 0 0-12 0c0 7-3 8-3 8h18s-3-1-3-8" />
                <path d="M13.7 21a2 2 0 0 1-3.4 0" />
              </svg>
              {notices.length > 0 && <i className="notice-dot" />}
            </button>
            {noticeOpen && (
              <div className="tool-popover notice-popover">
                <div className="popover-heading">
                  {gt('noticeTitle')}
                  <span className="popover-count">{notices.length}</span>
                </div>
                {notices.length > 0 ? notices.map((a) => (
                  <div key={a.id} className="search-result" style={{ cursor: 'default' }}>
                    {a.name}
                    <small>{gt('agentDone')}</small>
                  </div>
                )) : (
                  <div className="popover-empty">{gt('noticeEmpty')}</div>
                )}
              </div>
            )}

            {/* 用户 */}
            <button
              type="button"
              className="user-entry"
              aria-label={gt('userTitle')}
              onClick={() => { setUserOpen(o => !o); setSearchOpen(false); setNoticeOpen(false); }}
            >
              C
            </button>
            {userOpen && (
              <div className="tool-popover user-popover">
                <div className="user-card">
                  <span className="user-avatar">C</span>
                  <span>
                    <strong>CSCEC · DECISION</strong>
                    <small>{gt('version')}</small>
                  </span>
                </div>
                <button type="button" className="account-action" onClick={() => setUserOpen(false)}>
                  {gt('exit')}
                  <span aria-hidden="true">→</span>
                </button>
              </div>
            )}
            <LangToggle />
          </div>
        </div>
      </nav>

      {/* === 单屏主体（各屏自带 .screen 容器） === */}
      <main>
        {uiStage === 'home' && (
          <ProductHome onStart={() => setUiStage('transition')} />
        )}
        {uiStage === 'management' && (
          <ManagementView
            conversations={conversations}
            activeConversationId={activeConversationId}
            loading={conversationsLoading}
            loadingMore={conversationsLoadingMore}
            hasMore={sidebarHasMore}
            disabled={loading}
            onSelect={handleSelectConversation}
            onCreate={handleCreateConversation}
            onLoadMore={handleLoadMoreConversations}
            onDelete={handleDeleteConversation}
          />
        )}
        {uiStage === 'transition' && (
          <TransitionView onStart={() => setUiStage('input')} />
        )}
        {uiStage === 'input' && (
          <section className="screen active">
            <div className="shell">
              <IntakeWizard onSend={handleSend} disabled={false} />
            </div>
          </section>
        )}
        {uiStage === 'agents' && (
          <AgentsView
            skillInUse={skillInUse}
            onStop={handleStop}
            loading={loading}
            messages={messages}
            outputs={agentOutputs}
            activeAgentId={activeAgentTab}
            onAgentSelect={setActiveAgentTab}
            debugEvents={debugEvents}
            onClearDebug={() => setDebugEvents([])}
            dockMode={dockMode}
            onDockModeChange={setDockMode}
            onSend={handleSend}
          />
        )}
        {uiStage === 'conclusion' && (
          <ConclusionView
            report={report}
            suggestActions={suggestActions}
            onSuggestAction={handleSuggestActionClick}
            messages={messages}
            outputs={agentOutputs}
            onOpenAgents={() => setUiStage('agents')}
          />
        )}
      </main>

      {/* 历史加载遮罩（进入非 home 屏且正在加载历史） */}
      {uiStage !== 'home' && historyLoading && messages.length === 0 && (
        <div className="history-overlay">
          <div className="history-spinner" />
        </div>
      )}

      <GitHubLink />
      <DeployLink />
    </div>
  );
}
