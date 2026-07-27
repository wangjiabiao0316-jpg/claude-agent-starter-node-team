### Task B5：实现 pdf.ts（解析 + 中文切块）+ 测试

**Files:**
- Create: `claude-agent-starter-node-team/scripts/ingest/src/pdf.ts`
- Test: `claude-agent-starter-node-team/scripts/ingest/src/__tests__/chunk.test.ts`

**Interfaces:**
- Produces: `extractPdfPages(filePath): Promise<PageText[]>`、`chunkPages(pages, opts): Promise<Chunk[]>`

- [ ] **Step 1: 写测试 chunk.test.ts**

```typescript
import { describe, it, expect } from 'vitest';
import { chunkPages } from '../pdf.js';

describe('chunkPages', () => {
  it('splits long paragraph by Chinese punctuation', () => {
    const longText = '这是一段很长的中文文本。'.repeat(100); // 1000 字符
    const pages = [{ page: 1, text: longText }];
    const chunks = chunkPages(pages, { size: 500, overlap: 100 });
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].content.length).toBeLessThanOrEqual(800);
    expect(chunks[0].page).toBe(1);
  });

  it('merges short paragraphs', () => {
    const pages = [{ page: 1, text: '短句一。\n\n短句二。\n\n短句三。' }];
    const chunks = chunkPages(pages, { size: 500, overlap: 100 });
    // 三个短段落应该合并成一块（< 200 字符触发合并）
    expect(chunks.length).toBe(1);
  });

  it('preserves page number', () => {
    const pages = [
      { page: 1, text: '第一页内容。' },
      { page: 2, text: '第二页内容。' },
    ];
    const chunks = chunkPages(pages, { size: 500, overlap: 100 });
    expect(chunks.find(c => c.page === 1)).toBeTruthy();
    expect(chunks.find(c => c.page === 2)).toBeTruthy();
  });
});
```

- [ ] **Step 2: 跑测试看失败**

```bash
npx vitest run src/__tests__/chunk.test.ts
# 期望：FAIL "Cannot find module '../pdf.js'"
```

- [ ] **Step 3: 写 pdf.ts**

```typescript
import { extractText, getDocumentProxy } from 'unpdf';
import { createHash } from 'crypto';

export interface PageText {
  page: number;
  text: string;
}

export interface Chunk {
  source: string;
  page: number;
  chunk_index: number;
  content: string;
  hash: string;
}

export interface ChunkOpts {
  size: number;      // 目标块大小（字符）
  overlap: number;   // 块间重叠
}

export async function extractPdfPages(filePath: string): Promise<PageText[]> {
  const buf = await readFile(filePath);
  const pdf = await getDocumentProxy(buf);
  const pages: PageText[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const text = await extractText(page, { mergePages: true });
    pages.push({ page: i, text: text.trim() });
  }
  return pages;
}

// fs/promises 在 Node ESM 中
import { readFile } from 'fs/promises';

const SENTENCE_END = /[。！？；\n]/;

/**
 * 切块策略（中文优化）：
 * 1. 按 \n\n 切段
 * 2. 段落 > size*1.6 → 按句号硬切
 * 3. 段落 < size*0.4 → 与下一段合并
 * 4. 块间加 overlap 字符重叠
 */
export function chunkPages(pages: PageText[], opts: ChunkOpts): Chunk[] {
  const { size, overlap } = opts;
  const minLen = size * 0.4;
  const maxLen = size * 1.6;
  const chunks: Chunk[] = [];

  for (const { page, text } of pages) {
    if (!text) continue;
    // Step 1: 按 \n\n 切段
    const paragraphs = text.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);

    // Step 2 + 3: 合并过短 / 拆分过长
    const normalized: string[] = [];
    let buf = '';
    for (const p of paragraphs) {
      if (p.length > maxLen) {
        if (buf) { normalized.push(buf); buf = ''; }
        // 按 SENTENCE_END 拆 p
        const sentences = p.split(/(?<=[。！？；\n])/);
        let cur = '';
        for (const s of sentences) {
          if ((cur + s).length > maxLen) {
            if (cur) normalized.push(cur);
            cur = s;
          } else {
            cur += s;
          }
        }
        if (cur) normalized.push(cur);
      } else if (p.length < minLen) {
        buf = buf ? `${buf}\n\n${p}` : p;
        if (buf.length >= minLen) {
          normalized.push(buf);
          buf = '';
        }
      } else {
        if (buf) { normalized.push(buf); buf = ''; }
        normalized.push(p);
      }
    }
    if (buf) normalized.push(buf);

    // Step 4: 加 overlap
    for (let i = 0; i < normalized.length; i++) {
      const content = i > 0 && overlap > 0
        ? normalized[i - 1].slice(-overlap) + normalized[i]
        : normalized[i];
      chunks.push({
        source: '', // 由调用方填
        page,
        chunk_index: chunks.filter(c => c.page === page).length,
        content,
        hash: createHash('sha256').update(content).digest('hex'),
      });
    }
  }
  return chunks;
}
```

- [ ] **Step 4: 跑测试通过**

```bash
npx vitest run src/__tests__/chunk.test.ts
# 期望：3 个测试全 PASS
```

- [ ] **Step 5: Commit**

```bash
git add scripts/ingest/src/pdf.ts scripts/ingest/src/__tests__/chunk.test.ts
git commit -m "feat(ingest): add pdf.ts (unpdf extraction + Chinese-aware chunking)"
```

---

