/**
 * src/js/expense-logger.js — BudgetPulse
 * Expense logging form + recent transactions list.
 *
 * Entry point:
 *   initExpenseLogger(formId, listId) — called from app.js after categories load.
 *
 * Exported pure functions (testable):
 *   buildTransactionRow(data, loggedBy)  → Array[13]
 *   validateForm(data)                   → { valid, errors[] }
 *   renderTransactionItem(row, catMap)   → HTML string
 */

import { getAccessToken } from './auth.js';
import { appendRow, readRange, updateRow, deleteRow, resolveSheetId, getAuthorizedUsers } from './sheets-api.js';
import {
  getTransactionsCache,
  setTransactionsCache,
  optimisticAppendTransaction,
  rollbackTransaction,
  updateTransactionInCache,
  suggestCategory,
  recordVendorPattern,
} from './cache.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const TRANSACTIONS_RANGE = 'Transactions!A:M';

// Column indices within a transaction row (0-based)
const TC = {
  ID:             0,
  DATE:           1,
  MONTH:          2,
  AMOUNT:         3,
  CATEGORY_ID:    4,
  SUB_CATEGORY:   5,
  DESCRIPTION:    6,
  PAID_BY:        7,
  FUNDING_SOURCE: 8,
  LOGGED_BY:      9,
  LOGGED_AT:      10,
  MODIFIED_AT:    11,
  NOTES:          12,
};

// ─── Public Entry Point ───────────────────────────────────────────────────────

let _allLoadedTransactions = [];
let _activeCategories = [];

/**
 * Initialises the expense logger.
 * Enhances the existing form, wires events, and loads recent transactions.
 *
 * @param {string} formId   ID of the existing <form> element
 * @param {string} listId   ID of the container to render recent transactions into
 */
export async function initExpenseLogger(formId, listId) {
  const form   = document.getElementById(formId);
  const listEl = document.getElementById(listId);
  if (!form || !listEl) return;

  _injectMissingFields(form);

  const dateInput = form.querySelector('#bp-date');
  if (dateInput && !dateInput.value) {
    dateInput.value = _toDateString(new Date());
  }

  const paidBySelect = form.querySelector('#bp-paid-by');
  if (paidBySelect) {
    try {
      const currentUser = await _getUserEmail().catch(() => 'me');
      const users = await getAuthorizedUsers().catch(() => []);
      if (users.length > 0) {
        paidBySelect.innerHTML = users.map(user => {
          const isSelf = user.toLowerCase() === currentUser.toLowerCase();
          const label = isSelf ? `Me (${user})` : user;
          return `<option value="${user}">${label}</option>`;
        }).join('');
        const selfUser = users.find(user => user.toLowerCase() === currentUser.toLowerCase());
        if (selfUser) {
          paidBySelect.value = selfUser;
        }
      } else {
        paidBySelect.innerHTML = `
          <option value="${currentUser}">${currentUser}</option>
          <option value="partner">Partner</option>
        `;
      }
    } catch (e) {
      console.warn('[ExpenseLogger] Failed to populate paid-by list dynamically', e);
    }
  }

  // Attach listeners only once — initExpenseLogger may be re-invoked on
  // re-auth/refresh, and double-wiring the submit handler causes duplicate
  // appends (one expense logged twice).
  if (!form.dataset.bpWired) {
    form.dataset.bpWired = '1';

    _wireVendorSuggestion(form);
    _wireSubmit(form, listEl);
    _wireListActions(listEl);
    _wireFutureDateNotice(form);

    // Wire filters change event listeners
    const filterPaidBy = document.getElementById('bp-filter-paid-by');
    const filterCat = document.getElementById('bp-filter-category');
    const filterStart = document.getElementById('bp-filter-start-date');
    const filterEnd = document.getElementById('bp-filter-end-date');

    const onFilterChange = () => _applyFilters(listEl);
    [filterPaidBy, filterCat, filterStart, filterEnd].forEach(el => {
      if (el) {
        el.addEventListener('change', onFilterChange);
        el.addEventListener('input', onFilterChange);
      }
    });

    // Wire CSV export button
    const exportBtn = document.getElementById('bp-export-csv');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        _triggerCSVExport(listEl);
      });
    }
  }

  await _loadRecentTransactions(listEl);
}

