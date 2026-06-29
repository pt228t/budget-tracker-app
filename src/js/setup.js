/**
 * src/js/setup.js — BudgetPulse
 * Spreadsheet bootstrap module.
 *
 * Runs on app init (after auth). Verifies the BudgetPulse spreadsheet
 * has all required tabs with correct headers. Creates any missing tabs
 * and populates default data (App_Config defaults).
 *
 * Flow:
 *   1. Fetch spreadsheet metadata (tab list)
 *   2. Diff against required schema
 *   3. Create missing tabs via Sheets API batchUpdate
 *   4. Write headers + default rows for newly created tabs
 *   5. Return a status report to the caller
 */

import { getAccessToken } from './auth.js';
import { getSpreadsheetId, setSpreadsheetId, appendRow, readRange, updateCell, ScopeError } from './sheets-api.js';

// ─── Schema Definition ───────────────────────────────────────────────────────

const SCHEMA = {
  Budget_Categories: {
    headers: [
      'category_id', 'category_name', 'monthly_budget', 'source',
      'source_item_name', 'active_status', 'created_month', 'notes'
    ],
    defaults: []
  },
  Sub_Categories: {
    headers: [
      'sub_category_id', 'category_id', 'sub_category_name',
      'created_by', 'created_date'
    ],
    defaults: []
  },
  Transactions: {
    headers: [
      'transaction_id', 'date', 'month', 'amount', 'category_id',
      'sub_category', 'description', 'paid_by', 'funding_source',
      'logged_by', 'logged_at', 'modified_at', 'notes'
    ],
    defaults: []
  },
  Budget_History: {
    headers: [
      'month', 'category_id', 'budget_amount', 'source', 'synced_at'
    ],
    defaults: []
  },
  Vendor_Patterns: {
    headers: [
      'pattern_id', 'vendor_keyword', 'suggested_category_id',
      'usage_count', 'last_used'
    ],
    defaults: []
  },
  App_Config: {
    headers: ['key', 'value'],
    defaults: [
      ['source_spreadsheet_id', ''],
      ['source_recurring_items_tab', 'Recurring_Items'],
      ['alert_threshold_percent', '80'],
      ['weekly_report_day', 'Sunday'],
      ['weekly_report_time', '09:00'],
      ['monthly_report_day', '1'],
      ['no_log_reminder_hours', '48'],
      ['currency', 'INR'],
      ['allowed_users', '']
    ]
  },
  Notification_Log: {
    headers: [
      'notification_id', 'type', 'sent_to', 'sent_at',
      'month', 'category_id', 'details'
    ],
    defaults: []
  }
};

const REQUIRED_TABS = Object.keys(SCHEMA);

// ─── Core Bootstrap ──────────────────────────────────────────────────────────

/**
 * Run the full bootstrap check.
 * Returns { ready: boolean, created: string[], existing: string[], errors: string[] }
 * @param {string} userEmail - The email of the user bootstrapping the app (used for allowed_users)
 */
