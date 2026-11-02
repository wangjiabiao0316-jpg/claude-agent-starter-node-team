import type { ReactNode } from 'react';
import styles from './Tooltip.module.css';

export interface TooltipProps {
  /** 提示内容 */
  content: ReactNode;
  /** 触发元素（包裹层，hover / focus 触发） */
  children: ReactNode;
  className?: string;
}

/** 纯 CSS 悬浮提示：hover + focus-within 触发，键盘可达 */
export function Tooltip({ content, children, className }: TooltipProps) {
  return (
    <span className={[styles.wrap, className ?? ''].filter(Boolean).join(' ')}>
      {children}
      <span className={styles.tooltip} role="tooltip">
        {content}
      </span>
    </span>
  );
}
