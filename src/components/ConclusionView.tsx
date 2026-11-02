import React, { useCallback } from 'react';
import type { ReportReady, SuggestAction, Message, AgentOutput } from '../types';
import { useT } from '../i18n';
import ChatWindow from './ChatWindow';
import { AGENT_TABS } from './AgentPane';
import { readLamp } from '../lib/pipeline';

// ── 演示数据（决赛路演：未跑 agent 时预填，对齐大气版 V4.0 设计稿）──
// 六维子灯演示值（A1-A6，对应综合评级 B+ · 黄灯 · 建议上会）
const DEMO_LAMPS: Record<string, 'green' | 'yellow' | 'red'> = {
  'agent1-固有对象': 'yellow',
  'agent2-政策应答': 'green',
  'agent3-多元融资': 'yellow',
  'agent4-财务模型': 'green',
  'agent5-失败案例': 'yellow',
  'agent6-双层决策': 'yellow',
};

// 演示下一步行动（对齐设计稿 action-row 4 步）
const DEMO_ACTIONS: SuggestAction[] = [
  { id: 'demo-01', emoji: '①', title: '补充产权与资产边界资料', description: '补齐产权、文保、经营前置条件的关键证明材料' },
  { id: 'demo-02', emoji: '②', title: '完成融资渠道与资金结构核验', description: '锁定资本金比例与贷款结构组合方案' },
  { id: 'demo-03', emoji: '③', title: '深化财务假设与敏感性分析', description: '对租金、出租率、折现率做敏感性压力测试' },
  { id: 'demo-04', emoji: '④', title: '组织人工复核并形成上会材料', description: '人工确认关键判定后输出正式上会报告' },
];

// 演示决策报告 HTML（内部决策版，含评级 / KPI / 维度子灯）
const DEMO_REPORT_HTML = `<div style="font-family:-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;color:#d6dee8;line-height:1.7">
<h2 style="font-size:16px;margin:0 0 12px;color:#dfb878">综合决策结论 · 重庆嘉陵五村 26 号</h2>
<div style="background:#12202e;border:1px solid #2a3e50;border-radius:6px;padding:12px 14px;margin-bottom:12px">
  <div style="font-size:11px;color:#718395">综合评级</div>
  <div style="font-size:28px;color:#dfb878;font-weight:700">B+ <span style="font-size:12px;color:#b6c2cf;font-weight:400">· 建议上会 · 黄灯</span></div>
  <div style="font-size:11px;color:#718395;margin-top:6px">人工确认前不构成正式决策</div>
</div>
<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:12px">
  <div style="background:#0e1a26;border-radius:6px;padding:10px"><div style="font-size:10px;color:#718395">IRR 内部收益率</div><div style="font-size:18px;color:#dfb878">36.35%</div></div>
  <div style="background:#0e1a26;border-radius:6px;padding:10px"><div style="font-size:10px;color:#718395">NPV 净现值</div><div style="font-size:18px;color:#dfb878">+2,996.6 万</div></div>
  <div style="background:#0e1a26;border-radius:6px;padding:10px"><div style="font-size:10px;color:#718395">投资回收期</div><div style="font-size:18px;color:#dfb878">2.75 年</div></div>
  <div style="background:#0e1a26;border-radius:6px;padding:10px"><div style="font-size:10px;color:#718395">决策维度</div><div style="font-size:18px;color:#dfb878">六维判定</div></div>
</div>
<div style="font-size:11px;color:#b6c2cf">
  <div style="color:#718395;margin-bottom:6px">维度子灯</div>
  <div style="display:flex;flex-wrap:wrap;gap:6px">
    <span style="padding:2px 8px;border-radius:3px;background:#3a2f1f;color:#dfb878">前置闸门 · 黄</span>
    <span style="padding:2px 8px;border-radius:3px;background:#16311f;color:#7fd6a0">政策应答 · 绿</span>
    <span style="padding:2px 8px;border-radius:3px;background:#3a2f1f;color:#dfb878">多元融资 · 黄</span>
    <span style="padding:2px 8px;border-radius:3px;background:#16311f;color:#7fd6a0">通用财务 · 绿</span>
    <span style="padding:2px 8px;border-radius:3px;background:#3a2f1f;color:#dfb878">失败校验 · 黄</span>
    <span style="padding:2px 8px;border-radius:3px;background:#3a2f1f;color:#dfb878">双层决策 · 黄</span>
  </div>
</div>
</div>`;

