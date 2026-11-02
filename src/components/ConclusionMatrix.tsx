import React, { useEffect, useState } from 'react';
import type { MatrixModel, MatrixRow, Tone } from '../lib/conclusionMatrix';
import { useT } from '../i18n';

/**
 * ConclusionMatrix — 七 agent 核心结论模块（对齐设计稿红框呈现形式）。
 *
 * 版式：模块头（英文 eyebrow + 中文标题 + 模块级灯色徽章）
 *       + 主-从双栏：左「清单主表」（行可点击，选中高亮）
 *                    右「选中条目详情」面板
 *
 * 数据模型由 lib/conclusionMatrix.ts 组装，本组件只负责呈现；
 * 行/列数量随 agent 结论 schema 动态变化（grid 内联列宽）。
 */

/** 徽章 tone → 复用 lamp-badge 三色体系（neutral 走 tag） */
function Badge({ label, tone }: { label: string; tone: Tone }) {
  if (tone === 'neutral') return <span className="tag neutral">{label}</span>;
  return <span className={`lamp-badge ${tone}`}>{label}</span>;
}

/** 主表 + 详情的 grid 列宽：首列条目名弹性、数据列均分、判定/证据列固定 */
function gridTemplate(model: MatrixModel): string {
  return ['minmax(140px, 1.35fr)', ...model.columns.map(() => 'minmax(90px, 1fr)'), '104px', 'minmax(96px, 0.9fr)'].join(' ');
}

function DetailItem({ label, value, tone }: { label: string; value: string; tone?: Tone }) {
  return (
    <div className="cm-dl-row">
      <span className="cm-dl-key">{label}</span>
      {tone ? (
        <Badge label={value} tone={tone} />
      ) : (
        <span className="cm-dl-val" title={value}>{value}</span>
      )}
    </div>
  );
}

function RowCells({ row, model, selected, onSelect, zh }: {
  row: MatrixRow;
  model: MatrixModel;
  selected: boolean;
  onSelect: () => void;
  zh: boolean;
}) {
  return (
    <button
      type="button"
      className={`cm-row ${selected ? 'selected' : ''}`}
      style={{ gridTemplateColumns: gridTemplate(model) }}
      onClick={onSelect}
      aria-pressed={selected}
    >
      <span className="cm-cell cm-cell-title" title={row.title}>{row.title}</span>
      {model.columns.map((_, i) => (
        <span key={i} className="cm-cell" title={row.cells[i]}>{row.cells[i] ?? '—'}</span>
      ))}
      <span className="cm-cell cm-cell-badge">
        {row.badge ? <Badge label={row.badge.label} tone={row.badge.tone} /> : <span className="cm-dash">—</span>}
      </span>
      <span className="cm-cell cm-cell-evidence" title={row.evidence}>
        {row.evidence || (zh ? '待补证' : 'pending')}
      </span>
    </button>
  );
}

export const ConclusionMatrix: React.FC<{ model: MatrixModel }> = ({ model }) => {
  const { lang } = useT();
  const zh = lang === 'zh';
  const [selected, setSelected] = useState(0);

  // 数据流式更新时行集会变化：选中索引越界则回落到首行
  useEffect(() => {
    setSelected((prev) => (prev < model.rows.length ? prev : 0));
  }, [model.rows.length]);

  const row = model.rows[Math.min(selected, model.rows.length - 1)];

  return (
    <div className="cm">
      <div className="cm-head">
        <div style={{ minWidth: 0 }}>
          <p className="eyebrow">{model.tag}</p>
          <h3 className="cm-title">{model.title}</h3>
        </div>
        {model.verdict?.lamp && (
          <span className={`lamp-badge ${model.verdict.lamp}`}>
            {model.verdict.lamp === 'green'
              ? (zh ? '绿灯 · 通过' : 'Pass')
              : model.verdict.lamp === 'yellow'
                ? (zh ? '黄灯 · 有条件通过' : 'Conditional')
                : (zh ? '红灯 · 不通过' : 'Blocked')}
          </span>
        )}
      </div>

      <div className="cm-grid">
        {/* —— 左：清单主表 —— */}
        <div className="cm-table" role="table" aria-label={model.title}>
          <div className="cm-thead" style={{ gridTemplateColumns: gridTemplate(model) }} role="row">
            <span role="columnheader">{zh ? '条目' : 'ITEM'}</span>
            {model.columns.map((c, i) => <span key={i} role="columnheader">{c}</span>)}
            <span role="columnheader">{model.badgeColumn ?? (zh ? '判定' : 'VERDICT')}</span>
            <span role="columnheader">{zh ? '证据' : 'EVIDENCE'}</span>
          </div>
          <div className="cm-tbody">
            {model.rows.map((r, i) => (
              <RowCells
                key={r.id}
                row={r}
                model={model}
                selected={i === selected}
                onSelect={() => setSelected(i)}
                zh={zh}
              />
            ))}
          </div>
        </div>

        {/* —— 右：选中条目详情 —— */}
        <div className="cm-detail">
          <div className="cm-detail-head">{zh ? '条目详情 / 选中条目' : 'SELECTED ITEM'}</div>
          {row && (
            <>
              <div className="cm-detail-title" title={row.title}>{row.title}</div>
              <div className="cm-dl">
                {row.detail.map((item, i) => (
                  <DetailItem key={`${item.label}-${i}`} label={item.label} value={item.value} tone={item.tone} />
                ))}
              </div>
            </>
          )}
          {model.verdict && model.verdict.lines.length > 0 && (
            <div className="cm-verdict">
              <div className="cm-verdict-head">{zh ? '结论与建议' : 'VERDICT & NEXT'}</div>
              {model.verdict.lines.map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ConclusionMatrix;
