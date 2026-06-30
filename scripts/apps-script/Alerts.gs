/**
 * Alerts.gs — BudgetPulse
 * Budget threshold monitor: checks every 6 hours.
 * Sends alert when a category hits >= alert_threshold_percent (default 80%).
 * Deduplicates via Notification_Log — one alert per category per month.
 *
 * Entry point: checkBudgetAlerts()
 */

/**
 * Main entry point — called by a 6-hourly Apps Script trigger.
 */
function checkBudgetAlerts() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var config = getAppConfig(ss);
    var threshold = parseFloat(config[CONFIG_KEY.ALERT_THRESHOLD_PERCENT] || '80');
    var recipients = getAllowedUsers(ss);

    if (!recipients.length) {
      logWarn('checkBudgetAlerts: no allowed_users configured');
      return;
    }

    var currentMonth = toYearMonth();
    var categories = _getActiveCategoriesForAlerts(ss);
    var budgets = _getBudgetMapForAlerts(ss, currentMonth, categories);
    var spending = _getSpendingByCategory(ss, currentMonth);

    var alertsSent = 0;

    for (var i = 0; i < categories.length; i++) {
      var cat = categories[i];
      var catId   = String(cat[COL.BUDGET_CATEGORIES.CATEGORY_ID - 1]).trim();
      var catName = String(cat[COL.BUDGET_CATEGORIES.CATEGORY_NAME - 1]).trim();
      var budget  = budgets[catId] || 0;
      var spent   = spending[catId] || 0;

      if (budget === 0) continue; // No budget set — skip

      var pct = utilizationPercent(spent, budget);

      if (pct < threshold) continue;

      // Send alert to each recipient if not already sent this month for this category
      for (var j = 0; j < recipients.length; j++) {
        if (_alertAlreadySent(ss, catId, recipients[j], currentMonth)) {
          logInfo('Budget alert already sent: ' + catName + ' → ' + recipients[j]);
          continue;
        }

        var subject = _buildAlertSubject(catName, pct, budget);
        var html    = _buildAlertHtml(catName, catId, spent, budget, pct, currentMonth);

        GmailApp.sendEmail(recipients[j], subject, '', { htmlBody: html });
        _logNotification(ss, NOTIFICATION_TYPE.BUDGET_ALERT, recipients[j], currentMonth, catId,
          catName + ' at ' + pct.toFixed(0) + '% (' + formatINR(spent) + '/' + formatINR(budget) + ')');

        logInfo('Budget alert sent: ' + catName + ' ' + pct.toFixed(0) + '% → ' + recipients[j]);
        alertsSent++;
      }
    }

    logInfo('checkBudgetAlerts complete. alerts_sent=' + alertsSent);
  } catch (e) {
    logError('checkBudgetAlerts failed: ' + e.message);
  }
}

// ─── Data Helpers (scoped to Alerts to avoid duplication with Notifications) ──

/**
 * Returns active category rows.
 *
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss
 * @returns {Array[]}
 */
function _getActiveCategoriesForAlerts(ss) {
  var sheet = ss.getSheetByName(SHEET.BUDGET_CATEGORIES);
  if (!sheet) return [];
  var rows = getDataRows(sheet);
  return rows.filter(function(r) {
    return String(r[COL.BUDGET_CATEGORIES.ACTIVE_STATUS - 1]) === ACTIVE_STATUS.ACTIVE;
  });
}

/**
 * Builds a categoryId → budgetAmount map using Budget_History for the month,
 * falling back to Budget_Categories.monthly_budget for categories not in history.
 *
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss
 * @param {string} month
 * @param {Array[]} categories
 * @returns {Object.<string, number>}
 */
function _getBudgetMapForAlerts(ss, month, categories) {
  var histSheet = ss.getSheetByName(SHEET.BUDGET_HISTORY);
  var histMap = {};

  if (histSheet) {
    var rows = getDataRows(histSheet);
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i][COL.BUDGET_HISTORY.MONTH - 1]).trim() === month) {
        var catId = String(rows[i][COL.BUDGET_HISTORY.CATEGORY_ID - 1]).trim();
        histMap[catId] = Number(rows[i][COL.BUDGET_HISTORY.BUDGET_AMOUNT - 1]);
      }
    }
  }

  // Fallback to Budget_Categories.monthly_budget for any category missing in history
  var result = {};
  for (var j = 0; j < categories.length; j++) {
    var id  = String(categories[j][COL.BUDGET_CATEGORIES.CATEGORY_ID - 1]).trim();
    var amt = Number(categories[j][COL.BUDGET_CATEGORIES.MONTHLY_BUDGET - 1]);
    result[id] = histMap.hasOwnProperty(id) ? histMap[id] : amt;
  }
  return result;
}

/**
 * Returns categoryId → total spent (INR) for all transactions in the given month.
 *
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss
 * @param {string} month  yyyy-MM
 * @returns {Object.<string, number>}
 */
