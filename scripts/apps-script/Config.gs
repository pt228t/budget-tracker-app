/**
 * Config.gs — BudgetPulse
 * All sheet names, column indices, and App_Config reader.
 * No business logic here — constants only.
 */

// ─── Sheet Names ────────────────────────────────────────────────────────────

var SHEET = {
  BUDGET_CATEGORIES: 'Budget_Categories',
  SUB_CATEGORIES:    'Sub_Categories',
  TRANSACTIONS:      'Transactions',
  BUDGET_HISTORY:    'Budget_History',
  VENDOR_PATTERNS:   'Vendor_Patterns',
  APP_CONFIG:        'App_Config',
  NOTIFICATION_LOG:  'Notification_Log',
};

// ─── Column Indices (1-based, matching Sheets API) ──────────────────────────

var COL = {
  BUDGET_CATEGORIES: {
    CATEGORY_ID:      1,
    CATEGORY_NAME:    2,
    MONTHLY_BUDGET:   3,
    SOURCE:           4,
    SOURCE_ITEM_NAME: 5,
    ACTIVE_STATUS:    6,
    CREATED_MONTH:    7,
    NOTES:            8,
  },

  SUB_CATEGORIES: {
    SUB_CATEGORY_ID:   1,
    CATEGORY_ID:       2,
    SUB_CATEGORY_NAME: 3,
    CREATED_BY:        4,
    CREATED_DATE:      5,
  },

  TRANSACTIONS: {
    TRANSACTION_ID: 1,
    DATE:           2,
    MONTH:          3,
    AMOUNT:         4,
    CATEGORY_ID:    5,
    SUB_CATEGORY:   6,
    DESCRIPTION:    7,
    PAID_BY:        8,
    FUNDING_SOURCE: 9,
    LOGGED_BY:      10,
    LOGGED_AT:      11,
    MODIFIED_AT:    12,
    NOTES:          13,
  },

  BUDGET_HISTORY: {
    MONTH:         1,
    CATEGORY_ID:   2,
    BUDGET_AMOUNT: 3,
    SOURCE:        4,
    SYNCED_AT:     5,
  },

  VENDOR_PATTERNS: {
    PATTERN_ID:            1,
    VENDOR_KEYWORD:        2,
    SUGGESTED_CATEGORY_ID: 3,
    USAGE_COUNT:           4,
    LAST_USED:             5,
  },

  APP_CONFIG: {
    KEY:   1,
    VALUE: 2,
  },

  NOTIFICATION_LOG: {
    NOTIFICATION_ID: 1,
    TYPE:            2,
    SENT_TO:         3,
    SENT_AT:         4,
    MONTH:           5,
    CATEGORY_ID:     6,
    DETAILS:         7,
  },
};

// ─── Enum Values ─────────────────────────────────────────────────────────────

var ACTIVE_STATUS = {
  ACTIVE:   'Active',
  PAUSED:   'Paused',
  ARCHIVED: 'Archived',
};

var SOURCE = {
  SYNCED: 'synced',
  MANUAL: 'manual',
};

var FUNDING_SOURCE = {
  JOINT:    'Joint',
  PERSONAL: 'Personal',
};

var NOTIFICATION_TYPE = {
  WEEKLY_SUMMARY:    'weekly_summary',
  BUDGET_ALERT:      'budget_alert',
  MONTHLY_REPORT:    'monthly_report',
  NO_LOG_REMINDER:   'no_log_reminder',
  BILL_REMINDER:     'bill_reminder',
};

// ─── App_Config Keys ─────────────────────────────────────────────────────────

var CONFIG_KEY = {
  SOURCE_SPREADSHEET_ID:       'source_spreadsheet_id',
  SOURCE_RECURRING_ITEMS_TAB:  'source_recurring_items_tab',
  ALERT_THRESHOLD_PERCENT:     'alert_threshold_percent',
  WEEKLY_REPORT_DAY:           'weekly_report_day',
  WEEKLY_REPORT_TIME:          'weekly_report_time',
  MONTHLY_REPORT_DAY:          'monthly_report_day',
  NO_LOG_REMINDER_HOURS:       'no_log_reminder_hours',
  CURRENCY:                    'currency',
  ALLOWED_USERS:               'allowed_users',
};

// ─── Config Reader ────────────────────────────────────────────────────────────

/**
 * Reads all key-value pairs from App_Config tab into a plain object.
 * Returns {} on missing sheet or empty data.
 *
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss
 * @returns {Object.<string, string>}
 */
function getAppConfig(ss) {
  var sheet = ss.getSheetByName(SHEET.APP_CONFIG);
  if (!sheet) return {};

  var lastRow = sheet.getLastRow();
  if (lastRow < 1) return {};

  var data = sheet.getRange(1, 1, lastRow, 2).getValues();
  var config = {};
  for (var i = 0; i < data.length; i++) {
    var key = String(data[i][0]).trim();
    var value = String(data[i][1]).trim();
    if (key) config[key] = value;
  }
  return config;
}

/**
 * Returns a single config value by key. Falls back to defaultValue.
 *
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss
 * @param {string} key
 * @param {string} [defaultValue='']
 * @returns {string}
 */
function getConfigValue(ss, key, defaultValue) {
  var config = getAppConfig(ss);
  return config.hasOwnProperty(key) ? config[key] : (defaultValue || '');
}

/**
 * Returns allowed user emails as an array.
 *
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss
 * @returns {string[]}
 */
function getAllowedUsers(ss) {
  var value = getConfigValue(ss, CONFIG_KEY.ALLOWED_USERS, '');
  if (!value) return [];
  return value.split(',').map(function(e) { return e.trim().toLowerCase(); }).filter(Boolean);
}

// ─── CI-injected constants ─────────────────────────────────────────────────────
// JOINT_SPEND_SPREADSHEET_ID is replaced at deploy time by deploy-apps-script.mjs
// using the JOINT_SPEND_SHEET_ID GitHub Secret. Do not hardcode a real ID here.
var JOINT_SPEND_SPREADSHEET_ID = 'JOINT_SPEND_ID_PLACEHOLDER';
