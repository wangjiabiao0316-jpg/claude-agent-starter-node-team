/**
 * chat/_tools.ts — sandbox bootstrap helpers for the chat agent.
 *
 * prepareSandbox() is intended to be called by agents/chat/index.ts::onRequest
 * after EdgeOne creates a sandbox and before Claude agent turns begin.
 *
 * Responsibilities:
 *  1. Probe sandbox cold start (ls /tmp, 3 retries with 2s backoff).
 *  2. Write the shared Python module libsql_client.py to /tmp/finance/ so
 *     downstream Python skills (agent3/agent5 in the super-skill pipeline)
 *     can `import libsql_client` directly.
 *  3. Pre-write all sandbox assets that downstream skills (agent3/4/5/6)
 *     need to execute. This avoids the LLM having to `Read` local
 *     `/Users/...` paths (which fails on EdgeOne Makers production where
 *     the sandbox is an isolated Linux container with no access to the
 *     developer's macOS filesystem).
 *  4. Inject LIBSQL_URL + LIBSQL_RO_TOKEN into the sandbox via .env file
 *     AND `export` command (dual-channel to survive shell-session resets).
 *
 * Failures are reported but never thrown — the chat path must not break
 * just because sandbox preparation partially failed.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const PROJECT_ROOT = process.cwd();
const SHARED_SCRIPTS_DIR = join(PROJECT_ROOT, '.claude/skills/_shared/scripts');
const SANDBOX_FINANCE_DIR = '/tmp/finance';
const LIBSQL_CLIENT_FILENAME = 'libsql_client.py';

// 3 retries × 2s ≈ 6s budget for cold-start probe before giving up.
const PROBE_MAX_ATTEMPTS = 3;
const PROBE_BACKOFF_MS = 2000;
// Generous per-command timeouts because a cold sandbox can take seconds to
// respond to its first shell invocation.
const PROBE_TIMEOUT_S = 10;
const MKDIR_TIMEOUT_S = 5;
const EXPORT_TIMEOUT_S = 5;

/**
 * Files to pre-write into the sandbox so downstream agent skills don't
 * need to `Read` local /Users/... paths (which fails on EdgeOne Makers
 * production). Each entry is { src: project-relative path, dst: sandbox path }.
 *
 * Coverage:
 *  - agent3: finance_tools.py + 5 references JSON
 *  - agent4: finance.py + cashflow.py + industry_thresholds.py + thresholds.json
 *  - agent5: case_matcher.py + case_library.json + failure_modes.md + similarity_weights.md
 *  - agent6: decision_aggregator.py + decision_rules.json
 */
interface Prewrite {
  src: string;  // project-relative source path
  dst: string;  // sandbox destination path
}

const SANDBOX_PREWRITES: Prewrite[] = [
  // ─── agent3-多元融资 ───────────────────────────────────────────────
  { src: '.claude/skills/agent3-多元融资/scripts/finance_tools.py',           dst: '/tmp/finance/finance_tools.py' },
  { src: '.claude/skills/agent3-多元融资/references/finance_products.json',   dst: '/tmp/finance/references/finance_products.json' },
  { src: '.claude/skills/agent3-多元融资/references/mortgage_thresholds.json', dst: '/tmp/finance/references/mortgage_thresholds.json' },
  { src: '.claude/skills/agent3-多元融资/references/negative_list.json',      dst: '/tmp/finance/references/negative_list.json' },
  { src: '.claude/skills/agent3-多元融资/references/pilot_cities.json',       dst: '/tmp/finance/references/pilot_cities.json' },
  { src: '.claude/skills/agent3-多元融资/references/industry_thresholds.json', dst: '/tmp/finance/references/industry_thresholds.json' },

  // ─── agent4-财务模型 ───────────────────────────────────────────────
  { src: '.claude/skills/agent4-财务模型/scripts/finance.py',                 dst: '/tmp/finance/finance.py' },
  { src: '.claude/skills/agent4-财务模型/scripts/cashflow.py',                dst: '/tmp/finance/cashflow.py' },
  { src: '.claude/skills/agent4-财务模型/scripts/industry_thresholds.py',     dst: '/tmp/finance/industry_thresholds.py' },
  { src: '.claude/skills/agent4-财务模型/references/thresholds.json',         dst: '/tmp/finance/references/thresholds.json' },

  // ─── agent5-失败案例 ───────────────────────────────────────────────
  { src: '.claude/skills/agent5-失败案例/scripts/case_matcher.py',            dst: '/tmp/finance/case_matcher.py' },
  { src: '.claude/skills/agent5-失败案例/references/case_library.json',       dst: '/tmp/finance/references/case_library.json' },
  { src: '.claude/skills/agent5-失败案例/references/failure_modes.md',        dst: '/tmp/finance/references/failure_modes.md' },
  { src: '.claude/skills/agent5-失败案例/references/similarity_weights.md',   dst: '/tmp/finance/references/similarity_weights.md' },

  // ─── agent6-双层决策 ───────────────────────────────────────────────
  { src: '.claude/skills/agent6-双层决策/scripts/decision_aggregator.py',     dst: '/tmp/finance/decision_aggregator.py' },
  { src: '.claude/skills/agent6-双层决策/references/decision_rules.json',     dst: '/tmp/finance/references/decision_rules.json' },
];

