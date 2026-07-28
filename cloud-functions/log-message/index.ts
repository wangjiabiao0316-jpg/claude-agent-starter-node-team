/**
 * log-message handler — EdgeOne Makers Node Function
 * ==================================================
 *
 * File path cloud-functions/log-message/index.ts maps to **POST /log-message**.
 *
 * Writes one row into the `conversations` table:
 *   (conversation_id, user_id, role, content, embedding)
 *
 * CRITICAL COMPATIBILITY NOTE
 * ---------------------------
 * EdgeOne cloud-functions runtime is a V8 isolate, not full Node.js.
 * `@libsql/client` pulls in Node built-ins (`node:net`, `node:crypto`, etc)
 * that fail to load in the isolate, causing "Cloud Functions not ready"
 * (ReferenceError) on cold start. So we use raw fetch against libSQL's
 * HTTP /v2/pipeline API instead — no client SDK dependency.
 *
 * Contract with the frontend (`src/api.ts` `logMessage`):
 *   - Request body: { conversation_id, user_id?, role, content }
 *   - Always returns HTTP 200 (success or failure) so the frontend's
 *     fire-and-forget call never triggers a retry storm. The payload's `ok`
 *     flag is the source of truth for any caller that cares.
 *   - `role` MUST be 'user' | 'assistant'. Anything else returns ok=false.
 *
 * Schema (matches `agents/_libsql.ts`):
 *   CREATE TABLE conversations (
 *     id INTEGER PRIMARY KEY,
 *     conversation_id TEXT, user_id TEXT, role TEXT,
 *     content TEXT,
 *     embedding F32_BLOB(1024)
 *   );
 */

import { createLogger } from '../_logger';

const logger = createLogger('log-message');

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=UTF-8' } as const;

const EMBED_URL = 'https://open.bigmodel.cn/api/paas/v4/embeddings';
const EMBED_MODEL = 'embedding-3';
const EMBED_DIMENSIONS = 1024;

const ALLOWED_ROLES = new Set(['user', 'assistant']);

interface ZhipuEmbeddingResponse {
  data: Array<{ embedding: number[] }>;
}

interface LogMessageEnv {
  LIBSQL_URL: string;
  LIBSQL_RW_TOKEN: string;
  ZHIPU_API_KEY: string;
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

async function readJsonBody(context: any): Promise<Record<string, unknown>> {
  try {
    const data = await context.request.json();
    return data && typeof data === 'object' && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function getString(body: Record<string, unknown>, key: string): string {
  const v = body[key];
  return typeof v === 'string' ? v : '';
}

/**
 * Call Zhipu embedding-3 and return a 1024-dim number[] for `text`.
 * Throws on non-2xx or malformed response — caller must wrap in try/catch.
 */
async function embedText(text: string, env: LogMessageEnv): Promise<number[]> {
  if (!env.ZHIPU_API_KEY) {
    throw new Error('log-message: ZHIPU_API_KEY is required');
  }
  const res = await fetch(EMBED_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.ZHIPU_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: EMBED_MODEL,
      input: text,
      dimensions: EMBED_DIMENSIONS,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '<no body>');
    throw new Error(`embed ${res.status}: ${detail}`);
  }
  const data = (await res.json()) as ZhipuEmbeddingResponse;
  if (!data?.data?.[0]?.embedding) {
    throw new Error('embed: malformed response (missing data[0].embedding)');
  }
  return data.data[0].embedding;
}

/**
 * Insert one row into conversations via libSQL HTTP /v2/pipeline API.
 *   https://docs.turso.tech/sdk/http/reference
 *
 * The vector value is passed as a JSON-encoded number[]; sqld parses it
 * into the F32_BLOB(1024) column. This is the same binding convention
 * used by @libsql/client under the hood.
 */
async function insertConversation(
  row: {
    conversationId: string;
    userId: string;
    role: string;
    content: string;
    embedding: number[];
  },
  env: LogMessageEnv,
): Promise<void> {
  const url = `${env.LIBSQL_URL.replace(/\/+$/, '')}/v2/pipeline`;
  const body = {
    requests: [
      {
        type: 'execute',
        stmt: {
          sql: `INSERT INTO conversations (conversation_id, user_id, role, content, embedding)
                VALUES (?, ?, ?, ?, ?)`,
          args: [
            row.conversationId,
            row.userId || null,
            row.role,
            row.content,
            JSON.stringify(row.embedding),
          ],
        },
      },
      { type: 'close' },
    ],
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.LIBSQL_RW_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '<no body>');
    throw new Error(`libsql insert ${res.status}: ${detail}`);
  }
  // We don't need to parse the response body — the ok status is enough.
}

export async function onRequestPost(context: any): Promise<Response> {
  const startTime = Date.now();
  logger.log(`[log-message] start: ${new Date(startTime).toISOString()}`);

  const env = (context.env ?? {}) as LogMessageEnv;
  const body = await readJsonBody(context);

  const conversationId = getString(body, 'conversation_id');
  const userId = getString(body, 'user_id');
  const role = getString(body, 'role');
  const content = getString(body, 'content');

  if (!conversationId || !role || !content) {
    logger.log(`[log-message] missing fields: conv=${!!conversationId} role=${!!role} content=${!!content}`);
    logger.log(`[log-message] end: ${new Date().toISOString()}, total: ${Date.now() - startTime}ms`);
    return jsonResponse({ ok: false, error: 'missing fields' });
  }

  if (!ALLOWED_ROLES.has(role)) {
    logger.log(`[log-message] invalid role: ${role}`);
    logger.log(`[log-message] end: ${new Date().toISOString()}, total: ${Date.now() - startTime}ms`);
    return jsonResponse({ ok: false, error: 'invalid role' });
  }

  try {
    if (!env.LIBSQL_URL || !env.LIBSQL_RW_TOKEN) {
      throw new Error('log-message: LIBSQL_URL and LIBSQL_RW_TOKEN are required');
    }

    // 1. Embed the content via Zhipu embedding-3 (1024-dim).
    const vec = await embedText(content, env);

    // 2. Insert into conversations table via raw HTTP API.
    await insertConversation(
      { conversationId, userId, role, content, embedding: vec },
      env,
    );

    logger.log(`[log-message] end: ${new Date().toISOString()}, total: ${Date.now() - startTime}ms, role=${role}`);
    return jsonResponse({ ok: true });
  } catch (e: any) {
    logger.error('[log-message] failed:', e?.message ?? e);
    logger.log(`[log-message] end: ${new Date().toISOString()}, total: ${Date.now() - startTime}ms`);
    return jsonResponse({ ok: false, error: e?.message ?? String(e) });
  }
}
