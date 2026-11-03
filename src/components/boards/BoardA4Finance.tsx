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

/** 指标来源角标（参考 demo 数据可信度分层）：有值 = 已测算，缺 = 待补全 */
function srcBadge(v: string, zh: boolean) {
  return (
    <i className={`bd-src ${v ? 'ok' : 'pending'}`}>
      {v ? (zh ? '已测算' : 'measured') : zh ? '待补全' : 'pending'}
    </i>
  );
}

/**
 * 敏感行（参考 demo 行式布局）：变量名 + 示意条带 + 关键数值。
 * 变量名取条目开头连续中/英文段；数值取条目末个带符号百分数（如 ↑5.02%）；
 * 条带长度由该数值示意映射（24+8n，clamp 92%），无数值统一 45%——
 * 仅为布局示意，不代表真实敏感度，脚注已声明。
 */
function sensRow(s: string, zh: boolean, i: number) {
  const name = (s.match(/^[一-龥A-Za-z/（）()]+/)?.[0] ?? '').slice(0, 10) || clampStr(s, 10);
  const m = [...s.matchAll(/[↑↓+\-−]?\d+(?:\.\d+)?\s*%/g)].pop();
  const val = m ? m[0].replace(/\s+/g, '').replace('−', '-') : zh ? '待计算' : 'pending';
  const n = m ? Math.abs(parseFloat(m[0].replace(/[↑↓]/, ''))) : null;
  const w = n !== null ? Math.min(92, 24 + n * 8) : 45;
  return (
    <div className="bd-sensrow" key={i} title={s}>
      <span className="bd-sens-name">{name}</span>
      <span className="bd-sens-track" aria-hidden="true"><i style={{ width: `${w}%` }} /></span>
      <em className="bd-sens-val">{val}</em>
    </div>
  );
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

  // IRR 量程线（V4.4.6）：0-100% 全量程单线，门槛绿段重叠绘制其上，
  // 指针按真实比例落位（irr% 即 left 百分比）
  const bandOk = irr !== null && lo !== null && hi !== null && hi > lo;
  const irrTone: Tone | undefined = bandOk ? (irr >= lo && irr <= hi ? 'green' : 'red') : undefined;

  // 敏感性条目化（参考 demo 双组结构）：文字按行/分号切分，能同时归出
  // 收入侧与成本侧则双组呈现，否则平铺条目；单条回退原文。
  const sensItems = sensitivity.split(/\n+|；|;/).map((s) => s.trim()).filter((s) => s.length > 3);
  const REV_KW = /收入|租金|出租|运营|招商|价格/;
  const COST_KW = /成本|改造|融资|持有|资本|贷款|利率/;
  const revItems = sensItems.filter((s) => REV_KW.test(s) && !COST_KW.test(s));
  const costItems = sensItems.filter((s) => COST_KW.test(s) && !REV_KW.test(s));
  const sensGrouped = revItems.length > 0 && costItems.length > 0;
  const restItems = sensGrouped ? sensItems.filter((s) => !revItems.includes(s) && !costItems.includes(s)) : [];

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
          <span className="bd-stat-label">
            IRR · 内部收益率（年化）
            {srcBadge(irr !== null ? String(irr) : '', zh)}
          </span>
          <b className={`bd-stat-value ${irrTone ?? ''}`}>{irr !== null ? `${irr}%` : '—'}</b>
          {bandOk && (
            <div className="bd-irr-full" title={zh ? '量程 0-100% · 绿段为业态门槛区间' : 'scale 0-100% · green = threshold'}>
              <span className="bd-irr-full-track" aria-hidden="true" />
              <span className="bd-irr-full-zone" style={{ left: `${lo}%`, width: `${hi - lo}%` }} />
              {irr !== null && (
                <span
                  className={`bd-irr-full-ptr ${irrTone ?? ''}`}
                  style={{ left: `${Math.min(100, Math.max(0, irr))}%` }}
                  title={`${irr}%`}
                />
              )}
              <em className="bd-irr-full-lab l">0</em>
              <em className="bd-irr-full-lab r">100%</em>
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
        <StatNum label="NPV · 净现值" value={npv} badge={srcBadge(npv, zh)} />
        <StatNum label={zh ? '回收期' : 'PAYBACK'} value={payback} badge={srcBadge(payback, zh)} />
        {mode && <StatNum label={zh ? '改造模式' : 'MODE'} value={mode} badge={srcBadge(mode, zh)} />}
      </div>

      {(cash.length > 0 || sensitivity !== '') && (
      <div className="bd-duo">
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
            <div className="bd-cash-legend">
              <span><i className="lg-pos" aria-hidden="true" />{zh ? '净流入' : 'inflow'}</span>
              <span><i className="lg-neg" aria-hidden="true" />{zh ? '净流出' : 'outflow'}</span>
              <span><i className="lg-cum" aria-hidden="true" />{zh ? '累计净额（独立标尺）' : 'cumulative'}</span>
              {pbZero && <span><i className="lg-pb" aria-hidden="true" />{zh ? '虚线穿零 = 回收期' : 'payback'}</span>}
            </div>
          </div>
        </BDSection>
      )}

      {sensitivity && (
        <BDSection title={zh ? '敏感性分析' : 'SENSITIVITY'} scroll>
          {sensItems.length > 1 ? (
            <>
            {sensGrouped ? (
              <div className="bd-sens">
                <div className="bd-sens-group">
                  <b>{zh ? '经营收入敏感性' : 'REVENUE SENSITIVITY'}</b>
                  <small>{zh ? '关键假设变化对投资指标的影响' : 'impact on investment metrics'}</small>
                  <div className="bd-sensrows">{revItems.map((s, i) => sensRow(s, zh, i))}</div>
                </div>
                <div className="bd-sens-group">
                  <b>{zh ? '投资成本敏感性' : 'COST SENSITIVITY'}</b>
                  <small>{zh ? '改造投入及持有期假设' : 'capex & holding assumptions'}</small>
                  <div className="bd-sensrows">{costItems.map((s, i) => sensRow(s, zh, i))}</div>
                </div>
              </div>
            ) : (
              <div className="bd-sensrows">{sensItems.map((s, i) => sensRow(s, zh, i))}</div>
            )}
            {restItems.length > 0 && (
              <div className="bd-sensrows" style={{ marginTop: 2 }}>
                {restItems.map((s, i) => sensRow(s, zh, i))}
              </div>
            )}
            <p className="bd-sens-note">
              {zh ? '条带长度仅为布局示意，不代表敏感性大小；以沙箱测算输出为准。' : 'bar length is illustrative only.'}
            </p>
            </>
          ) : (
            <p className="bd-note" style={{ whiteSpace: 'pre-line' }}>{clampStr(sensitivity, 300)}</p>
          )}
        </BDSection>
      )}
      </div>
      )}

      {passTone === 'red' && (
        <Banner tone="red">⛔ {zh ? `IRR 未达 ${industry || '业态'}门槛下限：调整租金假设 / 业态方向或融资结构后重跑` : 'below industry threshold'}</Banner>
      )}
      {/* 测算链路（参考 demo Financial Calculation Inspector）：引擎→输入→核验→快照，审批可追溯 */}
      <div className="bd-trace">
        <p className="bd-trace-title">FINANCIAL CALCULATION INSPECTOR · {zh ? '测算链路' : 'TRACEABILITY'}</p>
        <div className="bd-trace-grid">
          <div><span>{zh ? '测算引擎' : 'ENGINE'}</span><b>{zh ? '沙箱 Python · 禁止心算' : 'sandboxed Python'}</b></div>
          <div><span>{zh ? '输入假设' : 'INPUTS'}</span><b>{assume ? clampStr(assume, 30) : zh ? '待提供' : 'pending'}</b></div>
          <div><span>{zh ? '业态门槛核验' : 'THRESHOLD'}</span><b>{bandOk ? `${industry ? `${industry} ` : ''}${lo}-${hi}% ${zh ? '已对照' : 'checked'}` : zh ? '未对照' : 'n/a'}</b></div>
          <div><span>{zh ? '结果快照' : 'SNAPSHOT'}</span><b>{cash.length > 0 ? (zh ? 'output_json 已生成' : 'emitted') : zh ? '待生成' : 'pending'}</b></div>
        </div>
      </div>
      {assume && (
        <p className="bd-footnote">
          <i className="bd-src pending">{zh ? '口径待核验' : 'to verify'}</i>
          {zh ? '关键假设' : 'ASSUMPTIONS'} · {clampStr(assume, 160)}
        </p>
      )}
    </div>
  );
};

export default BoardA4Finance;
