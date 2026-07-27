/**
 * agents/_libsql.ts — libSQL vector retrieval helper for chat agent.
 *
 * Private module (filename starts with `_`) — not mapped as a route.
 *
 * Provides:
 *   - getLibSqlClient(env)         — create @libsql/client client (read-only)
 *   - embedQuery(text, env)        — Zhipu embedding-3, 1024-dim
 *   - retrieveContext(query, env)  — parallel query documents + conversations,
 *                                     weighted RRF fusion (docs 0.7 / history 0.3)
 *   - fuseHits(docs, hist)         — pure fusion helper (unit-tested)
 *
 * Schema assumption (matches Phase A server, sqld v0.24.32):
 *
 *   CREATE TABLE documents (
 *     id INTEGER PRIMARY KEY,
 *     source TEXT, page INT, chunk_index INT,
 *     content TEXT,
 *     embedding F32_BLOB(1024)
 *   );
 *   CREATE INDEX documents_vec_idx ON documents (libsql_vector_idx(embedding));
 *
 *   CREATE TABLE conversations (
 *     id INTEGER PRIMARY KEY,
 *     conversation_id TEXT, user_id TEXT, role TEXT,
 *     content TEXT,
 *     embedding F32_BLOB(1024)
 *   );
 *
 * The `<->` operator is libSQL's vector distance shorthand against the indexed
 * F32_BLOB column; `vector_distance_cos` returns the cosine distance as a scalar.
 * We select both so callers can read `distance` for logging/thresholding.
 */

import { createClient, type Client } from '@libsql/client';

const EMBED_URL = 'https://open.bigmodel.cn/api/paas/v4/embeddings';
const EMBED_MODEL = 'embedding-3';
const EMBED_DIMENSIONS = 1024;

const DEFAULT_K = 5;
const DOC_WEIGHT = 0.7;
const HIST_WEIGHT = 0.3;
const RRF_K = 60; // standard reciprocal-rank-fusion smoothing constant

export interface LibSqlEnv {
  LIBSQL_URL: string;
  LIBSQL_RO_TOKEN: string;
  ZHIPU_API_KEY: string;
}

export interface EmbedEnv {
  ZHIPU_API_KEY: string;
}

export interface SearchHit {
  id: number;
  content: string;
  type: 'doc' | 'history';
  /** cosine distance from query vector (lower = more similar). May be 0 if unknown. */
  distance: number;
  // doc-only fields
  source?: string;
  page?: number;
  // history-only fields
  role?: string;
}

interface DocRow {
  id: number;
  source: string;
  page: number;
  chunk_index: number;
  content: string;
  distance: number;
}

interface HistRow {
  id: number;
  content: string;
  role: string;
  distance: number;
}

interface ZhipuEmbeddingResponse {
  data: Array<{ embedding: number[] }>;
  usage: { prompt_tokens: number; total_tokens: number };
}

/**
 * Build a read-only libSQL client bound to env. The same Client object is
 * safe to reuse across parallel queries within one request.
 */
export function getLibSqlClient(env: LibSqlEnv): Client {
  return createClient({
    url: env.LIBSQL_URL,
    authToken: env.LIBSQL_RO_TOKEN,
  });
}

/**
 * Call Zhipu embedding-3 and return a 1024-dim number[] for `text`.
 * Throws on non-2xx or parse failure — callers should wrap in try/catch.
 */
export async function embedQuery(text: string, env: EmbedEnv): Promise<number[]> {
  if (!env.ZHIPU_API_KEY) {
    throw new Error('embedQuery: ZHIPU_API_KEY is required');
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
    throw new Error(`embedQuery ${res.status}: ${detail}`);
  }
  const data = (await res.json()) as ZhipuEmbeddingResponse;
  if (!data?.data?.[0]?.embedding) {
    throw new Error('embedQuery: malformed response (missing data[0].embedding)');
  }
  return data.data[0].embedding;
}

