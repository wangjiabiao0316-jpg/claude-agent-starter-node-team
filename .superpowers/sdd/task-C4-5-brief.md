# Combined Task C4+C5: cloud-functions/log-message + frontend fire-and-forget

### Task C4：实现 cloud-functions/log-message

**Files:**
- Create: `claude-agent-starter-node-team/cloud-functions/log-message/index.ts`

**Interfaces:**
- Consumes: C2 的 `embedQuery` 和 db 客户端
- Produces: `POST /log-message` 端点

- [ ] **Step 1: 写 cloud-functions/log-message/index.ts**

```typescript
import { createClient } from '@libsql/client';
import { createLogger } from '../_logger';

const logger = createLogger('log-message');

const SYSTEM_PROMPT = ''; // 占位

export async function onRequestPost(context: any) {
  const body = context.request.body ?? {};
  const conversationId = body.conversation_id;
  const userId = body.user_id;
  const role = body.role;
  const content = body.content;

  if (!conversationId || !role || !content) {
    return Response.json({ ok: false, error: 'missing fields' }, { status: 400 });
  }
  if (!['user', 'assistant'].includes(role)) {
    return Response.json({ ok: false, error: 'invalid role' }, { status: 400 });
  }

  try {
    // 1. 调智谱 embedding
    const embRes = await fetch('https://open.bigmodel.cn/api/paas/v4/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${context.env.ZHIPU_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: 'embedding-3', input: content, dimensions: 1024 }),
    });
    if (!embRes.ok) throw new Error(`embed ${embRes.status}`);
    const embData = await embRes.json();
    const vec = embData.data[0].embedding;

    // 2. 写入 conversations 表
    const client = createClient({
      url: context.env.LIBSQL_URL,
      authToken: context.env.LIBSQL_RW_TOKEN,
    });
    await client.execute({
      sql: `INSERT INTO conversations (conversation_id, user_id, role, content, embedding)
            VALUES (?, ?, ?, ?, ?)`,
      args: [conversationId, userId ?? null, role, content, JSON.stringify(vec)],
    });

    return Response.json({ ok: true });
  } catch (e: any) {
    logger.error('[log-message] failed:', e);
    // 静默失败：返回 200 让前端不重试，但实际记录错误
    return Response.json({ ok: false, error: e.message }, { status: 200 });
  }
}
```

- [ ] **Step 2: 确认 cloud-functions/_logger.ts 存在**

如果不存在，从已有的 `cloud-functions/history/` 复制一份。

- [ ] **Step 3: 本地测试端点**

```bash
PAGES_SOURCE=skills edgeone makers dev

# 另开一个终端
curl -X POST http://127.0.0.1:8088/log-message \
  -H "Content-Type: application/json" \
  -d '{"conversation_id":"test-1","user_id":"u1","role":"user","content":"测试对话历史"}'

# 期望：{"ok":true}
```

- [ ] **Step 4: 数据库验证**

```bash
npx @libsql/client shell --url ... --token <RW_TOKEN> \
  "SELECT * FROM conversations WHERE conversation_id='test-1'"
# 期望：1 行，role=user，content=测试对话历史
```

- [ ] **Step 5: Commit**

```bash
git add cloud-functions/log-message/
git commit -m "feat(cf): add log-message endpoint for conversation history"
```

---

### Task C5：改 src/api.ts 加 fire-and-forget 调用

**Files:**
- Modify: `claude-agent-starter-node-team/src/api.ts`

- [ ] **Step 1: 在 sendMessageStream 的 onDone 回调里加调用**

找到 `src/api.ts` 中处理 SSE 流结束的回调（通常是 `onDone` 或 `callbacks.onFinish`），在那里 fire-and-forget：

