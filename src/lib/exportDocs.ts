import type { AgentOutput, SuggestAction } from '../types';
import { readLamp } from './pipeline';

/**
 * exportDocs —— 「导出结论」下拉的三份文件生成器。
 *
 *   政府版上会文件  —— 侧重政策合规、前置核验、下一步工作（HTML，可打印）
 *   投资版上会文件  —— 侧重回报指标、融资测算、风险提示（HTML，可打印）
 *   详细推演脚本    —— 七 agent 逐个完整输出与推演过程（Markdown）
 *
 * 数据优先取真实 agentOutputs；未跑 agent 时回退演示口径
 * （重庆嘉陵五村 26 号，与结论页演示态一致）。
 */

type Lamp = 'green' | 'yellow' | 'red' | null;

export interface DimLamp {
  key: string;
  label: string;
  lamp: Lamp;
}

export interface ConclusionData {
  isDemo: boolean;
  projectName: string;
  grade: string;
  gradeLamp: Lamp;
  verdictLine: string;
  verdictNote: string;
  kpis: Array<{ label: string; value: string; sub: string }>;
  dims: DimLamp[];
  actions: SuggestAction[];
  outputs: Record<string, AgentOutput>;
}

/** A1-A6 六 agent（顺序与 AGENT_TABS 一致；A7 交付不参与判定） */
const SIX: Array<{ id: string; name: string }> = [
  { id: 'agent1-固有对象', name: '前置闸门' },
  { id: 'agent2-政策应答', name: '政策应答' },
  { id: 'agent3-多元融资', name: '多元融资' },
  { id: 'agent4-财务模型', name: '通用财务' },
  { id: 'agent5-失败案例', name: '失败校验' },
  { id: 'agent6-双层决策', name: '双层决策' },
];

const DEMO_LAMPS: Record<string, Lamp> = {
  'agent1-固有对象': 'yellow',
  'agent2-政策应答': 'green',
  'agent3-多元融资': 'yellow',
  'agent4-财务模型': 'green',
  'agent5-失败案例': 'yellow',
  'agent6-双层决策': 'yellow',
};

/** output_json 模糊取值：键名包含任一关键词即返回其字符串值 */
function pick(json: Record<string, unknown> | undefined, keys: string[]): string {
  if (!json) return '';
  for (const key of keys) {
    const hit = Object.keys(json).find((k) => !k.startsWith('_') && k.includes(key));
    if (hit) {
      const v = json[hit];
      if (typeof v === 'string' && v.trim()) return v.trim();
      if (typeof v === 'number') return String(v);
    }
  }
  return '';
}

const clamp = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

/** 从 agent6 输出的 H1-H4 提取四维灯（值形如 H2.yellow.H）；无输出回退演示值 */
function extractDims(outputs: Record<string, AgentOutput>, isDemo: boolean): DimLamp[] {
  const meta: Array<{ key: string; label: string; demo: Lamp }> = [
    { key: 'H1', label: '政策合规', demo: 'yellow' },
    { key: 'H2', label: '财务可行', demo: 'green' },
    { key: 'H3', label: '运营可行', demo: 'green' },
    { key: 'H4', label: '工程可行', demo: 'yellow' },
  ];
  const json = outputs['agent6-双层决策']?.output_json as Record<string, unknown> | undefined;
  return meta.map(({ key, label, demo }) => {
    let lamp = demo;
    if (!isDemo && json) {
      const raw = String(json[key] ?? '');
      if (raw.includes('green')) lamp = 'green';
      else if (raw.includes('yellow')) lamp = 'yellow';
      else if (raw.includes('red')) lamp = 'red';
      else lamp = null;
    }
    return { key, label, lamp };
  });
}

