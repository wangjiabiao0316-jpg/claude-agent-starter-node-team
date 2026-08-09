import React, { useEffect } from 'react';
import type { IntakeWarning } from '../types';
import { useT, type MessageKeys } from '../i18n';
import styles from './IntakeWarningModal.module.css';

interface Props {
  warning: IntakeWarning | null;
  onConfirmSkip: () => void;
  onReturnToFill: () => void;
}

// Task 17 will add real i18n keys (wizard.warning*). Until then cast string
// literals to MessageKeys so t() accepts them under TS strict mode.
const WARNING_TITLE = 'wizard.warningTitle' as MessageKeys;
const WARNING_SEVERITY_BLOCKER = 'wizard.warningSeverityBlocker' as MessageKeys;
const WARNING_SEVERITY_DEGRADED = 'wizard.warningSeverityDegraded' as MessageKeys;
const WARNING_CONSEQUENCE = 'wizard.warningConsequence' as MessageKeys;
const WARNING_TECH_REF = 'wizard.warningTechRef' as MessageKeys;
const WARNING_SUGGESTION = 'wizard.warningSuggestion' as MessageKeys;
const WARNING_RETURN = 'wizard.warningReturn' as MessageKeys;
const WARNING_CONFIRM_SKIP = 'wizard.warningConfirmSkip' as MessageKeys;

const IntakeWarningModal: React.FC<Props> = ({ warning, onConfirmSkip, onReturnToFill }) => {
  const { t } = useT();

  useEffect(() => {
    if (!warning) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onReturnToFill();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [warning, onReturnToFill]);

  if (!warning) return null;

  const severityLabel = warning.severity === 'blocker'
    ? t(WARNING_SEVERITY_BLOCKER)
    : t(WARNING_SEVERITY_DEGRADED);

  const severityClass = warning.severity === 'blocker'
    ? styles.severityBlocker
    : styles.severityDegraded;

  return (
    <div className={styles.overlay} onClick={onReturnToFill}>
      <div
        className={styles.modal}
        role="alertdialog"
        aria-modal="true"
        onClick={e => e.stopPropagation()}
      >
        <div className={styles.header}>
          <span className={styles.icon}>⚠️</span>
          <span className={styles.title}>{t(WARNING_TITLE)}</span>
          <span className={`${styles.severity} ${severityClass}`}>
            {severityLabel}
          </span>
        </div>

        <div className={styles.body}>
          <p className={styles.fieldName}>{warning.fieldName} <code className={styles.code}>{warning.fieldKey}</code></p>

          <section className={styles.section}>
            <h4 className={styles.sectionTitle}>{t(WARNING_CONSEQUENCE)}</h4>
            <p className={styles.sectionBody}>{warning.consequence}</p>
          </section>

          <section className={styles.section}>
            <h4 className={styles.sectionTitle}>{t(WARNING_TECH_REF)}</h4>
            <p className={styles.sectionBody}><code className={styles.code}>{warning.technicalRef}</code></p>
          </section>

          <section className={styles.section}>
            <h4 className={styles.sectionTitle}>{t(WARNING_SUGGESTION)}</h4>
            <p className={styles.sectionBody}>{warning.suggestion}</p>
          </section>
        </div>

        <div className={styles.footer}>
          <button type="button" className={styles.btnSecondary} onClick={onReturnToFill} autoFocus>
            📋 {t(WARNING_RETURN)}
          </button>
          <button type="button" className={styles.btnPrimary} onClick={onConfirmSkip}>
            {t(WARNING_CONFIRM_SKIP)} →
          </button>
        </div>
      </div>
    </div>
  );
};

export default IntakeWarningModal;
