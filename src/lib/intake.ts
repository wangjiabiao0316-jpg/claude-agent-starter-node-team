/**
 * Guided-intake wizard: compose the final project prompt from step-by-step
 * user answers. Pure logic lives here so it can be unit-tested without
 * React / CSS-module imports.
 *
 * NOTE: 此文件在多 task 之间逐步扩展。当前版本(Task 10):
 *   - IntakeValues 扩到 22 字段(19 P0 + 3 P1)
 *   - composeProjectPrompt 三段输出(已填 / 跳过 / 默认值),消费 ComposedPromptInput
 *   - INTAKE_WARNINGS 表已就位(Task 9 IntakeWarningModal + Task 12 IntakeWizard 消费)
 *   - IntakeWizard 当前为过渡 stub(Task 12 全面重写)
 */

import type { IntakeWarning } from '../types';

/**
 * agent2 H1 维度1 试点城市(15 市级),作为前端硬阻断标准。
 * 用户在 IntakeWizard Step 1 必须从这 15 城选一个。
 */
export const PILOT_CITIES_15: readonly string[] = [
  '北京', '上海', '广州', '深圳', '杭州', '成都',
  '武汉', '西安', '重庆', '南京', '天津', '长沙',
  '青岛', '郑州', '厦门',
] as const;

/** 同时在 agent3 H4 省级名单的城市(用于 UI 标识 ✓ 双名单) */
export const DUAL_LIST_CITIES: readonly string[] = ['北京', '上海', '重庆'] as const;

/**
 * 22 个 intake 字段(19 P0 + 3 P1)。
 * 数字字段允许 null(用户主动跳过)。
 *
 * 单位约定:
 * - capital_ratio: 0-100(%),提交时 ÷100 换算为 0-1
 * - occupancy: 0-100(%),提交时 ÷100
 * - exit_cap_rate: 0-30(%),提交时 ÷100
 * - discount_rate: 0-50(%),提交时 ÷100
 * - 其他数字字段使用人类习惯单位(㎡ / 万元 / 元/㎡/月 / 年 / m)
 */
export interface IntakeValues {
  // Step 1: 基础地理
  city: string;                    // 15 城卡片网格选(硬阻断)
  location: string;                // 区位/行政区/园区
  // Step 2: 业权与现状
  owner_type: string;              // 国企/民企/混合所有制
  property_cert: string;           // 不动产证号
  heritage_level: string;          // 无文保/建控地带/核心保护
  current_status: string;          // 项目现状描述(free text)
  // Step 3: 物理参数
  building_area: number | null;    // 建筑面积(㎡)
  structure_type: string;          // 框架/砖混/木结构/钢结构/其他
  height_m: number | null;         // 层高(m) — P1,可由 LLM 估
  // Step 4: 业态与改造模式
  industry: string;                // 商业/办公/文旅/工业仓储/居住/公共服务(6 业态)
  renovation_mode: string;         // 拆除重建/保留微更新/混合
  // Step 5: 资金面
  investment: number | null;       // 总投资(万元)
  capital_ratio: number | null;    // 自有资金比例(%)
  mortgage_type: string;           // 土地使用权/运营权/收益权/经营权/收费权/组合
  mortgage_value: number | null;   // 抵押物估值(万元)
  // Step 6: 财务与退出
  monthly_rent: number | null;     // 月租金(元/㎡)
  leasable_area: number | null;    // 可租赁面积(㎡)
  holding_years: number | null;    // 持有年限(年,1-50)
  exit_strategy: string;           // 整体出售/单层散售/REITs/持有到期
  occupancy: number | null;        // 出租率(%) — P1,默认 85
  exit_cap_rate: number | null;    // 退出 cap rate(%) — P1,默认 4.5
  discount_rate: number | null;    // 折现率(%) — P1,默认 8
}

const PROMPT_SUFFIX_ZH = '请按 super-skill 完整上会测算流程,从 agent1 到 agent6 全部输出。对跳过的字段,各 agent 按既定降级路径处理,并在报告里标注"用户未提供"。';
const PROMPT_SUFFIX_EN = 'Run the full super-skill pipeline from agent1 through agent6. For skipped fields, follow the documented degradation paths and label them as "user not provided" in the report.';

function clean(text: string): string {
  return text.trim().replace(/[。.\s]+$/u, '');
}

