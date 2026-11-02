import { forwardRef, type ButtonHTMLAttributes } from 'react';
import styles from './Button.module.css';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** 视觉变体：primary=银白实底 / secondary=描边 / ghost=无边框 / danger=红灯语义 */
  variant?: Variant;
  /** 尺寸 */
  size?: Size;
  /** 加载态：显示 spinner 并禁用点击 */
  loading?: boolean;
}

const variantClass: Record<Variant, string> = {
  primary: styles.btnPrimary,
  secondary: styles.btnSecondary,
  ghost: styles.btnGhost,
  danger: styles.btnDanger,
};

const sizeClass: Record<Size, string> = {
  sm: styles.btnSm,
  md: styles.btnMd,
  lg: styles.btnLg,
};

/** 基础按钮：深蓝黑主题下 primary=银白底、danger=红灯底，其余为描边/幽灵态 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading = false, disabled, className, children, ...rest },
  ref,
) {
  const cls = [styles.btn, variantClass[variant], sizeClass[size], loading ? styles.btnLoading : '', className ?? '']
    .filter(Boolean)
    .join(' ');
  return (
    <button ref={ref} className={cls} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading && <span className={styles.spinner} aria-hidden="true" />}
      <span className={styles.label}>{children}</span>
    </button>
  );
});
