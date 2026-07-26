import { createHash } from 'crypto';

const EMBED_URL = 'https://open.bigmodel.cn/api/paas/v4/embeddings';
const MODEL = 'embedding-3';
const DIMENSIONS = 1024;

export interface EmbedEnv {
  ZHIPU_API_KEY: string;
}

interface ZhipuEmbeddingResponse {
  data: Array<{ embedding: number[] }>;
  usage: { prompt_tokens: number; total_tokens: number };
}

async function callZhipu(input: string | string[], env: EmbedEnv): Promise<ZhipuEmbeddingResponse> {
  const res = await fetch(EMBED_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.ZHIPU_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: MODEL, input, dimensions: DIMENSIONS }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Embedding API ${res.status}: ${text}`);
  }
  return res.json();
}

export async function embedText(text: string, env: EmbedEnv): Promise<number[]> {
  const data = await callZhipu(text, env);
  return data.data[0].embedding;
}

export async function embedBatch(texts: string[], env: EmbedEnv): Promise<number[][]> {
  if (texts.length === 0) return [];
  if (texts.length > 64) throw new Error('Batch size must be <= 64');
  const data = await callZhipu(texts, env);
  // Zhipu 返回顺序与输入顺序一致
  return data.data.map(d => d.embedding);
}

export function hashText(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}
