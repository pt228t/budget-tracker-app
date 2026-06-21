/**
 * Notifications.gs — BudgetPulse
 * Email notification functions:
 *   - Weekly summary (Sunday 09:00)
 *   - Monthly report (1st of month 09:00)
 *   - 48-hour no-log reminder (daily 20:00 check)
 *
 * Each function is an Apps Script trigger entry point.
 */

// ─── Trigger Entry Points ─────────────────────────────────────────────────────

/**
 * Weekly summary trigger — runs Sunday 09:00 IST.
 * Sends one email per allowed user with budget health for the current month.
 */
function sendWeeklySummary() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var recipients = getAllowedUsers(ss);
    if (!recipients.length) {
      logWarn('sendWeeklySummary: no allowed_users configured');
      return;
    }

    var data = _gatherMonthData(ss);
    var subject = 'BudgetPulse Weekly Summary — ' + data.month;
    var html = _buildWeeklySummaryHtml(data);

    for (var i = 0; i < recipients.length; i++) {
      if (_notificationAlreadySent(ss, NOTIFICATION_TYPE.WEEKLY_SUMMARY, recipients[i], data.month)) {
        logInfo('Weekly summary already sent to ' + recipients[i] + ' for ' + data.month + '. Skip.');
        continue;
      }
      GmailApp.sendEmail(recipients[i], subject, '', { htmlBody: html });
      _logNotification(ss, NOTIFICATION_TYPE.WEEKLY_SUMMARY, recipients[i], data.month, '', 'Weekly summary sent');
      logInfo('Weekly summary sent to ' + recipients[i]);
    }
  } catch (e) {
    logError('sendWeeklySummary failed: ' + e.message);
  }
}

/**
 * Monthly report trigger — runs 1st of month 09:00 IST.
 * Covers the PREVIOUS month's full data.
 */
function sendMonthlyReport() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var recipients = getAllowedUsers(ss);
    if (!recipients.length) {
      logWarn('sendMonthlyReport: no allowed_users configured');
      return;
    }

    // Report is for the previous month
    var now = new Date();
    var prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    var prevMonth = toYearMonth(prevMonthDate);

    var data = _gatherMonthData(ss, prevMonthDate);
    var subject = 'BudgetPulse Monthly Report — ' + prevMonth;
    var html = _buildMonthlyReportHtml(data);

    for (var i = 0; i < recipients.length; i++) {
      if (_notificationAlreadySent(ss, NOTIFICATION_TYPE.MONTHLY_REPORT, recipients[i], prevMonth)) {
        logInfo('Monthly report already sent to ' + recipients[i] + ' for ' + prevMonth + '. Skip.');
        continue;
      }
      GmailApp.sendEmail(recipients[i], subject, '', { htmlBody: html });
      _logNotification(ss, NOTIFICATION_TYPE.MONTHLY_REPORT, recipients[i], prevMonth, '', 'Monthly report sent');
      logInfo('Monthly report sent to ' + recipients[i]);
    }
  } catch (e) {
    logError('sendMonthlyReport failed: ' + e.message);
  }
}

/**
 * No-log reminder check — runs daily 20:00 IST.
 * Sends nudge to each allowed user who hasn't logged an expense in > 48 hours.
 */
