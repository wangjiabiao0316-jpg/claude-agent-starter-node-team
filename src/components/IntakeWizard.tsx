import React, { useMemo, useState } from 'react';
import { useT, type MessageKeys } from '../i18n';
import {
  composeProjectPrompt,
  intakeValuesToPrompt,
  INTAKE_WARNINGS,
  PILOT_CITIES_15,
  DUAL_LIST_CITIES,
  type IntakeValues,
} from '../lib/intake';
import CityMigrationModal from './CityMigrationModal';
import IntakeWarningModal from './IntakeWarningModal';
import styles from './IntakeWizard.module.css';

// Task 17 will add real i18n keys for wizard.qLocation / wizard.field.*.label /
// wizard.field.*.placeholder / wizard.field.*.hint. Until then cast string
// literals to MessageKeys so t() accepts them under TS strict mode.
const Q_LOCATION = 'wizard.qLocation' as MessageKeys;
const Q_LOCATION_PH = 'wizard.qLocationPh' as MessageKeys;
const FIELD_OWNER_TYPE_LABEL = 'wizard.field.owner_type.label' as MessageKeys;
const FIELD_PROPERTY_CERT_LABEL = 'wizard.field.property_cert.label' as MessageKeys;
const FIELD_PROPERTY_CERT_PH = 'wizard.field.property_cert.placeholder' as MessageKeys;
const FIELD_HERITAGE_LEVEL_LABEL = 'wizard.field.heritage_level.label' as MessageKeys;
const FIELD_CURRENT_STATUS_LABEL = 'wizard.field.current_status.label' as MessageKeys;
const FIELD_CURRENT_STATUS_PH = 'wizard.field.current_status.placeholder' as MessageKeys;
const FIELD_BUILDING_AREA_LABEL = 'wizard.field.building_area.label' as MessageKeys;
const FIELD_BUILDING_AREA_PH = 'wizard.field.building_area.placeholder' as MessageKeys;
const FIELD_STRUCTURE_TYPE_LABEL = 'wizard.field.structure_type.label' as MessageKeys;
const FIELD_HEIGHT_M_LABEL = 'wizard.field.height_m.label' as MessageKeys;
const FIELD_HEIGHT_M_PH = 'wizard.field.height_m.placeholder' as MessageKeys;
const FIELD_HEIGHT_M_HINT = 'wizard.field.height_m.hint' as MessageKeys;

// Task 13: Step 4-6 字段 i18n key casts (keys themselves added in Task 17)
const FIELD_INDUSTRY_LABEL = 'wizard.field.industry.label' as MessageKeys;
const FIELD_INDUSTRY_F8_HINT = 'wizard.field.industry.f8Hint' as MessageKeys;
const FIELD_RENOVATION_MODE_LABEL = 'wizard.field.renovation_mode.label' as MessageKeys;
const FIELD_INVESTMENT_LABEL = 'wizard.field.investment.label' as MessageKeys;
const FIELD_INVESTMENT_PH = 'wizard.field.investment.placeholder' as MessageKeys;
const FIELD_CAPITAL_RATIO_LABEL = 'wizard.field.capital_ratio.label' as MessageKeys;
const FIELD_CAPITAL_RATIO_HINT = 'wizard.field.capital_ratio.hint' as MessageKeys;
// Task 16: capital_ratio 安全区提示文案 (key 在 Task 17 加)
const FIELD_CAPITAL_RATIO_SAFE = 'wizard.field.capital_ratio.safe' as MessageKeys;
const FIELD_MORTGAGE_TYPE_LABEL = 'wizard.field.mortgage_type.label' as MessageKeys;
const FIELD_MORTGAGE_VALUE_LABEL = 'wizard.field.mortgage_value.label' as MessageKeys;
const FIELD_MORTGAGE_VALUE_PH = 'wizard.field.mortgage_value.placeholder' as MessageKeys;
const FIELD_MONTHLY_RENT_LABEL = 'wizard.field.monthly_rent.label' as MessageKeys;
const FIELD_MONTHLY_RENT_PH = 'wizard.field.monthly_rent.placeholder' as MessageKeys;
const FIELD_LEASABLE_AREA_LABEL = 'wizard.field.leasable_area.label' as MessageKeys;
const FIELD_LEASABLE_AREA_PH = 'wizard.field.leasable_area.placeholder' as MessageKeys;
const FIELD_HOLDING_YEARS_LABEL = 'wizard.field.holding_years.label' as MessageKeys;
const FIELD_HOLDING_YEARS_PH = 'wizard.field.holding_years.placeholder' as MessageKeys;
const FIELD_EXIT_STRATEGY_LABEL = 'wizard.field.exit_strategy.label' as MessageKeys;
const FIELD_OCCUPANCY_LABEL = 'wizard.field.occupancy.label' as MessageKeys;
const FIELD_EXIT_CAP_RATE_LABEL = 'wizard.field.exit_cap_rate.label' as MessageKeys;
const FIELD_EXIT_CAP_RATE_PH = 'wizard.field.exit_cap_rate.placeholder' as MessageKeys;
const FIELD_DISCOUNT_RATE_LABEL = 'wizard.field.discount_rate.label' as MessageKeys;
const FIELD_DISCOUNT_RATE_PH = 'wizard.field.discount_rate.placeholder' as MessageKeys;
const SECTION_REQUIRED = 'wizard.sectionRequired' as MessageKeys;
const SECTION_ADVANCED = 'wizard.sectionAdvanced' as MessageKeys;

