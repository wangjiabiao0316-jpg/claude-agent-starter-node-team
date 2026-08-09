import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import IntakeWizard from '../IntakeWizard';
import { I18nProvider } from '../../i18n';

// Force zh locale: jsdom defaults navigator.language to en-US, but our
// assertions check zh strings (e.g. "下一步", "继续跳过", "继续测算").
const renderWithI18n = (ui: React.ReactElement) => {
  localStorage.setItem('lang', 'zh');
  return render(<I18nProvider>{ui}</I18nProvider>);
};

/**
 * Drive the wizard forward one click at a time, dismissing any soft-warning
 * modal that surfaces (P0 field left empty). The wizard's handleConfirmSkip
 * uses setTimeout(0) for recursive re-check, so we await the next render via
 * findByText variants where needed.
 *
 * Returns when `until` predicate sees the desired text on screen.
 */
async function advanceThroughWizard(until: () => boolean, maxIterations = 50): Promise<void> {
  for (let i = 0; i < maxIterations && !until(); i++) {
    // If a skip-warning modal is currently open, click "继续跳过".
    const skipBtn = screen.queryAllByRole('button', { name: /继续跳过/ })[0];
    if (skipBtn) {
      fireEvent.click(skipBtn);
      // Wait for the recursive checkAndProceed to either advance step or
      // open the next warning modal.
      await waitFor(() => {
        // Either the modal closed (no more skipBtn with same name visible)
        // or step changed; just yield a tick.
      });
      continue;
    }
    // Otherwise, click 下一步 / 预览并提交.
    const nextBtns = screen.queryAllByRole('button', { name: /下一步|预览并提交/ });
    if (nextBtns.length === 0) break;
    fireEvent.click(nextBtns[0]);
    await waitFor(() => {});
  }
}

describe('IntakeWizard', () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('shows Step 1 city grid on mount', () => {
    renderWithI18n(<IntakeWizard onSend={() => {}} />);
    expect(screen.getByText(/你的项目所在城市/)).toBeInTheDocument();
    expect(screen.getByText('北京')).toBeInTheDocument();
    expect(screen.getByText('深圳')).toBeInTheDocument();
  });

  it('hard-blocks next step when city not selected', () => {
    renderWithI18n(<IntakeWizard onSend={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /下一步/ }));
    // Still on Step 1
    expect(screen.getByText(/你的项目所在城市/)).toBeInTheDocument();
  });

  it('proceeds to Step 2 when city selected + location filled + next clicked', async () => {
    renderWithI18n(<IntakeWizard onSend={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: '深圳' }));
    // location is also a P0 field on Step 1; fill it so 下一步 advances
    // without going through the soft-warning modal (which is exercised in
    // the next test).
    const locationInput = screen.getByPlaceholderText(/南山科技园/);
    fireEvent.change(locationInput, { target: { value: '南山科技园' } });
    fireEvent.click(screen.getByRole('button', { name: /下一步/ }));
    await waitFor(() => {
      expect(screen.getByText('业主资质')).toBeInTheDocument();
    });
  });

  it('shows skip modal when P0 field left empty on next', async () => {
    renderWithI18n(<IntakeWizard onSend={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: '深圳' }));
    fireEvent.click(screen.getByRole('button', { name: /下一步/ }));
    // location is empty P0 → soft warning modal with "准确度会下降" title.
    await waitFor(() => {
      expect(screen.getByText(/准确度会下降/)).toBeInTheDocument();
    });
  });

  it('calls onSend with composed prompt after full journey + preview submit', async () => {
    const onSend = vi.fn();
    renderWithI18n(<IntakeWizard onSend={onSend} />);

    // Step 1: select 深圳.
    fireEvent.click(screen.getByRole('button', { name: '深圳' }));

    // Drive forward through every wizard step (0..5 → 6 preview), auto-skipping
    // any P0 warning modal that appears.
    await advanceThroughWizard(() => screen.queryByRole('button', { name: /继续测算/ }) !== null);

    // On preview page, click 继续测算 to submit.
    const submitBtn = screen.queryByRole('button', { name: /继续测算/ });
    if (!submitBtn) {
      throw new Error('Did not reach preview step (继续测算 button missing)');
    }
    fireEvent.click(submitBtn);

    expect(onSend).toHaveBeenCalledTimes(1);
    const sentPrompt = onSend.mock.calls[0][0] as string;
    expect(sentPrompt).toContain('深圳');
    expect(sentPrompt).toContain('super-skill 完整上会测算');
  });
});
