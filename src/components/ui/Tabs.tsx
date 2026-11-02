import type { ReactNode } from 'react';
import styles from './Tabs.module.css';

export interface TabItem {
  /** 唯一标识 */
  key: string;
  /** 标签内容 */
  label: ReactNode;
  /** 是否禁用 */
  disabled?: boolean;
}

export interface TabsProps {
  items: TabItem[];
  activeKey: string;
  onChange: (key: string) => void;
}

/** 标签页：贴合现有 dock 的 tab 样式，键盘可达（role=tablist） */
export function Tabs({ items, activeKey, onChange }: TabsProps) {
  return (
    <div className={styles.tabs} role="tablist">
      {items.map((item) => {
        const active = item.key === activeKey;
        return (
          <button
            key={item.key}
            role="tab"
            aria-selected={active}
            disabled={item.disabled}
            className={[styles.tab, active ? styles.tabActive : ''].filter(Boolean).join(' ')}
            onClick={() => !item.disabled && onChange(item.key)}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