/** 汇总结论页/导出文档共用的口径 */
export function collectConclusionData(
  outputs: Record<string, AgentOutput>,
  actions: SuggestAction[],
  isDemo: boolean,
): ConclusionData {
  const a6 = outputs['agent6-双层决策']?.output_json as Record<string, unknown> | undefined;
  const topLamp = isDemo ? 'yellow' : readLamp(a6);

  const irr = pick(outputs['agent4-财务模型']?.output_json, ['IRR', 'irr']) || (isDemo ? '36.35%' : '—');
  const npv = pick(outputs['agent4-财务模型']?.output_json, ['NPV', 'npv', '净现值']) || (isDemo ? '+2,996.6 万' : '—');
  const payback = pick(outputs['agent4-财务模型']?.output_json, ['回收期', 'payback']) || (isDemo ? '2.75 年' : '—');

  const grade =
    !isDemo && a6
      ? topLamp === 'green' ? 'A-' : topLamp === 'red' ? 'C+' : 'B+'
      : 'B+';

  const verdictLine = isDemo || !a6
    ? topLamp === 'red'
      ? '存在阻断性风险，建议暂缓推进并补充材料。'
      : topLamp === 'green'
        ? '各维度核验通过，建议推进至实施深化阶段。'
        : '建议在完成关键前置核验后，进入下一阶段深化。'
    : clamp(pick(a6, ['建议动作', '结论', '顶层结论']), 48) || '详见双层决策输出。';

  return {
    isDemo,
    projectName: isDemo ? '重庆 · 嘉陵五村 26 号' : clamp(pick(a6, ['项目', '标的']) || '城市更新项目', 24),
    grade,
    gradeLamp: topLamp,
    verdictLine,
    verdictNote: isDemo
      ? '综合政策、财务、运营、工程与风险维度的研判结果。最终判断以真实 Agent 输出、证据卷宗和人工确认结果为准。'
      : '基于七智能体链路输出聚合，人工确认前不构成正式决策。',
    kpis: [
      { label: 'IRR 内部收益率', value: irr, sub: 'IRR · 财务口径' },
      { label: 'NPV 净现值', value: npv, sub: 'NPV · 财务口径' },
      { label: '投资回收期', value: payback, sub: 'PAYBACK' },
      { label: '综合评级', value: grade, sub: topLamp === 'green' ? '绿灯 · 建议推进' : topLamp === 'red' ? '红灯 · 建议暂缓' : '黄灯 · 建议上会' },
    ],
    dims: extractDims(outputs, isDemo),
    actions,
    outputs,
  };
}

const lampText = (lamp: Lamp) =>
  lamp === 'green' ? '绿 · 通过' : lamp === 'yellow' ? '黄 · 有条件' : lamp === 'red' ? '红 · 不通过' : '待命';

const lampColor = (lamp: Lamp) =>
  lamp === 'green' ? '#1d7a4f' : lamp === 'yellow' ? '#b07d1e' : lamp === 'red' ? '#b0433a' : '#8a97a3';

