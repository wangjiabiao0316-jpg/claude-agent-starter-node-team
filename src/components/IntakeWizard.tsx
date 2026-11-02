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

// 22 字段采集向导（V4.0 input-grid 三栏皮肤）。
// i18n key cast 保持原样（keys 在 i18n 表中已存在）。
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

const FIELD_INDUSTRY_LABEL = 'wizard.field.industry.label' as MessageKeys;
const FIELD_INDUSTRY_F8_HINT = 'wizard.field.industry.f8Hint' as MessageKeys;
const FIELD_RENOVATION_MODE_LABEL = 'wizard.field.renovation_mode.label' as MessageKeys;
const FIELD_INVESTMENT_LABEL = 'wizard.field.investment.label' as MessageKeys;
const FIELD_INVESTMENT_PH = 'wizard.field.investment.placeholder' as MessageKeys;
const FIELD_CAPITAL_RATIO_LABEL = 'wizard.field.capital_ratio.label' as MessageKeys;
const FIELD_CAPITAL_RATIO_HINT = 'wizard.field.capital_ratio.hint' as MessageKeys;
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

const PREVIEW_TITLE = 'wizard.previewTitle' as MessageKeys;
const PREVIEW_MISSING = 'wizard.previewMissing' as MessageKeys;
const PREVIEW_SHOW_PROMPT = 'wizard.previewShowPrompt' as MessageKeys;
const PREVIEW_AND_SUBMIT = 'wizard.previewAndSubmit' as MessageKeys;
const CONTINUE_SUBMIT = 'wizard.continueSubmit' as MessageKeys;
const RETURN_TO_FILL = 'wizard.returnToFill' as MessageKeys;

const Q_CITY = 'wizard.qCity' as MessageKeys;
const Q_CITY_PILOT_HINT = 'wizard.qCityPilotHint' as MessageKeys;
const CITY_NOT_IN_LIST = 'wizard.cityNotInList' as MessageKeys;

const TOTAL_STEPS = 6; // step 0..5 = questions, step 6 = preview

// 左栏步骤名（双语内联：向导步骤标签未入 i18n 表）
const STEP_NAMES = [
  { zh: '城市与区位', en: 'City & Location' },
  { zh: '业权与现状', en: 'Ownership' },
  { zh: '物理参数', en: 'Physical Params' },
  { zh: '业态与改造', en: 'Industry & Mode' },
  { zh: '资金面', en: 'Capital' },
  { zh: '财务与退出', en: 'Finance & Exit' },
  { zh: '预览与提交', en: 'Preview & Send' },
];

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

