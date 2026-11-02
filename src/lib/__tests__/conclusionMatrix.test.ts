/**
 * conclusionMatrix 单元测试 —— 七 agent 核心结论矩阵的数据层。
 * 覆盖：JSON 提取、markdown 表格兜底、badge 词表映射、
 *       A1/A2/A5/A6 四类代表性组装路径与全 agent 容错（坏数据不抛错）。
 */
import { describe, it, expect } from 'vitest';
import {
  extractConclusionJson,
  parseMarkdownTables,
  classifyStatus,
  buildConclusionMatrix,
} from '../conclusionMatrix';

const A2_JSON_BLOCK = [
  '## 📑 Agent2 政策应答输出',
  '',
  '```json',
  JSON.stringify({
    agent: 'agent2-政策应答',
    业务问题: '存量建筑改长租公寓有哪些政策支持？',
    可适用政策清单: [
      {
        政策名称: '城市更新专项资金管理办法',
        支持力度: '85 - 专项债额度可达项目投资 30%',
        申请路径: '80 - 已有 3 例公开成功案例',
        限制条件: '仅限保障性租赁住房方向',
        依据条款: '《城市更新专项资金管理办法》第 12 条',
        综合分: 82.5,
      },
    ],
    未适用政策及原因: [
      { 政策名称: '工业遗存改造补贴', 不适用原因: '业态方向不符' },
    ],
    建议动作: '建议优先对接城市更新主管部门',
  }),
  '```',
].join('\n');

describe('extractConclusionJson', () => {
  it('从 markdown 围栏中提取结论层 JSON', () => {
    const json = extractConclusionJson(A2_JSON_BLOCK);
    expect(json).not.toBeNull();
    expect(json!['agent']).toBe('agent2-政策应答');
    expect(Array.isArray(json!['可适用政策清单'])).toBe(true);
  });

  it('特征键优先：多个合法 JSON 块时选结论层', () => {
    const text = [
      '```json',
      JSON.stringify({ foo: 1, bar: 2, baz: 3 }),
      '```',
      '```json',
      JSON.stringify({ agent: 'agent1-固有对象', 灯色: 'yellow', 命中判据: [] }),
      '```',
    ].join('\n');
    expect(extractConclusionJson(text)!['agent']).toBe('agent1-固有对象');
  });

  it('无围栏 / 非法 JSON / 非对象时返回 null', () => {
    expect(extractConclusionJson('纯文本没有代码块')).toBeNull();
    expect(extractConclusionJson('```json\n{broken\n```')).toBeNull();
    expect(extractConclusionJson('```json\n[1,2,3]\n```')).toBeNull();
    expect(extractConclusionJson(undefined)).toBeNull();
  });
});

describe('parseMarkdownTables', () => {
  it('解析表头与数据行，跳过分隔行', () => {
    const tables = parseMarkdownTables(
      '| 类型 | 灯色 | 核心结论 |\n|---|---|---|\n| agent1 固有对象 | 🟢 | 产权清晰 |\n| agent2 政策应答 | 🟡 | 有待核实条款 |',
    );
    // 单张表：返回「表的数组」，每张表为行数组
    expect(tables).toHaveLength(1);
    const rows = tables[0];
    expect(rows).toHaveLength(2);
    expect(rows[0]['类型']).toBe('agent1 固有对象');
    expect(rows[1]['灯色']).toBe('🟡');
  });

  it('空文本返回空数组', () => {
    expect(parseMarkdownTables('')).toEqual([]);
  });
});

describe('classifyStatus', () => {
  it('灯色英文枚举映射三色徽章', () => {
    expect(classifyStatus('red').tone).toBe('red');
    expect(classifyStatus('yellow').tone).toBe('yellow');
    expect(classifyStatus('green').tone).toBe('green');
  });

  it('中文词表映射', () => {
    expect(classifyStatus('达标').tone).toBe('green');
    expect(classifyStatus('待核实').tone).toBe('yellow');
    expect(classifyStatus('不适用').tone).toBe('red');
    expect(classifyStatus('').tone).toBe('neutral');
  });
});

describe('buildConclusionMatrix · A2 政策应答', () => {
  const model = buildConclusionMatrix('agent2-政策应答', undefined, A2_JSON_BLOCK);

  it('生成 Policy Evidence Matrix：适用 + 不适用共 2 行', () => {
    expect(model).not.toBeNull();
    expect(model!.tag).toBe('POLICY EVIDENCE MATRIX');
    expect(model!.rows).toHaveLength(2);
  });

  it('适用行徽章按综合分 82.5 → 初步适用（green），证据取依据条款', () => {
    const row = model!.rows[0];
    expect(row.badge).toEqual({ label: '初步适用', tone: 'green' });
    expect(row.evidence).toContain('第 12 条');
    expect(row.detail.map((d) => d.label)).toContain('依据条款');
  });

  it('不适用行标红并携带原因', () => {
    const row = model!.rows[1];
    expect(row.badge).toEqual({ label: '不适用', tone: 'red' });
    expect(row.detail[0].value).toBe('业态方向不符');
  });

  it('verdict 携带建议动作', () => {
    expect(model!.verdict?.lines.join('')).toContain('城市更新主管部门');
  });
});

