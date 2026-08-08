import React, { useCallback, useEffect } from 'react';
import type { ReportReady } from '../types';
import styles from './ReportModal.module.css';

interface Props {
  report: ReportReady | null;
  onClose: () => void;
}

/**
 * Modal dialog that renders the final HTML report emitted by
 * agent6.export_report (SSE event `report_ready`).
 *
 * Closes on: overlay click / Esc / 关闭 button.
 * Extras: 「下载 HTML」saves the report as a dated .html file.
 *
 * The HTML is rendered via dangerouslySetInnerHTML because agent6 generates
 * fully-formed HTML (investor / government / owner / internal variants).
 * Backend is a trusted source — output comes from the controlled Claude SDK
 * tool, not user input.
 */
export const ReportModal: React.FC<Props> = ({ report, onClose }) => {
  useEffect(() => {
    if (!report) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [report, onClose]);

  const handleDownload = useCallback(() => {
    if (!report) return;
    const blob = new Blob([report.html_content], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const date = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `${date}-${report.report_type}-报告.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [report]);

  if (!report) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <span className={styles.badge}>{report.report_type}</span>
            <span className={styles.headerTitle}>决策报告</span>
          </div>
          <span className={styles.escHint}>Esc 关闭</span>
        </div>

        <div className={styles.body}>
          <div
            className={styles.reportPaper}
            dangerouslySetInnerHTML={{ __html: report.html_content }}
          />
        </div>

        <div className={styles.footer}>
          <button type="button" className={styles.downloadBtn} onClick={handleDownload}>
            ⬇ 下载 HTML
          </button>
          <button type="button" className={styles.closeBtn} onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReportModal;
