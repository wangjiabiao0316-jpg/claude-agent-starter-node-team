/**
 * log-message handler — EdgeOne Makers Node Function
 * ==================================================
 *
 * File path cloud-functions/log-message/index.ts maps to **POST /log-message**.
 *
 * Writes one row into the `conversations` table:
 *   (conversation_id, user_id, role, content, embedding)
 *
 * The embedding is produced via Zhipu embedding-3 (1024-dim) so the row is
 * immediately searchable by the retrieval pipeline in `agents/_libsql.ts`.
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
 *
 * Following the official EdgeOne Makers Node Functions docs:
 *   - export `onRequestPost` for POST handlers
 *   - read JSON body via `await context.request.json()`
 *   - return a `Response` object
 *   - https://pages.edgeone.ai/document/node-functions
 */

import { createClient } from '@libsql/client';
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
    // HTTP 200 to avoid blocking frontend retries; ok=false signals failure.
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

    // 2. Insert into conversations table.
    // libSQL accepts the vector as a JSON-encoded number[] when binding
    // against an F32_BLOB column (proven working in C2's retrieveContext).
    const client = createClient({
      url: env.LIBSQL_URL,
      authToken: env.LIBSQL_RW_TOKEN,
    });
    await client.execute({
      sql: `INSERT INTO conversations (conversation_id, user_id, role, content, embedding)
            VALUES (?, ?, ?, ?, ?)`,
      args: [conversationId, userId || null, role, content, JSON.stringify(vec)],
    });

    logger.log(`[log-message] end: ${new Date().toISOString()}, total: ${Date.now() - startTime}ms, role=${role}`);
    return jsonResponse({ ok: true });
  } catch (e: any) {
    logger.error('[log-message] failed:', e?.message ?? e);
    logger.log(`[log-message] end: ${new Date().toISOString()}, total: ${Date.now() - startTime}ms`);
    // HTTP 200 + ok=false so the frontend never blocks on a retry.
    return jsonResponse({ ok: false, error: e?.message ?? String(e) });
  }
}
