# Product Backlog — BudgetPulse

**Last Updated:** 2026-06-22 (Sprints 1-5 complete, auth integrated)

---

## Milestones

| Milestone | Phase | Target | Description |
|-----------|-------|--------|-------------|
| **M1: Foundation** | Phase 1 | Sprint 1-2 | Project setup, Google Sheet creation, budget sync, basic UI shell |
| **M2: Core Tracking** | Phase 1 | Sprint 3-4 | Expense logging, basic dashboard, category management |
| **M3: Analytics** | Phase 2 | Sprint 5-6 | Charts, sub-categories, vendor suggestions, budget health |
| **M4: Notifications** | Phase 3 | Sprint 7-8 | Email reminders, weekly/monthly reports, threshold alerts |
| **M5: Polish** | Phase 4 | Sprint 9-10 | Multi-user auth hardening, advanced analytics, UX polish |

---

## Backlog (Prioritized)

### 🔴 P0 — Must Have (MVP)

| ID | Story | Epic | Milestone | Sprint | Status |
|----|-------|------|-----------|--------|--------|
| B-001 | Create BudgetPulse Google Sheet with all tabs + schema | Setup | M1 | S1 | `DONE` |
| B-002 | Apps Script: Budget sync from joint-spend Recurring_Items | Sync | M1 | S1 | `DONE` |
| B-003 | Apps Script: Daily sync trigger setup | Sync | M1 | S1 | `DONE` |
| B-004 | Frontend: Project scaffold (HTML/CSS/JS structure) | Setup | M1 | S1 | `DONE` |
| B-005 | Frontend: Google OAuth sign-in flow | Auth | M1 | S2 | `DONE` |
| B-006 | Frontend: Sheets API wrapper (read/write) | Infra | M1 | S2 | `DONE` |
| B-007 | Frontend: Expense logging form (quick-add) | Logging | M2 | S3 | `DONE` |
| B-008 | Frontend: Category dropdown (from Budget_Categories) | Logging | M2 | S3 | `DONE` |
| B-009 | Frontend: Recent transactions list (current month) | Logging | M2 | S3 | `DONE` |
| B-010 | Frontend: Dashboard summary cards | Dashboard | M2 | S4 | `DONE` |
| B-011 | Frontend: Per-category budget health bars | Dashboard | M2 | S4 | `DONE` |
| B-012 | Frontend: Pool health indicator (net position) | Dashboard | M2 | S4 | `DONE` |

### 🟡 P1 — Should Have

| ID | Story | Epic | Milestone | Sprint | Status |
|----|-------|------|-----------|--------|--------|
| B-013 | Frontend: Category donut chart (Chart.js) | Analytics | M3 | S4 | `DONE` |
| B-014 | Frontend: Budget vs Actual bar chart | Analytics | M3 | S4 | `DONE` |
| B-015 | Frontend: Top 5 expenses table | Analytics | M3 | S4 | `DONE` |
| B-016 | Frontend: Sub-category tagging in expense form | Logging | M3 | S5 | `DONE` |
| B-017 | Vendor pattern suggestion engine | Logging | M3 | S6 | `DONE` |
| B-018 | Frontend: Edit/delete transactions | Logging | M3 | S6 | `DONE` |
| B-019 | Frontend: Month-over-month comparison | Analytics | M3 | S6 | `TODO` |
| B-020 | Frontend: Top 5 expenses table | Analytics | M3 | S6 | `TODO` |
| B-021 | Apps Script: Weekly summary email (Sunday) | Notifications | M4 | S7 | `DONE` |
| B-022 | Apps Script: 80% budget threshold alert | Notifications | M4 | S7 | `DONE` |
| B-023 | Apps Script: Monthly report (1st of month) | Notifications | M4 | S7 | `DONE` |
| B-024 | Apps Script: 48-hour no-log reminder | Notifications | M4 | S8 | `DONE` |
| B-025 | Frontend: Personal payment tracking (overflow) | Tracking | M4 | S8 | `TODO` |
| B-026 | Frontend: Month-end personal payment summary | Tracking | M4 | S8 | `TODO` |

### 🟢 P2 — Nice to Have

| ID | Story | Epic | Milestone | Sprint | Status |
|----|-------|------|-----------|--------|--------|
| B-027 | Frontend: Day-of-week spending heatmap | Analytics | M5 | S9 | `TODO` |
| B-028 | Frontend: Person-wise spending split chart | Analytics | M5 | S9 | `TODO` |
| B-029 | Apps Script: Recurring payment reminder (3 days before) | Notifications | M5 | S9 | `TODO` |
| B-030 | Frontend: Advanced filters (by person, category, date range) | Analytics | M5 | S9 | `TODO` |
| B-031 | Frontend: Manual sync trigger button | Sync | M5 | S10 | `TODO` |
| B-032 | Frontend: Settings page (config management) | Settings | M5 | S10 | `TODO` |
| B-038 | Frontend: Admin console to manage authorized users (UI) | Auth | M5 | S10 | `DONE` |
| B-039 | Frontend: Detect stale/wrong bound spreadsheet and prompt rebind | Auth/Setup | M5 | S10 | `TODO` |
| B-033 | Frontend: Export data as CSV | Export | M5 | S10 | `TODO` |
| B-034 | Frontend: Dark mode toggle | UX | M5 | S10 | `TODO` |
| B-035 | Foreign currency support (INR primary) | Feature | Future | - | `TODO` |
| B-036 | CSV bank statement import | Feature | Future | - | `TODO` |

---

## Sprint Plan

### Sprint 1: Foundation (Week 1)
**Goal:** Sheets backend ready, sync working, project scaffold deployed.

