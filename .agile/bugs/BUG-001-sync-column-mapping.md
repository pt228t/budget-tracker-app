# Bug Tracker — BudgetPulse

**Product Owner:** Prashant  
**Last Updated:** 2026-06-22

---

## Bug Status Legend

| Status | Meaning |
|--------|---------|
| `OPEN` | Reported, not yet assigned |
| `IN PROGRESS` | Being actively worked on |
| `FIXED` | Code fix committed, pending verification |
| `VERIFIED` | Manually tested and confirmed resolved |
| `WONT FIX` | Acknowledged, decision made not to fix |
| `DUPLICATE` | Duplicate of another bug |

## Severity Legend

| Severity | Meaning |
|----------|---------|
| 🔴 **P0 — Critical** | Data loss, sync broken, auth broken — blocks core workflow |
| 🟠 **P1 — High** | Feature incorrect / wrong data shown — needs fix before release |
| 🟡 **P2 — Medium** | Degraded UX, visual glitch — can ship, fix soon |
| 🟢 **P3 — Low** | Minor cosmetic or edge case |

---

## Open Bugs

| ID | Severity | Title | Component | Reported | Status |
|----|----------|-------|-----------|----------|--------|
| BUG-001 | 🔴 P0 | Sync reads wrong column for `monthly_amount` — budget sheet gets 0 data from joint-spend | Apps Script / Sync | 2026-06-22 | `FIXED` |

---

## Bug Details

---

### BUG-001 — Sync reads wrong column; budget sheet receives no data from joint-spend Recurring_Items

**Severity:** 🔴 P0 — Critical  
**Component:** `scripts/apps-script/Sync.gs` → `_readRecurringItems()`  
**Related Backlog Items:** B-002 (Budget sync Apps Script), B-003 (Daily sync trigger)  
**Reported:** 2026-06-22  
**Status:** `FIXED`

---

#### Problem Description

Despite B-003 being marked `DONE` (daily trigger in place), the BudgetPulse
`Budget_Categories` tab was receiving **no data** from the joint-spend sheet's
`Recurring_Items` tab. The sync ran silently without errors but produced 0 rows.

---

#### Root Cause

`_readRecurringItems()` in `Sync.gs` was reading **only 2 columns (A & B)**:

```js
// ❌ BEFORE — reads only cols A and B
var data = sourceSheet.getRange(2, 1, lastRow - 1, 2).getValues();
var amount = Number(data[i][1]);   // data[i][1] = Col B = category string → NaN → every row skipped
```

But the actual joint-spend `Recurring_Items` schema has **9 columns**:

| Col | Index | Header | Used by sync? |
|-----|-------|--------|---------------|
| A | 0 | `item` | ✅ name — correct |
| B | 1 | `category` | ❌ was wrongly read as `amount` |
| C | 2 | `monthly_amount` | ❌ was never read |
| D | 3 | `default_owner` | — |
| E | 4 | `split_rule` | — |
| F | 5 | `active_status` | ❌ was never filtered |
| G | 6 | `start_month` | — |
| H | 7 | `end_month` | — |
| I | 8 | `notes` | — |

The code read `data[i][1]` (Col B = `category`) as the amount.  
`Number("Groceries")` → `NaN` → the guard `!isNaN(amount) && amount > 0` dropped **every single row**.

**Result:** `sourceItems` was always an empty array → nothing was written to `Budget_Categories`.

A secondary issue: even if the amount column had been correct, **Inactive** recurring
items (`active_status !== 'Active'`) would have been imported, inflating the budget total.

---

#### Fix Applied

File: `scripts/apps-script/Sync.gs` — function `_readRecurringItems()`

```diff
- var data = sourceSheet.getRange(2, 1, lastRow - 1, 2).getValues();
+ // Read cols A–F (6 columns): item, category, monthly_amount, default_owner, split_rule, active_status
+ var data = sourceSheet.getRange(2, 1, lastRow - 1, 6).getValues();

  for (var i = 0; i < data.length; i++) {
-   var name   = String(data[i][0]).trim();
-   var amount = Number(data[i][1]);          // ❌ Col B = category string
-   if (name && !isNaN(amount) && amount > 0) {
+   var name         = String(data[i][0]).trim();   // Col A: item
+   var amount       = Number(data[i][2]);           // ✅ Col C: monthly_amount
+   var activeStatus = String(data[i][5]).trim();    // Col F: active_status
+
+   // Only include Active rows with a valid name and positive amount
+   if (name && !isNaN(amount) && amount > 0 && activeStatus === 'Active') {
      items.push({ name: name, amount: amount });
    }
  }
```

---

#### Verification Steps

After deploying the fix to Google Apps Script:

1. Open BudgetPulse Google Sheet.
2. Run **Menu → BudgetPulse → Sync Budget Categories** (manual trigger).
3. Check `Budget_Categories` tab — rows should now appear matching the Active items in joint-spend `Recurring_Items`.
4. Confirm `active_status` filter: any `Inactive` row in joint-spend should **not** appear in `Budget_Categories`.
5. Check Apps Script execution log: look for `Recurring_Items read: N items from joint-spend` where **N > 0**.

---

#### Why B-003 Was Marked DONE Prematurely

The trigger was set up correctly (B-003 goal = trigger setup). However, no end-to-end
integration test existed to verify **actual data flow** from source to destination.
The DoD for B-002/B-003 should have included:

> - [ ] `Budget_Categories` tab is non-empty after sync runs against a real or mock joint-spend sheet with a 9-column `Recurring_Items` schema

This is now captured as a **Definition of Done gap**.

---

#### Follow-up Actions

| # | Action | Owner | Priority |
|---|--------|-------|----------|
| 1 | Deploy fix to Apps Script editor (copy-paste updated `Sync.gs`) | Prashant | P0 |
| 2 | Run manual sync and verify `Budget_Categories` is populated | Prashant | P0 |
| 3 | Add integration test: mock 9-column joint-spend `Recurring_Items` schema | Dev | P1 |
| 4 | Add `active_status` filter check to `Sync.gs` unit tests | Dev | P1 |
| 5 | Update B-002 DoD: require end-to-end data flow verification | PM | P2 |

---

*Bug filed by: Antigravity (AGY) — 2026-06-22*
