import React, { useMemo } from 'react';
import type { AgentOutput, Message } from '../types';
import { readLamp } from '../lib/pipeline';
import { buildConclusionMatrix } from '../lib/conclusionMatrix';
import { AGENT_TABS } from './AgentPane';
import ConclusionMatrix from './ConclusionMatrix';
import { useT } from '../i18n';

/**
 * AgentBoard —— 中栏结论看板（V4.2）。
 *
 * 有结构化结论数据时优先渲染核心结论模块（ConclusionMatrix，
 * 对齐设计稿红框形式：清单主表 + 选中条目详情）；凑不出矩阵时
 * 回退 V4.1 三段式固定版式：
 *   输入重点 —— 从首条用户消息解析出的项目采集字段 chips
 *   输出重点 —— 该 agent output_json 的优先关键字段（最多 6 条）
 *   判定结论 —— 灯色徽章 + 该 agent 自身的结论/建议字段
 *
 * agent 还在跑时以 per-agent 小动效替代（agent-motion--a1..a7），
 * 空闲无输出时显示待命态。所有提取都是展示层容错：缺字段直接不渲染。
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

const clamp = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

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

/** 按 keys 优先序从平铺池抽 kv（子串匹配；跳过内部字段与灯色，灯色走徽章） */
function pickFields(pool: Record<string, unknown>, keys: string[], limit: number): Array<[string, string]> {
  const rows: Array<[string, string]> = [];
  const used = new Set<string>();
  for (const key of keys) {
    const hit = Object.keys(pool).find(
      (k) => !used.has(k) && !k.includes('灯') && k.includes(key),
    );
    if (hit) {
      const val = clamp(fmtValue(pool[hit]), 80);
      if (val) {
        rows.push([hit, val]);
        used.add(hit);
      }
    }
    if (rows.length >= limit) break;
  }
  return rows;
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
  const outRows = useMemo(() => pickFields(pool, spec.outputKeys, 6), [pool, spec]);
  const verdictRows = useMemo(() => pickFields(pool, spec.verdictKeys, 2), [pool, spec]);

  // 核心结论矩阵（V4.2）：output_json 优先，缺失时从 summary 的结论 JSON /
  // markdown 表格提取；凑不出矩阵（返回 null）走三段式回退版式
  const matrix = useMemo(
    () => buildConclusionMatrix(activeAgentId, output?.output_json, output?.summary),
    [activeAgentId, output],
  );

  const running = loading && !output;

  // —— 运行态：per-agent 小动效 ——
  if (running) {
    return (
      <div className="agent-board">
        <div className={`agent-motion agent-motion--a${idx + 1}`}>
          <div className="motion-art">
            {idx === 0 && <span className="art-emoji art-gate">🏠</span>}
            {idx === 1 && <span className="art-emoji art-flip">📑</span>}
            {idx === 2 && <span className="art-emoji art-coin">💰</span>}
            {idx === 3 && (
              <span className="art-bars">
                <i /><i /><i />
              </span>
            )}
            {idx === 4 && (
              <span className="art-radar">
                <i className="ring" />
                <i className="sweep" />
                <span className="core">⚠</span>
              </span>
            )}
            {idx === 5 && <span className="art-emoji art-crane">🏗️</span>}
            {idx === 6 && (
              <span className="art-lamps">
                <i /><i /><i />
              </span>
            )}
          </div>
          <div className="motion-label">
            {meta?.name} · {zh ? '执行中' : 'running'}
          </div>
          <div className="motion-hint">{spec.motion}</div>
          <div className="motion-bar"><span /></div>
        </div>
      </div>
    );
  }

  // —— 空闲待命态 ——
  if (!output) {
    return (
      <div className="agent-board">
        <div className="ab-idle">
          <span className="ab-idle-mark">{meta?.emoji}</span>
          <p>{zh ? '该智能体待命。发送项目信息后，这里展示它的输入、输出与判定。' : 'Standby. Send a project to see input, output and verdict here.'}</p>
        </div>
      </div>
    );
  }

  // —— 核心结论模块态：矩阵优先（对齐设计稿红框呈现） ——
  if (matrix) {
    return (
      <div className="agent-board">
        <ConclusionMatrix model={matrix} />
      </div>
    );
  }

  // —— 回退：三段固定版式 ——
  const inputChips = spec.inputKeys.filter((k) => intake[k]);
  return (
    <div className="agent-board">
      <div className="ab-row ab-input">
        <div className="ab-head">{zh ? '输入重点' : 'INPUT'}</div>
        <div className="ab-chips">
          {inputChips.length === 0 && <span className="ab-empty">{zh ? '未解析到采集字段' : 'no parsed fields'}</span>}
          {inputChips.map((k) => (
            <span key={k} className="ab-chip">
              <i>{k}</i>
              <b>{intake[k]}</b>
            </span>
          ))}
        </div>
      </div>

      <div className="ab-row ab-output">
        <div className="ab-head">{zh ? '输出重点' : 'OUTPUT'}</div>
        <div className="ab-kv">
          {outRows.length === 0 && <span className="ab-empty">{zh ? '暂无结构化字段' : 'no fields'}</span>}
          {outRows.map(([k, v]) => (
            <div key={k} className="ab-kv-row">
              <span className="ab-kv-key">{k}</span>
              <span className="ab-kv-val" title={v}>{v}</span>
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
          ) : (
            <span className="tag neutral">{zh ? '无灯色' : 'no lamp'}</span>
          )}
          <div className="ab-verdict-text">
            {verdictRows.length === 0 && <span className="ab-empty">{zh ? '暂无结论字段' : 'no verdict'}</span>}
            {verdictRows.map(([k, v]) => (
              <p key={k} title={v}>{clamp(v, 64)}</p>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AgentBoard;
