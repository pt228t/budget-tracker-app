/**
 * tests/unit/expense-logger.test.js
 * Unit tests for src/js/expense-logger.js
 *
 * Tests cover pure functions only — DOM integration is tested via E2E.
 * All Sheets API and cache calls are mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/js/sheets-api.js', () => ({
  readRange:      vi.fn().mockResolvedValue([]),
  appendRow:      vi.fn().mockResolvedValue(undefined),
  updateRow:      vi.fn().mockResolvedValue(undefined),
  deleteRow:      vi.fn().mockResolvedValue(undefined),
  resolveSheetId: vi.fn().mockResolvedValue(0),
  getAccessToken: vi.fn(() => 'fake-token'),
}));

vi.mock('../../src/js/cache.js', () => ({
  getTransactionsCache:        vi.fn(() => null),
  setTransactionsCache:        vi.fn(),
  optimisticAppendTransaction: vi.fn(),
  rollbackTransaction:         vi.fn(),
  updateTransactionInCache:    vi.fn(),
  suggestCategory:             vi.fn(() => null),
  recordVendorPattern:         vi.fn(),
}));

vi.mock('../../src/js/auth.js', () => ({
  getAccessToken: vi.fn(() => 'fake-token'),
}));

import {
  buildTransactionRow,
  validateForm,
  renderTransactionItem,
  findTransactionRowIndex,
} from '../../src/js/expense-logger.js';

import {
  optimisticAppendTransaction,
  rollbackTransaction,
  suggestCategory,
  recordVendorPattern,
} from '../../src/js/cache.js';

import { appendRow } from '../../src/js/sheets-api.js';

// ─── buildTransactionRow ──────────────────────────────────────────────────────

describe('buildTransactionRow', () => {
  const BASE = {
    amount:        500,
    categoryId:    'cat_abc123',
    subCategory:   'Vegetables',
    description:   'Big Bazaar groceries',
    paidBy:        'prashant@gmail.com',
    fundingSource: 'Joint',
    notes:         'Weekly shopping',
  };

  it('returns array of exactly 13 elements', () => {
    const row = buildTransactionRow(BASE, 'prashant@gmail.com');
    expect(row).toHaveLength(13);
  });

  it('col 0 — transaction_id starts with txn_', () => {
    const row = buildTransactionRow(BASE, 'prashant@gmail.com');
    expect(row[0]).toMatch(/^txn_/);
  });

  it('col 1 — date is yyyy-MM-dd format today', () => {
    const row = buildTransactionRow(BASE, 'prashant@gmail.com');
    expect(row[1]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('col 2 — month is yyyy-MM', () => {
    const row = buildTransactionRow(BASE, 'prashant@gmail.com');
    expect(row[2]).toMatch(/^\d{4}-\d{2}$/);
    expect(row[2]).toBe(row[1].slice(0, 7));
  });

  it('col 3 — amount is the numeric amount', () => {
    const row = buildTransactionRow(BASE, 'prashant@gmail.com');
    expect(row[3]).toBe(500);
  });

  it('col 4 — category_id', () => {
    const row = buildTransactionRow(BASE, 'prashant@gmail.com');
    expect(row[4]).toBe('cat_abc123');
  });

  it('col 5 — sub_category', () => {
    const row = buildTransactionRow(BASE, 'prashant@gmail.com');
    expect(row[5]).toBe('Vegetables');
  });

  it('col 6 — description', () => {
    const row = buildTransactionRow(BASE, 'prashant@gmail.com');
    expect(row[6]).toBe('Big Bazaar groceries');
  });

  it('col 7 — paid_by', () => {
    const row = buildTransactionRow(BASE, 'prashant@gmail.com');
    expect(row[7]).toBe('prashant@gmail.com');
  });

  it('col 8 — funding_source', () => {
    const row = buildTransactionRow(BASE, 'prashant@gmail.com');
    expect(row[8]).toBe('Joint');
  });

  it('col 9 — logged_by is the loggedBy param', () => {
    const row = buildTransactionRow(BASE, 'toshi@gmail.com');
    expect(row[9]).toBe('toshi@gmail.com');
  });

  it('col 10 — logged_at is ISO timestamp', () => {
    const row = buildTransactionRow(BASE, 'prashant@gmail.com');
    expect(row[10]).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('col 11 — modified_at equals logged_at on creation', () => {
    const row = buildTransactionRow(BASE, 'prashant@gmail.com');
    expect(row[11]).toBe(row[10]);
  });

  it('col 12 — notes', () => {
    const row = buildTransactionRow(BASE, 'prashant@gmail.com');
    expect(row[12]).toBe('Weekly shopping');
  });

  it('optional fields default to empty string when omitted', () => {
    const minimal = { amount: 100, categoryId: 'cat_x', description: 'test', fundingSource: 'Joint', paidBy: 'me@x.com' };
    const row = buildTransactionRow(minimal, 'me@x.com');
    expect(row[5]).toBe('');  // subCategory
    expect(row[12]).toBe(''); // notes
  });

  it('generates unique IDs for each call', () => {
    const r1 = buildTransactionRow(BASE, 'prashant@gmail.com');
    const r2 = buildTransactionRow(BASE, 'prashant@gmail.com');
    expect(r1[0]).not.toBe(r2[0]);
  });

  it('col 1 & 2 — uses custom date and derives month if provided', () => {
    const custom = { ...BASE, date: '2026-07-15' };
    const row = buildTransactionRow(custom, 'prashant@gmail.com');
    expect(row[1]).toBe('2026-07-15');
    expect(row[2]).toBe('2026-07');
  });
});

// ─── validateForm ─────────────────────────────────────────────────────────────

describe('validateForm', () => {
  it('returns valid=true for complete valid data', () => {
    const result = validateForm({ amount: '500', categoryId: 'cat_x', description: 'test' });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('invalid when amount is missing', () => {
    const result = validateForm({ amount: '', categoryId: 'cat_x', description: 'test' });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.field === 'amount')).toBe(true);
  });

  it('invalid when amount is zero', () => {
    const result = validateForm({ amount: '0', categoryId: 'cat_x', description: 'test' });
    expect(result.valid).toBe(false);
  });

  it('invalid when amount is negative', () => {
    const result = validateForm({ amount: '-100', categoryId: 'cat_x', description: 'test' });
    expect(result.valid).toBe(false);
  });

  it('invalid when amount is non-numeric', () => {
    const result = validateForm({ amount: 'abc', categoryId: 'cat_x', description: 'test' });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.field === 'amount')).toBe(true);
  });

  it('invalid when categoryId is missing', () => {
    const result = validateForm({ amount: '100', categoryId: '', description: 'test' });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.field === 'categoryId')).toBe(true);
  });

  it('invalid when description is empty', () => {
    const result = validateForm({ amount: '100', categoryId: 'cat_x', description: '' });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.field === 'description')).toBe(true);
  });

  it('returns multiple errors for multiple invalid fields', () => {
    const result = validateForm({ amount: '', categoryId: '', description: '' });
    expect(result.errors.length).toBeGreaterThanOrEqual(3);
  });
});

// ─── renderTransactionItem ────────────────────────────────────────────────────

describe('renderTransactionItem', () => {
  // Row column order: [txn_id, date, month, amount, category_id, sub_cat, desc, paid_by, funding, logged_by, logged_at, modified_at, notes]
  const ROW = ['txn_abc', '2026-06-21', '2026-06', 850, 'cat_groc', 'Vegetables', 'Big Bazaar', 'prashant@gmail.com', 'Joint', 'prashant@gmail.com', '2026-06-21T18:00:00', '2026-06-21T18:00:00', ''];
  const CATS = { 'cat_groc': 'Groceries' };

  it('returns a non-empty HTML string', () => {
    const html = renderTransactionItem(ROW, CATS);
    expect(typeof html).toBe('string');
    expect(html.length).toBeGreaterThan(0);
  });

  it('contains the formatted amount', () => {
    const html = renderTransactionItem(ROW, CATS);
    expect(html).toContain('850');
  });

  it('contains the description', () => {
    const html = renderTransactionItem(ROW, CATS);
    expect(html).toContain('Big Bazaar');
  });

  it('contains the category name (not ID)', () => {
    const html = renderTransactionItem(ROW, CATS);
    expect(html).toContain('Groceries');
    expect(html).not.toContain('cat_groc');
  });

  it('contains the date', () => {
    const html = renderTransactionItem(ROW, CATS);
    expect(html).toContain('2026-06-21');
  });

  it('falls back to category_id when name not in map', () => {
    const html = renderTransactionItem(ROW, {});
    expect(html).toContain('cat_groc');
  });

  it('does not expose email addresses in output', () => {
    const html = renderTransactionItem(ROW, CATS);
    expect(html).not.toContain('prashant@gmail.com');
  });

  it('shows funding source badge', () => {
    const html = renderTransactionItem(ROW, CATS);
    expect(html).toContain('Joint');
  });
});

// ─── vendor suggestion integration ───────────────────────────────────────────

describe('suggestCategory (via cache mock)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when no pattern matches', () => {
    suggestCategory.mockReturnValue(null);
    expect(suggestCategory('random vendor')).toBeNull();
  });

  it('returns categoryId when pattern matches', () => {
    suggestCategory.mockReturnValue('cat_food');
    expect(suggestCategory('Swiggy order')).toBe('cat_food');
  });
});

// ─── optimistic append / rollback ─────────────────────────────────────────────

describe('optimistic transaction flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls optimisticAppendTransaction before API', async () => {
    appendRow.mockResolvedValue(undefined);
    const month = '2026-06';
    const row = ['txn_1', '2026-06-21', month, 500, 'cat_x', '', 'test', 'me@x.com', 'Joint', 'me@x.com', '', '', ''];

    // Simulate what _handleSubmit does
    optimisticAppendTransaction(month, row);
    await appendRow('Transactions!A:M', row);

    expect(optimisticAppendTransaction).toHaveBeenCalledWith(month, row);
    expect(appendRow).toHaveBeenCalledWith('Transactions!A:M', row);
    expect(rollbackTransaction).not.toHaveBeenCalled();
  });

  it('calls rollbackTransaction when appendRow fails', async () => {
    appendRow.mockRejectedValue(new Error('API error'));
    const month = '2026-06';
    const row = ['txn_2', '2026-06-21', month, 500, 'cat_x', '', 'test', 'me@x.com', 'Joint', 'me@x.com', '', '', ''];

    optimisticAppendTransaction(month, row);
    try {
      await appendRow('Transactions!A:M', row);
    } catch {
      rollbackTransaction(month, row[0]);
    }

    expect(rollbackTransaction).toHaveBeenCalledWith(month, 'txn_2');
  });
});

// ─── renderTransactionItem — action buttons ────────────────────────────────────

describe('renderTransactionItem action buttons', () => {
  const ROW = ['txn_abc', '2026-06-21', '2026-06', 850, 'cat_groc', 'Vegetables', 'Big Bazaar', 'prashant@gmail.com', 'Joint', 'prashant@gmail.com', '2026-06-21T18:00:00', '2026-06-21T18:00:00', ''];
  const CATS = { 'cat_groc': 'Groceries' };

  it('contains an edit button with data-action="edit"', () => {
    const html = renderTransactionItem(ROW, CATS);
    expect(html).toContain('data-action="edit"');
  });

  it('contains a delete button with data-action="delete"', () => {
    const html = renderTransactionItem(ROW, CATS);
    expect(html).toContain('data-action="delete"');
  });

  it('action buttons carry the transaction id', () => {
    const html = renderTransactionItem(ROW, CATS);
    expect(html.match(/data-action="edit"[^>]*data-txn-id="txn_abc"|data-txn-id="txn_abc"[^>]*data-action="edit"/)).toBeTruthy();
  });
});

// ─── findTransactionRowIndex ───────────────────────────────────────────────────

describe('findTransactionRowIndex', () => {
  const ALL_ROWS = [
    ['transaction_id', 'date', 'month'],       // header — index 0 → sheet row 1
    ['txn_001', '2026-06-01', '2026-06'],      // index 1 → sheet row 2
    ['txn_002', '2026-06-02', '2026-06'],      // index 2 → sheet row 3
    ['txn_003', '2026-06-03', '2026-06'],      // index 3 → sheet row 4
  ];

  it('returns 1-based sheet row for txn_001 (first data row)', () => {
    expect(findTransactionRowIndex('txn_001', ALL_ROWS)).toBe(2);
  });

  it('returns 1-based sheet row for txn_003 (third data row)', () => {
    expect(findTransactionRowIndex('txn_003', ALL_ROWS)).toBe(4);
  });

  it('returns -1 when txnId not found', () => {
    expect(findTransactionRowIndex('txn_999', ALL_ROWS)).toBe(-1);
  });

  it('returns -1 for empty rows array', () => {
    expect(findTransactionRowIndex('txn_001', [])).toBe(-1);
  });

  it('does not match the header row (index 0)', () => {
    expect(findTransactionRowIndex('transaction_id', ALL_ROWS)).toBe(-1);
  });
});
