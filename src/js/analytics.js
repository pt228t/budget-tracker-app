import { readRange } from './sheets-api.js';
import { formatCurrencyINR } from '../../utils.js';

const _fmtINR = (val) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val || 0);
const _tooltipINR = {
    callbacks: {
        label: function(context) {
            const val = context.parsed.y !== undefined ? context.parsed.y : context.parsed;
            return ' ' + _fmtINR(val);
        }
    }
};

export async function initAnalytics(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = '<p class="text-muted" style="padding:12px;">Loading analytics…</p>';

    try {
        const [transactionsData, categoriesData, budgetHistoryData] = await Promise.all([
            readRange('Transactions!A:M').catch(() => []),
            readRange('Budget_Categories!A:H').catch(() => []),
            readRange('Budget_History!A:D').catch(() => []),
        ]);

        const allTxRows = transactionsData.slice(1);
        const catRows   = categoriesData.slice(1);
        const bhRows    = budgetHistoryData.slice(1);

        const today = new Date();
        const month = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
        const txRows = filterByMonth(allTxRows, month);
        const upcoming = getUpcomingForMonth(allTxRows, month);
        const upcomingBanner = renderUpcomingBanner(upcoming);

        if (txRows.length === 0) {
            container.innerHTML = `
                ${upcomingBanner}
                <div class="empty-state" style="text-align:center;padding:48px 16px;">
                    <p class="text-secondary" style="margin-bottom:8px;">No transactions counted yet this month.</p>
                    <p class="text-muted" style="font-size:0.875rem;">Log an expense to see analytics here.</p>
                </div>
            `;
            // Still render the MoM trend even if current month has no transactions!
            const momData = calculateMoMData(allTxRows, catRows, bhRows);
            renderMoMChart('analytics-chart', momData);
            return;
        }

        // Build id→name map for resolving category IDs stored in transactions
        const catMap = {};
        for (const row of catRows) {
            if (row[0]) catMap[String(row[0]).trim()] = String(row[1] ?? '').trim();
        }

        const rawExpensesByCategory = calculateExpensesByCategory(txRows);
        // Resolve category IDs to display names (new txns store IDs; legacy stored names)
        const expensesByCategory = {};
        for (const [key, val] of Object.entries(rawExpensesByCategory)) {
            const name = catMap[key] || key;
            expensesByCategory[name] = (expensesByCategory[name] || 0) + val;
        }

        const budgetVsActual = calculateBudgetVsActual(txRows, catRows);
        const topExpenses = getTopExpenses(txRows);
        const dayOfWeekData = calculateDayOfWeekData(txRows);
        const personSplitData = calculatePersonSplitData(txRows);

        const topExpensesWithNames = topExpenses.map(exp => ({
            ...exp,
            categoryId: catMap[exp.categoryId] || exp.categoryId
        }));

        const momData = calculateMoMData(allTxRows, catRows, bhRows);

        container.innerHTML = `
            ${upcomingBanner}
            <div class="analytics-charts" style="display: flex; gap: 20px; margin-bottom: 30px; justify-content: center; flex-wrap: wrap;">
                <div style="width: 440px; max-width: 100%;">
                    <canvas id="categoryDonutChart"></canvas>
                </div>
                <div style="width: 440px; max-width: 100%;">
                    <canvas id="budgetBarChart"></canvas>
                </div>
            </div>
            <div class="analytics-charts-row2" style="display: flex; gap: 20px; margin-bottom: 30px; justify-content: center; flex-wrap: wrap; align-items: stretch; width: 100%;">
                <div style="width: 440px; max-width: 100%;">
                    <canvas id="personSplitChart"></canvas>
                </div>
                <div class="heatmap-card card" style="width: 440px; max-width: 100%; display: flex; flex-direction: column; padding: 16px; border: 1px solid var(--color-border); border-radius: var(--radius-md, 8px); background: var(--color-bg-surface); box-sizing: border-box;">
                    <h3 style="text-align: center; margin-top: 0; margin-bottom: 16px; font-size: 1rem; color: var(--color-text-primary); font-weight: 600;">Day-of-Week Spending Heatmap</h3>
                    <div id="dayOfWeekHeatmap" class="heatmap-grid" style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 8px; flex-grow: 1; align-items: stretch;">
                    </div>
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
        renderPersonSplitChart('personSplitChart', personSplitData);
        
        // Populate day-of-week heatmap
        const heatmapEl = document.getElementById('dayOfWeekHeatmap');
        if (heatmapEl) {
            const { days, maxAmount } = dayOfWeekData;
            heatmapEl.innerHTML = days.map(d => {
                const percent = maxAmount > 0 ? d.amount / maxAmount : 0;
                const mixPercent = Math.round(percent * 85); // Cap at 85%
                const bgStyle = `color-mix(in srgb, var(--color-brand-primary) ${mixPercent}%, var(--color-bg-surface))`;
                const borderStyle = mixPercent > 0 ? `1px solid var(--color-brand-primary)` : `1px solid var(--color-border)`;
                const formattedAmount = new Intl.NumberFormat('en-IN', {
                    style: 'currency',
                    currency: 'INR',
                    maximumFractionDigits: 0
                }).format(d.amount);

                return `
                    <div class="heatmap-day" style="display: flex; flex-direction: column; align-items: center; justify-content: space-between; padding: 8px 4px; border-radius: var(--radius-md, 8px); background: ${bgStyle}; border: ${borderStyle}; text-align: center; min-height: 80px; transition: transform 0.2s; box-sizing: border-box;">
                        <span style="font-weight: 600; font-size: 0.75rem; color: var(--color-text-secondary);">${d.name}</span>
                        <span style="font-size: 0.875rem; font-weight: 700; color: var(--color-text-primary); margin: 4px 0;">${formattedAmount}</span>
                        <span style="font-size: 0.65rem; color: var(--color-text-tertiary);">${d.count} tx</span>
                    </div>
                `;
            }).join('');
        }

        renderTopExpensesTable('topExpensesTable', topExpensesWithNames);
        renderMoMChart('analytics-chart', momData);
    } catch (err) {
        container.innerHTML = `<p class="text-danger" style="padding:12px;">Error loading analytics: ${err.message}</p>`;
    }
}

export function filterByMonth(txRows, month) {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    return txRows.filter(row => {
        const rowMonth = String(row[2]).trim();
        const rowDate = String(row[1]).trim();
        return rowMonth === month && rowDate <= todayStr;
    });
}

/**
 * Counts/sums month rows dated after today — the future-dated expenses that
 * filterByMonth intentionally excludes from analytics. Used to surface them
 * so they aren't silently missing.
 *
 * @returns {{ count: number, total: number }}
 */
export function getUpcomingForMonth(txRows, month) {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    let count = 0;
    let total = 0;
    for (const row of txRows) {
        const rowMonth = String(row[2]).trim();
        const rowDate = String(row[1]).trim();
        if (rowMonth === month && rowDate > todayStr) {
            count++;
            total += parseFloat(row[3]) || 0;
        }
    }
    return { count, total };
}

function renderUpcomingBanner({ count, total }) {
    if (!count) return '';
    const plural = count > 1 ? 's' : '';
    return `<div class="analytics-upcoming-banner" role="status">
        📅 ${count} upcoming expense${plural} (₹${total.toLocaleString('en-IN')}) dated later this month — not counted in analytics until the date arrives.
    </div>`;
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
        const catId = String(row[0] ?? '').trim();
        const name = String(row[1] ?? '').trim();
        const budget = parseFloat(row[2]) || 0;
        // Dual-key lookup: new transactions store category_id; legacy stored category name
        categories.push({
            id: catId,
            name: name || catId,
            budget,
            actual: actuals[catId] || actuals[name] || 0
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

export function calculateDayOfWeekData(txRows) {
    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const days = dayNames.map(name => ({ name, amount: 0, count: 0 }));

    for (const row of txRows) {
        const dateStr = row[1];
        if (!dateStr) continue;
        
        // Parse date reliably
        const parts = dateStr.split('-');
        if (parts.length < 3) continue;
        const dateObj = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        
        let dayIdx = dateObj.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
        // Map 0 (Sun) to index 6, and 1-6 to index 0-5
        const targetIdx = dayIdx === 0 ? 6 : dayIdx - 1;
        
        const amount = parseFloat(row[3]) || 0;
        days[targetIdx].amount += amount;
        days[targetIdx].count += 1;
    }

    const maxAmount = Math.max(...days.map(d => d.amount), 0);
    return { days, maxAmount };
}

export function calculatePersonSplitData(txRows) {
    const split = {};
    for (const row of txRows) {
        const email = String(row[7] ?? '').trim();
        const amount = parseFloat(row[3]) || 0;
        if (!email) continue;
        
        // Clean/capitalize email prefix
        const namePart = email.split('@')[0];
        const displayName = namePart.charAt(0).toUpperCase() + namePart.slice(1);
        
        split[displayName] = (split[displayName] || 0) + amount;
    }
    return split;
}

export function renderPersonSplitChart(canvasId, personSplitData) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    const labels = Object.keys(personSplitData);
    const data = Object.values(personSplitData);

    if (window.Chart) {
        new window.Chart(ctx, {
            type: 'doughnut',
            data: {
                labels,
                datasets: [{
                    data,
                    backgroundColor: [
                        '#60a5fa', '#34d399', '#fbbf24', '#f472b6'
                    ],
                    borderColor: 'var(--color-bg-surface)',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    title: {
                        display: true,
                        text: 'Spending Split by Person',
                        color: 'var(--color-text-primary)',
                        font: {
                            weight: 'bold',
                            size: 14
                        }
                    },
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: 'var(--color-text-secondary)'
                        }
                    },
                    tooltip: _tooltipINR
                }
            }
        });
    } else {
        console.warn('Chart.js is not loaded. Person Split Chart not rendered.');
    }
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
                maintainAspectRatio: true,
                plugins: {
                    title: {
                        display: true,
                        text: 'Expenses by Category'
                    },
                    tooltip: _tooltipINR
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
                maintainAspectRatio: true,
                plugins: {
                    title: {
                        display: true,
                        text: 'Budget vs Actual'
                    },
                    tooltip: _tooltipINR
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: (v) => _fmtINR(v)
                        }
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
            <td style="text-align: right;">${_fmtINR(exp.amount)}</td>
            <td style="text-align: left;">${exp.categoryId || ''}</td>
        </tr>
    `).join('');
}

