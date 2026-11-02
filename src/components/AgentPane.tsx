import React from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { AgentOutput } from '../types';
import { readLamp as readLampFromJson } from '../lib/pipeline';

/**
 * AgentPane — 选中智能体的结构化输出渲染器（V4.0 .agent-body 体系）。
 *
 * V3.0 时代的 tab 选择职责已移交 AgentsView 左栏 .agent-list，
 * 本组件只渲染「当前选中 agent」的输出：
 *
 *   summary（markdown）→ 关键字段（agentpane-row）→ 原始 JSON（折叠）
 *   无输出时渲染待命态（wx-empty）。
 *
 * AGENT_TABS / DEFAULT_AGENT_TAB 导出保持不变
 * （App.tsx 的 activeAgentTab 状态与全局搜索索引仍在使用）。
 */

export interface AgentTabDef {
  id: string;
  label: string;
  name: string;      // full Chinese name for the standby view
  emoji: string;
  role: string;      // one-line duty shown in standby view
  default?: boolean;
}

// 设计稿（大气版 V4.0）七大智能体命名：前置闸门 / 政策应答 / 多元融资 /
// 通用财务 / 失败校验 / 双层决策 / 成果交付。
// ⚠️ id 必须与后端 SSE 的 skillName 严格一致（agent1-固有对象 等），
//    否则 agent_output 事件匹配不上、输出丢失；name/role 走设计稿展示层。
export const AGENT_TABS: AgentTabDef[] = [
  { id: 'agent1-固有对象', label: '前置', name: '前置闸门智能体', emoji: '🏠', role: '固有对象 / 资产条件' },
  { id: 'agent2-政策应答', label: '政策', name: '政策应答智能体', emoji: '📑', role: '政策匹配 / 合规研判' },
  { id: 'agent3-多元融资', label: '融资', name: '多元融资智能体', emoji: '💰', role: '融资渠道 / 资金结构' },
  { id: 'agent4-财务模型', label: '财务', name: '通用财务智能体', emoji: '📊', role: '财务测算 / 投资回报' },
  { id: 'agent5-失败案例', label: '校验', name: '失败校验智能体', emoji: '⚠️', role: '失败案例 / 风险根因' },
  { id: 'agent6-双层决策', label: '决策', name: '双层决策智能体', emoji: '🚦', role: '顶层判断 / 维度子灯', default: true },
  { id: 'agent7-成果交付', label: '交付', name: '成果交付阶段', emoji: '📦', role: 'DELIVERY / 决策成果交付' },
];

export const DEFAULT_AGENT_TAB = AGENT_TABS.find((t) => t.default)?.id ?? AGENT_TABS[0].id;

type LampColor = 'green' | 'yellow' | 'red';

function readLamp(output: AgentOutput | undefined): LampColor | null {
  return readLampFromJson(output?.output_json);
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
      <div className="agentpane-row">
        <span className="agentpane-key">{k}</span>
        {isLamp ? (
          <span className={`lamp-badge ${text}`}>{LAMP_TEXT[text as LampColor]}</span>
        ) : (
          <span className="agentpane-val">{text}</span>
        )}
      </div>
    );
  }
  return (
    <div className="agentpane-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
      <span className="agentpane-key">{k}</span>
      <pre className="agentpane-json" style={{ width: '100%' }}>{JSON.stringify(v, null, 2)}</pre>
    </div>
  );
}

interface Props {
  outputs: Record<string, AgentOutput>;
  activeTab: string;
  /** tab 切换回调保留在接口里（当前布局由左栏触发），此处不再渲染 tabs */
  onTabChange?: (id: string) => void;
}

export const AgentPane: React.FC<Props> = ({ outputs, activeTab }) => {
  const current = outputs[activeTab];
  const activeMeta = AGENT_TABS.find((t) => t.id === activeTab) ?? AGENT_TABS[0];
  const activeLamp = readLamp(current);

  if (!current) {
    // 待命态：七 agent 体系在左栏始终可见，此处只提示等待编排
    return (
      <div className="wx-empty">
        <p className="eyebrow">STANDBY</p>
        <h3>{activeMeta.name}</h3>
        <p>{activeMeta.role}</p>
        <p className="dim">待命 · 等待编排器调度</p>
      </div>
    );
  }

  return (
    <div className="agent-body">
      <p className="eyebrow">{activeMeta.name} · OUTPUT</p>
      {activeLamp && <span className={`lamp-badge ${activeLamp}`}>{LAMP_TEXT[activeLamp]}</span>}

      {current.summary && (
        <div className="stream-msg">
          <div className="md">
            <Markdown remarkPlugins={[remarkGfm]}>{current.summary}</Markdown>
          </div>
        </div>
      )}

      {current.output_json && Object.keys(current.output_json).length > 0 && (
        <div className="agentpane-fields">
          {Object.entries(current.output_json).map(([k, v]) => (
            <FieldRow key={k} k={k} v={v} />
          ))}
        </div>
      )}

      <details>
        <summary className="dim" style={{ fontSize: 10, cursor: 'pointer', padding: '6px 0' }}>原始 JSON</summary>
        <pre className="agentpane-json">{JSON.stringify(current.output_json ?? {}, null, 2)}</pre>
      </details>
    </div>
  );
};

export default AgentPane;
