import { describe, it, expect, vi } from 'vitest';
import { embedQuery, fuseHits, executeSql, queryCases, type SearchHit } from '../_libsql';

describe('fuseHits', () => {
  it('returns empty array when all three inputs are empty', () => {
    expect(fuseHits([], [], [])).toEqual([]);
  });

  it('applies weighted RRF correctly with docs preferred over history at equal distance', () => {
    const docs: SearchHit[] = [
      { id: 1, content: 'a', type: 'doc', distance: 0.1, source: 'x', page: 1 },
      { id: 2, content: 'b', type: 'doc', distance: 0.2, source: 'x', page: 2 },
    ];
    const kb: SearchHit[] = [];
    const hist: SearchHit[] = [
      { id: 3, content: 'c', type: 'history', distance: 0.3, role: 'user' },
    ];
    const fused = fuseHits(docs, kb, hist);
    expect(fused.length).toBe(3);
    // Top doc has weight 0.40 at rank 0; top history has weight 0.20 at rank 0.
    // 0.40 > 0.20, so doc id=1 should be first.
    expect(fused[0].id).toBe(1);
    // Second doc (rank 1, score ~0.40/61) vs first history (rank 0, score ~0.20/60).
    // 0.40/61 ≈ 0.00656, 0.20/60 ≈ 0.00333 → doc id=2 still wins.
    expect(fused[1].id).toBe(2);
    expect(fused[2].id).toBe(3);
  });

  it('preserves all original fields on returned hits (doc / kb / history)', () => {
    const docs: SearchHit[] = [
      { id: 10, content: 'doc-text', type: 'doc', distance: 0.05, source: 'a.pdf', page: 7 },
    ];
    const kb: SearchHit[] = [
      {
        id: 20,
        content: 'kb-text',
        type: 'kb',
        distance: 0.06,
        chunk_id: 'KB01-001#c0',
        kb_source: 'KB01',
        category: '政策法规库 / REITs 政策',
        title: '国家发改委 958 号文',
      },
    ];
    const hist: SearchHit[] = [
      { id: 30, content: 'hist-text', type: 'history', distance: 0.4, role: 'assistant' },
    ];
    const fused = fuseHits(docs, kb, hist);
    // Doc fields preserved
    const docHit = fused.find(h => h.id === 10)!;
    expect(docHit.source).toBe('a.pdf');
    expect(docHit.page).toBe(7);
    // KB fields preserved
    const kbHit = fused.find(h => h.id === 20)!;
    expect(kbHit.type).toBe('kb');
    expect(kbHit.chunk_id).toBe('KB01-001#c0');
    expect(kbHit.kb_source).toBe('KB01');
    expect(kbHit.title).toBe('国家发改委 958 号文');
    // History fields preserved
    const histHit = fused.find(h => h.id === 30)!;
    expect(histHit.role).toBe('assistant');
  });

  it('is deterministic (same input → same output)', () => {
    const docs: SearchHit[] = [
      { id: 1, content: 'a', type: 'doc', distance: 0.1 },
      { id: 2, content: 'b', type: 'doc', distance: 0.2 },
    ];
    const kb: SearchHit[] = [
      { id: 100, content: 'kb-a', type: 'kb', distance: 0.15, chunk_id: 'x', kb_source: 'KB01' },
    ];
    const hist: SearchHit[] = [
      { id: 3, content: 'c', type: 'history', distance: 0.3, role: 'user' },
    ];
    const run1 = fuseHits(docs, kb, hist);
    const run2 = fuseHits(docs, kb, hist);
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
    const fused = fuseHits(docs, [], []);
    expect(fused[0].id).toBe(100); // rank 0 → highest RRF score
    expect(fused[1].id).toBe(200);
  });

  it('kb-only channel produces fused output (kb rank 0 wins over empty docs/hist)', () => {
    const kb: SearchHit[] = [
      { id: 1, content: 'policy-a', type: 'kb', distance: 0.1, chunk_id: 'KB01-001#c0', kb_source: 'KB01' },
      { id: 2, content: 'policy-b', type: 'kb', distance: 0.2, chunk_id: 'KB01-001#c1', kb_source: 'KB01' },
    ];
    const fused = fuseHits([], kb, []);
    expect(fused.length).toBe(2);
    expect(fused[0].id).toBe(1); // rank 0
    expect(fused[1].id).toBe(2); // rank 1
    expect(fused[0].type).toBe('kb');
  });

  it('three-way mix: kb and docs at equal rank compete by weight, history ranks lower', () => {
    // At equal distance (rank 0 for each channel):
    //   kb score   = 0.40 / 60 ≈ 0.00667
    //   doc score  = 0.40 / 60 ≈ 0.00667  (tie with kb)
    //   hist score = 0.20 / 60 ≈ 0.00333
    // Expectation: kb and doc tie at the top (input order breaks ties via stable sort),
    // history always ranks last.
    const docs: SearchHit[] = [
      { id: 1, content: 'd', type: 'doc', distance: 0.1 },
    ];
    const kb: SearchHit[] = [
      { id: 2, content: 'k', type: 'kb', distance: 0.1, chunk_id: 'x', kb_source: 'KB01' },
    ];
    const hist: SearchHit[] = [
      { id: 3, content: 'h', type: 'history', distance: 0.1, role: 'user' },
    ];
    const fused = fuseHits(docs, kb, hist);
    expect(fused.length).toBe(3);
    // History must be last (lowest weight)
    expect(fused[2].id).toBe(3);
    // Doc and kb take the first two positions (order between them is a tie
    // and depends on stable-sort input order; both are at the top).
    expect(new Set([fused[0].id, fused[1].id])).toEqual(new Set([1, 2]));
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
