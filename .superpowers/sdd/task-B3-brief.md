### Task B3：实现 embed.ts + 测试

**Files:**
- Create: `claude-agent-starter-node-team/scripts/ingest/src/embed.ts`
- Test: `claude-agent-starter-node-team/scripts/ingest/src/__tests__/embed.test.ts`

**Interfaces:**
- Produces: `embedText(text, env): Promise<number[]>`、`embedBatch(texts, env): Promise<number[][]>`

- [ ] **Step 1: 写测试 embed.test.ts**

```typescript
import { describe, it, expect } from 'vitest';
import { embedText, embedBatch } from '../embed.js';

describe('embed', () => {
  it('returns 1024-dim vector for valid input', async () => {
    const env = { ZHIPU_API_KEY: process.env.ZHIPU_API_KEY! };
    if (!env.ZHIPU_API_KEY) return; // skip if no key
    const vec = await embedText('测试', env);
    expect(vec).toHaveLength(1024);
    expect(vec.every(v => typeof v === 'number' && !Number.isNaN(v))).toBe(true);
  });

  it('embeds batch of 3', async () => {
    const env = { ZHIPU_API_KEY: process.env.ZHIPU_API_KEY! };
    if (!env.ZHIPU_API_KEY) return;
    const vecs = await embedBatch(['a', 'b', 'c'], env);
    expect(vecs).toHaveLength(3);
    expect(vecs[0]).toHaveLength(1024);
  });
});
```

- [ ] **Step 2: 跑测试看失败**

```bash
cd scripts/ingest
ZHIPU_API_KEY=<填值> npx vitest run src/__tests__/embed.test.ts
# 期望：FAIL "Cannot find module '../embed.js'"
```

- [ ] **Step 3: 写 embed.ts**

```typescript
import { createHash } from 'crypto';

const EMBED_URL = 'https://open.bigmodel.cn/api/paas/v4/embeddings';
const MODEL = 'embedding-3';
const DIMENSIONS = 1024;

export interface EmbedEnv {
  ZHIPU_API_KEY: string;
}

interface ZhipuEmbeddingResponse {
  data: Array<{ embedding: number[] }>;
  usage: { prompt_tokens: number; total_tokens: number };
}

async function callZhipu(input: string | string[], env: EmbedEnv): Promise<ZhipuEmbeddingResponse> {
  const res = await fetch(EMBED_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.ZHIPU_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: MODEL, input, dimensions: DIMENSIONS }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Embedding API ${res.status}: ${text}`);
  }
  return res.json();
}

export async function embedText(text: string, env: EmbedEnv): Promise<number[]> {
  const data = await callZhipu(text, env);
  return data.data[0].embedding;
}

export async function embedBatch(texts: string[], env: EmbedEnv): Promise<number[][]> {
  if (texts.length === 0) return [];
  if (texts.length > 64) throw new Error('Batch size must be <= 64');
  const data = await callZhipu(texts, env);
  // Zhipu 返回顺序与输入顺序一致
  return data.data.map(d => d.embedding);
}

export function hashText(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}
```

- [ ] **Step 4: 跑测试通过**

```bash
ZHIPU_API_KEY=<填值> npx vitest run src/__tests__/embed.test.ts
# 期望：PASS
```

- [ ] **Step 5: Commit**

```bash
git add scripts/ingest/src/embed.ts scripts/ingest/src/__tests__/embed.test.ts
git commit -m "feat(ingest): add embed.ts (Zhipu embedding-3 client)"
```

---

