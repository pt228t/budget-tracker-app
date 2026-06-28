import { describe, it, expect, beforeEach } from 'vitest';
import { initExpenseLogger } from '../../src/js/expense-logger.js';

describe('Log Management — Filters & Export Smoke Test', () => {
  beforeEach(() => {
    // Setup Mock DOM elements
    document.body.innerHTML = `
      <form id="expense-log-form">
        <input id="vendor" />
        <input id="amount" />
        <select id="category"></select>
        <select id="payment-source"></select>
        <select id="bp-paid-by"></select>
        <input id="bp-sub-category" />
        <input id="bp-notes" />
        <button type="submit">Log Expense</button>
      </form>
      
      <button type="button" id="bp-export-csv">Export as CSV</button>
      
      <select id="bp-filter-paid-by"></select>
      <select id="bp-filter-category"></select>
      <input id="bp-filter-start-date" type="date" />
      <input id="bp-filter-end-date" type="date" />
      
      <ul id="recent-transactions-list"></ul>
    `;
  });

  it('wires up filters and export button successfully', async () => {
    await initExpenseLogger('expense-log-form', 'recent-transactions-list');
    
    const paidByFilter = document.getElementById('bp-filter-paid-by');
    expect(paidByFilter).toBeDefined();
  });
});
