import type { ReactNode } from 'react';
import styles from './AppShell.module.css';

export interface AppShellProps {
  /** 左侧栏内容（通常传 <Sidebar>） */
  sidebar?: ReactNode;
  /** 顶栏内容（通常传 <Topbar>） */
  topbar?: ReactNode;
  /** 右侧 dock 内容（智能体 / Trace / 代码） */
  dock?: ReactNode;
  /** 主内容区 */
  children?: ReactNode;
}

/**
 * 全局 Shell 骨架：三列栅格（sidebar | main | dock）。
 * main 列内自上而下为 topbar → content。
 * 纯布局容器，对应现有 .shell > .stage 结构，供 Phase 5 接线替换。
 * 不含业务逻辑与 CityScene（3D 背景由调用方作为兄弟节点保留）。
 */
export function AppShell({ sidebar, topbar, dock, children }: AppShellProps) {
  return (
    <div className={styles.shell}>
      <div className={styles.stage}>
        {sidebar && <div className={styles.sidebarCol}>{sidebar}</div>}
        <main className={styles.main}>
          {topbar && <div className={styles.topbarSlot}>{topbar}</div>}
          <div className={styles.content}>{children}</div>
        </main>
        {dock && <div className={styles.dockCol}>{dock}</div>}
      </div>
    </div>
  );
}
