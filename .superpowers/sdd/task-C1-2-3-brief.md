# Combined Task C1+C2+C3: libSQL client + chat retrieve injection

本任务是 C1+C2+C3 合并：在 claude-agent-starter-node-team 主项目加 @libsql/client + 写 agents/_libsql.ts + 改 agents/chat/index.ts 注入检索。

## Plan 原文（C1-C3 三段，按顺序合并）

### Task C1：加 @libsql/client 依赖到主项目

**Files:**
- Modify: `claude-agent-starter-node-team/package.json`

- [ ] **Step 1: 加依赖**

```bash
cd /Users/huangzetao/Documents/GitHub/claude-agent-starter-node-team
npm install @libsql/client
```

- [ ] **Step 2: 确认版本**

```bash
npm ls @libsql/client
# 期望: @libsql/client@0.17.x
```

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add @libsql/client dependency"
```

---

### Task C2：实现 agents/_libsql.ts + 测试

**Files:**
- Create: `claude-agent-starter-node-team/agents/_libsql.ts`
- Test: `claude-agent-starter-node-team/agents/__tests__/_libsql.test.ts`

**Interfaces:**
- Produces: `getLibSqlClient(env)`、`embedQuery(text, env)`、`retrieveContext(query, env, opts)`

- [ ] **Step 1: 写测试**

```typescript
// agents/__tests__/_libsql.test.ts
import { describe, it, expect } from 'vitest';
import { embedQuery, fuseHits, type SearchHit } from '../_libsql';

describe('embedQuery', () => {
  it('returns 1024-dim vector', async () => {
    const env = { ZHIPU_API_KEY: process.env.ZHIPU_API_KEY! };
    if (!env.ZHIPU_API_KEY) return;
    const vec = await embedQuery('测试', env);
    expect(vec).toHaveLength(1024);
  });
});

describe('fuseHits', () => {
  it('applies weighted RRF correctly', () => {
    const docs = [
      { id: 1, content: 'a', type: 'doc' as const, distance: 0.1, source: 'x', page: 1 },
      { id: 2, content: 'b', type: 'doc' as const, distance: 0.2, source: 'x', page: 2 },
    ];
    const hist = [
      { id: 3, content: 'c', type: 'history' as const, distance: 0.3, role: 'user' },
    ];
    const fused = fuseHits(docs, hist);
    expect(fused[0].id).toBe(1); // top doc
    expect(fused.length).toBe(3);
  });
});
```

- [ ] **Step 2: 跑测试看失败**

```bash
npm test -- agents/__tests__/_libsql.test.ts
# 期望：FAIL
```

- [ ] **Step 3: 写 _libsql.ts**

```typescript
import { createClient, type Client } from '@libsql/client';

export interface LibSqlEnv {
  LIBSQL_URL: string;
  LIBSQL_RO_TOKEN: string;
  ZHIPU_API_KEY: string;
}

export interface SearchHit {
  id: number;
  content: string;
  type: 'doc' | 'history';
  distance: number;
  source?: string;
  page?: number;
  role?: string;
}

export function getLibSqlClient(env: LibSqlEnv): Client {
  return createClient({ url: env.LIBSQL_URL, authToken: env.LIBSQL_RO_TOKEN });
}

