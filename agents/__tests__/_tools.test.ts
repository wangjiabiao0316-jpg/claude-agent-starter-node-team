import { describe, it, expect, vi } from 'vitest';
import { prepareSandbox } from '../chat/_tools';

describe('prepareSandbox', () => {
  it('writes libsql_client.py + sets LIBSQL env', async () => {
    const writes: Array<{ path: string; content: string }> = [];
    const commands: string[] = [];
    const mockSandbox = {
      commands: {
        run: vi.fn(async (cmd: string) => {
          commands.push(cmd);
          return { stdout: '', stderr: '', exitCode: 0 };
        }),
      },
      files: {
        write: vi.fn(async (path: string, content: string) => {
          writes.push({ path, content });
        }),
      },
    };
    const ctxEnv = {
      LIBSQL_URL: 'https://fake.libsql.example.com',
      LIBSQL_RO_TOKEN: 'fake-token',
    };

    const result = await prepareSandbox(mockSandbox as any, 'conv-123', ctxEnv);
    expect(result.ready).toBe(true);
    expect(result.libsqlClientReady).toBe(true);
    expect(writes.some(w => w.path.includes('libsql_client.py'))).toBe(true);
    expect(commands.some(c => c.includes('LIBSQL_URL'))).toBe(true);
    expect(commands.some(c => c.includes('LIBSQL_RO_TOKEN'))).toBe(true);
  });

  it('returns ready=false when sandbox probe fails', async () => {
    const mockSandbox = {
      commands: { run: vi.fn().mockRejectedValue(new Error('cold start')) },
      files: { write: vi.fn() },
    };
    const result = await prepareSandbox(mockSandbox as any, 'conv-123', {
      LIBSQL_URL: '',
      LIBSQL_RO_TOKEN: '',
    });
    expect(result.ready).toBe(false);
    expect(result.libsqlClientReady).toBe(false);
  });

  it('returns ready=true, libsqlClientReady=false when file write fails', async () => {
    const mockSandbox = {
      commands: { run: vi.fn().mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 }) },
      files: { write: vi.fn().mockRejectedValue(new Error('disk full')) },
    };
    const result = await prepareSandbox(mockSandbox as any, 'conv-123', {
      LIBSQL_URL: 'https://x',
      LIBSQL_RO_TOKEN: 'y',
    });
    expect(result.ready).toBe(true);
    expect(result.libsqlClientReady).toBe(false);
  });

  it('skips env injection when LIBSQL_URL is missing', async () => {
    const commands: string[] = [];
    const mockSandbox = {
      commands: {
        run: vi.fn(async (cmd: string) => {
          commands.push(cmd);
          return { stdout: '', stderr: '', exitCode: 0 };
        }),
      },
      files: { write: vi.fn() },
    };
    await prepareSandbox(mockSandbox as any, 'conv-123', {});
    // env should NOT be injected
    expect(commands.filter(c => c.includes('LIBSQL_URL'))).toHaveLength(0);
  });
});
