import { readRange, readRangeFromSpreadsheet, appendRow, updateCell } from './sheets-api.js';
import {
  getCategoriesCache,
  setCategoriesCache,
  getSubCategoriesCache,
  setSubCategoriesCache,
} from './cache.js';
import { formatCurrencyINR } from '../../utils.js';

const CATEGORY_RANGE = 'Budget_Categories!A:H';
const SUB_CATEGORY_RANGE = 'Sub_Categories!A:C';

function normalizeHeader(value, index) {
  const text = String(value ?? '').trim();
  if (!text) {
    return `column_${index}`;
  }

  return text.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function toNumber(value) {
  const cleaned = String(value ?? '')
    .replace(/[^0-9.-]+/g, '')
    .trim();

  if (!cleaned) {
    return 0;
  }

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function pickCategoryName(record) {
  return record.category || record.category_name || record.name || record.bucket || '';
}

function pickBudgetValue(record) {
  return (
    toNumber(record.monthly_budget) ||
    toNumber(record.budget) ||
    toNumber(record.planned_budget) ||
    0
  );
}

function pickSpentValue(record) {
  return (
    toNumber(record.spent) ||
    toNumber(record.spent_this_month) ||
    toNumber(record.actual_spend) ||
    0
  );
}

export function mapSheetRows(rows = []) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return [];
  }

  const [headerRow, ...dataRows] = rows;
  const headers = headerRow.map(normalizeHeader);

  return dataRows
    .filter((row) => Array.isArray(row) && row.some((value) => String(value ?? '').trim() !== ''))
    .map((row) => {
      const record = headers.reduce((accumulator, header, index) => {
        accumulator[header] = row[index] ?? '';
        return accumulator;
      }, {});

      const category = pickCategoryName(record);
      const monthlyBudget = pickBudgetValue(record);
      const spent = pickSpentValue(record);
      const remaining =
        toNumber(record.remaining) || Math.max(monthlyBudget - spent, 0);
      const utilization = monthlyBudget > 0 ? spent / monthlyBudget : 0;

      return {
        ...record,
        category,
        monthlyBudget,
        spent,
        remaining,
        utilization,
      };
    })
    .filter((record) => record.category);
}

export function summarizeCategories(categories = []) {
  return categories.reduce(
    (summary, category) => {
      summary.count += 1;
      summary.totalBudget += category.monthlyBudget || 0;
      summary.totalSpent += category.spent || 0;
      summary.totalRemaining += category.remaining || 0;
      return summary;
    },
    {
      count: 0,
      totalBudget: 0,
      totalSpent: 0,
      totalRemaining: 0,
    }
  );
}

export function getHealthTone(utilization = 0) {
  if (utilization >= 1) {
    return 'critical';
  }

  if (utilization >= 0.8) {
    return 'warning';
  }

  if (utilization >= 0.6) {
    return 'danger';
  }

  return 'success';
}

function getProgressClass(tone) {
  switch (tone) {
    case 'critical':
      return 'progress-critical';
    case 'warning':
      return 'progress-warning';
    case 'danger':
      return 'progress-danger';
    default:
      return 'progress-success';
  }
}

export function buildCategoryHealthModels(categories = []) {
  return [...categories]
    .map((category) => {
      const utilizationPercent = Math.max(
        0,
        Math.min(100, Math.round((category.utilization || 0) * 100))
      );
      const tone = getHealthTone(category.utilization || 0);

      return {
        ...category,
        tone,
        utilizationPercent,
        progressClass: getProgressClass(tone),
      };
    })
    .sort((left, right) => right.utilizationPercent - left.utilizationPercent);
}

