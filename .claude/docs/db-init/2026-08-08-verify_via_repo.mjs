// 2026-08-08-verify_via_repo.mjs
// 端到端验证：通过仓库 agents/_libsql.ts 暴露的 executeSql 路径访问 6 张表
// 运行方式：
//   cd /Users/huangzetao/Documents/GitHub/claude-agent-starter-node-team
//   npx tsx .claude/docs/db-init/2026-08-08-verify_via_repo.mjs

import { executeSql, queryCases } from '../../../agents/_libsql.ts';
import dotenv from 'dotenv';
dotenv.config();

const env = {
  LIBSQL_URL: process.env.LIBSQL_URL,
  LIBSQL_RO_TOKEN: process.env.LIBSQL_RO_TOKEN,
  ZHIPU_API_KEY: process.env.ZHIPU_API_KEY,
};

const tables = [
  'finance_products',
  'mortgage_thresholds',
  'negative_list',
  'pilot_cities',
  'case_library',
  'industry_thresholds',
];

console.log('[verify_via_executeSql] starting...');
let allOk = true;

for (const t of tables) {
  try {
    const rows = await executeSql(t, env, { limit: 3 });
    console.log(`  ${t.padEnd(22)} → ${rows.length} row(s) returned`);
    if (rows.length > 0) {
      const sample = rows[0];
      // 截断超长字段
      const preview = {};
      for (const [k, v] of Object.entries(sample)) {
        preview[k] = typeof v === 'string' && v.length > 60 ? v.slice(0, 60) + '...' : v;
      }
      console.log('    sample:', JSON.stringify(preview, null, 2));
    }
    if (rows.length === 0) {
      allOk = false;
      console.error(`    ERROR: 表 ${t} 没有数据`);
    }
  } catch (e) {
    allOk = false;
    console.error(`    ERROR on ${t}: ${e.message}`);
  }
}

// 额外：模拟 agent5 真实查询路径（queryCases）
console.log('\n[verify_via_queryCases] 模拟 agent5 查询：region=上海 industry=商业 ...');
try {
  const cases = await queryCases(
    {
      region: '上海',
      industry: '商业',
      scale: 10000,
      property_type: '独立产权商业空间',
      physical_params: {},
      financing: {},
    },
    env,
    3,
  );
  console.log(`  queryCases 上海/商业 → ${cases.length} case(s)`);
  if (cases.length > 0) {
    console.log('  样本 case_id:', cases[0]?.case_id, '/ failure_mode:', cases[0]?.failure_mode);
  }
  if (cases.length === 0) {
    allOk = false;
    console.error('  ERROR: 上海/商业 应至少返回 1 条 case');
  }
} catch (e) {
  allOk = false;
  console.error(`  queryCases ERROR: ${e.message}`);
}

console.log('\n[result]', allOk ? '✓ 全部验证通过' : '✗ 存在失败项');
process.exit(allOk ? 0 : 1);
