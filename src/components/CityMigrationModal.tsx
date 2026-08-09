import React from 'react';
import { useT, type MessageKeys } from '../i18n';
import styles from './CityMigrationModal.module.css';

interface Props {
  open: boolean;
  previousCity: string;
  onAcknowledge: () => void;
}

// Task 17 will add real i18n keys (wizard.cityMigration*). Until then cast
// string literals to MessageKeys so t() accepts them under TS strict mode.
const CITY_MIGRATION_TITLE = 'wizard.cityMigrationTitle' as MessageKeys;
const CITY_MIGRATION_BODY = 'wizard.cityMigrationBody' as MessageKeys;
const CITY_MIGRATION_ACK = 'wizard.cityMigrationAck' as MessageKeys;

const CityMigrationModal: React.FC<Props> = ({ open, previousCity, onAcknowledge }) => {
  const { t } = useT();
  if (!open) return null;
  return (
    <div className={styles.overlay}>
      <div className={styles.modal} role="alertdialog" aria-modal="true">
        <div className={styles.header}>
          <span className={styles.icon}>⚠️</span>
          <span className={styles.title}>{t(CITY_MIGRATION_TITLE)}</span>
        </div>
        <div className={styles.body}>
          <p className={styles.text}>
            {t(CITY_MIGRATION_BODY).replace('{city}', previousCity)}
          </p>
        </div>
        <div className={styles.footer}>
          <button type="button" className={styles.btnPrimary} onClick={onAcknowledge} autoFocus>
            {t(CITY_MIGRATION_ACK)}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CityMigrationModal;
