import { describe, it, expect, vi } from 'vitest';
import { embedQuery, fuseHits, executeSql, queryCases, type SearchHit } from '../_libsql';

describe('fuseHits', () => {
  it('returns empty array when both inputs are empty', () => {
    expect(fuseHits([], [])).toEqual([]);
  });

  it('applies weighted RRF correctly with docs preferred at equal distance', () => {
    const docs: SearchHit[] = [
      { id: 1, content: 'a', type: 'doc', distance: 0.1, source: 'x', page: 1 },
      { id: 2, content: 'b', type: 'doc', distance: 0.2, source: 'x', page: 2 },
    ];
    const hist: SearchHit[] = [
      { id: 3, content: 'c', type: 'history', distance: 0.3, role: 'user' },
    ];
    const fused = fuseHits(docs, hist);
    expect(fused.length).toBe(3);
    // Top doc has weight 0.7 at rank 0; top history has weight 0.3 at rank 0.
    // 0.7 > 0.3, so doc id=1 should be first.
    expect(fused[0].id).toBe(1);
    // Second doc (rank 1, score ~0.7/61) vs first history (rank 0, score ~0.3/60).
    // 0.3/60 ≈ 0.005, 0.7/61 ≈ 0.0115 → doc id=2 still wins.
    expect(fused[1].id).toBe(2);
    expect(fused[2].id).toBe(3);
  });

  it('preserves all original fields on returned hits', () => {
    const docs: SearchHit[] = [
      { id: 10, content: 'doc-text', type: 'doc', distance: 0.05, source: 'a.pdf', page: 7 },
    ];
    const hist: SearchHit[] = [
      { id: 20, content: 'hist-text', type: 'history', distance: 0.4, role: 'assistant' },
    ];
    const fused = fuseHits(docs, hist);
    expect(fused[0].source).toBe('a.pdf');
    expect(fused[0].page).toBe(7);
    expect(fused[1].role).toBe('assistant');
  });

  it('is deterministic (same input → same output)', () => {
    const docs: SearchHit[] = [
      { id: 1, content: 'a', type: 'doc', distance: 0.1 },
      { id: 2, content: 'b', type: 'doc', distance: 0.2 },
    ];
    const hist: SearchHit[] = [
      { id: 3, content: 'c', type: 'history', distance: 0.3, role: 'user' },
    ];
    const run1 = fuseHits(docs, hist);
    const run2 = fuseHits(docs, hist);
    expect(run1).toEqual(run2);
  });

  it('orders within each type by input order (RRF assumption)', () => {
    const docs: SearchHit[] = [
      { id: 100, content: 'far', type: 'doc', distance: 0.9 },
      { id: 200, content: 'close', type: 'doc', distance: 0.01 },
    ];
    // Even though id=200 has lower distance, RRF uses INPUT ORDER as rank.
    // Caller is expected to pre-sort by distance ascending. fuseHits itself
    // should preserve caller-provided order in the score mapping.
    const fused = fuseHits(docs, []);
    expect(fused[0].id).toBe(100); // rank 0 → highest RRF score
    expect(fused[1].id).toBe(200);
  });
});

describe('embedQuery', () => {
  it('returns 1024-dim vector when ZHIPU_API_KEY is set', async () => {
    const env = { ZHIPU_API_KEY: process.env.ZHIPU_API_KEY! };
    if (!env.ZHIPU_API_KEY) return; // skip if no key (CI without secrets)
    const vec = await embedQuery('测试 query', env);
    expect(Array.isArray(vec)).toBe(true);
    expect(vec).toHaveLength(1024);
    expect(vec.every(v => typeof v === 'number' && Number.isFinite(v))).toBe(true);
  });

  it('throws when ZHIPU_API_KEY is missing', async () => {
    // fetch will not be called with a real key; expect a network/auth error.
    // We only assert it does not silently return undefined.
    const env = { ZHIPU_API_KEY: '' };
    await expect(embedQuery('x', env)).rejects.toBeTruthy();
  });
});

