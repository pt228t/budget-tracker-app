# Sprint 13: Log Management (Advanced Filters & CSV Export)

## Goal
Implement historical log management in the Expense Log view, including advanced filters by person, category, and date range (B-030), and CSV export capability (B-033) for full data portability.

## Tasks
- [ ] **B-030: Advanced log filtering**
  - Add filter controls (Paid by dropdown, Category dropdown, Start/End date inputs) to the Recent Transactions list in the UI.
  - Implement client-side filtering logic to filter transactions dynamically as input changes.
- [ ] **B-033: CSV Data Export**
  - Add an "Export as CSV" button next to the transaction log header.
  - Implement client-side CSV builder that serializes the currently loaded/filtered transactions and downloads them as a `.csv` file.
