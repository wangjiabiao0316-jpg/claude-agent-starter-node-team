import { forwardRef, useId, type TextareaHTMLAttributes } from 'react';
import styles from './Textarea.module.css';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** 顶部标签 */
  label?: string;
  /** 校验错误文案（非空即进入错误态） */
  error?: string;
}

/** 基础多行输入：支持纵向拉伸，其余风格与 Input 一致 */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, error, className, id, rows = 4, ...rest },
  ref,
) {
  const autoId = useId();
  const textareaId = id ?? autoId;
  return (
    <div className={[styles.field, className ?? ''].filter(Boolean).join(' ')}>
      {label && (
        <label className={styles.label} htmlFor={textareaId}>
          {label}
        </label>
      )}
      <textarea
        ref={ref}
        id={textareaId}
        rows={rows}
        className={[styles.textarea, error ? styles.textareaError : ''].filter(Boolean).join(' ')}
        aria-invalid={error ? true : undefined}
        {...rest}
      />
      {error && <span className={styles.error}>{error}</span>}
    </div>
  );
});