describe('buildConclusionMatrix · A1 前置闸门', () => {
  const json = {
    agent: 'agent1-固有对象',
    灯色: 'yellow',
    命中判据: ['H1.yellow.B', 'H2.green', 'S总分.60-75'],
    风险点: ['文保等级待核实'],
    依据: { H1: '不动产证号 沪房地X(2024)第xx号', H2: '文保等级 三级', S_aggregate: 'S1=70, S2=65 → 67.5' },
    建议动作: '条件推进',
  };

  it('生成三条维度行，判定按判据码着色', () => {
    const model = buildConclusionMatrix('agent1-固有对象', json, undefined);
    expect(model!.rows).toHaveLength(3);
    expect(model!.rows[0].badge!.tone).toBe('yellow');
    expect(model!.rows[1].badge!.tone).toBe('green');
    expect(model!.verdict?.lamp).toBe('yellow');
    expect(model!.rows[0].detail.some((d) => d.value.includes('不动产证号'))).toBe(true);
  });

  it('风险点进入行详情', () => {
    const model = buildConclusionMatrix('agent1-固有对象', json, undefined);
    expect(model!.rows[0].detail.some((d) => d.value === '文保等级待核实')).toBe(true);
  });
});

describe('buildConclusionMatrix · A5 失败校验', () => {
  const json = {
    agent: 'agent5-失败案例',
    校验灯: 'red',
    Top3案例: [
      { case_id: 'case-2024-001', 相似度: 0.85, 失败模式: '招商失败', 根因: '可租赁面积低于商业最低门槛' },
    ],
    根因重现判断: true,
    命中判据: { H1_高危模式: '招商失败', S1_相似度分: 0.85, S2_归因分: 0.9 },
    规避建议: '调整业态方向或重新评估区位客流',
  };

  it('相似度 0.85 → 高危相似（red），百分比展示', () => {
    const model = buildConclusionMatrix('agent5-失败案例', json, undefined);
    expect(model!.rows[0].badge).toEqual({ label: '高危相似', tone: 'red' });
    expect(model!.rows[0].cells[0]).toBe('85%');
  });

  it('verdict 含根因重现与规避建议', () => {
    const model = buildConclusionMatrix('agent5-失败案例', json, undefined);
    const all = model!.verdict?.lines.join('') ?? '';
    expect(all).toContain('已重现');
    expect(all).toContain('调整业态方向');
  });
});

describe('buildConclusionMatrix · A6 双层决策', () => {
  it('四维子灯转矩阵行，灯色着色', () => {
    const json = {
      agent: 'agent6-双层决策',
      顶层灯: 'yellow',
      顶层判据: 'S.决策权重聚合（0.3/0.3/0.2/0.2）',
      四维子灯: {
        设计咨询: { 灯色: 'yellow', 依据: 'agent5 校验黄' },
        投资拓展: { 灯色: 'green', 依据: 'IRR 达标' },
      },
      条件推进事项: ['设计咨询 维度 yellow'],
      触发报告模板: '投资人版 + 政府版',
    };
    const model = buildConclusionMatrix('agent6-双层决策', json, undefined);
    expect(model!.rows).toHaveLength(2);
    expect(model!.rows[0].badge!.tone).toBe('yellow');
    expect(model!.rows[1].badge!.tone).toBe('green');
    expect(model!.verdict?.lines.join('')).toContain('条件推进');
  });

  it('无四维子灯时回退汇总表（灯色列）', () => {
    const summary = '| 类型 | 灯色 | 核心结论 |\n|---|---|---|\n| agent1 固有对象 | 🟢 | 产权清晰 |';
    const model = buildConclusionMatrix('agent6-双层决策', undefined, summary);
    expect(model).not.toBeNull();
    expect(model!.rows[0].title).toContain('agent1');
  });
});

describe('buildConclusionMatrix · 容错', () => {
  it('无任何数据返回 null（回退三段式）', () => {
    expect(buildConclusionMatrix('agent3-多元融资', undefined, undefined)).toBeNull();
    expect(buildConclusionMatrix('agent3-多元融资', {}, '')).toBeNull();
  });

  it('字段类型损坏不抛错：坏数组/坏嵌套一律跳过', () => {
    const broken = {
      可适用融资工具清单: ['字符串项', 42, null, { 工具名称: '专项债', 综合分: '88 - 额度充足' }],
      推荐资金组合: { nested: true },
      灯色: 'green',
    };
    const model = buildConclusionMatrix('agent3-多元融资', broken, undefined);
    expect(model).not.toBeNull();
    expect(model!.rows).toHaveLength(1);
    expect(model!.rows[0].badge!.tone).toBe('green');
  });

  it('A4 财务指标：IRR 行携带门槛对照与达标结论', () => {
    const json = {
      agent: 'agent4-财务模型',
      财务指标: { IRR: '10.20%', NPV: 1200000, 回收期: '8.5 年' },
      业态门槛对照: { 业态: '商业', 门槛区间: '8-12%', 达标结论: '达标' },
    };
    const model = buildConclusionMatrix('agent4-财务模型', json, undefined);
    expect(model!.rows.map((r) => r.title)).toEqual(['IRR', 'NPV', '回收期']);
    expect(model!.rows[0].badge!.tone).toBe('green');
  });

  it('output_json 有内容时优先于 summary', () => {
    const model = buildConclusionMatrix(
      'agent2-政策应答',
      { 可适用政策清单: [{ 政策名称: '来自 output_json 的政策', 综合分: 90 }], 建议动作: '推进' },
      A2_JSON_BLOCK,
    );
    expect(model!.rows).toHaveLength(1);
    expect(model!.rows[0].title).toBe('来自 output_json 的政策');
  });
});
