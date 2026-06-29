# Sprint 1

## Goal

Sheets backend ready, sync work started, and frontend shell established for auth and data wiring.

## Current Pick

- `B-004 Frontend scaffold + design system`
- Codex-owned contract for `B-004`, `B-004a`, and `B-004b` is complete
- Remaining Sprint 1 items are now outside the Codex scaffold contract

## Completed In This Pass

- [x] Added static app shell with login shell and placeholder dashboard sections
- [x] Added root `app.js` router, page switching, and event wiring
- [x] Added root `utils.js` formatter and DOM helpers
- [x] Added local Vite build/dev flow
- [x] Added Vitest unit scaffolding
- [x] Added Playwright smoke scaffolding
- [x] Added Apps Script mock classes and sample sync test
- [x] Added CI and Pages workflow files
- [x] Updated README and scaffold notes

## Still Open

- [x] Run hosted validation on a real GitHub Pages deployment (Done 2026-06-21)
- [x] Start `B-005` OAuth integration (Done in Sprint 2)
- [x] Start `B-006` Sheets API wrapper (Done in Sprint 2)
# Sprint 3: Expense Logging & Dashboard

## Goal
Replace Phase 1 scaffold placeholder data with real data fetched from Google Sheets. Build out the Dashboard UI and the Expense Logging functionality.

## Current Pick
- `B-007` Expense form UI
- `B-009` Recent transactions list
- `B-010` Dashboard summary cards
- `B-011` Dashboard health bars

## Tasks by Ownership

### 🚀 AGY → Dashboard (`src/js/dashboard.js`)
- Summary cards (Total budget, spent, remaining, savings rate)
- Per-category budget health bars with color coding
- Pool health indicator
- Loading & empty states
- **Dependencies:** `sheets-api.js`, `categories.js`

### 🧠 Claude → Expense Logger (`src/js/expense-logger.js`)
- Quick-add expense form (amount, category, description, etc.)
- Form validation & submission to Sheets API (`appendRow`)
- Optimistic UI updates
- Recent transactions list (current month)
- **Dependencies:** `sheets-api.js`, `categories.js`

### ⚡ Codex → Analytics Charts (`src/js/analytics.js`)
- Category donut chart (Chart.js)
- Budget vs Actual bar chart
- Top 5 expenses table
- **Dependencies:** `sheets-api.js`

## Completed In This Pass
- [x] AGY: Dashboard UI & real data rendering (`src/js/dashboard.js` & `app.js` wiring)
- [x] Claude: Expense logger — full impl (`src/js/expense-logger.js`) ✅ 2026-06-21
  - `buildTransactionRow` (13-col, exact schema match)
  - `validateForm` (field-level errors: amount, category, description)
  - `renderTransactionItem` (HTML, no email exposure)
  - `initExpenseLogger` — injects sub-category/paid-by/notes fields, vendor suggestion banner, optimistic append + rollback on API fail
  - `tests/unit/expense-logger.test.js` — 35 tests, all green
  - Total unit tests: 106/106 passing
- [x] Codex: Analytics integration (`src/js/analytics.js` & `tests/unit/analytics.test.js`)

## Still Open
- (None - Sprint 3 complete!)

---

# Sprint 4: Dashboard
**Goal:** Beautiful dashboard with budget health.
**Status:** In Progress

| ID | Task | Status |
|----|------|--------|
| B-010 | Summary cards | DONE |
| B-011 | Category health bars | DONE |
| B-012 | Empty/loading states | DONE |
| B-013 | Donut chart | DONE |
| B-014 | Bar chart | DONE |
| B-015 | Top 5 table | DONE |

**Status: COMPLETE** ✅ (2026-06-21)

## Completed Notes
- B-012: analytics empty state (no transactions → message), renderTopExpensesTable empty row, filterByMonth pure fn, fixed range names to A1 notation
- B-016/B-017: delivered inside expense-logger.js (sub-category field injection + vendor suggestion banner)

