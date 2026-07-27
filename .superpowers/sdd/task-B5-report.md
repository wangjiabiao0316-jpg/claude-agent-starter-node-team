# Task B5 Report: pdf.ts（解析 + 中文切块）+ 测试

## Status: DONE_WITH_CONCERNS

## Files Created
- `scripts/ingest/src/pdf.ts` — PDF extraction + Chinese-aware chunking (transcribed verbatim from brief)
- `scripts/ingest/src/__tests__/chunk.test.ts` — 3 vitest tests for `chunkPages` (transcribed verbatim from brief)

## Commits
- `ddcf37e` feat(ingest): add pdf.ts (unpdf extraction + Chinese-aware chunking)

## TDD Evidence

### RED (Step 2)
```
FAIL  src/__tests__/chunk.test.ts [ src/__tests__/chunk.test.ts ]
Error: Failed to load url ../pdf.js (resolved id: ../pdf.js)
in .../scripts/ingest/src/__tests__/chunk.test.ts. Does the file exist?
Test Files  1 failed (1)
Tests  no tests
```
Confirmed `Cannot find module '../pdf.js'` before writing pdf.ts.

### GREEN (Step 4)
```
✓ src/__tests__/chunk.test.ts (3 tests) 2ms
Test Files  1 passed (1)
Tests  3 passed (3)
```
All 3 tests passed:
- `splits long paragraph by Chinese punctuation`
- `merges short paragraphs`
- `preserves page number`

### Full Vitest Suite (no regressions)
```
✓ src/__tests__/embed.test.ts (2 tests)
✓ src/__tests__/chunk.test.ts (3 tests)
Test Files  2 passed (2)
Tests  5 passed (5)
```

## Exports Verified
- `extractPdfPages(filePath: string): Promise<PageText[]>` ✓
- `chunkPages(pages: PageText[], opts: ChunkOpts): Chunk[]` ✓
- Types: `PageText`, `Chunk`, `ChunkOpts` ✓

## Test Coverage
- Long paragraph (> size*1.6) split by Chinese punctuation: covered
- Short paragraph (< size*0.4) merge across \n\n boundaries: covered
- Page number preservation across multi-page input: covered
- `extractPdfPages` not unit-tested (would require real PDF fixture; explicitly excluded per brief)

## Self-Review
- [x] All exports present (`extractPdfPages`, `chunkPages`, `PageText`, `Chunk`, `ChunkOpts`)
- [x] Tests cover: long paragraph split, short paragraph merge, page number preservation
- [x] TDD evidence captured (RED + GREEN)
- [ ] **TypeScript compiles cleanly**: see Concern #1

## Concerns

### 1. `extractPdfPages` does not type-check against unpdf@1.8.0 API

`npx tsc --noEmit` reports:

```
src/pdf.ts(28,36): error TS2769: No overload matches this call.
  Argument of type 'PDFPageProxy' is not assignable to parameter of type
  'string | number[] | ArrayBuffer | PDFDocumentProxy | TypedArray | undefined'.
src/pdf.ts(29,38): error TS2339: Property 'trim' does not exist on type
  '{ totalPages: number; text: string[]; } & ...'.
```

**Root cause:** unpdf's `extractText(data, options)` accepts the **document proxy** (or binary data), not a `PDFPageProxy` returned by `pdf.getPage(i)`. The brief's loop iterates pages and calls `extractText(page, ...)` per-page, which does not match unpdf@1.8.0's API contract.

**Runtime implication:** `extractPdfPages` will likely throw or produce unexpected output when invoked against a real PDF file. The brief itself notes "`extractPdfPages` is exported but not unit-tested (would need a fixture PDF)" so this was not exercised.

