import { describe, it, expect, vi, beforeEach } from 'vitest';
import { bootstrapSpreadsheet, isSpreadsheetReady, REQUIRED_TABS, SCHEMA } from '../../src/js/setup.js';

// Mock auth.js
vi.mock('../../src/js/auth.js', () => ({
  getAccessToken: vi.fn(() => 'mock_token')
}));

// Mock sheets-api.js
vi.mock('../../src/js/sheets-api.js', () => ({
  getSpreadsheetId: vi.fn(() => 'MOCK_SPREADSHEET_ID'),
  setSpreadsheetId: vi.fn(),
  readRange: vi.fn(),
  appendRow: vi.fn().mockResolvedValue({})
}));

describe('Setup / Bootstrap Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it('should define all 7 required tabs', () => {
    expect(REQUIRED_TABS).toEqual([
      'Budget_Categories',
      'Sub_Categories',
      'Transactions',
      'Budget_History',
      'Vendor_Patterns',
      'App_Config',
      'Notification_Log'
    ]);
  });

  it('should define correct headers for each tab', () => {
    expect(SCHEMA.Budget_Categories.headers[0]).toBe('category_id');
    expect(SCHEMA.Transactions.headers).toContain('transaction_id');
    expect(SCHEMA.Transactions.headers).toContain('funding_source');
    expect(SCHEMA.App_Config.headers).toEqual(['key', 'value']);
    expect(SCHEMA.Notification_Log.headers).toContain('notification_id');
  });

  it('should include default config rows for App_Config', () => {
    const defaults = SCHEMA.App_Config.defaults;
    expect(defaults.length).toBeGreaterThan(0);

    const keys = defaults.map(row => row[0]);
    expect(keys).toContain('currency');
    expect(keys).toContain('alert_threshold_percent');
    expect(keys).toContain('allowed_users');
  });

  it('should report ready when all tabs already exist', async () => {
    // Mock: all tabs exist
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        sheets: REQUIRED_TABS.map(title => ({ properties: { title } }))
      })
    });

    const report = await bootstrapSpreadsheet();
    expect(report.ready).toBe(true);
    expect(report.created).toEqual([]);
    expect(report.existing).toEqual(REQUIRED_TABS);
  });

  it('should create missing tabs and write headers', async () => {
    // Mock: only 2 tabs exist
    global.fetch
      // getExistingTabs
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          sheets: [
            { properties: { title: 'Budget_Categories' } },
            { properties: { title: 'Transactions' } }
          ]
        })
      })
      // createTabs (batchUpdate)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ replies: [] })
      })
      // writeHeaders calls (one per missing tab)
      .mockResolvedValue({
        ok: true,
        json: async () => ({})
      });

    const report = await bootstrapSpreadsheet();

    expect(report.existing).toContain('Budget_Categories');
    expect(report.existing).toContain('Transactions');
    expect(report.created).toContain('Sub_Categories');
    expect(report.created).toContain('App_Config');
    expect(report.created).toContain('Notification_Log');
  });

  it('should inject userEmail into allowed_users when creating App_Config', async () => {
    // Mock: no tabs exist
    global.fetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ sheets: [] }) }) // metadata
      .mockResolvedValueOnce({ ok: true, json: async () => ({ replies: [] }) }) // createTabs
      .mockResolvedValue({ ok: true, json: async () => ({}) }); // writeHeaders

    // We must mock the actual appendRow import since it's used for writing defaults
    const { appendRow } = await import('../../src/js/sheets-api.js');
    appendRow.mockClear();

    await bootstrapSpreadsheet('creator@example.com');

    // Find the call to appendRow that wrote 'allowed_users'
    const calls = appendRow.mock.calls;
    const allowedUsersCall = calls.find(call => call[1][0] === 'allowed_users');
    
    expect(allowedUsersCall).toBeDefined();
    expect(allowedUsersCall[1][1]).toBe('creator@example.com');
  });

  it('should return not ready when metadata fetch fails', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 403
    });

    const ready = await isSpreadsheetReady();
    expect(ready).toBe(false);
  });

  it('should return true from isSpreadsheetReady when all tabs exist', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        sheets: REQUIRED_TABS.map(title => ({ properties: { title } }))
      })
    });

    const ready = await isSpreadsheetReady();
    expect(ready).toBe(true);
  });
});
