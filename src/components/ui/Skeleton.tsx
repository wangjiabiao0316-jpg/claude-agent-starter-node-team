import styles from './Skeleton.module.css';

export interface SkeletonProps {
  /** 骨架行数 */
  rows?: number;
  /** 每行宽度（px 数字或 CSS 字符串） */
  width?: string | number;
  /** 每行高度（px 数字或 CSS 字符串） */
  height?: string | number;
  /** 是否为圆形（头像占位） */
  circle?: boolean;
  className?: string;
}

function toCss(value: string | number): string {
  return typeof value === 'number' ? `${value}px` : value;
}

/** 加载占位骨架：微光扫过动画 */
export function Skeleton({ rows = 1, width = '100%', height = 14, circle = false, className }: SkeletonProps) {
  const items = Array.from({ length: rows }, (_, i) => i);
  return (
    <div className={[styles.wrap, className ?? ''].filter(Boolean).join(' ')} aria-hidden="true">
      {items.map((i) => (
        <div
          key={i}
          className={styles.line}
          style={{
            width: toCss(width),
            height: toCss(height),
            borderRadius: circle ? '50%' : 'var(--radius-sm)',
          }}
        />
      ))}
    </div>
  );
}
