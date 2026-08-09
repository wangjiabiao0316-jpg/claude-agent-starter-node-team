import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import IntakeWarningModal from '../IntakeWarningModal';
import { I18nProvider } from '../../i18n';
import type { IntakeWarning } from '../../types';

// Force zh locale so assertion text matches zh.ts (jsdom defaults to en-US).
const renderWithI18n = (ui: React.ReactElement) => {
  localStorage.setItem('lang', 'zh');
  return render(<I18nProvider>{ui}</I18nProvider>);
};

const mockWarning: IntakeWarning = {
  fieldKey: 'capital_ratio',
  fieldName: '自有资金比例',
  severity: 'blocker',
  consequence: 'agent3 H1 hard constraint',
  technicalRef: 'agent3 H1',
  suggestion: '估算公式:自有资金 ÷ 总投资',
};

describe('IntakeWarningModal', () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('renders nothing when warning is null', () => {
    const { container } = renderWithI18n(
      <IntakeWarningModal warning={null} onConfirmSkip={() => {}} onReturnToFill={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('shows fieldName and consequence when warning is provided', () => {
    renderWithI18n(
      <IntakeWarningModal warning={mockWarning} onConfirmSkip={() => {}} onReturnToFill={() => {}} />,
    );
    expect(screen.getByText('自有资金比例')).toBeInTheDocument();
    expect(screen.getByText('agent3 H1 hard constraint')).toBeInTheDocument();
  });

  it('calls onConfirmSkip when "继续跳过" clicked', () => {
    const onConfirm = vi.fn();
    renderWithI18n(
      <IntakeWarningModal warning={mockWarning} onConfirmSkip={onConfirm} onReturnToFill={() => {}} />,
    );
    fireEvent.click(screen.getByText(/继续跳过/));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('calls onReturnToFill when overlay clicked', () => {
    const onReturn = vi.fn();
    const { container } = renderWithI18n(
      <IntakeWarningModal warning={mockWarning} onConfirmSkip={() => {}} onReturnToFill={onReturn} />,
    );
    // Overlay is the outer fixed-position div; click it (not inside modal).
    const overlay = container.querySelector('[class*="overlay"]') as HTMLElement;
    expect(overlay).not.toBeNull();
    fireEvent.click(overlay);
    expect(onReturn).toHaveBeenCalledTimes(1);
  });
});