/**
 * Pure fusion helper — Reciprocal Rank Fusion with per-source weights.
 *
 * Inputs MUST be pre-sorted by the caller (e.g. by `distance` ascending from
 * SQL ORDER BY). Rank 0 = most relevant. RRF score = weight * (1 / (RRF_K + rank)).
 *
 * This function is deterministic and makes no I/O calls — fully unit-tested.
 */
export function fuseHits(docs: SearchHit[], hist: SearchHit[]): SearchHit[] {
  const scored: Array<{ hit: SearchHit; score: number }> = [];
  docs.forEach((d, rank) => {
    scored.push({ hit: d, score: DOC_WEIGHT * (1 / (RRF_K + rank)) });
  });
  hist.forEach((h, rank) => {
    scored.push({ hit: h, score: HIST_WEIGHT * (1 / (RRF_K + rank)) });
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.map(s => s.hit);
}

/**
 * Run parallel vector search against documents + conversations tables,
 * fuse results, return top-`k` hits (default 5).
 *
 * `opts.conversationId` and `opts.userId` are used to scope the history
 * lookup: we want *other* conversations for the same user (to recall prior
 * answers) but never the current conversation (would leak the live turn).
 */
export async function retrieveContext(
  query: string,
  env: LibSqlEnv,
  opts: { conversationId?: string; userId?: string; k?: number } = {},
): Promise<SearchHit[]> {
  const qv = await embedQuery(query, env);
  const client = getLibSqlClient(env);
  // libSQL accepts the vector as a JSON-encoded number[] when binding against
  // an F32_BLOB column.
  const qvStr = JSON.stringify(qv);

  const userId = opts.userId ?? '';
  const excludeConversationId = opts.conversationId ?? '';

  // Note on SQL syntax:
  //   libSQL exposes `<->` as a binary vector-distance operator (column on
  //   the left, vector literal on the right) AND a `vector_distance_cos()`
  //   scalar function. Both are valid; using `<->` in ORDER BY enables the
  //   vector index to be used. We pass the query vector twice: once bound
  //   inside the scalar for the projected `distance` column, once bound as
  //   the right operand of `<->` for ordering.
  //
  //   If `<->` ordering is rejected at runtime, drop it and order by
  //   `distance` instead. The `LIMIT ?` placeholder counts as the only
  //   positional arg consumed by `<->` ordering when used with prepared
  //   statements in some driver versions; we keep both args for safety.
  const [docsRes, histRes] = await Promise.all([
    client.execute({
      sql: `SELECT id, source, page, chunk_index, content,
                   vector_distance_cos(embedding, ?) AS distance
            FROM documents
            ORDER BY vector_distance_cos(embedding, ?) ASC
            LIMIT ?`,
      args: [qvStr, qvStr, DEFAULT_K],
    }),
    client.execute({
      sql: `SELECT id, content, role,
                   vector_distance_cos(embedding, ?) AS distance
            FROM conversations
            WHERE user_id = ? AND conversation_id != ?
            ORDER BY vector_distance_cos(embedding, ?) ASC
            LIMIT ?`,
      args: [qvStr, userId, excludeConversationId, qvStr, DEFAULT_K],
    }),
  ]);

  const docRows = docsRes.rows as unknown as DocRow[];
  const histRows = histRes.rows as unknown as HistRow[];

  const docHits: SearchHit[] = docRows.map(d => ({
    id: d.id,
    content: d.content,
    type: 'doc',
    distance: Number(d.distance ?? 0),
    source: d.source,
    page: d.page,
  }));

  const histHits: SearchHit[] = histRows.map(h => ({
    id: h.id,
    content: h.content,
    type: 'history',
    distance: Number(h.distance ?? 0),
    role: h.role,
  }));

  const fused = fuseHits(docHits, histHits);
  return fused.slice(0, opts.k ?? DEFAULT_K);
}
