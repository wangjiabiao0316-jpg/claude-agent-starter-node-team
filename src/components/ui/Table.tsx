import type { ReactNode } from 'react';
import styles from './Table.module.css';
import { Skeleton } from './Skeleton';
import { EmptyState } from './EmptyState';

export interface TableColumn<T> {
  /** 列标识（无 render 时用于取值） */
  key: string;
  /** 表头 */
  title: ReactNode;
  /** 列宽（px 数字或 CSS 字符串） */
  width?: string | number;
  align?: 'left' | 'center' | 'right';
  /** 自定义单元格渲染 */
  render?: (row: T, index: number) => ReactNode;
}

export interface TableProps<T> {
  columns: TableColumn<T>[];
  data: T[];
  rowKey: (row: T, index: number) => string;
  loading?: boolean;
  empty?: ReactNode;
}

function toCss(value: string | number): string {
  return typeof value === 'number' ? `${value}px` : value;
}

/** 基础数据表格：loading 态走 Skeleton，空态走 EmptyState */
export function Table<T>({ columns, data, rowKey, loading = false, empty }: TableProps<T>) {
  if (loading) {
    return (
      <div className={styles.loading}>
        <Skeleton rows={6} height={36} />
      </div>
    );
  }
  if (data.length === 0) {
    return <div className={styles.empty}>{empty ?? <EmptyState title="暂无数据" />}</div>;
  }
  return (
    <div className={styles.wrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                className={styles.th}
                style={{ width: c.width ? toCss(c.width) : undefined, textAlign: c.align ?? 'left' }}
              >
                {c.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={rowKey(row, i)} className={styles.tr}>
              {columns.map((c) => (
                <td key={c.key} className={styles.td} style={{ textAlign: c.align ?? 'left' }}>
                  {c.render ? c.render(row, i) : ((row as Record<string, unknown>)[c.key] as ReactNode)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
