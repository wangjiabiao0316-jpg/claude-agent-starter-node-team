/**
 * conclusionMatrix — 七 agent 核心结论模块的数据层（纯函数，无 React 依赖）。
 *
 * 对齐设计稿（万象更芯 demo）红框呈现形式：每个 agent 一块
 * 「清单主表 + 选中条目详情」的证据矩阵。本文件负责：
 *
 *   1. extractConclusionJson —— 从 agent summary 的 markdown 里提取结论层 JSON
 *      （编排器要求 LLM 在 section 内以 ```json 围栏输出完整结论层对象）
 *   2. parseMarkdownTables  —— 兜底：解析 summary 里的 markdown 表格
 *   3. buildConclusionMatrix —— 按 agent 结论层 schema 组装 MatrixModel
 *      （output_json 缺字段时逐项容错，凑不出矩阵返回 null → 上层回退三段式看板）
 *
 * 所有取数都是展示层容错：字段缺失/类型不对直接跳过，绝不抛错。
 */

export type Tone = 'green' | 'yellow' | 'red' | 'neutral';

export interface MatrixDetailItem {
  label: string;
  value: string;
  /** 有值时渲染为状态徽章而非纯文本 */
  tone?: Tone;
}

export interface MatrixRow {
  id: string;
  /** 主列文案（如政策名称 / 工具名称 / case_id） */
  title: string;
  /** 与 MatrixModel.columns 一一对齐的数据列 */
  cells: string[];
  /** 判定列徽章（匹配判断 / 灯色 / 达标结论） */
  badge?: { label: string; tone: Tone } | null;
  /** 证据列文案（依据条款 / 有来源 / 待补证 …） */
  evidence?: string;
  /** 详情面板条目（选中该行时展示） */
  detail: MatrixDetailItem[];
}

export interface MatrixModel {
  /** 英文 eyebrow，如 POLICY EVIDENCE MATRIX */
  tag: string;
  /** 中文标题，如 政策条款匹配与适用性研判 */
  title: string;
  /** 中间数据列的表头（首列固定为条目名，尾两列固定为「判定」「证据」） */
  columns: string[];
  /** 判定列表头文案（默认「判定」） */
  badgeColumn?: string;
  rows: MatrixRow[];
  /** 模块级判定：灯色徽章 + 结论行（建议动作 / 交付摘要等） */
  verdict?: { lamp?: Tone; lines: string[] } | null;
}

/* ────────────────────────── 提取层 ────────────────────────── */

/**
 * 从 markdown 文本中提取结论层 JSON 对象。
 * 扫描所有 ``` 围栏代码块，parse 成 object 的候选里按
 * 结论层特征键（agent/灯色/校验灯/顶层灯）优先，其次取键数最多的。
 */
export function extractConclusionJson(sectionText: string | undefined | null): Record<string, unknown> | null {
  if (!sectionText) return null;
  const fence = /```(?:json)?\s*\n([\s\S]*?)```/g;
  let best: Record<string, unknown> | null = null;
  let bestScore = -1;
  let m: RegExpExecArray | null;
  while ((m = fence.exec(sectionText)) !== null) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(m[1].trim());
    } catch {
      continue; // 非法 JSON 的围栏块（普通示例代码）直接跳过
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue;
    const obj = parsed as Record<string, unknown>;
    // 结论层特征键加权：特征命中数优先，同分取字段更多的（信息更全）
    let score = 0;
    for (const key of ['agent', '灯色', '校验灯', '顶层灯', '四维子灯']) {
      if (key in obj) score += 2;
    }
    score += Math.min(Object.keys(obj).length, 8) * 0.1;
    if (score > bestScore) {
      bestScore = score;
      best = obj;
    }
  }
  return best;
}

/**
 * 解析文本中所有 markdown 表格，返回「表的数组」——每张表是
 * `{ 表头键 → 单元格 }` 行数组。表格被普通文本打断或出现新表头即分表。
 * 兜底数据源：LLM 只流式输出 markdown 表格而没给 json 围栏时用。
 */
