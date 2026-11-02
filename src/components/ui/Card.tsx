import type { HTMLAttributes, ReactNode } from 'react';
import styles from './Card.module.css';

export interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** 卡片标题 */
  title?: ReactNode;
  /** 右上角操作区 */
  extra?: ReactNode;
  /** 是否使用强边框 */
  bordered?: boolean;
}

/** 基础卡片：深蓝黑玻璃质感面板，可选标题栏与强边框 */
export function Card({ title, extra, bordered = false, className, children, ...rest }: CardProps) {
  const cls = [styles.card, bordered ? styles.cardBordered : '', className ?? ''].filter(Boolean).join(' ');
  return (
    <div className={cls} {...rest}>
      {(title || extra) && (
        <div className={styles.header}>
          {title && <h3 className={styles.title}>{title}</h3>}
          {extra && <div className={styles.extra}>{extra}</div>}
        </div>
      )}
      <div className={styles.body}>{children}</div>
    </div>
  );
}