**Why not fixed:** The brief is explicit: "The brief contains the COMPLETE code for `pdf.ts` and `chunk.test.ts`. Your job is **transcription + TDD verification**" and "Write `pdf.ts` exactly as in brief Step 3". Modifying the code would violate the brief's contract. Flagging for follow-up — likely B6 (CLI entry) will need to either:
  - Pass the **document proxy** to `extractText` once with `mergePages: false`, returning `string[]`, then map to `PageText[]`; or
  - Use `pdf.getPage(i).getTextContent()` directly from the underlying pdfjs API.

**Mitigation in this task:** Tests only cover `chunkPages`, which is pure and works correctly. Build (`tsc`) is not part of `npm test`. The runtime path is not exercised.

### 2. ESM import ordering

Per brief's "Important Notes", the `import { readFile } from 'fs/promises';` is intentionally placed after other code (which is fine because ESM imports are hoisted). Preserved verbatim. No issue.

### 3. Regex lookbehind `(?<=[。！？；\n])`

Tested implicitly by the "splits long paragraph" test which uses `。` punctuation. Node 22+ supports lookbehind. Vitest passes. No issue.

## Recommendation for B6 (CLI entry)
Before integrating `extractPdfPages`, decide whether to:
1. Patch `extractPdfPages` to match unpdf's API (likely `extractText(pdf, { mergePages: false })` returning `string[]`).
2. Add a fixture PDF and a smoke test for `extractPdfPages` to lock down runtime behavior.

This should be raised with the brief author before B6 starts consuming the function.

## Report Path
`/Users/huangzetao/Documents/GitHub/claude-agent-starter-node-team/.superpowers/sdd/task-B5-report.md`

---

## Fix Log

### Problem
`scripts/ingest/src/pdf.ts` called `extractText(page, { mergePages: true })` where `page` was `PDFPageProxy`. unpdf@1.8.0's `extractText` only accepts `PDFDocumentProxy | binary data`. Caused `tsc --noEmit` to fail with TS2769 + TS2339.

### Change Made

**Before (`extractPdfPages` + import):**
```typescript
import { extractText, getDocumentProxy } from 'unpdf';
// ...
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
```

**After:**
```typescript
import { extractText } from 'unpdf';
// ...
export async function extractPdfPages(filePath: string): Promise<PageText[]> {
  const buf = await readFile(filePath);
  const { totalPages, text } = await extractText(buf, { mergePages: false });
  // text is string[] (one per page); guard against unexpected shapes
  if (!Array.isArray(text)) {
    return [{ page: 1, text: String(text).trim() }];
  }
  return text.map((t, i) => ({
    page: i + 1,
    text: (t ?? '').trim(),
  }));
}
```

Key changes:
1. Removed unused `getDocumentProxy` import.
2. Replaced per-page `extractText(page, ...)` loop with a single call to `extractText(buf, { mergePages: false })` which returns `{ totalPages, text: string[] }`.
3. Map `string[]` → `PageText[]` with `page = i + 1` (1-indexed).
4. Add defensive guard for non-array `text` shape.

### Verification

**`tsc --noEmit`** (run from `scripts/ingest/`):
```
$ npx tsc --noEmit
(exit code 0, no output — clean)
```

**`vitest run`**:
```
RUN  v2.1.9 /Users/huangzetao/Documents/GitHub/claude-agent-starter-node-team/scripts/ingest

 ✓ src/__tests__/embed.test.ts (2 tests) 1ms
 ✓ src/__tests__/chunk.test.ts (3 tests) 1ms

 Test Files  2 passed (2)
      Tests  5 passed (5)
   Start at  11:49:13
   Duration  166ms (transform 25ms, setup 0ms, collect 28ms, tests 2ms, environment 0ms, prepare 94ms)
```

All 5 tests pass (3 chunk + 2 embed). No regressions.

### Commit

```
e480c29c42a29b836b3965ed5d345c7930723e92
```

Message: `fix(ingest): use extractText with mergePages:false instead of per-page call`
Branch: `feature/libsql-integration`

### Status
- tsc: clean (0 errors)
- vitest: 5/5 passed
- Concern #1 from initial report is resolved.
