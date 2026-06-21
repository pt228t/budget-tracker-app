import { readRange } from './sheets-api.js';
import {
  getCategoriesCache,
  setCategoriesCache,
  getSubCategoriesCache,
  setSubCategoriesCache,
} from './cache.js';

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

export function renderCategoryHealthMarkup(categories = [], limit = 5) {
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
            <span>Spent ${model.spent}</span>
            <span>Left ${model.remaining}</span>
          </div>
        </li>
      `
    )
    .join('');
}

export function renderCategoryOptionsMarkup(categories = []) {
  return categories
    .map((category) => category.category)
    .filter(Boolean)
    .map((categoryName) => `<option value="${categoryName}">${categoryName}</option>`)
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
  const [{ categories, source }, { subCategories }] = await Promise.all([
    loadCategories(options),
    loadSubCategories(options).catch(() => ({ subCategories: [] })),
  ]);

  return {
    categories,
    subCategories,
    source,
    summary: summarizeCategories(categories),
  };
}