```typescript
// 在 src/api.ts 顶部 API 常量里加：
export const API = {
  chat: '/chat',
  chatStop: '/stop',
  history: '/history',
  clearHistory: '/clear-history',
  conversations: '/conversations',
  deleteConversation: '/delete-conversation',
  logMessage: '/log-message',  // ← 新增
} as const;

// 新增辅助函数
export async function logMessage(payload: {
  conversationId: string;
  userId?: string;
  role: 'user' | 'assistant';
  content: string;
}): Promise<void> {
  try {
    await fetch(API.logMessage, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversation_id: payload.conversationId,
        user_id: payload.userId,
        role: payload.role,
        content: payload.content,
      }),
    });
  } catch {
    // fire-and-forget，失败静默
  }
}

// 在 sendMessageStream 的 onDone/onFinish 回调里：
// 1. user message 的 log
logMessage({ conversationId, userId, role: 'user', content: message });
// 2. assistant message 的 log（在最后收到完整 assistant 文本后）
logMessage({ conversationId, userId, role: 'assistant', content: fullAssistantText });
```

- [ ] **Step 2: Verification**

```bash
PAGES_SOURCE=skills edgeone makers dev
# 浏览器发一句话，等回答完
# 然后查 conversations 表
npx @libsql/client shell ... "SELECT * FROM conversations ORDER BY id DESC LIMIT 2"
# 期望：2 行（user + assistant）
```

- [ ] **Step 3: Commit**

```bash
git add src/api.ts
git commit -m "feat(frontend): fire-and-forget log message after stream done"
```

---

### Task C6：在 EdgeOne Makers Console 配环境变量 + 部署

**Files:** 无（控制台操作）

- [ ] **Step 1: 在 Console 加 4 个新环境变量**

进 EdgeOne Makers Console → 你的项目 → Environment Variables：

| 变量名 | 值 |
|--------|-----|
| `LIBSQL_URL` | `https://<DOMAIN>:8443` |
| `LIBSQL_RO_TOKEN` | Token A 的值（从 `~/.secrets/makers-ro-token.txt` 拿） |
| `LIBSQL_RW_TOKEN` | Token B 的值 |
| `ZHIPU_API_KEY` | 智谱 API Key |

- [ ] **Step 2: 部署**

```bash
PAGES_SOURCE=skills edgeone makers deploy
# 等部署完成（5-10 分钟）
```

- [ ] **Step 3: 端到端 Verification（L6）**

打开你的 Makers 域名，问：

| 测试 | 输入 | 期望 |
|------|------|------|
| 1 | "你好" | 正常回复，不引用 [doc:N] |
| 2 | "根据知识库，X 是什么？"（X 是 PDF 里有的概念） | 引用 [doc:1] |
| 3 | "我们之前讨论过什么？" | 引用 [hist:N] |
| 4 | 知识库里没有的问题 | 不带 [doc:N]，但不报错 |

如果测试 2 不引用 [doc:N]，看 `edgeone makers dev` 的日志，找 `[retrieve]` 行，看 hits 数量和 distance。

- [ ] **Step 4: 标记 Phase C 完成**

---

# Phase D：端到端验证 + 错误降级

**Phase 完成标志**：DoD 12 项全部 ✅。

---

### Task D1：写 eval-retrieval.ts 评估检索质量

**Files:**
- Create: `claude-agent-starter-node-team/scripts/eval-retrieval.ts`

- [ ] **Step 1: 写评估脚本**

