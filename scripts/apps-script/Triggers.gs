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
    .addItem('Setup Daily Sync Trigger', 'installDailySyncTrigger')
    .addItem('Run Sync Now', 'syncBudgetCategories')
    .addToUi();
}

/**
 * Programmatically installs the daily time-driven trigger for the sync.
 * Checks if one already exists to avoid duplicate triggers.
 */
function installDailySyncTrigger() {
  var functionName = 'syncBudgetCategories';
  var triggers = ScriptApp.getProjectTriggers();
  
  // Check if it already exists
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === functionName) {
      SpreadsheetApp.getUi().alert('A daily sync trigger is already installed!');
      return;
    }
  }

  // Create the trigger to run every day between Midnight and 1 AM
  ScriptApp.newTrigger(functionName)
    .timeBased()
    .everyDays(1)
    .atHour(0) // Midnight
    .create();

  SpreadsheetApp.getUi().alert('✅ Daily sync trigger successfully installed! It will run every night between 12:00 AM and 1:00 AM.');
}
