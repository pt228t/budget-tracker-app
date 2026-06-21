/**
 * src/js/cache.js — BudgetPulse
 * Three-tier caching + offline write queue.
 *
 * Tiers:
 *   sessionStorage — Budget_Categories, Sub_Categories (cleared on tab close)
 *   localStorage   — Vendor_Patterns (persists across sessions)
 *   Memory Map     — Transactions (fast access, cleared on page reload)
 *
 * Offline write queue:
 *   Pending writes stored in localStorage as JSON array.
 *   Flushed automatically when `online` event fires.
 *   Caller registers a flush handler via onFlushQueue().
 */

import { appendRow, updateRow } from './sheets-api.js';

// ─── Storage Keys ─────────────────────────────────────────────────────────────

const KEY = {
  CATEGORIES:     'bp_categories',
  SUB_CATEGORIES: 'bp_sub_categories',
  VENDOR_PATTERNS:'bp_vendor_patterns',
  WRITE_QUEUE:    'bp_write_queue',
};

const CATEGORY_TTL_MS  = 30 * 60 * 1000; // 30 min — categories rarely change mid-session
const VENDOR_TTL_MS    = 7  * 24 * 60 * 60 * 1000; // 7 days

// ─── In-Memory Transaction Cache ─────────────────────────────────────────────

/** @type {Map<string, { rows: Array[], month: string, fetchedAt: number }>} */
const _txnCache = new Map();
const TXN_TTL_MS = 5 * 60 * 1000; // 5 min

// ─── Generic sessionStorage Helpers ──────────────────────────────────────────

function _sessionGet(key) {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      sessionStorage.removeItem(key);
      return null;
    }
    return entry.data;
  } catch {
    return null;
  }
}

function _sessionSet(key, data, ttlMs) {
  try {
    sessionStorage.setItem(key, JSON.stringify({
      data,
      expiresAt: ttlMs ? Date.now() + ttlMs : null,
    }));
  } catch {
    // sessionStorage full — skip silently, callers always fetch fresh on miss
  }
}

function _sessionDel(key) {
  try { sessionStorage.removeItem(key); } catch {}
}

// ─── Generic localStorage Helpers ────────────────────────────────────────────

function _localGet(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      localStorage.removeItem(key);
      return null;
    }
    return entry.data;
  } catch {
    return null;
  }
}

function _localSet(key, data, ttlMs) {
  try {
    localStorage.setItem(key, JSON.stringify({
      data,
      expiresAt: ttlMs ? Date.now() + ttlMs : null,
    }));
  } catch {
    // localStorage full — evict write queue last, clear this key
    localStorage.removeItem(key);
  }
}

function _localDel(key) {
  try { localStorage.removeItem(key); } catch {}
}

// ─── Budget Categories ────────────────────────────────────────────────────────

/**
 * @param {Array[]} rows  Raw 2D array from readRange
 */
export function setCategoriesCache(rows) {
  _sessionSet(KEY.CATEGORIES, rows, CATEGORY_TTL_MS);
}

/**
 * @returns {Array[]|null}  null = cache miss
 */
export function getCategoriesCache() {
  return _sessionGet(KEY.CATEGORIES);
}

export function clearCategoriesCache() {
  _sessionDel(KEY.CATEGORIES);
}

// ─── Sub-Categories ───────────────────────────────────────────────────────────

export function setSubCategoriesCache(rows) {
  _sessionSet(KEY.SUB_CATEGORIES, rows, CATEGORY_TTL_MS);
}

export function getSubCategoriesCache() {
  return _sessionGet(KEY.SUB_CATEGORIES);
}

export function clearSubCategoriesCache() {
  _sessionDel(KEY.SUB_CATEGORIES);
}

// ─── Transactions (Memory Cache) ──────────────────────────────────────────────

/**
 * @param {string} month   yyyy-MM key
 * @param {Array[]} rows
 */
export function setTransactionsCache(month, rows) {
  _txnCache.set(month, { rows, fetchedAt: Date.now() });
}

/**
 * @param {string} month
 * @returns {Array[]|null}
 */
export function getTransactionsCache(month) {
  const entry = _txnCache.get(month);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > TXN_TTL_MS) {
    _txnCache.delete(month);
    return null;
  }
  return entry.rows;
}

export function clearTransactionsCache(month) {
  if (month) {
    _txnCache.delete(month);
  } else {
    _txnCache.clear();
  }
}

/**
 * Optimistically appends a row to the in-memory transaction cache.
 * Called immediately after user submits expense form — before API confirms.
 *
 * @param {string} month
 * @param {Array}  row
 */
export function optimisticAppendTransaction(month, row) {
  const entry = _txnCache.get(month);
  if (entry) {
    entry.rows = [...entry.rows, row];
  }
}

/**
 * Rolls back an optimistic append by removing the row with matching transaction_id.
 * Called if the API write fails.
 *
 * @param {string} month
 * @param {string} transactionId  Value at index 0 of the row
 */
export function rollbackTransaction(month, transactionId) {
  const entry = _txnCache.get(month);
  if (entry) {
    entry.rows = entry.rows.filter(r => String(r[0]) !== String(transactionId));
  }
}

