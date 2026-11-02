import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReportReady, SuggestAction, Message, AgentOutput } from '../types';
import { useT } from '../i18n';
import {
  collectConclusionData,
  buildGovDoc,
  buildInvestDoc,
  buildFullDoc,
  buildScriptDoc,
  downloadDoc,
} from '../lib/exportDocs';

// ── 演示数据（决赛路演：未跑 agent 时预填，对齐大气版 V4.0 设计稿）──

// 演示下一步行动（对齐设计稿 action-row 4 步）
const DEMO_ACTIONS: SuggestAction[] = [
  { id: 'demo-01', emoji: '①', title: '补充产权与资产边界资料', description: '补齐产权、文保、经营前置条件的关键证明材料' },
  { id: 'demo-02', emoji: '②', title: '完成融资渠道与资金结构核验', description: '锁定资本金比例与贷款结构组合方案' },
  { id: 'demo-03', emoji: '③', title: '深化财务假设与敏感性分析', description: '对租金、出租率、折现率做敏感性压力测试' },
  { id: 'demo-04', emoji: '④', title: '组织人工复核并形成上会材料', description: '人工确认关键判定后输出正式上会报告' },
];

/**
 * ConclusionView — V4.1 综合结论屏：高度浓缩的结论看板（整页锁视口高，无瀑布流）。
 *
 *   .conclusion-topline — eyebrow + 标题 | 演示 tag + 「导出结论」下拉
 *   .conclusion-hero    — 一句话结论 + 说明 | 金色大评级
 *   .summary-kpis       — 四格核心指标（IRR / NPV / 回收期 / 综合评级）
 *   .conclusion-lower   — 左：双层决策四维子灯；右：下一步行动
 *
 * 「导出结论」下拉三件套（lib/exportDocs）：
 *   政府版上会文件 / 投资版上会文件 / 详细推演脚本
 */
interface Props {
  report: ReportReady | null;
  suggestActions: SuggestAction[];
  onSuggestAction: (action: SuggestAction) => void;
  messages: Message[];
  /** 七 agent 结构化输出（评级/四维灯/KPI 数据源，App.tsx 传入） */
  outputs: Record<string, AgentOutput>;
  /** 「查看双层决策依据」→ 跳回智能体页 */
  onOpenAgents?: () => void;
}