const FIELD_LABELS_ZH: Record<keyof IntakeValues, string> = {
  city: '城市', location: '区位',
  owner_type: '业主资质', property_cert: '不动产证号',
  heritage_level: '文保等级', current_status: '现状描述',
  building_area: '建筑面积(㎡)', structure_type: '结构类型', height_m: '层高(m)',
  industry: '业态方向', renovation_mode: '改造模式',
  investment: '总投资(万元)', capital_ratio: '自有资金比例(%)',
  mortgage_type: '抵押物类型', mortgage_value: '抵押物估值(万元)',
  monthly_rent: '月租金(元/㎡/月)', leasable_area: '可租赁面积(㎡)',
  holding_years: '持有年限(年)', exit_strategy: '退出策略',
  occupancy: '出租率(%)', exit_cap_rate: '退出 cap rate(%)', discount_rate: '折现率(%)',
};

/**
 * Compose the natural-language project description sent to the agent.
 * Returns null only when city is blank (硬阻断要求,per spec §2.2).
 *
 * Task 10 三段输出:
 *   1. 【已填信息】 filled fields
 *   2. 【用户主动跳过的字段 — 准确度会下降】(if any) user-skipped P0 fields
 *   3. 【用默认值的字段】(if any) P1 fields with defaults
 *
 * IntakeWizard 当前为过渡 stub(Task 12 会全面重写)。
 */
export interface ComposedPromptInput {
  values: IntakeValues;
  skippedFields: Set<string>;             // 用户主动跳过的 P0 字段
  defaultFields: Record<string, string>;  // P1 字段用默认值兜底
  lang: 'zh' | 'en';
}

export function composeProjectPrompt(input: ComposedPromptInput): string | null {
  const { values, skippedFields, defaultFields, lang } = input;
  if (!clean(values.city)) return null;

  const filledLines: string[] = [];
  const skippedLines: string[] = [];
  const defaultLines: string[] = [];

  (Object.keys(FIELD_LABELS_ZH) as Array<keyof IntakeValues>).forEach(key => {
    const label = FIELD_LABELS_ZH[key];
    const raw = values[key];

    if (skippedFields.has(key)) {
      // 用户主动跳过
      if (lang === 'zh') {
        skippedLines.push(`- ${label}:用户未提供`);
      } else {
        skippedLines.push(`- ${label}: not provided by user`);
      }
      return;
    }

    if (defaultFields[key]) {
      // P1 字段用默认值
      defaultLines.push(`- ${label}:${defaultFields[key]}`);
      return;
    }

    // 已填字段(空值不输出)
    const valueStr = formatValue(raw, key);
    if (valueStr) {
      filledLines.push(`- ${label}:${valueStr}`);
    }
  });

  const headerZh = `我在${clean(values.city)}${values.location ? `(${clean(values.location)})` : ''}有一个城市更新项目。`;
  const headerEn = `Urban renewal project in ${clean(values.city)}${values.location ? ` (${clean(values.location)})` : ''}.`;

  const sectionsZh = [
    '【已填信息】', ...filledLines,
    skippedLines.length ? '【用户主动跳过的字段 — 准确度会下降】' : null,
    ...skippedLines,
    defaultLines.length ? '【用默认值的字段】' : null,
    ...defaultLines,
  ].filter(Boolean).join('\n');

  const sectionsEn = [
    '【Filled】', ...filledLines,
    skippedLines.length ? '【Skipped by user — accuracy will degrade】' : null,
    ...skippedLines,
    defaultLines.length ? '【Using default values】' : null,
    ...defaultLines,
  ].filter(Boolean).join('\n');

  const suffix = lang === 'zh' ? PROMPT_SUFFIX_ZH : PROMPT_SUFFIX_EN;
  // NOTE: brief had typo `headerEnEn`, fixed to `headerEn`
  const header = lang === 'zh' ? headerZh : headerEn;

  return `${header}\n\n${lang === 'zh' ? sectionsZh : sectionsEn}\n\n${suffix}`;
}

function formatValue(raw: string | number | null, _key: keyof IntakeValues): string {
  if (raw === null || raw === undefined) return '';
  if (typeof raw === 'number') {
    // 数字字段:百分比类已用 % 单位,无需换算(后端 LLM 自己换算)
    return String(raw);
  }
  return clean(raw);
}

/**
 * Per-field soft-warning metadata. IntakeWizard reads this when user
 * attempts to skip a P0 field. city is hard-blocked (no modal).
 *
 * fieldName is filled at runtime by IntakeWizard via i18n lookup of
 * `wizard.field.<key>.label`.
 */
