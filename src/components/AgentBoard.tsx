import React, { useMemo } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { AgentOutput, Message } from '../types';
import { readLamp } from '../lib/pipeline';
import { buildConclusionMatrix, extractConclusionJson } from '../lib/conclusionMatrix';
import { AGENT_TABS } from './AgentPane';
import ConclusionMatrix from './ConclusionMatrix';
import { AGENT_BOARDS, hasBoardData } from './boards';
import BoardChart, { type BarSpec } from './BoardChart';
import { useT } from '../i18n';

/**
 * AgentBoard —— 中栏结论看板（V4.3 固定模板版）。
 *
 * 三态共用同一套模板骨架（类似模板文件）：
 *   状态条    —— 待命 / 执行中（per-agent emoji + 动效提示）
 *   输入重点  —— 固定采集字段 chips（未采集显示「待采集」）
 *   结论可视化 —— BoardChart 三态：空图表 → 随机数据跳动 → 固定结论数据
 *   输出重点  —— 固定字段行（未完成显示「结论运算中……」，完成缺字段显示「—」）
 *   判定结论  —— 灯色徽章 + 结论文字（同上占位规则）
 *
 * 完成态凑出核心结论矩阵时优先 ConclusionMatrix，下挂固定图表（结论数据）。
 * 所有提取都是展示层容错：缺字段显示占位，绝不阻塞版式。
 */

/** 每 agent 看板配置：输入关注的采集字段 label / 输出优先键（子串匹配）/ 结论键 */
interface BoardSpec {
  inputKeys: string[];
  outputKeys: string[];
  verdictKeys: string[];
  motion: string;
}

const BOARD_SPECS: Record<string, BoardSpec> = {
  'agent1-固有对象': {
    inputKeys: ['城市', '区位', '建筑面积', '改造模式', '文保等级', '业主资质'],
    outputKeys: ['H1', 'S1', 'S2', '总分', '固有对象'],
    verdictKeys: ['建议动作', '结论', '判定'],
    motion: '正在核验产权与文保属性…',
  },
  'agent2-政策应答': {
    inputKeys: ['城市', '业态方向', '改造模式'],
    outputKeys: ['政策', '应答', '门槛', 'H1', '匹配'],
    verdictKeys: ['建议动作', '结论', '应答结论'],
    motion: '正在比对城市更新政策库…',
  },
  'agent3-多元融资': {
    inputKeys: ['总投资', '自有资金比例', '抵押物类型', '抵押物估值'],
    outputKeys: ['资本金', '抵押', '综合分', '组合', 'DSCR', '融资'],
    verdictKeys: ['建议动作', '结论', '判定'],
    motion: '正在测算资本金与融资组合…',
  },
  'agent4-财务模型': {
    inputKeys: ['总投资', '月租金', '可租赁面积', '出租率', '持有年限'],
    outputKeys: ['IRR', 'NPV', '回收期', '门槛', '现金流'],
    verdictKeys: ['建议动作', '结论', '判定'],
    motion: '正在跑现金流与回报测算…',
  },
  'agent5-失败案例': {
    inputKeys: ['城市', '业态方向', '改造模式', '总投资'],
    outputKeys: ['Top', '相似', '失败模式', 'S1', 'S2', '总分', '风险点'],
    verdictKeys: ['建议动作', '风险点', '结论'],
    motion: '正在检索同类失败案例…',
  },
  'agent6-双层决策': {
    inputKeys: ['改造模式', '总投资', '退出策略', '折现率'],
    outputKeys: ['H1', 'H2', 'H3', 'H4', '就绪度', '顶层'],
    verdictKeys: ['建议动作', '结论', '顶层灯色'],
    motion: '正在合成双层决策…',
  },
  'agent7-建造判别': {
    inputKeys: ['城市', '区位', '改造模式', '结构鉴定'],
    outputKeys: ['结构', '消防', '卫生间', '否决', 'fatal', '总分', '灯色'],
    verdictKeys: ['建议动作', '结论', '判定'],
    motion: '正在运行 JEV 建造判别引擎…',
  },
};

/** 每 agent 图表条目：label 固定展示，keys 按 pool 子串匹配抽数值 */
const CHART_SPECS: Record<string, Array<{ label: string; keys: string[] }>> = {
  'agent1-固有对象': [
    { label: 'H1 政策', keys: ['H1'] },
    { label: 'S1 资产', keys: ['S1'] },
    { label: 'S2 区位', keys: ['S2'] },
    { label: '总分', keys: ['总分'] },
  ],
  'agent2-政策应答': [
    { label: '政策匹配', keys: ['匹配'] },
    { label: '门槛', keys: ['门槛'] },
    { label: 'H1', keys: ['H1'] },
  ],
  'agent3-多元融资': [
    { label: '综合分', keys: ['综合分'] },
    { label: 'DSCR', keys: ['DSCR'] },
    { label: '资本金', keys: ['资本金'] },
  ],
  'agent4-财务模型': [
    { label: 'IRR', keys: ['IRR'] },
    { label: 'NPV', keys: ['NPV'] },
    { label: '回收期', keys: ['回收期'] },
  ],
  'agent5-失败案例': [
    { label: 'Top 相似', keys: ['Top', '相似'] },
    { label: 'S1', keys: ['S1'] },
    { label: 'S2', keys: ['S2'] },
    { label: '总分', keys: ['总分'] },
  ],
  'agent7-建造判别': [
    { label: '结构潜力', keys: ['结构'] },
    { label: '消防转换', keys: ['消防'] },
    { label: '卫生间路线', keys: ['卫生间'] },
    { label: '否决项', keys: ['否决', 'fatal'] },
  ],
  'agent6-双层决策': [
    { label: 'H1 政策', keys: ['H1'] },
    { label: 'H2 财务', keys: ['H2'] },
    { label: 'H3 运营', keys: ['H3'] },
    { label: 'H4 工程', keys: ['H4'] },
  ],
};

