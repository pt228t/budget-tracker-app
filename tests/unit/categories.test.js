import { describe, expect, it } from 'vitest';
import {
  buildCategoryHealthModels,
  mapSheetRows,
  renderCategoryOptionsMarkup,
  renderCategoryHealthMarkup,
  summarizeCategories,
} from '../../src/js/categories.js';

describe('categories mapping', () => {
  it('maps sheet rows into normalized category records', () => {
    const rows = [
      ['Category', 'Monthly Budget', 'Spent'],
      ['Groceries', '8000', '3250'],
      ['Transport', '2500', '1200'],
    ];

    const categories = mapSheetRows(rows);

    expect(categories).toHaveLength(2);
    expect(categories[0]).toMatchObject({
      category: 'Groceries',
      monthlyBudget: 8000,
      spent: 3250,
      remaining: 4750,
    });
  });

  it('summarizes normalized categories', () => {
    const summary = summarizeCategories([
      { monthlyBudget: 8000, spent: 3250, remaining: 4750 },
      { monthlyBudget: 2500, spent: 1200, remaining: 1300 },
    ]);

    expect(summary).toEqual({
      count: 2,
      totalBudget: 10500,
      totalSpent: 4450,
      totalRemaining: 6050,
    });
  });

  it('builds dashboard health models ordered by utilization', () => {
    const models = buildCategoryHealthModels([
      { category: 'Groceries', monthlyBudget: 8000, spent: 7200, remaining: 800, utilization: 0.9 },
      { category: 'Transport', monthlyBudget: 2500, spent: 1200, remaining: 1300, utilization: 0.48 },
      { category: 'Rent', monthlyBudget: 25000, spent: 25000, remaining: 0, utilization: 1 },
    ]);

    expect(models.map((model) => model.category)).toEqual(['Rent', 'Groceries', 'Transport']);
    expect(models[0]).toMatchObject({ tone: 'critical', utilizationPercent: 100 });
    expect(models[1]).toMatchObject({ tone: 'warning', utilizationPercent: 90 });
    expect(models[2]).toMatchObject({ tone: 'success', utilizationPercent: 48 });
  });

  it('renders category health markup with progress semantics', () => {
    const markup = renderCategoryHealthMarkup([
      { category: 'Groceries', monthlyBudget: 8000, spent: 7200, remaining: 800, utilization: 0.9 },
      { category: 'Transport', monthlyBudget: 2500, spent: 1200, remaining: 1300, utilization: 0.48 },
    ]);

    expect(markup).toContain('data-category-health-item');
    expect(markup).toContain('Groceries');
    expect(markup).toContain('90% used');
    expect(markup).toContain('progress-warning');
  });

  it('renders category dropdown options from normalized categories', () => {
    const markup = renderCategoryOptionsMarkup([
      { category: 'Groceries' },
      { category: 'Transport' },
      { category: 'Dining Out' },
    ]);

    expect(markup).toContain('<option value="Groceries">Groceries</option>');
    expect(markup).toContain('<option value="Transport">Transport</option>');
    expect(markup).toContain('<option value="Dining Out">Dining Out</option>');
  });
});