/**
 * ConclusionView — V4.0 大气版综合结论屏。
 *
 * 结构与设计稿 1:1：
 *   .conclusion-hero  —— 地图背景 + 左深右透渐变 + 金色大评级
 *   .summary-kpis     —— 四格核心指标（前三格为决赛演示口径 K3 原值：
 *                        IRR 36.35% / NPV +2996.6万 / 回收期 2.75年，
 *                        与决赛故事稿一致；第四格动态反映报告生成状态）
 *   .conclusion-lower —— 六维子灯（真实 agentOutputs 的 readLamp，无输出显示待命）
 *                        + 下一步行动（SuggestActions → action-row）
 *   .report-paper     —— 后端 report_ready 的真实 HTML 报告（可下载）
 *   ChatWindow        —— 分析过程回放
 */
interface Props {
  report: ReportReady | null;
  suggestActions: SuggestAction[];
  onSuggestAction: (action: SuggestAction) => void;
  messages: Message[];
  /** 七 agent 结构化输出（维度子灯数据源，App.tsx 传入；agent7 为成果交付） */
  outputs: Record<string, AgentOutput>;
}

export const ConclusionView: React.FC<Props> = ({
  report,
  suggestActions,
  onSuggestAction,
  messages,
  outputs,
}) => {
  const { t, lang } = useT();

  const handleDownload = useCallback(() => {
    if (!report) return;
    const blob = new Blob([report.html_content], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const date = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `${date}-${report.report_type}-报告.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [report]);

  // 演示态：未跑 agent（outputs 空且无 report）时预填演示数据
  const isDemo = Object.keys(outputs).length === 0 && !report;
  const hasReport = Boolean(report) || isDemo;
  const actions = isDemo ? DEMO_ACTIONS : suggestActions;

  // 决赛演示口径（K3 原值，与故事稿一致）
  const kpis = [
    { label: 'IRR 内部收益率', value: '36.35%', sub: 'IRR · 10Y' },
    { label: 'NPV 净现值', value: '+2,996.6', sub: '万元 · NPV @8%' },
    { label: '投资回收期', value: '2.75', sub: '年 · PAYBACK' },
    hasReport
      ? report
        ? { label: t('conclusion.download'), value: report.report_type, sub: 'REPORT READY' }
        : { label: lang === 'zh' ? '决策报告' : 'Report', value: lang === 'zh' ? '内部决策版' : 'Internal', sub: 'REPORT READY' }
      : { label: lang === 'zh' ? '决策报告' : 'Report', value: '—', sub: 'PENDING' },
  ];

  const lampText = (lamp: 'green' | 'yellow' | 'red' | null) =>
    lamp === 'green' ? (lang === 'zh' ? '通过' : 'PASS')
    : lamp === 'yellow' ? (lang === 'zh' ? '有条件' : 'COND')
    : lamp === 'red' ? (lang === 'zh' ? '不通过' : 'BLOCK')
    : (lang === 'zh' ? '待命' : '—');

  return (
    <section className="screen active">
      <div className="shell">
        {/* —— V4.0 hero：地图底 + 金色评级 —— */}
        <div className="conclusion-hero">
          <div style={{ minWidth: 0 }}>
            <p className="eyebrow">{t('conclusion.eyebrow')}</p>
            <h2>{t('conclusion.title')}</h2>
            <p className="muted" style={{ fontSize: 12, margin: 0 }}>{t('app.subtitle')}</p>
          </div>
          <div className="conclusion-grade">
            <strong>B+</strong>
            <small>{lang === 'zh' ? '综合评级 · 建议上会' : 'OVERALL GRADE'}</small>
          </div>
        </div>

        {/* —— 四格核心指标 —— */}
        <div className="summary-kpis">
          {kpis.map((k) => (
            <div key={k.label} className="summary-kpi">
              <b>{k.value}</b>
              <small>{k.label}</small>
              <small className="dim" style={{ marginTop: 3, display: 'block' }}>{k.sub}</small>
            </div>
          ))}
        </div>

        <div className="conclusion-lower">
          {/* —— 左：六维子灯（真实 agent 输出） —— */}
          <div className="panel decision-summary">
            <div className="panel-head">
              <div>
                <div className="panel-title">{lang === 'zh' ? '决策维度 · 六维判定' : 'DECISION DIMENSIONS'}</div>
                <div className="panel-sub">{lang === 'zh' ? 'readLamp 三色灯实时判定' : 'traffic-light verdicts'}</div>
              </div>
            </div>
            <div className="decision-dims" style={{ gridTemplateColumns: 'repeat(6, minmax(0, 1fr))' }}>
              {AGENT_TABS.filter((a) => a.id !== 'agent6-双层决策' && a.id !== 'agent7-成果交付').concat(
                AGENT_TABS.filter((a) => a.id === 'agent6-双层决策'),
              ).map((a) => {
                const lamp = isDemo ? DEMO_LAMPS[a.id] : readLamp(outputs[a.id]?.output_json);
                const done = isDemo || Boolean(outputs[a.id]);
                const strongCls = lamp === 'green' ? '' : lamp === 'yellow' ? 'warn' : lamp === 'red' ? 'bad' : '';
                return (
                  <div key={a.id} className="decision-dim">
                    <b>{a.name}</b>
                    <strong className={done ? strongCls : ''} style={done ? undefined : { color: '#718395' }}>
                      {lampText(done ? lamp : null)}
                    </strong>
                  </div>
                );
              })}
            </div>

            <hr className="rule" />

            <div className="panel-head" style={{ marginBottom: 6 }}>
              <div>
                <div className="panel-title">{lang === 'zh' ? '下一步行动' : 'NEXT ACTIONS'}</div>
              </div>
              {report && (
                <button type="button" className="btn primary" onClick={handleDownload}>
                  ⬇ {t('conclusion.download')}
                </button>
              )}
            </div>
            {actions.length > 0 ? (
              actions.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  className="action-row"
                  style={{ background: 'none', border: 0, borderBottom: '1px solid #2a3e50', width: '100%', cursor: 'pointer', textAlign: 'left' }}
                  onClick={() => onSuggestAction(action)}
                  title={action.description}
                >
                  <b>{action.emoji} {action.title}</b>
                  <span style={{ flex: 1 }}>{action.description}</span>
                  <span aria-hidden="true">→</span>
                </button>
              ))
            ) : (
              <p className="muted" style={{ fontSize: 10 }}>
                {lang === 'zh' ? '报告生成后将给出重新运行、导出等建议动作。' : 'Suggested actions appear after the report is ready.'}
              </p>
            )}
          </div>

          {/* —— 右：报告 —— */}
          <div className="panel decision-summary">
            <div className="panel-head">
              <div>
                <div className="panel-title">{lang === 'zh' ? '决策报告' : 'REPORT'}</div>
                <div className="panel-sub">{hasReport ? (report?.report_type ?? (lang === 'zh' ? '内部决策版' : 'Internal Decision')) : t('conclusion.emptyHint')}</div>
              </div>
              {hasReport && <span className="tag good">READY</span>}
            </div>
            {hasReport ? (
              <div
                className="report-paper"
                dangerouslySetInnerHTML={{ __html: report?.html_content ?? DEMO_REPORT_HTML }}
                style={{ maxHeight: 420 }}
              />
            ) : (
              <div className="wx-empty" style={{ minHeight: 200 }}>
                <p className="eyebrow">PENDING</p>
                <h3>{t('conclusion.emptyTitle')}</h3>
                <p>{t('conclusion.emptyHint')}</p>
              </div>
            )}
          </div>
        </div>

        {/* —— 分析过程回放 —— */}
        {messages.length > 0 && (
          <div className="panel" style={{ marginTop: 13, padding: 18, display: 'flex', flexDirection: 'column', maxHeight: 460 }}>
            <div className="panel-head">
              <div>
                <div className="panel-title">{t('conclusion.chatTitle')}</div>
              </div>
            </div>
            <div style={{ minHeight: 0, flex: 1, display: 'flex' }}>
              <ChatWindow messages={messages} loading={false} />
            </div>
          </div>
        )}

        <p className="footer-note">{t('welcome.foot')}</p>
      </div>
    </section>
  );
};

export default ConclusionView;
