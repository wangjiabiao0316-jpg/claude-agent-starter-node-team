import type { ReactNode } from 'react';
import styles from './Topbar.module.css';

export interface TopbarProps {
  /** 品牌区：logo + 产品名（现有 header 的 logoBtn 内容） */
  brand?: ReactNode;
  /** 项目上下文插槽（B1 projectContext）。未接线时显示占位空态，不虚构数据 */
  context?: ReactNode;
  /** 右侧操作区：ToolIndicators / StopButton 等 */
  actions?: ReactNode;
}

/**
 * 全局顶栏骨架。
 * 三槽布局：左品牌 | 中项目上下文（B1 待接线）| 右操作区。
 * 纯布局，不含业务逻辑；context 未提供时渲染空占位。
 */
export function Topbar({ brand, context, actions }: TopbarProps) {
  return (
    <header className={styles.topbar}>
      {brand && <div className={styles.brand}>{brand}</div>}
      <div className={styles.context}>
        {context ?? <span className={styles.contextEmpty}>项目上下文 · 待接线</span>}
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </header>
  );
}