---

# Sprint 5: Refinement & Advanced Tracking (Week 5)

**Goal:** Finalize CRUD (Edit/Delete) and polish empty states.

| ID | Task | Status |
|----|------|--------|
| B-012 | Dashboard empty/loading states | DONE |
| B-016 | Sub-category tagging | DONE |
| B-017 | Vendor suggestion engine | DONE |
| B-018 | Edit/delete transactions | DONE |

## Active Work
- (None - sprint complete)

## Completed
- B-012: analytics empty state, filterByMonth, fixed range notation, renderTopExpensesTable empty row
- B-016: sub-category field injected in expense form (static HTML + expense-logger.js)
- B-017: vendor suggestion banner + localStorage pattern learning (expense-logger.js + cache.js)
- B-018: Edit/delete transactions marked done.

---

# Sprint 10: Auth Hardening, Admin Console, and Configuration Settings

## Goal
Harden OAuth flow, implement admin user management, support manual budget categories sync, protect against wrong-sheet binding with manual rebinding configuration, and support scrolling for large category lists.

## Tasks Completed
- **B-038: Admin console to manage authorized users (UI)**
  - Implemented the authorized users list and input forms in the admin panel.
  - Implemented `getAuthorizedUsers`, `addAuthorizedUser`, and `removeAuthorizedUser` Sheets API requests.
- **B-039: Detect stale/wrong bound spreadsheet and prompt rebind**
  - Added a configuration panel in the Settings page showing the linked Spreadsheet ID and a link to open it in Google Sheets.
  - Provided a manual rebind form where the user can paste their correct Spreadsheet ID, verify its schema, and bind it.
- **B-031: Manual sync trigger button**
  - Implemented client-side manual sync that reads from the joint-spend spreadsheet's `Recurring_Items` tab and updates the local spreadsheet's `Budget_Categories` and `Budget_History` tabs directly via OAuth.
- **B-032: Settings page config management**
  - Expanded the Settings UI with form elements, buttons, and status labels, managed dynamically by the frontend.
- **UI: Scrollbar wrapper for category list progress panel**
  - Added a `.scroll-container` CSS component with custom scrollbar styling.
  - Wrapped the category health progress list on the dashboard in this scrollable container and increased the render limit to 100 to show all categories nicely without stretching the dashboard.