/** 日期：导出文件名与文头共用 */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** 打印友好的 HTML 文档壳（白底、A4 友好、内联样式） */
function docShell(title: string, body: string): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<title>${title}</title>
<style>
  body { font-family: 'PingFang SC', 'Microsoft YaHei', 'SimSun', sans-serif; color: #1a242c; margin: 0; background: #f2f4f6; }
  .page { max-width: 800px; margin: 24px auto; background: #fff; padding: 48px 56px; box-shadow: 0 2px 12px rgba(0,0,0,.08); }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .meta { color: #6a7681; font-size: 12px; margin-bottom: 24px; }
  h2 { font-size: 15px; margin: 28px 0 10px; border-left: 3px solid #b07d1e; padding-left: 10px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { border: 1px solid #d6dde3; padding: 8px 10px; text-align: left; }
  th { background: #f5f7f9; }
  .grade { font-size: 30px; font-weight: 700; }
  .note { color: #6a7681; font-size: 11px; line-height: 1.7; }
  ul { padding-left: 18px; font-size: 12px; line-height: 1.9; }
  @media print { body { background: #fff; } .page { box-shadow: none; margin: 0; padding: 24px 32px; } }
</style>
</head>
<body><div class="page">${body}</div></body>
</html>`;
}

/** 四维灯 + 六维灯表格段（两版上会文件共用） */
function lampTablesHtml(d: ConclusionData): string {
  const dimRows = d.dims
    .map((x) => `<tr><td>${x.key} ${x.label}</td><td style="color:${lampColor(x.lamp)};font-weight:600">${lampText(x.lamp)}</td></tr>`)
    .join('');
  const sixRows = SIX.map((a) => {
    const lamp = d.isDemo ? DEMO_LAMPS[a.id] : readLamp(d.outputs[a.id]?.output_json);
    return `<tr><td>${a.name}</td><td style="color:${lampColor(lamp)};font-weight:600">${lampText(lamp)}</td></tr>`;
  }).join('');
  return `
  <h2>维度判定</h2>
  <table><tr><th>双层决策四维</th><th>灯色</th></tr>${dimRows}</table>
  <table style="margin-top:10px"><tr><th>智能体六维</th><th>灯色</th></tr>${sixRows}</table>`;
}

/** 行动列表段（两版共用） */
function actionsHtml(d: ConclusionData): string {
  if (d.actions.length === 0) return '<p class="note">暂无建议动作。</p>';
  return `<ul>${d.actions.map((a) => `<li><b>${a.title}</b> — ${a.description}</li>`).join('')}</ul>`;
}

/** 核心指标表段（投资版 / 完整版共用） */
function kpiTableHtml(d: ConclusionData): string {
  const kpiRows = d.kpis
    .map((k) => `<tr><td>${k.label}</td><td style="font-weight:600">${k.value}</td><td class="note">${k.sub}</td></tr>`)
    .join('');
  return `<table><tr><th>指标</th><th>数值</th><th>口径</th></tr>${kpiRows}</table>`;
}

/** 黄/红灯维度提示段（风险关注，两版/完整版共用） */
function riskHtml(d: ConclusionData): string {
  const warnDims = d.dims.filter((x) => x.lamp === 'yellow' || x.lamp === 'red');
  if (warnDims.length === 0) {
    return '<p class="note">四维均为绿灯，重点转为执行节奏与成本控制。</p>';
  }
  const names = warnDims.map((x) => `${x.key} ${x.label}`).join('、');
  return `<p class="note">优先关注维度：<b>${names}</b>；建议对相关假设做敏感性压力测试并补充佐证材料。</p>`;
}

const DISCLAIMER = `<p class="note">声明：本文件由七智能体决策链路自动生成，仅供内部研判与上会讨论参考；人工确认前不构成正式决策或投资承诺。</p>`;

/** 政府版上会文件：政策合规、前置核验、下一步工作 */
export function buildGovDoc(d: ConclusionData): string {
  const title = `${today()}-政府版上会文件-${d.projectName}`;
  return docShell(title, `
    <h1>城市更新项目上会文件（政府版）</h1>
    <div class="meta">${d.projectName} · ${today()} · 万象更芯·智算营城 决策链路生成</div>
    <h2>一、项目概况与总体结论</h2>
    <p>综合评级 <span class="grade" style="color:${lampColor(d.gradeLamp)}">${d.grade}</span>（${lampText(d.gradeLamp)}）</p>
    <p><b>${d.verdictLine}</b></p>
    <p class="note">${d.verdictNote}</p>
    ${lampTablesHtml(d)}
    <h2>二、政策合规与前置核验要点</h2>
    <p class="note">重点核验产权归属、文保等级、更新政策准入与经营前置条件；对应前置闸门与政策应答智能体的灯色判定。</p>
    <h2>三、下一步工作</h2>
    ${actionsHtml(d)}
    ${DISCLAIMER}`);
}

/** 投资版上会文件：回报指标、融资测算、风险提示 */
export function buildInvestDoc(d: ConclusionData): string {
  const title = `${today()}-投资版上会文件-${d.projectName}`;
  return docShell(title, `
    <h1>城市更新项目上会文件（投资版）</h1>
    <div class="meta">${d.projectName} · ${today()} · 万象更芯·智算营城 决策链路生成</div>
    <h2>一、投资要点与评级</h2>
    <p>综合评级 <span class="grade" style="color:${lampColor(d.gradeLamp)}">${d.grade}</span>（${lampText(d.gradeLamp)}）</p>
    <p><b>${d.verdictLine}</b></p>
    <h2>二、核心回报指标</h2>
    ${kpiTableHtml(d)}
    ${lampTablesHtml(d)}
    <h2>三、风险提示</h2>
    ${riskHtml(d)}
    <h2>四、投资建议与后续动作</h2>
    ${actionsHtml(d)}
    ${DISCLAIMER}`);
}

/**
 * 完整结论文件：全要素易读版（HTML）。
 * 概况/结论 → 核心指标 → 维度判定 → 风险关注 → 下一步行动，
 * 面向人工通读复核，不限定政府或投资视角。
 */
export function buildFullDoc(d: ConclusionData): string {
  const title = `${today()}-完整结论文件-${d.projectName}`;
  return docShell(title, `
    <h1>城市更新项目完整结论文件</h1>
    <div class="meta">${d.projectName} · ${today()} · 万象更芯·智算营城 决策链路生成</div>
    <h2>一、总体结论</h2>
    <p>综合评级 <span class="grade" style="color:${lampColor(d.gradeLamp)}">${d.grade}</span>（${lampText(d.gradeLamp)}）</p>
    <p><b>${d.verdictLine}</b></p>
    <p class="note">${d.verdictNote}</p>
    <h2>二、核心指标</h2>
    ${kpiTableHtml(d)}
    ${lampTablesHtml(d)}
    <h2>三、风险与关注要点</h2>
    ${riskHtml(d)}
    <h2>四、下一步行动</h2>
    ${actionsHtml(d)}
    ${DISCLAIMER}`);
}

/** 详细推演脚本：七 agent 逐个完整输出（Markdown） */
export function buildScriptDoc(d: ConclusionData): string {
  const lines: string[] = [
    `# 详细推演脚本 · ${d.projectName}`,
    '',
    `- 日期：${today()}`,
    `- 综合评级：${d.grade}（${lampText(d.gradeLamp)}）`,
    `- 结论：${d.verdictLine}`,
    '',
    '---',
    '',
    '## 一、双层决策四维灯',
    '',
    ...d.dims.map((x) => `- **${x.key} ${x.label}**：${lampText(x.lamp)}`),
    '',
    '## 二、七智能体完整推演过程',
    '',
  ];

  // 每个 agent 一节：灯色 + 关键字段 + 完整 JSON；未跑的 agent 标注待命（演示口径给演示灯）
  for (let i = 0; i < SIX.length; i++) {
    const a = SIX[i];
    const out = d.outputs[a.id];
    const lamp = d.isDemo ? DEMO_LAMPS[a.id] : readLamp(out?.output_json);
    lines.push(`### A${i + 1} ${a.name}`, '');
    lines.push(`- 灯色：${lampText(lamp)}`);
    lines.push(`- 状态：${out ? '已完成' : d.isDemo ? '演示口径' : '待命'}`, '');
    if (out?.output_json) {
      lines.push('```json', JSON.stringify(out.output_json, null, 2), '```', '');
    }
    if (out?.summary) {
      lines.push('输出摘要：', '', `> ${clamp(out.summary, 300)}`, '');
    }
  }

  lines.push('## 三、下一步行动', '');
  lines.push(...(d.actions.length
    ? d.actions.map((a, i) => `${i + 1}. **${a.title}** — ${a.description}`)
    : ['（暂无建议动作）']));
  lines.push('', '---', '', '> 本脚本由七智能体决策链路自动生成，含完整结构化输出，供详细复核与推演追溯使用。');
  return lines.join('\n');
}

/** 触发浏览器下载 */
export function downloadDoc(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
