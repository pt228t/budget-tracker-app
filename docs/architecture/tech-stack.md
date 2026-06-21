# Tech Stack — BudgetPulse

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                    FRONTEND                          │
│           (GitHub Pages — Free Hosting)              │
│                                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │ Expense  │  │ Dashboard│  │  Analytics        │  │
│  │ Logger   │  │ Summary  │  │  Charts & Reports │  │
│  └────┬─────┘  └────┬─────┘  └────────┬─────────┘  │
│       │              │                 │             │
│       └──────────────┼─────────────────┘             │
│                      │                               │
│              Google OAuth 2.0                        │
│              (Client-side auth)                      │
└──────────────────────┬───────────────────────────────┘
                       │ HTTPS (Google Sheets API v4)
                       │
┌──────────────────────┴───────────────────────────────┐
│                   BACKEND                             │
│          (Google Sheets — Free)                       │
│                                                      │
│  ┌──────────────────────────────────────────────┐    │
│  │        BudgetPulse Workbook                   │    │
│  │  Budget_Categories | Transactions | History   │    │
│  │  Sub_Categories | Vendor_Patterns | Config    │    │
│  │  Notification_Log                             │    │
│  └──────────────────────────────────────────────┘    │
│                                                      │
│  ┌──────────────────────────────────────────────┐    │
│  │        Apps Script (bound to workbook)         │    │
│  │  • Budget Sync Trigger (daily)                │    │
│  │  • Email Notifications (weekly/monthly/alert) │    │
│  │  • Budget Threshold Monitor                   │    │
│  └──────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────┘
                       │
                       │ Apps Script reads
                       ▼
┌──────────────────────────────────────────────────────┐
│            SOURCE DATA                                │
│    joint-spend-automation Google Sheet                │
│    (Recurring_Items tab)                             │
└──────────────────────────────────────────────────────┘
```

---

## Technology Choices

### Frontend

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| **Framework** | Vanilla JS (ES Modules) | Zero build step, deploys directly to GitHub Pages. No React/Vue overhead for what's essentially a CRUD + charts app. |
| **Styling** | Vanilla CSS with CSS Custom Properties | Full control over design system. Modern features (container queries, nesting) sufficient. |
| **Charts** | [Chart.js](https://www.chartjs.org/) v4 | Free, beautiful, interactive. Donut, bar, line, heatmap. CDN-loaded. |
| **Icons** | [Lucide Icons](https://lucide.dev/) | Modern, lightweight SVG icon set. CDN. |
| **Fonts** | Inter (Google Fonts) | Clean, modern, excellent readability. |
| **Hosting** | GitHub Pages | Free, HTTPS, custom domain support, >99.9% uptime. |
| **Auth** | Google Identity Services (GIS) | Client-side OAuth 2.0 for Sheets API. No backend needed. |

**Why not React/Vue/Svelte?**  
- App is essentially: login → log expense → view dashboard → view analytics  
- No complex state management needed  
- Vanilla JS with ES Modules keeps it simple, fast, zero-config  
- Can always migrate to a framework later if complexity grows  

### Backend (Google Sheets + Apps Script)

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| **Database** | Google Sheets API v4 | Free, familiar, direct integration with joint-spend. 300 req/min free tier. |
| **Server Logic** | Google Apps Script | Free cron triggers, free email (100/day), reads joint-spend sheet natively. |
| **Auth** | Google OAuth 2.0 | Built-in with Sheets API. Scopes: `spreadsheets` (read/write). |

**Why Google Sheets over Supabase/Firebase?**
1. ₹0 cost — no risk of hitting paid tier
2. Direct read access to `joint-spend-automation` Recurring_Items (same Google ecosystem)
3. Apps Script triggers = free cron for reminders (no external scheduler)
4. Both users already have Google accounts
5. Data exportable anytime (CSV, XLSX)

### Automation Layer

| Component | Technology | Schedule |
|-----------|-----------|----------|
| **Budget Sync** | Apps Script time-based trigger | Daily at 00:30 IST |
| **Weekly Summary** | Apps Script time-based trigger | Every Sunday 09:00 IST |
| **Monthly Report** | Apps Script time-based trigger | 1st of month 09:00 IST |
| **Budget Alerts** | Apps Script (runs after each transaction via API webhook pattern) | On-demand after writes |
| **No-Log Reminder** | Apps Script time-based trigger | Daily at 20:00 IST (checks last log timestamp) |
| **Emails** | Gmail via Apps Script `MailApp` | Up to 100/day free |

---

## Testing & TDD Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| **Unit Testing (Frontend)** | Vitest + Testing Library | Fast, native ESM support, tests components in isolation. |
| **E2E / Integration** | Playwright | Robust browser automation, tests UI flows + API proxy endpoints together. |
| **Apps Script Unit** | Node.js + Local Mocks | Same pattern as `joint-spend-automation`. Tests logic without live Sheets API calls. |
| **Workflow** | TDD | Red-Green-Refactor approach. Write failing test first, then implement. |

---

## API Design (Frontend → Google Sheets)

All data operations use **Google Sheets API v4** directly from the browser:

### Read Operations
```
GET spreadsheets/{sheetId}/values/Transactions!A:M
GET spreadsheets/{sheetId}/values/Budget_Categories!A:H
GET spreadsheets/{sheetId}/values/Budget_History!A:E
GET spreadsheets/{sheetId}/values/Sub_Categories!A:E
GET spreadsheets/{sheetId}/values/Vendor_Patterns!A:E
```

### Write Operations
```
POST spreadsheets/{sheetId}/values/Transactions!A:M:append
PUT  spreadsheets/{sheetId}/values/Transactions!A{row}:M{row}
```

### Caching Strategy
- **Budget_Categories**: Cache in `sessionStorage`, refresh on page load
- **Transactions**: Cache current month in memory, paginate for history
- **Sub_Categories**: Cache in `sessionStorage`
- **Vendor_Patterns**: Cache in `localStorage` (persists across sessions)

---

## Security Model

| Concern | Solution |
|---------|----------|
| Authentication | Google OAuth 2.0 (client-side) |
| Authorization | `App_Config.allowed_users` check in Apps Script |
| Data in transit | HTTPS (enforced by GitHub Pages + Google API) |
| Data at rest | Google's infrastructure encryption |
| API key exposure | OAuth token (no API key in frontend) — token is per-user, per-session |
| Sheet ID config | Stored in GitHub Action Variables, injected at build time. Never committed to repo. |
| Sheet access | Sheet shared only with allowed users |

---

## Performance Budget

| Metric | Target | Strategy |
|--------|--------|----------|
| Initial page load | < 2s | Minimal JS, CDN for libs, no framework bundle |
| Expense logging | < 1.5s | Direct Sheets API append, optimistic UI |
| Dashboard render | < 2s | Cached category data, current month transactions only |
| Analytics page | < 3s | Lazy-load charts, aggregate data client-side |
| Sheets API calls | < 50/page load | Batch reads, smart caching |

---

## Deployment Pipeline

```
Local Development
    │
    ├── Edit HTML/CSS/JS files
    ├── Test locally (Live Server / python -m http.server)
    │
    git push → GitHub Actions (CI/CD)
    │
    ├── Reads GOOGLE_SHEET_ID from GitHub Variables
    ├── Injects into frontend config.js
    └── Deploys artifact to GitHub Pages
    │
