import React from 'react';
import { useT } from '../../i18n';
import {
  BDSection, ActionCard, Banner, LampBadge, ScoreBar, arrOf, clampStr, lampOf, num, objOf, str,
} from './shared';

/**
 * BoardA5Failure — A5 失败案例（agent5-失败案例）专属展板。
 *
 * 业务语义：校验型信号灯（字段叫「校验灯」）——红灯是风险信号而非闸门，
 * 终止权在 A7 双层决策；结论 = 高危模式命中 + Top3 相似案例 + 根因归因
 * + 规避建议。展板 = 判定横幅 + 高危横幅 + 案例卡（相似度量尺）+ 归因芯片。
 */

export const BoardA5Failure: React.FC<{ json: Record<string, unknown> }> = ({ json }) => {
  const { lang } = useT();
  const zh = lang === 'zh';

  const lamp = lampOf(json); // 「校验灯」
  const cases = arrOf(json['Top3案例']);
  const hits = objOf(json['命中判据']);
  const h1Raw = str(hits['H1_高危模式']);
  const h1 = h1Raw && h1Raw !== 'null' ? h1Raw : '';
  const s1 = num(hits['S1_相似度分']); // 0-1
  const s2 = num(hits['S2_归因分']); // 0-1
  const recheck = json['根因重现判断'];
  const advice = str(json['规避建议']) || str(json['建议动作']);
  const simPct = (v: number | null) => (v !== null ? Math.round(v * 100) : null);
  const s1Pct = simPct(s1);
  const s2Pct = simPct(s2);

  return (
    <div className="bd">
      <div className={`bd-hero ${lamp ?? ''}`}>
        <div className="bd-hero-main">
          <p className="eyebrow">FAILURE BENCHMARK · 同类失败对标</p>
          <div className="bd-hero-title">
            {h1 ? `${zh ? '命中高危模式' : 'High-risk hit'} · ${h1}` : lamp ? (zh ? '风险校验完成' : 'validated') : '—'}
          </div>
          <div className="bd-hero-sub">
            {zh
              ? '红灯为风险信号，不直接终止流水线；终止权在 A7 双层决策'
              : 'red is a signal only; termination belongs to A7'}
            {cases.length > 0 && ` · ${zh ? '对标' : 'vs'} Top${cases.length}`}
          </div>
        </div>
        <LampBadge lamp={lamp} big />
      </div>

      {h1 && <Banner tone="red">⚠ {zh ? `命中 5 类高危失败模式：${h1} —— 优先落实规避建议` : `high-risk: ${h1}`}</Banner>}

      {cases.length > 0 && (
        <BDSection title={zh ? `Top${cases.length} 相似失败案例` : 'TOP CASES'}>
          <div className="bd-casegrid">
            {cases.map((c, i) => {
              const id = str(c['case_id']) || str(c['案例ID']) || `案例 ${i + 1}`;
              const simRaw = num(c['相似度']);
              const sim = simRaw !== null ? Math.round(simRaw * 100) : null;
              const simTone = sim === null ? undefined : sim >= 80 ? 'red' : sim >= 60 ? 'yellow' : 'green';
              const pattern = str(c['失败模式']);
              const cause = str(c['根因']) || str(c['失败根因']);
              return (
                <div key={`${id}-${i}`} className="bd-case">
                  <div className="bd-case-top">
                    <span className="bd-code">{id}</span>
                    {pattern && <span className="bd-tag">{clampStr(pattern, 10)}</span>}
                  </div>
                  <ScoreBar value={sim} tone={simTone} marks={[{ at: 80, label: zh ? '0.8 高危线' : '0.8' }]} />
                  {cause && <p className="bd-case-cause" title={cause}>{clampStr(cause, 110)}</p>}
                </div>
              );
            })}
          </div>
        </BDSection>
      )}

      {(s1Pct !== null || s2Pct !== null || recheck !== undefined) && (
        <BDSection title={zh ? '判据与归因' : 'DIAGNOSIS'}>
          <div className="bd-chiplist">
            {s1Pct !== null && (
              <span className={`bd-chip ${s1Pct >= 80 ? 'red' : s1Pct >= 60 ? 'gold' : ''}`}>
                S1 最高相似度 {s1Pct}%
              </span>
            )}
            {s2Pct !== null && <span className="bd-chip">S2 根因归因置信度 {s2Pct}%</span>}
            {recheck !== undefined && (
              <span className={`bd-chip ${recheck ? 'red' : 'green'}`}>
                {recheck ? '根因已在当前项目重现' : '根因未见重现'}
              </span>
            )}
          </div>
        </BDSection>
      )}

      {advice && (
        <ActionCard>
          <p>{clampStr(advice, 220)}</p>
        </ActionCard>
      )}
    </div>
  );
};

export default BoardA5Failure;