export const INTAKE_WARNINGS: Record<keyof IntakeValues, Omit<IntakeWarning, 'fieldName'>> = {
  city: {
    fieldKey: 'city', severity: 'blocker',
    consequence: '前端阻断 — 必须从 15 试点城市之一选择,否则无法启动 super-skill 测算流程。',
    technicalRef: 'agent2 H1 维度1',
    suggestion: '从 15 城卡片网格中选择项目所在城市。',
  },
  location: {
    fieldKey: 'location', severity: 'blocker',
    consequence: 'agent5 失败案例相似度 S1 降权,匹配精度下降。',
    technicalRef: 'agent5 region',
    suggestion: '至少填到行政区或园区级别。',
  },
  owner_type: {
    fieldKey: 'owner_type', severity: 'blocker',
    consequence: 'agent2 H1 维度4 不符 → 政策清单全部"不适用";agent1 S1 降级。',
    technicalRef: 'agent2 H1 维度4 + agent1 S1',
    suggestion: '从国企/民企/混合所有制中选择业主资质类别。',
  },
  property_cert: {
    fieldKey: 'property_cert', severity: 'blocker',
    consequence: 'agent1 H1 直接无法判定 green → 默认 yellow。',
    technicalRef: 'agent1 H1 F1',
    suggestion: '填不动产证号;若无,可填"暂无"。',
  },
  heritage_level: {
    fieldKey: 'heritage_level', severity: 'blocker',
    consequence: 'agent1 H2 阻断 → 默认 red;agent5 物理参数相似度归零。',
    technicalRef: 'agent1 H2 F4',
    suggestion: '从无文保/建控地带/核心保护中选择。',
  },
  current_status: {
    fieldKey: 'current_status', severity: 'degraded',
    consequence: '各 agent 缺少上下文,LLM 自由发挥,精度不可控。',
    technicalRef: 'all agents (context)',
    suggestion: '至少简短描述项目现状(1-2 句话)。',
  },
  building_area: {
    fieldKey: 'building_area', severity: 'degraded',
    consequence: 'agent1 S2 可经营性降级估分。',
    technicalRef: 'agent1 物理参数',
    suggestion: '填建筑面积(㎡),可估算。',
  },
  structure_type: {
    fieldKey: 'structure_type', severity: 'degraded',
    consequence: 'agent5 案例匹配缺维度,相似度下降。',
    technicalRef: 'agent5',
    suggestion: '从框架/砖混/木结构/钢结构/其他中选择。',
  },
  height_m: {
    fieldKey: 'height_m', severity: 'degraded',
    consequence: 'agent1 S2 降级,LLM 会估层高。',
    technicalRef: 'agent1 物理参数',
    suggestion: '填层高(m);如无数据可跳过,LLM 会估算。',
  },
  industry: {
    fieldKey: 'industry', severity: 'blocker',
    consequence: '多 agent(agent1/2/3/4/5)同时降级;agent4 业态门槛表无法对齐。',
    technicalRef: 'agent1/2/3/4/5 industry',
    suggestion: '从 6 业态枚举(商业/办公/文旅/工业仓储/居住/公共服务)中选择。',
  },
  renovation_mode: {
    fieldKey: 'renovation_mode', severity: 'blocker',
    consequence: 'agent2 H1 项目类型不符 → 政策全不适用;agent4 finance.analyze 缺关键参数。',
    technicalRef: 'agent2 H1 + agent4',
    suggestion: '从拆除重建/保留微更新/混合中选择。',
  },
  investment: {
    fieldKey: 'investment', severity: 'blocker',
    consequence: 'agent3 H1 资本金门槛无法校验 → F4 降级;agent4 缺总投资基线。',
    technicalRef: 'agent3 H1 + agent4',
    suggestion: '填总投资(万元),可估算。',
  },
  capital_ratio: {
    fieldKey: 'capital_ratio', severity: 'blocker',
    consequence: 'agent3 H1 硬约束(资本金比例必须 25-30%)无法判定 → 直接 red,融资工具清单全部不可用。',
    technicalRef: 'agent3 H1',
    suggestion: '估算公式:自有资金 ÷ 总投资。',
  },
  mortgage_type: {
    fieldKey: 'mortgage_type', severity: 'blocker',
    consequence: 'agent3 H2 直接 red。',
    technicalRef: 'agent3 H2',
    suggestion: '从土地使用权/运营权/收益权/经营权/收费权/组合中选择。',
  },
  mortgage_value: {
    fieldKey: 'mortgage_value', severity: 'degraded',
    consequence: 'agent3 还款覆盖率无法算 → yellow。',
    technicalRef: 'agent3 S4',
    suggestion: '填抵押物估值(万元),可估算。',
  },
  monthly_rent: {
    fieldKey: 'monthly_rent', severity: 'blocker',
    consequence: 'agent4 H2 必填 → F6/F12 降级,IRR 无法算。',
    technicalRef: 'agent4 H2',
    suggestion: '填月租金(元/㎡),参考周边同类项目。',
  },
  leasable_area: {
    fieldKey: 'leasable_area', severity: 'blocker',
    consequence: 'agent4 H2 必填 → F6/F12 降级;agent3 S4 也无法算。',
    technicalRef: 'agent4 H2 + agent3 S4',
    suggestion: '填可租赁面积(㎡)。',
  },
  holding_years: {
    fieldKey: 'holding_years', severity: 'blocker',
    consequence: 'agent4 现金流时序无法算;agent5 financing 维度空。',
    technicalRef: 'agent4 H2 + agent3 S3 + agent5',
    suggestion: '填持有年限(年,1-50)。',
  },
  exit_strategy: {
    fieldKey: 'exit_strategy', severity: 'blocker',
    consequence: 'agent3 退出策略空 → F4 降级。',
    technicalRef: 'agent3 S3 + agent5',
    suggestion: '从整体出售/单层散售/REITs/持有到期中选择。',
  },
  occupancy: {
    fieldKey: 'occupancy', severity: 'degraded',
    consequence: '将用默认值 85% 兜底。',
    technicalRef: 'agent4 H2',
    suggestion: '可填出租率(%);如无数据,默认 85% 已合理。',
  },
  exit_cap_rate: {
    fieldKey: 'exit_cap_rate', severity: 'degraded',
    consequence: '将用默认值 4.5% 兜底。',
    technicalRef: 'agent4 H2',
    suggestion: '可填退出 cap rate(%);如无数据,默认 4.5% 已合理。',
  },
  discount_rate: {
    fieldKey: 'discount_rate', severity: 'degraded',
    consequence: '将用默认值 8% 兜底。',
    technicalRef: 'agent4 H2',
    suggestion: '可填折现率(%);如无数据,默认 8% 已合理。',
  },
};

