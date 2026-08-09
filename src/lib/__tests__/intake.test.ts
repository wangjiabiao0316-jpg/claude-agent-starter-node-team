import { describe, expect, it } from 'vitest';
import { composeProjectPrompt, type IntakeValues } from '../intake';

const base: IntakeValues = {
  city: '深圳 · 南山区',
  current: '90 年代老旧厂房，产权清晰',
  scale: '占地约 5 万㎡，总投资约 3 亿元',
  direction: '保障性租赁住房',
  goal: 'full',
};

describe('composeProjectPrompt', () => {
  it('composes a full zh prompt with the decision goal', () => {
    const out = composeProjectPrompt(base, 'zh');
    expect(out).toBe(
      '我在深圳 · 南山区有一个城市更新项目：现状为90 年代老旧厂房，产权清晰，占地约 5 万㎡，总投资约 3 亿元，拟改造为保障性租赁住房。请做完整的上会测算与双层决策。',
    );
  });

  it('maps every goal to its prompt suffix', () => {
    expect(composeProjectPrompt({ ...base, goal: 'finance' }, 'zh')).toContain('请设计多元融资方案。');
    expect(composeProjectPrompt({ ...base, goal: 'model' }, 'zh')).toContain('IRR');
    expect(composeProjectPrompt({ ...base, goal: 'risk' }, 'zh')).toContain('Top3');
  });

  it('returns null when any required field is blank', () => {
    expect(composeProjectPrompt({ ...base, city: '   ' }, 'zh')).toBeNull();
    expect(composeProjectPrompt({ ...base, current: '' }, 'zh')).toBeNull();
    expect(composeProjectPrompt({ ...base, scale: '' }, 'zh')).toBeNull();
    expect(composeProjectPrompt({ ...base, direction: '' }, 'zh')).toBeNull();
  });

  it('strips trailing punctuation to avoid doubled sentence marks', () => {
    const out = composeProjectPrompt({ ...base, city: '深圳市。', scale: '占地 5 万㎡。' }, 'zh');
    expect(out).not.toContain('。。');
    expect(out).toContain('我在深圳市有一个城市更新项目');
  });

  it('composes an en prompt', () => {
    const out = composeProjectPrompt(base, 'en');
    expect(out).toContain('Urban renewal project in 深圳 · 南山区');
    expect(out).toContain('two-layer decision');
  });
});
