import React from 'react';
import type { AgentOutput } from '../types';
import styles from './AgentPane.module.css';

/**
 * AgentPane — the always-on "agent cockpit".
 *
 * Tabs follow the super-skill orchestrator's naming convention
 * (matches `detectSseEvent` regex `agent{1-6}-<中文名>` in
 * agents/chat/_stream.ts). Default tab is the synthesis agent (agent6).
 *
 * Each tab shows: summary card → lamp badge (灯色) → structured key/value
 * rendering of output_json → collapsible raw JSON. Tabs without output show
 * a standby placeholder so the 6-agent system is visible at all times.
 */

interface AgentTabDef {
  id: string;
  label: string;
  name: string;      // full Chinese name for the standby view
  emoji: string;
  role: string;      // one-line duty shown in standby view
  default?: boolean;
}

export const AGENT_TABS: AgentTabDef[] = [
  { id: 'agent6-双层决策', label: '决策', name: '双层决策', emoji: '🚦', role: '聚合全部下游输出，给出顶层灯色与四维子灯判定', default: true },
  { id: 'agent1-固有对象', label: '固有', name: '固有对象识别', emoji: '🏠', role: '产权 / 文保 / 物理参数三色灯判定' },
  { id: 'agent2-政策应答', label: '政策', name: '政策应答', emoji: '📑', role: '试点城市合规与政策门槛匹配' },
  { id: 'agent3-多元融资', label: '融资', name: '多元融资', emoji: '💰', role: '资本金与贷款结构组合方案' },
  { id: 'agent4-财务模型', label: '财务', name: '财务模型', emoji: '📊', role: 'IRR / NPV / 现金流测算' },
  { id: 'agent5-失败案例', label: '风险', name: '失败案例', emoji: '⚠️', role: '相似失败案例匹配与风险提示' },
];

export const DEFAULT_AGENT_TAB = AGENT_TABS.find(t => t.default)?.id ?? AGENT_TABS[0].id;

type LampColor = 'green' | 'yellow' | 'red';

function readLamp(output: AgentOutput | undefined): LampColor | null {
  if (!output) return null;
  const raw = output.output_json?.['灯色'];
  if (raw === 'green' || raw === 'yellow' || raw === 'red') return raw;
  return null;
}

const LAMP_TEXT: Record<LampColor, string> = {
  green: '绿灯 · 通过',
  yellow: '黄灯 · 有条件通过',
  red: '红灯 · 不通过',
};

/** Render one top-level field of output_json. */
function FieldRow({ k, v }: { k: string; v: unknown }) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
    const text = String(v);
    const isLamp = k === '灯色' && (text === 'green' || text === 'yellow' || text === 'red');
    return (
      <div className={styles.fieldRow}>
        <span className={styles.fieldKey}>{k}</span>
        {isLamp ? (
          <span className={`${styles.lampBadge} ${styles[`lamp_${text}`]}`}>
            {LAMP_TEXT[text as LampColor]}
          </span>
        ) : (
          <span className={styles.fieldVal}>{text}</span>
        )}
      </div>
    );
  }
  return (
    <div className={styles.fieldBlock}>
      <span className={styles.fieldKey}>{k}</span>
      <pre className={styles.fieldJson}>{JSON.stringify(v, null, 2)}</pre>
    </div>
  );
}

interface Props {
  outputs: Record<string, AgentOutput>;
  activeTab: string;
  onTabChange: (id: string) => void;
}

export const AgentPane: React.FC<Props> = ({ outputs, activeTab, onTabChange }) => {
  const current = outputs[activeTab];
  const activeMeta = AGENT_TABS.find(t => t.id === activeTab) ?? AGENT_TABS[0];
  const activeLamp = readLamp(current);

  return (
    <div className={styles.pane}>
      <div className={styles.tabs} role="tablist" aria-label="智能体输出">
        {AGENT_TABS.map(t => {
          const out = outputs[t.id];
          const lamp = readLamp(out);
          const dotCls = [
            styles.tabDot,
            out ? styles.tabDotDone : '',
            lamp === 'green' ? styles.dotGreen : '',
            lamp === 'yellow' ? styles.dotYellow : '',
            lamp === 'red' ? styles.dotRed : '',
          ].filter(Boolean).join(' ');
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={activeTab === t.id}
              onClick={() => onTabChange(t.id)}
              className={`${styles.tab} ${activeTab === t.id ? styles.tabActive : ''}`}
              title={out ? `${t.name} · 已完成` : `${t.name} · 待命`}
            >
              <span className={dotCls} />
              {t.emoji} {t.label}
            </button>
          );
        })}
      </div>

      <div className={styles.body}>
        {current ? (
          <>
            <div className={styles.headCard}>
              <div className={styles.headRow}>
                <span className={styles.headName}>{activeMeta.emoji} {activeMeta.name}</span>
                {activeLamp && (
                  <span className={`${styles.lampBadge} ${styles[`lamp_${activeLamp}`]}`}>
                    {LAMP_TEXT[activeLamp]}
                  </span>
                )}
              </div>
              {current.summary && <p className={styles.summary}>{current.summary}</p>}
            </div>

            <div className={styles.fields}>
              {Object.entries(current.output_json ?? {}).map(([k, v]) => (
                <FieldRow key={k} k={k} v={v} />
              ))}
            </div>

            <details className={styles.raw}>
              <summary className={styles.rawToggle}>原始 JSON</summary>
              <pre className={styles.rawJson}>
                {JSON.stringify(current.output_json, null, 2)}
              </pre>
            </details>
          </>
        ) : (
          <div className={styles.standby}>
            <span className={styles.standbyEmoji}>{activeMeta.emoji}</span>
            <p className={styles.standbyName}>{activeMeta.name}</p>
            <p className={styles.standbyRole}>{activeMeta.role}</p>
            <p className={styles.standbyHint}>
              <span className={styles.standbyBlink} />
              待命 · 等待编排器调度
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default AgentPane;
