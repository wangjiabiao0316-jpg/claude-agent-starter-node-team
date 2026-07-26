import { extractText } from 'unpdf';
import { createHash } from 'crypto';

export interface PageText {
  page: number;
  text: string;
}

export interface Chunk {
  source: string;
  page: number;
  chunk_index: number;
  content: string;
  hash: string;
}

export interface ChunkOpts {
  size: number;      // 目标块大小（字符）
  overlap: number;   // 块间重叠
}

export async function extractPdfPages(filePath: string): Promise<PageText[]> {
  const buf = await readFile(filePath);
  const { totalPages, text } = await extractText(buf, { mergePages: false });
  // text is string[] (one per page); guard against unexpected shapes
  if (!Array.isArray(text)) {
    return [{ page: 1, text: String(text).trim() }];
  }
  return text.map((t, i) => ({
    page: i + 1,
    text: (t ?? '').trim(),
  }));
}

// fs/promises 在 Node ESM 中
import { readFile } from 'fs/promises';

const SENTENCE_END = /[。！？；\n]/;

/**
 * 切块策略（中文优化）：
 * 1. 按 \n\n 切段
 * 2. 段落 > size*1.6 → 按句号硬切
 * 3. 段落 < size*0.4 → 与下一段合并
 * 4. 块间加 overlap 字符重叠
 */
export function chunkPages(pages: PageText[], opts: ChunkOpts): Chunk[] {
  const { size, overlap } = opts;
  const minLen = size * 0.4;
  const maxLen = size * 1.6;
  const chunks: Chunk[] = [];

  for (const { page, text } of pages) {
    if (!text) continue;
    // Step 1: 按 \n\n 切段
    const paragraphs = text.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);

    // Step 2 + 3: 合并过短 / 拆分过长
    const normalized: string[] = [];
    let buf = '';
    for (const p of paragraphs) {
      if (p.length > maxLen) {
        if (buf) { normalized.push(buf); buf = ''; }
        // 按 SENTENCE_END 拆 p
        const sentences = p.split(/(?<=[。！？；\n])/);
        let cur = '';
        for (const s of sentences) {
          if ((cur + s).length > maxLen) {
            if (cur) normalized.push(cur);
            cur = s;
          } else {
            cur += s;
          }
        }
        if (cur) normalized.push(cur);
      } else if (p.length < minLen) {
        buf = buf ? `${buf}\n\n${p}` : p;
        if (buf.length >= minLen) {
          normalized.push(buf);
          buf = '';
        }
      } else {
        if (buf) { normalized.push(buf); buf = ''; }
        normalized.push(p);
      }
    }
    if (buf) normalized.push(buf);

    // Step 4: 加 overlap
    for (let i = 0; i < normalized.length; i++) {
      const content = i > 0 && overlap > 0
        ? normalized[i - 1].slice(-overlap) + normalized[i]
        : normalized[i];
      chunks.push({
        source: '', // 由调用方填
        page,
        chunk_index: chunks.filter(c => c.page === page).length,
        content,
        hash: createHash('sha256').update(content).digest('hex'),
      });
    }
  }
  return chunks;
}