// Task 14: Step 7 预览页 i18n key casts (keys themselves added in Task 17)
const PREVIEW_TITLE = 'wizard.previewTitle' as MessageKeys;
const PREVIEW_MISSING = 'wizard.previewMissing' as MessageKeys;
const PREVIEW_SHOW_PROMPT = 'wizard.previewShowPrompt' as MessageKeys;
const PREVIEW_AND_SUBMIT = 'wizard.previewAndSubmit' as MessageKeys;
const CONTINUE_SUBMIT = 'wizard.continueSubmit' as MessageKeys;
const RETURN_TO_FILL = 'wizard.returnToFill' as MessageKeys;

// Task 15: 15 城卡片 + 迁移弹窗 i18n key casts (keys themselves added in Task 17)
const Q_CITY = 'wizard.qCity' as MessageKeys;
const Q_CITY_PILOT_HINT = 'wizard.qCityPilotHint' as MessageKeys;
const CITY_NOT_IN_LIST = 'wizard.cityNotInList' as MessageKeys;

const TOTAL_STEPS = 6; // step 0..5 = questions, step 6 = preview

interface Props {
  onSend: (text: string) => void;
  disabled?: boolean;
}

const EMPTY_VALUES: IntakeValues = {
  city: '', location: '',
  owner_type: '', property_cert: '', heritage_level: '', current_status: '',
  building_area: null, structure_type: '', height_m: null,
  industry: '', renovation_mode: '',
  investment: null, capital_ratio: null, mortgage_type: '', mortgage_value: null,
  monthly_rent: null, leasable_area: null, holding_years: null, exit_strategy: '',
  occupancy: null, exit_cap_rate: null, discount_rate: null,
};

const P1_DEFAULTS: Record<string, string> = {
  occupancy: '85%', exit_cap_rate: '4.5%', discount_rate: '8%',
};