// ─── Form Enhancement ─────────────────────────────────────────────────────────

function _injectMissingFields(form) {
  // Fields and banner are static in index.html — skip if already present.
  if (form.querySelector('#bp-sub-category')) return;

  // Fallback injection for environments without the static HTML.
  const submitBtn = form.querySelector('[type="submit"]');
  const extra = document.createElement('div');
  extra.innerHTML = `
    <div id="bp-suggestion-banner" style="display:none;" role="status" aria-live="polite">
      <span id="bp-suggestion-text"></span>
      <button type="button" id="bp-suggestion-accept">Use this</button>
      <button type="button" id="bp-suggestion-dismiss">Dismiss</button>
    </div>
    <div>
      <label for="bp-sub-category">Sub-category</label>
      <input id="bp-sub-category" name="subCategory" type="text" placeholder="e.g. Vegetables, Fuel…" maxlength="60" autocomplete="off">
    </div>
    <div>
      <label for="bp-paid-by">Paid by</label>
      <select id="bp-paid-by" name="paidBy">
        <option value="me">Me</option>
        <option value="partner">Partner</option>
      </select>
    </div>
    <div>
      <label for="bp-notes">Notes</label>
      <input id="bp-notes" name="notes" type="text" placeholder="Any extra context…" maxlength="200">
    </div>
  `;
  if (submitBtn) form.insertBefore(extra, submitBtn);
  else form.appendChild(extra);
}

// ─── Future-Date Notice ───────────────────────────────────────────────────────

/**
 * Warns when the chosen date is in the future. Future-dated expenses are
 * intentionally excluded from analytics ("spent so far"), so without this
 * notice the expense silently vanishes from the dashboard until that date.
 */
function _wireFutureDateNotice(form) {
  const dateInput = form.querySelector('#bp-date');
  if (!dateInput) return;

  const notice = document.createElement('p');
  notice.id = 'bp-future-notice';
  notice.className = 'form-hint';
  notice.setAttribute('role', 'status');
  notice.style.display = 'none';
  notice.textContent =
    'Heads up: this date is in the future. It will be saved, but won’t appear in analytics until that date arrives.';
  dateInput.insertAdjacentElement('afterend', notice);

  const sync = () => {
    const isFuture = dateInput.value && dateInput.value > _toDateString(new Date());
    notice.style.display = isFuture ? '' : 'none';
  };
  dateInput.addEventListener('change', sync);
  dateInput.addEventListener('input', sync);
}

// ─── Vendor Suggestion ────────────────────────────────────────────────────────

function _wireVendorSuggestion(form) {
  const vendorInput = form.querySelector('#vendor, [name="vendor"]');
  if (!vendorInput) return;

  vendorInput.addEventListener('input', () => {
    const description = vendorInput.value.trim();
    if (description.length < 3) { _hideSuggestion(form); return; }

    const suggestedId = suggestCategory(description);
    if (!suggestedId) { _hideSuggestion(form); return; }

    const catName = _buildCategoryMap()[suggestedId] || suggestedId;
    _showSuggestion(form, catName, suggestedId);
  });
}

function _showSuggestion(form, catName, catId) {
  const banner  = form.querySelector('#bp-suggestion-banner');
  const text    = form.querySelector('#bp-suggestion-text');
  const accept  = form.querySelector('#bp-suggestion-accept');
  const dismiss = form.querySelector('#bp-suggestion-dismiss');
  if (!banner || !text) return;

  text.textContent = `Suggested: ${catName}`;
  banner.style.display = '';

  // Replace nodes to avoid stacking listeners
  const newAccept  = accept.cloneNode(true);
  const newDismiss = dismiss.cloneNode(true);
  accept.replaceWith(newAccept);
  dismiss.replaceWith(newDismiss);

  newAccept.addEventListener('click', () => {
    const sel = form.querySelector('#category');
    if (sel) sel.value = catId;
    _hideSuggestion(form);
  });
  newDismiss.addEventListener('click', () => _hideSuggestion(form));
}

