import { Command } from 'commander';
import { config } from 'dotenv';
import { createHash } from 'crypto';
import { readdir, stat } from 'fs/promises';
import { join, basename } from 'path';
import cliProgress from 'cli-progress';
import pLimit from 'p-limit';

import { embedBatch, type EmbedEnv } from './embed.js';
import { extractPdfPages, chunkPages, type Chunk } from './pdf.js';
import {
  insertDocuments, upsertIngestState, getIngestState, recordFailedChunk,
  getDbClient,
  type DbEnv, type DocumentRow,
} from './db.js';

config();

interface Env extends EmbedEnv, DbEnv {
  CHUNK_SIZE: string;
  CHUNK_OVERLAP: string;
  BATCH_SIZE: string;
  CONCURRENCY: string;
}

const env = process.env as unknown as Env;

const program = new Command();
program
  .name('ingest')
  .description('PDF → chunk → embedding → libSQL')
  .option('--dir <path>', 'ingest all PDFs in dir')
  .option('--file <path>', 'ingest single PDF')
  .option('--retry-failed', 'retry failed_chunks')
  .option('--status', 'show ingest_state summary')
  .action(async (opts) => {
    if (opts.status) return showStatus();
    if (opts.retryFailed) return retryFailed();
    if (opts.dir) return ingestDir(opts.dir);
    if (opts.file) return ingestFile(opts.file);
    program.help();
  });

async function ingestDir(dirPath: string): Promise<void> {
  const files = (await readdir(dirPath))
    .filter(f => f.toLowerCase().endsWith('.pdf'))
    .map(f => join(dirPath, f));
  console.log(`Found ${files.length} PDFs`);
  for (const f of files) await ingestFile(f);
}

async function ingestFile(filePath: string): Promise<void> {
  const stats = await stat(filePath);
  const hash = await sha256File(filePath);

  const existing = await getIngestState(filePath, env);
  if (existing && existing.file_hash === hash && existing.status === 'done') {
    console.log(`[skip] ${filePath} already ingested`);
    return;
  }

  console.log(`[ingest] ${filePath}`);
  await upsertIngestState({
    file_path: filePath, file_hash: hash,
    total_chunks: 0, done_chunks: 0,
    status: 'running', started_at: Math.floor(Date.now() / 1000),
  }, env);

  // 1. 解析 PDF
  const pages = await extractPdfPages(filePath);
  console.log(`  pages: ${pages.length}`);

  // 2. 切块
  const chunks = chunkPages(pages, {
    size: parseInt(env.CHUNK_SIZE ?? '500'),
    overlap: parseInt(env.CHUNK_OVERLAP ?? '100'),
  }).map(c => ({ ...c, source: basename(filePath) }));
  console.log(`  chunks: ${chunks.length}`);

  // 3. 批量 embedding + 写库
  const batchSize = parseInt(env.BATCH_SIZE ?? '64');
  const concurrency = parseInt(env.CONCURRENCY ?? '4');
  const limit = pLimit(concurrency);

  const bar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
  bar.start(chunks.length, 0);

  let done = 0;
  const batches: Chunk[][] = [];
  for (let i = 0; i < chunks.length; i += batchSize) {
    batches.push(chunks.slice(i, i + batchSize));
  }

  await Promise.all(batches.map(batch => limit(async () => {
    try {
      const vectors = await embedBatch(batch.map(c => c.content), env);
      const rows: DocumentRow[] = batch.map((c, i) => ({
        source: c.source, page: c.page, chunk_index: c.chunk_index,
        content: c.content, embedding: vectors[i],
      }));
      await insertDocuments(rows, env);
      done += batch.length;
      bar.update(done);
    } catch (e: any) {
      for (const c of batch) {
        await recordFailedChunk({
          file_path: filePath, page: c.page, chunk_index: c.chunk_index,
          content: c.content, error: e.message ?? String(e),
        }, env);
      }
    }
  })));

  bar.stop();

  await upsertIngestState({
    file_path: filePath, file_hash: hash,
    total_chunks: chunks.length, done_chunks: done,
    status: 'done', finished_at: Math.floor(Date.now() / 1000),
  }, env);
  console.log(`  done: ${done}/${chunks.length}`);
  void stats;
}

async function retryFailed(): Promise<void> {
  // 简化版：留作扩展
  console.log('TODO: retry failed_chunks (implement when needed)');
}

async function showStatus(): Promise<void> {
  const c = getDbClient(env);
  const r1 = await c.execute('SELECT COUNT(*) AS n FROM documents');
  const r2 = await c.execute('SELECT status, COUNT(*) AS n FROM ingest_state GROUP BY status');
  const r3 = await c.execute('SELECT COUNT(*) AS n FROM failed_chunks');
  console.log('documents:', r1.rows[0]);
  console.log('ingest_state:', r2.rows);
  console.log('failed_chunks:', r3.rows[0]);
}

async function sha256File(path: string): Promise<string> {
  const { createReadStream } = await import('fs');
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(path);
    stream.on('data', d => hash.update(d));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

program.parseAsync(process.argv).catch(e => {
  console.error(e);
  process.exit(1);
});