export function parseMarkdownTables(text: string): Array<Array<Record<string, string>>> {
  if (!text) return [];
  const tables: Array<Array<Record<string, string>>> = [];
  let header: string[] | null = null;
  let rows: Array<Record<string, string>> = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) {
      // 表格被普通文本打断即闭合当前表
      if (header !== null && rows.length > 0) tables.push(rows);
      header = null;
      rows = [];
      continue;
    }
    // 分隔行 |---|:---:| 重置判断、跳过
    if (/^\|[\s:|-]+\|?$/.test(trimmed)) continue;
    const cells = trimmed.replace(/^\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim());
    if (header === null) {
      // 新表开始：闭合紧邻的上一张表（两表之间无普通文本的场景）
      if (rows.length > 0) {
        tables.push(rows);
        rows = [];
      }
      header = cells;
      continue;
    }
    const row: Record<string, string> = {};
    header.forEach((key, i) => {
      if (key) row[key] = cells[i] ?? '';
    });
    rows.push(row);
  }
  if (header !== null && rows.length > 0) tables.push(rows);
  return tables;
}

/** 在已解析的表数组里找表头命中任一关键词的第一张表 */
export function findTable(
  tables: Array<Array<Record<string, string>>>,
  headerKeys: string[],
): Array<Record<string, string>> {
  for (const table of tables) {
    const keys = Object.keys(table[0] ?? {});
    if (headerKeys.some((want) => keys.some((k) => k.includes(want)))) return table;
  }
  return [];
}

/* ────────────────────────── 工具函数 ────────────────────────── */

/** 展示值格式化：对象/数组压缩为可读短文本（与 AgentBoard.fmtValue 同口径） */
function fmtValue(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) {
    return v
      .map((x) => (x && typeof x === 'object' ? JSON.stringify(x) : String(x)))
      .filter(Boolean)
      .join('；');
  }
  return JSON.stringify(v);
}

const clampText = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

/** 从「85 - 专项债额度可达 30%」这类评分文案里抽出数字分 */
function scoreOf(text: string): number | null {
  const m = text.match(/(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : null;
}

/** 综合分 → 徽章：≥75 初步适用 / ≥60 需复核 / 其余 不适用 */
function scoreBadge(text: string): { label: string; tone: Tone } {
  const s = scoreOf(text);
  if (s === null) return { label: '待确认', tone: 'neutral' };
  if (s >= 75) return { label: '初步适用', tone: 'green' };
  if (s >= 60) return { label: '需复核', tone: 'yellow' };
  return { label: '不适用', tone: 'red' };
}

/** 文案 → 状态徽章（灯色词 / 待核实词 / 通过词的词表映射） */
export function classifyStatus(text: string): { label: string; tone: Tone } {
  const t = text.trim();
  if (!t) return { label: '待确认', tone: 'neutral' };
  const low = t.toLowerCase();
  if (low === 'red' || low === 'yellow' || low === 'green') {
    return {
      label: low === 'red' ? '红灯 · 不通过' : low === 'yellow' ? '黄灯 · 有条件' : '绿灯 · 通过',
      tone: low as Tone,
    };
  }
  if (/红灯|不通过|不适用|终止|未达标|高危/.test(t)) return { label: clampText(t, 10), tone: 'red' };
  if (/黄灯|待核实|待确认|待核查|待补证|条件推进|需复核|无法判定|待校准/.test(t)) return { label: clampText(t, 10), tone: 'yellow' };
  if (/绿灯|通过|达标|可推进|初步适用|有来源|已确认|已交付/.test(t)) return { label: clampText(t, 10), tone: 'green' };
  return { label: clampText(t, 12), tone: 'neutral' };
}

/** 结论层对象里的灯色字段（灯色/校验灯/顶层灯）→ Tone */
function lampTone(json: Record<string, unknown>): Tone | undefined {
  for (const key of ['灯色', '校验灯', '顶层灯']) {
    const v = json[key];
    if (v === 'green' || v === 'yellow' || v === 'red') return v;
  }
  return undefined;
}

/** 平铺一层嵌套对象/数组字段为 kv 行（跳过内部字段），供矩阵取数 */
function flatEntries(json: Record<string, unknown>): Array<[string, unknown]> {
  return Object.entries(json).filter(([k]) => !k.startsWith('_'));
}

/** 行对象按候选键取第一个非空字符串字段 */
function pickStr(obj: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const s = fmtValue(obj[k]);
    if (s) return s;
  }
  return '';
}

/** 相似度 0-1 → 徽章：≥0.8 高危相似 / ≥0.6 需关注 / 其余 低相似 */
function similarityBadge(text: string): { label: string; tone: Tone } {
  const v = parseFloat(text);
  if (Number.isNaN(v)) return { label: '待确认', tone: 'neutral' };
  if (v >= 0.8) return { label: '高危相似', tone: 'red' };
  if (v >= 0.6) return { label: '需关注', tone: 'yellow' };
  return { label: '低相似', tone: 'green' };
}

/* ────────────────────────── 七 agent 组装层 ────────────────────────── */

type RowSource = Array<Record<string, unknown>>;

/** 任意来源（json 数组 / markdown 表格行）统一成对象数组 */
function asRowSource(v: unknown, table: RowSource): RowSource {
  if (Array.isArray(v) && v.length > 0) {
    return v.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x));
  }
  return table;
}