export function renderCategoryHealthMarkup(categories = [], limit = 100) {
  const models = buildCategoryHealthModels(categories).slice(0, limit);

  if (models.length === 0) {
    return `
      <li class="card shell-card" style="text-align: center; padding: 32px 16px;">
        <i data-lucide="inbox" style="width: 32px; height: 32px; margin: 0 auto 12px; color: var(--color-gray-400);"></i>
        <p class="text-secondary" style="margin-bottom: 8px;">No budget categories found.</p>
        <p class="text-muted" style="font-size: 0.875rem;">Categories will appear here once the nightly sync runs or when you manually add them to your Google Sheet.</p>
      </li>
    `;
  }

  return models
    .map(
      (model) => `
        <li class="card shell-card" data-category-health-item>
          <div class="panel-header">
            <strong>${model.category}</strong>
            <span class="status-pill ${model.tone === 'success' ? 'status-pill-muted' : ''}">${model.utilizationPercent}% used</span>
          </div>
          <div class="progress-bar-container mt-3" aria-label="${model.category} utilization">
            <div
              class="progress-bar-fill ${model.progressClass}"
              style="width: ${model.utilizationPercent}%"
            ></div>
          </div>
          <div class="flex justify-between mt-2 text-secondary">
            <span>Spent ${formatCurrencyINR(model.spent)}</span>
            <span class="${model.remaining < 0 ? 'text-critical' : ''}">${model.remaining < 0 ? `${formatCurrencyINR(Math.abs(model.remaining))} over` : `${formatCurrencyINR(model.remaining)} left`}</span>
          </div>
        </li>
      `
    )
    .join('');
}

export function renderCategoryOptionsMarkup(categories = []) {
  return categories
    .filter((category) => category.category)
    .map((category) => `<option value="${category.category_id || category.category}">${category.category}</option>`)
    .join('');
}

export async function loadCategories({ force = false } = {}) {
  if (!force) {
    const cached = getCategoriesCache();
    if (Array.isArray(cached) && cached.length > 0) {
      return { categories: cached, source: 'cache' };
    }
  }

  const rows = await readRange(CATEGORY_RANGE);
  const categories = mapSheetRows(rows);
  setCategoriesCache(categories);

  return { categories, source: 'sheet' };
}

export async function loadSubCategories({ force = false } = {}) {
  if (!force) {
    const cached = getSubCategoriesCache();
    if (Array.isArray(cached) && cached.length > 0) {
      return { subCategories: cached, source: 'cache' };
    }
  }

  const rows = await readRange(SUB_CATEGORY_RANGE);
  const subCategories = mapSheetRows(rows);
  setSubCategoriesCache(subCategories);

  return { subCategories, source: 'sheet' };
}

export async function loadCategoryBundle(options = {}) {
  const [{ categories, source }, { subCategories }, transactions] = await Promise.all([
    loadCategories(options),
    loadSubCategories(options).catch(() => ({ subCategories: [] })),
    readRange('Transactions!A:M').catch(() => []),
  ]);

  // Aggregate current month spent per category (excluding future-dated transactions)
  const today = new Date();
  const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  
  const actuals = {};
  if (Array.isArray(transactions) && transactions.length > 1) {
    const txRows = transactions.slice(1);
    for (const row of txRows) {
      const month = String(row[2] ?? '').trim();
      const dateStr = String(row[1] ?? '').trim();
      if (month === currentMonth && dateStr <= todayStr) {
        const amount = parseFloat(row[3]) || 0;
        const catId = String(row[4] ?? '').trim();
        if (catId) {
          actuals[catId] = (actuals[catId] || 0) + amount;
        }
      }
    }
  }

  // Merge actual spent into categories
  // Dual-key lookup: new transactions store category_id, legacy ones stored category name
  const enrichedCategories = categories.map(cat => {
    const spent = actuals[cat.category_id] || actuals[cat.category] || 0;
    const remaining = (cat.monthlyBudget || 0) - spent; // unclamped — negative = over-budget
    const utilization = cat.monthlyBudget > 0 ? spent / cat.monthlyBudget : 0;
    return {
      ...cat,
      spent,
      remaining,
      utilization
    };
  });

  return {
    categories: enrichedCategories,
    subCategories,
    source,
    summary: summarizeCategories(enrichedCategories),
    transactions,
  };
}

/**
 * Sync categories client-side from the source joint-spend spreadsheet.
 * Parses App_Config, reads Recurring_Items, and synchronizes Budget_Categories.
 *
 * @returns {Promise<{ added: number, updated: number, archived: number, unchanged: number }>}
 */
