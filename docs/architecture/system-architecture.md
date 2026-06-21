# System Architecture — BudgetPulse

---

## High-Level Architecture Diagram

```mermaid
graph TB
    subgraph "Frontend (GitHub Pages)"
        UI["Web App (HTML/CSS/JS)"]
        AUTH["Google OAuth 2.0"]
        CHARTS["Chart.js Analytics"]
    end

    subgraph "Google Cloud (Free Tier)"
        subgraph "BudgetPulse Workbook"
            CATS["Budget_Categories"]
            TXN["Transactions"]
            HIST["Budget_History"]
            SUBS["Sub_Categories"]
            VP["Vendor_Patterns"]
            CFG["App_Config"]
            NLOG["Notification_Log"]
        end
        
        subgraph "Apps Script Runtime"
            SYNC["Budget Sync Engine"]
            NOTIFY["Email Notifications"]
            ALERT["Threshold Monitor"]
        end
    end

    subgraph "Source Data"
        JSA["joint-spend-automation Sheet"]
        RI["Recurring_Items Tab"]
    end

    UI -->|"Sheets API v4"| TXN
    UI -->|"Read"| CATS
    UI -->|"Read"| HIST
    AUTH -->|"OAuth Token"| UI
    CHARTS -->|"Render"| UI

    SYNC -->|"Daily Read"| RI
    SYNC -->|"Write"| CATS
    SYNC -->|"Write"| HIST
    NOTIFY -->|"Send Email"| GMAIL["Gmail"]
    ALERT -->|"Read"| TXN
    ALERT -->|"Read"| CATS
    ALERT -->|"Trigger"| NOTIFY

    JSA --> RI
```

---

## Data Flow Diagrams

### Flow 1: Budget Sync (Daily)

```mermaid
sequenceDiagram
    participant Trigger as Apps Script Trigger
    participant JSA as Joint-Spend Sheet
    participant BP as BudgetPulse Sheet
    
    Trigger->>JSA: Read Recurring_Items (all active)
    JSA-->>Trigger: Item list with amounts
    Trigger->>BP: Read Budget_Categories
    BP-->>Trigger: Existing categories
    
    alt New item found
        Trigger->>BP: Insert into Budget_Categories
        Trigger->>BP: Insert into Budget_History (current month)
    end
    
    alt Amount changed
        Trigger->>BP: Update Budget_Categories.monthly_budget
        Trigger->>BP: Upsert Budget_History (current month)
    end
    
    alt Item removed from source
        Trigger->>BP: Set active_status = Archived
    end
```

### Flow 2: Expense Logging

```mermaid
sequenceDiagram
    participant User as User (Browser)
    participant UI as Frontend
    participant API as Sheets API
    participant Sheet as Transactions Sheet
    participant VP as Vendor_Patterns

    User->>UI: Enter amount + description
    UI->>VP: Check vendor patterns (localStorage)
    VP-->>UI: Suggest category (if match)
    UI->>User: Show suggested category
    User->>UI: Confirm/change category + submit
    UI->>API: Append row to Transactions
    API->>Sheet: Write transaction
    Sheet-->>API: Success
    API-->>UI: Confirmation
    UI->>VP: Update vendor pattern (localStorage)
    UI->>User: Show success + updated dashboard
```

### Flow 3: Budget Alert

```mermaid
sequenceDiagram
    participant Trigger as Apps Script
    participant TXN as Transactions Sheet
    participant CAT as Budget_Categories
    participant NLOG as Notification_Log
    participant EMAIL as Gmail

    Trigger->>CAT: Read all active categories
    Trigger->>TXN: Read current month transactions
    Trigger->>Trigger: Calculate utilization per category
    
    alt Category >= 80% utilized
        Trigger->>NLOG: Check if alert already sent
        alt Not yet sent
            Trigger->>EMAIL: Send alert email
            Trigger->>NLOG: Log notification
        end
    end
```

### Flow 4: Weekly Summary

