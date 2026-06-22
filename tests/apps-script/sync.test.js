import { describe, expect, it } from 'vitest';
import { MockSheet, MockSpreadsheet } from './mocks.js';

// ─── Inline implementation matching the FIXED Sync.gs logic ──────────────────
// This mirrors _readRecurringItems() after BUG-001 fix:
//   Col A (0) = item          → name
//   Col B (1) = category      (ignored by sync)
//   Col C (2) = monthly_amount → amount
//   Col D (3) = default_owner  (ignored)
//   Col E (4) = split_rule     (ignored)
//   Col F (5) = active_status → must be 'Active'
function readRecurringItems(sheet) {
  const allRows = sheet.getDataRows(); // skips header
  return allRows
    .map(row => ({
      name:         String(row[0]).trim(),   // Col A: item
      amount:       Number(row[2]),           // Col C: monthly_amount
      activeStatus: String(row[5]).trim(),    // Col F: active_status
    }))
    .filter(item =>
      item.name &&
      !isNaN(item.amount) &&
      item.amount > 0 &&
      item.activeStatus === 'Active'
    )
    .map(({ name, amount }) => ({ name, amount }));
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('_readRecurringItems — BUG-001 regression (correct 9-column schema)', () => {
  // Joint-spend Recurring_Items headers:
  // item | category | monthly_amount | default_owner | split_rule | active_status | start_month | end_month | notes
  const HEADER = ['item', 'category', 'monthly_amount', 'default_owner', 'split_rule', 'active_status', 'start_month', 'end_month', 'notes'];

  it('reads monthly_amount from Col C (not Col B which is category)', () => {
    const sheet = new MockSheet('Recurring_Items', [
      HEADER,
      ['Rent',     'Housing',   25000, 'Joint', 'equal', 'Active',   '2026-01', '', ''],
    ]);
    const items = readRecurringItems(sheet);
    expect(items).toEqual([{ name: 'Rent', amount: 25000 }]);
  });

  it('excludes Inactive rows', () => {
    const sheet = new MockSheet('Recurring_Items', [
      HEADER,
      ['Gym',      'Health',    1500,  'Joint', 'equal', 'Inactive', '2026-01', '2026-05', ''],
      ['Groceries','Food',      8000,  'Joint', 'equal', 'Active',   '2026-01', '',        ''],
    ]);
    const items = readRecurringItems(sheet);
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe('Groceries');
  });

  it('excludes rows with zero or negative amount', () => {
    const sheet = new MockSheet('Recurring_Items', [
      HEADER,
      ['Bad',   'Misc', 0,    'Joint', 'equal', 'Active', '2026-01', '', ''],
      ['Good',  'Misc', 5000, 'Joint', 'equal', 'Active', '2026-01', '', ''],
      ['Neg',   'Misc', -100, 'Joint', 'equal', 'Active', '2026-01', '', ''],
    ]);
    const items = readRecurringItems(sheet);
    expect(items).toEqual([{ name: 'Good', amount: 5000 }]);
  });

  it('returns empty array when sheet has only the header row', () => {
    const sheet = new MockSheet('Recurring_Items', [HEADER]);
    expect(readRecurringItems(sheet)).toEqual([]);
  });

  it('returns empty array when all rows are Inactive', () => {
    const sheet = new MockSheet('Recurring_Items', [
      HEADER,
      ['Rent', 'Housing', 25000, 'Joint', 'equal', 'Inactive', '2026-01', '2026-03', ''],
    ]);
    expect(readRecurringItems(sheet)).toEqual([]);
  });

  it('correctly reads multiple Active items from a realistic 9-column sheet', () => {
    const sheet = new MockSheet('Recurring_Items', [
      HEADER,
      ['Rent',      'Housing',  25000, 'Joint', 'equal',  'Active',   '2026-01', '',        ''],
      ['Groceries', 'Food',      8000, 'Joint', 'equal',  'Active',   '2026-01', '',        ''],
      ['OTT',       'Leisure',    800, 'Joint', 'equal',  'Active',   '2026-03', '',        'Netflix+Prime'],
      ['Old Loan',  'Debt',      5000, 'Joint', 'equal',  'Inactive', '2025-01', '2026-05', ''],
    ]);
    const items = readRecurringItems(sheet);
    expect(items).toEqual([
      { name: 'Rent',      amount: 25000 },
      { name: 'Groceries', amount: 8000  },
      { name: 'OTT',       amount: 800   },
    ]);
  });

  it('BUG-001: would have failed with the OLD 2-column read (regression proof)', () => {
    // The old code read: data[i][1] = Col B = category string
    // Number("Housing") = NaN → every row was skipped → empty result
    const sheet = new MockSheet('Recurring_Items', [
      HEADER,
      ['Rent', 'Housing', 25000, 'Joint', 'equal', 'Active', '2026-01', '', ''],
    ]);
    const allRows = sheet.getDataRows();
    const oldBuggyAmount = Number(allRows[0][1]); // Col B = "Housing"
    expect(isNaN(oldBuggyAmount)).toBe(true);      // proves the old code skipped all rows
    // The fix correctly reads Col C:
    const fixedAmount = Number(allRows[0][2]);      // Col C = 25000
    expect(fixedAmount).toBe(25000);
  });
});