export function updateTransactionInCache(month, txnId, updatedRow) {
  const entry = _txnCache.get(month);
  if (!entry) return;
  const idx = entry.rows.findIndex(r => String(r[0]) === String(txnId));
  if (idx !== -1) entry.rows[idx] = updatedRow;
}

// ─── Vendor Patterns (localStorage) ──────────────────────────────────────────

/**
 * @typedef {{ categoryId: string, count: number, lastUsed: string }} VendorEntry
 * @typedef {Object.<string, VendorEntry>} VendorPatternMap  keyword → entry
 */

/**
 * @returns {VendorPatternMap}
 */
export function getVendorPatterns() {
  return _localGet(KEY.VENDOR_PATTERNS) || {};
}

/**
 * Updates the vendor pattern map — increments count for keyword → categoryId.
 * Keyword is lowercased and trimmed for consistent matching.
 *
 * @param {string} keyword
 * @param {string} categoryId
 */
export function recordVendorPattern(keyword, categoryId) {
  const patterns = getVendorPatterns();
  const key = keyword.toLowerCase().trim();
  if (!key) return;

  if (patterns[key] && patterns[key].categoryId === categoryId) {
    patterns[key].count++;
    patterns[key].lastUsed = new Date().toISOString().slice(0, 10);
  } else {
    // New keyword or category changed — overwrite (latest wins)
    patterns[key] = { categoryId, count: 1, lastUsed: new Date().toISOString().slice(0, 10) };
  }

  _localSet(KEY.VENDOR_PATTERNS, patterns, VENDOR_TTL_MS);
}

/**
 * Suggests a categoryId for a description string by scanning vendor patterns.
 * Returns the best match (highest count) or null if no pattern matches.
 *
 * @param {string} description
 * @returns {string|null}  categoryId
 */
export function suggestCategory(description) {
  const patterns = getVendorPatterns();
  const desc = description.toLowerCase();
  let best = null;
  let bestCount = 0;

  for (const [keyword, entry] of Object.entries(patterns)) {
    if (desc.includes(keyword) && entry.count > bestCount) {
      best = entry.categoryId;
      bestCount = entry.count;
    }
  }

  return best;
}

export function clearVendorPatterns() {
  _localDel(KEY.VENDOR_PATTERNS);
}

// ─── Offline Write Queue ──────────────────────────────────────────────────────

/**
 * @typedef {{ type: 'append'|'update', range: string, values: Array, queuedAt: string }} QueueEntry
 */

let _flushHandler = null;

/**
 * Registers a custom flush handler. If not set, the default handler
 * calls appendRow/updateRow directly using sheets-api.js.
 *
 * @param {(entries: QueueEntry[]) => Promise<void>} handler
 */
export function onFlushQueue(handler) {
  _flushHandler = handler;
}

/**
 * Adds a write operation to the offline queue.
 *
 * @param {'append'|'update'} type
 * @param {string} range
 * @param {Array}  values
 */
export function enqueueWrite(type, range, values) {
  const queue = _getQueue();
  queue.push({ type, range, values, queuedAt: new Date().toISOString() });
  _saveQueue(queue);
}

/**
 * Returns the number of pending queued writes.
 *
 * @returns {number}
 */
export function queueLength() {
  return _getQueue().length;
}

/**
 * Flushes all pending writes in queue order.
 * Successful entries are removed; failed entries remain (will retry next flush).
 *
 * @returns {Promise<{ flushed: number, failed: number }>}
 */
export async function flushQueue() {
  const queue = _getQueue();
  if (!queue.length) return { flushed: 0, failed: 0 };

  const remaining = [];
  let flushed = 0;

  for (const entry of queue) {
    try {
      if (_flushHandler) {
        await _flushHandler([entry]);
      } else {
        if (entry.type === 'append') {
          await appendRow(entry.range, entry.values);
        } else if (entry.type === 'update') {
          await updateRow(entry.range, entry.values);
        }
      }
      flushed++;
    } catch {
      remaining.push(entry);
    }
  }

  _saveQueue(remaining);
  return { flushed, failed: remaining.length };
}

function _getQueue() {
  try {
    return JSON.parse(localStorage.getItem(KEY.WRITE_QUEUE) || '[]');
  } catch {
    return [];
  }
}

function _saveQueue(queue) {
  try {
    localStorage.setItem(KEY.WRITE_QUEUE, JSON.stringify(queue));
  } catch {}
}

// ─── Auto-Flush on Reconnect ──────────────────────────────────────────────────

window.addEventListener('online', () => {
  const pending = queueLength();
  if (pending > 0) {
    flushQueue().then(({ flushed, failed }) => {
      console.log(`[BudgetPulse] Queue flushed: ${flushed} written, ${failed} failed`);
    });
  }
});

// ─── Full Cache Clear (sign-out) ──────────────────────────────────────────────

/**
 * Clears all session and memory caches.
 * Call on sign-out. Does NOT clear localStorage vendor patterns or write queue.
 */
export function clearSessionCaches() {
  _sessionDel(KEY.CATEGORIES);
  _sessionDel(KEY.SUB_CATEGORIES);
  _txnCache.clear();
}
