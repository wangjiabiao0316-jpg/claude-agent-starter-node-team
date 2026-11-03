import React from 'react';
import { useT } from '../../i18n';
import { BDSection, LampBadge, LAMP_ACTION, clampStr, lampOf, objOf, str, type Lamp } from './shared';

/**
 * BoardA7Decision — A7 双层决策（agent6-双层决策）专属展板（全链终局结论）。
 *
 * 业务语义：聚合型——先算咨投建运四维子灯（权重 0.3/0.3/0.2/0.2），
 * H 硬规则（设计咨询或投资拓展 red → 顶层 red）锁死顶层。
 * 展板 = 顶层大横幅（判据 + 建议动作）+ 四维权重格 + 条件推进待办清单
 * + 触发报告模板。整条流水线的收口，版式最重。
 */

const DIM_WEIGHT: Record<string, number> = { 设计咨询: 0.3, 投资拓展: 0.3, 建造实施: 0.2, 业主平台: 0.2 };
const DIM_ICON: Record<string, string> = { 设计咨询: '📐', 投资拓展: '💼', 建造实施: '🏗️', 业主平台: '🏛️' };

function dimLamp(v: unknown): Lamp | null {
  const s = str(objOf(v)['灯色']);
  return s === 'green' || s === 'yellow' || s === 'red' ? s : null;
}

export const BoardA7Decision: React.FC<{ json: Record<string, unknown> }> = ({ json }) => {
  const { lang } = useT();
  const zh = lang === 'zh';

  const top = lampOf(json); // 「顶层灯」
  const judge = str(json['顶层判据']);
  const dimsRaw = objOf(json['四维子灯']);
  const dims = Object.entries(dimsRaw).map(([name, v]) => {
    const d = objOf(v);
    return {
      name,
      weight: DIM_WEIGHT[name],
      lamp: dimLamp(v),
      basis: str(d['依据']),
      note: str(d['Phase1_简化标注']),
    };
  });
  const todos = (Array.isArray(json['条件推进事项']) ? json['条件推进事项'] : []).map(str).filter(Boolean);
  const template = str(json['触发报告模板']);
  const action = str(json['建议动作']) || (top ? LAMP_ACTION[top] : '');
  const todoTitle =
    top === 'red'
      ? zh ? '终止原因' : 'TERMINATION REASONS'
      : top === 'yellow'
        ? zh ? '条件推进事项 · 下一步' : 'CONDITIONS · NEXT'
        : zh ? '事项清单' : 'ITEMS';

  return (
    <div className="bd">
      {/* 终局横幅：建议动作大字 + 顶层判据 */}
      <div className={`bd-hero xl ${top ?? ''}`}>
        <div className="bd-hero-main">
          <p className="eyebrow">FINAL VERDICT · 顶层决策</p>
          <div className="bd-hero-title big">
            {action || (top ? LAMP_ACTION[top] : zh ? '待判定' : 'pending')}
          </div>
          <div className="bd-hero-sub">{judge || (zh ? '顶层判据未输出' : 'no rationale')}</div>
        </div>
        <LampBadge lamp={top} big />
      </div>

      {dims.length > 0 && (
        <BDSection
          title={zh ? '四维子灯与决策权重' : 'FOUR DIMENSIONS'}
          right={<span>{zh ? 'S 权重聚合 0.3 / 0.3 / 0.2 / 0.2' : 'weights 0.3/0.3/0.2/0.2'}</span>}
        >
          <div className="bd-dims">
            {dims.map((d) => (
              <div key={d.name} className={`bd-dim ${d.lamp ?? ''}`}>
                <div className="bd-dim-head">
                  <span className="bd-dim-name">
                    <i aria-hidden="true">{DIM_ICON[d.name] ?? '•'}</i>
                    {d.name}
                  </span>
                  <LampBadge lamp={d.lamp} />
                </div>
                {d.weight !== undefined && (
                  <div className="bd-dim-weight" title={zh ? `决策权重 ${d.weight}` : `weight ${d.weight}`}>
                    <span style={{ width: `${(d.weight / 0.3) * 100}%` }} />
                    <small>权重 {d.weight}</small>
                  </div>
                )}
                {d.basis && <p className="bd-dim-basis" title={d.basis}>{clampStr(d.basis, 92)}</p>}
                {d.note && <small className="bd-dim-note">{d.note}</small>}
              </div>
            ))}
          </div>
        </BDSection>
      )}

      {top === 'red' && judge && (
        <div className="bd-banner red">⛔ {zh ? 'H 硬规则触发：设计咨询或投资拓展维度红灯锁死顶层判定' : 'H rule triggered'}</div>
      )}

      {todos.length > 0 && (
        <BDSection title={todoTitle}>
          <div className={`bd-todo ${top === 'yellow' ? 'warn' : ''}`}>
            {todos.map((t, i) => (
              <div key={i} className="bd-todo-item">
                <span aria-hidden="true">▣</span>
                <p>{t}</p>
              </div>
            ))}
          </div>
        </BDSection>
      )}

      {template && (
        <BDSection title={zh ? '触发报告模板' : 'REPORT TEMPLATES'}>
          <div className="bd-chiplist">
            {template.split(/[+＋]/).map((s) => s.trim()).filter(Boolean).map((s) => (
              <span key={s} className="bd-chip gold">📄 {s}</span>
            ))}
          </div>
        </BDSection>
      )}
    </div>
  );
};

export default BoardA7Decision;
