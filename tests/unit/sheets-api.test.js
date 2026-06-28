/**
 * tests/unit/sheets-api.test.js
 * Unit tests for src/js/sheets-api.js
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Set up localStorage mock for the spreadsheet ID
global.localStorage = {
  getItem: vi.fn(() => 'MOCK_SPREADSHEET_ID'),
  setItem: vi.fn()
};

// Mock auth.js before importing sheets-api so the module sees the mock
vi.mock('../../src/js/auth.js', () => ({
  getAccessToken: vi.fn(() => 'fake-token'),
}));

import {
  readRange,
  batchGet,
  appendRow,
  updateRow,
  updateCell,
  isUserAllowed,
  getAuthorizedUsers,
  addAuthorizedUser,
  removeAuthorizedUser,
  onTokenExpired,
  SheetsApiError,
  OfflineError,
  AuthError,
  SPREADSHEET_ID,
} from '../../src/js/sheets-api.js';

import { getAccessToken } from '../../src/js/auth.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mockFetchOk(body) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => body,
  });
}

function mockFetchStatus(status, body = {}) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

// ─── readRange ────────────────────────────────────────────────────────────────

describe('readRange', () => {
  beforeEach(() => {
    vi.stubGlobal('navigator', { onLine: true });
    getAccessToken.mockReturnValue('fake-token');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns values array on success', async () => {
    global.fetch = mockFetchOk({ values: [['A', 'B'], ['C', 'D']] });
    const result = await readRange('Budget_Categories!A:H');
    expect(result).toEqual([['A', 'B'], ['C', 'D']]);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('returns [] when response has no values key', async () => {
    global.fetch = mockFetchOk({});
    const result = await readRange('Budget_Categories!A:H');
    expect(result).toEqual([]);
  });

  it('throws OfflineError when navigator.onLine is false', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    global.fetch = mockFetchOk({});
    await expect(readRange('Budget_Categories!A:H')).rejects.toThrow(OfflineError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('throws AuthError and fires onTokenExpired when 401', async () => {
    global.fetch = mockFetchStatus(401);
    const cb = vi.fn();
    onTokenExpired(cb);
    await expect(readRange('Budget_Categories!A:H')).rejects.toThrow(AuthError);
    expect(cb).toHaveBeenCalledOnce();
    onTokenExpired(null); // reset
  });

  it('throws AuthError when getAccessToken returns null', async () => {
    getAccessToken.mockReturnValue(null);
    global.fetch = vi.fn();
    const cb = vi.fn();
    onTokenExpired(cb);
    await expect(readRange('Budget_Categories!A:H')).rejects.toThrow(AuthError);
    expect(fetch).not.toHaveBeenCalled();
    onTokenExpired(null);
  });

  it('throws SheetsApiError on non-retryable HTTP error', async () => {
    global.fetch = mockFetchStatus(403, { error: { message: 'Permission denied' } });
    await expect(readRange('Budget_Categories!A:H')).rejects.toThrow(SheetsApiError);
  });

  it('retries 3 times on 429 then throws SheetsApiError', async () => {
    vi.useFakeTimers();
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({}),
    });

    const promise = readRange('Budget_Categories!A:H');
    // Attach rejection handler BEFORE advancing timers to avoid unhandled rejection warning
    const assertion = expect(promise).rejects.toThrow(SheetsApiError);
    await vi.runAllTimersAsync();
    await assertion;
    // 1 initial + 3 retries = 4 calls total
    expect(fetch).toHaveBeenCalledTimes(4);
    vi.useRealTimers();
  });

  it('recovers after 429 if subsequent attempt succeeds', async () => {
    vi.useFakeTimers();
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 429, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ values: [['ok']] }) });

    const promise = readRange('Budget_Categories!A:H');
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result).toEqual([['ok']]);
    expect(fetch).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('sends Authorization header with access token', async () => {
    global.fetch = mockFetchOk({ values: [] });
    await readRange('Budget_Categories!A:H');
    const [, opts] = fetch.mock.calls[0];
    expect(opts.headers['Authorization']).toBe('Bearer fake-token');
  });
});

// ─── batchGet ─────────────────────────────────────────────────────────────────

describe('batchGet', () => {
  beforeEach(() => {
    vi.stubGlobal('navigator', { onLine: true });
    getAccessToken.mockReturnValue('fake-token');
  });

  afterEach(() => { vi.restoreAllMocks(); });

  it('returns array of value grids in order', async () => {
    global.fetch = mockFetchOk({
      valueRanges: [
        { values: [['A']] },
        { values: [['B'], ['C']] },
      ],
    });
    const [r1, r2] = await batchGet(['Sheet1!A:A', 'Sheet2!A:B']);
    expect(r1).toEqual([['A']]);
    expect(r2).toEqual([['B'], ['C']]);
  });

  it('returns [] when response has no valueRanges key', async () => {
    global.fetch = mockFetchOk({});
    const result = await batchGet(['Sheet1!A:A']);
    // No valueRanges in response → empty array, not [[]]
    expect(result).toEqual([]);
  });
});

// ─── appendRow ────────────────────────────────────────────────────────────────

describe('appendRow', () => {
  beforeEach(() => {
    vi.stubGlobal('navigator', { onLine: true });
    getAccessToken.mockReturnValue('fake-token');
  });

  afterEach(() => { vi.restoreAllMocks(); });

  it('calls correct URL with POST and values wrapped in array', async () => {
    global.fetch = mockFetchOk({ updates: {} });
    await appendRow('Transactions!A:M', ['id1', '2026-06-21', 'val']);
    const [url, opts] = fetch.mock.calls[0];
    expect(url).toContain(':append');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body).values).toEqual([['id1', '2026-06-21', 'val']]);
  });
});

// ─── updateRow ────────────────────────────────────────────────────────────────

describe('updateRow', () => {
  beforeEach(() => {
    vi.stubGlobal('navigator', { onLine: true });
    getAccessToken.mockReturnValue('fake-token');
  });

  afterEach(() => { vi.restoreAllMocks(); });

  it('calls PUT with correct range and values', async () => {
    global.fetch = mockFetchOk({});
    await updateRow('Transactions!A5:M5', ['id1', 'updated']);
    const [url, opts] = fetch.mock.calls[0];
    expect(url).toContain(encodeURIComponent('Transactions!A5:M5'));
    expect(opts.method).toBe('PUT');
    expect(JSON.parse(opts.body).values).toEqual([['id1', 'updated']]);
  });
});

// ─── updateCell ───────────────────────────────────────────────────────────────

describe('updateCell', () => {
  beforeEach(() => {
    vi.stubGlobal('navigator', { onLine: true });
    getAccessToken.mockReturnValue('fake-token');
  });

  afterEach(() => { vi.restoreAllMocks(); });

  it('wraps single value in nested array', async () => {
    global.fetch = mockFetchOk({});
    await updateCell('Budget_Categories!C3', 9000);
    const [, opts] = fetch.mock.calls[0];
    expect(JSON.parse(opts.body).values).toEqual([[9000]]);
  });
});

// ─── isUserAllowed ────────────────────────────────────────────────────────────

describe('isUserAllowed', () => {
  beforeEach(() => {
    vi.stubGlobal('navigator', { onLine: true });
    getAccessToken.mockReturnValue('fake-token');
  });

  afterEach(() => { vi.restoreAllMocks(); });

  it('returns true when email is in allowed_users', async () => {
    global.fetch = mockFetchOk({
      values: [
        ['allowed_users', 'prashant@gmail.com, toshi@gmail.com'],
        ['currency', 'INR'],
      ],
    });
    expect(await isUserAllowed('Prashant@Gmail.com')).toBe(true);
  });

  it('returns false when email is not in allowed_users', async () => {
    global.fetch = mockFetchOk({
      values: [['allowed_users', 'prashant@gmail.com']],
    });
    expect(await isUserAllowed('stranger@evil.com')).toBe(false);
  });

  it('returns false when allowed_users row missing', async () => {
    global.fetch = mockFetchOk({ values: [['currency', 'INR']] });
    expect(await isUserAllowed('anyone@test.com')).toBe(false);
  });
});

// ─── getAuthorizedUsers ───────────────────────────────────────────────────────

describe('getAuthorizedUsers', () => {
  beforeEach(() => {
    vi.stubGlobal('navigator', { onLine: true });
    getAccessToken.mockReturnValue('fake-token');
  });

  it('returns array of emails from allowed_users row', async () => {
    global.fetch = mockFetchOk({ values: [['allowed_users', 'a@x.com, b@x.com']] });
    expect(await getAuthorizedUsers()).toEqual(['a@x.com', 'b@x.com']);
  });

  it('returns empty array when allowed_users value is empty string', async () => {
    global.fetch = mockFetchOk({ values: [['allowed_users', '']] });
    expect(await getAuthorizedUsers()).toEqual([]);
  });

  it('returns empty array when allowed_users row not found', async () => {
    global.fetch = mockFetchOk({ values: [['currency', 'INR']] });
    expect(await getAuthorizedUsers()).toEqual([]);
  });

  it('trims whitespace from each email', async () => {
    global.fetch = mockFetchOk({ values: [['allowed_users', '  a@x.com ,  b@x.com  ']] });
    expect(await getAuthorizedUsers()).toEqual(['a@x.com', 'b@x.com']);
  });
});

// ─── addAuthorizedUser ────────────────────────────────────────────────────────

describe('addAuthorizedUser', () => {
  beforeEach(() => {
    vi.stubGlobal('navigator', { onLine: true });
    getAccessToken.mockReturnValue('fake-token');
  });

  it('appends email to existing list and calls updateCell', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockFetchOk({ values: [['allowed_users', 'admin@x.com']] })())
      .mockResolvedValueOnce(mockFetchOk({})());

    await addAuthorizedUser('new@x.com');

    const patchCall = global.fetch.mock.calls[1];
    expect(patchCall[0]).toContain('App_Config!B2');
    const body = JSON.parse(patchCall[1].body);
    expect(body.values[0][0]).toBe('admin@x.com, new@x.com');
  });

  it('does not call updateCell when email already in list (case-insensitive)', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockFetchOk({ values: [['allowed_users', 'Admin@X.com']] })());

    await addAuthorizedUser('admin@x.com');

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('sets email as sole value when allowed_users was empty', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockFetchOk({ values: [['allowed_users', '']] })())
      .mockResolvedValueOnce(mockFetchOk({})());

    await addAuthorizedUser('first@x.com');

    const patchCall = global.fetch.mock.calls[1];
    const body = JSON.parse(patchCall[1].body);
    expect(body.values[0][0]).toBe('first@x.com');
  });
});

// ─── removeAuthorizedUser ─────────────────────────────────────────────────────

describe('removeAuthorizedUser', () => {
  beforeEach(() => {
    vi.stubGlobal('navigator', { onLine: true });
    getAccessToken.mockReturnValue('fake-token');
  });

  it('removes email from list and calls updateCell', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockFetchOk({ values: [['allowed_users', 'a@x.com, b@x.com']] })())
      .mockResolvedValueOnce(mockFetchOk({})());

    await removeAuthorizedUser('a@x.com');

    const patchCall = global.fetch.mock.calls[1];
    const body = JSON.parse(patchCall[1].body);
    expect(body.values[0][0]).toBe('b@x.com');
  });

  it('is case-insensitive when matching email to remove', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockFetchOk({ values: [['allowed_users', 'Admin@X.com, other@x.com']] })())
      .mockResolvedValueOnce(mockFetchOk({})());

    await removeAuthorizedUser('admin@x.com');

    const patchCall = global.fetch.mock.calls[1];
    const body = JSON.parse(patchCall[1].body);
    expect(body.values[0][0]).toBe('other@x.com');
  });
});
