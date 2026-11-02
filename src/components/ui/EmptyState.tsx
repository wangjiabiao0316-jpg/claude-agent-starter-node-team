import type { ReactNode } from 'react';
import styles from './EmptyState.module.css';

export interface EmptyStateProps {
  /** 顶部图标（可选） */
  icon?: ReactNode;
  /** 主标题 */
  title: string;
  /** 补充说明 */
  description?: string;
  /** 底部操作按钮 */
  action?: ReactNode;
}

/** 空态占位：无项目 / 无会话 / 无数据时的统一展示 */
export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className={styles.empty}>
      {icon && <div className={styles.icon}>{icon}</div>}
      <h3 className={styles.title}>{title}</h3>
      {description && <p className={styles.desc}>{description}</p>}
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}