function _hideSuggestion(form) {
  const banner = form.querySelector('#bp-suggestion-banner');
  if (banner) banner.style.display = 'none';
}

// ─── Form Submit ──────────────────────────────────────────────────────────────

function _wireSubmit(form, listEl) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await _handleSubmit(form, listEl);
  });
}

async function _handleSubmit(form, listEl) {
  const submitBtn = form.querySelector('[type="submit"]');
  const errorEl   = _getOrCreateErrorEl(form);

  const rawData = {
    amount:        (form.querySelector('#amount')?.value ?? '').trim(),
    categoryId:    form.querySelector('#category')?.value ?? '',
    description:   (form.querySelector('#vendor, [name="vendor"]')?.value ?? '').trim(),
    subCategory:   (form.querySelector('#bp-sub-category')?.value ?? '').trim(),
    paidByRaw:     form.querySelector('#bp-paid-by')?.value ?? 'me',
    fundingSource: _mapFundingSource(form.querySelector('#payment-source')?.value ?? ''),
    notes:         (form.querySelector('#bp-notes')?.value ?? '').trim(),
    date:          form.querySelector('#bp-date')?.value ?? '',
  };

  const { valid, errors } = validateForm(rawData);
  if (!valid) { _showErrors(errorEl, errors); return; }
  _clearErrors(errorEl);

  const loggedBy = await _getUserEmail();
  let paidBy = rawData.paidByRaw;
  if (paidBy === 'me') {
    paidBy = loggedBy;
  } else if (paidBy === 'partner') {
    paidBy = 'partner';
  }

  const row = buildTransactionRow({
    amount:        parseFloat(rawData.amount),
    categoryId:    rawData.categoryId,
    subCategory:   rawData.subCategory,
    description:   rawData.description,
    paidBy,
    fundingSource: rawData.fundingSource,
    notes:         rawData.notes,
    date:          rawData.date,
  }, loggedBy);

  const month = row[TC.MONTH];

  optimisticAppendTransaction(month, row);
  _prependTransactionRow(listEl, row);

  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Saving…'; }

  try {
    await appendRow(TRANSACTIONS_RANGE, row);

    if (rawData.description) recordVendorPattern(rawData.description, rawData.categoryId);

    form.reset();
    form.dataset.injected = '';
    _hideSuggestion(form);
    _showToast('Expense logged ✓');

  } catch (err) {
    rollbackTransaction(month, row[TC.ID]);
    _removeTransactionRow(listEl, row[TC.ID]);
    _showErrors(errorEl, [{ field: 'api', message: 'Failed to save. Will retry when online.' }]);
    console.error('[BudgetPulse] appendRow failed:', err);

  } finally {
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Log Expense'; }
  }
}

// ─── Recent Transactions ──────────────────────────────────────────────────────

async function _loadRecentTransactions(listEl) {
  listEl.innerHTML = '<p class="text-muted" style="padding:12px;">Loading…</p>';

  try {
    const [transactionsData, categoriesData, users] = await Promise.all([
      readRange(TRANSACTIONS_RANGE).catch(() => []),
      readRange('Budget_Categories!A:H').catch(() => []),
      getAuthorizedUsers().catch(() => []),
    ]);

    _allLoadedTransactions = transactionsData.slice(1);
    
    // Extract active categories
    _activeCategories = categoriesData.slice(1).map(row => ({
      id: row[0],
      name: row[1],
      status: row[5]
    })).filter(cat => cat.status === 'Active');

    // Populate filter selectors
    _populateFilterOptions(users);

    _applyFilters(listEl);
  } catch (err) {
    listEl.innerHTML = '<p class="text-muted" style="padding:12px;">Could not load transactions.</p>';
    console.error('[BudgetPulse] _loadRecentTransactions failed:', err);
  }
}

