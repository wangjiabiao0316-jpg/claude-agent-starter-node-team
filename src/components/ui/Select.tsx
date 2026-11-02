import { forwardRef, useId, type SelectHTMLAttributes } from 'react';
import styles from './Select.module.css';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  /** 顶部标签 */
  label?: string;
  /** 校验错误文案 */
  error?: string;
  /** 下拉选项 */
  options: SelectOption[];
  /** 占位提示（渲染为 value="" 的选项） */
  placeholder?: string;
}

/** 基础下拉选择：自定义 chevron，去掉原生外观 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, error, className, id, options, placeholder, ...rest },
  ref,
) {
  const autoId = useId();
  const selectId = id ?? autoId;
  return (
    <div className={[styles.field, className ?? ''].filter(Boolean).join(' ')}>
      {label && (
        <label className={styles.label} htmlFor={selectId}>
          {label}
        </label>
      )}
      <div className={styles.wrap}>
        <select
          ref={ref}
          id={selectId}
          className={[styles.select, error ? styles.selectError : ''].filter(Boolean).join(' ')}
          aria-invalid={error ? true : undefined}
          {...rest}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <span className={styles.chevron} aria-hidden="true" />
      </div>
      {error && <span className={styles.error}>{error}</span>}
    </div>
  );
});
