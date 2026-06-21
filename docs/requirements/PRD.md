# Product Requirements Document (PRD)
# BudgetPulse — Personal & Joint Budget Tracker

**Version:** 1.0  
**Author:** Prashant (Product Owner) + AI Product Engineer  
**Created:** 2026-06-20  
**Status:** Draft — Awaiting Final Approval  

---

## 1. Problem Statement

### Pain Points
1. **No daily expense tracking** — The existing `joint-spend-automation` system handles monthly contribution settlement but doesn't track WHERE money goes within budget categories on a daily basis.
2. **No budget breach visibility** — When a joint budget category (e.g., Grocery ₹8,000/month) is overrun, there's no alert until month-end manual review.
3. **No analytics** — No historical trends, no category-wise breakdown, no month-over-month comparison.
4. **No reminders** — No autonomous system that prompts users to log expenses or warns about budget health.
5. **Free budget apps lack customization** — Can't integrate with existing joint-spend system, can't handle the equal-savings model, and don't support the specific budget categories already established.

### What Exists Today
- `joint-spend-automation`: Google Sheets + Apps Script web app for Prashant & Toshi
- Manages: income, recurring expenses, loans, investments, insurance reserves, protected buckets, subscriptions
- Calculates: equal-savings settlement (cash-to-joint per person)
- Has: dual-approval flow, monthly draft workflow, direct payment tracking
- **Missing:** Daily expense tracking, budget utilization monitoring, analytics, reminders

---

## 2. Product Vision

**BudgetPulse** is a daily expense tracking and budget analytics app that:
- **Sources budget categories** from the existing `Recurring_Items` in the joint-spend Google Sheet
- **Tracks daily spending** against those budgets with intelligent categorization
- **Provides real-time budget health** visibility with beautiful analytics
- **Sends autonomous reminders** (weekly summaries, budget alerts, logging nudges)
- **Handles joint account overspend** with pool-based tracking
- **Supports multi-user** access from day one

---

## 3. Target Users

| Persona | Description |
|---------|-------------|
| **Primary** | Prashant & Toshi — managing joint household budget |
| **Secondary** | Any individual or household wanting structured budget tracking |
| **Future** | Multi-party groups (roommates, families) with shared expenses |

---

## 4. Core Principles

1. **Zero paid hosting** — Must run entirely on free infrastructure
2. **No always-on system** — Cannot depend on user's machine being running
3. **Single source of truth** — Budget limits come from `Recurring_Items` sheet (joint-spend)
4. **Minimal friction** — Expense logging must be fast (< 10 seconds per entry)
5. **Beautiful by default** — Analytics must be visually stunning and insightful
6. **Flexible categorization** — Handle multi-purpose vendors (Amazon = grocery or shopping)

---

## 5. Functional Requirements

### FR-1: Budget Sync Engine
| ID | Requirement | Priority |
|----|------------|----------|
| FR-1.1 | Auto-sync budget categories from `Recurring_Items` sheet in joint-spend workbook | P0 |
| FR-1.2 | Preserve historical budget amounts when categories change | P0 |
| FR-1.3 | Sync runs via Apps Script time-based trigger (daily at midnight) | P0 |
| FR-1.4 | Support manual sync trigger from UI | P1 |
| FR-1.5 | Handle mid-month budget changes (use latest approved value) | P1 |

### FR-2: Expense Logging
| ID | Requirement | Priority |
|----|------------|----------|
| FR-2.1 | Quick-add form: amount + category + optional sub-category + optional note | P0 |
| FR-2.2 | Each transaction records: date, amount, category, sub_category, description, paid_by, funding_source (Joint/Personal), notes | P0 |
| FR-2.3 | Auto-suggest category based on description/vendor patterns learned from past entries | P1 |
| FR-2.4 | Support editing and deleting past transactions | P0 |
| FR-2.5 | Sub-categories are user-defined tags (no budget limit, analytics only) | P1 |
| FR-2.6 | Default funding_source = "Joint" for recurring item categories | P1 |

### FR-3: Budget Health Monitoring
| ID | Requirement | Priority |
|----|------------|----------|
| FR-3.1 | Per-category budget utilization (spent vs budget, percentage, remaining) | P0 |
| FR-3.2 | Visual indicators: green (< 60%), amber (60-80%), red (> 80%), critical (> 100%) | P0 |
| FR-3.3 | Total pool health: sum of all category budgets vs sum of all spending | P0 |
| FR-3.4 | Overspend attribution: show which categories are over and which have surplus | P0 |
| FR-3.5 | Net shortfall/surplus indicator for the joint pool | P1 |