const clamp = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

/** 展示值格式化：对象/数组压缩为短文本 */
function fmtValue(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) {
    return v
      .map((x) => (typeof x === 'object' && x !== null ? JSON.stringify(x) : String(x)))
      .join('、');
  }
  return JSON.stringify(v);
}

/** 顶层 + 一层嵌套对象平铺（嵌套键显示为 父.子），供字段匹配 */
function flattenOnce(json: Record<string, unknown>): Record<string, unknown> {
  const pool: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(json)) {
    if (k.startsWith('_')) continue;
    pool[k] = v;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      for (const [sk, sv] of Object.entries(v as Record<string, unknown>)) {
        if (!sk.startsWith('_') && !(sk in pool)) pool[`${k}.${sk}`] = sv;
      }
    }
  }
  return pool;
}

/** 模板行：每个固定字段必出一行（label 恒定），未命中 → null（上层渲染占位） */
function templateRows(pool: Record<string, unknown>, keys: string[]): Array<[string, string | null]> {
  return keys.map((key) => {
    const hit = Object.keys(pool).find((k) => !k.includes('灯') && k.includes(key));
    const val = hit ? clamp(fmtValue(pool[hit]), 80) : null;
    return [key, val || null];
  });
}

/** 从展示值抽数字：数字直取；字符串取首个数值片段；布尔转 0/1；纯文本 → null */
function numFrom(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'string') {
    const m = v.match(/-?\d+(\.\d+)?/);
    return m ? parseFloat(m[0]) : null;
  }
  return null;
}

/** 图表数据：label 骨架恒定；值按 pool 匹配（数字驱动柱长，纯文本仅展示） */
function buildBars(agentId: string, pool: Record<string, unknown>): BarSpec[] {
  const items = CHART_SPECS[agentId] ?? [];
  return items.map(({ label, keys }) => {
    for (const key of keys) {
      const hit = Object.keys(pool).find((k) => !k.includes('灯') && k.includes(key));
      if (hit) {
        const display = clamp(fmtValue(pool[hit]), 24);
        return { label, value: numFrom(pool[hit]), display: display || null };
      }
    }
    return { label, value: null, display: null };
  });
}

/** 首条用户消息 →「- 城市:重庆」行解析（composeProjectPrompt 的行格式） */
function parseIntake(messages: Message[]): Record<string, string> {
  const first = messages.find((m) => m.role === 'user');
  const content = first?.content;
  if (!content || typeof content !== 'string') return {};
  const map: Record<string, string> = {};
  for (const m of content.matchAll(/^- ([^:：\n]{1,12})[:：](.+)$/gm)) {
    map[m[1].trim()] = clamp(m[2].trim(), 26);
  }
  return map;
}

/** per-agent 状态条 emoji（顺序同 AGENT_TABS 展示序） */
const STATUS_EMOJI = ['🏠', '📑', '💰', '📊', '⚠️', '🏗️', '🚦'];

interface Props {
  outputs: Record<string, AgentOutput>;
  messages: Message[];
  loading: boolean;
  activeAgentId: string;
}