/** A1 前置闸门：H1/H2/S 三条核验维度行 + 风险点详情 */
function buildA1(json: Record<string, unknown>): MatrixModel | null {
  const codes = Array.isArray(json['命中判据']) ? json['命中判据'].map(fmtValue).filter(Boolean) : [];
  const basis = (json['依据'] && typeof json['依据'] === 'object' && !Array.isArray(json['依据']))
    ? json['依据'] as Record<string, unknown>
    : {};
  const risks = Array.isArray(json['风险点']) ? json['风险点'].map(fmtValue).filter(Boolean) : [];

  const DIMS: Array<{ dim: string; name: string; prefix: RegExp; basisKey: string }> = [
    { dim: 'H1', name: '产权与资产硬闸门', prefix: /^H1\./, basisKey: 'H1' },
    { dim: 'H2', name: '规划与文保闸门', prefix: /^H2\./, basisKey: 'H2' },
    { dim: 'S', name: '资产条件软评分', prefix: /^S/, basisKey: 'S_aggregate' },
  ];
  const rows: MatrixRow[] = [];
  for (const d of DIMS) {
    const hit = codes.find((c) => d.prefix.test(c));
    if (!hit && !fmtValue(basis[d.basisKey])) continue; // 该维度完全无数据则不渲染
    const status = hit ? classifyStatus(hit.replace(/^[^.]+\./, '').replace(/\.[A-Za-z0-9<>=-]+$/, '')) : null;
    rows.push({
      id: d.dim,
      title: `${d.dim} · ${d.name}`,
      cells: [hit || '未输出判据'],
      badge: status,
      evidence: clampText(fmtValue(basis[d.basisKey]) || '待补依据', 24),
      detail: [
        { label: '命中判据', value: hit || '未输出' },
        { label: '依据', value: fmtValue(basis[d.basisKey]) || '待补充' },
        ...risks.map((r, i) => ({ label: `风险点 ${i + 1}`, value: r, tone: 'yellow' as Tone })),
      ],
    });
  }
  if (rows.length === 0) return null;
  return {
    tag: 'GATE CHECK MATRIX',
    title: '固有对象核验与闸门研判',
    columns: ['命中判据'],
    rows,
    verdict: { lamp: lampTone(json), lines: [pickStr(json, ['建议动作'])].filter(Boolean) },
  };
}

/** A2 政策应答：可适用 + 未适用政策清单（对齐设计稿 Policy Evidence Matrix） */
function buildA2(json: Record<string, unknown>, tables: Array<Array<Record<string, string>>>): MatrixModel | null {
  const applicable = asRowSource(
    json['可适用政策清单'],
    findTable(tables, ['政策名称', '政策']),
  );
  const inapplicable = asRowSource(json['未适用政策及原因'], []);
  const rows: MatrixRow[] = [];

  for (const p of applicable) {
    const name = pickStr(p, ['政策名称', '名称', '政策']);
    if (!name) continue;
    const strength = pickStr(p, ['支持力度']);
    const path = pickStr(p, ['申请路径']);
    const score = pickStr(p, ['综合分']);
    rows.push({
      id: name,
      title: name,
      cells: [clampText(strength, 30), clampText(path, 30)],
      badge: scoreBadge(score || strength),
      evidence: clampText(pickStr(p, ['依据条款', '条款']) || '待补证', 26),
      detail: [
        { label: '支持力度', value: strength || '待补充' },
        { label: '申请路径', value: path || '待补充' },
        { label: '限制条件', value: pickStr(p, ['限制条件']) || '无' },
        { label: '依据条款', value: pickStr(p, ['依据条款', '条款']) || '待补充' },
        { label: '综合分', value: score || '待计算', tone: scoreBadge(score || strength).tone },
      ],
    });
  }
  for (const p of inapplicable) {
    const name = pickStr(p, ['政策名称', '名称']);
    if (!name) continue;
    const reason = pickStr(p, ['不适用原因', '原因']);
    rows.push({
      id: `n-${name}`,
      title: name,
      cells: ['—', '—'],
      badge: { label: '不适用', tone: 'red' },
      evidence: clampText(reason, 26),
      detail: [{ label: '不适用原因', value: reason || '未说明', tone: 'red' }],
    });
  }
  if (rows.length === 0) return null;
  return {
    tag: 'POLICY EVIDENCE MATRIX',
    title: '政策条款匹配与适用性研判',
    columns: ['支持力度', '申请路径'],
    badgeColumn: '匹配判断',
    rows,
    verdict: { lamp: lampTone(json), lines: [pickStr(json, ['建议动作'])].filter(Boolean) },
  };
}