function checkNoLogReminder() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var recipients = getAllowedUsers(ss);
    if (!recipients.length) return;

    var thresholdHours = parseInt(getConfigValue(ss, CONFIG_KEY.NO_LOG_REMINDER_HOURS, '48'), 10);
    var thresholdMs = thresholdHours * 60 * 60 * 1000;
    var now = new Date();
    var cutoff = new Date(now.getTime() - thresholdMs);
    var currentMonth = toYearMonth();

    for (var i = 0; i < recipients.length; i++) {
      var lastLogged = _getLastLoggedAt(ss, recipients[i]);
      if (lastLogged === null || lastLogged < cutoff) {
        if (_notificationAlreadySent(ss, NOTIFICATION_TYPE.NO_LOG_REMINDER, recipients[i], currentMonth)) {
          logInfo('No-log reminder already sent to ' + recipients[i] + ' this month. Skip.');
          continue;
        }
        var html = _buildNoLogReminderHtml(recipients[i], lastLogged);
        GmailApp.sendEmail(recipients[i], 'BudgetPulse — Time to log your expenses!', '', { htmlBody: html });
        _logNotification(ss, NOTIFICATION_TYPE.NO_LOG_REMINDER, recipients[i], currentMonth, '', 'No-log reminder sent');
        logInfo('No-log reminder sent to ' + recipients[i]);
      }
    }
  } catch (e) {
    logError('checkNoLogReminder failed: ' + e.message);
  }
}

// ─── Data Gathering ───────────────────────────────────────────────────────────

/**
 * Aggregates all data needed for email templates.
 *
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss
 * @param {Date} [forDate]  defaults to today
 * @returns {MonthData}
 */
function _gatherMonthData(ss, forDate) {
  var targetDate = forDate || new Date();
  var month = toYearMonth(targetDate);

  var categories = _getActiveCategories(ss);
  var budgets = _getBudgetHistory(ss, month);
  var transactions = _getMonthTransactions(ss, month);

  // Aggregate spending per category
  var spentByCategory = {};
  for (var i = 0; i < transactions.length; i++) {
    var txn = transactions[i];
    var catId = String(txn[COL.TRANSACTIONS.CATEGORY_ID - 1]);
    var amount = Number(txn[COL.TRANSACTIONS.AMOUNT - 1]);
    spentByCategory[catId] = (spentByCategory[catId] || 0) + amount;
  }

  var categoryStats = [];
  var totalBudget = 0;
  var totalSpent = 0;

  for (var j = 0; j < categories.length; j++) {
    var cat = categories[j];
    var catId2 = String(cat[COL.BUDGET_CATEGORIES.CATEGORY_ID - 1]);
    var catName = String(cat[COL.BUDGET_CATEGORIES.CATEGORY_NAME - 1]);
    var budget = budgets[catId2] || Number(cat[COL.BUDGET_CATEGORIES.MONTHLY_BUDGET - 1]);
    var spent = spentByCategory[catId2] || 0;
    var pct = utilizationPercent(spent, budget);

    totalBudget += budget;
    totalSpent += spent;

    categoryStats.push({
      id:      catId2,
      name:    catName,
      budget:  budget,
      spent:   spent,
      pct:     pct,
      health:  budgetHealthLabel(pct),
      remaining: budget - spent,
    });
  }

  // Sort by utilization descending for display
  categoryStats.sort(function(a, b) { return b.pct - a.pct; });

  // Top 5 individual transactions by amount
  var top5 = transactions.slice().sort(function(a, b) {
    return Number(b[COL.TRANSACTIONS.AMOUNT - 1]) - Number(a[COL.TRANSACTIONS.AMOUNT - 1]);
  }).slice(0, 5).map(function(t) {
    return {
      date:        toDateString(new Date(t[COL.TRANSACTIONS.DATE - 1])),
      amount:      Number(t[COL.TRANSACTIONS.AMOUNT - 1]),
      description: String(t[COL.TRANSACTIONS.DESCRIPTION - 1]),
      category:    String(t[COL.TRANSACTIONS.CATEGORY_ID - 1]),
    };
  });

  return {
    month:          month,
    totalBudget:    totalBudget,
    totalSpent:     totalSpent,
    remaining:      totalBudget - totalSpent,
    savingsRate:    totalBudget > 0 ? ((totalBudget - totalSpent) / totalBudget * 100).toFixed(1) : '0.0',
    categoryStats:  categoryStats,
    txnCount:       transactions.length,
    top5:           top5,
  };
}

