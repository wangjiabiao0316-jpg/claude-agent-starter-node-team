/**
 * Agent handler — EdgeOne Makers
 * ========================================
 *
 * File path agents/chat/index.ts maps to **POST /chat**
 *
 * context convention:
 *   context.request.body    — object, request body
 *   context.request.signal  — AbortSignal, set when /stop is called
 *   context.conversation_id — conversation ID
 *   context.store           — store adapter (appendMessage / getMessages / claudeSessionStore)
 *   context.tools           — EdgeOne platform sandbox toolkit
 */

import { createSdkMcpServer, getSessionInfo } from '@anthropic-ai/claude-agent-sdk';
import { resolveModelName, collectGatewayEnv } from '../_model';
import { createLogger } from '../_logger';
import { retrieveContext, type LibSqlEnv } from '../_libsql';
import { createChatStream } from './_stream';

const logger = createLogger('chat');
const retrieveLogger = createLogger('retrieve');

const SYSTEM_PROMPT =
  'You are an EdgeOne Makers Claude Agent SDK starter example: an out-of-the-box Agent template that helps developers quickly run through and validate platform capabilities.\n' +
  'When introducing yourself, clearly say that you are a demo Agent built with Claude Agent SDK on EdgeOne Makers, designed to showcase tool calling, streaming responses, and session memory for developers.\n' +
  'You can use the EdgeOne platform tools listed below, plus project skills exposed by the Claude Agent SDK.\n\n' +
  'Available tools:\n' +
  '- commands: execute safe shell commands in the sandbox (e.g. date, ls, uname).\n' +
  '- files: read, write, list, makeDir, exists, and remove files inside the sandbox.\n' +
  '  Parameters: op is required; path is required for most ops; content is required for write.\n' +
  '- code_interpreter: run code in an isolated interpreter.\n' +
  '  Parameters: language (for example "python") and code.\n' +
  '- browser: fetch pages or interact with web pages by screenshot, click, type, or evaluate.\n' +
  '  Parameters: op is required; use url for fetch; use selector, text, or script when needed.\n\n' +
  'Available project skills:\n' +
  '- sandbox-algorithms: use this when the user asks to compute or verify deterministic algorithmic results such as Fibonacci sequences, factorials, primes, sorting, combinations, or explicitly asks for sandbox-algorithms.\n\n' +
  'Filesystem boundary:\n' +
  '- Use Claude Code Read only for project skill resources under .claude/skills, such as SKILL.md references or scripts needed by a loaded skill.\n' +
  '- Use the EdgeOne files tool for user workspace files, temporary files, generated artifacts, and all non-skill file operations.\n\n' +
  'Tool-use rules:\n' +
  '1. Use a tool only when it is necessary to answer the user concretely or demonstrate a platform capability.\n' +
  '2. Call tools one at a time and wait for each result before deciding the next step.\n' +
  '3. Never invent, simulate, or paraphrase tool results. If a tool result is unavailable, say so.\n' +
  '4. If a tool call fails, do not repeat it blindly and do not switch to unrelated operations.\n' +
  '   Briefly explain the failure, adjust the parameters only if the fix is clear, otherwise ask the user for guidance.\n' +
  '5. Do not perform destructive file or shell operations unless the user explicitly asks for them.\n' +
  '6. If a tool returns an image or screenshot, do not include base64 strings, data:image URLs, or Markdown image links in your text. Briefly say the image is shown in the chat.\n' +
  '7. If the task can be answered without tools or skills, answer directly and keep the response concise.\n' +
  'When the user explicitly names a project skill, load that skill before doing the task.\n\n' +
  'Retrieved context (knowledge base + prior conversation):\n' +
  '- When the [RETRIEVED CONTEXT] block below contains relevant snippets, prefer grounding your answer in them.\n' +
  '- Cite sources inline as [doc:N] for document chunks and [hist:N] for prior conversation turns, where N is the bracketed index shown in the block.\n' +
  '- If the block is empty or marked unavailable, answer normally without citing.\n' +
  '- Do not fabricate citations or invent document filenames.\n\n' +
  '[RETRIEVED CONTEXT]\n' +
  '{retrieved_context}\n' +
  '[END RETRIEVED CONTEXT]';

function normalizeUuid(value: string): string | null {
  const trimmed = value.trim().toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(trimmed)
    ? trimmed
    : null;
}

