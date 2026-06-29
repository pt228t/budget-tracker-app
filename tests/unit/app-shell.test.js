import { describe, expect, it } from 'vitest';
import { renderAppShell } from '../../src/js/app-shell.js';

describe('renderAppShell', () => {
  it('renders the login shell and overview cards', () => {
    document.body.innerHTML = renderAppShell();

    expect(document.querySelector('[data-testid="app-title"]')?.textContent).toContain(
      'BudgetPulse'
    );
    expect(document.querySelector('[data-testid="login-shell"]')).not.toBeNull();
    expect(document.querySelectorAll('[data-testid="overview-card"]')).toHaveLength(3);
  });

  it('renders the sprint checklist placeholders', () => {
    document.body.innerHTML = renderAppShell();

    const checklistItems = document.querySelectorAll('[data-testid="checklist"] li');

    expect(checklistItems).toHaveLength(4);
    expect(checklistItems[0]?.textContent).toContain('Connect Google account');
  });
});