// 重庆嘉陵五村 26 号示范案例（决赛路演 demo case，对齐 ConclusionView 演示态结论）
const DEMO_VALUES: IntakeValues = {
  city: '重庆',
  location: '江北区观音桥街道嘉陵五村 26 号',
  owner_type: '国企',
  property_cert: '渝(2023)江北区不动产权第 0526 号',
  heritage_level: '建控地带',
  current_status: '上世纪 90 年代砖混老旧住宅楼，现状出租率约 70%，临嘉陵江，交通便利，周边商业配套成熟，具备微更新改造条件。',
  building_area: 12000,
  structure_type: '砖混',
  height_m: 3.0,
  industry: '商业',
  renovation_mode: '保留微更新',
  investment: 4500,
  capital_ratio: 28,        // 落在 25-30% 资本金硬约束区间内
  mortgage_type: '运营权',
  mortgage_value: 6000,
  monthly_rent: 180,
  leasable_area: 10000,
  holding_years: 10,
  exit_strategy: 'REITs',
  occupancy: 85,            // P1，与默认值一致
  exit_cap_rate: 4.5,       // P1
  discount_rate: 8,         // P1
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

  // mount-only 检测 — 旧 city 不在 PILOT_CITIES_15 时弹迁移说明并清空
  React.useEffect(() => {
    if (values.city && !PILOT_CITIES_15.includes(values.city)) {
      setCityMigrationOpen({ open: true, previousCity: values.city });
      update('city', '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const update = <K extends keyof IntakeValues>(key: K, value: IntakeValues[K]) => {
    setValues(v => ({ ...v, [key]: value }));
    if (skippedFields.has(key as string)) {
      setSkippedFields(s => {
        const next = new Set(s);
        next.delete(key as string);
        return next;
      });
    }
  };

  // 一键填入重庆示范案例，回到 Step 1 让用户看到「重庆」已高亮，再逐步走完整流程
  const loadDemoCase = () => {
    setValues(DEMO_VALUES);
    setSkippedFields(new Set());
    setActiveWarningField(null);
    setStep(0);
  };

  // === 跳过弹窗机制（proceed 为纯函数，避免 stale skippedFields） ===
  const proceed = (currentStep: number, vals: IntakeValues, skipped: Set<string>, targetStep: number) => {
    // city 硬阻断 — Step 1 → Step 2 时必须从 PILOT_CITIES_15 选了城市
    if (currentStep === 0 && !PILOT_CITIES_15.includes(vals.city)) {
      return; // 静默阻止，city 卡片已显式标识
    }
    const emptyP0 = getP0FieldsForStep(currentStep).find(k =>
      k !== 'city' && !skipped.has(k) && isFieldEmpty(vals, k),
    );
    if (emptyP0) {
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
    const newSkipped = new Set(skippedFields);
    newSkipped.add(field);
    setSkippedFields(newSkipped);
    setActiveWarningField(null);
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

  // 右栏完整度：17 个 P0 + city = 18 项
  const completion = useMemo(() => {
    const filledP0 = ALL_P0.filter(k => !isFieldEmpty(values, k) || skippedFields.has(k)).length;
    const cityFilled = PILOT_CITIES_15.includes(values.city) ? 1 : 0;
    return { filled: filledP0 + cityFilled, total: ALL_P0.length + 1 };
  }, [values, skippedFields]);
  const completionPct = Math.round((completion.filled / completion.total) * 100);

  const stepName = (i: number) => (lang === 'zh' ? STEP_NAMES[i].zh : STEP_NAMES[i].en);

  return (
    <div className="input-grid">
      {/* —— 左：步骤导航（V4.0 .steps） —— */}
      <div className="panel pad">
        <div className="panel-head">
          <div>
            <div className="panel-title">{lang === 'zh' ? '采集步骤' : 'STEPS'}</div>
            <div className="panel-sub">{t('app.title')}</div>
          </div>
        </div>
        <div className="steps">
          {STEP_NAMES.map((s, i) => (
            <button
              key={s.zh}
              type="button"
              className={`step ${i === step ? 'active' : ''} ${i < step ? 'done' : ''}`}
              onClick={() => (i < step ? setStep(i) : i > step ? checkAndProceed(i) : undefined)}
            >
              <b>{i < step ? '✓' : String(i + 1).padStart(2, '0')}</b>
              {stepName(i)}
            </button>
          ))}
        </div>
        <hr className="rule" />
        <button
          type="button"
          className="btn ghost"
          style={{ width: '100%', marginBottom: 10 }}
          onClick={loadDemoCase}
          title={lang === 'zh' ? '一键填入重庆嘉陵五村 26 号示范案例' : 'Load Chongqing demo case'}
        >
          ⚡ {lang === 'zh' ? '填入示范案例' : 'Load demo case'}
        </button>
        <p className="dim" style={{ fontSize: 9, lineHeight: 1.8, letterSpacing: 0.5 }}>
          {t('welcome.foot')}
        </p>
      </div>

      {/* —— 中：当前步字段（V4.0 .field-grid） —— */}
      <div className="panel pad">
        <div className="page-head" style={{ marginBottom: 18 }}>
          <div>
            <p className="eyebrow">
              {step === TOTAL_STEPS
                ? (lang === 'zh' ? 'PREVIEW · 预览提交' : 'PREVIEW')
                : `${t('wizard.step')} ${step + 1} / ${TOTAL_STEPS}`}
            </p>
            <h1 style={{ fontSize: 24 }}>{stepName(step)}</h1>
          </div>
          <span className="tag neutral">
            {step === TOTAL_STEPS ? 'READY' : `Q${step + 1}`}
          </span>
        </div>

        {/* === Step 1: 城市与区位 === */}
        {step === 0 && (
          <div className="field-grid">
            <div className="field full">
              <label>{t(Q_CITY)}</label>
              <p className="field-hint" style={{ marginBottom: 8 }}>{t(Q_CITY_PILOT_HINT)}</p>
              <div className="city-grid">
                {PILOT_CITIES_15.map(city => {
                  const dual = DUAL_LIST_CITIES.includes(city);
                  return (
                    <button
                      key={city}
                      type="button"
                      className={`scenario ${values.city === city ? 'active' : ''}`}
                      style={{ justifyContent: 'center', position: 'relative' }}
                      onClick={() => update('city', city)}
                    >
                      {city}
                      {dual && <span title={lang === 'zh' ? '双名单城市' : 'dual-list'} style={{ color: 'var(--gold2)', marginLeft: 4 }}>✓</span>}
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                className="btn ghost"
                style={{ marginTop: 10, padding: '6px 10px', fontSize: 10 }}
                onClick={() => setCityMigrationOpen({ open: true, previousCity: '' })}
              >
                {t(CITY_NOT_IN_LIST)}
              </button>
            </div>
            <div className="field full">
              <label>{t(Q_LOCATION)}</label>
              <input
                value={values.location}
                onChange={e => update('location', e.target.value)}
                placeholder={t(Q_LOCATION_PH)}
              />
            </div>
          </div>
        )}

        {/* === Step 2: 业权与现状 === */}
        {step === 1 && (
          <div className="field-grid">
            <div className="field">
              <label>{t(FIELD_OWNER_TYPE_LABEL)}</label>
              {['国企', '民企', '混合所有制'].map(opt => (
                <button
                  key={opt}
                  type="button"
                  className={`scenario ${values.owner_type === opt ? 'active' : ''}`}
                  style={{ marginRight: 6, marginBottom: 6 }}
                  onClick={() => update('owner_type', opt)}
                >{opt}</button>
              ))}
            </div>
            <div className="field">
              <label>{t(FIELD_HERITAGE_LEVEL_LABEL)}</label>
              {['无文保', '建控地带', '核心保护'].map(opt => (
                <button
                  key={opt}
                  type="button"
                  className={`scenario ${values.heritage_level === opt ? 'active' : ''}`}
                  style={{ marginRight: 6, marginBottom: 6 }}
                  onClick={() => update('heritage_level', opt)}
                >{opt}</button>
              ))}
            </div>
            <div className="field full">
              <label>{t(FIELD_PROPERTY_CERT_LABEL)}</label>
              <input
                value={values.property_cert}
                onChange={e => update('property_cert', e.target.value)}
                placeholder={t(FIELD_PROPERTY_CERT_PH)}
              />
            </div>
            <div className="field full">
              <label>{t(FIELD_CURRENT_STATUS_LABEL)}</label>
              <textarea
                value={values.current_status}
                onChange={e => update('current_status', e.target.value)}
                placeholder={t(FIELD_CURRENT_STATUS_PH)}
                rows={3}
              />
            </div>
          </div>
        )}

        {/* === Step 3: 物理参数 === */}
        {step === 2 && (
          <div className="field-grid">
            <div className="field">
              <label>{t(FIELD_BUILDING_AREA_LABEL)}</label>
              <input
                type="number" min={0} step={1}
                value={values.building_area ?? ''}
                onChange={e => update('building_area', e.target.value === '' ? null : Number(e.target.value))}
                placeholder={t(FIELD_BUILDING_AREA_PH)}
              />
            </div>
            <div className="field">
              <label>{t(FIELD_HEIGHT_M_LABEL)}</label>
              <input
                type="number" min={0} step={0.1}
                value={values.height_m ?? ''}
                onChange={e => update('height_m', e.target.value === '' ? null : Number(e.target.value))}
                placeholder={t(FIELD_HEIGHT_M_PH)}
              />
              <p className="field-hint">{t(FIELD_HEIGHT_M_HINT)}</p>
            </div>
            <div className="field full">
              <label>{t(FIELD_STRUCTURE_TYPE_LABEL)}</label>
              {['框架', '砖混', '木结构', '钢结构', '其他'].map(opt => (
                <button
                  key={opt}
                  type="button"
                  className={`scenario ${values.structure_type === opt ? 'active' : ''}`}
                  style={{ marginRight: 6, marginBottom: 6 }}
                  onClick={() => update('structure_type', opt)}
                >{opt}</button>
              ))}
            </div>
          </div>
        )}

        {/* === Step 4: 业态与改造模式 === */}
        {step === 3 && (
          <div className="field-grid">
            <div className="field full">
              <label>{t(FIELD_INDUSTRY_LABEL)}</label>
              <div className="scenario-strip" style={{ margin: 0 }}>
                {['商业', '办公', '文旅', '工业仓储', '居住', '公共服务'].map(opt => (
                  <button
                    key={opt}
                    type="button"
                    className={`scenario ${values.industry === opt ? 'active' : ''}`}
                    onClick={() => update('industry', opt)}
                  >{opt}</button>
                ))}
              </div>
              {!['商业', '办公', '文旅'].includes(values.industry) && values.industry && (
                <p className="field-hint">{t(FIELD_INDUSTRY_F8_HINT)}</p>
              )}
            </div>
            <div className="field full">
              <label>{t(FIELD_RENOVATION_MODE_LABEL)}</label>
              <div className="scenario-strip" style={{ margin: 0 }}>
                {['拆除重建', '保留微更新', '混合'].map(opt => (
                  <button
                    key={opt}
                    type="button"
                    className={`scenario ${values.renovation_mode === opt ? 'active' : ''}`}
                    onClick={() => update('renovation_mode', opt)}
                  >{opt}</button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* === Step 5: 资金面 === */}
        {step === 4 && (
          <div className="field-grid">
            <div className="field">
              <label>{t(FIELD_INVESTMENT_LABEL)}</label>
              <input
                type="number" min={0} step={100}
                value={values.investment ?? ''}
                onChange={e => update('investment', e.target.value === '' ? null : Number(e.target.value))}
                placeholder={t(FIELD_INVESTMENT_PH)}
              />
            </div>
            <div className="field">
              <label>{t(FIELD_MORTGAGE_VALUE_LABEL)}</label>
              <input
                type="number" min={0} step={100}
                value={values.mortgage_value ?? ''}
                onChange={e => update('mortgage_value', e.target.value === '' ? null : Number(e.target.value))}
                placeholder={t(FIELD_MORTGAGE_VALUE_PH)}
              />
            </div>
            <div className="field full">
              <label>
                {t(FIELD_CAPITAL_RATIO_LABEL)}
                <span style={{ float: 'right', color: 'var(--gold2)', fontWeight: 700 }}>{values.capital_ratio ?? 0}%</span>
              </label>
              <input
                type="range" min={0} max={100} step={1}
                className="wx-range"
                value={values.capital_ratio ?? 0}
                onChange={e => update('capital_ratio', Number(e.target.value))}
              />
              <p className={`field-hint ${(values.capital_ratio ?? 0) >= 25 && (values.capital_ratio ?? 0) <= 30 ? 'safe' : ''}`}>
                {(values.capital_ratio ?? 0) >= 25 && (values.capital_ratio ?? 0) <= 30
                  ? t(FIELD_CAPITAL_RATIO_SAFE)
                  : t(FIELD_CAPITAL_RATIO_HINT)}
              </p>
            </div>
            <div className="field full">
              <label>{t(FIELD_MORTGAGE_TYPE_LABEL)}</label>
              <div className="scenario-strip" style={{ margin: 0 }}>
                {['土地使用权', '运营权', '收益权', '经营权', '收费权', '组合'].map(opt => (
                  <button
                    key={opt}
                    type="button"
                    className={`scenario ${values.mortgage_type === opt ? 'active' : ''}`}
                    onClick={() => update('mortgage_type', opt)}
                  >{opt}</button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* === Step 6: 财务与退出 === */}
        {step === 5 && (
          <div className="field-grid">
            <p className="eyebrow full" style={{ gridColumn: '1 / -1' }}>{t(SECTION_REQUIRED)}</p>
            <div className="field">
              <label>{t(FIELD_MONTHLY_RENT_LABEL)}</label>
              <input
                type="number" min={0} step={10}
                value={values.monthly_rent ?? ''}
                onChange={e => update('monthly_rent', e.target.value === '' ? null : Number(e.target.value))}
                placeholder={t(FIELD_MONTHLY_RENT_PH)}
              />
            </div>
            <div className="field">
              <label>{t(FIELD_LEASABLE_AREA_LABEL)}</label>
              <input
                type="number" min={0} step={100}
                value={values.leasable_area ?? ''}
                onChange={e => update('leasable_area', e.target.value === '' ? null : Number(e.target.value))}
                placeholder={t(FIELD_LEASABLE_AREA_PH)}
              />
            </div>
            <div className="field">
              <label>{t(FIELD_HOLDING_YEARS_LABEL)}</label>
              <input
                type="number" min={1} max={50} step={1}
                value={values.holding_years ?? ''}
                onChange={e => update('holding_years', e.target.value === '' ? null : Number(e.target.value))}
                placeholder={t(FIELD_HOLDING_YEARS_PH)}
              />
            </div>
            <div className="field">
              <label>{t(FIELD_EXIT_STRATEGY_LABEL)}</label>
              {['整体出售', '单层散售', 'REITs', '持有到期'].map(opt => (
                <button
                  key={opt}
                  type="button"
                  className={`scenario ${values.exit_strategy === opt ? 'active' : ''}`}
                  style={{ marginRight: 6, marginBottom: 6 }}
                  onClick={() => update('exit_strategy', opt)}
                >{opt}</button>
              ))}
            </div>
            <p className="eyebrow full" style={{ gridColumn: '1 / -1', marginTop: 6 }}>{t(SECTION_ADVANCED)}</p>
            <div className="field">
              <label>
                {t(FIELD_OCCUPANCY_LABEL)}
                <span style={{ float: 'right', color: 'var(--gold2)', fontWeight: 700 }}>{values.occupancy ?? 85}%</span>
              </label>
              <input
                type="range" min={0} max={100} step={1}
                className="wx-range"
                value={values.occupancy ?? 85}
                onChange={e => update('occupancy', Number(e.target.value))}
              />
            </div>
            <div className="field">
              <label>{t(FIELD_EXIT_CAP_RATE_LABEL)}</label>
              <input
                type="number" min={0} max={30} step={0.1}
                value={values.exit_cap_rate ?? ''}
                onChange={e => update('exit_cap_rate', e.target.value === '' ? null : Number(e.target.value))}
                placeholder={t(FIELD_EXIT_CAP_RATE_PH)}
              />
            </div>
            <div className="field full">
              <label>{t(FIELD_DISCOUNT_RATE_LABEL)}</label>
              <input
                type="number" min={0} max={50} step={0.1}
                value={values.discount_rate ?? ''}
                onChange={e => update('discount_rate', e.target.value === '' ? null : Number(e.target.value))}
                placeholder={t(FIELD_DISCOUNT_RATE_PH)}
              />
            </div>
          </div>
        )}

        {/* === Step 7: 预览与提交 === */}
        {step === TOTAL_STEPS && (
          <>
            <p className="muted" style={{ fontSize: 12, marginBottom: 12 }}>{t(PREVIEW_TITLE)}</p>

            {(() => {
              const missingP0 = countMissingP0(values, skippedFields);
              if (missingP0.length > 0) {
                return (
                  <div className="transition-note" style={{ marginBottom: 14 }}>
                    <b style={{ color: 'var(--gold2)' }}>
                      {t(PREVIEW_MISSING).replace('{n}', String(missingP0.length))}
                    </b>
                    <br />
                    {missingP0.slice(0, 5).map(k => t(`wizard.field.${k}.label` as MessageKeys)).join(' · ')}
                    {missingP0.length > 5 && ` ... (+${missingP0.length - 5})`}
                  </div>
                );
              }
              return null;
            })()}

            <div style={{ marginBottom: 14 }}>
              {intakeValuesToPrompt(values).map((line, i) => (
                <div key={i} className="file-row"><span>{line}</span></div>
              ))}
            </div>

            {composed && (
              <details>
                <summary className="dim" style={{ fontSize: 10, cursor: 'pointer', padding: '6px 0' }}>{t(PREVIEW_SHOW_PROMPT)}</summary>
                <pre className="agentpane-json">{composed}</pre>
              </details>
            )}
          </>
        )}

        {/* footer nav */}
        <hr className="rule" />
        <div className="transition-actions" style={{ marginTop: 0 }}>
          {step > 0 && step <= TOTAL_STEPS && (
            <button type="button" className="btn" onClick={() => setStep(s => s - 1)}>
              ← {t('wizard.back')}
            </button>
          )}
          {step < TOTAL_STEPS - 1 && (
            <button
              type="button"
              className="btn primary"
              onClick={() => checkAndProceed(step + 1)}
            >
              {t('wizard.next')} →
            </button>
          )}
          {step === TOTAL_STEPS - 1 && (
            <button
              type="button"
              className="btn primary"
              onClick={() => checkAndProceed(TOTAL_STEPS)}
            >
              {t(PREVIEW_AND_SUBMIT)} →
            </button>
          )}
          {step === TOTAL_STEPS && (
            <>
              <button
                type="button"
                className="btn"
                onClick={() => setStep(TOTAL_STEPS - 1)}
              >
                ← {t(RETURN_TO_FILL)}
              </button>
              <button
                type="button"
                className="btn primary"
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
      </div>

      {/* —— 右：区位 / 完整度 / 默认参数 —— */}
      <div className="side">
        <div className="panel pad">
          <div className="panel-head">
            <div>
              <div className="panel-title">{lang === 'zh' ? '项目区位' : 'CONTEXT'}</div>
              <div className="panel-sub">{values.city || (lang === 'zh' ? '待选择试点城市' : 'select a pilot city')}</div>
            </div>
            {PILOT_CITIES_15.includes(values.city) && <span className="tag good">15 城</span>}
          </div>
          <div className="map-thumb" />
          <p className="field-note">{values.location || (lang === 'zh' ? '区位描述待填写' : 'location pending')}</p>
        </div>

        <div className="panel pad">
          <div className="panel-head">
            <div>
              <div className="panel-title">{lang === 'zh' ? '资料完整度' : 'COMPLETENESS'}</div>
              <div className="panel-sub">P0 FIELDS</div>
            </div>
            <span className={`tag ${completionPct === 100 ? 'good' : completionPct >= 60 ? 'warn' : 'neutral'}`}>
              {completionPct}%
            </span>
          </div>
          <div className="progress"><i style={{ width: `${completionPct}%` }} /></div>
          <p className="field-note">{completion.filled} / {completion.total} {lang === 'zh' ? '项已就绪' : 'ready'}</p>
        </div>

        <div className="panel pad">
          <div className="panel-head">
            <div>
              <div className="panel-title">{lang === 'zh' ? 'P1 默认参数' : 'P1 DEFAULTS'}</div>
              <div className="panel-sub">{lang === 'zh' ? '未填写时自动套用' : 'auto-applied'}</div>
            </div>
          </div>
          <div className="assumption-list">
            <div className="assumption"><span>{t(FIELD_OCCUPANCY_LABEL)}</span><b>{P1_DEFAULTS.occupancy}</b></div>
            <div className="assumption"><span>{t(FIELD_EXIT_CAP_RATE_LABEL)}</span><b>{P1_DEFAULTS.exit_cap_rate}</b></div>
            <div className="assumption"><span>{t(FIELD_DISCOUNT_RATE_LABEL)}</span><b>{P1_DEFAULTS.discount_rate}</b></div>
          </div>
        </div>
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

const ALL_P0 = [
  'location', 'owner_type', 'property_cert', 'heritage_level', 'current_status',
  'building_area', 'structure_type', 'industry', 'renovation_mode',
  'investment', 'capital_ratio', 'mortgage_type', 'mortgage_value',
  'monthly_rent', 'leasable_area', 'holding_years', 'exit_strategy',
];

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
  switch (step) {
    case 0: return ['location'];
    case 1: return ['owner_type', 'property_cert', 'heritage_level', 'current_status'];
    case 2: return ['building_area', 'structure_type'];
    case 3: return ['industry', 'renovation_mode'];
    case 4: return ['investment', 'capital_ratio', 'mortgage_type', 'mortgage_value'];
    case 5: return ['monthly_rent', 'leasable_area', 'holding_years', 'exit_strategy'];
    default: return [];
  }
}

// Step 7 预览页统计缺失的 P0 字段（city 除外，Step 1 已强制）
function countMissingP0(v: IntakeValues, skipped: Set<string>): string[] {
  return ALL_P0.filter(k => !skipped.has(k) && isFieldEmpty(v, k));
}

export default IntakeWizard;
