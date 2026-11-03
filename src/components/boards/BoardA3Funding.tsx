import React from 'react';
import { useT } from '../../i18n';
import {
  BDSection, ActionCard, Banner, LampBadge, ScoreBar, arrOf, clampStr, lampOf, num, objOf, str,
} from './shared';

/**
 * BoardA3Funding — A3 多元融资（agent3-多元融资）专属展板。
 *
 * 业务语义：融资可行性灯 + 推荐资金组合（agent4 的直接输入）+ 工具清单
 * + 覆盖率（≥0.7 → green，<0.7 → yellow，0 工具 → red）。
 * 展板 = 判定横幅 + 资金结构堆叠条 + 覆盖率量尺 + 工具对比表 + 剔除风险。
 */

/** 推荐组合「专项债 30% + 银行开发贷 50% + 自有资金 20%」解析为堆叠段 */
function parseCombo(combo: string): Array<{ name: string; pct: number }> {
  const body = combo.split(/[,，;；]/)[0] ?? '';
  const segs = [...body.matchAll(/([^\d+%+]+?)\s*(\d+(?:\.\d+)?)\s*%/g)]
    .map((m) => ({ name: m[1].trim().replace(/^[+\s]+|[+\s]+$/g, ''), pct: parseFloat(m[2]) }))
    .filter((s) => s.name && !s.name.includes('利率') && s.pct > 0 && s.pct <= 100);
  const sum = segs.reduce((acc, s) => acc + s.pct, 0);
  return sum > 0 ? segs : [];
}

const SEG_CLASS = ['c0', 'c1', 'c2', 'c3', 'c4'];

export const BoardA3Funding: React.FC<{ json: Record<string, unknown> }> = ({ json }) => {
  const { lang } = useT();
  const zh = lang === 'zh';

  const lamp = lampOf(json);
  const combo = str(json['推荐资金组合']);
  const segs = parseCombo(combo);
  const rate = combo.match(/综合利率\s*([\d.]+\s*%?)/)?.[1];
  const tools = arrOf(json['可适用融资工具清单']);
  const risks = (Array.isArray(json['关键审批风险点']) ? json['关键审批风险点'] : []).map(str).filter(Boolean);
  const calc = objOf(json['_calc']);
  const coverage = num(calc['coverage_ratio']); // 0-1，灯色判据 0.7
  const candidates = num(calc['candidate_count']);
  const action = str(json['建议动作']);
  const covPct = coverage !== null ? Math.round(coverage * 100) : null;
  const covTone = covPct === null ? undefined : covPct >= 70 ? 'green' : 'yellow';

  return (
    <div className="bd">
      <div className={`bd-hero ${lamp ?? ''}`}>
        <div className="bd-hero-main">
          <p className="eyebrow">FUNDING STRUCTURE · 融资可行性</p>
          <div className="bd-hero-title">
            {segs.length > 0
              ? `${segs.length} 项资金来源${rate ? ` · 综合利率 ${rate}` : ''}`
              : lamp
                ? (zh ? '融资方案研判' : 'funding review')
                : '—'}
          </div>
          <div className="bd-hero-sub">
            {candidates !== null && `${zh ? '候选工具' : 'candidates'} ${candidates}`}
            {covPct !== null && ` · ${zh ? '资金覆盖率' : 'coverage'} ${covPct}%`}
            {lamp === 'yellow' && ` · ${zh ? '覆盖率不足 0.7，判黄' : 'below 0.7'}`}
            {lamp === 'red' && ` · ${zh ? '无可行工具组合' : 'no viable mix'}`}
          </div>
        </div>
        <LampBadge lamp={lamp} big />
      </div>

      <BDSection title={zh ? '推荐资金组合' : 'RECOMMENDED MIX'}>
        {segs.length > 0 ? (
          <>
            <div className="bd-stack">
              {segs.map((s, i) => (
                <span
                  key={`${s.name}-${i}`}
                  className={`bd-seg ${SEG_CLASS[i % SEG_CLASS.length]}`}
                  style={{ width: `${s.pct}%` }}
                  title={`${s.name} ${s.pct}%`}
                >
                  {s.pct >= 12 ? `${s.pct}%` : ''}
                </span>
              ))}
            </div>
            <div className="bd-legend">
              {segs.map((s, i) => (
                <span key={`${s.name}-${i}`}>
                  <i className={SEG_CLASS[i % SEG_CLASS.length]} />
                  {s.name} {s.pct}%
                </span>
              ))}
              {rate && <span className="bd-chip gold">综合利率 {rate}</span>}
            </div>
          </>
        ) : combo ? (
          <p className="bd-note">{combo}</p>
        ) : (
          <p className="bd-note">{zh ? '推荐组合未输出' : 'mix not emitted'}</p>
        )}
      </BDSection>

      {covPct !== null && (
        <BDSection
          title={zh ? '资金覆盖能力' : 'COVERAGE'}
          right={<span>{zh ? '灯色判据：覆盖率 ≥ 0.7 为绿' : 'green threshold 0.7'}</span>}
        >
          <ScoreBar
            value={covPct}
            tone={covTone}
            marks={[{ at: 70, label: zh ? '0.7 门槛' : '0.7' }]}
          />
        </BDSection>
      )}

      {tools.length > 0 && (
        <BDSection title={zh ? `融资工具对比 · ${tools.length}` : 'INSTRUMENTS'}>
          <div className="bd-tools">
            <div className="bd-tools-row head">
              <span>{zh ? '工具' : 'INSTRUMENT'}</span>
              <span>{zh ? '资金成本' : 'COST'}</span>
              <span>{zh ? '期限' : 'TERM'}</span>
              <span>{zh ? '综合分' : 'SCORE'}</span>
            </div>
            {tools.map((t, i) => {
              const name = str(t['工具名称']) || `${zh ? '工具' : 'Tool'} ${i + 1}`;
              const cost = str(t['资金成本']);
              const term = str(t['期限']);
              const score = num(t['综合分']);
              const tone = score === null ? undefined : score >= 75 ? 'green' : score >= 60 ? 'yellow' : 'red';
              return (
                <div key={`${name}-${i}`} className="bd-tools-row" title={name}>
                  <span className="bd-tools-name">{clampStr(name, 22)}</span>
                  <span title={cost}>{clampStr(cost, 18) || '—'}</span>
                  <span>{clampStr(term, 10) || '—'}</span>
                  <div className="bd-tools-score">
                    <ScoreBar value={score} tone={tone} showNum={false} />
                    <small>{score !== null ? score : '—'}</small>
                  </div>
                </div>
              );
            })}
          </div>
        </BDSection>
      )}

      {risks.length > 0 && (
        <BDSection title={zh ? '剔除与审批风险' : 'RISKS'} scroll>
          <div className="bd-risklist tight">
            {risks.map((r, i) => (
              <div key={i} className="bd-risk">{r}</div>
            ))}
          </div>
        </BDSection>
      )}

      {lamp === 'red' && <Banner tone="red">⛔ {zh ? '无可行融资组合：请复核资本金比例与抵押物条件后重跑' : 'no viable mix'}</Banner>}
      {action && (
        <ActionCard>
          <p>{action}</p>
        </ActionCard>
      )}
    </div>
  );
};

export default BoardA3Funding;
