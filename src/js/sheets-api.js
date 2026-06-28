/**
 * src/js/sheets-api.js — BudgetPulse
 * Google Sheets API v4 wrapper.
 *
 * Responsibilities:
 *   - All HTTP calls to Sheets API (read, append, update, batchGet, delete)
 *   - 429 exponential backoff (3 retries: 1s → 2s → 4s)
 *   - 401 fires onTokenExpired callback so auth.js can re-prompt
 *   - Offline detection before every request
 *
 * Does NOT own auth state — calls getAccessToken() from auth.js.
 * Does NOT own caching — callers pass through cache.js.
 */

import { getAccessToken } from './auth.js';

// ─── Configuration ────────────────────────────────────────────────────────────

// The ID is now dynamic and set by setup.js upon auto-creation.
export function getSpreadsheetId() {
  return localStorage.getItem('bp_spreadsheet_id');
}

export function setSpreadsheetId(id) {
  localStorage.setItem('bp_spreadsheet_id', id);
}

function getBaseUrl() {
  const id = getSpreadsheetId();
  if (!id) throw new Error("Spreadsheet ID not set. Bootstrap required.");
  return `https://sheets.googleapis.com/v4/spreadsheets/${id}`;
}

const RETRY_DELAYS_MS = [1000, 2000, 4000];

// ─── Error Types ──────────────────────────────────────────────────────────────

export class SheetsApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'SheetsApiError';
    this.status = status;
  }
}

export class OfflineError extends Error {
  constructor() {
    super('Device is offline');
    this.name = 'OfflineError';
  }
}

export class AuthError extends Error {
  constructor() {
    super('Access token expired or missing');
    this.name = 'AuthError';
  }
}

export class ScopeError extends Error {
  constructor() {
    super('OAuth token has insufficient scopes — re-consent required');
    this.name = 'ScopeError';
  }
}

// ─── Re-auth Hooks ────────────────────────────────────────────────────────────

let _onTokenExpired = null;
let _onScopeInsufficient = null;

export function onTokenExpired(cb) {
  _onTokenExpired = cb;
}

export function onScopeInsufficient(cb) {
  _onScopeInsufficient = cb;
}

// ─── Core Fetch ──────────────────────────────────────────────────────────────

/**
 * Executes a Sheets API request with retry on 429 and 401 detection.
 * Throws OfflineError, AuthError, or SheetsApiError on failure.
 *
 * @param {string} url
 * @param {RequestInit} options
 * @returns {Promise<any>}  parsed JSON response body
 */
async function _request(url, options = {}) {
  if (!navigator.onLine) throw new OfflineError();

  const token = getAccessToken();
  if (!token) {
    if (_onTokenExpired) _onTokenExpired();
    throw new AuthError();
  }

  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  let lastError;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      const response = await fetch(url, { ...options, headers });

      if (response.status === 401) {
        if (_onTokenExpired) _onTokenExpired();
        throw new AuthError();
      }

      if (response.status === 429) {
        if (attempt < RETRY_DELAYS_MS.length) {
          await _sleep(RETRY_DELAYS_MS[attempt]);
          continue;
        }
        throw new SheetsApiError('Rate limit exceeded after retries', 429);
      }

      if (response.status === 403) {
        const body = await response.json().catch(() => ({}));
        const reason = body?.error?.details?.[0]?.reason;
        if (reason === 'ACCESS_TOKEN_SCOPE_INSUFFICIENT') {
          if (_onScopeInsufficient) _onScopeInsufficient();
          throw new ScopeError();
        }
        const msg = body?.error?.message || 'HTTP 403 Forbidden';
        throw new SheetsApiError(msg, 403);
      }

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        const msg = body?.error?.message || `HTTP ${response.status}`;
        throw new SheetsApiError(msg, response.status);
      }

      // 204 No Content (e.g. some batchUpdate ops)
      if (response.status === 204) return null;

      return await response.json();

    } catch (e) {
      // Don't retry AuthError, OfflineError, ScopeError, or SheetsApiError
      if (e instanceof AuthError || e instanceof OfflineError || e instanceof ScopeError || e instanceof SheetsApiError) {
        throw e;
      }
      // Network failure — retry
      lastError = e;
      if (attempt < RETRY_DELAYS_MS.length) {
        await _sleep(RETRY_DELAYS_MS[attempt]);
      }
    }
  }

  throw lastError || new SheetsApiError('Request failed after retries', 0);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Reads a range from the spreadsheet.
 * Returns a 2D array of values, or [] if the range is empty.
 *
 * @param {string} range  A1 notation, e.g. 'Budget_Categories!A:H'
 * @returns {Promise<Array[]>}
 */
export async function readRange(range) {
  const url = `${getBaseUrl()}/values/${encodeURIComponent(range)}`;
  const data = await _request(url, { method: 'GET' });
  return data?.values ?? [];
}

/**
 * Reads a range from a specific spreadsheet ID.
 *
 * @param {string} spreadsheetId
 * @param {string} range
 * @returns {Promise<Array[]>}
 */
