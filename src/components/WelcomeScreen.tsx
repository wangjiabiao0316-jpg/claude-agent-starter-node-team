import React from 'react';
import { useT, type MessageKeys } from '../i18n';
import styles from './WelcomeScreen.module.css';

/**
 * WelcomeScreen — shown in the chat column while the conversation is empty.
 *
 * Tells the user WHAT to type (a natural-language project description) and
 * offers four domain example cards that send a ready-made prompt on click.
 */

interface ExampleCard {
  titleKey: MessageKeys;
  textKey: MessageKeys;
}

const EXAMPLES: ExampleCard[] = [
  { titleKey: 'welcome.ex1Title', textKey: 'welcome.ex1Text' },
  { titleKey: 'welcome.ex2Title', textKey: 'welcome.ex2Text' },
  { titleKey: 'welcome.ex3Title', textKey: 'welcome.ex3Text' },
  { titleKey: 'welcome.ex4Title', textKey: 'welcome.ex4Text' },
];

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

      <div className={styles.cards}>
        {EXAMPLES.map(ex => (
          <button
            key={ex.titleKey}
            type="button"
            className={styles.card}
            onClick={() => !disabled && onSend(t(ex.textKey))}
            disabled={disabled}
          >
            <span className={styles.cardTitle}>{t(ex.titleKey)}</span>
            <span className={styles.cardText}>{t(ex.textKey)}</span>
            <span className={styles.cardArrow}>→</span>
          </button>
        ))}
      </div>

      <p className={styles.foot}>{t('welcome.foot')}</p>
    </div>
  );
};

export default WelcomeScreen;
