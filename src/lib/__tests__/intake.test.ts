import { describe, expect, it } from 'vitest';
import {
  composeProjectPrompt,
  intakeValuesToPrompt,
  INTAKE_WARNINGS,
  PILOT_CITIES_15,
  DUAL_LIST_CITIES,
  type IntakeValues,
} from '../intake';

const FULL_VALUES: IntakeValues = {
  city: '深圳', location: '南山科技园',
  owner_type: '国企', property_cert: '粤(2024)0000XXX 号',
  heritage_level: '无文保', current_status: '老旧厂房',
  building_area: 50000, structure_type: '框架', height_m: 4.5,
  industry: '商业', renovation_mode: '保留微更新',
  investment: 30000, capital_ratio: 30,
  mortgage_type: '土地使用权', mortgage_value: 25000,
  monthly_rent: 120, leasable_area: 35000,
  holding_years: 15, exit_strategy: 'REITs',
  occupancy: 85, exit_cap_rate: 4.5, discount_rate: 8,
};

describe('composeProjectPrompt', () => {
  it('returns null when city is missing', () => {
    const result = composeProjectPrompt({
      values: { ...FULL_VALUES, city: '' },
      skippedFields: new Set(),
      defaultFields: {},
      lang: 'zh',
    });
    expect(result).toBeNull();
  });

  it('produces 三段输出 with all fields filled', () => {
    const result = composeProjectPrompt({
      values: FULL_VALUES,
      skippedFields: new Set(),
      defaultFields: {},
      lang: 'zh',
    });
    expect(result).not.toBeNull();
    expect(result).toContain('【已填信息】');
    expect(result).toContain('- 城市:深圳');
    expect(result).toContain('请按 super-skill 完整上会测算');
  });

  it('includes 【用户主动跳过的字段】 section when fields are skipped', () => {
    const result = composeProjectPrompt({
      values: FULL_VALUES,
      skippedFields: new Set(['capital_ratio', 'monthly_rent']),
      defaultFields: {},
      lang: 'zh',
    });
    expect(result).toContain('【用户主动跳过的字段');
    expect(result).toContain('自有资金比例(%):用户未提供');
    expect(result).toContain('月租金(元/㎡/月):用户未提供');
  });

  it('includes 【用默认值的字段】 section for P1 defaults', () => {
    const result = composeProjectPrompt({
      values: FULL_VALUES,
      skippedFields: new Set(),
      defaultFields: { occupancy: '85%', exit_cap_rate: '4.5%', discount_rate: '8%' },
      lang: 'zh',
    });
    expect(result).toContain('【用默认值的字段】');
    expect(result).toContain('出租率(%):85%');
  });

  it('English lang produces English section headers', () => {
    const result = composeProjectPrompt({
      values: FULL_VALUES,
      skippedFields: new Set(['capital_ratio']),
      defaultFields: {},
      lang: 'en',
    });
    expect(result).toContain('【Filled】');
    expect(result).toContain('【Skipped by user');
  });
});

describe('intakeValuesToPrompt', () => {
  it('converts percentage fields to decimal in output', () => {
    const lines = intakeValuesToPrompt(FULL_VALUES);
    const capitalLine = lines.find(l => l.includes('自有资金比例'));
    expect(capitalLine).toBeDefined();
    expect(capitalLine).toContain('0.30');  // 30 / 100
    expect(capitalLine).toContain('30%');
  });

  it('skips null fields', () => {
    const values = { ...FULL_VALUES, building_area: null };
    const lines = intakeValuesToPrompt(values);
    expect(lines.find(l => l.includes('建筑面积'))).toBeUndefined();
  });
});

describe('INTAKE_WARNINGS', () => {
  it('covers all 22 IntakeValues keys', () => {
    const expectedKeys: Array<keyof IntakeValues> = [
      'city', 'location', 'owner_type', 'property_cert', 'heritage_level', 'current_status',
      'building_area', 'structure_type', 'height_m',
      'industry', 'renovation_mode',
      'investment', 'capital_ratio', 'mortgage_type', 'mortgage_value',
      'monthly_rent', 'leasable_area', 'holding_years', 'exit_strategy',
      'occupancy', 'exit_cap_rate', 'discount_rate',
    ];
    expectedKeys.forEach(k => {
      expect(INTAKE_WARNINGS[k]).toBeDefined();
      expect(INTAKE_WARNINGS[k].fieldKey).toBe(k);
      expect(INTAKE_WARNINGS[k].consequence.length).toBeGreaterThan(10);
    });
  });
});

describe('PILOT_CITIES_15', () => {
  it('contains exactly 15 cities', () => {
    expect(PILOT_CITIES_15.length).toBe(15);
  });
  it('includes 北京 上海 广州 深圳', () => {
    expect(PILOT_CITIES_15).toContain('北京');
    expect(PILOT_CITIES_15).toContain('上海');
    expect(PILOT_CITIES_15).toContain('广州');
    expect(PILOT_CITIES_15).toContain('深圳');
  });
  it('DUAL_LIST_CITIES is subset of PILOT_CITIES_15', () => {
    DUAL_LIST_CITIES.forEach(c => {
      expect(PILOT_CITIES_15).toContain(c);
    });
  });
});