export async function readRangeFromSpreadsheet(spreadsheetId, range) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`;
  const data = await _request(url, { method: 'GET' });
  return data?.values ?? [];
}

/**
 * Reads multiple ranges in a single request (reduces quota usage).
 * Returns an array of 2D value arrays, one per range, in the same order.
 *
 * @param {string[]} ranges  Array of A1 notation ranges
 * @returns {Promise<Array[][]>}
 */
export async function batchGet(ranges) {
  const params = ranges.map(r => `ranges=${encodeURIComponent(r)}`).join('&');
  const url = `${getBaseUrl()}/values:batchGet?${params}`;
  const data = await _request(url, { method: 'GET' });
  return (data?.valueRanges ?? []).map(vr => vr.values ?? []);
}

/**
 * Appends a row to the sheet (inserts after the last row of data in the range).
 *
 * @param {string} range   A1 notation for the target sheet, e.g. 'Transactions!A:M'
 * @param {Array}  values  Single row of values
 * @returns {Promise<void>}
 */
export async function appendRow(range, values) {
  const url = `${getBaseUrl()}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  await _request(url, {
    method: 'POST',
    body: JSON.stringify({ values: [values] }),
  });
}

/**
 * Overwrites an exact range with new values.
 * Use this to update a specific row (pass the exact row range, e.g. 'Transactions!A5:M5').
 *
 * @param {string} range   Exact A1 range to overwrite
 * @param {Array}  values  Single row of values
 * @returns {Promise<void>}
 */
export async function updateRow(range, values) {
  const url = `${getBaseUrl()}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;
  await _request(url, {
    method: 'PUT',
    body: JSON.stringify({ values: [values] }),
  });
}

/**
 * Updates a single cell value.
 *
 * @param {string} range   Single-cell A1 notation, e.g. 'Budget_Categories!C3'
 * @param {*}      value
 * @returns {Promise<void>}
 */
export async function updateCell(range, value) {
  return updateRow(range, [value]);
}

/**
 * Deletes a row by its 1-based index using the batchUpdate deleteDimension API.
 *
 * @param {string} sheetName  e.g. 'Transactions'
 * @param {number} sheetId    The numeric sheet ID (from Sheets metadata, not the tab index)
 * @param {number} rowIndex   1-based row index to delete (header = 1, first data row = 2)
 * @returns {Promise<void>}
 */
export async function deleteRow(sheetName, sheetId, rowIndex) {
  const url = `${getBaseUrl()}:batchUpdate`;
  await _request(url, {
    method: 'POST',
    body: JSON.stringify({
      requests: [{
        deleteDimension: {
          range: {
            sheetId,
            dimension: 'ROWS',
            startIndex: rowIndex - 1, // API is 0-based
            endIndex:   rowIndex,
          },
        },
      }],
    }),
  });
}

/**
 * Fetches spreadsheet metadata (sheet names, IDs, etc.).
 * Useful for resolving sheetId by name before calling deleteRow.
 *
 * @returns {Promise<{ sheets: Array<{ properties: { sheetId: number, title: string } }> }>}
 */
export async function getSpreadsheetMetadata() {
  const url = `${getBaseUrl()}?fields=sheets.properties(sheetId,title)`;
  return _request(url, { method: 'GET' });
}

/**
 * Resolves a sheet tab name to its numeric sheetId.
 * Caches result in memory to avoid repeated metadata calls.
 *
 * @param {string} tabName  e.g. 'Transactions'
 * @returns {Promise<number>}
 */
const _sheetIdCache = {};
export async function resolveSheetId(tabName) {
  if (_sheetIdCache[tabName] !== undefined) return _sheetIdCache[tabName];
  const meta = await getSpreadsheetMetadata();
  for (const sheet of (meta?.sheets ?? [])) {
    _sheetIdCache[sheet.properties.title] = sheet.properties.sheetId;
  }
  if (_sheetIdCache[tabName] === undefined) {
    throw new SheetsApiError(`Sheet tab not found: ${tabName}`, 404);
  }
  return _sheetIdCache[tabName];
}

// ─── Allowed-Users Authorization Check ───────────────────────────────────────

/**
 * Reads the App_Config sheet and checks if the given email is in allowed_users.
 * Called by auth flow after successful OAuth to gate app access.
 *
 * @param {string} userEmail
 * @returns {Promise<boolean>}
 */
export async function isUserAllowed(userEmail) {
  const rows = await readRange('App_Config!A:B');
  for (const row of rows) {
    if (String(row[0]).trim() === 'allowed_users') {
      const allowed = String(row[1]).split(',').map(e => e.trim().toLowerCase());
      return allowed.includes(userEmail.toLowerCase().trim());
    }
  }
  return false;
}

// ─── Authorized-User Management ──────────────────────────────────────────────

export async function getAuthorizedUsers() {
  const rows = await readRange('App_Config!A:B');
  for (const row of rows) {
    if (String(row[0]).trim() === 'allowed_users') {
      return String(row[1] ?? '')
        .split(',')
        .map(e => e.trim())
        .filter(Boolean);
    }
  }
  return [];
}

export async function addAuthorizedUser(email) {
  const rows = await readRange('App_Config!A:B');
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === 'allowed_users') {
      const current = String(rows[i][1] ?? '')
        .split(',')
        .map(e => e.trim())
        .filter(Boolean);
      const norm = email.trim().toLowerCase();
      if (current.map(e => e.toLowerCase()).includes(norm)) return;
      const updated = [...current, email.trim()].join(', ');
      await updateCell(`App_Config!B${i + 1}`, updated);
      return;
    }
  }
}

export async function removeAuthorizedUser(email) {
  const rows = await readRange('App_Config!A:B');
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === 'allowed_users') {
      const norm = email.trim().toLowerCase();
      const current = String(rows[i][1] ?? '')
        .split(',')
        .map(e => e.trim())
        .filter(Boolean);
      const updated = current.filter(e => e.toLowerCase() !== norm).join(', ');
      await updateCell(`App_Config!B${i + 1}`, updated);
      return;
    }
  }
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function _sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