function _populateFilterOptions(users = []) {
  const paidBySelect = document.getElementById('bp-filter-paid-by');
  const catSelect = document.getElementById('bp-filter-category');

  if (paidBySelect) {
    const options = ['<option value="">All Users</option>'];
    users.forEach(email => {
      options.push(`<option value="${email}">${email}</option>`);
    });
    paidBySelect.innerHTML = options.join('');
  }

  if (catSelect) {
    const options = ['<option value="">All Categories</option>'];
    _activeCategories.forEach(cat => {
      options.push(`<option value="${cat.id}">${cat.name}</option>`);
    });
    catSelect.innerHTML = options.join('');
  }
}

function _applyFilters(listEl) {
  const paidBy = document.getElementById('bp-filter-paid-by')?.value ?? '';
  const categoryId = document.getElementById('bp-filter-category')?.value ?? '';
  const startDateStr = document.getElementById('bp-filter-start-date')?.value ?? '';
  const endDateStr = document.getElementById('bp-filter-end-date')?.value ?? '';

  const startDate = startDateStr ? new Date(startDateStr) : null;
  const endDate = endDateStr ? new Date(endDateStr) : null;
  if (endDate) {
    endDate.setHours(23, 59, 59, 999);
  }

  const filtered = _allLoadedTransactions.filter(row => {
    // 1. Paid By filter
    const rowPaidBy = String(row[TC.PAID_BY] ?? '').trim().toLowerCase();
    if (paidBy && rowPaidBy !== paidBy.toLowerCase()) {
      return false;
    }

    // 2. Category filter
    const rowCat = String(row[TC.CATEGORY_ID] ?? '').trim();
    if (categoryId && rowCat !== categoryId) {
      return false;
    }

    // 3. Date range filter
    const rowDateStr = String(row[TC.DATE] ?? '').trim();
    if (rowDateStr) {
      const rowDate = new Date(rowDateStr);
      if (startDate && rowDate < startDate) return false;
      if (endDate && rowDate > endDate) return false;
    }

    return true;
  });

  _renderTransactionsList(listEl, filtered, _buildCategoryMap());
}

