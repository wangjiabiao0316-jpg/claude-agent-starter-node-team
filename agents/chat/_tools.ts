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
 *  3. Inject LIBSQL_URL + LIBSQL_RO_TOKEN into the sandbox via .env file
 *     AND `export` command (dual-channel to survive shell-session resets).
 *
 * Failures are reported but never thrown — the chat path must not break
 * just because sandbox preparation partially failed.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const SHARED_SCRIPTS_DIR = join(process.cwd(), '.claude/skills/_shared/scripts');
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

export interface SandboxPrepareResult {
  ready: boolean;
  libsqlClientReady: boolean;
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
    return { ready: false, libsqlClientReady: false };
  }

  // 2. Write shared libsql_client.py into /tmp/finance/.
  let libsqlClientReady = false;
  try {
    await sandbox.commands.run(`mkdir -p ${SANDBOX_FINANCE_DIR}`, {
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
    return { ready: true, libsqlClientReady: false };
  }

  // 3. Inject LIBSQL env via dual channel (.env file + export command).
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

  return { ready: true, libsqlClientReady };
}
