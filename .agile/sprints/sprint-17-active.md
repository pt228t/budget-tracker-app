# Sprint 17 Active Plan

## Goal
Implement future-dated transaction handling and enhance transaction edit capabilities, including:
1. Adding a transaction date field to the expense logging form (defaulting to today).
2. Ensuring future-dated transactions (date > today) are excluded from dashboard summaries, analytics, and personal settlements until that day arrives.
3. Enabling editing of transaction dates in the edit form.
4. Synchronizing edit actions with the local `_allLoadedTransactions` filter array and supporting month-shifting in cache updates.

## Active Tasks
- **B-041: Frontend: Future-dated transactions support**
  - Add Date input in `index.html` logging form.
  - Read `date` in `_handleSubmit` and pass it to `buildTransactionRow`.
  - Filter out future dates (`> today`) in `loadCategoryBundle` (spent calculations), `filterByMonth` (analytics charts), and `renderPersonalSettlement`.
- **B-042: Frontend: Date editing and cache sync**
  - Add Date input in `_handleEdit` form in `expense-logger.js`.
  - Update `_handleEditSave` to read the new date, compute the new month, and update `_allLoadedTransactions` array.
  - Update `updateTransactionInCache` in `cache.js` to support month-shifting when editing.
