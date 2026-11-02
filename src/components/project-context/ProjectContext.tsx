import type { IntakeValues } from '../../lib/intake';
import styles from './ProjectContext.module.css';

/**
 * 项目上下文（B1）：从已确认的 IntakeValues 抽取核心字段，供 Topbar
 * 上下文插槽常驻展示「当前在算哪个项目」。
 *
 * 数据契约直接 Pick 自 lib/intake.ts 的 22 字段，不重复定义字段类型。
 * scenario / model_version 为「预留字段」——当前前端无此数据源，待后端
 * 确认后接入（不虚构具体值）。
 */
export type ProjectContextData = Pick<
  IntakeValues,
  'city' | 'location' | 'industry' | 'renovation_mode' | 'investment' | 'building_area'
> & {
  /** 预留：测算场景标识（待后端确认，当前前端无此数据源） */
  scenario?: string;
  /** 预留：模型版本号（待后端确认，当前前端无此数据源） */
  model_version?: string;
};

export interface ProjectContextProps {
  /** 项目上下文；null 或缺 city（硬阻断字段）时显示空态 */
  context: ProjectContextData | null;
  /** 空态文案 */
  emptyText?: string;
}

/**
 * 项目上下文条：city 突出 + 核心字段 chips。
 * 纯展示，无业务逻辑——数据由调用方（未来接线层）传入。
 */
export function ProjectContext({
  context,
  emptyText = '项目上下文 · 待接入',
}: ProjectContextProps) {
  if (!context || !context.city) {
    return <span className={styles.empty}>{emptyText}</span>;
  }

  const chips: { key: string; label: string; value: string }[] = [];
  if (context.location) chips.push({ key: 'location', label: '区位', value: context.location });
  if (context.industry) chips.push({ key: 'industry', label: '业态', value: context.industry });
  if (context.renovation_mode) chips.push({ key: 'mode', label: '改造', value: context.renovation_mode });
  if (context.investment != null) chips.push({ key: 'investment', label: '总投资', value: `${context.investment} 万元` });
  if (context.building_area != null) chips.push({ key: 'area', label: '面积', value: `${context.building_area} ㎡` });
  if (context.scenario) chips.push({ key: 'scenario', label: '场景', value: context.scenario });
  if (context.model_version) chips.push({ key: 'model', label: '模型', value: context.model_version });

  return (
    <div className={styles.bar} role="group" aria-label="项目上下文">
      <span className={styles.city}>{context.city}</span>
      {chips.map((c) => (
        <span key={c.key} className={styles.chip}>
          <span className={styles.chipLabel}>{c.label}</span>
          <span className={styles.chipValue}>{c.value}</span>
        </span>
      ))}
    </div>
  );
}

export default ProjectContext;
