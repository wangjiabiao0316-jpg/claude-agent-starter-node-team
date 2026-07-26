# Ingestion CLI

PDF → 切块 → embedding → libSQL 入库。

## Usage

```bash
cp .env.example .env  # 填实际值
npm install
npm run build

# 全量解析 /data/pdfs
npm run ingest -- --dir /data/pdfs

# 单文件
npm run ingest -- --file /data/pdfs/spec.pdf

# 重试失败
npm run ingest -- --retry-failed

# 查看进度
npm run ingest -- --status
```
