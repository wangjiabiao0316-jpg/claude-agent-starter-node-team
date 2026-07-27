### Task B4：实现 db.ts（libSQL 客户端封装）

**Files:**
- Create: `claude-agent-starter-node-team/scripts/ingest/src/db.ts`

**Interfaces:**
- Consumes: `@libsql/client`、B2 的 schema
- Produces: `getDbClient(env)`、`insertDocuments(rows, env)`、`upsertIngestState(...)`、`recordFailedChunk(...)`

- [ ] **Step 1: 写 db.ts**

```typescript
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
```

- [ ] **Step 2: Verification（手动调一次）**

```bash
# 在服务器上跑一次（先 build）
cd /opt/ingest
# 把仓库 scp 到服务器或 git clone
node -e "
import('./dist/db.js').then(async ({ insertDocuments, getDbClient }) => {
  const env = { LIBSQL_URL: process.env.LIBSQL_URL, LIBSQL_TOKEN: process.env.LIBSQL_TOKEN };
  await insertDocuments([{
    source: 'test.pdf', page: 1, chunk_index: 0,
    content: 'hello world', embedding: new Array(1024).fill(0.1)
  }], env);
  const c = getDbClient(env);
  const r = await c.execute('SELECT COUNT(*) AS n FROM documents');
  console.log('rows:', r.rows[0]);
});
"
# 期望：rows: { n: 1 } 或更大
```

- [ ] **Step 3: 清理测试数据 + Commit**

```bash
# 删掉测试行
npx @libsql/client shell --url ... --token ... "DELETE FROM documents WHERE source='test.pdf'"

git add scripts/ingest/src/db.ts
git commit -m "feat(ingest): add db.ts (libSQL client wrapper)"
```

---