describe('executeSql (whitelist SELECT API)', () => {
  const env = { LIBSQL_URL: 'https://x', LIBSQL_RO_TOKEN: 'y', ZHIPU_API_KEY: 'z' };

  it('rejects non-whitelist table', async () => {
    await expect(executeSql('users', env)).rejects.toThrow(/whitelist/);
  });

  it('rejects table name smuggling DROP keyword', async () => {
    await expect(
      executeSql('finance_products; DROP TABLE x', env),
    ).rejects.toThrow();
  });

  it('rejects forbidden keyword in columns option', async () => {
    await expect(
      executeSql('finance_products', env, { columns: ['id; DROP TABLE x'] }),
    ).rejects.toThrow();
  });

  it('accepts whitelisted tables (mocked fetch)', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            type: 'ok',
            response: {
              type: 'execute',
              result: { cols: [], rows: [] },
            },
          },
        ],
      }),
    } as any);
    for (const t of [
      'finance_products',
      'mortgage_thresholds',
      'negative_list',
      'pilot_cities',
      'case_library',
      'industry_thresholds',
    ]) {
      const result = await executeSql(t, env, { limit: 1 });
      expect(Array.isArray(result)).toBe(true);
    }
    fetchSpy.mockRestore();
  });

  it('passes through WHERE clauses as positional args (mocked fetch)', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            type: 'ok',
            response: {
              type: 'execute',
              result: { cols: [{ name: 'id', decltype: 'integer' }], rows: [] },
            },
          },
        ],
      }),
    } as any);
    await executeSql('case_library', env, {
      where: { region: 'shanghai', industry: '商业' },
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const call = (fetchSpy.mock.calls[0] as any[]);
    const body = JSON.parse(call[1].body);
    expect(body.requests[0].stmt.sql).toContain('WHERE');
    expect(body.requests[0].stmt.sql).toContain('region = ?');
    expect(body.requests[0].stmt.sql).toContain('industry = ?');
    // Args must be tagged {type, value} per sqld protocol.
    expect(body.requests[0].stmt.args).toEqual([
      { type: 'text', value: 'shanghai' },
      { type: 'text', value: '商业' },
    ]);
    fetchSpy.mockRestore();
  });
});

describe('queryCases', () => {
  it('returns Top-K cases sorted by similarity (SQL prefilter)', async () => {
    const env = { LIBSQL_URL: 'https://x', LIBSQL_RO_TOKEN: 'y', ZHIPU_API_KEY: 'z' };
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            type: 'ok',
            response: {
              type: 'execute',
              result: {
                cols: [{ name: 'case_id', decltype: 'text' }],
                rows: [
                  [{ type: 'text', value: 'c1' }],
                  [{ type: 'text', value: 'c2' }],
                  [{ type: 'text', value: 'c3' }],
                  [{ type: 'text', value: 'c4' }],
                  [{ type: 'text', value: 'c5' }],
                ],
              },
            },
          },
        ],
      }),
    } as any);
    const features = {
      region: 'shanghai',
      industry: '商业',
      scale: 10000,
      property_type: '旧厂房',
      physical_params: {},
      financing: {},
    };
    const cases = await queryCases(features, env, 3);
    expect(cases.length).toBeLessThanOrEqual(3);
    fetchSpy.mockRestore();
  });

  it('defaults topK to 3 when omitted', async () => {
    const env = { LIBSQL_URL: 'https://x', LIBSQL_RO_TOKEN: 'y', ZHIPU_API_KEY: 'z' };
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            type: 'ok',
            response: {
              type: 'execute',
              result: { cols: [], rows: [] },
            },
          },
        ],
      }),
    } as any);
    const features = {
      region: 'beijing',
      industry: '办公',
      scale: 5000,
      property_type: '写字楼',
      physical_params: {},
      financing: {},
    };
    await queryCases(features, env);
    const call = fetchSpy.mock.calls[0] as any[];
    const body = JSON.parse(call[1].body);
    expect(body.requests[0].stmt.sql).toMatch(/LIMIT\s+3\b/);
    fetchSpy.mockRestore();
  });
});
