# CLAUDE.md / AGENTS.md — BudgetPulse

---

## ⚠️ MANDATORY: Multi-Agent Coordination

**Before writing ANY code, read [`parallel-tasks.md`](../parallel-tasks.md).**

This project uses 3 parallel agents (AGY, Claude, Codex). That file defines:
- **Which agent owns which files** — never write to another agent's files
- **Phase dependencies** — don't start Phase 2 work until Phase 1 merges
- **Task assignments** — your specific deliverables per phase

**File ownership is strictly enforced. If you touch a file you don't own, you will create merge conflicts.**

---

## Fast Path / Token Discipline

Use the shortest path that can prove the answer.

1. If the target file, test, or error location is already known, open that exact file or run that exact test first.
2. Do not start with broad repo scans when a specific path is already available.
3. If `codebase-memory-mcp` or any discovery MCP fails twice, stop retrying and fall back to direct file reads.
4. If `rtk` compresses code or test output too aggressively, switch immediately to a raw targeted command for that one read.
5. Prefer narrow reads such as `sed -n '120,170p' file` and focused test runs over multi-file searches.
6. For failing tests, use machine-readable output early, such as `vitest --reporter=json`, before repeating full runs.
7. Do not use screenshots or image rendering to read source files unless normal text output is genuinely blocked.
8. Before adding another search step, state the concrete unknown. If there is no concrete unknown, stop searching and edit or test.

---

## Part 1: Coding Guidelines (Karpathy & TDD)

### 1. Test-Driven Development (TDD)
**Red, Green, Refactor.**
- Write the failing test *before* implementing the feature.
- Run the test and verify it fails for the right reason.
- Write the minimal code necessary to make the test pass.
- Clean up and refactor.
- **Frontend Unit:** Vitest + Testing Library.
- **Frontend E2E:** Playwright.
- **Apps Script Unit:** Local Node.js execution with mock classes.

### 2. Think Before Coding
**Don't assume. Don't hide confusion. Surface tradeoffs.**
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.

### 3. Simplicity First
**Minimum code that solves the problem. Nothing speculative.**
- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- Vanilla JS only. Do not add React, Vue, or heavy build steps.

### 4. Surgical Changes
**Touch only what you must. Clean up only your own mess.**
- Don't "improve" adjacent code, comments, or formatting.
- Match existing style, even if you'd do it differently.
- Remove imports/variables/functions that YOUR changes made unused.

### 5. Goal-Driven Execution
**Define success criteria. Loop until verified.**
Transform tasks into verifiable goals using the testing stack.

---

## Part 2: Project Context — BudgetPulse

### What This Is
**BudgetPulse** is a zero-cost daily expense tracker and budget analytics web app for Prashant and Toshi.
- **Frontend:** Vanilla JS + CSS + Chart.js, hosted on GitHub Pages (Public repo).
- **Backend:** Google Sheets API v4 (Private data) + Apps Script proxy.
- **Source of Truth:** Syncs budget categories directly from the `joint-spend-automation` Google Sheet (`Recurring_Items` tab).

### File Map
```
docs/
  requirements/PRD.md               — Rules of the product
  architecture/data-model.md        — Google Sheets schema
  architecture/tech-stack.md        — Tools & dependencies
src/
  index.html                        — Single-page app UI
  css/                              — Vanilla CSS with custom properties
  js/                               — ES Modules for logic (auth, api, ui)
scripts/apps-script/
  Config.gs, Sync.gs, WebApp.gs     — Backend automation & API proxy
tests/
  unit/                             — Vitest specs
  e2e/                              — Playwright specs
  apps-script/                      — Node.js mocks for .gs files
```

### Security Boundaries
- **The frontend repository is PUBLIC.** Never commit passwords, API keys, or sensitive financial data to source code.
- **The data is PRIVATE.** Data lives in a Google Sheet restricted to allowed Google accounts.
- **Authentication:** Users must sign in via Google OAuth 2.0 on the frontend. The `allowed_users` list in `App_Config` determines authorization.

### Data Model & Sync
- **Joint-Spend Sheet ID:** `<JOINT_SPEND_SHEET_ID>` (Stored securely in Apps Script properties, never commit)
- **Budget Sync:** Apps Script runs daily. Reads `Recurring_Items` from joint-spend, writes to `Budget_Categories` in BudgetPulse.
- **Retention:** The main `Transactions` tab only holds the current year's data. Older data is auto-archived into `Transactions_YYYY` tabs.

### Workflows
- **Logging:** Designed to take <10 seconds. Auto-suggests categories based on past `Vendor_Patterns`.
- **Alerts:** Apps Script triggers email alerts when a category hits 80% utilization.
- **Overspend:** joint account pool tracking + tracking when a user pays personally for a joint expense overflow.