## Completed Code & Files
- [components.css](file:///Users/prashant228/Documents/Projects/budget-tracker-app/src/css/components.css) — `.scroll-container` style block with custom scrollbar.
- [index.html](file:///Users/prashant228/Documents/Projects/budget-tracker-app/index.html) — Wrapped category progress list in a scroll wrapper; added the Spreadsheet Configuration card to the Settings page.
- [admin.js](file:///Users/prashant228/Documents/Projects/budget-tracker-app/src/js/admin.js) — Expanded settings page with `initSettingsPanel()`, including rebind saving, schema bootstrapping verification, and manual sync event wiring.
- [categories.js](file:///Users/prashant228/Documents/Projects/budget-tracker-app/src/js/categories.js) — Added client-side category sync in `syncCategoriesFromSource()` matching Google Apps Script syncer logic; increased rendering limit to 100.
- [sheets-api.js](file:///Users/prashant228/Documents/Projects/budget-tracker-app/src/js/sheets-api.js) — Added `readRangeFromSpreadsheet()` for external workbook access.
- [app.js](file:///Users/prashant228/Documents/Projects/budget-tracker-app/app.js) — Wired `initSettingsPanel()` initialization during route updates.
- Tests: Created [settings-sync.test.js](file:///Users/prashant228/Documents/Projects/budget-tracker-app/tests/unit/settings-sync.test.js) covering client-side sync logic with complete Vitest mocks.

---

# Sprint 11: Personal Payment Tracking & Reimbursement

## Goal
Implement personal payment tracking (B-025) and month-end personal payment summary & settlement split calculations (B-026) in the UI.

## Tasks Completed
- **B-025: Personal payment tracking (overflow)**
  - Dynamically populated the "Paid by" dropdown in the expense form with the authorized users' emails.
  - Updated mapping in `_handleSubmit` to correctly save the selected user's email into the `paid_by` column.
- **B-026: Month-end personal payment summary & settlement**
  - Added a Personal Settlement dashboard card showing total out-of-pocket spending per user, net balances, dynamic reimbursement settlement instructions (who owes whom how much), and recent out-of-pocket logs.
  - Implemented dynamic aggregation of current month spending from the `Transactions` sheet to enrich category spent metrics on the main dashboard cards and list.
  - Created `tests/unit/personal-settlement.test.js` covering balance computations and advice output.

## Completed Code & Files
- [dashboard.js](file:///Users/prashant228/Documents/Projects/budget-tracker-app/src/js/dashboard.js) — Added `renderPersonalSettlement()` balance/debt resolution algorithm and DOM layout rendering.
- [expense-logger.js](file:///Users/prashant228/Documents/Projects/budget-tracker-app/src/js/expense-logger.js) — Populated `bp-paid-by` dynamically from `getAuthorizedUsers()`; updated form submission mapping.
- [categories.js](file:///Users/prashant228/Documents/Projects/budget-tracker-app/src/js/categories.js) — Updated `loadCategoryBundle()` to fetch current month transactions and dynamically aggregate spent amounts.
- [index.html](file:///Users/prashant228/Documents/Projects/budget-tracker-app/index.html) — Added Personal Settlement card container.
- [app.js](file:///Users/prashant228/Documents/Projects/budget-tracker-app/app.js) — Wired `renderPersonalSettlement()` calls during category data hydration.
- Tests: Created [personal-settlement.test.js](file:///Users/prashant228/Documents/Projects/budget-tracker-app/tests/unit/personal-settlement.test.js) test file.

---

# Sprint 12: Analytics Enhancements (MoM trends & Top Expenses)

## Goal
Implement Month-over-Month (MoM) budget vs actual spending trends (B-019) and Top 5 expenses insights (B-020) in the Analytics dashboard to support production-level tracking.

## Tasks Completed
- **B-019: Month-over-Month spending trend analysis**
  - Added `calculateMoMData` to aggregate spending and budget history chronologically over the last 6 months.
  - Implemented dynamic budget history fallback (defaults to current active category budget sums if no historical record exists for a month).
  - Implemented `renderMoMChart` using Chart.js to render a beautiful dual-bar chart showing Total Budget vs Actual Spend per month on the `#analytics-chart` canvas.
- **B-020: Top 5 expenses insights**
  - Updated category translation in `initAnalytics` so that the Top 5 Expenses table displays human-readable category names (e.g. "Rent", "Grocery") instead of raw sheet IDs (e.g. `cat_mqwpsyxjyh39`).
  - Added Unit Tests for `calculateMoMData` in `tests/unit/analytics.test.js`.

## Completed Code & Files
- [analytics.js](file:///Users/prashant228/Documents/Projects/budget-tracker-app/src/js/analytics.js) — Added `calculateMoMData()` and `renderMoMChart()`, updated `initAnalytics()` to support history sheets and category name mappings.
- Tests: Added unit tests to [analytics.test.js](file:///Users/prashant228/Documents/Projects/budget-tracker-app/tests/unit/analytics.test.js).

---

# Sprint 13: Log Management (Advanced Filters & CSV Export)

## Goal
Implement historical log management in the Expense Log view, including advanced filters by person, category, and date range (B-030), and CSV export capability (B-033) for full data portability.

## Tasks Completed
- **B-030: Advanced log filtering**
  - Added filter dropdowns and date selectors dynamically populated with active categories and authorized users' email list on the transaction history card.
  - Implemented client-side filtering logic `_applyFilters` in the expense logger to filter loaded transactions dynamically without making network requests.
- **B-033: CSV Data Export**
  - Added an "Export as CSV" button next to the transaction history header.
  - Implemented client-side CSV builder `_triggerCSVExport` that formats, escapes double quotes and commas, and initiates download of currently filtered transactions as a `.csv` file.
  - Added Unit Tests in [log-management.test.js](file:///Users/prashant228/Documents/Projects/budget-tracker-app/tests/unit/log-management.test.js).

## Completed Code & Files
- [index.html](file:///Users/prashant228/Documents/Projects/budget-tracker-app/index.html) — Added filter selectors, date inputs, and CSV export button.
- [expense-logger.js](file:///Users/prashant228/Documents/Projects/budget-tracker-app/src/js/expense-logger.js) — Implemented client-side filters, dynamic option population, add/remove sync triggers, and CSV builder.
- Tests: Created [log-management.test.js](file:///Users/prashant228/Documents/Projects/budget-tracker-app/tests/unit/log-management.test.js).

---

# Sprint 14: Visual Polish (Dark Mode Toggle)

## Goal
Implement a premium Dark Mode toggle (B-034) with localStorage persistence, system prefers-color-scheme auto-detection, and a fully customized dark theme color palette.

## Tasks Completed
- **B-034: Dark Mode Toggle**
  - Added a moon/sun SVG toggle button to the header topbar in `index.html`.
  - Expanded `[data-theme='dark']` variable block in `variables.css` with brand, semantic, and shadow overrides tuned for dark backgrounds.
  - Added dark-mode-specific component overrides in `app-shell.css` for the topbar glass effect, form focus rings, and the toggle button styling with a subtle rotation hover animation.
  - Implemented `initThemeToggle()` in `app.js` with localStorage persistence (`bp_theme` key), system preference auto-detection via `matchMedia('prefers-color-scheme: dark')`, and live system-change listener that defers to user's explicit choice.

## Completed Code & Files
- [variables.css](file:///Users/prashant228/Documents/Projects/budget-tracker-app/src/css/variables.css) — Expanded `[data-theme='dark']` with brand, semantic, and shadow variable overrides.
- [app-shell.css](file:///Users/prashant228/Documents/Projects/budget-tracker-app/src/css/app-shell.css) — Added dark topbar glass, focus ring, and `.theme-toggle` button styles.
- [index.html](file:///Users/prashant228/Documents/Projects/budget-tracker-app/index.html) — Added theme toggle button with sun/moon SVG icons in the header.
- [app.js](file:///Users/prashant228/Documents/Projects/budget-tracker-app/app.js) — Added `initThemeToggle()`, `_applyTheme()`, `_getPreferredTheme()`, and wired into `initializeApp()`.

---

# Sprint 15: Advanced Analytics (Heatmap & Spend Split)

## Goal
Implement advanced analytics including a Day-of-Week spending heatmap (B-027) and a Person-wise spending split chart (B-028) in the Analytics view to provide deeper spending insights.

## Tasks Completed
- **B-027: Day-of-week spending heatmap**
  - Aggregated transaction amounts and counts per day of the week (Monday - Sunday) inside `calculateDayOfWeekData()`.
  - Rendered a dynamic HTML color-coded intensity grid in `initAnalytics()` using `color-mix` to blend `--color-brand-primary` with `--color-bg-surface` according to spending weight.
- **B-028: Person-wise spending split chart**
  - Aggregated transaction totals grouped by `paid_by` (email) in `calculatePersonSplitData()`.
  - Added canvas `#personSplitChart` to the layout and rendered a doughnut chart using Chart.js to compare out-of-pocket spending splits between users.
  - Added unit tests in `analytics.test.js` validating all new transformations.

## Completed Code & Files
- [analytics.js](file:///Users/prashant228/Documents/Projects/budget-tracker-app/src/js/analytics.js) — Added calculation and render functions, updated UI layout.
- [analytics.test.js](file:///Users/prashant228/Documents/Projects/budget-tracker-app/tests/unit/analytics.test.js) — Added unit test coverage for new data transformers.

---

# Sprint 16: Premium Visuals & UX Redesign

## Goal
Implement a premium, state-of-the-art visual design (glassmorphism + mesh radial gradients) and enforce clean navigation gating.

## Tasks Completed
- **B-040: Frontend: Premium UX overhaul (Glassmorphism & Nav Gating)**
  - Redesigned the Google Sign-in page with a centered glassmorphism card, glowing sync-status badge, official SVG Google icon inside the sign-in button, and removed Phase 1 checklist boilerplates.
  - Implemented gated navigation: the main header navigation menu is completely hidden when signed out.
  - Replaced the odd "Login" nav link with a styled **Sign Out** button in the header topbar next to the theme toggle.
  - Simplified the status panel to a sleek status bar reporting connection status, current view, and date, hiding it completely when logged out.
  - Cleaned up boilerplate placeholders in the dashboard overview cards, and removed Phase 1 integration notes cards from Settings.
  - Modified card styles in `components.css` to introduce subtle interactive lifts (`transform: translateY(-3px)`) and glowing primary borders on hover.

## Completed Code & Files
- [index.html](file:///Users/prashant228/Documents/Projects/budget-tracker-app/index.html) — Restructured layout and updated login/dashboard sections.
- [app.js](file:///Users/prashant228/Documents/Projects/budget-tracker-app/app.js) — Integrated immediate route redirection and auth gating in `updateRoute`.
- [app-shell.css](file:///Users/prashant228/Documents/Projects/budget-tracker-app/src/css/app-shell.css) — Upgraded app background with radial indigo-violet glow meshes.
- [components.css](file:///Users/prashant228/Documents/Projects/budget-tracker-app/src/css/components.css) — Overhauled `.card` styles for a modern, glassmorphic interactive experience.

---

# Sprint 17: Future-Dated Transactions & Sync Editing

## Goal
Implement support for future-dated transactions, restrict prematurely showing them in analytics/dashboard summaries until that day arrives, and enable date editing with state-syncing.

## Tasks Completed
- **B-041: Frontend: Future-dated transactions support**
  - Added a Transaction Date input to the quick log form in `index.html` (defaulting to today).
  - Modified `buildTransactionRow` to accept custom dates and dynamically map the transaction month.
  - Filtered out future-dated entries (date > today) in category budget summaries (`categories.js`), analytics month queries (`analytics.js`), and personal settlement reconciliations (`dashboard.js`).
- **B-042: Frontend: Date editing and cache sync**
  - Added a Date input to the interactive edit form.
  - Updated `_handleEditSave` to extract and validate the new date, dynamically update `_allLoadedTransactions` local state to maintain correct lists on filtering, and refresh the DOM view.
  - Enhanced `updateTransactionInCache` in `cache.js` to support moving edited transactions between monthly cache buckets when month-shifting occurs.

## Completed Code & Files
- [index.html](file:///Users/prashant228/Documents/Projects/budget-tracker-app/index.html) — Added Date input to logging form.
- [expense-logger.js](file:///Users/prashant228/Documents/Projects/budget-tracker-app/src/js/expense-logger.js) — Handled Date input on log and edit forms, synchronized `_allLoadedTransactions` on save.
- [cache.js](file:///Users/prashant228/Documents/Projects/budget-tracker-app/src/js/cache.js) — Added month shifting support inside `updateTransactionInCache`.
- [categories.js](file:///Users/prashant228/Documents/Projects/budget-tracker-app/src/js/categories.js) — Excluded future entries in spent aggregation.
- [analytics.js](file:///Users/prashant228/Documents/Projects/budget-tracker-app/src/js/analytics.js) — Excluded future entries in analytics `filterByMonth`.
- [dashboard.js](file:///Users/prashant228/Documents/Projects/budget-tracker-app/src/js/dashboard.js) — Excluded future entries in personal settlements.