async function resolveClaudeSessionBinding(
  sessionStore: any,
  conversationId: string,
  cwd: string,
): Promise<{ sessionId?: string; resume?: string }> {
  const sessionId = normalizeUuid(conversationId);
  if (!sessionId) {
    logger.log(`[session] skip SDK session binding: invalid conversationId=${conversationId}`);
    return {};
  }

  try {
    // `dir` is load-bearing even when going through sessionStore: getSessionInfo
    // derives the project key from `dir`, and the EdgeOne SessionStore namespaces
    // its blob keys by `projectKey`. Drop `dir` and load() never finds a match.
    const info = await getSessionInfo(sessionId, { dir: cwd, sessionStore });
    if (info) {
      logger.log(`[session] resume Claude SDK sessionId=${sessionId}`);
      return { resume: sessionId };
    }
    logger.log(`[session] create Claude SDK sessionId=${sessionId}`);
  } catch (e) {
    logger.error('[session] failed to inspect sessionStore for resume:', e);
  }

  return { sessionId };
}

function buildAgentOptions(opts?: {
  claudeSessionStore?: any;
  mcpServer?: any;
  mcpServerName?: string;
  allowedTools?: string[];
  env?: Record<string, string | undefined>;
  sessionId?: string;
  resume?: string;
  systemPrompt?: string;
}) {
  const ctxEnv = opts?.env ?? {};
  const cwd = process.cwd();
  const allowedTools = opts?.allowedTools ?? [];
  const skillReadAllowRules = [
    'Read(.claude/skills/**)',
    `Read(${cwd}/.claude/skills/**)`,
  ];
  const options: Record<string, any> = {
    model: resolveModelName(ctxEnv),
    systemPrompt: opts?.systemPrompt ?? SYSTEM_PROMPT,
    cwd,
    // Keep Claude Code's built-in tools narrowly scoped: Skill loads project
    // skills, and Read may only access skill resources under .claude/skills.
    // EdgeOne sandbox tools are exposed separately through MCP below.
    tools: ['Skill', 'Read'],
    allowedTools,
    settingSources: ["project"],
    skills: "all",
    permissionMode: 'bypassPermissions',
    settings: {
      permissions: {
        allow: skillReadAllowRules,
        defaultMode: 'dontAsk',
        disableBypassPermissionsMode: 'disable',
      },
    },
    maxTurns: 5,
    env: {
      ...ctxEnv,
      ...collectGatewayEnv(ctxEnv),
    },
    // Forward Claude CLI stderr to logs for easier debugging.
    stderr: (line: string) => {
      logger.error('[claude-cli stderr]', line);
    },
  };
  if (opts?.claudeSessionStore) {
    options.sessionStore = opts.claudeSessionStore;
  }
  if (opts?.resume) {
    options.resume = opts.resume;
  } else if (opts?.sessionId) {
    options.sessionId = opts.sessionId;
  }
  if (opts?.mcpServer && opts?.mcpServerName) {
    options.mcpServers = { [opts.mcpServerName]: opts.mcpServer };
  }
  return options;
}

