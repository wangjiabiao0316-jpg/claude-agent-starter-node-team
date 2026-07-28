/**
 * agents/_libsql.ts — libSQL vector retrieval helper for chat agent.
 *
 * Private module (filename starts with `_`) — not mapped as a route.
 *
 * CRITICAL COMPATIBILITY NOTE
 * ---------------------------
 * EdgeOne Makers agents/ and cloud-functions/ run in a V8 isolate, not full
 * Node.js. `@libsql/client` pulls in Node built-ins (`node:net`, `node:crypto`)
 * that fail to load in the isolate. So we use raw fetch against libSQL's
 * HTTP /v2/pipeline API instead — no client SDK dependency.
 *
 * Provides:
 *   - embedQuery(text, env)        — Zhipu embedding-3, 1024-dim
 *   - retrieveContext(query, env)  — parallel query documents + conversations,
 *                                     weighted RRF fusion (docs 0.7 / history 0.3)
 *   - fuseHits(docs, hist)         — pure fusion helper (unit-tested)
 *
 * Schema assumption (matches Phase A server, sqld v0.24.32):
 *   CREATE TABLE documents (
 *     id INTEGER PRIMARY KEY,
 *     source TEXT, page INT, chunk_index INT,
 *     content TEXT,
 *     embedding F32_BLOB(1024)
 *   );
 *   CREATE INDEX documents_vec_idx ON documents (libsql_vector_idx(embedding));
 *   CREATE TABLE conversations (
 *     id INTEGER PRIMARY KEY,
 *     conversation_id TEXT, user_id TEXT, role TEXT,
 *     content TEXT,
 *     embedding F32_BLOB(1024)
 *   );
 */

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

interface PipelineRow {
  type: 'integer' | 'text' | 'float' | 'null' | 'blob';
  value?: string | number;
}

/**
 * Tag a primitive value as a sqld positional argument.
 * sqld /v2/pipeline expects each arg as an object {type, value}, not a raw
 * string/number. Integers must be sent as their string representation per
 * the libSQL binary protocol (the value field is a string for integer/blob too).
 *
 *   null  →  { "type": "null" }
 *   "abc" →  { "type": "text", "value": "abc" }
 *   42    →  { "type": "integer", "value": "42" }
 *   3.14  →  { "type": "float", "value": "3.14" }
 */
type SqlArg = string | number | null;
function tagArg(v: SqlArg): { type: string; value?: string } {
  if (v === null) return { type: 'null' };
  if (typeof v === 'number') {
    if (Number.isInteger(v)) return { type: 'integer', value: String(v) };
    return { type: 'float', value: String(v) };
  }
  return { type: 'text', value: String(v) };
}

function tagArgs(args: SqlArg[]): Array<{ type: string; value?: string }> {
  return args.map(tagArg);
}

interface PipelineExecuteResult {
  type: 'execute';
  response: {
    type: 'ok';
    result: {
      cols: Array<{ name: string; decltype: string | null }>;
      rows: PipelineRow[][];
    };
  };
}

interface PipelineResponse {
  results: PipelineExecuteResult[];
}

interface ZhipuEmbeddingResponse {
  data: Array<{ embedding: number[] }>;
  usage: { prompt_tokens: number; total_tokens: number };
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
 * Run a single SQL statement via libSQL HTTP /v2/pipeline API.
 * Returns rows as PipelineRow[][] (each row is an array of typed cells).
 *
 *   https://docs.turso.tech/sdk/http/reference
 *
 * Note: sqld v0.24.x expects the wrapping key to be `requests`, not
 * `statements` — older docs may show otherwise.
 */
async function executeSql(
  sql: string,
  args: Array<string | number | null>,
  env: LibSqlEnv,
): Promise<PipelineRow[][]> {
  const url = `${env.LIBSQL_URL.replace(/\/+$/, '')}/v2/pipeline`;
  const body = {
    requests: [
      {
        type: 'execute',
        stmt: { sql, args: tagArgs(args) },
      },
      { type: 'close' },
    ],
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.LIBSQL_RO_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '<no body>');
    throw new Error(`libsql execute ${res.status}: ${detail}`);
  }
  const data = (await res.json()) as PipelineResponse;
  const first = data.results?.[0];
  if (!first || first.type !== 'execute' || first.response?.type !== 'ok') {
    throw new Error(`libsql execute: unexpected response shape: ${JSON.stringify(first).slice(0, 200)}`);
  }
  return first.response.result.rows ?? [];
}

function rowCell(row: PipelineRow[], index: number): string | number | null {
  const cell = row[index];
  if (!cell || cell.type === 'null') return null;
  if (cell.type === 'integer' || cell.type === 'float') {
    return cell.value !== undefined ? Number(cell.value) : null;
  }
  // text / blob: return as string
  return cell.value !== undefined ? String(cell.value) : null;
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
  // libSQL accepts the vector as a JSON-encoded number[] when binding against
  // an F32_BLOB column.
  const qvStr = JSON.stringify(qv);

  const userId = opts.userId ?? '';
  const excludeConversationId = opts.conversationId ?? '';

  // Use vector_distance_cos() scalar function for both projection and ordering.
  // This works without relying on the `<->` operator (whose placeholder binding
  // behavior differs across @libsql/client versions).
  const [docRows, histRows] = await Promise.all([
    executeSql(
      `SELECT id, source, page, chunk_index, content,
              vector_distance_cos(embedding, ?) AS distance
       FROM documents
       ORDER BY vector_distance_cos(embedding, ?) ASC
       LIMIT ?`,
      [qvStr, qvStr, DEFAULT_K],
      env,
    ),
    executeSql(
      `SELECT id, content, role,
              vector_distance_cos(embedding, ?) AS distance
       FROM conversations
       WHERE user_id = ? AND conversation_id != ?
       ORDER BY vector_distance_cos(embedding, ?) ASC
       LIMIT ?`,
      [qvStr, userId, excludeConversationId, qvStr, DEFAULT_K],
      env,
    ),
  ]);

  const docHits: SearchHit[] = docRows.map(r => ({
    id: Number(rowCell(r, 0) ?? 0),
    content: String(rowCell(r, 4) ?? ''),
    type: 'doc',
    distance: Number(rowCell(r, 5) ?? 0),
    source: rowCell(r, 1) !== null ? String(rowCell(r, 1)) : undefined,
    page: rowCell(r, 2) !== null ? Number(rowCell(r, 2)) : undefined,
  }));

  const histHits: SearchHit[] = histRows.map(r => ({
    id: Number(rowCell(r, 0) ?? 0),
    content: String(rowCell(r, 1) ?? ''),
    type: 'history',
    distance: Number(rowCell(r, 3) ?? 0),
    role: rowCell(r, 2) !== null ? String(rowCell(r, 2)) : undefined,
  }));

  const fused = fuseHits(docHits, histHits);
  return fused.slice(0, opts.k ?? DEFAULT_K);
}
