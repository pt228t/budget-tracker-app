import { describe, it, expect } from 'vitest';
import { calculateExpensesByCategory, calculateBudgetVsActual, getTopExpenses } from '../../src/js/analytics.js';

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