function _triggerCSVExport(listEl) {
  const paidBy = document.getElementById('bp-filter-paid-by')?.value ?? '';
  const categoryId = document.getElementById('bp-filter-category')?.value ?? '';
  const startDateStr = document.getElementById('bp-filter-start-date')?.value ?? '';
  const endDateStr = document.getElementById('bp-filter-end-date')?.value ?? '';

  const startDate = startDateStr ? new Date(startDateStr) : null;
  const endDate = endDateStr ? new Date(endDateStr) : null;
  if (endDate) {
    endDate.setHours(23, 59, 59, 999);
  }

  const filtered = _allLoadedTransactions.filter(row => {
    const rowPaidBy = String(row[TC.PAID_BY] ?? '').trim().toLowerCase();
    if (paidBy && rowPaidBy !== paidBy.toLowerCase()) return false;

    const rowCat = String(row[TC.CATEGORY_ID] ?? '').trim();
    if (categoryId && rowCat !== categoryId) return false;

    const rowDateStr = String(row[TC.DATE] ?? '').trim();
    if (rowDateStr) {
      const rowDate = new Date(rowDateStr);
      if (startDate && rowDate < startDate) return false;
      if (endDate && rowDate > endDate) return false;
    }

    return true;
  });

  if (filtered.length === 0) {
    alert('No transactions match the current filters to export!');
    return;
  }

  const catMap = _buildCategoryMap();
  const csvHeaders = ['Transaction ID', 'Date', 'Month', 'Amount', 'Category', 'Sub-category', 'Description', 'Paid By', 'Funding Source', 'Logged By', 'Logged At', 'Notes'];

  const csvRows = filtered.map(row => {
    const catName = catMap[row[TC.CATEGORY_ID]] || row[TC.CATEGORY_ID] || '';
    return [
      row[TC.ID] ?? '',
      row[TC.DATE] ?? '',
      row[TC.MONTH] ?? '',
      row[TC.AMOUNT] ?? 0,
      catName,
      row[TC.SUB_CATEGORY] ?? '',
      row[TC.DESCRIPTION] ?? '',
      row[TC.PAID_BY] ?? '',
      row[TC.FUNDING_SOURCE] ?? '',
      row[TC.LOGGED_BY] ?? '',
      row[TC.LOGGED_AT] ?? '',
      row[TC.NOTES] ?? ''
    ].map(val => {
      const text = String(val).replace(/"/g, '""');
      if (text.includes(',') || text.includes('"') || text.includes('\n')) {
        return `"${text}"`;
      }
      return text;
    });
  });

  const csvContent = [csvHeaders.join(','), ...csvRows.map(r => r.join(','))].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `BudgetPulse_Transactions_Export_${_toDateString(new Date())}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function _renderTransactionsList(listEl, rows, catMap) {
  if (!rows.length) {
    listEl.innerHTML = '<p class="text-muted" style="padding:12px;">No matching transactions found.</p>';
    return;
  }

  const sorted = [...rows].sort((a, b) =>
    String(b[TC.LOGGED_AT]).localeCompare(String(a[TC.LOGGED_AT]))
  );

  listEl.innerHTML = sorted.map(r => renderTransactionItem(r, catMap)).join('');
}

function _prependTransactionRow(listEl, row) {
  _allLoadedTransactions.unshift(row);
  _applyFilters(listEl);
}

function _removeTransactionRow(listEl, txnId) {
  _allLoadedTransactions = _allLoadedTransactions.filter(r => r[TC.ID] !== txnId);
  _applyFilters(listEl);
}

// ─── Pure Exported Functions (testable) ──────────────────────────────────────

/**
 * Builds a 13-column transaction row array.
 *
 * @param {{ amount, categoryId, subCategory?, description, paidBy, fundingSource, notes? }} data
 * @param {string} loggedBy  Email of the logged-in user
 * @returns {Array}  13 elements matching Transactions sheet column order
 */
export function buildTransactionRow(data, loggedBy) {
  const now   = new Date();
  const date  = data.date ? String(data.date).trim() : _toDateString(now);
  const month = date.slice(0, 7);
  const ts    = _toTimestamp(now);
  const id    = 'txn_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  return [
    id,                        // 0  transaction_id
    date,                      // 1  date
    month,                     // 2  month
    Number(data.amount),       // 3  amount
    data.categoryId,           // 4  category_id
    data.subCategory  ?? '',   // 5  sub_category
    data.description,          // 6  description
    data.paidBy,               // 7  paid_by
    data.fundingSource,        // 8  funding_source
    loggedBy,                  // 9  logged_by
    ts,                        // 10 logged_at
    ts,                        // 11 modified_at (= logged_at on create)
    data.notes        ?? '',   // 12 notes
  ];
}

/**
 * Validates form data before submission.
 *
 * @param {{ amount: string, categoryId: string, description: string }} data
 * @returns {{ valid: boolean, errors: Array<{ field: string, message: string }> }}
 */
export function validateForm(data) {
  const errors = [];

  const amount = parseFloat(data.amount);
  if (!data.amount || String(data.amount).trim() === '') {
    errors.push({ field: 'amount', message: 'Amount is required.' });
  } else if (isNaN(amount) || amount <= 0) {
    errors.push({ field: 'amount', message: 'Amount must be a positive number.' });
  }

  if (!data.categoryId || !String(data.categoryId).trim()) {
    errors.push({ field: 'categoryId', message: 'Please select a category.' });
  }

  if (!data.description || !String(data.description).trim()) {
    errors.push({ field: 'description', message: 'Description is required.' });
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Renders a single transaction row as an HTML string.
 * Email addresses are intentionally omitted from rendered output.
 *
 * @param {Array}                  row     13-element transaction row
 * @param {Object.<string,string>} catMap  categoryId → categoryName
 * @returns {string}
 */
export function renderTransactionItem(row, catMap) {
  const txnId   = String(row[TC.ID]);
  const date    = String(row[TC.DATE]);
  const month   = String(row[TC.MONTH]);
  const amount  = Number(row[TC.AMOUNT]);
  const catId   = String(row[TC.CATEGORY_ID]);
  const desc    = String(row[TC.DESCRIPTION]);
  const funding = String(row[TC.FUNDING_SOURCE]);
  const catName = catMap[catId] || catId;

  const fundingClass = funding === 'Joint' ? 'badge-joint' : 'badge-personal';
  const isUpcoming = _isFutureDate(date);
  const upcomingBadge = isUpcoming ? '<span class="badge badge-upcoming">Upcoming</span> ' : '';

  return `<div class="transaction-item${isUpcoming ? ' transaction-item--upcoming' : ''}" data-txn-id="${_esc(txnId)}" data-month="${_esc(month)}">
  <div class="transaction-item__left">
    <span class="transaction-item__desc">${_esc(desc)}</span>
    <span class="transaction-item__meta">
      ${upcomingBadge}<span class="badge ${_esc(fundingClass)}">${_esc(funding)}</span>
      &middot; ${_esc(catName)}
      &middot; <time datetime="${_esc(date)}">${_esc(date)}</time>
    </span>
  </div>
  <div class="transaction-item__right">
    <div class="transaction-item__amount">₹${amount.toLocaleString('en-IN')}</div>
    <div class="transaction-item__actions">
      <button type="button" class="btn-icon" data-action="edit" data-txn-id="${_esc(txnId)}" aria-label="Edit transaction">✎</button>
      <button type="button" class="btn-icon btn-icon--danger" data-action="delete" data-txn-id="${_esc(txnId)}" aria-label="Delete transaction">✕</button>
    </div>
  </div>
</div>`;
}

/**
 * Finds the 1-based sheet row number for a transaction by its ID.
 * allRows[0] is the header (sheet row 1), allRows[1] is first data (sheet row 2), etc.
 *
 * @param {string} txnId
 * @param {Array[]} allRows  Full result of readRange(TRANSACTIONS_RANGE) including header
 * @returns {number}  1-based row number, or -1 if not found
 */
export function findTransactionRowIndex(txnId, allRows) {
  for (let i = 1; i < allRows.length; i++) {
    if (String(allRows[i][0]) === String(txnId)) return i + 1;
  }
  return -1;
}

// ─── Edit / Delete ────────────────────────────────────────────────────────────

function _wireListActions(listEl) {
  listEl.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const txnId  = btn.dataset.txnId;
    const itemEl = btn.closest('[data-txn-id]');
    if (!txnId || !itemEl) return;

    if (btn.dataset.action === 'delete') {
      await _handleDelete(txnId, itemEl);
    } else if (btn.dataset.action === 'edit') {
      _handleEdit(txnId, itemEl);
    }
  });
}

async function _handleDelete(txnId, itemEl) {
  if (!window.confirm('Delete this expense?')) return;

  itemEl.style.opacity = '0.4';
  itemEl.style.pointerEvents = 'none';

  try {
    const allRows = await readRange(TRANSACTIONS_RANGE);
    const rowNum  = findTransactionRowIndex(txnId, allRows);
    if (rowNum === -1) throw new Error('Transaction not found in sheet');

    const txRow   = allRows.find(r => String(r[0]) === String(txnId));
    const month   = txRow ? String(txRow[TC.MONTH]) : itemEl.dataset.month || _getCurrentMonth();

    const sheetId = await resolveSheetId('Transactions');
    await deleteRow('Transactions', sheetId, rowNum);

    rollbackTransaction(month, txnId);
    // Keep the local filter array in sync — otherwise the next _applyFilters
    // re-render restores the deleted row into the list.
    _allLoadedTransactions = _allLoadedTransactions.filter(
      r => String(r[TC.ID]) !== String(txnId)
    );
    itemEl.remove();
    _showToast('Expense deleted.');

  } catch (err) {
    itemEl.style.opacity = '';
    itemEl.style.pointerEvents = '';
    console.error('[BudgetPulse] Delete failed:', err);
    _showToast('Delete failed. Try again.');
  }
}

function _handleEdit(txnId, itemEl) {
  const month = itemEl.dataset.month || _getCurrentMonth();

  // Search both cache (for optimistically-added txns) and loaded transactions
  let row = (_allLoadedTransactions || []).find(r => String(r[TC.ID]) === String(txnId));
  if (!row) {
    const cachedRows = getTransactionsCache(month) || [];
    row = cachedRows.find(r => String(r[0]) === String(txnId));
  }

  if (!row) {
    _showToast('Cannot edit: transaction not found.');
    return;
  }

  const catMap = _buildCategoryMap();
  const categoryOptions = Object.entries(catMap)
    .map(([id, name]) => `<option value="${_esc(id)}"${id === String(row[TC.CATEGORY_ID]) ? ' selected' : ''}>${_esc(name)}</option>`)
    .join('');

  // Render a real modal overlay on the body — escapes the cramped flex row
  // that made inline editing unusable.
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-content txn-edit-modal" role="dialog" aria-modal="true" aria-label="Edit expense">
      <div class="txn-edit-modal__header">
        <h3 class="txn-edit-modal__title">Edit expense</h3>
        <button type="button" class="btn-icon" data-action="close" aria-label="Close">✕</button>
      </div>
      <form class="txn-edit-form" novalidate>
        <div class="form-group">
          <label class="form-label" for="edit-description">Description</label>
          <input class="form-control" id="edit-description" name="description" type="text" value="${_esc(String(row[TC.DESCRIPTION]))}" required />
        </div>
        <div class="txn-edit-form__row">
          <div class="form-group">
            <label class="form-label" for="edit-amount">Amount</label>
            <input class="form-control" id="edit-amount" name="amount" type="number" value="${Number(row[TC.AMOUNT])}" min="0.01" step="0.01" inputmode="decimal" required />
          </div>
          <div class="form-group">
            <label class="form-label" for="edit-date">Date</label>
            <input class="form-control" id="edit-date" name="date" type="date" value="${_esc(_normalizeDate(row[TC.DATE]))}" required />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label" for="edit-category">Category</label>
          <select class="form-control" id="edit-category" name="categoryId">${categoryOptions}</select>
        </div>
        <div class="form-group">
          <label class="form-label" for="edit-subcategory">Sub-category <span class="form-label__optional">(optional)</span></label>
          <input class="form-control" id="edit-subcategory" name="subCategory" type="text" value="${_esc(String(row[TC.SUB_CATEGORY] || ''))}" />
        </div>
        <div class="txn-edit-form__actions">
          <button type="button" class="btn btn-outline" data-action="close">Cancel</button>
          <button type="submit" class="btn btn-primary">Save changes</button>
        </div>
      </form>
    </div>
  `;

  document.body.appendChild(overlay);
  // Trigger transition (active class drives opacity + slide-in).
  requestAnimationFrame(() => overlay.classList.add('active'));

  const form = overlay.querySelector('form');

  const close = () => {
    overlay.classList.remove('active');
    document.removeEventListener('keydown', onKey);
    setTimeout(() => overlay.remove(), 200);
  };

  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);

  // Backdrop click + close buttons.
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.closest('[data-action="close"]')) close();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await _handleEditSave(txnId, row, form, itemEl, close);
  });

  overlay.querySelector('#edit-description').focus();
}

