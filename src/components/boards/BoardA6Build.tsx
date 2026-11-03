import React from 'react';
import { useT } from '../../i18n';
import { BDSection, ActionCard, Banner, LampBadge, clampStr, lampOf, objOf, str } from './shared';
import { classifyStatus, type Tone } from '../../lib/conclusionMatrix';

/**
 * BoardA6Build — A6 建造判别（agent7-建造判别）专属展板。
 *
 * 业务语义：JEV 判别式引擎五连判（结构潜力 / 消防转换 / 卫生间技术路线 /
 * 直接否决项 / 综合判定），每项挂 GB/CJJ 条文依据链；缺结构鉴定时按
 * GB55021「鉴定先行」返回 fatal_blocker=no_assessment 拒绝判断。
 * 后端 schema 未固化：固定五判项骨架按关键词入座，落不进骨架的字段
 * 进容错平铺区，schema 演进不破版式。
 */

interface CheckRow {
  title: string;
  icon: string;
  text: string;
  evidence: string;
  tone: Tone | null;
}

/** 五判项骨架：匹配顺序即优先级（具体判项先于综合判定） */
const SEATS: Array<{ match: RegExp; title: string; icon: string }> = [
  { match: /结构/, title: '结构潜力', icon: '🧱' },
  { match: /消防/, title: '消防转换', icon: '🔥' },
  { match: /卫生间|如厕/, title: '卫生间技术路线', icon: '🚿' },
  { match: /否决|fatal/i, title: '直接否决项', icon: '⛔' },
];

const SKIP_KEYS = new Set(['agent', '灯色', '校验灯', '建议动作', 'fatal_blocker']);

/** 判项值 → 展示行：对象取 判定/结论/结果 主文本 + 依据/条文/规范 证据链 */
function makeRow(seat: { title: string; icon: string }, v: unknown): CheckRow {
  const o = objOf(v);
  const text =
    (o && Object.keys(o).length > 0
      ? str(o['判定']) || str(o['结论']) || str(o['结果']) || str(o['说明']) || str(o['技术路线']) || JSON.stringify(o)
      : str(v));
  const evidence = o && Object.keys(o).length > 0
    ? [str(o['依据']), str(o['条文']), str(o['规范']), str(o['标准']), str(o['依据条款'])].filter(Boolean).join('；')
    : '';
  const status = classifyStatus(clampStr(text, 24));
  return {
    title: seat.title,
    icon: seat.icon,
    text: clampStr(text, 180),
    evidence: clampStr(evidence, 120),
    tone: status.tone === 'neutral' ? null : status.tone,
  };
}

export const BoardA6Build: React.FC<{ json: Record<string, unknown> }> = ({ json }) => {
  const { lang } = useT();
  const zh = lang === 'zh';

  const lamp = lampOf(json);
  const action = str(json['建议动作']);
  const fatalState = str(json['fatal_blocker']);

  const entries = Object.entries(json).filter(([k]) => !k.startsWith('_') && !SKIP_KEYS.has(k));
  const used = new Set<string>();
  const rows: CheckRow[] = [];

  // 四个具体判项按关键词入座（键名或值前段命中即取）
  for (const seat of SEATS) {
    const hit = entries.find(([k, v]) => !used.has(k) && (seat.match.test(k) || seat.match.test(str(v).slice(0, 40))));
    if (hit) {
      used.add(hit[0]);
      rows.push(makeRow(seat, hit[1]));
    }
  }
  // 第五席「综合判定」吃剩余的判定性字段
  const comp = entries.find(([k]) => !used.has(k) && /综合|总体|判定|结论/.test(k));
  if (comp) {
    used.add(comp[0]);
    rows.push(makeRow({ title: zh ? '综合判定' : 'Overall', icon: '🧭' }, comp[1]));
  }
  const misc = entries.filter(([k]) => !used.has(k));

  const fatal = rows.find((r) => r.title === (zh ? '直接否决项' : 'veto') && r.tone === 'red');

  return (
    <div className="bd">
      <div className={`bd-hero ${lamp ?? ''}`}>
        <div className="bd-hero-main">
          <p className="eyebrow">BUILD DISCRIMINATION · JEV 建造判别</p>
          <div className="bd-hero-title">
            {fatalState
              ? (zh ? '鉴定先行 · 暂缓判断' : 'assessment first')
              : fatal
                ? (zh ? '存在直接否决项' : 'fatal veto')
                : lamp
                  ? (zh ? '五连判完成' : 'five checks done')
                  : '—'}
          </div>
          <div className="bd-hero-sub">
            {zh
              ? '结构潜力 / 消防转换 / 卫生间技术路线 / 直接否决项 · GB/CJJ 条文依据链'
              : 'structure / fire / toilet route / veto · GB-CJJ chain'}
          </div>
        </div>
        <LampBadge lamp={lamp} big />
      </div>

      {/* GB55021 鉴定先行：缺结构鉴定是合规性拒判，不是故障 */}
      {fatalState && (
        <Banner tone="gold">
          📋 {zh
            ? `缺结构鉴定报告（fatal_blocker = ${fatalState}）—— 按 GB55021「鉴定先行」拒绝判断，请补充结构鉴定报告后重跑本环节`
            : `no structural assessment (${fatalState}) — GB55021 requires assessment first`}
        </Banner>
      )}
      {fatal && (
        <Banner tone="red">⛔ {zh ? '命中直接否决项 —— 该建造路径不可行，需调整改造方案' : 'fatal veto hit'}</Banner>
      )}

      {rows.length > 0 && (
        <BDSection title={zh ? 'JEV 五连判' : 'FIVE CHECKS'}>
          <div className="bd-check">
            {rows.map((r) => (
              <div key={r.title} className="bd-checkrow">
                <span className="bd-check-ico" aria-hidden="true">{r.icon}</span>
                <span className="bd-check-name">{r.title}</span>
                {r.tone ? (
                  <span className={`lamp-badge ${r.tone}`}>
                    {r.tone === 'green' ? (zh ? '可行' : 'ok') : r.tone === 'yellow' ? (zh ? '有条件' : 'cond.') : (zh ? '否决' : 'veto')}
                  </span>
                ) : (
                  <span className="bd-chip">{zh ? '待定' : 'n/a'}</span>
                )}
                <span className="bd-check-text">
                  {r.text}
                  {r.evidence && <small className="bd-check-evi">依据 · {r.evidence}</small>}
                </span>
              </div>
            ))}
          </div>
        </BDSection>
      )}

      {misc.length > 0 && (
        <BDSection title={zh ? '其他判别要素' : 'MORE'}>
          <div className="ab-kv">
            {misc.map(([k, v]) => (
              <div key={k} className="ab-kv-row">
                <span className="ab-kv-key">{k}</span>
                <span className="ab-kv-val" title={str(v)}>{clampStr(str(v), 90)}</span>
              </div>
            ))}
          </div>
        </BDSection>
      )}

      {action && (
        <ActionCard>
          <p>{action}</p>
        </ActionCard>
      )}
    </div>
  );
};

export default BoardA6Build;
