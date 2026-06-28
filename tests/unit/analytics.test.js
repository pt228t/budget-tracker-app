import { describe, it, expect, beforeEach } from 'vitest';
import {
  calculateExpensesByCategory,
  calculateBudgetVsActual,
  getTopExpenses,
  filterByMonth,
  renderTopExpensesTable,
  calculateMoMData,
} from '../../src/js/analytics.js';

describe('Analytics Data Transformation', () => {
    it('calculates expenses by category correctly', () => {
        const txRows = [
            // transaction_id, date, month, amount, category_id
            ['tx1', '2023-01-01', 'Jan', '100', 'Cat1'],
            ['tx2', '2023-01-02', 'Jan', '50', 'Cat1'],
            ['tx3', '2023-01-03', 'Jan', '200', 'Cat2'],
        ];
        
        const result = calculateExpensesByCategory(txRows);
        
        expect(result['Cat1']).toBe(150);
        expect(result['Cat2']).toBe(200);
    });

    it('calculates budget vs actual correctly', () => {
        const txRows = [
            ['tx1', '2023-01-01', 'Jan', '100', 'Cat1'],
        ];
        
        const catRows = [
            // category_id, category_name, monthly_budget
            ['Cat1', 'Food', '500'],
            ['Cat2', 'Rent', '1000'],
        ];
        
        const result = calculateBudgetVsActual(txRows, catRows);
        
        expect(result.length).toBe(2);
        
        expect(result[0].id).toBe('Cat1');
        expect(result[0].name).toBe('Food');
        expect(result[0].budget).toBe(500);
        expect(result[0].actual).toBe(100);
        
        expect(result[1].id).toBe('Cat2');
        expect(result[1].name).toBe('Rent');
        expect(result[1].budget).toBe(1000);
        expect(result[1].actual).toBe(0);
    });

    it('gets top 5 expenses sorted by amount descending', () => {
        const txRows = [
            // transaction_id, date, month, amount, category_id, sub_category, description
            ['tx1', '2023-01-01', 'Jan', '10', 'Cat1', '', 'Desc 1'],
            ['tx2', '2023-01-02', 'Jan', '50', 'Cat1', '', 'Desc 2'],
            ['tx3', '2023-01-03', 'Jan', '100', 'Cat2', '', 'Desc 3'],
            ['tx4', '2023-01-04', 'Jan', '200', 'Cat1', '', 'Desc 4'],
            ['tx5', '2023-01-05', 'Jan', '5', 'Cat1', '', 'Desc 5'],
            ['tx6', '2023-01-06', 'Jan', '300', 'Cat2', '', 'Desc 6'],
        ];
        
        const result = getTopExpenses(txRows);
        
        expect(result.length).toBe(5);
        expect(result[0].amount).toBe(300);
        expect(result[0].description).toBe('Desc 6');
        
        expect(result[1].amount).toBe(200);
        expect(result[1].description).toBe('Desc 4');
        
        expect(result[4].amount).toBe(10);
        expect(result[4].description).toBe('Desc 1');
    });
});

// ─── filterByMonth ────────────────────────────────────────────────────────────

describe('filterByMonth', () => {
  const ROWS = [
    ['tx1', '2026-06-01', '2026-06', '100', 'Cat1', '', 'Swiggy'],
    ['tx2', '2026-05-15', '2026-05', '200', 'Cat2', '', 'Zomato'],
    ['tx3', '2026-06-20', '2026-06', '50',  'Cat1', '', 'BigBazaar'],
  ];

  it('returns only rows matching the month', () => {
    const result = filterByMonth(ROWS, '2026-06');
    expect(result).toHaveLength(2);
    expect(result[0][0]).toBe('tx1');
    expect(result[1][0]).toBe('tx3');
  });

  it('returns [] when no rows match', () => {
    expect(filterByMonth(ROWS, '2025-01')).toEqual([]);
  });

  it('returns [] for empty input', () => {
    expect(filterByMonth([], '2026-06')).toEqual([]);
  });
});

// ─── renderTopExpensesTable empty state ───────────────────────────────────────

describe('renderTopExpensesTable', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <table id="testTable">
        <thead><tr><th>Date</th><th>Desc</th><th>Amount</th><th>Cat</th></tr></thead>
        <tbody></tbody>
      </table>
    `;
  });

  it('renders empty-state row when topExpenses is empty', () => {
    renderTopExpensesTable('testTable', []);
    const tbody = document.querySelector('#testTable tbody');
    expect(tbody.innerHTML).toContain('No expenses');
  });

  it('renders expense rows when data present', () => {
    renderTopExpensesTable('testTable', [
      { date: '2026-06-01', description: 'Big Bazaar', amount: 850, categoryId: 'Cat1' },
    ]);
    const tbody = document.querySelector('#testTable tbody');
    expect(tbody.innerHTML).toContain('Big Bazaar');
    expect(tbody.innerHTML).toContain('850');
  });
});

describe('calculateMoMData', () => {
  it('calculates MoM data correctly with fallbacks', () => {
    const txRows = [
      ['tx1', '2026-05-15', '2026-05', '100', 'cat1', '', ''],
      ['tx2', '2026-06-10', '2026-06', '350', 'cat1', '', ''],
      ['tx3', '2026-06-15', '2026-06', '50',  'cat2', '', ''],
    ];

    const catRows = [
      ['cat1', 'Food', '300', '', '', 'Active'],
      ['cat2', 'Rent', '1000', '', '', 'Active'],
      ['cat3', 'Gym', '100', '', '', 'Inactive'],
    ];

    const bhRows = [
      // month, category_id, budget_amount
      ['2026-05', 'cat1', '250'],
      ['2026-05', 'cat2', '1000'],
    ];

    const result = calculateMoMData(txRows, catRows, bhRows);

    // Should return sorted months: May 26, Jun 26
    expect(result.labels).toEqual(['May 26', 'Jun 26']);

    // May budget = 1250. Spent = 100.
    expect(result.budgetData[0]).toBe(1250);
    expect(result.actualData[0]).toBe(100);

    // June budget has no history, falls back to active categories sum = 300 + 1000 = 1300.
    // Spent = 350 + 50 = 400.
    expect(result.budgetData[1]).toBe(1300);
    expect(result.actualData[1]).toBe(400);
  });
});