async function _handleEditSave(txnId, originalRow, form, itemEl, close) {
  const saveBtn = form.querySelector('[type="submit"]');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving…';

  const amount      = parseFloat(form.querySelector('[name="amount"]').value);
  const date        = form.querySelector('[name="date"]').value;
  const categoryId  = form.querySelector('[name="categoryId"]').value;
  const description = form.querySelector('[name="description"]').value.trim();
  const subCategory = form.querySelector('[name="subCategory"]').value.trim();

  const { valid, errors } = validateForm({ amount: String(amount), categoryId, description });
  if (!valid) {
    _showToast(errors[0].message);
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save changes';
    return;
  }

  const month = date.slice(0, 7);
  const updatedRow = [
    originalRow[TC.ID],
    date,
    month,
    amount,
    categoryId,
    subCategory,
    description,
    originalRow[TC.PAID_BY],
    originalRow[TC.FUNDING_SOURCE],
    originalRow[TC.LOGGED_BY],
    originalRow[TC.LOGGED_AT],
    _toTimestamp(new Date()),
    originalRow[TC.NOTES],
  ];

  try {
    const allRows = await readRange(TRANSACTIONS_RANGE);
    const rowNum  = findTransactionRowIndex(txnId, allRows);
    if (rowNum === -1) throw new Error('Transaction not found');

    await updateRow(`Transactions!A${rowNum}:M${rowNum}`, updatedRow);

    updateTransactionInCache(String(originalRow[TC.MONTH]), txnId, updatedRow);

    // Synchronize local filter array
    const idx = _allLoadedTransactions.findIndex(r => String(r[TC.ID]) === String(txnId));
    if (idx !== -1) {
      _allLoadedTransactions[idx] = updatedRow;
    }

    const restored = document.createElement('div');
    restored.innerHTML = renderTransactionItem(updatedRow, _buildCategoryMap());
    itemEl.replaceWith(restored.firstElementChild);

    if (typeof close === 'function') close();
    _showToast('Expense updated ✓');

  } catch (err) {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save changes';
    console.error('[BudgetPulse] Edit save failed:', err);
    _showToast('Save failed. Try again.');
  }
}

