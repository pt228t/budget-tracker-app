import { readRange } from './sheets-api.js';

export async function initAnalytics(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = '<p class="text-muted" style="padding:12px;">Loading analytics…</p>';

    try {
        const [transactionsData, categoriesData] = await Promise.all([
            readRange('Transactions!A:M'),
            readRange('Budget_Categories!A:H'),
        ]);

        const allTxRows = transactionsData.slice(1);
        const catRows   = categoriesData.slice(1);

        const today = new Date();
        const month = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
        const txRows = filterByMonth(allTxRows, month);

        if (txRows.length === 0) {
            container.innerHTML = `
                <div class="empty-state" style="text-align:center;padding:48px 16px;">
                    <p class="text-secondary" style="margin-bottom:8px;">No transactions this month.</p>
                    <p class="text-muted" style="font-size:0.875rem;">Log an expense to see analytics here.</p>
                </div>
            `;
            return;
        }

        const expensesByCategory = calculateExpensesByCategory(txRows);
        const budgetVsActual = calculateBudgetVsActual(txRows, catRows);
        const topExpenses = getTopExpenses(txRows);

        container.innerHTML = `
            <div class="analytics-charts" style="display: flex; gap: 20px; margin-bottom: 30px; justify-content: center; flex-wrap: wrap;">
                <div style="width: 400px;">
                    <canvas id="categoryDonutChart"></canvas>
                </div>
                <div style="width: 500px;">
                    <canvas id="budgetBarChart"></canvas>
                </div>
            </div>
            <div class="analytics-table">
                <h3>Top 5 Expenses</h3>
                <table id="topExpensesTable" border="1" cellspacing="0" cellpadding="8" style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr>
                            <th style="text-align: left;">Date</th>
                            <th style="text-align: left;">Description</th>
                            <th style="text-align: right;">Amount</th>
                            <th style="text-align: left;">Category</th>
                        </tr>
                    </thead>
                    <tbody></tbody>
                </table>
            </div>
        `;

        renderCategoryDonutChart('categoryDonutChart', expensesByCategory);
        renderBudgetBarChart('budgetBarChart', budgetVsActual);
        renderTopExpensesTable('topExpensesTable', topExpenses);
    } catch (err) {
        container.innerHTML = `<p class="text-danger" style="padding:12px;">Error loading analytics: ${err.message}</p>`;
    }
}

export function filterByMonth(txRows, month) {
    return txRows.filter(row => String(row[2]).trim() === month);
}

export function calculateExpensesByCategory(txRows) {
    const expenses = {};
    for (const row of txRows) {
        const amount = parseFloat(row[3]) || 0;
        const catId = row[4] || 'Uncategorized';
        expenses[catId] = (expenses[catId] || 0) + amount;
    }
    return expenses;
}

export function calculateBudgetVsActual(txRows, catRows) {
    const actuals = calculateExpensesByCategory(txRows);
    const categories = [];

    for (const row of catRows) {
        const catId = row[0];
        const name = row[1];
        const budget = parseFloat(row[2]) || 0;
        categories.push({
            id: catId,
            name: name || catId,
            budget,
            actual: actuals[catId] || 0
        });
    }
    return categories;
}

export function getTopExpenses(txRows) {
    return txRows
        .map(row => ({
            date: row[1],
            amount: parseFloat(row[3]) || 0,
            categoryId: row[4],
            description: row[6]
        }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5);
}

export function renderCategoryDonutChart(canvasId, expensesByCategory) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    
    const labels = Object.keys(expensesByCategory);
    const data = Object.values(expensesByCategory);
    
    if (window.Chart) {
        new window.Chart(ctx, {
            type: 'doughnut',
            data: {
                labels,
                datasets: [{
                    data,
                    backgroundColor: [
                        '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40', '#E7E9ED', '#3366CC'
                    ]
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: 'Expenses by Category'
                    }
                }
            }
        });
    } else {
        console.warn('Chart.js is not loaded via CDN. Category Donut Chart not rendered.');
    }
}

export function renderBudgetBarChart(canvasId, budgetVsActual) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    
    const labels = budgetVsActual.map(item => item.name);
    const budgetData = budgetVsActual.map(item => item.budget);
    const actualData = budgetVsActual.map(item => item.actual);
    
    if (window.Chart) {
        new window.Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Budget',
                        data: budgetData,
                        backgroundColor: '#36A2EB'
                    },
                    {
                        label: 'Actual',
                        data: actualData,
                        backgroundColor: '#FF6384'
                    }
                ]
            },
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: 'Budget vs Actual'
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true
                    }
                }
            }
        });
    } else {
        console.warn('Chart.js is not loaded via CDN. Budget vs Actual Bar Chart not rendered.');
    }
}

export function renderTopExpensesTable(tableId, topExpenses) {
    const tbody = document.querySelector(`#${tableId} tbody`);
    if (!tbody) return;

    if (topExpenses.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:16px;color:var(--color-gray-400,#9ca3af);">No expenses recorded this month.</td></tr>`;
        return;
    }

    tbody.innerHTML = topExpenses.map(exp => `
        <tr>
            <td style="text-align: left;">${exp.date || ''}</td>
            <td style="text-align: left;">${exp.description || ''}</td>
            <td style="text-align: right;">${exp.amount.toFixed(2)}</td>
            <td style="text-align: left;">${exp.categoryId || ''}</td>
        </tr>
    `).join('');
}
