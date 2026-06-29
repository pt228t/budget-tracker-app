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

/**
 * Renders the personal settlement panel showing who owes whom.
 * Computes split balances and lists recent out-of-pocket transactions.
 *
 * @param {Array[]} transactions
 * @param {string[]} allowedUsers
 * @param {string} currentUserEmail
 * @param {string} containerId
 */
export function renderPersonalSettlement(transactions = [], allowedUsers = [], currentUserEmail = '', containerId = 'personal-settlement-panel') {
  const container = document.getElementById(containerId);
  if (!container) return;

  const today = new Date();
  const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

  // Filter transactions for current month and Personal funding source, excluding future-dated entries
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const personalTxns = transactions.slice(1).filter(row => {
    const month = String(row[2] ?? '').trim();
    const dateStr = String(row[1] ?? '').trim();
    const funding = String(row[8] ?? '').trim();
    return month === currentMonth && funding === 'Personal' && dateStr <= todayStr;
  });

  const spendingMap = {};
  allowedUsers.forEach(email => {
    spendingMap[email.toLowerCase()] = 0;
  });

  personalTxns.forEach(row => {
    const amount = parseFloat(row[3]) || 0;
    const paidBy = String(row[7] ?? '').trim().toLowerCase();
    if (paidBy) {
      spendingMap[paidBy] = (spendingMap[paidBy] || 0) + amount;
    }
  });

  const usersCount = allowedUsers.length;
  if (usersCount <= 1) {
    container.innerHTML = `
      <div style="text-align: center; padding: 24px 16px;">
        <p class="text-secondary" style="font-size: 0.875rem;">Add more authorized users in Settings to compute settlement splits.</p>
      </div>
    `;
    return;
  }

  const totalPersonalSpent = Object.values(spendingMap).reduce((sum, val) => sum + val, 0);
  const share = totalPersonalSpent / usersCount;

  const balances = {};
  allowedUsers.forEach(email => {
    const emailKey = email.toLowerCase();
    balances[emailKey] = (spendingMap[emailKey] || 0) - share;
  });

  const debtors = [];
  const creditors = [];
  allowedUsers.forEach(email => {
    const emailKey = email.toLowerCase();
    const balance = balances[emailKey];
    if (balance < -0.01) {
      debtors.push({ email, balance });
    } else if (balance > 0.01) {
      creditors.push({ email, balance });
    }
  });

  debtors.sort((a, b) => a.balance - b.balance);
  creditors.sort((a, b) => b.balance - a.balance);

  const transfers = [];
  const debtorsCopy = debtors.map(d => ({ ...d }));
  const creditorsCopy = creditors.map(c => ({ ...c }));
  let dIdx = 0;
  let cIdx = 0;

  while (dIdx < debtorsCopy.length && cIdx < creditorsCopy.length) {
    const debtor = debtorsCopy[dIdx];
    const creditor = creditorsCopy[cIdx];
    const oweAmount = Math.abs(debtor.balance);
    const receiveAmount = creditor.balance;
    const transferAmount = Math.min(oweAmount, receiveAmount);

    transfers.push({
      from: debtor.email,
      to: creditor.email,
      amount: transferAmount
    });

    debtor.balance += transferAmount;
    creditor.balance -= transferAmount;

    if (Math.abs(debtor.balance) < 0.01) dIdx++;
    if (creditor.balance < 0.01) cIdx++;
  }

  // Format spending list HTML
  const userRows = allowedUsers.map(email => {
    const emailKey = email.toLowerCase();
    const isSelf = emailKey === currentUserEmail.toLowerCase();
    const spent = spendingMap[emailKey] || 0;
    const bal = balances[emailKey] || 0;
    const balClass = bal >= 0 ? 'text-success' : 'text-critical';
    const balSign = bal >= 0 ? '+' : '';
    const label = isSelf ? `Me (${email})` : email;
    
    return `
      <div style="display: flex; justify-content: space-between; align-items: center; padding: var(--space-2) 0; border-bottom: 1px solid var(--color-border); font-size: 0.875rem;">
        <span class="text-secondary" style="text-overflow: ellipsis; overflow: hidden; white-space: nowrap; max-width: 180px;" title="${email}">${label}</span>
        <div style="text-align: right;">
          <span style="font-weight: 500;">${formatCurrencyINR(spent)}</span>
          <span class="${balClass}" style="font-size: 0.75rem; margin-left: 6px;">(${balSign}${formatCurrencyINR(bal)})</span>
        </div>
      </div>
    `;
  }).join('');

  // Settlement advice HTML
  let settlementHtml = '';
  if (transfers.length === 0) {
    settlementHtml = `
      <div style="background-color: rgba(16, 185, 129, 0.08); color: var(--color-status-success); padding: 12px; border-radius: var(--radius-md); font-weight: 500; font-size: 0.875rem; text-align: center;">
        All personal payments are fully settled!
      </div>
    `;
  } else {
    const adviceLines = transfers.map(t => {
      const fromDisplay = t.from.toLowerCase() === currentUserEmail.toLowerCase() ? '<strong>You owe</strong>' : `<strong>${t.from}</strong> owes`;
      const toDisplay = t.to.toLowerCase() === currentUserEmail.toLowerCase() ? 'you' : `<strong>${t.to}</strong>`;
      return `<li style="margin-bottom: 4px;">${fromDisplay} ${formatCurrencyINR(t.amount)} to ${toDisplay}</li>`;
    }).join('');
    
    settlementHtml = `
      <div style="background-color: var(--color-bg-surface-hover); border-left: 4px solid var(--color-brand-primary); padding: 12px; border-radius: var(--radius-md); font-size: 0.875rem;">
        <p style="font-weight: 600; margin-bottom: 6px;">Settlement Instructions:</p>
        <ul style="padding-left: 16px; margin: 0;">${adviceLines}</ul>
      </div>
    `;
  }

  // Personal transactions list
  let txnListHtml = '';
  if (personalTxns.length === 0) {
    txnListHtml = '<p class="text-muted" style="font-size: 0.8rem; text-align: center; margin-top: 12px;">No personal transactions logged this month.</p>';
  } else {
    const txnRows = personalTxns.slice(0, 5).map(row => {
      const desc = row[6] || 'Personal expense';
      const amt = parseFloat(row[3]) || 0;
      const paidBy = row[7] || 'partner';
      const paidDisplay = paidBy.toLowerCase() === currentUserEmail.toLowerCase() ? 'Me' : paidBy.split('@')[0];
      const date = row[1] || '';
      return `
        <li style="display: flex; justify-content: space-between; font-size: 0.8rem; padding: 4px 0; color: var(--color-text-secondary);">
          <span>${date.split('-')[2] || ''} &middot; ${desc} (${paidDisplay})</span>
          <span style="font-weight: 500; color: var(--color-text-primary);">${formatCurrencyINR(amt)}</span>
        </li>
      `;
    }).join('');
    
    txnListHtml = `
      <div style="margin-top: 16px;">
        <h4 style="font-size: 0.875rem; font-weight: 600; margin-bottom: 8px;">Recent Personal Logs</h4>
        <ul style="list-style: none; padding: 0; margin: 0;">${txnRows}</ul>
        ${personalTxns.length > 5 ? `<p class="text-muted" style="font-size: 0.75rem; text-align: center; margin-top: 6px;">Showing 5 of ${personalTxns.length} transactions</p>` : ''}
      </div>
    `;
  }

  container.innerHTML = `
    <div style="display: flex; flex-direction: column; gap: 16px;">
      <div>
        <h4 style="font-size: 0.875rem; font-weight: 600; margin-bottom: 8px;">Total Spent Out-of-Pocket</h4>
        <div style="display: flex; flex-direction: column;">
          ${userRows}
        </div>
      </div>
      ${settlementHtml}
      ${txnListHtml}
    </div>
  `;
}