/**
 * Convert percentage-style fields (stored as 0-100 in UI) to decimal (0-1)
 * for backend consumption. Returns label:value lines for diagnostic display.
 *
 * Note: composeProjectPrompt (Task 10) shows percentages as-is for human
 * readability; this helper is used by Step 7 preview panel when user wants
 * to inspect the "raw" prompt sent to backend.
 */
export function intakeValuesToPrompt(values: IntakeValues): string[] {
  const lines: string[] = [];
  const pct = (v: number | null, label: string) => {
    if (v === null) return;
    lines.push(`- ${label}:${(v / 100).toFixed(v < 1 ? 3 : 2)} (即 ${v}%)`);
  };
  const num = (v: number | null, label: string, unit?: string) => {
    if (v === null) return;
    lines.push(`- ${label}:${v}${unit ? ` ${unit}` : ''}`);
  };
  const str = (v: string, label: string) => {
    if (!clean(v)) return;
    lines.push(`- ${label}:${clean(v)}`);
  };

  str(values.city, '城市');
  str(values.location, '区位');
  str(values.owner_type, '业主资质');
  str(values.property_cert, '不动产证号');
  str(values.heritage_level, '文保等级');
  str(values.current_status, '现状描述');
  num(values.building_area, '建筑面积', '㎡');
  str(values.structure_type, '结构类型');
  num(values.height_m, '层高', 'm');
  str(values.industry, '业态方向');
  str(values.renovation_mode, '改造模式');
  num(values.investment, '总投资', '万元');
  pct(values.capital_ratio, '自有资金比例');
  str(values.mortgage_type, '抵押物类型');
  num(values.mortgage_value, '抵押物估值', '万元');
  num(values.monthly_rent, '月租金', '元/㎡/月');
  num(values.leasable_area, '可租赁面积', '㎡');
  num(values.holding_years, '持有年限', '年');
  str(values.exit_strategy, '退出策略');
  pct(values.occupancy, '出租率');
  pct(values.exit_cap_rate, '退出 cap rate');
  pct(values.discount_rate, '折现率');

  return lines;
}