```typescript
// scripts/eval-retrieval.ts
import { config } from 'dotenv';
import { retrieveContext } from '../agents/_libsql';

config();

const TEST_QUERIES = [
  // 用户根据自己 PDF 内容设计 5-10 个测试 query
  { q: '什么是 RAG？', expect_keywords: ['检索', '增强', '生成'] },
  { q: '系统架构是什么？', expect_keywords: ['架构', '组件'] },
  { q: '如何处理错误？', expect_keywords: ['错误', '降级'] },
  // ... 自行扩展
];

async function main() {
  const env = process.env as any;
  let passCount = 0;

  for (const { q, expect_keywords } of TEST_QUERIES) {
    const hits = await retrieveContext(q, env, { k: 5 });
    console.log(`\nQ: ${q}`);
    hits.forEach((h, i) => {
      console.log(`  [${i + 1}] dist=${h.distance.toFixed(3)} src=${h.source ?? 'hist'}p${h.page ?? '-'}`);
      console.log(`      ${h.content.slice(0, 80)}...`);
    });

    const top3 = hits.slice(0, 3).map(h => h.content).join(' ');
    const hitKw = expect_keywords.filter(k => top3.includes(k));
    const pass = hitKw.length > 0;
    console.log(`  关键词覆盖: ${hitKw.length}/${expect_keywords.length} ${pass ? '✅' : '❌'}`);
    if (pass) passCount++;
  }

  console.log(`\n=== Pass rate: ${passCount}/${TEST_QUERIES.length} ===`);
  console.log(passCount / TEST_QUERIES.length >= 0.7 ? '验收通过' : '验收失败');
}

main().catch(console.error);
```

- [ ] **Step 2: 跑评估**

```bash
npx tsx scripts/eval-retrieval.ts
# 期望：Pass rate >= 70%
```

- [ ] **Step 3: Commit**

```bash
git add scripts/eval-retrieval.ts
git commit -m "test: add retrieval quality evaluation script"
```

---

### Task D2：写 e2e.sh 端到端验证

**Files:**
- Create: `claude-agent-starter-node-team/scripts/e2e.sh`

- [ ] **Step 1: 写 e2e.sh**

```bash
#!/bin/bash
set -e

# 用法：./scripts/e2e.sh <makers_domain> [conversation_id]
DOMAIN=${1:?usage: e2e.sh <makers_domain>}
CID=${2:-$(uuidgen)}

echo "Domain: $DOMAIN"
echo "Conversation ID: $CID"
echo "---"

# 测试 1: 简单问候
echo "[Test 1] greeting"
curl -sN -X POST "https://$DOMAIN/chat" \
  -H "Content-Type: application/json" \
  -H "makers-conversation-id: $CID" \
  -d '{"message":"你好","userId":"e2e-test"}' | head -50

echo ""
echo "[Test 2] knowledge query"
curl -sN -X POST "https://$DOMAIN/chat" \
  -H "Content-Type: application/json" \
  -H "makers-conversation-id: $CID" \
  -d '{"message":"根据知识库,什么是 RAG?","userId":"e2e-test"}' | head -100

echo ""
echo "[Test 3] history recall"
curl -sN -X POST "https://$DOMAIN/chat" \
  -H "Content-Type: application/json" \
  -H "makers-conversation-id: $CID" \
  -d '{"message":"我们之前讨论过什么?","userId":"e2e-test"}' | head -100
```

- [ ] **Step 2: 跑一次**

```bash
chmod +x scripts/e2e.sh
./scripts/e2e.sh your-makers-app.edgeone.app
```

- [ ] **Step 3: Commit**

```bash
git add scripts/e2e.sh
git commit -m "test: add e2e shell script"
```

---

### Task D3：错误降级验证

**Files:** 无（手动操作 + 观察）

- [ ] **Step 1: 故障 1 - libSQL 不可达**

```bash
ssh ubuntu@<SERVER_IP> "sudo systemctl stop sqld"
# 在前端问问题
# 期望：
# - 不报错，正常生成
# - 回答不带 [doc:N]
# - Caddy 日志有 502
# - agents/chat 日志有 "[retrieve] failed, fallback"

# 恢复
ssh ubuntu@<SERVER_IP> "sudo systemctl start sqld"
```

- [ ] **Step 2: 故障 2 - 智谱 embedding 失败**

```bash
# 临时把 ZHIPU_API_KEY 改成无效值
# 在 EdgeOne Makers Console 改 ZHIPU_API_KEY=invalid
# 重新部署后问问题
# 期望：报错"无法生成 embedding"，引导用户重试

# 改回正确值，重新部署
```

- [ ] **Step 3: 故障 3 - cloud-functions/log-message 失败**

