import { formatCurrencyINR } from '../../utils.js';

export function renderDashboardHealth(summary, elementId) {
  const container = document.getElementById(elementId);
  if (!container || !summary) return;

  const savingsRate = summary.totalBudget > 0 
    ? ((summary.totalRemaining / summary.totalBudget) * 100).toFixed(1)
    : 0;

  const poolHealthTone = summary.totalRemaining >= 0 ? 'success' : 'critical';

  container.innerHTML = `
    <div class="health-metrics">
      <div class="metric-row">
        <span class="metric-label">Remaining Budget</span>
        <span class="metric-value font-bold text-${poolHealthTone}">
          ${formatCurrencyINR(summary.totalRemaining)}
        </span>
      </div>
      <div class="metric-row mt-3">
        <span class="metric-label">Savings Rate</span>
        <span class="metric-value font-bold">
          ${savingsRate}%
        </span>
      </div>
      <div class="metric-row mt-3">
        <span class="metric-label">Pool Health</span>
        <span class="metric-value font-bold text-${poolHealthTone}">
          ${summary.totalRemaining >= 0 ? 'Surplus' : 'Deficit'}
        </span>
      </div>
    </div>
  `;
}