export const IntakeWizard: React.FC<Props> = ({ onSend, disabled }) => {
  const { t, lang } = useT();
  const [step, setStep] = useState(0);
  const [values, setValues] = useState<IntakeValues>(EMPTY_VALUES);
  const [skippedFields, setSkippedFields] = useState<Set<string>>(new Set());
  const [activeWarningField, setActiveWarningField] = useState<string | null>(null);
  const [cityMigrationOpen, setCityMigrationOpen] = useState<{ open: boolean; previousCity: string }>({
    open: false, previousCity: '',
  });

  // Task 15: mount-only 检测 — 若 localStorage 旧 city 不在 PILOT_CITIES_15,
  // 弹迁移说明 modal 并清空 city,避免直接把旧值灌进硬阻断。
  React.useEffect(() => {
    if (values.city && !PILOT_CITIES_15.includes(values.city)) {
      setCityMigrationOpen({ open: true, previousCity: values.city });
      update('city', '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const update = <K extends keyof IntakeValues>(key: K, value: IntakeValues[K]) => {
    setValues(v => ({ ...v, [key]: value }));
    // If user fills a previously-skipped field, clear the skipped mark
    if (skippedFields.has(key as string)) {
      setSkippedFields(s => {
        const next = new Set(s);
        next.delete(key as string);
        return next;
      });
    }
  };

  // === 跳过弹窗机制 ===
  // Bugfix: 之前 setTimeout(() => checkAndProceed(step), 0) 会捕获 stale
  // skippedFields,导致用户点"继续跳过"后弹窗再次出现同样的字段。
  // 修复:把核心逻辑提成纯函数 proceed(),接收最新的 skipped/values 参数;
  // handleConfirmSkip 用 newSkipped 同步调用,完全不依赖 setState 异步更新。
  const proceed = (currentStep: number, vals: IntakeValues, skipped: Set<string>, targetStep: number) => {
    // Task 15: city 硬阻断 — Step 1 → Step 2 时 city 必须从 PILOT_CITIES_15 选了
    if (currentStep === 0 && !PILOT_CITIES_15.includes(vals.city)) {
      return; // 静默阻止,UI 上的 city 卡片已显式标识
    }
    // Find first P0 field in current step that is empty AND not yet confirmed skipped
    const emptyP0 = getP0FieldsForStep(currentStep).find(k =>
      k !== 'city' && !skipped.has(k) && isFieldEmpty(vals, k),
    );
    if (emptyP0) {
      // city 不进入软警告(city 是硬阻断,UI 不允许空)
      setActiveWarningField(emptyP0);
      return;
    }
    setStep(targetStep);
  };

  const checkAndProceed = (nextStep: number) => {
    proceed(step, values, skippedFields, nextStep);
  };

  const activeWarning = activeWarningField
    ? {
        ...INTAKE_WARNINGS[activeWarningField as keyof IntakeValues],
        fieldName: t(`wizard.field.${activeWarningField}.label` as MessageKeys),
      }
    : null;

  const handleConfirmSkip = () => {
    if (!activeWarningField) return;
    const field = activeWarningField;
    // 计算最新的 skipped 副本,同步传给 proceed,避免 stale closure
    const newSkipped = new Set(skippedFields);
    newSkipped.add(field);
    setSkippedFields(newSkipped);
    setActiveWarningField(null);
    // 用 newSkipped 同步 proceed,不依赖 setState 异步更新,不触发 stale 弹窗
    proceed(step, values, newSkipped, step + 1);
  };

  const handleReturnToFill = () => {
    setActiveWarningField(null);
  };

  const composed = useMemo(() => {
    if (!clean(values.city)) return null;
    return composeProjectPrompt({
      values,
      skippedFields,
      defaultFields: P1_DEFAULTS,
      lang,
    });
  }, [values, skippedFields, lang]);

  // === Step 1: 基础地理 ===
  // (city 15 城卡片网格 + location 文本框 — Task 15 实现)
  // 这里先放占位 placeholder,Task 15 替换

  // === Step 2: 业权与现状 ===
  // 4 字段:owner_type / property_cert / heritage_level / current_status

  // === Step 3: 物理参数 ===
  // 3 字段:building_area / structure_type / height_m

  // Step 4-6 留给 Task 13;Step 7 留给 Task 14
  return (
    <div className={styles.wizard}>
      {/* progress dots */}
      <div className={styles.progress}>
        {Array.from({ length: TOTAL_STEPS }, (_, i) => (
          <span
            key={i}
            className={`${styles.pDot} ${i < step ? styles.pDotDone : ''} ${i === step ? styles.pDotNow : ''}`}
          />
        ))}
        <span className={styles.pText}>
          {step < TOTAL_STEPS ? `${t('wizard.step')} ${step + 1} / ${TOTAL_STEPS}` : t('wizard.previewStep')}
        </span>
      </div>

      {/* === Step 1: 基础地理 === */}
      {step === 0 && (
        <>
          <p className={styles.question}>{t(Q_CITY)}</p>
          <p className={styles.hint}>{t(Q_CITY_PILOT_HINT)}</p>
          <div className={styles.cityGrid}>
            {PILOT_CITIES_15.map(city => {
              const dual = DUAL_LIST_CITIES.includes(city);
              return (
                <button
                  key={city}
                  type="button"
                  className={`${styles.cityCard} ${values.city === city ? styles.cityCardOn : ''} ${dual ? styles.cityCardDual : ''}`}
                  onClick={() => update('city', city)}
                >
                  <span className={styles.cityName}>{city}</span>
                  {dual && <span className={styles.cityDual}>✓</span>}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            className={styles.notInList}
            onClick={() => setCityMigrationOpen({ open: true, previousCity: '' })}
          >
            {t(CITY_NOT_IN_LIST)}
          </button>

          <p className={styles.question}>{t(Q_LOCATION)}</p>
          <input
            className={styles.input}
            value={values.location}
            onChange={e => update('location', e.target.value)}
            placeholder={t(Q_LOCATION_PH)}
          />
        </>
      )}

      {/* === Step 2: 业权与现状 === */}
      {step === 1 && (
        <>
          <p className={styles.question}>{t(FIELD_OWNER_TYPE_LABEL)}</p>
          <div className={styles.cardRow}>
            {['国企', '民企', '混合所有制'].map(opt => (
              <button
                key={opt}
                type="button"
                className={`${styles.card} ${values.owner_type === opt ? styles.cardOn : ''}`}
                onClick={() => update('owner_type', opt)}
              >{opt}</button>
            ))}
          </div>

          <p className={styles.question}>{t(FIELD_PROPERTY_CERT_LABEL)}</p>
          <input
            className={styles.input}
            value={values.property_cert}
            onChange={e => update('property_cert', e.target.value)}
            placeholder={t(FIELD_PROPERTY_CERT_PH)}
          />

          <p className={styles.question}>{t(FIELD_HERITAGE_LEVEL_LABEL)}</p>
          <div className={styles.cardRow}>
            {['无文保', '建控地带', '核心保护'].map(opt => (
              <button
                key={opt}
                type="button"
                className={`${styles.card} ${values.heritage_level === opt ? styles.cardOn : ''}`}
                onClick={() => update('heritage_level', opt)}
              >{opt}</button>
            ))}
          </div>

          <p className={styles.question}>{t(FIELD_CURRENT_STATUS_LABEL)}</p>
          <textarea
            className={styles.textarea}
            value={values.current_status}
            onChange={e => update('current_status', e.target.value)}
            placeholder={t(FIELD_CURRENT_STATUS_PH)}
            rows={3}
          />
        </>
      )}

      {/* === Step 3: 物理参数 === */}
      {step === 2 && (
        <>
          <p className={styles.question}>{t(FIELD_BUILDING_AREA_LABEL)}</p>
          <input
            type="number" min={0} step={1}
            className={styles.input}
            value={values.building_area ?? ''}
            onChange={e => update('building_area', e.target.value === '' ? null : Number(e.target.value))}
            placeholder={t(FIELD_BUILDING_AREA_PH)}
          />

          <p className={styles.question}>{t(FIELD_STRUCTURE_TYPE_LABEL)}</p>
          <div className={styles.cardRow}>
            {['框架', '砖混', '木结构', '钢结构', '其他'].map(opt => (
              <button
                key={opt}
                type="button"
                className={`${styles.card} ${values.structure_type === opt ? styles.cardOn : ''}`}
                onClick={() => update('structure_type', opt)}
              >{opt}</button>
            ))}
          </div>

          <p className={styles.question}>{t(FIELD_HEIGHT_M_LABEL)}</p>
          <input
            type="number" min={0} step={0.1}
            className={styles.input}
            value={values.height_m ?? ''}
            onChange={e => update('height_m', e.target.value === '' ? null : Number(e.target.value))}
            placeholder={t(FIELD_HEIGHT_M_PH)}
          />
          <p className={styles.hint}>{t(FIELD_HEIGHT_M_HINT)}</p>
        </>
      )}

      {/* === Step 4: 业态与改造模式 === */}
      {step === 3 && (
        <>
          <p className={styles.question}>{t(FIELD_INDUSTRY_LABEL)}</p>
          <div className={styles.cardRow}>
            {['商业', '办公', '文旅', '工业仓储', '居住', '公共服务'].map(opt => (
              <button
                key={opt}
                type="button"
                className={`${styles.card} ${values.industry === opt ? styles.cardOn : ''}`}
                onClick={() => update('industry', opt)}
              >{opt}</button>
            ))}
          </div>
          {!['商业', '办公', '文旅'].includes(values.industry) && values.industry && (
            <p className={styles.hint}>{t(FIELD_INDUSTRY_F8_HINT)}</p>
          )}

          <p className={styles.question}>{t(FIELD_RENOVATION_MODE_LABEL)}</p>
          <div className={styles.cardRow}>
            {['拆除重建', '保留微更新', '混合'].map(opt => (
              <button
                key={opt}
                type="button"
                className={`${styles.card} ${values.renovation_mode === opt ? styles.cardOn : ''}`}
                onClick={() => update('renovation_mode', opt)}
              >{opt}</button>
            ))}
          </div>
        </>
      )}

      {/* === Step 5: 资金面 === */}
      {step === 4 && (
        <>
          <p className={styles.question}>{t(FIELD_INVESTMENT_LABEL)}</p>
          <input
            type="number" min={0} step={100}
            className={styles.input}
            value={values.investment ?? ''}
            onChange={e => update('investment', e.target.value === '' ? null : Number(e.target.value))}
            placeholder={t(FIELD_INVESTMENT_PH)}
          />

          <p className={styles.question}>{t(FIELD_CAPITAL_RATIO_LABEL)}</p>
          <div className={styles.sliderWrap}>
            <div className={styles.sliderTrack}>
              <div className={styles.safeZone} aria-hidden />
              <input
                type="range" min={0} max={100} step={1}
                className={`${styles.slider} ${styles.sliderCapital}`}
                value={values.capital_ratio ?? 0}
                onChange={e => update('capital_ratio', Number(e.target.value))}
              />
            </div>
            <span className={styles.sliderValue}>{values.capital_ratio ?? 0}%</span>
          </div>
          <p className={styles.hint}>
            {(values.capital_ratio ?? 0) >= 25 && (values.capital_ratio ?? 0) <= 30
              ? t(FIELD_CAPITAL_RATIO_SAFE)
              : t(FIELD_CAPITAL_RATIO_HINT)}
          </p>

          <p className={styles.question}>{t(FIELD_MORTGAGE_TYPE_LABEL)}</p>
          <div className={styles.cardRow}>
            {['土地使用权', '运营权', '收益权', '经营权', '收费权', '组合'].map(opt => (
              <button
                key={opt}
                type="button"
                className={`${styles.card} ${values.mortgage_type === opt ? styles.cardOn : ''}`}
                onClick={() => update('mortgage_type', opt)}
              >{opt}</button>
            ))}
          </div>

          <p className={styles.question}>{t(FIELD_MORTGAGE_VALUE_LABEL)}</p>
          <input
            type="number" min={0} step={100}
            className={styles.input}
            value={values.mortgage_value ?? ''}
            onChange={e => update('mortgage_value', e.target.value === '' ? null : Number(e.target.value))}
            placeholder={t(FIELD_MORTGAGE_VALUE_PH)}
          />
        </>
      )}

      {/* === Step 6: 财务与退出 === */}
      {step === 5 && (
        <>
          <p className={styles.sectionTitle}>{t(SECTION_REQUIRED)}</p>
          <p className={styles.question}>{t(FIELD_MONTHLY_RENT_LABEL)}</p>
          <input
            type="number" min={0} step={10}
            className={styles.input}
            value={values.monthly_rent ?? ''}
            onChange={e => update('monthly_rent', e.target.value === '' ? null : Number(e.target.value))}
            placeholder={t(FIELD_MONTHLY_RENT_PH)}
          />

          <p className={styles.question}>{t(FIELD_LEASABLE_AREA_LABEL)}</p>
          <input
            type="number" min={0} step={100}
            className={styles.input}
            value={values.leasable_area ?? ''}
            onChange={e => update('leasable_area', e.target.value === '' ? null : Number(e.target.value))}
            placeholder={t(FIELD_LEASABLE_AREA_PH)}
          />

          <p className={styles.question}>{t(FIELD_HOLDING_YEARS_LABEL)}</p>
          <input
            type="number" min={1} max={50} step={1}
            className={styles.input}
            value={values.holding_years ?? ''}
            onChange={e => update('holding_years', e.target.value === '' ? null : Number(e.target.value))}
            placeholder={t(FIELD_HOLDING_YEARS_PH)}
          />

          <p className={styles.question}>{t(FIELD_EXIT_STRATEGY_LABEL)}</p>
          <div className={styles.cardRow}>
            {['整体出售', '单层散售', 'REITs', '持有到期'].map(opt => (
              <button
                key={opt}
                type="button"
                className={`${styles.card} ${values.exit_strategy === opt ? styles.cardOn : ''}`}
                onClick={() => update('exit_strategy', opt)}
              >{opt}</button>
            ))}
          </div>

          <p className={styles.sectionTitle}>{t(SECTION_ADVANCED)}</p>

          <p className={styles.question}>{t(FIELD_OCCUPANCY_LABEL)}</p>
          <div className={styles.sliderWrap}>
            <input
              type="range" min={0} max={100} step={1}
              className={styles.slider}
              value={values.occupancy ?? 85}
              onChange={e => update('occupancy', Number(e.target.value))}
            />
            <span className={styles.sliderValue}>{values.occupancy ?? 85}%</span>
          </div>

          <p className={styles.question}>{t(FIELD_EXIT_CAP_RATE_LABEL)}</p>
          <input
            type="number" min={0} max={30} step={0.1}
            className={styles.input}
            value={values.exit_cap_rate ?? ''}
            onChange={e => update('exit_cap_rate', e.target.value === '' ? null : Number(e.target.value))}
            placeholder={t(FIELD_EXIT_CAP_RATE_PH)}
          />

          <p className={styles.question}>{t(FIELD_DISCOUNT_RATE_LABEL)}</p>
          <input
            type="number" min={0} max={50} step={0.1}
            className={styles.input}
            value={values.discount_rate ?? ''}
            onChange={e => update('discount_rate', e.target.value === '' ? null : Number(e.target.value))}
            placeholder={t(FIELD_DISCOUNT_RATE_PH)}
          />
        </>
      )}

      {/* === Step 7: 预览与提交 === */}
      {step === TOTAL_STEPS && (
        <>
          <p className={styles.question}>{t(PREVIEW_TITLE)}</p>

          {(() => {
            const missingP0 = countMissingP0(values, skippedFields);
            if (missingP0.length > 0) {
              return (
                <div className={styles.banner}>
                  <p className={styles.bannerTitle}>
                    {t(PREVIEW_MISSING).replace('{n}', String(missingP0.length))}
                  </p>
                  <ul className={styles.bannerList}>
                    {missingP0.slice(0, 5).map(k => (
                      <li key={k}>{t(`wizard.field.${k}.label` as MessageKeys)}</li>
                    ))}
                    {missingP0.length > 5 && <li>... ({missingP0.length - 5} more)</li>}
                  </ul>
                </div>
              );
            }
            return null;
          })()}

          <div className={styles.previewGrid}>
            {intakeValuesToPrompt(values).map((line, i) => (
              <p key={i} className={styles.previewLine}>{line}</p>
            ))}
          </div>

          {composed && (
            <details className={styles.promptDetails}>
              <summary className={styles.promptSummary}>{t(PREVIEW_SHOW_PROMPT)}</summary>
              <pre className={styles.promptPre}>{composed}</pre>
            </details>
          )}
        </>
      )}

      {/* footer nav */}
      <div className={styles.nav}>
        {step > 0 && step <= TOTAL_STEPS && (
          <button type="button" className={styles.navGhost} onClick={() => setStep(s => s - 1)}>
            ← {t('wizard.back')}
          </button>
        )}
        {step < TOTAL_STEPS - 1 && (
          <button
            type="button"
            className={styles.navPrimary}
            onClick={() => checkAndProceed(step + 1)}
          >
            {t('wizard.next')} →
          </button>
        )}
        {step === TOTAL_STEPS - 1 && (
          <button
            type="button"
            className={styles.navPrimary}
            onClick={() => checkAndProceed(TOTAL_STEPS)}
          >
            {t(PREVIEW_AND_SUBMIT)} →
          </button>
        )}
        {step === TOTAL_STEPS && (
          <>
            <button
              type="button"
              className={styles.navGhost}
              onClick={() => setStep(TOTAL_STEPS - 1)}
            >
              ← {t(RETURN_TO_FILL)}
            </button>
            <button
              type="button"
              className={styles.navSend}
              onClick={() => {
                if (composed && !disabled) {
                  onSend(composed);
                  setValues(EMPTY_VALUES);
                  setSkippedFields(new Set());
                  setStep(0);
                }
              }}
              disabled={!composed || disabled}
            >
              ⚠️ {t(CONTINUE_SUBMIT)}
            </button>
          </>
        )}
      </div>

      <IntakeWarningModal
        warning={activeWarning}
        onConfirmSkip={handleConfirmSkip}
        onReturnToFill={handleReturnToFill}
      />

      <CityMigrationModal
        open={cityMigrationOpen.open}
        previousCity={cityMigrationOpen.previousCity}
        onAcknowledge={() => setCityMigrationOpen({ open: false, previousCity: '' })}
      />
    </div>
  );
};

function clean(s: string): string {
  return s.trim();
}

function isFieldEmpty(v: IntakeValues, key: string): boolean {
  const val = v[key as keyof IntakeValues];
  if (val === null || val === undefined) return true;
  if (typeof val === 'string' && clean(val) === '') return true;
  return false;
}

function getP0FieldsForStep(step: number): string[] {
  // 每步包含的 P0 字段 key 列表(city 不在这里,因为 city 是硬阻断)
  switch (step) {
    case 0: return ['location'];            // Step 1: city 硬阻断 + location 软警告
    case 1: return ['owner_type', 'property_cert', 'heritage_level', 'current_status'];
    case 2: return ['building_area', 'structure_type']; // height_m 是 P1
    case 3: return ['industry', 'renovation_mode'];
    case 4: return ['investment', 'capital_ratio', 'mortgage_type', 'mortgage_value'];
    case 5: return ['monthly_rent', 'leasable_area', 'holding_years', 'exit_strategy'];
    default: return [];
  }
}

// Task 14: 统计 Step 7 预览页缺失的 P0 字段(不包括 city,因为 city 是硬阻断,
// Step 1 已经强制要求填)。返回缺失字段 key 数组,用于 banner 显示。
function countMissingP0(v: IntakeValues, skipped: Set<string>): string[] {
  const allP0 = [
    'location', 'owner_type', 'property_cert', 'heritage_level', 'current_status',
    'building_area', 'structure_type', 'industry', 'renovation_mode',
    'investment', 'capital_ratio', 'mortgage_type', 'mortgage_value',
    'monthly_rent', 'leasable_area', 'holding_years', 'exit_strategy',
  ];
  return allP0.filter(k =>
    !skipped.has(k) && isFieldEmpty(v, k),
  );
}

export default IntakeWizard;