export async function bootstrapSpreadsheet(userEmail = '') {
  const report = { ready: false, created: [], existing: [], errors: [] };

  try {
    // 1. Prefer explicit spreadsheet configuration over per-browser cache
    const preferredSheet = getPreferredSpreadsheet();
    let spreadsheetId = preferredSheet.id;

    if (spreadsheetId) {
      console.log(`[Setup] Using ${preferredSheet.source} spreadsheet ID: ${spreadsheetId}`);
      if (preferredSheet.persist) {
        setSpreadsheetId(spreadsheetId);
      }
    }

    if (!spreadsheetId) {
      console.log('[Setup] No spreadsheet ID in localStorage. Searching Drive for existing BudgetPulse sheet...');
      spreadsheetId = await findExistingWorkbook();
      if (spreadsheetId) {
        console.log(`[Setup] Found existing BudgetPulse sheet: ${spreadsheetId}`);
        setSpreadsheetId(spreadsheetId);
      } else {
        console.log('[Setup] No existing sheet found. Creating new BudgetPulse workbook...');
        spreadsheetId = await createNewWorkbook();
        setSpreadsheetId(spreadsheetId);
        console.log(`[Setup] Workbook created with ID: ${spreadsheetId}`);
      }
    }

    // 2. Fetch current tabs from the spreadsheet
    const existingTabs = await getExistingTabs(spreadsheetId);

    // 2. Determine which tabs are missing
    const missingTabs = REQUIRED_TABS.filter(tab => !existingTabs.includes(tab));
    report.existing = REQUIRED_TABS.filter(tab => existingTabs.includes(tab));

    if (missingTabs.length === 0) {
      console.log('[Setup] All required tabs already exist. Spreadsheet is ready.');
      try {
        await ensureUserAuthorized(userEmail);
      } catch (err) {
        if (err instanceof ScopeError) throw err;
        console.warn('[Setup] ensureUserAuthorized failed (non-fatal):', err);
      }
      report.ready = true;
      return report;
    }

    console.log(`[Setup] Missing tabs: ${missingTabs.join(', ')}. Bootstrapping...`);

    // 4. Create missing tabs via batchUpdate
    await createTabs(spreadsheetId, missingTabs);

    // 5. Write headers and defaults for each new tab
    for (const tabName of missingTabs) {
      try {
        await writeHeaders(tabName, SCHEMA[tabName].headers);

        if (SCHEMA[tabName].defaults.length > 0) {
          // If initializing App_Config, inject the creator's email into allowed_users
          const defaults = SCHEMA[tabName].defaults.map(row => {
            if (tabName === 'App_Config' && row[0] === 'allowed_users') {
              return [row[0], userEmail];
            }
            return row;
          });
          await writeDefaults(tabName, defaults);
        }

        report.created.push(tabName);
      } catch (err) {
        console.error(`[Setup] Failed to initialize tab "${tabName}":`, err);
        report.errors.push(`${tabName}: ${err.message}`);
      }
    }

    report.ready = report.errors.length === 0;
    console.log('[Setup] Bootstrap complete.', report);
    return report;

  } catch (err) {
    if (err instanceof ScopeError) throw err;
    console.error('[Setup] Bootstrap failed:', err);
    report.errors.push(err.message);
    return report;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function throwIfScopeError(response) {
  if (response.status === 403) {
    const body = await response.json().catch(() => ({}));
    const reason = body?.error?.details?.[0]?.reason;
    const errorsReason = body?.error?.errors?.[0]?.reason;
    const message = body?.error?.message || '';
    if (
      reason === 'ACCESS_TOKEN_SCOPE_INSUFFICIENT' ||
      errorsReason === 'insufficientPermissions' ||
      message.includes('insufficient authentication scopes')
    ) {
      throw new ScopeError();
    }
  }
}

function getPreferredSpreadsheet() {
  const urlSpreadsheetId = getSpreadsheetIdFromUrl();
  if (urlSpreadsheetId) {
    return { id: urlSpreadsheetId, source: 'URL', persist: true };
  }

  const configuredSpreadsheetId = extractSpreadsheetId(import.meta.env.VITE_BUDGETPULSE_SHEET_ID);
  if (configuredSpreadsheetId) {
    return { id: configuredSpreadsheetId, source: 'configured', persist: true };
  }

  const cachedSpreadsheetId = getSpreadsheetId();
  if (cachedSpreadsheetId) {
    return { id: cachedSpreadsheetId, source: 'localStorage', persist: false };
  }

  return { id: null, source: 'none', persist: false };
}

function getSpreadsheetIdFromUrl() {
  if (typeof window === 'undefined' || !window.location?.search) {
    return null;
  }

  const params = new URLSearchParams(window.location.search);
  return (
    extractSpreadsheetId(params.get('spreadsheetId')) ||
    extractSpreadsheetId(params.get('sheetId'))
  );
}

function extractSpreadsheetId(value) {
  const cleanValue = value ? String(value).trim() : '';
  if (!cleanValue) return null;

  const match = cleanValue.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : cleanValue;
}

async function findExistingWorkbook() {
  const token = getAccessToken();
  const q = encodeURIComponent(
    "name='BudgetPulse' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false"
  );
  const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,createdTime)&orderBy=createdTime&pageSize=1`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!response.ok) {
    await throwIfScopeError(response);
    const body = await response.json().catch(() => ({}));
    const msg = body?.error?.message || `status ${response.status}`;
    throw new Error(`Drive search failed: ${msg}`);
  }

  const data = await response.json();
  return data.files && data.files.length > 0 ? data.files[0].id : null;
}

async function createNewWorkbook() {
  const token = getAccessToken();
  const url = `https://sheets.googleapis.com/v4/spreadsheets`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      properties: { title: 'BudgetPulse' }
    })
  });

  if (!response.ok) {
    await throwIfScopeError(response);
    throw new Error(`Failed to create workbook: ${response.status}`);
  }

  const data = await response.json();
  return data.spreadsheetId;
}

