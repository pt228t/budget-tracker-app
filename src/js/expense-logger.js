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
import { appendRow, readRange } from './sheets-api.js';
import {
  getTransactionsCache,
  setTransactionsCache,
  optimisticAppendTransaction,
  rollbackTransaction,
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
  _wireVendorSuggestion(form);
  _wireSubmit(form, listEl);

  await _loadRecentTransactions(listEl, _buildCategoryMap());
}

// ─── Form Enhancement ─────────────────────────────────────────────────────────

/**
 * Injects sub-category, paid-by, and notes fields before the submit button.
 * Uses data-injected guard to avoid double-injection on re-init.
 */
function _injectMissingFields(form) {
  if (form.dataset.injected) return;
  form.dataset.injected = '1';

  const submitBtn = form.querySelector('[type="submit"]');

  const extra = document.createElement('div');
  extra.className = 'space-y-4';
  extra.innerHTML = `
    <div id="bp-suggestion-banner" class="suggestion-banner" style="display:none;" role="status" aria-live="polite">
      <span id="bp-suggestion-text"></span>
      <button type="button" id="bp-suggestion-accept" class="btn btn-xs btn-outline-primary">Use this</button>
      <button type="button" id="bp-suggestion-dismiss" class="btn btn-xs">Dismiss</button>
    </div>

    <div>
      <label for="bp-sub-category" class="form-label">Sub-category <span class="text-muted">(optional)</span></label>
      <input id="bp-sub-category" name="subCategory" type="text"
        class="form-input" placeholder="e.g. Vegetables, Fuel…" maxlength="60" autocomplete="off">
    </div>

    <div>
      <label for="bp-paid-by" class="form-label">Paid by</label>
      <select id="bp-paid-by" name="paidBy" class="form-select">
        <option value="me">Me</option>
        <option value="partner">Partner</option>
      </select>
    </div>

    <div>
      <label for="bp-notes" class="form-label">Notes <span class="text-muted">(optional)</span></label>
      <input id="bp-notes" name="notes" type="text"
        class="form-input" placeholder="Any extra context…" maxlength="200">
    </div>
  `;

  if (submitBtn) {
    form.insertBefore(extra, submitBtn);
  } else {
    form.appendChild(extra);
  }
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
  };

  const { valid, errors } = validateForm(rawData);
  if (!valid) { _showErrors(errorEl, errors); return; }
  _clearErrors(errorEl);

  const loggedBy = await _getUserEmail();
  const paidBy   = rawData.paidByRaw === 'me' ? loggedBy : 'partner';

  const row = buildTransactionRow({
    amount:        parseFloat(rawData.amount),
    categoryId:    rawData.categoryId,
    subCategory:   rawData.subCategory,
    description:   rawData.description,
    paidBy,
    fundingSource: rawData.fundingSource,
    notes:         rawData.notes,
  }, loggedBy);

  const month = row[TC.MONTH];

  optimisticAppendTransaction(month, row);
  _prependTransactionRow(listEl, row, _buildCategoryMap());

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

async function _loadRecentTransactions(listEl, catMap) {
  const today = new Date();
  const month = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

  listEl.innerHTML = '<p class="text-muted" style="padding:12px;">Loading…</p>';

  let rows = getTransactionsCache(month);

  if (!rows) {
    try {
      const allRows = await readRange(TRANSACTIONS_RANGE);
      rows = allRows.slice(1).filter(r => String(r[TC.MONTH]).trim() === month);
      setTransactionsCache(month, rows);
    } catch (err) {
      listEl.innerHTML = '<p class="text-muted" style="padding:12px;">Could not load transactions.</p>';
      console.error('[BudgetPulse] readRange failed:', err);
      return;
    }
  }

  _renderTransactionsList(listEl, rows, catMap);
}

function _renderTransactionsList(listEl, rows, catMap) {
  if (!rows.length) {
    listEl.innerHTML = '<p class="text-muted" style="padding:12px;">No expenses logged this month yet.</p>';
    return;
  }

  const sorted = [...rows].sort((a, b) =>
    String(b[TC.LOGGED_AT]).localeCompare(String(a[TC.LOGGED_AT]))
  );

  listEl.innerHTML = sorted.map(r => renderTransactionItem(r, catMap)).join('');
}

function _prependTransactionRow(listEl, row, catMap) {
  const emptyMsg = listEl.querySelector('p.text-muted');
  if (emptyMsg) emptyMsg.remove();
  listEl.insertAdjacentHTML('afterbegin', renderTransactionItem(row, catMap));
}

function _removeTransactionRow(listEl, txnId) {
  const el = listEl.querySelector(`[data-txn-id="${CSS.escape(txnId)}"]`);
  if (el) el.remove();
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
  const date  = _toDateString(now);
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
  const amount  = Number(row[TC.AMOUNT]);
  const catId   = String(row[TC.CATEGORY_ID]);
  const desc    = String(row[TC.DESCRIPTION]);
  const funding = String(row[TC.FUNDING_SOURCE]);
  const catName = catMap[catId] || catId;

  const fundingClass = funding === 'Joint' ? 'badge-joint' : 'badge-personal';

  return `<div class="transaction-item" data-txn-id="${_esc(txnId)}">
  <div class="transaction-item__left">
    <span class="transaction-item__desc">${_esc(desc)}</span>
    <span class="transaction-item__meta">
      <span class="badge ${_esc(fundingClass)}">${_esc(funding)}</span>
      &middot; ${_esc(catName)}
      &middot; <time datetime="${_esc(date)}">${_esc(date)}</time>
    </span>
  </div>
  <div class="transaction-item__amount">₹${amount.toLocaleString('en-IN')}</div>
</div>`;
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