// Coerce stored date into the YYYY-MM-DD form <input type="date"> requires.
// Sheet reads can return ISO timestamps or other formats that the input
// silently rejects (blank field, dead calendar).
function _normalizeDate(value) {
  const str = String(value ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  const d = new Date(str);
  return isNaN(d.getTime()) ? '' : _toDateString(d);
}

function _getCurrentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// ─── User Email ───────────────────────────────────────────────────────────────

const SESSION_EMAIL_KEY = 'bp_user_email';

async function _getUserEmail() {
  const cached = sessionStorage.getItem(SESSION_EMAIL_KEY);
  if (cached) return cached;

  const token = getAccessToken();
  if (!token) return 'unknown';

  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return 'unknown';
    const { email } = await res.json();
    if (email) sessionStorage.setItem(SESSION_EMAIL_KEY, email);
    return email || 'unknown';
  } catch {
    return 'unknown';
  }
}

// ─── Category Map ─────────────────────────────────────────────────────────────

function _buildCategoryMap() {
  const select = document.getElementById('category');
  if (!select) return {};
  const map = {};
  for (const opt of select.options) {
    if (opt.value) map[opt.value] = opt.textContent.trim();
  }
  return map;
}

// ─── UI Helpers ───────────────────────────────────────────────────────────────