// ─── Data Access Helpers ──────────────────────────────────────────────────────

/**
 * Returns all Active category rows from Budget_Categories.
 *
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss
 * @returns {Array[]}
 */
function _getActiveCategories(ss) {
  var sheet = ss.getSheetByName(SHEET.BUDGET_CATEGORIES);
  if (!sheet) return [];
  var rows = getDataRows(sheet);
  return rows.filter(function(r) {
    return String(r[COL.BUDGET_CATEGORIES.ACTIVE_STATUS - 1]) === ACTIVE_STATUS.ACTIVE;
  });
}

/**
 * Returns a map of categoryId → budgetAmount for a given month from Budget_History.
 *
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss
 * @param {string} month  yyyy-MM
 * @returns {Object.<string, number>}
 */
function _getBudgetHistory(ss, month) {
  var sheet = ss.getSheetByName(SHEET.BUDGET_HISTORY);
  if (!sheet) return {};
  var rows = getDataRows(sheet);
  var map = {};
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][COL.BUDGET_HISTORY.MONTH - 1]).trim() === month) {
      var catId = String(rows[i][COL.BUDGET_HISTORY.CATEGORY_ID - 1]).trim();
      map[catId] = Number(rows[i][COL.BUDGET_HISTORY.BUDGET_AMOUNT - 1]);
    }
  }
  return map;
}

/**
 * Returns all transaction rows for a given month.
 *
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss
 * @param {string} month  yyyy-MM
 * @returns {Array[]}
 */
function _getMonthTransactions(ss, month) {
  var sheet = ss.getSheetByName(SHEET.TRANSACTIONS);
  if (!sheet) return [];
  var rows = getDataRows(sheet);
  return rows.filter(function(r) {
    return String(r[COL.TRANSACTIONS.MONTH - 1]).trim() === month;
  });
}

/**
 * Returns the most recent logged_at Date for a given user email.
 * Returns null if user has no transactions at all.
 *
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss
 * @param {string} email
 * @returns {Date|null}
 */
function _getLastLoggedAt(ss, email) {
  var sheet = ss.getSheetByName(SHEET.TRANSACTIONS);
  if (!sheet) return null;
  var rows = getDataRows(sheet);
  var latest = null;
  for (var i = 0; i < rows.length; i++) {
    var loggedBy = String(rows[i][COL.TRANSACTIONS.LOGGED_BY - 1]).toLowerCase().trim();
    if (loggedBy === email.toLowerCase()) {
      var ts = rows[i][COL.TRANSACTIONS.LOGGED_AT - 1];
      var d = ts instanceof Date ? ts : new Date(ts);
      if (!isNaN(d.getTime()) && (latest === null || d > latest)) {
        latest = d;
      }
    }
  }
  return latest;
}

// ─── Notification Log ─────────────────────────────────────────────────────────

/**
 * Returns true if a notification of the given type was already sent
 * to this recipient for this month.
 *
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss
 * @param {string} type
 * @param {string} sentTo
 * @param {string} month
 * @returns {boolean}
 */
