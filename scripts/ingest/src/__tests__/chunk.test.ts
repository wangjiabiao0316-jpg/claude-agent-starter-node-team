import { describe, it, expect } from 'vitest';
import { chunkPages } from '../pdf.js';

describe('chunkPages', () => {
  it('splits long paragraph by Chinese punctuation', () => {
    const longText = '这是一段很长的中文文本。'.repeat(100); // 1000 字符
    const pages = [{ page: 1, text: longText }];
    const chunks = chunkPages(pages, { size: 500, overlap: 100 });
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].content.length).toBeLessThanOrEqual(800);
    expect(chunks[0].page).toBe(1);
  });

  it('merges short paragraphs', () => {
    const pages = [{ page: 1, text: '短句一。\n\n短句二。\n\n短句三。' }];
    const chunks = chunkPages(pages, { size: 500, overlap: 100 });
    // 三个短段落应该合并成一块（< 200 字符触发合并）
    expect(chunks.length).toBe(1);
  });

  it('preserves page number', () => {
    const pages = [
      { page: 1, text: '第一页内容。' },
      { page: 2, text: '第二页内容。' },
    ];
    const chunks = chunkPages(pages, { size: 500, overlap: 100 });
    expect(chunks.find(c => c.page === 1)).toBeTruthy();
    expect(chunks.find(c => c.page === 2)).toBeTruthy();
  });
});
