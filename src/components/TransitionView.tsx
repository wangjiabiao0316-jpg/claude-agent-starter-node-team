import React from 'react';
import { useT, MessageKeys } from '../i18n';

/**
 * TransitionView — V4.0 大气版新建项目过渡页（transition-grid 两栏）。
 *
 *   左 .transition-main —— 三步骤卡（建立档案 → 整理资料 → 进入 Agent）
 *                          + 金边提示条 + 底部操作区
 *   右 .transition-side —— 创建前准备清单（ready-line 五项，金色序号）
 *
 * 点击「进入 Agent」回调 onStart → setUiStage('input') 进入 22 字段采集。
 * 纯展示页，不含业务逻辑。
 */
interface Props {
  /** 点击「进入 Agent」时触发，父组件据此进入 input 屏（IntakeWizard） */
  onStart: () => void;
}

const STEPS: { num: string; title: MessageKeys; desc: MessageKeys }[] = [
  { num: '01', title: 'transition.step1Title', desc: 'transition.step1Desc' },
  { num: '02', title: 'transition.step2Title', desc: 'transition.step2Desc' },
  { num: '03', title: 'transition.step3Title', desc: 'transition.step3Desc' },
];

const CHECKLIST: MessageKeys[] = [
  'transition.check1',
  'transition.check2',
  'transition.check3',
  'transition.check4',
  'transition.check5',
];

export const TransitionView: React.FC<Props> = ({ onStart }) => {
  const { t } = useT();

  return (
    <section className="screen active">
      <div className="shell">
        <div className="transition-grid">
          {/* —— 左：三步骤 —— */}
          <div className="panel transition-main">
            <p className="eyebrow">{t('transition.eyebrow')}</p>
            <h2>{t('transition.title')}</h2>
            <p className="muted" style={{ fontSize: 12 }}>{t('transition.subtitle')}</p>

            <div className="transition-steps">
              {STEPS.map((s) => (
                <div key={s.num} className="transition-step">
                  <strong>{s.num} · {t(s.title)}</strong>
                  <p>{t(s.desc)}</p>
                </div>
              ))}
            </div>

            <div className="transition-note">
              {t('welcome.guide')}
            </div>

            <div className="transition-actions">
              <button type="button" className="btn primary" onClick={onStart}>
                {t('transition.cta')}
              </button>
            </div>
          </div>

          {/* —— 右：创建前准备清单 —— */}
          <div className="panel transition-side">
            <p className="eyebrow">CHECKLIST</p>
            <h3>{t('transition.sideTitle')}</h3>
            {CHECKLIST.map((key, i) => (
              <div key={key} className="ready-line">
                <b>{String(i + 1).padStart(2, '0')}</b>
                {t(key)}
              </div>
            ))}
            <p className="dim" style={{ fontSize: 9, letterSpacing: 2, marginTop: 16 }}>
              {t('management.createFoot')}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default TransitionView;