export async function onRequest(context: any) {
  const body = context.request.body ?? {};
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  const userMsgId = typeof body.userMsgId === 'string' ? body.userMsgId : undefined;
  const botMsgId = typeof body.botMsgId === 'string' ? body.botMsgId : undefined;
  const rawUserId = typeof body.userId === 'string' ? body.userId : (typeof body.user_id === 'string' ? body.user_id : '');
  const userId = rawUserId.trim() || undefined;

  if (!message) {
    return new Response(
      JSON.stringify({ error: "'message' is required" }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const signal: AbortSignal | undefined = context.request.signal;
  const conversationId: string = context.conversation_id ?? '';
  const { store } = context;

  logger.log(`[request] cid=${conversationId}, uid=${userId ?? '-'}, message="${message.slice(0, 50)}..."`);

  // EdgeOne store returns a Claude SDK-compatible SessionStore for transcript persistence.
  const claudeSessionStore = store.claudeSessionStore();

  // Save user message to store (with frontend-generated ID for history alignment)
  if (conversationId) {
    try {
      const appendArgs: Record<string, unknown> = {
        conversationId,
        role: 'user',
        content: message,
        messageId: userMsgId,
      };
      if (userId) appendArgs.userId = userId;
      await store.appendMessage(appendArgs);
    } catch (e) { logger.error('[store] failed to save user message:', e); }
  }

  const { tools } = context;
  if (typeof tools.toClaudeMcpServer !== 'function') {
    throw new Error('Upgrade EdgeOne Makers agent runtime: `context.tools.toClaudeMcpServer` is required.');
  }
  const edgeoneMcp = tools.toClaudeMcpServer();

  const mcpServer = createSdkMcpServer({
    name: edgeoneMcp.name,
    tools: edgeoneMcp.tools,
    alwaysLoad: true,
  });

  const { allowedTools } = edgeoneMcp;
  logger.log('[tools] registered EdgeOne MCP tools:', allowedTools);

  const sessionBinding = await resolveClaudeSessionBinding(claudeSessionStore, conversationId, process.cwd());

  // Augment SYSTEM_PROMPT with retrieved context from the libSQL vector DB
  // (documents + prior conversations). Failures here must never break the
  // chat path — we fall back to a marker string and let Claude answer cold.
  let systemPrompt = SYSTEM_PROMPT;
  const env = context.env ?? {};
  const libsqlEnv: LibSqlEnv = {
    LIBSQL_URL: env.LIBSQL_URL ?? '',
    LIBSQL_RO_TOKEN: env.LIBSQL_RO_TOKEN ?? '',
    ZHIPU_API_KEY: env.ZHIPU_API_KEY ?? '',
  };
  const retrievalConfigured = libsqlEnv.LIBSQL_URL && libsqlEnv.LIBSQL_RO_TOKEN && libsqlEnv.ZHIPU_API_KEY;
  // Temporary diagnostic — surface retrieval state in the prompt itself so we
  // can debug from the chat response without EdgeOne console logs.
  const diagParts: string[] = [];
  diagParts.push(`configured=${retrievalConfigured ? 'YES' : 'NO'}`);
  diagParts.push(`LIBSQL_URL=${libsqlEnv.LIBSQL_URL ? 'set' : 'MISSING'}`);
  diagParts.push(`LIBSQL_RO_TOKEN=${libsqlEnv.LIBSQL_RO_TOKEN ? 'set' : 'MISSING'}`);
  diagParts.push(`ZHIPU_API_KEY=${libsqlEnv.ZHIPU_API_KEY ? 'set' : 'MISSING'}`);

  if (retrievalConfigured) {
    try {
      const hits = await retrieveContext(message, libsqlEnv, {
        conversationId,
        userId,
        k: 5,
      });
      diagParts.push(`hits=${hits.length}`);
      if (hits.length > 0) {
        diagParts.push(`top_dist=${hits[0].distance.toFixed(3)}`);
        diagParts.push(`top_source=${hits[0].source ?? 'history'}`);
        const ctxBlock = hits.map((h, i) => {
          const meta = h.type === 'doc'
            ? `source: ${h.source ?? 'unknown'}, page ${h.page ?? '?'}`
            : `history (${h.role ?? 'unknown'})`;
          return `[${i + 1}] (${meta})\n${h.content}`;
        }).join('\n\n');
        systemPrompt = systemPrompt.replace('{retrieved_context}', ctxBlock);
        retrieveLogger.log(
          `[retrieve] ${hits.length} hits, top dist=${hits[0].distance.toFixed(3)} for cid=${conversationId}`,
        );
      } else {
        systemPrompt = systemPrompt.replace('{retrieved_context}', '(no relevant context found)');
        retrieveLogger.log(`[retrieve] 0 hits for cid=${conversationId}`);
      }
    } catch (e: any) {
      const errMsg = e?.message ?? String(e);
      diagParts.push(`error=${errMsg.slice(0, 200)}`);
      retrieveLogger.error('[retrieve] failed, fallback to no-context prompt:', errMsg);
      systemPrompt = systemPrompt.replace(
        '{retrieved_context}',
        `(retrieval failed: ${errMsg})`,
      );
    }
  } else {
    systemPrompt = systemPrompt.replace('{retrieved_context}', '(retrieval not configured)');
  }
  // Append diagnostic line at the very end of the prompt so we can see it
  // reflected in the model's reasoning via thinking blocks.
  systemPrompt += `\n\n[DIAG] ${diagParts.join(' | ')}`;

  const options = buildAgentOptions({
    claudeSessionStore,
    mcpServer,
    mcpServerName: edgeoneMcp.name,
    allowedTools,
    env: context.env,
    systemPrompt,
    ...sessionBinding,
  });
  const stream = createChatStream({
    message,
    options,
    signal,
    logger,
    conversationId,
    store,
    botMsgId,
    userId,
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