Apps Script Deployment (separate)
    │
    ├── Edit .gs files locally
    ├── Copy to Apps Script editor (or use clasp CLI)
    └── Deploy as bound script to BudgetPulse Sheet
```

---

## Folder Structure

```
budget-tracker-app/
├── docs/
│   ├── requirements/
│   │   └── PRD.md                    # Product Requirements Document
│   ├── architecture/
│   │   ├── data-model.md             # Google Sheets schema
│   │   ├── tech-stack.md             # This file
│   │   └── system-architecture.md    # Diagrams & flow
│   └── design/
│       ├── ui-wireframes.md          # UI layout specs
│       └── notification-templates.md # Email template designs
├── src/
│   ├── index.html                    # Main app page
│   ├── css/
│   │   ├── variables.css             # Design tokens
│   │   ├── base.css                  # Reset & base styles
│   │   ├── components.css            # Component styles
│   │   └── responsive.css            # Mobile breakpoints
│   ├── js/
│   │   ├── app.js                    # App initialization
│   │   ├── auth.js                   # Google OAuth
│   │   ├── sheets-api.js             # Sheets API wrapper
│   │   ├── expense-logger.js         # Expense form logic
│   │   ├── dashboard.js              # Dashboard rendering
│   │   ├── analytics.js              # Charts & analytics
│   │   ├── categories.js             # Category management
│   │   └── utils.js                  # Helpers
│   └── assets/
│       └── icons/                    # Custom icons if needed
├── scripts/
│   └── apps-script/
│       ├── Config.gs                 # Sheet names, config
│       ├── Sync.gs                   # Budget sync from joint-spend
│       ├── Notifications.gs          # Email triggers
│       ├── Alerts.gs                 # Budget threshold monitoring
│       └── Helpers.gs                # Utility functions
├── .agile/
│   ├── backlog/
│   │   └── product-backlog.md        # Full backlog
│   └── sprints/
│       └── sprint-1.md               # Current sprint
└── README.md                         # Project overview
```
## B-004 Scaffold Tooling Notes

- Static app shell: vanilla HTML, CSS, and JavaScript
- Local dev/build tooling: Vite
- Unit test scaffolding: Vitest with `jsdom`
- Browser smoke test scaffolding: Playwright
- Deployment target: GitHub Pages via workflow-based static artifact deployment

This keeps the production app static while still giving the project a reproducible local build and test loop.
