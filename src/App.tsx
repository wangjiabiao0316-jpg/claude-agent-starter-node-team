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
import ToolIndicators from './components/ToolIndicators';
import ChatWindow from './components/ChatWindow';
import IntakeWizard from './components/IntakeWizard';
import StopButton from './components/StopButton';
import DebugPanel from './components/DebugPanel';
import CodeViewer from './components/CodeViewer';
import ConversationSidebar from './components/ConversationSidebar';
import GitHubLink from './components/GitHubLink';
import DeployLink from './components/DeployLink';
import CityScene from './components/CityScene';
import PipelineBar from './components/PipelineBar';
// === Phase 4 Task 10: super-skill orchestrator UI ===
import { SuggestActions } from './components/SuggestActions';
import { AgentPane, DEFAULT_AGENT_TAB } from './components/AgentPane';
import { ReportModal } from './components/ReportModal';
import styles from './App.module.css';

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
      <LangToggle />
      <AppInner />
    </I18nProvider>
  );
}

function AppInner() {
  const { t } = useT();

  const buildLamps = useCallback((): ToolLampState[] => LAMP_IDS.map(id => ({
    id,
    label: t(LAMP_I18N_KEYS[id] as MessageKeys),
    icon: LAMP_ICONS[id],
    active: false,
    animKey: 0,
  })), [t]);

  const [messages, setMessages] = useState<Message[]>([]);
  const [lamps, setLamps]       = useState<ToolLampState[]>(buildLamps);
  const [loading, setLoading]   = useState(false);
  // === uiStage 状态机(改造引入)===
  // Top-level UI state machine. Drives conditional rendering in later tasks
  // (Task 3, 4, 12 ...) — replaces ad-hoc `messages.length === 0` / `loading`
  // checks. Initial value is 'intake' (first visit / new project).
  const [uiStage, setUiStage] = useState<UiStage>('intake');
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
  const [dockMode, setDockMode] = useState<'agents' | 'code' | 'debug'>('agents');

  // === Phase 4 Task 10: super-skill orchestrator state ===
  // suggest_actions: button group rendered under chat input after super-skill completes
  const [suggestActions, setSuggestActions] = useState<SuggestAction[]>([]);
  // agent_outputs: keyed by agent_id (e.g. "agent1-固有对象"), shown in right AgentPane
  const [agentOutputs, setAgentOutputs] = useState<Record<string, AgentOutput>>({});
  // active agent tab in the right pane — defaults to the synthesis agent (agent6)
  const [activeAgentTab, setActiveAgentTab] = useState<string>(DEFAULT_AGENT_TAB);
  // currently visible report (set when report_ready SSE fires from agent6.export_report)
  const [report, setReport] = useState<ReportReady | null>(null);

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

    if (!getExistingConversationId() || _historyFetchInFlight) {
      // First visit OR a sibling fetch is in flight — skip history fetch
      if (!getExistingConversationId()) setHistoryLoading(false);
      return;
    }

    _historyFetchInFlight = true;
    loadConversation(conversationIdRef.current).finally(() => {
      _historyFetchInFlight = false;
    });
    // === Bugfix: 刷新页面恢复旧会话时,uiStage 必须切到 review,
    // 否则 IntakeWizard 会盖住 ChatWindow,用户看不到历史消息。 ===
    setUiStage('review');
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
    // the assistant's reply. (loading=false && messages.length>0 → 'review'.)
    setUiStage('review');
    abortCtrlRef.current = null;
  }, []);

  const handleSend = useCallback(async (text: string) => {
    initDoneRef.current = true;
    setDockMode('agents');
    setSuggestActions([]); // previous turn's follow-ups are stale the moment a new run starts

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
    // User just sent a message — agent pipeline is now running.
    setUiStage('running');

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
          setDockMode('agents');
        }
      },

      onAgentOutput(output) {
        setAgentOutputs(prev => ({ ...prev, [output.agent_id]: output }));
        setDockMode('agents');
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
    // (loading=false && messages.length>0 → 'review'.)
    setUiStage('review');

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
    setDockMode('agents');
    // === Bugfix: 切到旧会话必须切到 review 阶段,IntakeWizard 才会卸载、ChatWindow 才会显示历史消息 ===
    setUiStage('review');
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
    setDockMode('agents');
    initDoneRef.current = false;
    setHistoryLoading(false);
    // === Bugfix: 新建会话必须切回 intake 阶段,IntakeWizard 才会重新挂载 ===
    setUiStage('intake');
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
      setDockMode('agents');
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
      setDockMode('agents');
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

  return (
    <div className={styles.shell}>
      <CityScene />

      <div className={styles.stage}>
        <ConversationSidebar
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

        <div className={styles.chatPanel}>
          <header className={styles.header}>
            <div className={styles.headerLeft}>
              <span className={styles.logo}>⬡</span>
              <div>
                <p className={styles.title}>{t("app.title")}</p>
                <p className={styles.subtitle}>{t("app.subtitle")}</p>
              </div>
            </div>
            <div className={styles.headerActions}>
              <ToolIndicators lamps={lamps} />
              {skillInUse && <span className={styles.skillsLoading}>using {skillInUse}</span>}
              <StopButton visible={loading} onStop={handleStop} />
            </div>
          </header>

          <div className={styles.pipelineSlot}>
            <PipelineBar
              outputs={agentOutputs}
              activeAgentId={activeAgentTab}
              streaming={loading}
              onSelect={(agentId) => {
                setActiveAgentTab(agentId);
                setDockMode('agents');
              }}
            />
          </div>

          <div className={styles.chatWindowShell}>
            {uiStage === 'intake' ? (
              <div className={styles.intakeSlot}>
                <IntakeWizard onSend={handleSend} disabled={false} />
              </div>
            ) : (
              <ChatWindow messages={messages} loading={loading} />
            )}
            {historyLoading && messages.length === 0 && (
              <div className={styles.historyOverlay}>
                <div className={styles.historySpinner} />
              </div>
            )}
          </div>
          {/* === Phase 4 Task 10: super-skill suggest_actions button group === */}
          {suggestActions.length > 0 && (
            <SuggestActions
              actions={suggestActions}
              onClick={handleSuggestActionClick}
            />
          )}
        </div>

        {/* === Right dock: agent cockpit (always-on) / SSE trace / code === */}
        <div className={styles.dock}>
          <div className={styles.dockTabs} role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={dockMode === 'agents'}
              className={`${styles.dockTab} ${dockMode === 'agents' ? styles.dockTabActive : ''}`}
              onClick={() => setDockMode('agents')}
            >
              智能体
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={dockMode === 'debug'}
              className={`${styles.dockTab} ${dockMode === 'debug' ? styles.dockTabActive : ''}`}
              onClick={() => setDockMode('debug')}
            >
              Trace
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={dockMode === 'code'}
              className={`${styles.dockTab} ${dockMode === 'code' ? styles.dockTabActive : ''}`}
              onClick={() => setDockMode('code')}
            >
              代码
            </button>
          </div>
          <div className={styles.dockBody}>
            {dockMode === 'agents' && (
              <AgentPane
                outputs={agentOutputs}
                activeTab={activeAgentTab}
                onTabChange={setActiveAgentTab}
              />
            )}
            {dockMode === 'debug' && (
              <DebugPanel events={debugEvents} onClear={() => setDebugEvents([])} />
            )}
            {dockMode === 'code' && <CodeViewer />}
          </div>
        </div>
      </div>

      {/* === Phase 4 Task 10: super-skill report modal === */}
      <ReportModal report={report} onClose={() => setReport(null)} />

      <GitHubLink />
      <DeployLink />
    </div>
  );
}
