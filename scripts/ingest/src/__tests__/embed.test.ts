import { describe, it, expect } from 'vitest';
import { embedText, embedBatch } from '../embed.js';

describe('embed', () => {
  it('returns 1024-dim vector for valid input', async () => {
    const env = { ZHIPU_API_KEY: process.env.ZHIPU_API_KEY! };
    if (!env.ZHIPU_API_KEY) return; // skip if no key
    const vec = await embedText('测试', env);
    expect(vec).toHaveLength(1024);
    expect(vec.every(v => typeof v === 'number' && !Number.isNaN(v))).toBe(true);
  });

  it('embeds batch of 3', async () => {
    const env = { ZHIPU_API_KEY: process.env.ZHIPU_API_KEY! };
    if (!env.ZHIPU_API_KEY) return;
    const vecs = await embedBatch(['a', 'b', 'c'], env);
    expect(vecs).toHaveLength(3);
    expect(vecs[0]).toHaveLength(1024);
  });
});