async function getExistingTabs(spreadsheetId) {
  const token = getAccessToken();
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!response.ok) {
    await throwIfScopeError(response);
    throw new Error(`Failed to fetch spreadsheet metadata: ${response.status}`);
  }

  const data = await response.json();
  return (data.sheets || []).map(s => s.properties.title);
}

async function createTabs(spreadsheetId, tabNames) {
  const token = getAccessToken();
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`;

  const requests = tabNames.map(title => ({
    addSheet: {
      properties: { title }
    }
  }));

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ requests })
  });

  if (!response.ok) {
    await throwIfScopeError(response);
    const errorBody = await response.text();
    throw new Error(`Failed to create tabs: ${response.status} — ${errorBody}`);
  }

  return response.json();
}

async function writeHeaders(tabName, headers) {
  const spreadsheetId = getSpreadsheetId();
  const token = getAccessToken();
  const range = `${tabName}!A1:${columnLetter(headers.length)}1`;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=RAW`;

  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      range,
      majorDimension: 'ROWS',
      values: [headers]
    })
  });

  if (!response.ok) {
    await throwIfScopeError(response);
    throw new Error(`Failed to write headers to ${tabName}: ${response.status}`);
  }
}

/**
 * Write default rows below the header.
 */
async function writeDefaults(tabName, rows) {
  for (const row of rows) {
    await appendRow(`${tabName}!A:B`, row);
  }
}

/**
 * Convert a 1-based column number to a letter (1=A, 2=B, ..., 26=Z, 27=AA).
 */
function columnLetter(num) {
  let letter = '';
  let n = num;
  while (n > 0) {
    n--;
    letter = String.fromCharCode(65 + (n % 26)) + letter;
    n = Math.floor(n / 26);
  }
  return letter;
}

/**
 * Check if the spreadsheet is fully bootstrapped (all tabs exist).
 * Lightweight check without creating anything.
 */
export async function isSpreadsheetReady() {
  const spreadsheetId = getSpreadsheetId();
  if (!spreadsheetId) return false;

  try {
    const existingTabs = await getExistingTabs(spreadsheetId);
    const missingTabs = REQUIRED_TABS.filter(tab => !existingTabs.includes(tab));
    return missingTabs.length === 0;
  } catch {
    return false;
  }
}

export { REQUIRED_TABS, SCHEMA };

// ─── Auth Helpers ─────────────────────────────────────────────────────────────

async function ensureUserAuthorized(userEmail) {
  if (!userEmail) return;
  console.log('[Setup] ensureUserAuthorized: checking', userEmail);
  const rows = await readRange('App_Config!A:B');
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === 'allowed_users') {
      const current = String(rows[i][1] ?? '')
        .split(',')
        .map(e => e.trim())
        .filter(Boolean);
      if (current.map(e => e.toLowerCase()).includes(userEmail.toLowerCase().trim())) {
        console.log('[Setup] ensureUserAuthorized: already in list, skipping');
        return;
      }
      const updated = [...current, userEmail.trim()].join(', ');
      console.log(`[Setup] ensureUserAuthorized: writing to App_Config!B${i + 1} →`, updated);
      await updateCell(`App_Config!B${i + 1}`, updated);
      console.log('[Setup] ensureUserAuthorized: done');
      return;
    }
  }
  console.warn('[Setup] ensureUserAuthorized: allowed_users row not found in App_Config');
}
