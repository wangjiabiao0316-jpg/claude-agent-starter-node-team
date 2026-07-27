# Task C4 + C5 Report — log-message endpoint + frontend fire-and-forget

Branch: `feature/libsql-integration`
Base: `ba554de` (after C1+C2+C3)
Date: 2026-07-27

## Sub-task C4 — cloud-functions/log-message endpoint

**File created:** `cloud-functions/log-message/index.ts` (163 lines)

**What it does:**
- POST `/log-message` handler exported as `onRequestPost`
- Reads JSON body via `await context.request.json()` (matches the proven pattern in `cloud-functions/history/index.ts`)
- Validates required fields (`conversation_id`, `role`, `content`) and rejects `role` not in `{'user','assistant'}`
- Calls Zhipu embedding-3 (`https://open.bigmodel.cn/api/paas/v4/embeddings`, model `embedding-3`, `dimensions: 1024`) using `context.env.ZHIPU_API_KEY`
- Creates libSQL client with `context.env.LIBSQL_URL` + `context.env.LIBSQL_RW_TOKEN` and executes:
  ```sql
  INSERT INTO conversations (conversation_id, user_id, role, content, embedding)
  VALUES (?, ?, ?, ?, ?)
  ```
  with `args: [conversationId, userId || null, role, content, JSON.stringify(vec)]`
  (the JSON-stringified `number[]` pattern is proven working in C2's `agents/_libsql.ts`).
- Reuses `createLogger` from `cloud-functions/_logger.ts` for structured logs (tag = `log-message`).
- Returns HTTP 200 in all paths (success → `{ok: true}`, validation failure → `{ok: false, error}`, exception → `{ok: false, error: e.message}`) so the frontend's fire-and-forget call never blocks the chat UX.
- All env reads go through `context.env` (verified: zero `process.env` occurrences in the file).

**TDD evidence:** n/a for this task per brief — verified by `npx tsc --noEmit` (clean) and the smoke-test plan in C6.

**Commit:** `91740f2 feat(cf): add log-message endpoint for conversation history`

---

## Sub-task C5 — Frontend fire-and-forget `logMessage`

**Files modified:**
- `src/api.ts` (+38 lines)
- `src/App.tsx` (+25 lines)

**What it does:**

`src/api.ts`:
- Added `logMessage: '/log-message'` to the `API` route constant.
- Added new exported `logMessage(payload)` async function:
  - Signature: `{ conversationId, userId?, role: 'user' | 'assistant', content: string }` → `Promise<void>`
  - POSTs JSON `{ conversation_id, user_id, role, content }` to `/log-message`
  - Try/catch wraps the entire body; any failure is logged via `console.warn` and swallowed
  - Returns `void` (callers cannot await a meaningful result — by design)
  - Early-returns on missing required fields so we never send empty payloads

`src/App.tsx`:
- Imported `logMessage` from `./api`.
- Inside `handleSend`'s closure, introduced a local `let assistantText = ''` accumulator. The `onTextDelta` SSE callback appends each delta to this local string in addition to the existing `updateBotMessage(content => content + delta)`. (Reading back from React state inside `onDone` is unreliable because state updates are async and the closure captures a stale value.)
- In the `onDone` callback, after the existing `refreshConversations('replace')` reconciliation, fire-and-forget logs both halves of the turn:
  ```ts
  const convId = conversationIdRef.current;
  const uid = eoUuidRef.current;
  if (convId) {
    void Promise.allSettled([
      logMessage({ conversationId: convId, userId: uid, role: 'user',      content: text }),
      logMessage({ conversationId: convId, userId: uid, role: 'assistant', content: assistantText }),
    ]);
  }
  ```
  `Promise.allSettled` (not `Promise.all`) and the `void` prefix make this strictly non-blocking — any rejection is swallowed inside `logMessage`, and the call is never awaited.

**TDD evidence:** n/a per brief — verified by `npx tsc --noEmit` (clean) plus existing test suite.

**Commit:** `b8213ac feat(frontend): fire-and-forget log message after stream done`

---

## Verification summary

| Check | Result |
|------|--------|
| `npx tsc --noEmit` (whole project) | PASS (no output, exit 0) |
| `npm test` (root) | n/a — root has no `test` script |
| `npm test` in `scripts/ingest` | PASS (2 files, 5 tests, 0 failures) |
| `process.env` occurrences in `cloud-functions/log-message/index.ts` | 0 (uses `context.env`) |
| Files outside scope touched | None |

## Files changed (per commit)

**91740f2 (C4):**
- NEW `cloud-functions/log-message/index.ts`

**b8213ac (C5):**
- MODIFIED `src/api.ts`
- MODIFIED `src/App.tsx`

## Concerns

1. **Schema drift assumption** — the INSERT assumes the `conversations` table has exactly the columns `(conversation_id, user_id, role, content, embedding)` and that `embedding` is `F32_BLOB(1024)`. This matches the schema documented in `agents/_libsql.ts` and the one created in Phase B, but if someone migrates the schema, this endpoint will fail at runtime with a SQL error. The C2 retrieveContext query has the same coupling, so this is consistent rather than new risk.

2. **No retry / no dedupe** — fire-and-forget by design. If `/log-message` returns `ok=false` (e.g. transient libSQL outage, embedding rate limit), that turn is simply absent from `conversations` and won't appear in future `retrieveContext` history hits. This is the agreed contract per the brief ("HTTP 200 either way to avoid blocking frontend retries") and matches the broader design choice that retrieval is a UX enhancement, not a correctness requirement. Future enhancement: a small client-side retry queue with exponential backoff, only if data-loss rate proves unacceptable.

3. **Cost / latency on hot path** — every user turn now triggers two Zhipu embedding calls (one in `agents/_libsql.ts` for retrieval at `/chat`, two more here for user + assistant logging). At Zhipu's current pricing this is negligible, but worth monitoring. The `/log-message` calls themselves are off the critical path (fire-and-forget after stream done), so they do not affect chat latency.

4. **`assistantText` accumulator scope** — `let assistantText = ''` lives inside the `handleSend` closure and is captured by the `onTextDelta` and `onDone` callbacks passed to `sendMessageStream`. Each new `handleSend` invocation gets a fresh binding, so concurrent sends (which the UI already blocks via `loading`) would not interfere. If the UI ever allows concurrent streams in the same conversation, this assumption would need revisiting.

5. **Frontend tests** — there is no frontend test harness in this repo (no vitest/jest config at root, no `__tests__` for `src/`). The brief explicitly says "no new tests required for these", and the existing `scripts/ingest` vitest suite is unaffected by these changes. End-to-end smoke testing of the new endpoint requires deploying to EdgeOne Makers (Task C6).

## Report path

`/Users/huangzetao/Documents/GitHub/claude-agent-starter-node-team/.superpowers/sdd/task-C4-5-report.md`
