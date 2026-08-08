import React, { useMemo, useState } from 'react';
import { useT, type MessageKeys } from '../i18n';
import {
  composeProjectPrompt,
  INTAKE_GOAL_IDS,
  type IntakeGoal,
} from '../lib/intake';
import styles from './IntakeWizard.module.css';

/**
 * IntakeWizard — step-by-step guided project intake.
 *
 * Instead of asking the user for one long free-form description, the wizard
 * collects each required condition one at a time:
 *   1 城市/区位 → 2 现状与产权 → 3 规模指标 → 4 拟改造方向 → 5 测算目标
 * …then composes and previews the final prompt before sending.
 */

const DIRECTION_KEYS: MessageKeys[] = [
  'wizard.dir1', 'wizard.dir2', 'wizard.dir3',
  'wizard.dir4', 'wizard.dir5', 'wizard.dirOther',
];

const GOAL_META: Record<IntakeGoal, { labelKey: MessageKeys; descKey: MessageKeys }> = {
  full:    { labelKey: 'wizard.goalFull',    descKey: 'wizard.goalFullDesc' },
  finance: { labelKey: 'wizard.goalFinance', descKey: 'wizard.goalFinanceDesc' },
  model:   { labelKey: 'wizard.goalModel',   descKey: 'wizard.goalModelDesc' },
  risk:    { labelKey: 'wizard.goalRisk',    descKey: 'wizard.goalRiskDesc' },
};

interface Props {
  onSend: (text: string) => void;
  disabled?: boolean;
}

export const IntakeWizard: React.FC<Props> = ({ onSend, disabled }) => {
  const { t, lang } = useT();

  const [step, setStep] = useState(0); // 0..4 = questions, 5 = preview
  const [city, setCity] = useState('');
  const [current, setCurrent] = useState('');
  const [scale, setScale] = useState('');
  const [direction, setDirection] = useState('');   // chip label or custom text
  const [customDir, setCustomDir] = useState('');
  const [goal, setGoal] = useState<IntakeGoal | null>(null);

  const isCustomDir = direction === '__custom__';
  const effectiveDirection = isCustomDir ? customDir : direction;

  const canNext = useMemo(() => {
    switch (step) {
      case 0: return city.trim().length > 0;
      case 1: return current.trim().length > 0;
      case 2: return scale.trim().length > 0;
      case 3: return isCustomDir ? customDir.trim().length > 0 : direction.length > 0;
      case 4: return goal !== null;
      default: return true;
    }
  }, [step, city, current, scale, direction, customDir, isCustomDir, goal]);

  const composed = goal
    ? composeProjectPrompt({ city, current, scale, direction: effectiveDirection, goal }, lang)
    : null;

  const restart = () => {
    setStep(0);
    setCity(''); setCurrent(''); setScale('');
    setDirection(''); setCustomDir(''); setGoal(null);
  };

  const handleSend = () => {
    if (!composed || disabled) return;
    onSend(composed);
    restart();
  };

  const textStep = (
    qKey: MessageKeys, phKey: MessageKeys,
    value: string, setter: (v: string) => void,
  ) => (
    <>
      <p className={styles.question}>{t(qKey)}</p>
      <input
        className={styles.input}
        value={value}
        onChange={e => setter(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && canNext) setStep(s => s + 1);
        }}
        placeholder={t(phKey)}
        autoFocus
      />
    </>
  );

  return (
    <div className={styles.wizard}>
      {/* progress dots */}
      <div className={styles.progress}>
        {[0, 1, 2, 3, 4].map(i => (
          <span
            key={i}
            className={`${styles.pDot} ${i < step ? styles.pDotDone : ''} ${i === step ? styles.pDotNow : ''}`}
          />
        ))}
        <span className={styles.pText}>
          {step < 5 ? `${t('wizard.step')} ${step + 1} / 5` : t('wizard.previewStep')}
        </span>
      </div>

      {step === 0 && textStep('wizard.qCity', 'wizard.qCityPh', city, setCity)}
      {step === 1 && textStep('wizard.qCurrent', 'wizard.qCurrentPh', current, setCurrent)}
      {step === 2 && textStep('wizard.qScale', 'wizard.qScalePh', scale, setScale)}

      {step === 3 && (
        <>
          <p className={styles.question}>{t('wizard.qDirection')}</p>
          <div className={styles.chips}>
            {DIRECTION_KEYS.map(k => {
              const label = t(k);
              const isOther = k === 'wizard.dirOther';
              const selected = isOther ? isCustomDir : direction === label;
              return (
                <button
                  key={k}
                  type="button"
                  className={`${styles.chip} ${selected ? styles.chipOn : ''}`}
                  onClick={() => setDirection(isOther ? '__custom__' : label)}
                >
                  {label}
                </button>
              );
            })}
          </div>
          {isCustomDir && (
            <input
              className={styles.input}
              value={customDir}
              onChange={e => setCustomDir(e.target.value)}
              placeholder={t('wizard.dirCustomPh')}
              autoFocus
            />
          )}
        </>
      )}

      {step === 4 && (
        <>
          <p className={styles.question}>{t('wizard.qGoal')}</p>
          <div className={styles.goalGrid}>
            {INTAKE_GOAL_IDS.map(g => (
              <button
                key={g}
                type="button"
                className={`${styles.goalCard} ${goal === g ? styles.goalCardOn : ''}`}
                onClick={() => setGoal(g)}
              >
                <span className={styles.goalLabel}>{t(GOAL_META[g].labelKey)}</span>
                <span className={styles.goalDesc}>{t(GOAL_META[g].descKey)}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {step === 5 && (
        <>
          <p className={styles.question}>{t('wizard.previewTitle')}</p>
          <div className={styles.preview}>
            <p className={styles.previewText}>{composed}</p>
          </div>
        </>
      )}

      {/* footer nav */}
      <div className={styles.nav}>
        {step > 0 && step < 5 && (
          <button type="button" className={styles.navGhost} onClick={() => setStep(s => s - 1)}>
            ← {t('wizard.back')}
          </button>
        )}
        {step === 5 && (
          <button type="button" className={styles.navGhost} onClick={restart}>
            ↺ {t('wizard.restart')}
          </button>
        )}
        {step < 4 && (
          <button
            type="button"
            className={styles.navPrimary}
            onClick={() => canNext && setStep(s => s + 1)}
            disabled={!canNext}
          >
            {t('wizard.next')} →
          </button>
        )}
        {step === 4 && (
          <button
            type="button"
            className={styles.navPrimary}
            onClick={() => canNext && setStep(5)}
            disabled={!canNext}
          >
            {t('wizard.generate')} →
          </button>
        )}
        {step === 5 && (
          <button
            type="button"
            className={styles.navSend}
            onClick={handleSend}
            disabled={!composed || disabled}
          >
            ⬆ {t('wizard.send')}
          </button>
        )}
      </div>
    </div>
  );
};

export default IntakeWizard;
