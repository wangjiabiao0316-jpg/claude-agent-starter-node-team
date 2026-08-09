import React from 'react';
import { useT } from '../i18n';
import styles from './StopButton.module.css';

interface Props {
  visible: boolean;
  onStop: () => void;
}

const StopButton: React.FC<Props> = ({ visible, onStop }) => {
  const { t } = useT();
  if (!visible) return null;
  return (
    <button
      type="button"
      className={styles.btn}
      onClick={onStop}
      aria-label={t('aria.stopGeneration')}
      title={t('aria.stopGeneration')}
    >
      <svg viewBox="0 0 20 20" fill="none" width="12" height="12" aria-hidden>
        <rect x="4" y="4" width="12" height="12" rx="2" fill="currentColor" />
      </svg>
      <span className={styles.label}>{t('aria.stopGeneration')}</span>
    </button>
  );
};

export default StopButton;
