/**
 * Helpers.gs — BudgetPulse
 * Shared utilities: logging, date formatting, ID generation, sheet helpers.
 * No side effects on SpreadsheetApp except getOrCreateSheet.
 */

// ─── Logging ─────────────────────────────────────────────────────────────────

/**
 * Logs a message with timestamp and severity prefix.
 * Wraps Logger.log so tests can stub it.
 *
 * @param {string} level  'INFO' | 'WARN' | 'ERROR'
 * @param {string} msg
 */
function log(level, msg) {
  Logger.log('[' + level + '] [' + formatTimestamp(new Date()) + '] ' + msg);
}

function logInfo(msg)  { log('INFO',  msg); }
function logWarn(msg)  { log('WARN',  msg); }
function logError(msg) { log('ERROR', msg); }

// ─── Date Utilities ───────────────────────────────────────────────────────────

/**
 * Returns 'yyyy-MM' string for a given Date (or today if omitted).
 *
 * @param {Date} [date]
 * @returns {string}
 */
function toYearMonth(date) {
  var d = date || new Date();
  var y = d.getFullYear();
  var m = String(d.getMonth() + 1).padStart(2, '0');
  return y + '-' + m;
}

/**
 * Returns 'yyyy-MM-dd' string for a given Date.
 *
 * @param {Date} [date]
 * @returns {string}
 */
function toDateString(date) {
  var d = date || new Date();
  var y = d.getFullYear();
  var m = String(d.getMonth() + 1).padStart(2, '0');
  var day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

/**
 * Returns ISO 8601 timestamp string (local time, no timezone suffix).
 *
 * @param {Date} [date]
 * @returns {string}
 */
function formatTimestamp(date) {
  var d = date || new Date();
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0') + 'T' +
    String(d.getHours()).padStart(2, '0') + ':' +
    String(d.getMinutes()).padStart(2, '0') + ':' +
    String(d.getSeconds()).padStart(2, '0');
}

/**
 * Returns the current month's first day as a Date.
 *
 * @returns {Date}
 */
function startOfMonth() {
  var now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

/**
 * Returns Date parsed from 'yyyy-MM' string.
 *
 * @param {string} yearMonth  e.g. '2026-06'
 * @returns {Date}
 */
function parseYearMonth(yearMonth) {
  var parts = yearMonth.split('-');
  return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, 1);
}

// ─── ID Generation ────────────────────────────────────────────────────────────

/**
 * Generates a short unique ID with an optional prefix.
 * Format: <prefix>_<timestamp36><random4>
 * Collision probability negligible for this use case.
 *
 * @param {string} [prefix]  e.g. 'cat', 'txn', 'pat'
 * @returns {string}
 */
function generateId(prefix) {
  var ts = Date.now().toString(36);
  var rand = Math.random().toString(36).slice(2, 6);
  var id = ts + rand;
  return prefix ? prefix + '_' + id : id;
}

// ─── Sheet Helpers ────────────────────────────────────────────────────────────

/**
 * Returns the named sheet, creating it if it doesn't exist.
 *
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss
 * @param {string} name
 * @returns {GoogleAppsScript.Spreadsheet.Sheet}
 */
function getOrCreateSheet(ss, name) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    logInfo('Created sheet: ' + name);
  }
  return sheet;
}

/**
 * Returns all data rows from a sheet as a 2D array (excludes header row).
 * Returns [] if sheet is empty or has only a header.
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @returns {Array[]}
 */
function getDataRows(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var lastCol = sheet.getLastColumn();
  if (lastCol < 1) return [];
  return sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
}

/**
 * Finds the row index (1-based) in a sheet where column colIdx equals value.
 * Returns -1 if not found.
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {number} colIdx  1-based column index to search
 * @param {*} value
 * @returns {number}
 */
function findRowByValue(sheet, colIdx, value) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  var col = sheet.getRange(2, colIdx, lastRow - 1, 1).getValues();
  for (var i = 0; i < col.length; i++) {
    if (String(col[i][0]).trim() === String(value).trim()) {
      return i + 2; // +2: 1-based + skipped header row
    }
  }
  return -1;
}

/**
 * Reads a specific row by 1-based row index and returns values as array.
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {number} rowIdx  1-based
 * @returns {Array}
 */
function getRow(sheet, rowIdx) {
  var lastCol = sheet.getLastColumn();
  if (lastCol < 1) return [];
  return sheet.getRange(rowIdx, 1, 1, lastCol).getValues()[0];
}

/**
 * Builds an index (plain object) of sheet rows keyed by a column value.
 * Useful for O(1) lookups when processing many rows.
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {number} keyColIdx  1-based column index to use as key
 * @returns {Object.<string, {rowIdx: number, values: Array}>}
 */
function buildRowIndex(sheet, keyColIdx) {
  var rows = getDataRows(sheet);
  var index = {};
  for (var i = 0; i < rows.length; i++) {
    var key = String(rows[i][keyColIdx - 1]).trim();
    if (key) {
      index[key] = { rowIdx: i + 2, values: rows[i] }; // +2: 1-based + header
    }
  }
  return index;
}

// ─── INR Formatting ──────────────────────────────────────────────────────────

/**
 * Formats a number as INR string for use in email templates.
 * e.g. 8000 → '₹8,000'
 *
 * @param {number} amount
 * @returns {string}
 */
function formatINR(amount) {
  var n = Number(amount) || 0;
  return '₹' + n.toLocaleString('en-IN');
}

// ─── Percentage ───────────────────────────────────────────────────────────────

/**
 * Returns budget utilization percentage. Returns 0 if budget is 0.
 *
 * @param {number} spent
 * @param {number} budget
 * @returns {number}
 */
function utilizationPercent(spent, budget) {
  if (!budget || budget === 0) return 0;
  return (spent / budget) * 100;
}

/**
 * Returns health label based on utilization percentage.
 * Matches FR-3.2: green < 60%, amber 60-80%, red > 80%, critical > 100%.
 *
 * @param {number} pct
 * @returns {'GREEN'|'AMBER'|'RED'|'CRITICAL'}
 */
function budgetHealthLabel(pct) {
  if (pct >= 100) return 'CRITICAL';
  if (pct >= 80)  return 'RED';
  if (pct >= 60)  return 'AMBER';
  return 'GREEN';
}
