import { createClient, type Client } from '@libsql/client';

export interface DbEnv {
  LIBSQL_URL: string;
  LIBSQL_TOKEN: string;
}

export interface DocumentRow {
  source: string;
  page: number;
  chunk_index: number;
  content: string;
  embedding: number[];
  metadata?: string;
}

export interface IngestStateRow {
  file_path: string;
  file_hash: string;
  total_chunks: number;
  done_chunks: number;
  status: 'pending' | 'running' | 'done' | 'failed';
  started_at?: number;
  finished_at?: number;
}

export function getDbClient(env: DbEnv): Client {
  return createClient({ url: env.LIBSQL_URL, authToken: env.LIBSQL_TOKEN });
}

export async function insertDocuments(rows: DocumentRow[], env: DbEnv): Promise<void> {
  if (rows.length === 0) return;
  const client = getDbClient(env);
  const stmt = await client.batch(
    rows.map(r => ({
      sql: `INSERT INTO documents (source, page, chunk_index, content, embedding, metadata)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [r.source, r.page, r.chunk_index, r.content, JSON.stringify(r.embedding), r.metadata ?? null],
    }))
  );
  // batch 返回数组，不需要解构
  void stmt;
}

export async function upsertIngestState(state: IngestStateRow, env: DbEnv): Promise<void> {
  const client = getDbClient(env);
  await client.execute({
    sql: `INSERT INTO ingest_state (file_path, file_hash, total_chunks, done_chunks, status, started_at, finished_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(file_path) DO UPDATE SET
            file_hash=excluded.file_hash,
            total_chunks=excluded.total_chunks,
            done_chunks=excluded.done_chunks,
            status=excluded.status,
            started_at=excluded.started_at,
            finished_at=excluded.finished_at`,
    args: [
      state.file_path, state.file_hash, state.total_chunks,
      state.done_chunks, state.status, state.started_at ?? null, state.finished_at ?? null,
    ],
  });
}

export async function getIngestState(filePath: string, env: DbEnv): Promise<IngestStateRow | null> {
  const client = getDbClient(env);
  const res = await client.execute({
    sql: 'SELECT * FROM ingest_state WHERE file_path = ?',
    args: [filePath],
  });
  if (res.rows.length === 0) return null;
  const r = res.rows[0];
  return {
    file_path: r.file_path as string,
    file_hash: r.file_hash as string,
    total_chunks: r.total_chunks as number,
    done_chunks: r.done_chunks as number,
    status: r.status as IngestStateRow['status'],
    started_at: r.started_at as number | undefined,
    finished_at: r.finished_at as number | undefined,
  };
}

export async function recordFailedChunk(
  chunk: { file_path: string; page: number; chunk_index: number; content: string; error: string },
  env: DbEnv
): Promise<void> {
  const client = getDbClient(env);
  await client.execute({
    sql: `INSERT INTO failed_chunks (file_path, page, chunk_index, content, error)
          VALUES (?, ?, ?, ?, ?)`,
    args: [chunk.file_path, chunk.page, chunk.chunk_index, chunk.content, chunk.error],
  });
}
