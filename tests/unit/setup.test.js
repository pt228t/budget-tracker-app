import { describe, it, expect, vi, beforeEach } from 'vitest';
import { bootstrapSpreadsheet, isSpreadsheetReady, REQUIRED_TABS, SCHEMA } from '../../src/js/setup.js';

// Mock auth.js
vi.mock('../../src/js/auth.js', () => ({
  getAccessToken: vi.fn(() => 'mock_token')
}));

// Mock sheets-api.js — default: spreadsheet ID already in localStorage
vi.mock('../../src/js/sheets-api.js', () => ({
  getSpreadsheetId: vi.fn(() => 'MOCK_SPREADSHEET_ID'),
  setSpreadsheetId: vi.fn(),
  readRange: vi.fn(),
  appendRow: vi.fn().mockResolvedValue({}),
  updateCell: vi.fn().mockResolvedValue({}),
  ScopeError: class ScopeError extends Error {
    constructor() { super('OAuth token has insufficient scopes'); this.name = 'ScopeError'; }
  }
}));

describe('Setup / Bootstrap Module', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    global.fetch = vi.fn();
    window.history.replaceState({}, '', '?');

    const sheetsApi = await import('../../src/js/sheets-api.js');
    sheetsApi.getSpreadsheetId.mockReset();
    sheetsApi.getSpreadsheetId.mockReturnValue('MOCK_SPREADSHEET_ID');
    sheetsApi.setSpreadsheetId.mockReset();
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

describe('bootstrapSpreadsheet - preferred sheet sources', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    global.fetch = vi.fn();
    window.history.replaceState({}, '', '?');

    const sheetsApi = await import('../../src/js/sheets-api.js');
    sheetsApi.getSpreadsheetId.mockReset();
    sheetsApi.getSpreadsheetId.mockReturnValue('MOCK_SPREADSHEET_ID');
    sheetsApi.setSpreadsheetId.mockReset();
  });

  it('prefers configured sheet ID over stale localStorage cache', async () => {
    const { getSpreadsheetId, setSpreadsheetId } = await import('../../src/js/sheets-api.js');
    vi.stubEnv('VITE_BUDGETPULSE_SHEET_ID', 'CANONICAL_SHEET_ID');
    getSpreadsheetId.mockReturnValueOnce('STALE_LOCAL_SHEET_ID');

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ sheets: REQUIRED_TABS.map(t => ({ properties: { title: t } })) })
    });

    const report = await bootstrapSpreadsheet();

    expect(report.ready).toBe(true);
    expect(setSpreadsheetId).toHaveBeenCalledWith('CANONICAL_SHEET_ID');
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch.mock.calls[0][0]).toContain('/spreadsheets/CANONICAL_SHEET_ID?fields=');
  });

  it('prefers spreadsheetId from URL params and normalizes shared sheet links', async () => {
    const { getSpreadsheetId, setSpreadsheetId } = await import('../../src/js/sheets-api.js');
    getSpreadsheetId.mockReturnValueOnce(null);
    window.history.replaceState(
      {},
      '',
      '?spreadsheetId=https://docs.google.com/spreadsheets/d/SHARED_SHEET_ID/edit#gid=0'
    );

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ sheets: REQUIRED_TABS.map(t => ({ properties: { title: t } })) })
    });

    const report = await bootstrapSpreadsheet();

    expect(report.ready).toBe(true);
    expect(setSpreadsheetId).toHaveBeenCalledWith('SHARED_SHEET_ID');
    expect(global.fetch.mock.calls[0][0]).toContain('/spreadsheets/SHARED_SHEET_ID?fields=');
  });
});

