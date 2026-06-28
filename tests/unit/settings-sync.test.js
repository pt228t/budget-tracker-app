import { describe, it, expect, vi, beforeEach } from 'vitest';
import { syncCategoriesFromSource } from '../../src/js/categories.js';
import * as sheetsApi from '../../src/js/sheets-api.js';

// Mock sheets-api.js
vi.mock('../../src/js/sheets-api.js', () => ({
  readRange: vi.fn(),
  readRangeFromSpreadsheet: vi.fn(),
  appendRow: vi.fn().mockResolvedValue({}),
  updateCell: vi.fn().mockResolvedValue({}),
  getSpreadsheetId: vi.fn(() => 'MOCK_SPREADSHEET_ID')
}));

describe('syncCategoriesFromSource', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws error when source_spreadsheet_id is missing', async () => {
    vi.mocked(sheetsApi.readRange).mockResolvedValueOnce([
      ['key', 'value'],
      ['source_spreadsheet_id', ''],
    ]);

    await expect(syncCategoriesFromSource()).rejects.toThrow('source_spreadsheet_id not set in App_Config');
  });

  it('performs sync successfully by adding, updating, and archiving categories', async () => {
    // 1. Mock App_Config read
    vi.mocked(sheetsApi.readRange).mockResolvedValueOnce([
      ['key', 'value'],
      ['source_spreadsheet_id', 'SOURCE_SHEET_ID'],
      ['source_recurring_items_tab', 'Recurring_Items']
    ]);

    // 2. Mock readRangeFromSpreadsheet for source Recurring_Items
    vi.mocked(sheetsApi.readRangeFromSpreadsheet).mockResolvedValueOnce([
      ['item', 'category', 'monthly_amount', 'default_owner', 'split_rule', 'active_status'],
      ['Rent', 'Rent', '49000', 'me', '50/50', 'Active'],          // Unchanged (already exists)
      ['Electricity', 'Bills', '12000', 'partner', '50/50', 'Active'], // Budget updated (from 11500 to 12000)
      ['New Category', 'Shopping', '5000', 'me', '50/50', 'Active'],   // New category (does not exist)
      // 'Iron Waala' exists in local but is omitted from source -> should be archived
    ]);

    // 3. Mock local categories read
    vi.mocked(sheetsApi.readRange).mockResolvedValueOnce([
      ['category_id', 'category_name', 'monthly_budget', 'source', 'source_item_name', 'active_status', 'created_month', 'notes'],
      ['cat_1', 'Rent', '49000', 'synced', 'Rent', 'Active', '2026-06', ''],
      ['cat_2', 'Electricity', '11500', 'synced', 'Electricity', 'Active', '2026-06', ''],
      ['cat_3', 'Iron Waala', '2000', 'synced', 'Iron Waala', 'Active', '2026-06', ''],
    ]);

    const result = await syncCategoriesFromSource();

    // Verify result summary
    expect(result).toEqual({
      added: 1,      // New Category
      updated: 1,    // Electricity budget updated
      archived: 1,   // Iron Waala archived
      unchanged: 1   // Rent unchanged
    });

    // Verify correct update/append sheet calls
    expect(sheetsApi.updateCell).toHaveBeenCalledWith('Budget_Categories!C3', 12000); // Electricity budget cell row 3
    expect(sheetsApi.updateCell).toHaveBeenCalledWith('Budget_Categories!F4', 'Archived'); // Iron Waala active_status cell row 4
    expect(sheetsApi.appendRow).toHaveBeenCalledTimes(3); // 1 for New Category row, 1 for New Category history, 1 for Electricity history
  });
});