/**
 * Calculates Month-over-Month total budget vs actual spend.
 */
export function calculateMoMData(allTxRows, catRows, bhRows) {
    // 1. Group transactions by month
    const actualsByMonth = {};
    for (const row of allTxRows) {
        const month = String(row[2] ?? '').trim();
        const amount = parseFloat(row[3]) || 0;
        if (month && month.match(/^\d{4}-\d{2}$/)) {
            actualsByMonth[month] = (actualsByMonth[month] || 0) + amount;
        }
    }

    // 2. Group budget history by month — deduplicate per (month, catId) to avoid
    //    double-counting when sync has run multiple times for the same month.
    const defaultTotalBudget = catRows.reduce((sum, row) => {
        const budget = parseFloat(row[2]) || 0;
        const status = String(row[5] ?? '').trim();
        return status === 'Active' ? sum + budget : sum;
    }, 0);

    const budgetsByMonthCat = {};
    for (const row of bhRows) {
        const month = String(row[0] ?? '').trim();
        const catId = String(row[1] ?? '').trim();
        const amount = parseFloat(row[2]) || 0;
        if (month && month.match(/^\d{4}-\d{2}$/)) {
            if (!budgetsByMonthCat[month]) budgetsByMonthCat[month] = {};
            budgetsByMonthCat[month][catId] = amount; // last-wins per (month, catId)
        }
    }
    const budgetsByMonth = {};
    for (const [month, catMap] of Object.entries(budgetsByMonthCat)) {
        budgetsByMonth[month] = Object.values(catMap).reduce((s, v) => s + v, 0);
    }

    // Get list of unique months in transactions and budget history
    const allMonthsSet = new Set([
        ...Object.keys(actualsByMonth),
        ...Object.keys(budgetsByMonth)
    ]);
    const months = Array.from(allMonthsSet).sort();

    // Limit to last 6 months for clear display
    const targetMonths = months.slice(-6);

    const labels = [];
    const budgetData = [];
    const actualData = [];

    // Helper to format YYYY-MM to MMM YY (e.g. "Jun 26")
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const formatMonthLabel = (m) => {
        const parts = m.split('-');
        if (parts.length < 2) return m;
        const yr = parts[0];
        const mn = parts[1];
        const monthIdx = parseInt(mn, 10) - 1;
        const yearShort = yr.substring(2);
        return `${monthNames[monthIdx] || mn} ${yearShort}`;
    };

    for (const m of targetMonths) {
        labels.push(formatMonthLabel(m));
        // Fallback to defaultTotalBudget if no specific budget recorded for this month
        budgetData.push(budgetsByMonth[m] !== undefined ? budgetsByMonth[m] : defaultTotalBudget);
        actualData.push(actualsByMonth[m] || 0);
    }

    return { labels, budgetData, actualData };
}

/**
 * Renders the Month-over-Month trend chart using Chart.js.
 */
export function renderMoMChart(canvasId, momData) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    if (window.Chart) {
        // Destroy existing chart if any to avoid overlapping charts
        const existingChart = window.Chart.getChart(ctx);
        if (existingChart) {
            existingChart.destroy();
        }

        new window.Chart(ctx, {
            type: 'bar',
            data: {
                labels: momData.labels,
                datasets: [
                    {
                        label: 'Total Budget',
                        data: momData.budgetData,
                        backgroundColor: '#3b82f6',
                        borderColor: '#2563eb',
                        borderWidth: 1
                    },
                    {
                        label: 'Actual Spend',
                        data: momData.actualData,
                        backgroundColor: '#ef4444',
                        borderColor: '#dc2626',
                        borderWidth: 1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    title: {
                        display: true,
                        text: 'Month-over-Month Spending Trend'
                    },
                    tooltip: _tooltipINR
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: (v) => _fmtINR(v)
                        }
                    }
                }
            }
        });
    } else {
        console.warn('Chart.js is not loaded. MoM Trend Chart not rendered.');
    }
}