export interface SandboxPrepareResult {
  ready: boolean;
  libsqlClientReady: boolean;
  /** Number of agent asset files successfully pre-written to /tmp/finance/. */
  agentAssetsReady: number;
  /** Total number of agent asset files attempted (for diagnostics). */
  agentAssetsTotal: number;
}

export interface SandboxLike {
  commands: {
    run: (cmd: string, opts?: { timeout?: number }) => Promise<{
      stdout: string;
      stderr: string;
      exitCode: number;
    }>;
  };
  files: {
    write: (path: string, content: string) => Promise<void>;
  };
}

/**
 * Probe the sandbox to confirm it has finished booting.
 *
 * EdgeOne sandboxes sometimes need a few seconds after creation before they
 * will accept commands; the very first `commands.run` can throw even though
 * subsequent calls succeed. We retry `ls /tmp` up to PROBE_MAX_ATTEMPTS times.
 */
async function probeSandbox(sandbox: SandboxLike): Promise<boolean> {
  for (let attempt = 0; attempt < PROBE_MAX_ATTEMPTS; attempt++) {
    try {
      await sandbox.commands.run('ls /tmp', { timeout: PROBE_TIMEOUT_S });
      return true;
    } catch {
      // Cold-start transient: back off and retry.
      if (attempt < PROBE_MAX_ATTEMPTS - 1) {
        await new Promise((r) => setTimeout(r, PROBE_BACKOFF_MS));
      }
    }
  }
  return false;
}

/**
 * Prepare a fresh sandbox for the chat agent:
 *   - probe cold start
 *   - inject shared libsql_client.py
 *   - pre-write all agent asset files (so skills don't Read /Users/... paths)
 *   - inject LIBSQL env (dual channel: .env + export)
 *
 * Returns a structured result describing what succeeded. Never throws.
 */
export async function prepareSandbox(
  sandbox: SandboxLike,
  conversationId: string,
  ctxEnv: Record<string, unknown>,
): Promise<SandboxPrepareResult> {
  // 1. Probe sandbox cold start.
  const probeOk = await probeSandbox(sandbox);
  if (!probeOk) {
    return { ready: false, libsqlClientReady: false, agentAssetsReady: 0, agentAssetsTotal: SANDBOX_PREWRITES.length };
  }

  // 2. Write shared libsql_client.py into /tmp/finance/.
  let libsqlClientReady = false;
  try {
    await sandbox.commands.run(`mkdir -p ${SANDBOX_FINANCE_DIR} ${SANDBOX_FINANCE_DIR}/references`, {
      timeout: MKDIR_TIMEOUT_S,
    });
    const libsqlClientContent = readFileSync(
      join(SHARED_SCRIPTS_DIR, LIBSQL_CLIENT_FILENAME),
      'utf-8',
    );
    await sandbox.files.write(
      `${SANDBOX_FINANCE_DIR}/${LIBSQL_CLIENT_FILENAME}`,
      libsqlClientContent,
    );
    libsqlClientReady = true;
  } catch {
    // File write failed: sandbox itself is ready, but the Python helper is
    // unavailable. Downstream skills will surface a clear error if they
    // actually need it.
    return { ready: true, libsqlClientReady: false, agentAssetsReady: 0, agentAssetsTotal: SANDBOX_PREWRITES.length };
  }

  // 3. Pre-write all agent asset files (agent3/4/5/6 scripts + references).
  //    Best-effort: count successes but never abort the whole prepareSandbox
  //    on a single file failure — the LLM may still complete skills whose
  //    files did land.
  let agentAssetsReady = 0;
  for (const { src, dst } of SANDBOX_PREWRITES) {
    try {
      const content = readFileSync(join(PROJECT_ROOT, src), 'utf-8');
      await sandbox.files.write(dst, content);
      agentAssetsReady++;
    } catch {
      // Individual file failure is non-fatal. Sandbox assets that fail to
      // land will surface as ImportError / FileNotFoundError when the
      // downstream skill tries to use them, with clear remediation.
    }
  }

  // 4. Inject LIBSQL env via dual channel (.env file + export command).
  //    conversationId is currently unused for env scoping but is part of the
  //    signature so future per-conversation sandbox state can be wired in
  //    without a breaking change.
  void conversationId;

  const libsqlUrl = String(ctxEnv.LIBSQL_URL ?? '');
  const libsqlToken = String(ctxEnv.LIBSQL_RO_TOKEN ?? '');
  if (libsqlUrl && libsqlToken) {
    try {
      const envContent = `LIBSQL_URL=${libsqlUrl}\nLIBSQL_RO_TOKEN=${libsqlToken}\n`;
      await sandbox.files.write(`${SANDBOX_FINANCE_DIR}/.env`, envContent);
      // export makes the env available to subsequent commands.run calls in
      // the same shell session; .env covers Python `dotenv`-style loaders.
      await sandbox.commands.run(
        `export LIBSQL_URL="${libsqlUrl}" LIBSQL_RO_TOKEN="${libsqlToken}"`,
        { timeout: EXPORT_TIMEOUT_S },
      );
    } catch {
      // env injection failure does not downgrade libsqlClientReady: the
      // Python module is already in place, and skills can still load from
      // .env if the export path failed.
    }
  }

  return { ready: true, libsqlClientReady, agentAssetsReady, agentAssetsTotal: SANDBOX_PREWRITES.length };
}
