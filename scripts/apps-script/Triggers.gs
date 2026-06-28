/**
 * Triggers.gs — BudgetPulse
 * Automates the setup of time-driven triggers and adds a custom menu
 * to the Google Sheet UI for easy management.
 */

/**
 * Creates a custom menu in the Google Sheet when it is opened.
 * This makes it easy for the owner to set up or remove triggers without
 * opening the Apps Script editor.
 */
function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('BudgetPulse')
    .addItem('Run Sync Now', 'syncBudgetCategories')
    .addSeparator()
    .addItem('Setup Daily Sync Trigger', 'installDailySyncTrigger')
    .addItem('Install All Automations (Sync + Emails)', 'installAllTriggers')
    .addToUi();
}

/**
 * Programmatically installs the daily time-driven trigger for the sync.
 * Checks if one already exists to avoid duplicate triggers.
 */
function installDailySyncTrigger() {
  _installTrigger('syncBudgetCategories', function(builder) {
    return builder.everyDays(1).atHour(0);
  });
  SpreadsheetApp.getUi().alert('✅ Daily sync trigger successfully installed! It will run every night between 12:00 AM and 1:00 AM.');
}

/**
 * Programmatically installs all time-driven triggers:
 *   - Daily Categories Sync (every day at 12:00 AM)
 *   - Weekly Summary Email (every Sunday at 9:00 AM)
 *   - Monthly Report Email (1st of every month at 9:00 AM)
 *   - Daily No-Log Reminder Email (every day at 8:00 PM)
 */
function installAllTriggers() {
  // 1. Setup Daily Sync
  _installTrigger('syncBudgetCategories', function(builder) {
    return builder.everyDays(1).atHour(0);
  });

  // 2. Setup Weekly Summary
  _installTrigger('sendWeeklySummary', function(builder) {
    return builder.onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(9);
  });

  // 3. Setup Monthly Report
  _installTrigger('sendMonthlyReport', function(builder) {
    return builder.onMonthDay(1).atHour(9);
  });

  // 4. Setup No-Log Reminder
  _installTrigger('checkNoLogReminder', function(builder) {
    return builder.everyDays(1).atHour(20);
  });

  SpreadsheetApp.getUi().alert(
    '✅ All BudgetPulse automations installed successfully!\n\n' +
    '• Daily Sync: every night at 12:00 AM\n' +
    '• Weekly Summary: every Sunday at 9:00 AM\n' +
    '• Monthly Report: 1st of month at 9:00 AM\n' +
    '• No-Log Reminder: every day at 8:00 PM'
  );
}

/**
 * Internal helper to check for and install a trigger.
 */
function _installTrigger(functionName, configFn) {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === functionName) {
      return; // Already exists
    }
  }
  var builder = ScriptApp.newTrigger(functionName).timeBased();
  builder = configFn(builder);
  builder.create();
}