export const AgentBoard: React.FC<Props> = ({ outputs, messages, loading, activeAgentId }) => {
  const { lang } = useT();
  const zh = lang === 'zh';

  const idx = Math.max(0, AGENT_TABS.findIndex((a) => a.id === activeAgentId));
  const meta = AGENT_TABS[idx];
  const spec = BOARD_SPECS[activeAgentId] ?? {
    inputKeys: [],
    outputKeys: [],
    verdictKeys: ['结论'],
    motion: zh ? '正在执行…' : 'running…',
  };

  const output = outputs[activeAgentId];
  const lamp = readLamp(output?.output_json);

  const intake = useMemo(() => parseIntake(messages), [messages]);
  const pool = useMemo(
    () => (output?.output_json ? flattenOnce(output.output_json) : {}),
    [output],
  );
  const outRows = useMemo(() => templateRows(pool, spec.outputKeys), [pool, spec]);
  const verdictRows = useMemo(() => templateRows(pool, spec.verdictKeys), [pool, spec]);
  const bars = useMemo(() => buildBars(activeAgentId, pool), [activeAgentId, pool]);

  // 核心结论矩阵（V4.2）：output_json 优先，缺失时从 summary 的结论 JSON /
  // markdown 表格提取；凑不出矩阵（返回 null）走模板版式
  const matrix = useMemo(
    () => buildConclusionMatrix(activeAgentId, output?.output_json, output?.summary),
    [activeAgentId, output],
  );

  // —— 专属展板优先（V4.4）：结论层 JSON 足够时渲染该 agent 的海报式看板 ——
  // 数据源同矩阵：output_json → summary 里的 ```json 结论块（历史会话兜底）
  const rawJson = useMemo(() => {
    const oj = output?.output_json;
    if (oj && Object.keys(oj).length > 0) return oj;
    return extractConclusionJson(output?.summary) ?? null;
  }, [output]);
  const Board = rawJson ? AGENT_BOARDS[activeAgentId] : undefined;
  if (output && rawJson && Board && hasBoardData(activeAgentId, rawJson)) {
    return (
      <div className="agent-board">
        <Board json={rawJson} />
      </div>
    );
  }

  const running = loading && !output;
  // 图表三态：有输出=固定结论数据；运行中=随机跳动；待命=空图表
  const chartState: 'idle' | 'running' | 'done' = output ? 'done' : running ? 'running' : 'idle';
  // 占位文案：未完成 → 结论运算中……；已完成但缺字段 → —
  const pending = zh ? '结论运算中……' : 'computing…';
  const missing = zh ? '—' : '—';
  const fieldPlaceholder = output ? missing : pending;

  // —— 核心结论模块态：矩阵优先 + 固定图表（结论数据已落定） ——
  if (matrix) {
    return (
      <div className="agent-board">
        <ConclusionMatrix model={matrix} />
        <BoardChart state="done" bars={bars} zh={zh} />
      </div>
    );
  }

  // —— 统一模板版式：待命 / 运行 / 完成三态共用骨架 ——
  return (
    <div className="agent-board">
      {/* 状态条：待命 / 执行中（完成后隐藏腾空间） */}
      {!output && (
        <div className={`ab-status ${running ? 'running' : ''}`}>
          <span className="ab-status-emoji">{STATUS_EMOJI[idx] ?? '⚙️'}</span>
          <div className="ab-status-text">
            <b>
              {meta?.name} · {running ? (zh ? '执行中' : 'running') : zh ? '待命' : 'standby'}
            </b>
            <small>{running ? spec.motion : zh ? '等待编排器调度' : 'waiting for orchestrator'}</small>
          </div>
        </div>
      )}

      <div className="ab-row ab-input">
        <div className="ab-head">{zh ? '输入重点' : 'INPUT'}</div>
        <div className="ab-chips">
          {spec.inputKeys.length === 0 && <span className="ab-empty">{zh ? '无采集字段' : 'no fields'}</span>}
          {spec.inputKeys.map((k) => (
            <span key={k} className="ab-chip">
              <i>{k}</i>
              <b className={intake[k] ? '' : 'ab-pending'}>{intake[k] || (zh ? '待采集' : '—')}</b>
            </span>
          ))}
        </div>
      </div>

      <BoardChart state={chartState} bars={bars} zh={zh} />

      <div className="ab-row ab-output">
        <div className="ab-head">{zh ? '输出重点' : 'OUTPUT'}</div>
        <div className="ab-kv">
          {outRows.length === 0 && <span className="ab-empty">{zh ? '无输出字段' : 'no fields'}</span>}
          {outRows.map(([k, v]) => (
            <div key={k} className="ab-kv-row">
              <span className="ab-kv-key">{k}</span>
              <span className={`ab-kv-val ${v ? '' : 'ab-pending'}`} title={v ?? undefined}>
                {v || fieldPlaceholder}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="ab-row ab-verdict">
        <div className="ab-head">{zh ? '判定结论' : 'VERDICT'}</div>
        <div className="ab-verdict-body">
          {lamp ? (
            <span className={`lamp-badge ${lamp}`}>
              {lamp === 'green'
                ? zh ? '绿灯 · 通过' : 'Pass'
                : lamp === 'yellow'
                  ? zh ? '黄灯 · 有条件通过' : 'Conditional'
                  : zh ? '红灯 · 不通过' : 'Blocked'}
            </span>
          ) : output ? (
            <span className="tag neutral">{zh ? '无灯色' : 'no lamp'}</span>
          ) : (
            <span className="tag neutral ab-pending">{pending}</span>
          )}
          <div className="ab-verdict-text">
            {verdictRows.every(([, v]) => !v) && <p className="ab-pending">{fieldPlaceholder}</p>}
            {verdictRows.map(([k, v]) => (
              v ? <p key={k} title={v}>{clamp(v, 64)}</p> : null
            ))}
          </div>
        </div>
      </div>

      {/* 结论正文（V4.4.9）：无展板数据时兜底渲染段落 markdown——保证「完成必可见结果」 */}
      {output?.summary?.trim() && (
        <div className="ab-row ab-summary">
          <div className="ab-head">{zh ? '结论正文' : 'DETAIL'}</div>
          <div className="md ab-summary-body">
            <Markdown remarkPlugins={[remarkGfm]}>{output.summary}</Markdown>
          </div>
        </div>
      )}
    </div>
  );
};

export default AgentBoard;
