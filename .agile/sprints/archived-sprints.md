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