export const ConclusionView: React.FC<Props> = ({
  report,
  suggestActions,
  onSuggestAction,
  outputs,
  onOpenAgents,
}) => {
  const { t, lang } = useT();
  const zh = lang === 'zh';

  // 演示态：未跑 agent（outputs 空且无 report）时预填演示数据
  const isDemo = Object.keys(outputs).length === 0 && !report;
  const actions = isDemo ? DEMO_ACTIONS : suggestActions;

  // 结论看板口径（真实输出优先，演示回退）——导出文档共用同一份数据
  const data = useMemo(
    () => collectConclusionData(outputs, actions, isDemo),
    [outputs, actions, isDemo],
  );

  // —— 导出下拉：外点关闭 ——
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuOpen]);

  const handleExport = useCallback((kind: 'gov' | 'invest' | 'full' | 'script') => {
    setMenuOpen(false);
    const date = new Date().toISOString().slice(0, 10);
    if (kind === 'gov') {
      downloadDoc(`${date}-政府版上会文件-${data.projectName}.html`, buildGovDoc(data), 'text/html');
    } else if (kind === 'invest') {
      downloadDoc(`${date}-投资版上会文件-${data.projectName}.html`, buildInvestDoc(data), 'text/html');
    } else if (kind === 'full') {
      downloadDoc(`${date}-完整结论文件-${data.projectName}.html`, buildFullDoc(data), 'text/html');
    } else {
      downloadDoc(`${date}-详细推演脚本-${data.projectName}.md`, buildScriptDoc(data), 'text/markdown');
    }
  }, [data]);

  const lampText = (lamp: 'green' | 'yellow' | 'red' | null) =>
    lamp === 'green' ? (zh ? '通过' : 'PASS')
    : lamp === 'yellow' ? (zh ? '有条件' : 'COND')
    : lamp === 'red' ? (zh ? '不通过' : 'BLOCK')
    : (zh ? '待命' : '—');

  // conclusion-screen：整页锁视口高，内容浓缩不滚动
  return (
    <section className="screen active conclusion-screen">
      <div className="shell">
        {/* —— 页眉：与其他屏同构（eyebrow + 主题词 + 副题），高度与位置一致 —— */}
        <div className="page-head">
          <div style={{ minWidth: 0 }}>
            <p className="eyebrow">06 / EXECUTIVE CONCLUSION</p>
            <h1>{zh ? '项目综合决策结论' : 'Executive Conclusion'}</h1>
            <p>{t('app.subtitle')}</p>
          </div>
          <div className="conclusion-topline-right">
            {isDemo && <span className="tag warn">{zh ? '演示数据 · 非正式投资意见' : 'DEMO DATA'}</span>}
            <div className="export-wrap" ref={menuRef}>
              <button
                type="button"
                className="btn primary export-btn"
                onClick={() => setMenuOpen((v) => !v)}
                aria-expanded={menuOpen}
                aria-haspopup="menu"
              >
                {zh ? '导出结论' : 'EXPORT'} <span aria-hidden="true">▾</span>
              </button>
              {menuOpen && (
                <div className="export-menu" role="menu">
                  <button type="button" role="menuitem" onClick={() => handleExport('gov')}>
                    <b>🏛 {zh ? '政府版上会文件' : 'Government briefing'}</b>
                    <small>{zh ? '政策合规 · 前置核验 · 下一步工作' : 'policy & compliance'}</small>
                  </button>
                  <button type="button" role="menuitem" onClick={() => handleExport('invest')}>
                    <b>📈 {zh ? '投资版上会文件' : 'Investment briefing'}</b>
                    <small>{zh ? '回报指标 · 融资测算 · 风险提示' : 'returns & risks'}</small>
                  </button>
                  <button type="button" role="menuitem" onClick={() => handleExport('full')}>
                    <b>📋 {zh ? '完整结论文件' : 'Full conclusion report'}</b>
                    <small>{zh ? '结论 · 指标 · 维度 · 风险 · 行动全要素（易读排版）' : 'all-in-one readable report'}</small>
                  </button>
                  <button type="button" role="menuitem" onClick={() => handleExport('script')}>
                    <b>📜 {zh ? '详细推演脚本' : 'Full reasoning script'}</b>
                    <small>{zh ? '七智能体完整输出与推演过程（Markdown）' : 'full agent outputs'}</small>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* —— hero：一句话结论 + 金色大评级 —— */}
        <div className="conclusion-hero">
          <div style={{ minWidth: 0 }}>
            <p className="eyebrow">DECISION SUMMARY / {data.projectName}</p>
            <h2 className="verdict-line">{data.verdictLine}</h2>
            <p className="muted" style={{ fontSize: 12, margin: '0 0 14px', maxWidth: 520 }}>{data.verdictNote}</p>
            <button type="button" className="btn ghost" onClick={onOpenAgents} disabled={!onOpenAgents}>
              {zh ? '查看双层决策依据 →' : 'View dual-layer basis →'}
            </button>
          </div>
          <div className="conclusion-grade">
            <strong>{data.grade}</strong>
            <small>{zh ? '投资建设评级 · 原型示意' : 'OVERALL GRADE'}</small>
            <small>{zh ? `建议口径：${data.gradeLamp === 'green' ? '有序推进' : data.gradeLamp === 'red' ? '暂缓推进' : '有条件推进'}` : ''}</small>
          </div>
        </div>

        {/* —— 四格核心指标 —— */}
        <div className="summary-kpis">
          {data.kpis.map((k) => (
            <div key={k.label} className="summary-kpi">
              <b>{k.value}</b>
              <small>{k.label}</small>
              <small className="dim" style={{ marginTop: 3, display: 'block' }}>{k.sub}</small>
            </div>
          ))}
        </div>

        <div className="conclusion-lower">
          {/* —— 左：双层决策 · 维度子灯 —— */}
          <div className="panel decision-summary">
            <div className="panel-head">
              <div>
                <div className="panel-title">{zh ? '双层决策 · 维度子灯' : 'DUAL-LAYER DIMENSIONS'}</div>
                <div className="panel-sub">{zh ? '大能力评分权重在 Agent 决策链路中保留' : 'weighted sub-lamps'}</div>
              </div>
              {report && <span className="tag neutral">{report.report_type}</span>}
            </div>
            <div className="decision-dims" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
              {data.dims.map((dim) => (
                <div key={dim.key} className="decision-dim">
                  <b>{dim.label}</b>
                  <strong
                    className={dim.lamp === 'green' ? '' : dim.lamp === 'yellow' ? 'warn' : dim.lamp === 'red' ? 'bad' : ''}
                    style={dim.lamp ? undefined : { color: '#718395' }}
                  >
                    {lampText(dim.lamp)}
                  </strong>
                </div>
              ))}
            </div>
            <p className="muted" style={{ fontSize: 10, margin: '10px 0 0' }}>
              {zh
                ? '采用四维灯展示：大能力评分权重在 Agent 决策链路中保留，总投资等级 B+ 与维度状态真灯分维度走势不同判断。'
                : 'Four-dimension lamps; the overall grade aggregates all agent verdicts.'}
            </p>
          </div>

          {/* —— 右：下一步行动 —— */}
          <div className="panel decision-summary">
            <div className="panel-head">
              <div>
                <div className="panel-title">{zh ? '下一步行动' : 'NEXT ACTIONS'}</div>
              </div>
              <span className="tag neutral">{zh ? '建议事项' : 'SUGGESTED'}</span>
            </div>
            {actions.length > 0 ? (
              actions.map((action, i) => (
                <button
                  key={action.id}
                  type="button"
                  className="action-row"
                  style={{ background: 'none', border: 0, borderBottom: '1px solid #2a3e50', width: '100%', cursor: 'pointer', textAlign: 'left' }}
                  onClick={() => onSuggestAction(action)}
                  title={action.description}
                >
                  <b>0{i + 1}</b>
                  <span style={{ flex: 1 }}>{action.title}</span>
                  <span aria-hidden="true">→</span>
                </button>
              ))
            ) : (
              <p className="muted" style={{ fontSize: 10 }}>
                {zh ? '报告生成后将给出重新运行、导出等建议动作。' : 'Suggested actions appear after the report is ready.'}
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

export default ConclusionView;
