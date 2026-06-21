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
*(To be filled during execution)*

## Still Open
- [ ] AGY: Dashboard UI & real data rendering
- [ ] Claude: Expense logger submission logic
- [ ] Codex: Analytics integration