function _getOrCreateErrorEl(form) {
  let el = form.querySelector('#bp-form-errors');
  if (!el) {
    el = document.createElement('div');
    el.id = 'bp-form-errors';
    el.className = 'form-errors';
    el.setAttribute('role', 'alert');
    el.setAttribute('aria-live', 'assertive');
    form.prepend(el);
  }
  return el;
}

function _showErrors(errorEl, errors) {
  errorEl.innerHTML = errors.map(e => `<p class="form-error">${_esc(e.message)}</p>`).join('');
  errorEl.style.display = '';
}

function _clearErrors(errorEl) {
  errorEl.innerHTML = '';
  errorEl.style.display = 'none';
}

function _showToast(message) {
  const existing = document.getElementById('bp-toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.id = 'bp-toast';
  toast.className = 'toast toast--success';
  toast.setAttribute('role', 'status');
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function _mapFundingSource(value) {
  const v = (value || '').toLowerCase();
  return v.includes('personal') ? 'Personal' : 'Joint';
}

// ─── Date Utilities ───────────────────────────────────────────────────────────

function _toDateString(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function _isFutureDate(dateStr) {
  if (!dateStr) return false;
  return String(dateStr).trim() > _toDateString(new Date());
}

function _toTimestamp(d) {
  return `${_toDateString(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

function _esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
