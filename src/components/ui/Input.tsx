import { forwardRef, useId, type InputHTMLAttributes } from 'react';
import styles from './Input.module.css';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** 顶部标签 */
  label?: string;
  /** 校验错误文案（非空即进入错误态） */
  error?: string;
}

/** 基础输入框：深蓝黑描边风格，focus 银白描边，错误态红灯 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, className, id, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <div className={[styles.field, className ?? ''].filter(Boolean).join(' ')}>
      {label && (
        <label className={styles.label} htmlFor={inputId}>
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={inputId}
        className={[styles.input, error ? styles.inputError : ''].filter(Boolean).join(' ')}
        aria-invalid={error ? true : undefined}
        {...rest}
      />
      {error && <span className={styles.error}>{error}</span>}
    </div>
  );
});