### FR-4: Analytics Dashboard
| ID | Requirement | Priority |
|----|------------|----------|
| FR-4.1 | Summary cards: Total budget, Total spent, Remaining, Savings rate % | P0 |
| FR-4.2 | Category donut/pie chart: interactive, click to see sub-categories | P0 |
| FR-4.3 | Budget vs Actual bar chart per category (color-coded by health) | P0 |
| FR-4.4 | Monthly trend line: spending over last 6 months | P1 |
| FR-4.5 | Day-of-week spending heatmap | P2 |
| FR-4.6 | Top 5 biggest expenses table | P1 |
| FR-4.7 | Month-over-month comparison with delta per category | P1 |
| FR-4.8 | Person-wise spending split (who paid from personal) | P1 |

### FR-5: Reminders & Notifications (via Email)
| ID | Requirement | Priority |
|----|------------|----------|
| FR-5.1 | Weekly summary email (every Sunday): budget health, top categories, trends | P0 |
| FR-5.2 | 80% budget threshold alert: email when any category hits 80% of budget | P0 |
| FR-5.3 | Monthly detailed report (1st of month): full analytics, MoM comparison | P1 |
| FR-5.4 | 48-hour no-logging reminder: nudge if no expense logged in 2 days | P1 |
| FR-5.5 | Recurring payment reminder: 3 days before due date | P2 |

### FR-6: Multi-User Support
| ID | Requirement | Priority |
|----|------------|----------|
| FR-6.1 | Google OAuth authentication | P0 |
| FR-6.2 | All users in a group see all expenses (shared everything model) | P0 |
| FR-6.3 | Track which user logged each transaction | P0 |
| FR-6.4 | Track which user paid (paid_by field) | P0 |

### FR-7: Personal Payment Tracking (Overflow)
| ID | Requirement | Priority |
|----|------------|----------|
| FR-7.1 | When joint budget overflows, allow logging expense as "Personal" funding source | P0 |
| FR-7.2 | Track personal payments per person against joint categories | P0 |
| FR-7.3 | Show summary of personal payments at month-end (for manual entry into joint-spend if needed) | P1 |
| FR-7.4 | No auto-feedback to joint-spend (user enters manually in joint-spend when needed) | P0 |

---

## 6. Non-Functional Requirements

| ID | Requirement | Target |
|----|------------|--------|
| NFR-1 | Page load time | < 3 seconds |
| NFR-2 | Expense logging latency | < 2 seconds |
| NFR-3 | Hosting cost | ₹0 (free tier only) |
| NFR-4 | Data security | Google OAuth, HTTPS, no sensitive data in frontend |
| NFR-5 | Browser support | Chrome, Safari, Firefox (modern versions) |
| NFR-6 | Mobile responsiveness | Fully responsive, touch-optimized |
| NFR-7 | Uptime dependency | Google Sheets API + GitHub Pages (both >99.9%) |
| NFR-8 | Currency | INR primary, foreign currency support in future |
| NFR-9 | Testing Strategy | TDD approach with Unit (Vitest/Node mocks) and E2E (Playwright) |

---

## 7. Out of Scope (v1)

- Bank API integration / account syncing
- Receipt OCR scanning
- CSV/PDF bank statement import
- Push notifications (requires paid service)
- Native mobile app (iOS/Android)
- AI-powered spending predictions
- Automatic feedback to joint-spend sheet
- Foreign currency conversion

---

## 8. Success Metrics

| Metric | Target |
|--------|--------|
| Daily active logging | Both users log expenses ≥ 5 days/week |
| Budget breach detection | 100% of 80%+ categories trigger alerts |
| Weekly email delivery | 100% delivery rate |
| Expense logging speed | < 10 seconds per entry |
| User satisfaction | Both users prefer this over manual tracking |

---

## 9. Dependencies

| Dependency | Type | Risk |
|-----------|------|------|
| `joint-spend-automation` Google Sheet | Data source for Recurring_Items | Low — stable, well-structured |
| Google Sheets API | Backend data store | Low — free tier generous (300 req/min) |
| Google Apps Script | Email notifications + sync triggers | Low — free, reliable |
| GitHub Pages | Static frontend hosting | Low — free, >99.9% uptime |
| Google OAuth | Authentication | Medium — one-time setup complexity |

---

## 10. Assumptions

1. Budget categories map 1:1 to `Recurring_Items` in joint-spend sheet
2. Both users have Google accounts and can authenticate via OAuth
3. The joint-spend Google Sheet structure remains stable
4. Email is an acceptable notification channel (no push notifications needed)
5. Manual expense logging is acceptable (no bank sync)
6. All financial data is in INR for v1