/** A3 多元融资：融资工具清单 + 推荐资金组合详情 */
function buildA3(json: Record<string, unknown>, tables: Array<Array<Record<string, string>>>): MatrixModel | null {
  const tools = asRowSource(json['可适用融资工具清单'], findTable(tables, ['工具名称', '融资']));
  const rows: MatrixRow[] = [];
  for (const tool of tools) {
    const name = pickStr(tool, ['工具名称', '名称', '工具']);
    if (!name) continue;
    const cost = pickStr(tool, ['资金成本', '成本']);
    const term = pickStr(tool, ['期限']);
    const score = pickStr(tool, ['综合分']);
    const passRate = pickStr(tool, ['审批通过率']);
    rows.push({
      id: name,
      title: name,
      cells: [clampText(cost, 22), clampText(term, 14)],
      badge: scoreBadge(score || passRate || cost),
      evidence: clampText(passRate || '待补证', 20),
      detail: [
        { label: '资金成本', value: cost || '待补充' },
        { label: '期限', value: term || '待补充' },
        { label: '审批通过率', value: passRate || '待补充' },
        { label: '综合分', value: score || '待计算', tone: scoreBadge(score || passRate).tone },
      ],
    });
  }
  if (rows.length === 0) return null;
  const risks = Array.isArray(json['关键审批风险点']) ? json['关键审批风险点'].map(fmtValue).filter(Boolean) : [];
  return {
    tag: 'FUNDING CHANNEL MATRIX',
    title: '融资工具匹配与资金结构研判',
    columns: ['资金成本', '期限'],
    badgeColumn: '匹配判断',
    rows,
    verdict: {
      lamp: lampTone(json),
      lines: [
        pickStr(json, ['推荐资金组合', '组合']) && `推荐资金组合：${pickStr(json, ['推荐资金组合', '组合'])}`,
        ...risks.map((r) => `审批风险：${r}`),
        pickStr(json, ['建议动作']),
      ].filter((s): s is string => !!s),
    },
  };
}

/** A4 通用财务：财务指标行 + 业态门槛对照 */
function buildA4(json: Record<string, unknown>): MatrixModel | null {
  const metrics = (json['财务指标'] && typeof json['财务指标'] === 'object' && !Array.isArray(json['财务指标']))
    ? json['财务指标'] as Record<string, unknown>
    : null;
  const threshold = (json['业态门槛对照'] && typeof json['业态门槛对照'] === 'object')
    ? json['业态门槛对照'] as Record<string, unknown>
    : {};
  if (!metrics) return null;
  const bar = pickStr(threshold, ['门槛区间']) || '—';
  const passText = pickStr(threshold, ['达标结论']);
  const passStatus = passText ? classifyStatus(passText) : null;

  // 主指标行固定顺序，其余指标字段补在后面
  const mainKeys = ['IRR', 'NPV', '回收期', '敏感性分析'];
  const extraKeys = Object.keys(metrics).filter((k) => !mainKeys.includes(k));
  const rows: MatrixRow[] = [...mainKeys, ...extraKeys]
    .filter((k) => k in metrics && fmtValue(metrics[k]))
    .map((k) => ({
      id: k,
      title: k,
      cells: [clampText(fmtValue(metrics[k]), 40), k === 'IRR' ? bar : '—'],
      badge: k === 'IRR' && passStatus ? passStatus : null,
      evidence: k === 'IRR' ? (passText || '待测算') : '测算值',
      detail: [
        { label: '指标值', value: fmtValue(metrics[k]) },
        ...(k === 'IRR' ? [
          { label: '业态门槛对照', value: `${pickStr(threshold, ['业态']) || '—'} · 门槛 ${bar}` },
          { label: '达标结论', value: passText || '待判定', tone: passStatus?.tone },
        ] : []),
      ],
    }));
  if (rows.length === 0) return null;
  return {
    tag: 'FINANCIAL METRIC MATRIX',
    title: '财务指标测算与门槛对照',
    columns: ['测算值', '门槛对照'],
    badgeColumn: '达标结论',
    rows,
    verdict: {
      lamp: lampTone(json),
      lines: [
        pickStr(json, ['关键假设']) && `关键假设：${clampText(pickStr(json, ['关键假设']), 90)}`,
        pickStr(json, ['改造模式']) && `改造模式：${pickStr(json, ['改造模式'])}`,
      ].filter((s): s is string => !!s),
    },
  };
}

