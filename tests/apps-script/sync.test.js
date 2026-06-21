import { describe, expect, it } from 'vitest';
import { MockSpreadsheet } from './mocks.js';

function syncRecurringItemsToBudgetCategories(spreadsheet) {
  const sourceSheet = spreadsheet.getSheetByName('Recurring_Items');
  const targetSheet =
    spreadsheet.getSheetByName('Budget_Categories') || spreadsheet.insertSheet('Budget_Categories');

  const rows = sourceSheet.getDataRange().getValues().slice(1);

  targetSheet.clear();
  targetSheet.appendRow(['Category', 'MonthlyBudget']);

  rows.forEach(([category, amount, enabled]) => {
    if (enabled) {
      targetSheet.appendRow([category, amount]);
    }
  });

  return targetSheet.getDataRange().getValues();
}

describe('Apps Script sync mocks', () => {
  it('copies active recurring items into budget categories', () => {
    const spreadsheet = new MockSpreadsheet({
      Recurring_Items: [
        ['Category', 'Amount', 'Enabled'],
        ['Rent', 25000, true],
        ['Gym', 1500, false],
        ['Groceries', 8000, true],
      ],
    });

    const syncedRows = syncRecurringItemsToBudgetCategories(spreadsheet);

    expect(syncedRows).toEqual([
      ['Category', 'MonthlyBudget'],
      ['Rent', 25000],
      ['Groceries', 8000],
    ]);
  });
});
