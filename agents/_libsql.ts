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
  // sqld /v2/pipeline response shape: outer type is "ok", inner response.type
  // is "execute" (or "error"). This is the opposite of what you'd expect
  // from the request shape.
  type: 'ok';
  response: {
    type: 'execute';
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
 *
 * Renamed from `executeSql` to `libsqlPipeline` so the public SELECT-with-
 * whitelist helper below can take the friendlier name `executeSql(table, env, opts)`.
 */
async function libsqlPipeline(
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
  // sqld response: { type: "ok", response: { type: "execute", result: {...} } }
  // On error: { type: "error", error: { message, code } }
  if (!first || first.type !== 'ok' || first.response?.type !== 'execute') {
    throw new Error(`libsql execute: unexpected response shape: ${JSON.stringify(first).slice(0, 300)}`);
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
    libsqlPipeline(
      `SELECT id, source, page, chunk_index, content,
              vector_distance_cos(embedding, ?) AS distance
       FROM documents
       ORDER BY vector_distance_cos(embedding, ?) ASC
       LIMIT ?`,
      [qvStr, qvStr, DEFAULT_K],
      env,
    ),
    libsqlPipeline(
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

// ---------------------------------------------------------------------------
// Public SELECT-with-whitelist API
//
// Exposed so sandboxed Python helpers (and other agents) can run a controlled
// shape of SELECT against a small set of business tables without holding the
// libSQL RO token themselves. SELECT-only — a table whitelist plus a keyword
// blocklist act as defense-in-depth on top of the RO token's read-only scope.
// ---------------------------------------------------------------------------

const SQL_TABLE_WHITELIST = new Set<string>([
  'finance_products',
  'mortgage_thresholds',
  'negative_list',
  'pilot_cities',
  'case_library',
  'industry_thresholds',
]);

// Match forbidden verbs as whole words (case-insensitive). Applied AFTER
// whitelist + sql assembly so a smuggled `; DROP TABLE x` is caught whether
// it lands in the table slot, the columns list, or the WHERE values.
const SQL_KEYWORD_BLOCKLIST = /\b(insert|update|delete|drop|create|alter|truncate|grant|revoke|attach|pragma)\b/i;

export interface ExecuteSqlOptions {
  /** Columns to project. Defaults to `*`. Each entry is interpolated verbatim. */
  columns?: string[];
  /** Equality filters combined with AND. Values become positional `?` args. */
  where?: Record<string, string | number | null>;
  /** Row cap. Hard ceiling at 1000 regardless of input. */
  limit?: number;
}

/**
 * Run a parameterized SELECT against a whitelisted business table.
 *
 * Safety:
 *   1. Table must appear in SQL_TABLE_WHITELIST.
 *   2. Columns and the assembled SQL are scanned against SQL_KEYWORD_BLOCKLIST.
 *   3. WHERE values are always bound as positional args, never interpolated.
 *   4. LIMIT is clamped to <= 1000.
 *
 * Returns rows as `Record<string, unknown>[]` keyed by column name from the
 * sqld response `cols` array. Empty result set yields `[]`.
 */
export async function executeSql(
  table: string,
  env: LibSqlEnv,
  opts: ExecuteSqlOptions = {},
): Promise<Record<string, unknown>[]> {
  if (!SQL_TABLE_WHITELIST.has(table)) {
    throw new Error(`executeSql: table not in whitelist: ${table}`);
  }
  const cols =
    opts.columns && opts.columns.length > 0
      ? opts.columns.join(', ')
      : '*';
  let whereClause = '';
  const args: Array<string | number | null> = [];
  if (opts.where && Object.keys(opts.where).length > 0) {
    const conds = Object.entries(opts.where).map(([col, val]) => {
      args.push(val);
      return `${col} = ?`;
    });
    whereClause = 'WHERE ' + conds.join(' AND ');
  }
  const limit = Math.min(opts.limit ?? 1000, 1000);
  const sql = `SELECT ${cols} FROM ${table} ${whereClause} LIMIT ${limit}`.replace(/\s+/g, ' ').trim();
  if (SQL_KEYWORD_BLOCKLIST.test(sql)) {
    throw new Error('executeSql: SELECT only; detected forbidden keyword');
  }
  const colNames: string[] = [];
  // Pass colNames through closure — libsqlPipeline returns PipelineRow[][],
  // we need to map each row back to its column name from the response cols.
  // Patch: libsqlPipeline currently returns rows only; we re-derive column
  // names from the response by intercepting via a wrapping helper.
  const rows = await libsqlPipelineWithCols(sql, args, env, colNames);
  return rows.map((row) => {
    const obj: Record<string, unknown> = {};
    row.forEach((cell, i) => {
      const name = colNames[i] ?? `col_${i}`;
      if (cell.type === 'null') {
        obj[name] = null;
      } else if (cell.type === 'integer' || cell.type === 'float') {
        obj[name] = cell.value !== undefined ? Number(cell.value) : null;
      } else {
        obj[name] = cell.value !== undefined ? String(cell.value) : null;
      }
    });
    return obj;
  });
}

export interface CaseFeatures {
  region: string;
  industry: string;
  scale: number;
  property_type: string;
  physical_params: Record<string, unknown>;
  financing: Record<string, unknown>;
}

/**
 * Retrieve Top-K case_library rows matching the user's region + industry.
 *
 * Phase-A behavior is a SQL prefilter; agent5 may post-rank by scale /
 * property_type / financing locally. Top-K is enforced both in SQL (`LIMIT ?`)
 * and by slicing the result, so a misbehaving backend cannot exceed it.
 */
export async function queryCases(
  features: CaseFeatures,
  env: LibSqlEnv,
  topK: number = 3,
): Promise<Record<string, unknown>[]> {
  const safeTopK = Math.max(1, Math.min(topK, 100));
  const candidates = await executeSql('case_library', env, {
    where: {
      region: features.region,
      industry: features.industry,
    },
    limit: safeTopK,
  });
  return candidates.slice(0, safeTopK);
}

/**
 * Variant of `libsqlPipeline` that also exposes the column names from the
 * response. Used by the public SELECT helper to map rows into objects.
 *
 * Implemented as a thin wrapper that re-issues the request shape but parses
 * the `cols` array. Keeping it separate avoids disturbing existing callers
 * of `libsqlPipeline` (retrieveContext) which only consume rows.
 */
async function libsqlPipelineWithCols(
  sql: string,
  args: Array<string | number | null>,
  env: LibSqlEnv,
  outCols: string[],
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
  if (!first || first.type !== 'ok' || first.response?.type !== 'execute') {
    throw new Error(
      `libsql execute: unexpected response shape: ${JSON.stringify(first).slice(0, 300)}`,
    );
  }
  for (const c of first.response.result.cols ?? []) {
    outCols.push(c.name);
  }
  return first.response.result.rows ?? [];
}