function _notificationAlreadySent(ss, type, sentTo, month) {
  var sheet = ss.getSheetByName(SHEET.NOTIFICATION_LOG);
  if (!sheet) return false;
  var rows = getDataRows(sheet);
  for (var i = 0; i < rows.length; i++) {
    if (
      String(rows[i][COL.NOTIFICATION_LOG.TYPE - 1]).trim()    === type &&
      String(rows[i][COL.NOTIFICATION_LOG.SENT_TO - 1]).toLowerCase().trim() === sentTo.toLowerCase() &&
      String(rows[i][COL.NOTIFICATION_LOG.MONTH - 1]).trim()   === month
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Appends a row to Notification_Log.
 *
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss
 * @param {string} type
 * @param {string} sentTo
 * @param {string} month
 * @param {string} categoryId
 * @param {string} details
 */
function _logNotification(ss, type, sentTo, month, categoryId, details) {
  var sheet = getOrCreateSheet(ss, SHEET.NOTIFICATION_LOG);
  sheet.appendRow([
    generateId('ntf'),
    type,
    sentTo,
    formatTimestamp(new Date()),
    month,
    categoryId || '',
    details || '',
  ]);
}

// ─── Email Templates ──────────────────────────────────────────────────────────

var HEALTH_COLOR = {
  GREEN:    '#16a34a',
  AMBER:    '#d97706',
  RED:      '#dc2626',
  CRITICAL: '#7c3aed',
};

/**
 * Builds HTML for weekly summary email.
 *
 * @param {MonthData} data
 * @returns {string}
 */
function _buildWeeklySummaryHtml(data) {
  var rows = data.categoryStats.map(function(c) {
    var barWidth = Math.min(c.pct, 100).toFixed(0);
    var color = HEALTH_COLOR[c.health];
    return '<tr>' +
      '<td style="padding:8px 12px;font-size:14px;">' + _esc(c.name) + '</td>' +
      '<td style="padding:8px 12px;font-size:14px;">' + formatINR(c.budget) + '</td>' +
      '<td style="padding:8px 12px;font-size:14px;color:' + color + ';">' + formatINR(c.spent) + '</td>' +
      '<td style="padding:8px 12px;">' +
        '<div style="background:#e5e7eb;border-radius:4px;height:10px;width:140px;">' +
          '<div style="background:' + color + ';width:' + barWidth + '%;height:10px;border-radius:4px;"></div>' +
        '</div>' +
        '<span style="font-size:12px;color:' + color + ';">' + c.pct.toFixed(0) + '%</span>' +
      '</td>' +
      '<td style="padding:8px 12px;font-size:14px;color:' + (c.remaining >= 0 ? '#16a34a' : '#dc2626') + ';">' +
        formatINR(Math.abs(c.remaining)) + (c.remaining < 0 ? ' over' : ' left') +
      '</td>' +
    '</tr>';
  }).join('');

  var top5Rows = data.top5.map(function(t) {
    return '<tr>' +
      '<td style="padding:6px 12px;font-size:13px;">' + _esc(t.date) + '</td>' +
      '<td style="padding:6px 12px;font-size:13px;">' + _esc(t.description) + '</td>' +
      '<td style="padding:6px 12px;font-size:13px;font-weight:600;">' + formatINR(t.amount) + '</td>' +
    '</tr>';
  }).join('');

  return _htmlWrap('BudgetPulse — Weekly Summary ' + data.month,
    '<h2 style="color:#1e293b;margin:0 0 16px;">📊 Weekly Summary — ' + _esc(data.month) + '</h2>' +

    '<table style="border-collapse:collapse;background:#f8fafc;border-radius:8px;width:100%;margin-bottom:24px;">' +
      '<tr>' +
        _summaryCard('Total Budget', formatINR(data.totalBudget), '#3b82f6') +
        _summaryCard('Total Spent', formatINR(data.totalSpent), '#ef4444') +
        _summaryCard('Remaining', formatINR(data.remaining), data.remaining >= 0 ? '#16a34a' : '#dc2626') +
        _summaryCard('Savings Rate', data.savingsRate + '%', '#8b5cf6') +
      '</tr>' +
    '</table>' +

    '<h3 style="color:#374151;margin:0 0 12px;">Category Health</h3>' +
    '<table style="width:100%;border-collapse:collapse;font-family:sans-serif;">' +
      '<thead><tr style="background:#f1f5f9;">' +
        '<th style="padding:8px 12px;text-align:left;font-size:13px;color:#64748b;">Category</th>' +
        '<th style="padding:8px 12px;text-align:left;font-size:13px;color:#64748b;">Budget</th>' +
        '<th style="padding:8px 12px;text-align:left;font-size:13px;color:#64748b;">Spent</th>' +
        '<th style="padding:8px 12px;text-align:left;font-size:13px;color:#64748b;">Health</th>' +
        '<th style="padding:8px 12px;text-align:left;font-size:13px;color:#64748b;">Status</th>' +
      '</tr></thead>' +
      '<tbody>' + rows + '</tbody>' +
    '</table>' +

    (data.top5.length > 0 ?
      '<h3 style="color:#374151;margin:24px 0 12px;">Top 5 Expenses</h3>' +
      '<table style="width:100%;border-collapse:collapse;font-family:sans-serif;">' +
        '<thead><tr style="background:#f1f5f9;">' +
          '<th style="padding:6px 12px;text-align:left;font-size:13px;color:#64748b;">Date</th>' +
          '<th style="padding:6px 12px;text-align:left;font-size:13px;color:#64748b;">Description</th>' +
          '<th style="padding:6px 12px;text-align:left;font-size:13px;color:#64748b;">Amount</th>' +
        '</tr></thead>' +
        '<tbody>' + top5Rows + '</tbody>' +
      '</table>' : ''
    )
  );
}

/**
 * Builds HTML for monthly report email.
 * Reuses weekly layout + adds MoM comparison header note.
 *
 * @param {MonthData} data
 * @returns {string}
 */
function _buildMonthlyReportHtml(data) {
  // Build same base as weekly but with monthly framing
  var base = _buildWeeklySummaryHtml(data);
  // Replace the title
  return base.replace(
    'Weekly Summary — ' + data.month,
    'Monthly Report — ' + data.month
  ).replace(
    '📊 Weekly Summary',
    '📅 Monthly Report'
  );
}

/**
 * Builds HTML for no-log reminder email.
 *
 * @param {string} email
 * @param {Date|null} lastLogged
 * @returns {string}
 */
function _buildNoLogReminderHtml(email, lastLogged) {
  var lastLoggedText = lastLogged
    ? 'Your last expense was logged on <strong>' + toDateString(lastLogged) + '</strong>.'
    : "You haven't logged any expenses yet this month.";

  return _htmlWrap('BudgetPulse — Don\'t forget to log!',
    '<h2 style="color:#1e293b;margin:0 0 12px;">⏰ Expense Logging Reminder</h2>' +
    '<p style="color:#374151;font-size:15px;">' + lastLoggedText + '</p>' +
    '<p style="color:#374151;font-size:15px;">It takes less than 10 seconds. Keep your budget picture accurate!</p>' +
    '<a href="https://prashant228.github.io/budget-tracker-app" style="display:inline-block;margin-top:16px;padding:12px 24px;background:#3b82f6;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;">Open BudgetPulse →</a>'
  );
}

// ─── Template Utilities ───────────────────────────────────────────────────────

function _htmlWrap(title, body) {
  return '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + _esc(title) + '</title></head>' +
    '<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif;">' +
    '<div style="max-width:640px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">' +
      '<div style="background:#1e293b;padding:24px 32px;">' +
        '<span style="color:#fff;font-size:20px;font-weight:700;">💰 BudgetPulse</span>' +
      '</div>' +
      '<div style="padding:32px;">' + body + '</div>' +
      '<div style="background:#f8fafc;padding:16px 32px;text-align:center;font-size:12px;color:#94a3b8;">' +
        'BudgetPulse · Prashant &amp; Toshi · Auto-generated' +
      '</div>' +
    '</div>' +
    '</body></html>';
}

function _summaryCard(label, value, color) {
  return '<td style="padding:16px;text-align:center;">' +
    '<div style="font-size:12px;color:#64748b;margin-bottom:4px;">' + _esc(label) + '</div>' +
    '<div style="font-size:20px;font-weight:700;color:' + color + ';">' + _esc(value) + '</div>' +
  '</td>';
}

/** HTML-escapes a string for safe injection into email templates. */
function _esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
