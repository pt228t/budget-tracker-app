# Bug Ticket: BUG-003 - Missing Programmatic Setup for Daily Sync Trigger

## Issue Description
User story `B-003` ("Apps Script: Daily sync trigger setup") was marked as `DONE` in the product backlog, but the implementation relied entirely on the user manually navigating the Google Apps Script dashboard UI to create the time-driven trigger. There was no code provided to automate this process.

## Agile Classification
In Agile methodology, this is classified as an **Escaped Defect** or **Missed Scope (Technical Debt)**. When a story is marked "Done" but lacks automation that should reasonably be part of its Acceptance Criteria, the gap is tracked as a Bug against the original story.

## Root Cause
Google Apps Script's security model prevents scripts from silently installing time-driven triggers in the background without explicit user authorization. Therefore, a pure backend automation wasn't initially written because a user action is strictly required by Google's OAuth consent screen.

## Resolution
1. **Created `Triggers.gs`:** Added a new Apps Script file to handle trigger lifecycle.
2. **Custom Sheet Menu:** Implemented `onOpen()` to inject a custom "BudgetPulse" dropdown menu directly into the Google Sheet UI.
3. **Programmatic Installation:** Added the `installDailySyncTrigger()` function which safely checks for existing triggers and programmatically builds the midnight sync schedule.
4. **User Workflow:** The user only needs to click `BudgetPulse -> Setup Daily Sync Trigger` inside their Google Sheet once, which handles the necessary authorization and installs the trigger automatically.

## Status
✅ Resolved (Code pushed and deployed via CI)
