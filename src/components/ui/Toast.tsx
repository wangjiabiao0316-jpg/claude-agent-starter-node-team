import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './Toast.module.css';

export type ToastType = 'info' | 'success' | 'error' | 'warning';

export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
}

let toastSeq = 0;
const DURATION = 4000;

/** 轻量 toast 管理器：push(type, message) 弹出，自动 4s 关闭 */
export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    return () => timers.current.forEach((t) => window.clearTimeout(t));
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (type: ToastType, message: string) => {
      const id = `toast-${Date.now()}-${toastSeq++}`;
      setToasts((prev) => [...prev, { id, type, message }]);
      const timer = window.setTimeout(() => dismiss(id), DURATION);
      timers.current.push(timer);
    },
    [dismiss],
  );

  return { toasts, push, dismiss };
}

const typeClass: Record<ToastType, string> = {
  info: styles.toastInfo,
  success: styles.toastSuccess,
  error: styles.toastError,
  warning: styles.toastWarning,
};

export interface ToastContainerProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

/** 通知容器：渲染 useToast 返回的 toasts（右上角） */
export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  return createPortal(
    <div className={styles.container} role="region" aria-label="通知">
      {toasts.map((t) => (
        <div key={t.id} className={[styles.toast, typeClass[t.type]].filter(Boolean).join(' ')}>
          <span className={styles.msg}>{t.message}</span>
          <button className={styles.close} onClick={() => onDismiss(t.id)} aria-label="关闭">
            ✕
          </button>
        </div>
      ))}
    </div>,
    document.body,
  );
}