```mermaid
sequenceDiagram
    participant Trigger as Sunday 09:00 Trigger
    participant TXN as Transactions
    participant CAT as Budget_Categories
    participant HIST as Budget_History
    participant EMAIL as Gmail

    Trigger->>TXN: Read current month transactions
    Trigger->>CAT: Read budget categories
    Trigger->>HIST: Read budget history (for comparison)
    Trigger->>Trigger: Compute weekly stats
    Note over Trigger: Total spent this week<br/>Category breakdown<br/>Budget health per category<br/>Pool position<br/>Top 5 expenses
    Trigger->>EMAIL: Send formatted HTML email
    Note over EMAIL: Beautiful email with<br/>progress bars, charts,<br/>and actionable insights
```

---

## Component Architecture (Frontend)

```mermaid
graph LR
    subgraph "Pages"
        DASH["Dashboard"]
        LOG["Expense Logger"]
        ANA["Analytics"]
        SET["Settings"]
    end

    subgraph "Services"
        GAUTH["auth.js<br/>Google OAuth"]
        SAPI["sheets-api.js<br/>Sheets Read/Write"]
        CACHE["cache.js<br/>Local Storage"]
    end

    subgraph "Components"
        FORM["ExpenseForm"]
        CARDS["SummaryCards"]
        DONUT["DonutChart"]
        BAR["BudgetBars"]
        TREND["TrendLine"]
        HEAT["Heatmap"]
        TABLE["ExpenseTable"]
    end

    DASH --> CARDS
    DASH --> DONUT
    DASH --> BAR
    LOG --> FORM
    ANA --> TREND
    ANA --> HEAT
    ANA --> TABLE
    ANA --> DONUT
    
    FORM --> SAPI
    CARDS --> SAPI
    SAPI --> GAUTH
    SAPI --> CACHE
```

---

## Authentication Flow

```mermaid
sequenceDiagram
    participant User
    participant App as BudgetPulse Frontend
    participant GIS as Google Identity Services
    participant SAPI as Google Sheets API

    User->>App: Open app
    App->>GIS: Initialize OAuth client
    App->>User: Show "Sign in with Google" button
    User->>GIS: Click sign in
    GIS->>User: Google consent screen
    User->>GIS: Grant spreadsheet access
    GIS-->>App: Access token
    App->>SAPI: Test read (App_Config.allowed_users)
    
    alt User email in allowed_users
        SAPI-->>App: Authorized
        App->>User: Show dashboard
    else
        App->>User: "Access denied" message
    end
```

---

## Notification Architecture

```
Apps Script Triggers (Google's cron)
│
├── Daily 00:30 → Budget Sync Engine
│   └── Reads Recurring_Items → Updates Budget_Categories + Budget_History
│
├── Daily 20:00 → No-Log Reminder Check
│   └── Checks last transaction timestamp per user
│   └── If > 48 hours → Send reminder email
│
├── Every 6 hours → Budget Threshold Monitor
│   └── For each active category:
│       └── If spent/budget >= 80% AND alert not already sent → Email alert
│
├── Sunday 09:00 → Weekly Summary
│   └── Computes: weekly spend, category health, pool position, trends
│   └── Sends HTML email with inline charts
│
└── 1st of Month 09:00 → Monthly Report
    └── Computes: full month analytics, MoM comparison, personal payment summary
    └── Sends comprehensive HTML email
```

---

## Error Handling Strategy

| Error Type | Handling |
|-----------|----------|
| Sheets API rate limit (429) | Exponential backoff (3 retries) |
| Auth token expired | Auto-refresh via GIS |
| Sheet not found | Graceful error message + suggest running setup |
| Network offline | Queue writes in localStorage, sync on reconnect |
| Sync conflict (joint-spend sheet changed structure) | Log error, continue with cached categories |
## Current Frontend Shell

The current local frontend slice is a static shell with three layers:

1. `index.html` as the hosting entry point for GitHub Pages.
2. `src/js/main.js` as the bootstrapping layer.
3. `src/js/app-shell.js` as the initial UI contract for auth, overview, logging, and health placeholders.

This shell does not yet perform OAuth or Sheets reads. Those integrations remain the responsibility of `B-005` and `B-006`.