/** A5 失败校验：Top3 失败案例对照 + 规避建议 */
function buildA5(json: Record<string, unknown>, tables: Array<Array<Record<string, string>>>): MatrixModel | null {
  const cases = asRowSource(json['Top3案例'], findTable(tables, ['case_id', '案例', '相似度']));
  const rows: MatrixRow[] = [];
  for (const c of cases) {
    const id = pickStr(c, ['case_id', '案例ID', 'id']);
    const similarity = pickStr(c, ['相似度']);
    const pattern = pickStr(c, ['失败模式']);
    const rootCause = pickStr(c, ['根因', '失败根因']);
    if (!id && !similarity) continue;
    const simStatus = similarity ? similarityBadge(similarity) : null;
    const simPct = Number.isNaN(parseFloat(similarity)) ? similarity : `${Math.round(parseFloat(similarity) * 100)}%`;
    rows.push({
      id: id || `${pattern}-${similarity}`,
      title: id || '未命名案例',
      cells: [simPct, pattern || '—'],
      badge: simStatus,
      evidence: clampText(rootCause, 26) || '待补证',
      detail: [
        { label: '相似度', value: simPct, tone: simStatus?.tone },
        { label: '失败模式', value: pattern || '未归类', tone: pattern ? classifyStatus(pattern).tone : undefined },
        { label: '根因', value: rootCause || '待补充' },
      ],
    });
  }
  if (rows.length === 0) return null;
  const hits = (json['命中判据'] && typeof json['命中判据'] === 'object' && !Array.isArray(json['命中判据']))
    ? json['命中判据'] as Record<string, unknown>
    : {};
  const recheck = json['根因重现判断'];
  return {
    tag: 'FAILURE CASE MATRIX',
    title: '同类失败案例对照与风险根因',
    columns: ['相似度', '失败模式'],
    badgeColumn: '风险判断',
    rows,
    verdict: {
      lamp: lampTone(json),
      lines: [
        recheck !== undefined && `根因重现判断：${recheck ? '已重现，需重点规避' : '未见重现'}`,
        pickStr(hits, ['H1_高危模式']) && `命中高危模式：${pickStr(hits, ['H1_高危模式'])}`,
        pickStr(json, ['规避建议', '建议动作']),
      ].filter((s): s is string => !!s),
    },
  };
}

