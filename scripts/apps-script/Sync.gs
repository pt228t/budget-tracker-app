/**
 * Sync.gs — BudgetPulse
 * Budget sync engine: reads Recurring_Items from joint-spend sheet,
 * upserts Budget_Categories, and records Budget_History.
 *
 * Entry points:
 *   syncBudgetCategories()     — called by daily Apps Script trigger
 *   syncBudgetCategoriesManual() — called from UI (returns result summary)
 */

// ─── Public Entry Points ──────────────────────────────────────────────────────

/**
 * Main sync entry point for the daily time-based trigger.
 * Logs results; does not return a value.
 */
function syncBudgetCategories() {
  try {
    var result = _runSync();
    logInfo('Sync complete. new=' + result.added + ' updated=' + result.updated + ' archived=' + result.archived + ' unchanged=' + result.unchanged);
  } catch (e) {
    logError('Sync failed: ' + e.message + '\n' + e.stack);
  }
}

/**
 * Manual sync entry point. Returns a summary object for UI display.
 *
 * @returns {{ added: number, updated: number, archived: number, unchanged: number, error: string|null }}
 */
function syncBudgetCategoriesManual() {
  try {
    return _runSync();
  } catch (e) {
    logError('Manual sync failed: ' + e.message);
    return { added: 0, updated: 0, archived: 0, unchanged: 0, error: e.message };
  }
}

// ─── Core Sync Logic ──────────────────────────────────────────────────────────

/**
 * @typedef {{ added: number, updated: number, archived: number, unchanged: number, error: null }} SyncResult
 */

/**
 * @returns {SyncResult}
 */
function _runSync() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var config = getAppConfig(ss);

  // CI-injected constant takes precedence; App_Config tab is fallback for manual/local runs
  var sourceId = (typeof JOINT_SPEND_SPREADSHEET_ID !== 'undefined' && JOINT_SPEND_SPREADSHEET_ID !== 'JOINT_SPEND_ID_PLACEHOLDER')
    ? JOINT_SPEND_SPREADSHEET_ID
    : config[CONFIG_KEY.SOURCE_SPREADSHEET_ID];
  var sourceTab = config[CONFIG_KEY.SOURCE_RECURRING_ITEMS_TAB] || 'Recurring_Items';

  if (!sourceId) {
    throw new Error('source_spreadsheet_id not set — add JOINT_SPEND_SHEET_ID GitHub Secret or set App_Config tab');
  }

  var sourceItems = _readRecurringItems(sourceId, sourceTab);
  logInfo('Recurring_Items read: ' + sourceItems.length + ' items from joint-spend');

  var catSheet = getOrCreateSheet(ss, SHEET.BUDGET_CATEGORIES);
  var existing = buildRowIndex(catSheet, COL.BUDGET_CATEGORIES.SOURCE_ITEM_NAME);

  var result = { added: 0, updated: 0, archived: 0, unchanged: 0, error: null };
  var currentMonth = toYearMonth();
  var now = new Date();

  // Track which source item names appeared in this sync run
  var seenSourceNames = {};

  for (var i = 0; i < sourceItems.length; i++) {
    var item = sourceItems[i];
    seenSourceNames[item.name] = true;

    if (existing.hasOwnProperty(item.name)) {
      // Item exists — check if budget changed
      var row = existing[item.name];
      var existingBudget = Number(row.values[COL.BUDGET_CATEGORIES.MONTHLY_BUDGET - 1]);
      var existingStatus = String(row.values[COL.BUDGET_CATEGORIES.ACTIVE_STATUS - 1]);
      var categoryId     = String(row.values[COL.BUDGET_CATEGORIES.CATEGORY_ID - 1]);

      var changed = false;

      if (existingBudget !== item.amount) {
        catSheet.getRange(row.rowIdx, COL.BUDGET_CATEGORIES.MONTHLY_BUDGET).setValue(item.amount);
        logInfo('Budget updated: ' + item.name + ' ' + existingBudget + ' → ' + item.amount);
        changed = true;
      }

      // Re-activate if it was archived
      if (existingStatus === ACTIVE_STATUS.ARCHIVED) {
        catSheet.getRange(row.rowIdx, COL.BUDGET_CATEGORIES.ACTIVE_STATUS).setValue(ACTIVE_STATUS.ACTIVE);
        logInfo('Re-activated: ' + item.name);
        changed = true;
      }

      if (changed) {
        _upsertBudgetHistory(ss, currentMonth, categoryId, item.amount, SOURCE.SYNCED, now);
        result.updated++;
      } else {
        result.unchanged++;
      }

    } else {
      // New item — insert
      var newCategoryId = generateId('cat');
      var newRow = _buildCategoryRow(newCategoryId, item, currentMonth);
      catSheet.appendRow(newRow);
      logInfo('New category: ' + item.name + ' id=' + newCategoryId);
      _upsertBudgetHistory(ss, currentMonth, newCategoryId, item.amount, SOURCE.SYNCED, now);
      result.added++;
    }
  }

  // Archive categories that are synced but no longer in source
  _archiveMissingItems(catSheet, existing, seenSourceNames, result);

  return result;
}

// ─── Recurring Items Reader ───────────────────────────────────────────────────

