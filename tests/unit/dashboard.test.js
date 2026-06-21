import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderDashboardHealth } from '../../src/js/dashboard.js';

vi.mock('../../utils.js', () => ({
  formatCurrencyINR: vi.fn((val) => `₹${val}`)
}));

describe('renderDashboardHealth', () => {
  let container;

  beforeEach(() => {
    document.body.innerHTML = '<div id="budget-health-panel"></div>';
    container = document.getElementById('budget-health-panel');
  });

  it('does nothing if container is missing', () => {
    document.body.innerHTML = '';
    renderDashboardHealth({ totalBudget: 1000, totalRemaining: 500 }, 'budget-health-panel');
    expect(document.body.innerHTML).toBe('');
  });

  it('renders correctly with surplus', () => {
    const summary = { totalBudget: 10000, totalRemaining: 2000 };
    renderDashboardHealth(summary, 'budget-health-panel');
    expect(container.innerHTML).toContain('₹2000');
    expect(container.innerHTML).toContain('text-success');
    expect(container.innerHTML).toContain('20.0%');
  });

  it('renders correctly with deficit', () => {
    const summary = { totalBudget: 5000, totalRemaining: -500 };
    renderDashboardHealth(summary, 'budget-health-panel');
    expect(container.innerHTML).toContain('₹-500');
    expect(container.innerHTML).toContain('text-critical');
    expect(container.innerHTML).toContain('-10.0%');
  });

  it('handles zero budget safely', () => {
    const summary = { totalBudget: 0, totalRemaining: 0 };
    renderDashboardHealth(summary, 'budget-health-panel');
    expect(container.innerHTML).toContain('₹0');
    expect(container.innerHTML).toContain('0%');
  });
});
