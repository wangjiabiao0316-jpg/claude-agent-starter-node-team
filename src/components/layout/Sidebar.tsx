import type { ReactNode } from 'react';
import styles from './Sidebar.module.css';

export interface SidebarProps {
  /** 侧栏头部：新建会话按钮等 */
  header?: ReactNode;
  /** 列表内容（会话项） */
  children?: ReactNode;
  /** 底部：加载更多 / 用户信息等 */
  footer?: ReactNode;
  /** 额外类名（覆盖宽度等） */
  className?: string;
}

/**
 * 全局侧栏骨架（左侧会话列表容器）。
 * 三槽：header | 可滚动 body | footer。纯布局，视觉样式自带（深色 + 毛玻璃）。
 */
export function Sidebar({ header, children, footer, className }: SidebarProps) {
  return (
    <aside className={[styles.sidebar, className ?? ''].filter(Boolean).join(' ')}>
      {header && <div className={styles.header}>{header}</div>}
      <div className={styles.body}>{children}</div>
      {footer && <div className={styles.footer}>{footer}</div>}
    </aside>
  );
}