function _getSpendingByCategory(ss, month) {
  var sheet = ss.getSheetByName(SHEET.TRANSACTIONS);
  if (!sheet) return {};
  var rows = getDataRows(sheet);
  var map = {};
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][COL.TRANSACTIONS.MONTH - 1]).trim() !== month) continue;
    var catId  = String(rows[i][COL.TRANSACTIONS.CATEGORY_ID - 1]).trim();
    var amount = Number(rows[i][COL.TRANSACTIONS.AMOUNT - 1]);
    map[catId] = (map[catId] || 0) + amount;
  }
  return map;
}

// ─── Dedup Check ──────────────────────────────────────────────────────────────

/**
 * Returns true if a budget_alert was already sent for this category + recipient + month.
 *
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss
 * @param {string} categoryId
 * @param {string} sentTo
 * @param {string} month
 * @returns {boolean}
 */
function _alertAlreadySent(ss, categoryId, sentTo, month) {
  var sheet = ss.getSheetByName(SHEET.NOTIFICATION_LOG);
  if (!sheet) return false;
  var rows = getDataRows(sheet);
  for (var i = 0; i < rows.length; i++) {
    if (
      String(rows[i][COL.NOTIFICATION_LOG.TYPE - 1]).trim()        === NOTIFICATION_TYPE.BUDGET_ALERT &&
      String(rows[i][COL.NOTIFICATION_LOG.SENT_TO - 1]).toLowerCase().trim() === sentTo.toLowerCase() &&
      String(rows[i][COL.NOTIFICATION_LOG.MONTH - 1]).trim()        === month &&
      String(rows[i][COL.NOTIFICATION_LOG.CATEGORY_ID - 1]).trim()  === categoryId
    ) {
      return true;
    }
  }
  return false;
}

// ─── Alert Email Template ─────────────────────────────────────────────────────

/**
 * @param {string} catName
 * @param {number} pct
 * @param {number} budget
 * @returns {string}
 */
function _buildAlertSubject(catName, pct, budget) {
  var label = pct >= 100 ? '🚨 OVER BUDGET' : '⚠️ Budget Alert';
  return label + ': ' + catName + ' at ' + pct.toFixed(0) + '% (' + formatINR(budget) + ')';
}

/**
 * @param {string} catName
 * @param {string} catId
 * @param {number} spent
 * @param {number} budget
 * @param {number} pct
 * @param {string} month
 * @returns {string}
 */
function _buildAlertHtml(catName, catId, spent, budget, pct, month) {
  var health = budgetHealthLabel(pct);
  var color  = { GREEN: '#16a34a', AMBER: '#d97706', RED: '#dc2626', CRITICAL: '#7c3aed' }[health];
  var barWidth = Math.min(pct, 100).toFixed(0);
  var remaining = budget - spent;
  var overUnder = remaining >= 0
    ? formatINR(remaining) + ' remaining'
    : formatINR(Math.abs(remaining)) + ' over budget';

  var headline = pct >= 100
    ? '🚨 ' + _esc(catName) + ' has exceeded its budget!'
    : '⚠️ ' + _esc(catName) + ' has reached ' + pct.toFixed(0) + '% of its budget';

  return _htmlWrap('Budget Alert — ' + catName,
    '<h2 style="color:#1e293b;margin:0 0 16px;">' + headline + '</h2>' +

    '<table style="width:100%;border-collapse:collapse;background:#f8fafc;border-radius:8px;margin-bottom:24px;">' +
      '<tr>' +
        '<td style="padding:16px;text-align:center;">' +
          '<div style="font-size:12px;color:#64748b;margin-bottom:4px;">Budget</div>' +
          '<div style="font-size:22px;font-weight:700;color:#1e293b;">' + formatINR(budget) + '</div>' +
        '</td>' +
        '<td style="padding:16px;text-align:center;">' +
          '<div style="font-size:12px;color:#64748b;margin-bottom:4px;">Spent</div>' +
          '<div style="font-size:22px;font-weight:700;color:' + color + ';">' + formatINR(spent) + '</div>' +
        '</td>' +
        '<td style="padding:16px;text-align:center;">' +
          '<div style="font-size:12px;color:#64748b;margin-bottom:4px;">Utilization</div>' +
          '<div style="font-size:22px;font-weight:700;color:' + color + ';">' + pct.toFixed(0) + '%</div>' +
        '</td>' +
      '</tr>' +
    '</table>' +

    '<div style="margin-bottom:24px;">' +
      '<div style="background:#e5e7eb;border-radius:6px;height:14px;width:100%;overflow:hidden;">' +
        '<div style="background:' + color + ';width:' + barWidth + '%;height:14px;border-radius:6px;transition:width .3s;"></div>' +
      '</div>' +
      '<p style="font-size:14px;color:' + color + ';margin:8px 0 0;font-weight:600;">' + _esc(overUnder) + ' · ' + _esc(month) + '</p>' +
    '</div>' +

    '<p style="font-size:14px;color:#64748b;">Log expenses carefully for the rest of the month, or consider reviewing your budget for this category.</p>' +
    '<a href="https://pt228t.github.io/budget-tracker-app" style="display:inline-block;margin-top:12px;padding:12px 24px;background:#3b82f6;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;">Open BudgetPulse →</a>'
  );
}
