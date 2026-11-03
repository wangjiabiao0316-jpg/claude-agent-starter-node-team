import React from 'react';
import { useT } from '../../i18n';
import { BDSection, ActionCard, ScoreBar, arrOf, clampStr, num, str } from './shared';

/**
 * BoardA2Policy — A2 政策应答（agent2-政策应答）专属展板。
 *
 * 业务语义：规则查表型清单输出——schema 明令禁止三色灯字段，
 * 结论是「可适用政策清单（按综合分排序）+ 未适用缺口 + 下一步申报动作」。
 * 展板 = 业务问题条 + 政策卡流（综合分量表）+ 缺口红卡 + 行动卡。不画图。
 */

export const BoardA2Policy: React.FC<{ json: Record<string, unknown> }> = ({ json }) => {
  const { lang } = useT();
  const zh = lang === 'zh';

  const question = str(json['业务问题']);
  const applicable = arrOf(json['可适用政策清单']);
  const inapplicable = arrOf(json['未适用政策及原因']);
  const action = str(json['建议动作']);

  return (
    <div className="bd">
      {question && (
        <div className="bd-qbar">
          <span className="bd-qbar-label">{zh ? '业务问题' : 'QUERY'}</span>
          <p title={question}>{clampStr(question, 90)}</p>
          <span className="bd-chip">{zh ? '清单输出 · 无三色灯判定' : 'no lamp by design'}</span>
        </div>
      )}

      {applicable.length > 0 && (
        <BDSection title={zh ? `可适用政策 · ${applicable.length} 条（按综合分降序）` : 'APPLICABLE POLICIES'} scroll>
          <div className="bd-policygrid">
            {applicable.map((p, i) => {
              const name = str(p['政策名称']) || `${zh ? '政策' : 'Policy'} ${i + 1}`;
              const score = num(p['综合分']);
              const tone = score === null ? undefined : score >= 75 ? 'green' : score >= 60 ? 'yellow' : 'red';
              const strength = str(p['支持力度']);
              const path = str(p['申请路径']);
              const limit = str(p['限制条件']);
              const clause = str(p['依据条款']);
              return (
                <div key={`${name}-${i}`} className="bd-policy">
                  <div className="bd-policy-name" title={name}>{name}</div>
                  <div className="bd-policy-score">
                    <b className={tone ?? ''}>{score !== null ? score : '—'}</b>
                    <div className="bd-policy-scorebar">
                      <ScoreBar value={score} tone={tone} showNum={false} marks={[{ at: 60 }, { at: 75 }]} />
                      <small>综合分 · 60 需复核 / 75 初步适用</small>
                    </div>
                  </div>
                  {strength && (
                    <p className="bd-policy-line" title={strength}><b>支持力度</b>{clampStr(strength, 62)}</p>
                  )}
                  {path && (
                    <p className="bd-policy-line" title={path}><b>申请路径</b>{clampStr(path, 62)}</p>
                  )}
                  {limit && (
                    <p className="bd-policy-line" title={limit}><b>限制条件</b>{clampStr(limit, 62)}</p>
                  )}
                  {clause && <p className="bd-policy-foot">依据 · {clampStr(clause, 80)}</p>}
                </div>
              );
            })}
          </div>
        </BDSection>
      )}

      {inapplicable.length > 0 && (
        <BDSection title={zh ? '未适用政策 · 缺口提示' : 'INAPPLICABLE'}>
          <div className="bd-inapplist">
            {inapplicable.map((p, i) => {
              const name = str(p['政策名称']);
              const reason = str(p['不适用原因']) || str(p['原因']);
              if (!name && !reason) return null;
              return (
                <div key={`${name}-${i}`} className="bd-inapp">
                  {name && name !== '—' && <b>{name}</b>}
                  <span>{reason || (zh ? '未说明' : '—')}</span>
                </div>
              );
            })}
          </div>
        </BDSection>
      )}

      {action && (
        <ActionCard>
          <p style={{ whiteSpace: 'pre-line' }}>{action}</p>
        </ActionCard>
      )}
    </div>
  );
};

export default BoardA2Policy;
