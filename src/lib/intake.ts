/**
 * Guided-intake wizard: compose the final project prompt from step-by-step
 * user answers. Pure logic lives here so it can be unit-tested without
 * React / CSS-module imports.
 */

export type IntakeGoal = 'full' | 'finance' | 'model' | 'risk';

export interface IntakeValues {
  city: string;       // 城市 / 区位
  current: string;    // 现状与产权
  scale: string;      // 规模指标
  direction: string;  // 拟改造方向（chips 选项或自定义文本）
  goal: IntakeGoal;   // 测算目标
}

export const INTAKE_GOAL_IDS: IntakeGoal[] = ['full', 'finance', 'model', 'risk'];

const GOAL_PROMPT: Record<IntakeGoal, { zh: string; en: string }> = {
  full: {
    zh: '做完整的上会测算与双层决策',
    en: 'run the full decision review and two-layer decision',
  },
  finance: {
    zh: '设计多元融资方案',
    en: 'design a diversified financing plan',
  },
  model: {
    zh: '测算 IRR 和 NPV 等核心财务指标',
    en: 'calculate core financial metrics such as IRR and NPV',
  },
  risk: {
    zh: '匹配 Top3 相似失败案例并提示主要风险点与规避建议',
    en: 'match the top-3 similar failure cases and highlight key risks and mitigations',
  },
};

/** Trim whitespace and strip trailing sentence punctuation. */
function clean(text: string): string {
  return text.trim().replace(/[。.\s]+$/u, '');
}

/**
 * Compose the natural-language project description sent to the agent.
 * Returns null when any required field is blank.
 */
export function composeProjectPrompt(
  values: IntakeValues,
  lang: 'zh' | 'en',
): string | null {
  const city = clean(values.city);
  const current = clean(values.current);
  const scale = clean(values.scale);
  const direction = clean(values.direction);
  if (!city || !current || !scale || !direction) return null;

  const goal = GOAL_PROMPT[values.goal][lang];

  if (lang === 'zh') {
    return `我在${city}有一个城市更新项目：现状为${current}，${scale}，拟改造为${direction}。请${goal}。`;
  }
  return `Urban renewal project in ${city}: current condition — ${current}; scale — ${scale}; intended direction — ${direction}. Please ${goal}.`;
}