export async function embedQuery(text: string, env: { ZHIPU_API_KEY: string }): Promise<number[]> {
  const res = await fetch('https://open.bigmodel.cn/api/paas/v4/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.ZHIPU_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: 'embedding-3', input: text, dimensions: 1024 }),
  });
  if (!res.ok) throw new Error(`embedQuery ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.data[0].embedding;
}

interface DocRow { id: number; source: string; page: number; chunk_index: number; content: string; distance: number; }
interface HistRow { id: number; content: string; role: string; distance: number; }

export async function retrieveContext(
  query: string,
  env: LibSqlEnv,
  opts: { conversationId?: string; userId?: string; k?: number } = {},
): Promise<SearchHit[]> {
  const qv = await embedQuery(query, env);
  const client = getLibSqlClient(env);
  const qvStr = JSON.stringify(qv);

  const [docsRes, histRes] = await Promise.all([
    client.execute({
      sql: `SELECT id, source, page, chunk_index, content,
                   vector_distance_cos(embedding, ?) AS distance
            FROM documents
            ORDER BY embedding <-> ?
            LIMIT 5`,
      args: [qvStr, qvStr],
    }),
    client.execute({
      sql: `SELECT id, content, role,
                   vector_distance_cos(embedding, ?) AS distance
            FROM conversations
            WHERE user_id = ? AND conversation_id != ?
            ORDER BY embedding <-> ?
            LIMIT 5`,
      args: [qvStr, opts.userId ?? '', opts.conversationId ?? '', qvStr],
    }),
  ]);

  const docs = docsRes.rows as unknown as DocRow[];
  const hist = histRes.rows as unknown as HistRow[];

  return fuseHits(
    docs.map(d => ({ id: d.id, content: d.content, type: 'doc' as const, distance: d.distance, source: d.source, page: d.page })),
    hist.map(h => ({ id: h.id, content: h.content, type: 'history' as const, distance: h.distance, role: h.role })),
  ).slice(0, opts.k ?? 5);
}

// 加权融合（简化版）：docs 0.7 + history 0.3
export function fuseHits(
  docs: SearchHit[],
  hist: SearchHit[],
): SearchHit[] {
  const all: Array<SearchHit & { score: number }> = [];
  docs.forEach((d, i) => all.push({ ...d, score: (1 / (i + 60)) * 0.7 }));
  hist.forEach((h, i) => all.push({ ...h, score: (1 / (i + 60)) * 0.3 }));
  return all.sort((a, b) => b.score - a.score);
}
```

- [ ] **Step 4: 跑测试通过**

```bash
ZHIPU_API_KEY=<填值> npm test -- agents/__tests__/_libsql.test.ts
# 期望：PASS
```

- [ ] **Step 5: Commit**

```bash
git add agents/_libsql.ts agents/__tests__/_libsql.test.ts
git commit -m "feat(agents): add _libsql.ts (libSQL client + retrieval)"
```

---

### Task C3：改 agents/chat/index.ts 注入检索

**Files:**
- Modify: `claude-agent-starter-node-team/agents/chat/index.ts`

- [ ] **Step 1: 在 SYSTEM_PROMPT 末尾加占位符**

找到 `agents/chat/index.ts` 里的 `const SYSTEM_PROMPT = ...` 定义，在末尾追加：

```typescript
const SYSTEM_PROMPT = `
... 原有内容 ...

When answering, you may use the retrieved context below.
Cite sources as [doc:N] for documents or [hist:N] for conversation history.
If context is empty or marked unavailable, answer without citing.

[RETRIEVED CONTEXT]
{retrieved_context}
[END RETRIEVED CONTEXT]
`;
```

- [ ] **Step 2: 在 onRequest 中加检索逻辑**

在 `export async function onRequest(context: any) {` 函数里，**在 `buildAgentOptions` 调用之前**插入：

```typescript
import { retrieveContext } from '../_libsql';
import { createLogger } from '../_logger';
const logger = createLogger('retrieve');

// ... 在 onRequest 内部，message 解析之后、buildAgentOptions 之前：

let systemPrompt = SYSTEM_PROMPT;
try {
  const hits = await retrieveContext(message, context.env, {
    conversationId, userId, k: 5,
  });
  if (hits.length > 0) {
    const ctxBlock = hits.map((h, i) => {
      const meta = h.type === 'doc'
        ? `source: ${h.source}, page ${h.page}`
        : `history (${h.role})`;
      return `[${i + 1}] (${meta})\n${h.content}`;
    }).join('\n\n');
    systemPrompt = systemPrompt.replace('{retrieved_context}', ctxBlock);
    logger.log(`[retrieve] ${hits.length} hits, top dist=${hits[0].distance.toFixed(3)}`);
  } else {
    systemPrompt = systemPrompt.replace('{retrieved_context}', '(no relevant context found)');
  }
} catch (e) {
  logger.error('[retrieve] failed, fallback:', e);
  systemPrompt = systemPrompt.replace('{retrieved_context}', '(retrieval unavailable)');
}
```

- [ ] **Step 3: 把 systemPrompt 传给 buildAgentOptions**

`buildAgentOptions` 已经有 `systemPrompt: SYSTEM_PROMPT` 字段，把它替换成 `systemPrompt: systemPrompt`（变量名小写）。

- [ ] **Step 4: 在 .env.example 加新变量**

```bash
# 在 claude-agent-starter-node-team/.env.example 末尾追加：

# ── libSQL Vector DB ──
LIBSQL_URL=https://libsql.your-domain.com:8443
LIBSQL_RO_TOKEN=<Token A, read_only>
LIBSQL_RW_TOKEN=<Token B, read_write>
ZHIPU_API_KEY=<your zhipu key, can reuse AI_GATEWAY_API_KEY if same>
```

- [ ] **Step 5: 本地 Verification（用 edgeone makers dev）**

```bash
PAGES_SOURCE=skills edgeone makers env pull  # 拉远端变量到本地 .env
# 手动把 LIBSQL_URL / LIBSQL_RO_TOKEN / LIBSQL_RW_TOKEN / ZHIPU_API_KEY 加到本地 .env

PAGES_SOURCE=skills edgeone makers dev
# 浏览器开 http://127.0.0.1:8088/
# 问一句 "根据知识库，X 是什么？"
# 期望：agent 回答引用 [doc:1]
```

- [ ] **Step 6: Commit**

```bash
git add agents/chat/index.ts .env.example
git commit -m "feat(chat): inject retrieved context into system prompt"
```

---

