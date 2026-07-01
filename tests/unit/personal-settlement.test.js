import { describe, it, expect, beforeEach } from 'vitest';
import { renderPersonalSettlement } from '../../src/js/dashboard.js';

describe('renderPersonalSettlement', () => {
  beforeEach(() => {
    // Setup mock DOM element
    document.body.innerHTML = '<div id="personal-settlement-panel"></div>';
  });

  it('renders advice when balances are settled', () => {
    const transactions = [
      ['transaction_id', 'date', 'month', 'amount', 'category_id', 'sub_category', 'description', 'paid_by', 'funding_source'],
      // No personal payments
    ];
    const allowedUsers = ['userA@x.com', 'userB@x.com'];
    
    renderPersonalSettlement(transactions, allowedUsers, 'userA@x.com', 'personal-settlement-panel');
    
    const panel = document.getElementById('personal-settlement-panel');
    expect(panel.innerHTML).toContain('All personal payments are fully settled!');
  });

  it('renders correct debt transfers for 50/50 split', () => {
    const today = new Date();
    const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    // Use the 1st of the current month — always <= today regardless of when tests run
    const dateStr = `${currentMonth}-01`;

    const transactions = [
      ['transaction_id', 'date', 'month', 'amount', 'category_id', 'sub_category', 'description', 'paid_by', 'funding_source'],
      // userA paid 100 out of pocket
      ['t1', dateStr, currentMonth, '100', 'cat_1', '', 'Store', 'userA@x.com', 'Personal'],
      // userB paid 20 out of pocket
      ['t2', dateStr, currentMonth, '20', 'cat_2', '', 'Metro', 'userB@x.com', 'Personal'],
    ];
    const allowedUsers = ['userA@x.com', 'userB@x.com'];

    renderPersonalSettlement(transactions, allowedUsers, 'userB@x.com', 'personal-settlement-panel');

    const panel = document.getElementById('personal-settlement-panel');
    
    // Total = 120. Share = 60.
    // userA spent 100 -> balance +40.
    // userB spent 20 -> balance -40.
    // userB (current user, 'You') owes userA 40.
    expect(panel.innerHTML).toContain('You owe');
    expect(panel.innerHTML).toContain('userA@x.com');
  });
});
