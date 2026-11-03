import React from 'react';
import { useT } from '../../i18n';

/**
 * shared — 七块智能体结论展板的公共图元（展板海报式看板，bd- 体系）。
 *
 * 设计原则（用户敲定）：不要统一字段排版，每个 agent 结合自身业务语义
 * 出一块展板；专业、可指导下一步动作、重点突出；有数据的用图示化语言。
 * 本文件只放跨展板复用的小件：灯色徽章 / 分区头 / 量表条 / 大数字卡 /
 * 行动卡 + 容错取数工具。样式见 wx-v4.css 「结论展板」段。
 */

export type Lamp = 'green' | 'yellow' | 'red';
export type Tone = Lamp | 'neutral';

export const LAMP_TEXT: Record<Lamp, string> = {
  green: '绿灯 · 通过',
  yellow: '黄灯 · 有条件通过',
  red: '红灯 · 不通过',
};

export const LAMP_ACTION: Record<Lamp, string> = { green: '可推进', yellow: '条件推进', red: '终止' };

/* ── 容错取数：字段缺失/类型不对一律回空，绝不抛错 ── */

export function str(v: unknown): string {
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

/** 首个数字（"10.20%" → 10.2；布尔 → 0/1；对象 → null） */
export function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  const s = str(v);
  if (!s) return null;
  const m = s.match(/-?\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

export function arrOf(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v)
    ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x))
    : [];
}

export function objOf(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/** 结论层灯色（灯色 / 校验灯 / 顶层灯 三套字段名共用词表） */
export function lampOf(json: Record<string, unknown>): Lamp | null {
  for (const key of ['灯色', '校验灯', '顶层灯']) {
    const v = json[key];
    if (v === 'green' || v === 'yellow' || v === 'red') return v;
  }
  return null;
}

export const clampStr = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

/* ── 展板图元 ── */

/** 模块灯色徽章；big = 展板主灯（横幅右侧放大版） */
export function LampBadge({ lamp, big }: { lamp: Lamp | null; big?: boolean }) {
  if (!lamp) return null;
  return <span className={`lamp-badge ${lamp}${big ? ' bd-lamp-big' : ''}`}>{LAMP_TEXT[lamp]}</span>;
}

/** 展板分区：金色小标题 + 渐隐分隔线 + 可选右侧注记 */
export function BDSection({
  title,
  right,
  children,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bd-section">
      <div className="bd-section-head">
        <b>{title}</b>
        {right && <span className="bd-section-right">{right}</span>}
        <i className="bd-section-line" aria-hidden="true" />
      </div>
      {children}
    </div>
  );
}

/**
 * 水平量表条：fill 按值比例、marks 为阈值刻度（带下方标签）、
 * 数值标签跟随 fill 末端。value=null 渲染空轨道（占位不塌版）。
 */
export function ScoreBar({
  value,
  max = 100,
  marks = [],
  tone,
  showNum = true,
}: {
  value: number | null;
  max?: number;
  marks?: Array<{ at: number; label?: string }>;
  tone?: Tone;
  showNum?: boolean;
}) {
  const pct = value !== null ? Math.max(0, Math.min(1, value / max)) * 100 : 0;
  return (
    <div className="bd-bar">
      <div className="bd-bar-track">
        <div className={`bd-bar-fill ${tone === 'neutral' ? '' : (tone ?? '')}`} style={{ width: `${pct}%` }} />
        {marks.map((m, i) => (
          <span key={i} className="bd-bar-mark" style={{ left: `${(m.at / max) * 100}%` }}>
            {m.label && <i>{m.label}</i>}
          </span>
        ))}
        {showNum && value !== null && (
          <span className="bd-bar-num" style={{ left: `${Math.min(97, Math.max(3, pct))}%` }}>
            {value}
          </span>
        )}
      </div>
    </div>
  );
}

/** 大数字卡：label 小字 + value 大字 + 可选副注 */
export function StatNum({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: Tone;
}) {
  return (
    <div className={`bd-stat${tone && tone !== 'neutral' ? ` ${tone}` : ''}`}>
      <span className="bd-stat-label">{label}</span>
      <b className="bd-stat-value">{value || '—'}</b>
      {sub && <small className="bd-stat-sub">{sub}</small>}
    </div>
  );
}

/** 下一步动作卡（金色行动条）——每个展板的收尾都落在「可执行的下一步」 */
export function ActionCard({ children }: { children: React.ReactNode }) {
  const { lang } = useT();
  const zh = lang === 'zh';
  return (
    <div className="bd-action">
      <span className="bd-action-icon" aria-hidden="true">
        ⯈
      </span>
      <div className="bd-action-body">
        <b>{zh ? '下一步动作' : 'NEXT STEP'}</b>
        {children}
      </div>
    </div>
  );
}

/** 警示/提示横幅：tone red（否决）/ gold（关注）/ blue（说明） */
export function Banner({ tone, children }: { tone: 'red' | 'gold' | 'blue'; children: React.ReactNode }) {
  return <div className={`bd-banner ${tone}`}>{children}</div>;
}
