import React from 'react';
import { useT } from '../i18n';
import IntakeWizard from './IntakeWizard';
import styles from './WelcomeScreen.module.css';

/**
 * WelcomeScreen — shown in the chat column while the conversation is empty.
 *
 * Guides the user through the required project conditions ONE AT A TIME
 * (IntakeWizard), then composes and sends the final project description.
 */

interface Props {
  onSend: (text: string) => void;
  disabled?: boolean;
}

export const WelcomeScreen: React.FC<Props> = ({ onSend, disabled }) => {
  const { t } = useT();

  return (
    <div className={styles.welcome}>
      <p className={styles.eyebrow}>{t('welcome.eyebrow')}</p>
      <h1 className={styles.title}>{t('welcome.title')}</h1>
      <p className={styles.subtitle}>{t('welcome.subtitle')}</p>

      <div className={styles.guideBox}>
        <span className={styles.guideGlyph}>◈</span>
        <p className={styles.guide}>{t('welcome.guide')}</p>
      </div>

      <IntakeWizard onSend={onSend} disabled={disabled} />

      <p className={styles.foot}>{t('welcome.foot')}</p>
    </div>
  );
};

export default WelcomeScreen;
