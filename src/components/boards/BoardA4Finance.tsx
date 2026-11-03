import React from 'react';
import { useT } from '../../i18n';
import { BDSection, Banner, StatNum, clampStr, num, objOf, str, type Tone } from './shared';

/**
 * BoardA4Finance — A4 财务模型（agent4-财务模型）专属展板。
 *
 * 业务语义：沙箱 Python 引擎测算（禁止心算）——IRR/NPV/回收期 + 业态门槛
 * 对照（商业 8-12% / 办公 6-9% / 文旅 7-10%）+ 现金流时序。
 * 展板 = 测算横幅（达标徽章）+ 指标卡（IRR 门槛区间带）+ 现金流柱图 + 假设。
 * 七块展板里唯一自带时序数组的环节，图示化最重。
 */

/** 现金流时序容错抽取：纯数组 → 直取；对象数组 → 常见键名取数 */
function parseCash(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((c) => {
      if (typeof c === 'number' && Number.isFinite(c)) return c;
      const o = objOf(c);
      for (const k of ['净现金流', '净额', '金额', '值', 'value']) {
        const n = num(o[k]);
        if (n !== null) return n;
      }
      return null;
    })
    .filter((n): n is number => n !== null);
}

export const BoardA4Finance: React.FC<{ json: Record<string, unknown> }> = ({ json }) => {
  const { lang } = useT();
  const zh = lang === 'zh';

  const metrics = objOf(json['财务指标']);
  const threshold = objOf(json['业态门槛对照']);
  const irr = num(metrics['IRR']);
  const npv = str(metrics['NPV']);
  const payback = str(metrics['回收期']);
  const sensitivity = str(metrics['敏感性分析']);
  const industry = str(threshold['业态']);
  const bandMatch = str(threshold['门槛区间']).match(/(-?\d+(?:\.\d+)?)\s*[-~—]\s*(-?\d+(?:\.\d+)?)/);
  const lo = bandMatch ? parseFloat(bandMatch[1]) : null;
  const hi = bandMatch ? parseFloat(bandMatch[2]) : null;
  const passText = str(threshold['达标结论']);
  const passTone: Tone | undefined = /不达标|未达标|不通过/.test(passText)
    ? 'red'
    : /达标|优|通过/.test(passText)
      ? 'green'
      : undefined;
  const mode = str(json['改造模式']);
  const assume = str(json['关键假设']);
  const cash = parseCash(json['现金流时序']);

  // 复合主图（V4.4.2）：净额柱之上叠加累计净额折线。累计量纲独立缩放
  // （0 点恒在中线），穿零点即静态回收期——与回收期指标卡互相印证。
  const cum: number[] = [];
  let cumAcc = 0;
  for (const v of cash) { cumAcc += v; cum.push(cumAcc); }
  const cumMax = Math.max(...cum.map(Math.abs), 1);
  const cumW = 100 / Math.max(cash.length, 1);
  const cumPts = cash.length >= 2
    ? cum.map((v, i) => `${((i + 0.5) * cumW).toFixed(2)},${(50 - (v / cumMax) * 46).toFixed(2)}`).join(' ')
    : '';
  let pbZero: { xPct: number; yrs: number } | null = null;
  for (let i = 1; i < cum.length; i++) {
    if (cum[i - 1] < 0 && cum[i] >= 0) {
      const t = -cum[i - 1] / (cum[i] - cum[i - 1]);
      // 回收时刻 = i + t 年（期 i 口径「第 i+1 年」，区间 [i, i+1]）；穿零点
      // 画在相邻两柱中心连线上（视觉位置 = (i-0.5+t) * 柱距）
      pbZero = { xPct: (i - 0.5 + t) * cumW, yrs: i + t };
      break;
    }
  }

  // IRR 门槛带窗口：区间两侧各留 70% 跨度余量，指针按窗口内相对位置摆放
  const bandOk = irr !== null && lo !== null && hi !== null && hi > lo;
  const span = bandOk ? hi - lo : 1;
  const wLo = bandOk ? lo - span * 0.7 : 0;
  const wHi = bandOk ? hi + span * 0.7 : 100;
  const posOf = (v: number) => ((v - wLo) / (wHi - wLo)) * 100;
  const irrPos = bandOk ? Math.min(98, Math.max(2, posOf(irr))) : null;
  const irrTone: Tone | undefined = bandOk ? (irr >= lo && irr <= hi ? 'green' : 'red') : undefined;

  return (
    <div className="bd">
      <div className={`bd-hero ${passTone === 'red' ? 'red' : passTone === 'green' ? 'green' : ''}`}>
        <div className="bd-hero-main">
          <p className="eyebrow">FINANCIAL ENGINE · 沙箱测算</p>
          <div className="bd-hero-title">{irr !== null ? `IRR ${irr}%` : zh ? '财务测算' : 'Financials'}</div>
          <div className="bd-hero-sub">
            {industry && `${industry} 业态`}
            {lo !== null && hi !== null && ` · 门槛区间 ${lo}-${hi}%`}
            {mode && ` · ${mode}`}
          </div>
        </div>
        {passText && (
          <span className={`lamp-badge ${passTone === 'red' ? 'red' : passTone === 'green' ? 'green' : 'yellow'}`}>
            {passText}
          </span>
        )}
      </div>

      <div className="bd-statgrid">
        <div className="bd-stat wide">
          <span className="bd-stat-label">IRR · 内部收益率（年化）</span>
          <b className={`bd-stat-value ${irrTone ?? ''}`}>{irr !== null ? `${irr}%` : '—'}</b>
          {bandOk && (
            <div className="bd-irrband">
              <span
                className="bd-irr-zone"
                style={{ left: `${posOf(lo)}%`, width: `${posOf(hi) - posOf(lo)}%` }}
                title={`${zh ? '门槛带' : 'threshold'} ${lo}-${hi}%`}
              />
              {irrPos !== null && (
                <span className="bd-irr-ptr" style={{ left: `${irrPos}%` }}>
                  <i className={irrTone}>{irr}%</i>
                </span>
              )}
              <em className="bd-irr-lab" style={{ left: `${posOf(lo)}%` }}>{lo}%</em>
              <em className="bd-irr-lab" style={{ left: `${posOf(hi)}%` }}>{hi}%</em>
            </div>
          )}
          <small className="bd-stat-sub">
            {bandOk
              ? irrTone === 'green'
                ? zh ? '落在业态门槛区间内 · 达标' : 'within threshold band'
                : zh ? '未落入门槛区间 · 对照达标结论复核' : 'outside threshold band'
              : passText || undefined}
          </small>
        </div>
        <StatNum label="NPV · 净现值" value={npv} />
        <StatNum label={zh ? '回收期' : 'PAYBACK'} value={payback} />
        {mode && <StatNum label={zh ? '改造模式' : 'MODE'} value={mode} />}
      </div>

      {cash.length > 0 && (
        <BDSection
          title={zh ? '现金流时序' : 'CASHFLOW'}
          right={<span>{zh ? `${cash.length} 期 · 悬停查看各期数值` : `${cash.length} periods`}</span>}
        >
          <div className="bd-cash">
            <div className="bd-cashchart">
              <span className="bd-cash-base" aria-hidden="true" />
              {cash.map((v, i) => {
                const maxAbs = Math.max(...cash.map(Math.abs)) || 1;
                const wPct = 100 / cash.length;
                const hPct = Math.max(1.5, (Math.abs(v) / maxAbs) * 46);
                const style: React.CSSProperties = { left: `${i * wPct + wPct * 0.18}%`, width: `${wPct * 0.64}%`, height: `${hPct}%` };
                if (v >= 0) style.bottom = '50%';
                else style.top = '50%';
                return (
                  <span
                    key={i}
                    className={`bd-cbar ${v >= 0 ? 'pos' : 'neg'}`}
                    style={style}
                    title={`${zh ? '第' : 'Y'}${i + 1} ${zh ? '年' : ''} · ${v}`}
                  />
                );
              })}
              <span className="bd-cash-lab" style={{ left: 0 }}>Y1</span>
              <span className="bd-cash-lab" style={{ right: 0 }}>Y{cash.length}</span>
              {cumPts && (
                <svg className="bd-cash-overlay" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                  <polyline className="bd-cash-cumline" points={cumPts} />
                </svg>
              )}
              {pbZero && (
                <>
                  <span className="bd-cash-pbline" style={{ left: `${pbZero.xPct}%` }} aria-hidden="true" />
                  <span
                    className="bd-cash-pbdot"
                    style={{ left: `${pbZero.xPct}%` }}
                    title={`${zh ? '静态回收期' : 'payback'} ≈ ${pbZero.yrs.toFixed(1)}${zh ? ' 年' : 'y'}`}
                  />
                  <span className="bd-cash-pblab" style={{ left: `${Math.min(86, Math.max(14, pbZero.xPct))}%` }}>
                    {zh ? `回收期 ≈ ${pbZero.yrs.toFixed(1)} 年` : `payback ≈ ${pbZero.yrs.toFixed(1)}y`}
                  </span>
                </>
              )}
            </div>
            <p className="bd-cash-note">
              {zh
                ? '金绿 = 净流入 · 红 = 净流出 · 中线为 0 · 金线 = 累计净额（独立标尺）· 虚线 = 回收期'
                : 'green = inflow · red = outflow · gold line = cumulative'}
            </p>
          </div>
        </BDSection>
      )}

      {sensitivity && (
        <BDSection title={zh ? '敏感性分析' : 'SENSITIVITY'} scroll>
          <p className="bd-note" style={{ whiteSpace: 'pre-line' }}>{clampStr(sensitivity, 300)}</p>
        </BDSection>
      )}

      {passTone === 'red' && (
        <Banner tone="red">⛔ {zh ? `IRR 未达 ${industry || '业态'}门槛下限：调整租金假设 / 业态方向或融资结构后重跑` : 'below industry threshold'}</Banner>
      )}
      {assume && (
        <p className="bd-footnote">关键假设 · {clampStr(assume, 160)}</p>
      )}
    </div>
  );
};

export default BoardA4Finance;
