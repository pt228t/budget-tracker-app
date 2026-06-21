/**
 * tests/unit/cache.test.js
 * Unit tests for src/js/cache.js
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock sheets-api so cache tests don't make real HTTP calls
vi.mock('../../src/js/sheets-api.js', () => ({
  appendRow: vi.fn().mockResolvedValue(undefined),
  updateRow: vi.fn().mockResolvedValue(undefined),
}));

// cache.js registers a window 'online' listener at module load.
// jsdom provides window so this works without extra setup.
import {
  // Categories
  setCategoriesCache, getCategoriesCache, clearCategoriesCache,
  // Sub-categories
  setSubCategoriesCache, getSubCategoriesCache, clearSubCategoriesCache,
  // Transactions
  setTransactionsCache, getTransactionsCache, clearTransactionsCache,
  optimisticAppendTransaction, rollbackTransaction, updateTransactionInCache,
  // Vendor patterns
  getVendorPatterns, recordVendorPattern, suggestCategory, clearVendorPatterns,
  // Write queue
  enqueueWrite, queueLength, flushQueue, onFlushQueue,
  // Session clear
  clearSessionCaches,
} from '../../src/js/cache.js';

import { appendRow, updateRow } from '../../src/js/sheets-api.js';

// ─── Categories (sessionStorage) ─────────────────────────────────────────────

describe('categories cache', () => {
  beforeEach(() => {
    sessionStorage.clear();
    clearCategoriesCache();
  });

  it('returns null on miss', () => {
    expect(getCategoriesCache()).toBeNull();
  });

  it('returns stored rows on hit', () => {
    const rows = [['cat_1', 'Groceries', 8000]];
    setCategoriesCache(rows);
    expect(getCategoriesCache()).toEqual(rows);
  });

  it('returns null after clearCategoriesCache', () => {
    setCategoriesCache([['cat_1', 'Groceries']]);
    clearCategoriesCache();
    expect(getCategoriesCache()).toBeNull();
  });

  it('expires after TTL', () => {
    vi.useFakeTimers();
    setCategoriesCache([['cat_1', 'Groceries']]);
    // Advance past 30 min TTL
    vi.advanceTimersByTime(31 * 60 * 1000);
    expect(getCategoriesCache()).toBeNull();
    vi.useRealTimers();
  });
});

// ─── Sub-categories (sessionStorage) ─────────────────────────────────────────

describe('sub-categories cache', () => {
  beforeEach(() => {
    sessionStorage.clear();
    clearSubCategoriesCache();
  });

  it('round-trips sub-category rows', () => {
    const rows = [['sub_1', 'cat_1', 'Vegetables']];
    setSubCategoriesCache(rows);
    expect(getSubCategoriesCache()).toEqual(rows);
  });
});

// ─── Transactions (memory cache) ─────────────────────────────────────────────

describe('transactions cache', () => {
  const MONTH = '2026-06';

  beforeEach(() => {
    clearTransactionsCache();
  });

  it('returns null on miss', () => {
    expect(getTransactionsCache(MONTH)).toBeNull();
  });

  it('returns rows on hit', () => {
    const rows = [['txn_1', '2026-06-01', MONTH, 500]];
    setTransactionsCache(MONTH, rows);
    expect(getTransactionsCache(MONTH)).toEqual(rows);
  });

  it('expires after 5 min TTL', () => {
    vi.useFakeTimers();
    setTransactionsCache(MONTH, [['txn_1']]);
    vi.advanceTimersByTime(6 * 60 * 1000);
    expect(getTransactionsCache(MONTH)).toBeNull();
    vi.useRealTimers();
  });

  it('clearTransactionsCache(month) removes only that month', () => {
    setTransactionsCache('2026-05', [['old']]);
    setTransactionsCache('2026-06', [['new']]);
    clearTransactionsCache('2026-05');
    expect(getTransactionsCache('2026-05')).toBeNull();
    expect(getTransactionsCache('2026-06')).toEqual([['new']]);
  });

  it('clearTransactionsCache() with no arg clears all months', () => {
    setTransactionsCache('2026-05', [['a']]);
    setTransactionsCache('2026-06', [['b']]);
    clearTransactionsCache();
    expect(getTransactionsCache('2026-05')).toBeNull();
    expect(getTransactionsCache('2026-06')).toBeNull();
  });
});

// ─── Optimistic updates ───────────────────────────────────────────────────────

describe('optimisticAppendTransaction / rollbackTransaction', () => {
  const MONTH = '2026-06';

  beforeEach(() => {
    clearTransactionsCache();
    setTransactionsCache(MONTH, [['txn_existing', 'data']]);
  });

  it('appends row to cached transactions', () => {
    optimisticAppendTransaction(MONTH, ['txn_new', 'data2']);
    expect(getTransactionsCache(MONTH)).toHaveLength(2);
    expect(getTransactionsCache(MONTH)[1][0]).toBe('txn_new');
  });

  it('rollback removes the row by transaction_id', () => {
    optimisticAppendTransaction(MONTH, ['txn_new', 'data2']);
    rollbackTransaction(MONTH, 'txn_new');
    const rows = getTransactionsCache(MONTH);
    expect(rows).toHaveLength(1);
    expect(rows[0][0]).toBe('txn_existing');
  });

  it('optimisticAppend is no-op when month not cached', () => {
    // Should not throw
    expect(() => optimisticAppendTransaction('2099-01', ['x'])).not.toThrow();
  });
});

// ─── Vendor Patterns (localStorage) ──────────────────────────────────────────

describe('vendor patterns', () => {
  beforeEach(() => {
    localStorage.clear();
    clearVendorPatterns();
  });

  it('returns empty object with no patterns stored', () => {
    expect(getVendorPatterns()).toEqual({});
  });

  it('records a pattern and increments count', () => {
    recordVendorPattern('Amazon', 'cat_shopping');
    recordVendorPattern('Amazon', 'cat_shopping');
    const patterns = getVendorPatterns();
    expect(patterns['amazon'].categoryId).toBe('cat_shopping');
    expect(patterns['amazon'].count).toBe(2);
  });

  it('overwrites when category changes for same keyword', () => {
    recordVendorPattern('Amazon', 'cat_shopping');
    recordVendorPattern('Amazon', 'cat_grocery');
    const patterns = getVendorPatterns();
    expect(patterns['amazon'].categoryId).toBe('cat_grocery');
    expect(patterns['amazon'].count).toBe(1);
  });

  it('normalises keyword to lowercase', () => {
    recordVendorPattern('SWIGGY', 'cat_food');
    expect(getVendorPatterns()['swiggy']).toBeDefined();
  });
});

// ─── suggestCategory ─────────────────────────────────────────────────────────

describe('suggestCategory', () => {
  beforeEach(() => {
    localStorage.clear();
    clearVendorPatterns();
  });

  it('returns null when no patterns match', () => {
    expect(suggestCategory('random description')).toBeNull();
  });

  it('returns category for matching keyword', () => {
    recordVendorPattern('swiggy', 'cat_food');
    expect(suggestCategory('Swiggy order dinner')).toBe('cat_food');
  });

  it('returns highest-count match when multiple patterns match', () => {
    recordVendorPattern('amazon', 'cat_grocery');
    recordVendorPattern('amazon', 'cat_grocery'); // count = 2
    recordVendorPattern('order', 'cat_shopping'); // count = 1
    // description contains both 'amazon' and 'order'
    expect(suggestCategory('Amazon order placed')).toBe('cat_grocery');
  });
});

// ─── Write Queue ──────────────────────────────────────────────────────────────

describe('offline write queue', () => {
  beforeEach(() => {
    localStorage.clear();
    // Reset flush handler and clear mock call history from prior tests
    onFlushQueue(null);
    vi.clearAllMocks();
  });

  it('enqueue increases queueLength', () => {
    enqueueWrite('append', 'Transactions!A:M', ['r1']);
    enqueueWrite('append', 'Transactions!A:M', ['r2']);
    expect(queueLength()).toBe(2);
  });

  it('flushQueue calls appendRow for append entries', async () => {
    enqueueWrite('append', 'Transactions!A:M', ['r1']);
    const { flushed, failed } = await flushQueue();
    expect(flushed).toBe(1);
    expect(failed).toBe(0);
    expect(appendRow).toHaveBeenCalledWith('Transactions!A:M', ['r1']);
    expect(queueLength()).toBe(0);
  });

  it('flushQueue calls updateRow for update entries', async () => {
    enqueueWrite('update', 'Transactions!A5:M5', ['updated']);
    await flushQueue();
    expect(updateRow).toHaveBeenCalledWith('Transactions!A5:M5', ['updated']);
  });

  it('failed entries stay in queue', async () => {
    appendRow.mockRejectedValueOnce(new Error('Network fail'));
    enqueueWrite('append', 'Transactions!A:M', ['r1']);
    const { flushed, failed } = await flushQueue();
    expect(flushed).toBe(0);
    expect(failed).toBe(1);
    expect(queueLength()).toBe(1);
  });

  it('custom flushHandler is called instead of direct API calls', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    onFlushQueue(handler);
    enqueueWrite('append', 'Transactions!A:M', ['r1']);
    await flushQueue();
    expect(handler).toHaveBeenCalledOnce();
    expect(appendRow).not.toHaveBeenCalled();
    onFlushQueue(null);
  });

  it('flushQueue returns 0/0 when queue empty', async () => {
    const result = await flushQueue();
    expect(result).toEqual({ flushed: 0, failed: 0 });
  });
});

// ─── clearSessionCaches ───────────────────────────────────────────────────────

describe('clearSessionCaches', () => {
  it('clears categories and sub-categories but not vendor patterns', () => {
    setCategoriesCache([['cat_1']]);
    setSubCategoriesCache([['sub_1']]);
    recordVendorPattern('amazon', 'cat_1');

    clearSessionCaches();

    expect(getCategoriesCache()).toBeNull();
    expect(getSubCategoriesCache()).toBeNull();
    // Vendor patterns survive sign-out
    expect(getVendorPatterns()['amazon']).toBeDefined();
  });
});

// ─── updateTransactionInCache ────────────────────────────────────────────────

describe('updateTransactionInCache', () => {
  beforeEach(() => {
    setTransactionsCache('2026-06', [
      ['txn_001', '2026-06-01', '2026-06', 500, 'cat_a'],
      ['txn_002', '2026-06-02', '2026-06', 200, 'cat_b'],
    ]);
  });

  it('replaces matching row with updated values', () => {
    const updated = ['txn_001', '2026-06-01', '2026-06', 999, 'cat_x'];
    updateTransactionInCache('2026-06', 'txn_001', updated);
    const rows = getTransactionsCache('2026-06');
    expect(rows[0][3]).toBe(999);
    expect(rows[0][4]).toBe('cat_x');
  });

  it('leaves other rows untouched', () => {
    updateTransactionInCache('2026-06', 'txn_001', ['txn_001', '', '', 1]);
    const rows = getTransactionsCache('2026-06');
    expect(rows[1][0]).toBe('txn_002');
  });

  it('is no-op when month not in cache', () => {
    expect(() => updateTransactionInCache('2025-01', 'txn_001', [])).not.toThrow();
  });

  it('is no-op when txnId not found in month', () => {
    updateTransactionInCache('2026-06', 'txn_999', ['txn_999']);
    const rows = getTransactionsCache('2026-06');
    expect(rows).toHaveLength(2);
  });
});
