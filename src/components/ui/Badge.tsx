import type { HTMLAttributes } from 'react';
import styles from './Badge.module.css';

type BadgeColor = 'green' | 'yellow' | 'red' | 'neutral';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  /** 颜色：green/yellow/red 映射灯色语义，neutral 为中性灰 */
  color?: BadgeColor;
  /** 是否显示圆点指示 */
  dot?: boolean;
}

const colorClass: Record<BadgeColor, string> = {
  green: styles.badgeGreen,
  yellow: styles.badgeYellow,
  red: styles.badgeRed,
  neutral: styles.badgeNeutral,
};

/** 状态徽标：用于 Agent 状态 / 决策灯 / Evidence 等级标识 */
export function Badge({ color = 'neutral', dot = false, className, children, ...rest }: BadgeProps) {
  const cls = [styles.badge, colorClass[color], className ?? ''].filter(Boolean).join(' ');
  return (
    <span className={cls} {...rest}>
      {dot && <span className={styles.dot} aria-hidden="true" />}
      {children}
    </span>
  );
}
