### Task B1：在仓库中创建 scripts/ingest 工作区

**Files:**
- Create: `claude-agent-starter-node-team/scripts/ingest/package.json`
- Create: `claude-agent-starter-node-team/scripts/ingest/tsconfig.json`
- Create: `claude-agent-starter-node-team/scripts/ingest/.env.example`
- Create: `claude-agent-starter-node-team/scripts/ingest/.gitignore`
- Create: `claude-agent-starter-node-team/scripts/ingest/README.md`

- [ ] **Step 1: 创建分支**

```bash
cd /Users/huangzetao/Documents/GitHub/claude-agent-starter-node-team
git checkout -b feature/libsql-integration
mkdir -p scripts/ingest/src/__tests__ scripts/ingest/sql
```

- [ ] **Step 2: 写 scripts/ingest/package.json**

```json
{
  "name": "ingest",
  "private": true,
  "type": "module",
  "version": "0.1.0",
  "description": "PDF → chunk → embedding → libSQL ingestion pipeline",
  "scripts": {
    "build": "tsc",
    "ingest": "node --experimental-vm-modules dist/index.js",
    "test": "vitest run"
  },
  "dependencies": {
    "@libsql/client": "^0.17.4",
    "unpdf": "^1.8.0",
    "p-limit": "^7.3.1",
    "commander": "^15.0.0",
    "cli-progress": "^3.12.0",
    "dotenv": "^16.4.5"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/cli-progress": "^3.11.5",
    "typescript": "^5.5.3",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 3: 写 tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "esModuleInterop": true,
    "strict": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["src/__tests__"]
}
```

- [ ] **Step 4: 写 .env.example**

```bash
# libSQL connection
LIBSQL_URL=http://127.0.0.1:8080
LIBSQL_TOKEN=<your ingest JWT, signed from /etc/sqld/keys/jwt.pem>

# Zhipu embedding API
ZHIPU_API_KEY=<your zhipu key>

# Chunking
CHUNK_SIZE=500
CHUNK_OVERLAP=100
BATCH_SIZE=64
CONCURRENCY=4
```

- [ ] **Step 5: 写 .gitignore**

```
.env
node_modules/
dist/
```

- [ ] **Step 6: 写 README.md（简短说明）**

```markdown
# Ingestion CLI

PDF → 切块 → embedding → libSQL 入库。

## Usage

\`\`\`bash
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
\`\`\`
```

- [ ] **Step 7: 安装依赖 + commit**

```bash
cd scripts/ingest
npm install
cd ../..
git add scripts/ingest/
git commit -m "chore: scaffold ingest CLI workspace"
```

- [ ] **Step 8: Verification**

```bash
cd scripts/ingest && npm run build && cd ../..
# 期望：编译无错（虽然 src 还是空的）
ls scripts/ingest/dist/
```

---

