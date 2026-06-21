# User Stories — BudgetPulse

---

## Epic 1: Budget Setup & Sync

### US-1.1: Auto-sync budget categories
**As a** user  
**I want** budget categories to automatically sync from my joint-spend Recurring_Items  
**So that** I don't have to manually set up and maintain budget limits in two places  

**Acceptance Criteria:**
- [ ] Daily sync trigger reads all Active items from Recurring_Items
- [ ] New items create new Budget_Categories entries
- [ ] Changed amounts update existing entries
- [ ] Removed items get archived (not deleted)
- [ ] Budget_History records the amount per category per month
- [ ] Historical months are not modified when current month changes

### US-1.2: Manual category creation
**As a** user  
**I want** to create custom budget categories not in Recurring_Items  
**So that** I can track personal or ad-hoc expenses too  

**Acceptance Criteria:**
- [ ] Can create category with name and monthly budget
- [ ] Category marked as source=manual
- [ ] Not affected by sync (won't be archived)
- [ ] Shows alongside synced categories in UI

---

## Epic 2: Expense Logging

### US-2.1: Quick expense entry
**As a** user  
**I want** to log an expense in under 10 seconds  
**So that** I actually do it daily without friction  

**Acceptance Criteria:**
- [ ] Form shows: amount (required), category (required), description (optional), sub-category (optional)
- [ ] Category dropdown pre-populated from Budget_Categories
- [ ] Date defaults to today, can be changed
- [ ] Paid_by defaults to logged-in user
- [ ] Funding_source defaults to Joint
- [ ] Submit creates Transactions row via Sheets API
- [ ] Success toast shown, form resets

### US-2.2: Category auto-suggestion
**As a** user  
**I want** the app to suggest a category based on my description  
**So that** I can log faster by just confirming instead of selecting  

**Acceptance Criteria:**
- [ ] When description is typed, check Vendor_Patterns for keyword match
- [ ] If match found, auto-select that category (user can override)
- [ ] After submit, update Vendor_Patterns with the chosen mapping
- [ ] Patterns stored in localStorage for instant lookup

### US-2.3: Sub-category tagging
**As a** user  
**I want** to optionally tag expenses with a sub-category  
**So that** I can see granular analytics (e.g., "Vegetables" under "Grocery")  

**Acceptance Criteria:**
- [ ] Sub-category field is optional
- [ ] Shows existing sub-categories for selected category as suggestions
- [ ] Can type a new sub-category (auto-creates)
- [ ] Analytics can group/filter by sub-category

### US-2.4: Edit/delete transactions
**As a** user  
**I want** to correct or remove mistaken entries  
**So that** my data stays accurate  

**Acceptance Criteria:**
- [ ] Recent transactions list shows on logging page
- [ ] Click to edit → pre-filled form
- [ ] Delete with confirmation
- [ ] modified_at timestamp updated on edit

---

## Epic 3: Dashboard

### US-3.1: Budget health overview
**As a** user  
**I want** to see at a glance how my budget is doing this month  
**So that** I know if I need to cut spending  

**Acceptance Criteria:**
- [ ] Summary cards: Total Budget, Total Spent, Remaining, Savings Rate %
- [ ] Per-category progress bars with color coding (green/amber/red/critical)
- [ ] Pool health indicator: net surplus or shortfall
- [ ] Overspend attribution: which categories are over and which compensate

### US-3.2: Category donut chart
**As a** user  
**I want** a visual breakdown of where my money went  
**So that** I can quickly identify top spending areas  

**Acceptance Criteria:**
- [ ] Interactive donut chart (Chart.js)
- [ ] Click segment → shows sub-category breakdown
- [ ] Hover shows amount and percentage
- [ ] Legend with category names and totals

### US-3.3: Budget vs Actual bars
**As a** user  
**I want** to compare my actual spending against budget per category  
**So that** I can see exactly which areas are over/under  

**Acceptance Criteria:**
- [ ] Horizontal bar chart, one bar per category
- [ ] Shows budget line and actual fill
- [ ] Color: green (< 60%), amber (60-80%), red (> 80%), critical (> 100%)
- [ ] Sorted by utilization % (worst first)

---

## Epic 4: Analytics

### US-4.1: Monthly trend line
**As a** user  
**I want** to see my spending trends over the last 6 months  
**So that** I can identify patterns and seasonal changes  

**Acceptance Criteria:**
- [ ] Line chart with monthly total spending
- [ ] Optional: stacked area by category
- [ ] Shows budget line for comparison
- [ ] Click a month → jump to that month's detail

### US-4.2: Top expenses table
**As a** user  
**I want** to see my biggest individual transactions  
**So that** I can spot outliers or unnecessary large purchases  

**Acceptance Criteria:**
- [ ] Table: date, description, category, amount, paid_by
- [ ] Sorted by amount (highest first)
- [ ] Top 5 by default, expandable to top 20
- [ ] Filterable by month

### US-4.3: Month-over-month comparison
**As a** user  
**I want** to compare this month's spending against last month  
**So that** I can see if I'm improving  

**Acceptance Criteria:**
- [ ] Per-category comparison: this month vs last month
- [ ] Delta shown as amount and percentage
- [ ] Visual indicator: up arrow (spent more) or down arrow (spent less)
- [ ] Total comparison at the bottom

### US-4.4: Day-of-week heatmap
**As a** user  
**I want** to see when I spend the most during the week  
**So that** I can adjust my habits  

**Acceptance Criteria:**
- [ ] Heatmap grid: 7 columns (Mon-Sun) × N weeks
- [ ] Color intensity = spending amount
- [ ] Tooltip shows total for that day
- [ ] Summary: "You spend most on Saturdays"

### US-4.5: Person-wise spending split
**As a** user  
**I want** to see who paid what from personal accounts  
**So that** I have a clear view for settlement discussions  

**Acceptance Criteria:**
- [ ] Bar chart: personal payments per person
- [ ] Table breakdown: category, amount, date per personal payment
- [ ] Monthly summary of personal payments per person

---

## Epic 5: Notifications

### US-5.1: Weekly summary email
**As a** user  
**I want** a weekly email every Sunday with my budget status  
**So that** I stay aware even if I don't open the app  

**Acceptance Criteria:**
- [ ] HTML email with: budget health per category, total spent, remaining, top 3 expenses
- [ ] Visual progress bars in email
- [ ] Comparison to previous week
- [ ] Sent to all allowed_users

### US-5.2: Budget threshold alert
**As a** user  
**I want** an email when any category hits 80% of its budget  
**So that** I can slow down spending before it's too late  

**Acceptance Criteria:**
- [ ] Trigger: category spend reaches 80% of budget
- [ ] Email includes: category name, amount spent, budget, remaining
- [ ] Only one alert per category per month (check Notification_Log)
- [ ] Sent to all allowed_users

### US-5.3: Monthly report
**As a** user  
**I want** a comprehensive monthly report on the 1st of each month  
**So that** I can review the previous month's full picture  

**Acceptance Criteria:**
- [ ] Full category breakdown with budget vs actual
- [ ] Month-over-month comparison
- [ ] Personal payment summary per person
- [ ] Pool health summary
- [ ] Top 5 expenses

### US-5.4: No-log reminder
**As a** user  
**I want** a nudge if I haven't logged expenses in 48 hours  
**So that** I don't fall behind on tracking  

**Acceptance Criteria:**
- [ ] Check last transaction timestamp per user
- [ ] If > 48 hours, send reminder email
- [ ] Max 1 reminder per user per 48-hour window
- [ ] Friendly tone: "Hey, you haven't logged expenses in 2 days..."

---

## Epic 6: Multi-User & Auth

### US-6.1: Google sign-in
**As a** user  
**I want** to sign in with my Google account  
**So that** I can access the app securely  

**Acceptance Criteria:**
- [ ] Google OAuth 2.0 sign-in button
- [ ] Only users in App_Config.allowed_users can access
- [ ] Token stored in session, auto-refreshed
- [ ] Sign-out button available

### US-6.2: Shared expense visibility
**As a** user  
**I want** to see all expenses logged by anyone in the group  
**So that** we have full transparency  

**Acceptance Criteria:**
- [ ] All transactions visible to all authorized users
- [ ] Each transaction shows who logged it and who paid
- [ ] No private/hidden transactions (shared everything model)