| ID | Task | Est (hrs) |
|----|------|-----------|
| B-001 | Create Google Sheet + schema | 2 |
| B-002 | Budget sync Apps Script | 4 |
| B-003 | Daily sync trigger | 1 |
| B-004 | Frontend scaffold + design system | 4 |
| - | Create GitHub repo (`gh repo create`) | 0.5 |
| - | Set GitHub Variable (`gh variable set`) | 0.5 |
| - | Deploy to GitHub Pages | 1 |
| - | README + setup docs | 1 |
| B-004a | Setup Vitest & Playwright scaffolding | 2 |
| B-004b | Setup Apps Script Node.js local test mocks | 2 |

**Definition of Done:**
- [x] BudgetPulse Google Sheet exists with all tabs and headers (AGY setup.js auto-bootstraps on first load)
- [ ] Sync trigger reads Recurring_Items and populates Budget_Categories
- [x] Frontend scaffold build + deploy workflow prepared for GitHub Pages (login shell)
- [x] Design tokens (CSS variables) defined
- [x] README + local setup docs added for scaffold work
- [x] Codex parallel-task scaffold files completed (`index.html`, `app.js`, `utils.js`)
- [x] Vitest, Playwright, and Apps Script mock sample tests added

### Sprint 2: Auth + API Layer (Week 2)
**Goal:** Users can sign in and the app can read/write to Sheets.

| ID | Task | Est (hrs) |
|----|------|-----------|
| B-005 | Google OAuth implementation | 4 |
| B-006 | Sheets API wrapper | 4 |
| - | Caching layer (sessionStorage/localStorage) | 2 |
| - | Error handling + offline queue | 2 |

**Definition of Done:**
- [x] Sign in with Google works (AGY auth.js complete, wired by Codex)
- [x] App reads Budget_Categories and displays them (Codex categories.js + Claude sheets-api.js)
- [x] App can write a test row to Transactions (Claude sheets-api.js appendRow)
- [x] Unauthorized users see "access denied" (AGY auth.js gate)

### Sprint 3: Expense Logging (Week 3)
**Goal:** Users can log expenses fast.

| ID | Task | Est (hrs) |
|----|------|-----------|
| B-007 | Expense form UI | 4 |
| B-008 | Category dropdown | 2 |
| B-009 | Recent transactions list | 3 |
| - | Form validation + submission | 2 |
| - | Optimistic UI updates | 2 |

**Definition of Done:**
- [x] User can log expense in < 10 seconds (via `expense-logger.js`)
- [x] Category dropdown shows synced categories (Codex categories.js complete)
- [x] Recent transactions list shows current month entries (via `expense-logger.js`)
- [x] Mobile responsive (AGY CSS design system)

### Sprint 4: Dashboard (Week 4)
**Goal:** Beautiful dashboard with budget health.

| ID | Task | Est (hrs) |
|----|------|-----------|
| B-010 | Summary cards | 3 |
| B-011 | Category health bars | 3 |
| B-037 | Frontend: Empty/loading states | Dashboard | M2 | S4 | `DONE` |
| B-013 | Frontend: Donut chart | Analytics | M3 | S4 | `DONE` |
| B-014 | Frontend: Bar chart | Analytics | M3 | S4 | `DONE` |
| B-015 | Frontend: Top 5 table | Analytics | M3 | S4 | `DONE` |

**Definition of Done (Sprint 4):**
- [x] Summary cards calculate correct totals
- [x] Category health bars render with accurate color coding
- [x] Charts render correctly if data exists
- [x] Pool health shows net surplus/shortfall
- [x] Dashboard empty states implemented (hide preview data if sheet is 0 rows)
- [x] Beautiful, polished design

---

## Velocity Tracking

| Sprint | Planned | Completed | Velocity | Notes |
|--------|---------|-----------|----------|-------|
| S1 | - | - | - | Not started |
| S2 | - | - | - | - |
| S3 | - | - | - | - |
| S4 | - | - | - | - |
| S5 | - | - | - | Complete |

### Sprint 5: Refinement & Advanced Tracking (Week 5)
**Goal:** Finalize CRUD (Edit/Delete) and polish empty states.

| ID | Task | Est (hrs) |
|----|------|-----------|
| B-037 | Dashboard empty/loading states | 2 |
| B-018 | Edit/delete transactions | 4 |
| B-016 | Sub-category tagging | 2 |
| B-017 | Vendor suggestion engine | 2 |

**Definition of Done:**
- [x] Users can delete a transaction they logged by mistake.
- [x] Users can edit existing transactions.
- [x] Empty state replaces preview UI when data is empty.
- [x] Sub-categories and vendor suggestions implemented.

---

## Definition of Ready (for any backlog item)
- [ ] User story written with acceptance criteria
- [ ] Data model changes identified
- [ ] UI mockup/wireframe exists (if frontend)
- [ ] Dependencies identified

## Definition of Done (for any backlog item)
- [ ] Unit and/or E2E tests written (TDD approach)
- [ ] All automated tests pass (Green state)
- [ ] Code written and working
- [ ] Manually tested on Chrome + Safari (mobile + desktop)
- [ ] No console errors
- [ ] Responsive on mobile
- [ ] Documentation updated if needed

---

## Bug Tracker & Tech Debt

| ID | Issue | Impact | Status | Resolution |
|----|-------|--------|--------|------------|
| BUG-001 | Sync.gs mapping `monthly_amount` to incorrect column index | AppScript Sync | `DONE` | Fixed column mapping and added unit tests in `sync.test.js`. |
| BUG-002 | `clasp push` CI failure with GCP Service Account | CI/CD | `DONE` | Pivoted to Refresh Token auth approach; updated GitHub Actions. |
| BUG-003 | Daily sync trigger (B-003) missing programmatic setup | Automation | `DONE` | Added `Triggers.gs` to create custom sheet menu for one-click installation. |
