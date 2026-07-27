import { describe, it, expect } from 'vitest';
import { embedQuery, fuseHits, type SearchHit } from '../_libsql';

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