/**
 * Reads Recurring_Items tab from the joint-spend spreadsheet.
 *
 * Joint-spend Recurring_Items schema (9 columns):
 *   Col A (1) = item           — item name
 *   Col B (2) = category
 *   Col C (3) = monthly_amount — the budget amount in INR  ← was incorrectly reading col B
 *   Col D (4) = default_owner
 *   Col E (5) = split_rule
 *   Col F (6) = active_status  — must be 'Active' to be included
 *   Col G (7) = start_month
 *   Col H (8) = end_month
 *   Col I (9) = notes
 *
 * Only rows with active_status === 'Active' are returned.
 * Skips rows where name or amount is missing/zero.
 *
 * @param {string} spreadsheetId
 * @param {string} tabName
 * @returns {{ name: string, amount: number }[]}
 */
function _readRecurringItems(spreadsheetId, tabName) {
  var sourceSheet;
  try {
    var sourceSS = SpreadsheetApp.openById(spreadsheetId);
    sourceSheet = sourceSS.getSheetByName(tabName);
  } catch (e) {
    throw new Error('Cannot open joint-spend sheet (' + spreadsheetId + '): ' + e.message);
  }

  if (!sourceSheet) {
    throw new Error('Tab "' + tabName + '" not found in joint-spend sheet');
  }

  var lastRow = sourceSheet.getLastRow();
  if (lastRow < 2) return [];

  // Read cols A–F (6 columns): item, category, monthly_amount, default_owner, split_rule, active_status
  var data = sourceSheet.getRange(2, 1, lastRow - 1, 6).getValues();
  var items = [];

  for (var i = 0; i < data.length; i++) {
    var name         = String(data[i][0]).trim();   // Col A: item
    var amount       = Number(data[i][2]);           // Col C: monthly_amount (NOT col B which is category)
    var activeStatus = String(data[i][5]).trim();    // Col F: active_status

    // Only include Active rows with a valid name and positive amount
    if (name && !isNaN(amount) && amount > 0 && activeStatus === 'Active') {
      items.push({ name: name, amount: amount });
    }
  }

  return items;
}

// ─── Budget History ───────────────────────────────────────────────────────────

/**
 * Inserts or updates a Budget_History row for the given month + category.
 * Overwrites the current month's row if it exists (mid-month change case).
 * Historical months are never touched.
 *
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss
 * @param {string} month         yyyy-MM
 * @param {string} categoryId
 * @param {number} budgetAmount
 * @param {string} source        SOURCE.SYNCED | SOURCE.MANUAL
 * @param {Date}   syncedAt
 */
function _upsertBudgetHistory(ss, month, categoryId, budgetAmount, source, syncedAt) {
  var sheet = getOrCreateSheet(ss, SHEET.BUDGET_HISTORY);
  var lastRow = sheet.getLastRow();

  // Search for existing row matching this month + categoryId
  if (lastRow >= 2) {
    var data = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
    for (var i = 0; i < data.length; i++) {
      if (String(data[i][0]).trim() === month && String(data[i][1]).trim() === categoryId) {
        // Overwrite budget_amount and synced_at only — source preserved
        var rowIdx = i + 2;
        sheet.getRange(rowIdx, COL.BUDGET_HISTORY.BUDGET_AMOUNT).setValue(budgetAmount);
        sheet.getRange(rowIdx, COL.BUDGET_HISTORY.SYNCED_AT).setValue(formatTimestamp(syncedAt));
        return;
      }
    }
  }

  // No existing row — append
  sheet.appendRow([
    month,
    categoryId,
    budgetAmount,
    source,
    formatTimestamp(syncedAt),
  ]);
}

// ─── Archive Logic ────────────────────────────────────────────────────────────

/**
 * Sets active_status = Archived for synced categories not seen in this run.
 * Manual categories are never archived by sync.
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} catSheet
 * @param {Object} existing       buildRowIndex result (keyed by source_item_name)
 * @param {Object} seenSourceNames  keys = source item names present in this sync
 * @param {SyncResult} result
 */
function _archiveMissingItems(catSheet, existing, seenSourceNames, result) {
  for (var sourceName in existing) {
    if (existing.hasOwnProperty(sourceName) && !seenSourceNames[sourceName]) {
      var row = existing[sourceName];
      var source = String(row.values[COL.BUDGET_CATEGORIES.SOURCE - 1]);
      var status = String(row.values[COL.BUDGET_CATEGORIES.ACTIVE_STATUS - 1]);

      // Only archive synced items that are currently active or paused
      if (source === SOURCE.SYNCED && status !== ACTIVE_STATUS.ARCHIVED) {
        catSheet.getRange(row.rowIdx, COL.BUDGET_CATEGORIES.ACTIVE_STATUS).setValue(ACTIVE_STATUS.ARCHIVED);
        logInfo('Archived (removed from source): ' + sourceName);
        result.archived++;
      }
    }
  }
}

// ─── Row Builder ──────────────────────────────────────────────────────────────

/**
 * Builds a new Budget_Categories row array in column order.
 *
 * @param {string} categoryId
 * @param {{ name: string, amount: number }} item
 * @param {string} currentMonth  yyyy-MM
 * @returns {Array}
 */
function _buildCategoryRow(categoryId, item, currentMonth) {
  // Derive category_name from source item name (trim, keep as-is)
  return [
    categoryId,          // category_id
    item.name,           // category_name
    item.amount,         // monthly_budget
    SOURCE.SYNCED,       // source
    item.name,           // source_item_name
    ACTIVE_STATUS.ACTIVE, // active_status
    currentMonth,        // created_month
    '',                  // notes
  ];
}
