import React from 'react';
import { useT } from '../../i18n';
import {
  BDSection, Banner, LampBadge, ScoreBar, clampStr, lampOf, LAMP_ACTION, str,
  type Lamp,
} from './shared';

/**
 * BoardA1Gate — A1 前置闸门（agent1-固有对象）专属展板。
 *
 * 业务语义：闸门型智能体——H1 产权 / H2 规划文保两道硬闸门一票否决，
 * S 软评分（S1×0.5 + S2×0.5，75/60 阈值）决定通过档位。
 * 展板 = 判定横幅 + 双闸卡（命中判据代码 + 依据）+ S 量尺 + 风险清单。
 */

/** 从命中判据代码推导子灯色：H1.red.A → red / S总分.<60 → red / S总分.>=75 → green */
function gateLamp(code: string): Lamp | null {
  if (/\.red|<60/.test(code)) return 'red';
  if (/\.yellow|60-75/.test(code)) return 'yellow';
  if (/\.green|>=75/.test(code)) return 'green';
  return null;
}

/** 单道闸门卡：闸门名 + 子灯 + 命中判据代码（等宽芯片）+ 依据 */
function GateCard({
  name, sub, code, basisText,
}: {
  name: string;
  sub: string;
  code?: string;
  basisText: string;
}) {
  return (
    <div className={`bd-gate${code ? ` lamp-${gateLamp(code) ?? 'none'}` : ''}`}>
      <div className="bd-gate-top">
        <div style={{ minWidth: 0 }}>
          <div className="bd-gate-name">{name}</div>
          <small className="bd-gate-sub">{sub}</small>
        </div>
        <LampBadge lamp={code ? gateLamp(code) : null} />
      </div>
      {code ? (
        <span className="bd-code">{code}</span>
      ) : (
        <span className="bd-code bd-code-pending">判据未输出</span>
      )}
      {basisText && <p className="bd-gate-basis" title={basisText}>{basisText}</p>}
    </div>
  );
}

export const BoardA1Gate: React.FC<{ json: Record<string, unknown> }> = ({ json }) => {
  const { lang } = useT();
  const zh = lang === 'zh';

  const lamp = lampOf(json);
  const codes = (Array.isArray(json['命中判据']) ? json['命中判据'] : []).map(str).filter(Boolean);
  const risks = (Array.isArray(json['风险点']) ? json['风险点'] : []).map(str).filter(Boolean);
  const basis = (json['依据'] && typeof json['依据'] === 'object' && !Array.isArray(json['依据']))
    ? (json['依据'] as Record<string, unknown>)
    : {};
  const action = str(json['建议动作']);

  const h1 = codes.find((c) => c.startsWith('H1'));
  const h2 = codes.find((c) => c.startsWith('H2'));
  const sCode = codes.find((c) => /^S/.test(c));

  // S 分数藏在依据字符串「S1=80, S2=70 → 75」里，解析出三项供量尺呈现
  const sAgg = str(basis['S_aggregate']);
  const s1 = sAgg.match(/S1\s*=\s*(-?\d+(?:\.\d+)?)/)?.[1];
  const s2 = sAgg.match(/S2\s*=\s*(-?\d+(?:\.\d+)?)/)?.[1];
  const totalMatch = sAgg.match(/→\s*(-?\d+(?:\.\d+)?)/) ?? sAgg.match(/(-?\d+(?:\.\d+)?)(?!.*\d)/);
  const sTotal = totalMatch ? parseFloat(totalMatch[1]) : null;
  const sTone = sTotal === null ? undefined : sTotal >= 75 ? 'green' : sTotal >= 60 ? 'yellow' : 'red';

  return (
    <div className="bd">
      {/* 判定横幅 */}
      <div className={`bd-hero ${lamp ?? ''}`}>
        <div className="bd-hero-main">
          <p className="eyebrow">GATE VERDICT · 前置闸门判定</p>
          <div className="bd-hero-title">{action || (lamp ? LAMP_ACTION[lamp] : '—')}</div>
          <div className="bd-hero-sub">
            {lamp === 'red'
              ? 'H 硬闸门红灯触发：后续智能体按编排规则终止'
              : lamp === 'yellow'
                ? '存在黄级条件：按条件推进事项补齐后可推进'
                : zh
                  ? '产权 / 规划文保 / 资产条件核验'
                  : 'property / heritage / asset checks'}
          </div>
        </div>
        <LampBadge lamp={lamp} big />
      </div>

      <BDSection title={zh ? 'H 硬闸门 · 一票否决项' : 'H GATES'}>
        <div className="bd-gategrid">
          <GateCard
            name="H1 · 产权清晰度"
            sub={zh ? '权属 / 查封诉讼 / 共有人' : 'ownership'}
            code={h1}
            basisText={clampStr(str(basis['H1']), 110)}
          />
          <GateCard
            name="H2 · 规划与文保"
            sub={zh ? '保护区 / 业态规划准入' : 'planning'}
            code={h2}
            basisText={clampStr(str(basis['H2']), 110)}
          />
        </div>
      </BDSection>

      <BDSection
        title={zh ? 'S 资产条件评分' : 'S SCORE'}
        right={sCode ? <span className="bd-code">{sCode}</span> : undefined}
      >
        <ScoreBar
          value={sTotal}
          max={100}
          tone={sTone}
          marks={[
            { at: 60, label: zh ? '60 终止线' : '60' },
            { at: 75, label: zh ? '75 推进线' : '75' },
          ]}
        />
        {(s1 || s2) && (
          <div className="bd-chiplist" style={{ marginTop: 10 }}>
            {s1 && <span className="bd-chip gold">S1 更新意愿 {s1}</span>}
            {s2 && <span className="bd-chip gold">S2 可经营性 {s2}</span>}
            {sTotal !== null && <span className="bd-chip">S总分 = S1×0.5 + S2×0.5 = {sTotal}</span>}
          </div>
        )}
        {!sAgg && (
          <p className="bd-note">{zh ? 'S 评分未输出（H 红灯短路时不计 S 分）' : 'S score not emitted'}</p>
        )}
      </BDSection>

      {risks.length > 0 && (
        <BDSection title={zh ? `风险点 · ${risks.length}` : 'RISKS'} scroll>
          <div className="bd-risklist">
            {risks.map((r, i) => (
              <div key={i} className="bd-risk">{r}</div>
            ))}
          </div>
        </BDSection>
      )}

      {lamp === 'yellow' && (
        <Banner tone="gold">⚠ {zh ? '黄级闸门：补齐风险点对应材料后，重跑本环节即可转绿' : 'conditional pass'}</Banner>
      )}
    </div>
  );
};

export default BoardA1Gate;
