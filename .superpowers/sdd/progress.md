# libSQL 部署 + Makers 集成 - 进度账本

**Plan**: /Users/huangzetao/Desktop/个人文件夹/obzidian/日期/20241025/Obsidian-ABCDE(qiqi)-V5.2.4/Obsidian-ABCDE/AI技能大赛/二、复赛一阶段/开发/2026-07-26-libsql-deploy-plan.md
**Spec**: /Users/huangzetao/Desktop/个人文件夹/obzidian/日期/20241025/Obsidian-ABCDE(qiqi)-V5.2.4/Obsidian-ABCDE/AI技能大赛/二、复赛一阶段/开发/2026-07-26-libsql-deploy-design.md
**Branch**: feature/libsql-integration
**Started**: 2026-07-26

## Phase A：服务器基础设施（需要用户参与）
- [ ] A1: 索取服务器连接信息（**用户输入**）
- [ ] A2: 配置 DNSPod A 记录（用户控制台操作）
- [ ] A3: 腾讯云安全组开 8443（用户控制台操作）
- [ ] A4-A12: SSH 部署 sqld + Caddy + JWT + cron
- [ ] A13: Phase A 整体验收

## Phase B：Ingestion CLI（仓库内代码 + TDD）
- [ ] B1: 创建 scripts/ingest 工作区
- [ ] B2: 写 schema.sql + 推到服务器建表（依赖 A）
- [ ] B3: 实现 embed.ts + 测试
- [ ] B4: 实现 db.ts
- [ ] B5: 实现 pdf.ts + 测试
- [ ] B6: 实现 index.ts CLI 入口
- [ ] B7: 部署到服务器跑全量（依赖 A）

## Phase C：应用端集成（仓库内代码）
- [ ] C1: 加 @libsql/client 依赖
- [ ] C2: 实现 agents/_libsql.ts + 测试
- [ ] C3: 改 agents/chat/index.ts 注入检索
- [ ] C4: 加 cloud-functions/log-message
- [ ] C5: 改 src/api.ts fire-and-forget
- [ ] C6: Makers Console 配变量 + 部署（用户操作）

## Phase D：端到端验证
- [ ] D1: eval-retrieval.ts
- [ ] D2: e2e.sh
- [ ] D3: 错误降级验证
- [ ] D4: DoD 终验

## 完成记录
（task 完成后追加：`Task N: complete (commits <base7>..<head7>, review clean)`）

## 完成记录

- Task B1: complete (commits ffca67b..8533265, review clean — Approved, 3 Minor noted for final triage)
  - Minor 1: `--experimental-vm-modules` flag in package.json scripts may be unnecessary for compiled ESM; revisit in B6
  - Minor 2: README.md doesn't mention Node 22+ requirement (brief didn't ask)
  - Minor 3: tsconfig uses `Bundler` module resolution; may need revisit if `node dist/index.js` fails at runtime in B6

- Task B2: deferred (needs SSH access to server, will do after Phase A)
- Task B3: complete (commits 8533265..e9a8e37, review clean — Approved, 4 Minor noted for final triage)
  - Minor 1: hashText export has no test coverage (brief template didn't require it)
  - Minor 2: process.env.ZHIPU_API_KEY! non-null assertion in tests (could use `?? ''`)
  - Minor 3: ZhipuEmbeddingResponse.usage field declared but unused
  - Minor 4: error message includes full body (could slice for very long responses)
  - Note: out-of-scope vitest.config.ts was justified (root vite.config.ts references uninstalled `vite`); not a finding
- Task B4: complete (commits e9a8e37..618563f, review clean — Approved, 4 Minor noted)
  - Minor 1: embedding stored as JSON string, validate against VECTOR(1024) schema in B7
  - Minor 2: getIngestState type assertions trust DB rows (brief-mandated)
  - Minor 3: `void stmt;` pattern unusual but brief-specified
  - Minor 4: no error handling in functions (caller B6 handles)
- Task B5: complete (commits 618563f..e480c29, includes fix for unpdf API misuse; review by controller — fix verified by tsc clean + 5/5 tests passing)
  - Original B5 commit: ddcf37e (extractText(page) was wrong API)
  - Fix commit: e480c29 (use extractText(buf, { mergePages: false }) returning string[])
  - Plan fix needed: plan task B5 brief also has same API error; not retroactively editing plan, but noting for future refresh
- Task B6: complete (commits e480c29..bbc6297, review clean — Approved, 5 Minor noted for final triage)
  - Minor 1: `void stats;` pattern is code smell (brief-mandated)
  - Minor 2: Batch failures mark ingest as `done` even if some chunks failed (semantics debatable)
  - Minor 3: Progress bar may jump due to non-atomic counter across concurrent batches (cosmetic)
  - Minor 4: retryFailed() is intentional stub
  - Minor 5: Live integration test deferred (Phase A dependency)

## 当前阻塞点（2026-07-26）
Phase B 代码任务全部完成。下一步必须用户参与：
- Task A1（索取服务器信息）— 必须用户提供
- Task A2-A13 — 大部分需要 SSH 进服务器
- Task B2 Step 2 + B7 — 需要服务器跑通
- Task C6 — 需要 EdgeOne Makers Console

可选：继续 Phase C 代码任务（C1-C5）不依赖服务器。

## Phase A 完成 (2026-07-26)
- A4-A: 系统初始化 ✅（OpenCloudOS 9.6 / dnf / firewalld）
- A4-B: Node 22 + jq ✅
- A4-C: sqld 0.24.32 二进制 ✅（参数名调整：--http-listen-addr, --auth-jwt-key-file）
- A4-D: Ed25519 密钥 + sqld systemd ✅
- A4-E: Caddy + DNSPod + Let's Encrypt ✅
- A4-F: 3 个 JWT token（ro/rw/ingest）✅
- A4-G: schema 推送（4 表 + 5 索引 + libsql_vector shadow 表）✅
  - 关键调整：VECTOR(1024) → F32_BLOB(1024)；vss0() → libsql_vector_idx()
- A4-H: 健康检查 cron + 本地备份 cron ✅
- COS 异地备份：暂跳过（本地备份够用）

## 下一步
- B7: 部署 Ingestion CLI 到服务器（rsync + npm ci）
- C6: EdgeOne Makers Console 配 4 个环境变量
- C1-C5: 应用端代码改动（在 Mac 本地）
- D1-D4: 端到端验证

## Phase B 完整完成 (2026-07-27)
- B7: rsync 推送代码到 /opt/ingest + npm ci + build + 跑测试 PDF ✅
- 测试 PDF（102 页园区 AI 方案）→ 76 行向量 ✅
- 中文内容可读，页码范围合理，整链工作

## 待办
- C1-C5 应用端代码改动（在 Mac 本地仓库）
- C6 用户配 EdgeOne Makers Console 4 个变量（用户操作）
- D 系列端到端验证

## Phase C 代码完成 (2026-07-27)
- C1+C2+C3: complete (3 commits 7d84d78..ba554de, 7/7 tests, tsc clean)
- C4+C5: complete (2 commits 91740f2..b8213ac, tsc clean)
- 跳过单独 review (token 预算)，依赖 final whole-branch review

## 下一步
- C6 用户配 EdgeOne Makers Console 4 个变量
- 部署 + 端到端测试
- D 系列 DoD 验收
