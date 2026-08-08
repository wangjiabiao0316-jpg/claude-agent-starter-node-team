import React, { useEffect } from 'react';
import type { ReportReady } from '../types';

interface Props {
  report: ReportReady | null;
  onClose: () => void;
}

/**
 * Phase 4 Task 10 — Modal dialog that renders the final HTML report
 * emitted by agent6.export_report.
 *
 * Closes on:
 *   - overlay click
 *   - Esc key
 *   - 关闭 button
 *
 * The HTML is rendered via dangerouslySetInnerHTML because agent6
 * generates fully-formed HTML (investor / government / owner / internal
 * decision variants). Backend is trusted source — agent6 output is
 * produced by the controlled Claude SDK tool, not user input.
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

  if (!report) return null;

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        className="modal"
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff',
          padding: '24px',
          borderRadius: '8px',
          maxWidth: '80vw',
          maxHeight: '80vh',
          overflow: 'auto',
          boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '12px',
            borderBottom: '1px solid #eee',
            paddingBottom: '8px',
          }}
        >
          <h3 style={{ margin: 0, fontSize: '18px' }}>{report.report_type}</h3>
          <span style={{ fontSize: '12px', color: '#999' }}>按 Esc 关闭</span>
        </div>
        <div dangerouslySetInnerHTML={{ __html: report.html_content }} />
        <div style={{ marginTop: '16px', textAlign: 'right' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '6px 16px',
              cursor: 'pointer',
              border: '1px solid #ccc',
              borderRadius: '4px',
              background: '#f5f5f5',
            }}
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReportModal;