describe('bootstrapSpreadsheet — Drive-based sheet discovery (BUG-006)', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    global.fetch = vi.fn();
    window.history.replaceState({}, '', '?');

    const sheetsApi = await import('../../src/js/sheets-api.js');
    sheetsApi.getSpreadsheetId.mockReset();
    sheetsApi.getSpreadsheetId.mockReturnValue('MOCK_SPREADSHEET_ID');
    sheetsApi.setSpreadsheetId.mockReset();
  });

  it('reuses existing Drive sheet when localStorage is empty', async () => {
    const { getSpreadsheetId, setSpreadsheetId } = await import('../../src/js/sheets-api.js');
    getSpreadsheetId.mockReturnValueOnce(null);

    // Drive search returns existing sheet
    global.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ files: [{ id: 'EXISTING_SHEET_ID', name: 'BudgetPulse', createdTime: '2026-06-22T00:00:00Z' }] })
      })
      // metadata fetch (all tabs exist)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sheets: REQUIRED_TABS.map(t => ({ properties: { title: t } })) })
      });

    await bootstrapSpreadsheet();

    expect(setSpreadsheetId).toHaveBeenCalledWith('EXISTING_SHEET_ID');
    // Drive was queried, Sheets create was NOT called
    const driveCall = global.fetch.mock.calls.find(c => c[0].includes('/drive/v3/files'));
    const sheetsCreateCall = global.fetch.mock.calls.find(c => c[0].includes('/spreadsheets') && c[1]?.method === 'POST');
    expect(driveCall).toBeDefined();
    expect(sheetsCreateCall).toBeUndefined();
  });

  it('creates new sheet when localStorage empty and Drive has no match', async () => {
    const { getSpreadsheetId, setSpreadsheetId } = await import('../../src/js/sheets-api.js');
    getSpreadsheetId.mockReturnValueOnce(null);

    global.fetch
      // Drive search: no files
      .mockResolvedValueOnce({ ok: true, json: async () => ({ files: [] }) })
      // Sheets create
      .mockResolvedValueOnce({ ok: true, json: async () => ({ spreadsheetId: 'NEW_SHEET_ID' }) })
      // metadata (all tabs exist)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sheets: REQUIRED_TABS.map(t => ({ properties: { title: t } })) })
      });

    await bootstrapSpreadsheet();

    expect(setSpreadsheetId).toHaveBeenCalledWith('NEW_SHEET_ID');
  });

  it('fails bootstrap when Drive search fails', async () => {
    const { getSpreadsheetId, setSpreadsheetId } = await import('../../src/js/sheets-api.js');
    getSpreadsheetId.mockReturnValueOnce(null);

    global.fetch
      // Drive search: API error (not a scope error, just a permission issue on the file)
      .mockResolvedValueOnce({ ok: false, status: 403, json: async () => ({ error: { status: 'PERMISSION_DENIED', message: 'mock permission denied' } }) });

    const report = await bootstrapSpreadsheet();

    expect(report.ready).toBe(false);
    expect(report.errors[0]).toContain('Drive search failed: mock permission denied');
    expect(setSpreadsheetId).not.toHaveBeenCalled();
  });
});

describe('bootstrapSpreadsheet — ensureUserAuthorized (B-038)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  function allTabsMetadata() {
    return {
      ok: true,
      json: async () => ({ sheets: REQUIRED_TABS.map(t => ({ properties: { title: t } })) })
    };
  }

  it('adds userEmail to allowed_users when all tabs exist and field is empty', async () => {
    global.fetch.mockResolvedValueOnce(allTabsMetadata());

    const { readRange, updateCell } = await import('../../src/js/sheets-api.js');
    readRange.mockResolvedValueOnce([
      ['key', 'value'],
      ['source_spreadsheet_id', ''],
      ['allowed_users', ''],
      ['currency', 'INR'],
    ]);
    updateCell.mockClear();

    const report = await bootstrapSpreadsheet('first@example.com');

    expect(report.ready).toBe(true);
    expect(updateCell).toHaveBeenCalledWith('App_Config!B3', 'first@example.com');
  });

  it('appends userEmail when other users already in allowed_users', async () => {
    global.fetch.mockResolvedValueOnce(allTabsMetadata());

    const { readRange, updateCell } = await import('../../src/js/sheets-api.js');
    readRange.mockResolvedValueOnce([
      ['key', 'value'],
      ['allowed_users', 'admin@example.com'],
    ]);
    updateCell.mockClear();

    await bootstrapSpreadsheet('newuser@example.com');

    expect(updateCell).toHaveBeenCalledWith(
      'App_Config!B2',
      'admin@example.com, newuser@example.com'
    );
  });

  it('skips updateCell when userEmail already in allowed_users', async () => {
    global.fetch.mockResolvedValueOnce(allTabsMetadata());

    const { readRange, updateCell } = await import('../../src/js/sheets-api.js');
    readRange.mockResolvedValueOnce([
      ['key', 'value'],
      ['allowed_users', 'existing@example.com'],
    ]);
    updateCell.mockClear();

    await bootstrapSpreadsheet('existing@example.com');

    expect(updateCell).not.toHaveBeenCalled();
  });

  it('does nothing when userEmail is empty string', async () => {
    global.fetch.mockResolvedValueOnce(allTabsMetadata());

    const { readRange, updateCell } = await import('../../src/js/sheets-api.js');
    readRange.mockClear();
    updateCell.mockClear();

    await bootstrapSpreadsheet('');

    expect(readRange).not.toHaveBeenCalled();
    expect(updateCell).not.toHaveBeenCalled();
  });
});