export async function syncCategoriesFromSource() {
  const configRows = await readRange('App_Config!A:B');
  const config = {};
  for (const row of configRows) {
    const key = String(row[0] ?? '').trim();
    const val = String(row[1] ?? '').trim();
    if (key) config[key] = val;
  }

  const sourceId = config['source_spreadsheet_id'];
  const sourceTab = config['source_recurring_items_tab'] || 'Recurring_Items';

  if (!sourceId) {
    throw new Error('source_spreadsheet_id not set in App_Config. Please set it first.');
  }

  // Read source items
  const sourceRows = await readRangeFromSpreadsheet(sourceId, `${sourceTab}!A:F`);
  if (!sourceRows || sourceRows.length <= 1) {
    return { added: 0, updated: 0, archived: 0, unchanged: 0, info: 'No items in source recurring list' };
  }

  const sourceItems = [];
  const [sourceHeaderRow, ...sourceDataRows] = sourceRows;
  
  // Columns: Col A (0) = item, Col C (2) = monthly_amount, Col F (5) = active_status
  for (const row of sourceDataRows) {
    const name = String(row[0] ?? '').trim();
    const amount = parseFloat(row[2]) || 0;
    const activeStatus = String(row[5] ?? '').trim();
    if (name && amount > 0 && activeStatus === 'Active') {
      sourceItems.push({ name, amount });
    }
  }

  // Read local categories raw rows
  const localRows = await readRange('Budget_Categories!A:H');
  const headers = (localRows[0] || []).map(normalizeHeader);
  
  // Find local category index map (by source_item_name)
  const existingMap = {};
  const dataRows = localRows.slice(1);
  dataRows.forEach((row, i) => {
    const record = headers.reduce((acc, h, idx) => {
      acc[h] = row[idx] ?? '';
      return acc;
    }, {});
    const sourceItemName = record.source_item_name || record.category_name;
    if (sourceItemName) {
      existingMap[sourceItemName] = {
        rowIdx: i + 2, // 1-based index (header is 1, first data row is 2)
        record,
        rawRow: row
      };
    }
  });

  const today = new Date();
  const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const timestamp = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}T${String(today.getHours()).padStart(2, '0')}:${String(today.getMinutes()).padStart(2, '0')}:${String(today.getSeconds()).padStart(2, '0')}`;

  let added = 0;
  let updated = 0;
  let unchanged = 0;
  let archived = 0;

  const seenSourceNames = {};

  for (const item of sourceItems) {
    seenSourceNames[item.name] = true;

    if (existingMap.hasOwnProperty(item.name)) {
      const { rowIdx, record } = existingMap[item.name];
      const existingBudget = parseFloat(record.monthly_budget) || 0;
      const existingStatus = record.active_status;
      const categoryId = record.category_id;

      let changed = false;

      if (existingBudget !== item.amount) {
        await updateCell(`Budget_Categories!C${rowIdx}`, item.amount);
        changed = true;
      }

      if (existingStatus !== 'Active') {
        await updateCell(`Budget_Categories!F${rowIdx}`, 'Active');
        changed = true;
      }

      if (changed) {
        // Upsert budget history
        await appendRow('Budget_History!A:E', [
          currentMonth,
          categoryId,
          item.amount,
          'synced',
          timestamp
        ]);
        updated++;
      } else {
        unchanged++;
      }
    } else {
      // New category
      const categoryId = 'cat_' + Math.random().toString(36).substring(2, 8) + Date.now().toString(36).substring(4, 8);
      const newRow = [
        categoryId,
        item.name,
        item.amount,
        'synced',
        item.name,
        'Active',
        currentMonth,
        ''
      ];
      await appendRow('Budget_Categories!A:H', newRow);
      await appendRow('Budget_History!A:E', [
        currentMonth,
        categoryId,
        item.amount,
        'synced',
        timestamp
      ]);
      added++;
    }
  }

  // Archive categories no longer in source
  for (const name in existingMap) {
    if (existingMap.hasOwnProperty(name) && !seenSourceNames[name]) {
      const { rowIdx, record } = existingMap[name];
      if (record.source === 'synced' && record.active_status !== 'Archived') {
        await updateCell(`Budget_Categories!F${rowIdx}`, 'Archived');
        archived++;
      }
    }
  }

  return { added, updated, archived, unchanged };
}