/** A6 双层决策：四维子灯矩阵 + 顶层判定 */
function buildA6(json: Record<string, unknown>, tables: Array<Array<Record<string, string>>>): MatrixModel | null {
  const dims = (json['四维子灯'] && typeof json['四维子灯'] === 'object' && !Array.isArray(json['四维子灯']))
    ? json['四维子灯'] as Record<string, unknown>
    : null;
  const rows: MatrixRow[] = [];
  if (dims) {
    for (const [dim, v] of Object.entries(dims)) {
      const d = (v && typeof v === 'object' && !Array.isArray(v)) ? v as Record<string, unknown> : {};
      const lamp = pickStr(d, ['灯色']);
      if (!lamp && !pickStr(d, ['依据'])) continue;
      const lampStatus = lamp ? classifyStatus(lamp) : null;
      rows.push({
        id: dim,
        title: dim,
        cells: [clampText(pickStr(d, ['依据']) || '待输出依据', 44)],
        badge: lampStatus,
        evidence: lampStatus?.label ?? '待定',
        detail: [
          { label: '维度灯色', value: lampStatus?.label ?? '待定', tone: lampStatus?.tone },
          { label: '判定依据', value: pickStr(d, ['依据']) || '待补充' },
          ...Object.entries(d)
            .filter(([k]) => !['灯色', '依据'].includes(k))
            .map(([k, val]) => ({ label: k, value: fmtValue(val) })),
        ],
      });
    }
  } else {
    // 兜底：agent6 汇总表（类型|灯色|核心结论）转矩阵行
    const table = findTable(tables, ['灯色']);
    for (const r of table) {
      const type = pickStr(r, ['类型']);
      const lamp = pickStr(r, ['灯色']);
      if (!type) continue;
      const status = classifyStatus(lamp);
      rows.push({
        id: type,
        title: type,
        cells: [pickStr(r, ['核心结论', '结论'])],
        badge: status,
        evidence: status.label,
        detail: [
          { label: '灯色', value: lamp || '待定', tone: status.tone },
          { label: '核心结论', value: pickStr(r, ['核心结论', '结论']) || '—' },
        ],
      });
    }
  }
  if (rows.length === 0) return null;
  const todo = Array.isArray(json['条件推进事项']) ? json['条件推进事项'].map(fmtValue).filter(Boolean) : [];
  return {
    tag: 'TWO-TIER DECISION MATRIX',
    title: '双层决策灯与维度研判',
    columns: ['判定依据'],
    badgeColumn: '维度灯色',
    rows,
    verdict: {
      lamp: lampTone(json),
      lines: [
        pickStr(json, ['顶层判据']) && `顶层判据：${pickStr(json, ['顶层判据'])}`,
        ...todo.map((x) => `条件推进：${x}`),
        pickStr(json, ['触发报告模板']) && `触发报告模板：${pickStr(json, ['触发报告模板'])}`,
        pickStr(json, ['建议动作']),
      ].filter((s): s is string => !!s),
    },
  };
}

/** A7 建造判别：通用要素矩阵（JEV 五连判 schema 未固化，全部字段容错展示） */
function buildA7(json: Record<string, unknown>): MatrixModel | null {
  const rows: MatrixRow[] = [];
  for (const [k, v] of flatEntries(json)) {
    if (['agent', '灯色', '校验灯', '建议动作', '结论'].includes(k)) continue;
    const text = fmtValue(v);
    if (!text) continue;
    const status = classifyStatus(text);
    rows.push({
      id: k,
      title: k,
      cells: [clampText(text, 60)],
      badge: status.tone === 'neutral' ? null : status,
      evidence: status.tone === 'neutral' ? '—' : status.label,
      detail: [{ label: k, value: text }],
    });
  }
  if (rows.length === 0) return null;
  return {
    tag: 'BUILD CHECK MATRIX',
    title: '建造判别要素',
    columns: ['内容'],
    badgeColumn: '状态',
    rows,
    verdict: { lamp: lampTone(json), lines: [pickStr(json, ['建议动作', '结论'])].filter(Boolean) },
  };
}

const BUILDERS: Record<string, (json: Record<string, unknown>, tables: Array<Array<Record<string, string>>>) => MatrixModel | null> = {
  'agent1-固有对象': (j) => buildA1(j),
  'agent2-政策应答': buildA2,
  'agent3-多元融资': buildA3,
  'agent4-财务模型': (j) => buildA4(j),
  'agent5-失败案例': buildA5,
  'agent6-双层决策': buildA6,
  'agent7-建造判别': (j) => buildA7(j),
};

/* ────────────────────────── 入口 ────────────────────────── */

/**
 * 组装某 agent 的核心结论矩阵。
 *
 * 数据优先级：output_json（后端已解析）→ summary 里的 ```json 结论块
 * → summary 里的 markdown 表格（逐 builder 内部兜底）。
 * 返回 null 表示凑不出矩阵，调用方回退通用三段式看板。
 */
export function buildConclusionMatrix(
  agentId: string,
  outputJson: Record<string, unknown> | undefined,
  summary: string | undefined,
): MatrixModel | null {
  const build = BUILDERS[agentId];
  if (!build) return null;
  // output_json 有内容就用它，否则从 summary 提取结论层 JSON；
  // json 为空不直接放弃 —— A6 等还能靠 summary 汇总表兜底
  const json = outputJson && Object.keys(outputJson).length > 0
    ? outputJson
    : extractConclusionJson(summary) ?? {};
  const tables = parseMarkdownTables(summary ?? '');
  if (Object.keys(json).length === 0 && tables.length === 0) return null;
  return build(json, tables);
}
