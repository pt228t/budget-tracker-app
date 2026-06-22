# Bug Ticket: BUG-001 - Sync.gs Column Mapping Error

## Issue Description
The automated synchronization script (`Sync.gs`) was failing to correctly pull the `monthly_amount` data from the joint-spend `Recurring_Items` sheet. It was pointing to an incorrect column index, causing budget data to be miscalculated or missing entirely in the downstream data structure.

## Root Cause
The column index mapping in the `Sync.gs` code did not match the actual schema of the `Recurring_Items` Google Sheet. The script was reading from a neighboring column instead of the designated `monthly_amount` column.

## Resolution
1. **Fixed Column Reference:** Updated the column index in `Sync.gs` to correctly align with the `monthly_amount` column in the Google Sheet.
2. **Added Unit Tests:** Created a regression-proof unit test suite (`tests/apps-script/sync.test.js`) with 133 tests to ensure the column mappings and budget sync logic work correctly and don't break in future updates.
3. **Dry-Run Validation:** Configured the deployment pipeline to run these tests and validate against guardrails before pushing any changes to Apps Script.

## Status
✅ Resolved (Tests passing and correct column values are syncing)