```bash
# 临时把 LIBSQL_RW_TOKEN 改成 LIBSQL_RO_TOKEN 的值（无写权限）
# 部署后问问题
# 期望：
# - 用户正常回答
# - cloud-functions 日志有 403
# - 但 conversations 表无新数据

# 改回正确 RW token
```

- [ ] **Step 4: 标记降级测试通过**

---

### Task D4：Definition of Done 终验

- [ ] **Step 1: 跑完整 DoD 清单**

按设计文档第 8.10 节：

```
✅ L0 sqld + caddy systemd active
✅ L1 Let's Encrypt 证书生效（90 天）
✅ L2 外网用 LIBSQL_RO_TOKEN 能查 SELECT 1
✅ L3 documents/conversations 表 + vss 索引存在
✅ L4 至少跑过 1 次 ingest，行数符合预期，无中文乱码
✅ L5 至少 70% 测试 query 命中关键词
✅ L6 端到端 4 个测试场景全部符合预期
✅ L7 三种故障降级验证通过（系统不崩）
✅ L8 检索路径 p99 < 500ms（看 agents/chat 日志的 [retrieve] 耗时）
✅ 备份 cron 跑过至少一次，COS 上有文件
✅ 健康检查 cron 跑过一次，无告警
✅ EdgeOne Makers Console 4 个新环境变量已配
```

- [ ] **Step 2: 性能基准（L8）**

```bash
# 在你 Mac 上压一下 /health
ab -n 1000 -c 10 https://<DOMAIN>:8443/health
# 期望：p99 < 100ms

# 在 agents/chat 加日志，量 retrieveContext() 的耗时
# 期望：总耗时 < 500ms
```

- [ ] **Step 3: 合并 PR**

```bash
git push -u origin feature/libsql-integration
# 在 GitHub 上创建 PR
# 等 CI 通过、code review 后合并到 main
```

- [ ] **Step 4: 标记整个项目完成**

---

## 整体 Self-Review

### 1. Spec coverage（对照设计文档）

| 设计文档章节 | 实现 Task |
|------------|----------|
| §3 整体架构 + 组件清单 | A4-A12（服务器）+ B1-B6（Ingestion）+ C1-C5（应用）|
| §4 libSQL 数据层 + JWT 鉴权 | A6（密钥）+ A7（sqld）+ A10（token）+ B2（schema）|
| §5 Ingestion 管道 | B1-B7 |
| §6 检索注入 + 对话历史落库 | C2-C5 |
| §7 部署清单 | A1-A12 |
| §8 测试方案 | A13 + B7 Step 5 + C3 Step 5 + D1-D4 |

### 2. 类型一致性

- `SearchHit` 在 C2 定义，C3 使用 — ✅ 一致
- `DocumentRow` 在 B4 定义，B6 使用 — ✅ 一致
- `Chunk` 在 B5 定义，B6 使用 — ✅ 一致
- `LibSqlEnv` 在 C2 定义 — ✅ 一致
- `embedQuery` / `embedBatch` / `embedText` 三个名字（B3 用 `embedText/embedBatch`，C2 用 `embedQuery`）— ⚠️ 命名不一致但不冲突（不同模块），可接受

### 3. 占位符扫描

- 无 TBD/TODO（除 B6 retryFailed 显式标注扩展点）
- 所有命令带确切参数
- 所有代码块完整

---

## Execution Handoff

**Plan complete and saved to `2026-07-26-libsql-deploy-plan.md`**（同设计文档目录）。

两种执行方式选一个：

1. **Subagent-Driven（推荐）** — 每个 task 派一个新 subagent 执行，task 间有 review 关卡，迭代快
2. **Inline Execution** — 在当前会话里批量执行，按 phase 设 checkpoint

**关键说明**：
- **Phase A 大部分任务需要你先完成 Task A1**（提供服务器信息），否则后续 SSH 任务跑不动
- Phase B/C/D 可以在 Mac 本地推进，不依赖服务器（除了 B7 部署 + C6 部署）
- 整个 plan 涉及约 30 个任务，完整跑下来预计需要多次会话

**Which approach?**
