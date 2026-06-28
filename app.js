import {
  formatCurrencyINR,
  formatDateLabel,
  generateId,
  qs,
  qsa,
} from './utils.js';
import { initAuth, isUserAuthenticated, signOut } from './src/js/auth.js';
import { onTokenExpired, isUserAllowed } from './src/js/sheets-api.js';
import { bootstrapSpreadsheet } from './src/js/setup.js';
import { clearSessionCaches } from './src/js/cache.js';
import {
  loadCategoryBundle,
  renderCategoryHealthMarkup,
  renderCategoryOptionsMarkup,
} from './src/js/categories.js';
import { renderDashboardHealth } from './src/js/dashboard.js';
import { initExpenseLogger } from './src/js/expense-logger.js';
import { initAnalytics } from './src/js/analytics.js';
import { initAdminPanel } from './src/js/admin.js';

let _authedEmail = '';

const ROUTES = ['login', 'dashboard', 'expense-log', 'analytics', 'settings'];

const ROUTE_TITLES = {
  login: 'Login',
  dashboard: 'Dashboard',
  'expense-log': 'Expense Log',
  analytics: 'Analytics',
  settings: 'Settings',
};

const DEFAULT_SYNC_MESSAGE = 'Awaiting OAuth and Sheets connection';
const PREVIEW_CATEGORIES = [
  { category: 'Groceries', monthlyBudget: 8000, spent: 6400, remaining: 1600, utilization: 0.8 },
  { category: 'Transport', monthlyBudget: 2500, spent: 1150, remaining: 1350, utilization: 0.46 },
  { category: 'Dining Out', monthlyBudget: 3000, spent: 2700, remaining: 300, utilization: 0.9 },
];

function getRouteFromHash(hash = window.location.hash) {
  const route = hash.replace(/^#/, '').trim();
  return ROUTES.includes(route) ? route : 'login';
}

function setRoute(route) {
  if (!ROUTES.includes(route)) {
    return;
  }

  window.location.hash = route;
}

function updateRoute(route) {
  if (route !== 'login' && !isUserAuthenticated()) {
    setRoute('login');
    return;
  }

  qsa('[data-page]').forEach((section) => {
    section.hidden = section.dataset.page !== route;
  });

  qsa('[data-route]').forEach((button) => {
    button.classList.toggle('active', button.dataset.route === route);
  });

  const currentView = qs('[data-current-view]');
  if (currentView) {
    currentView.textContent = ROUTE_TITLES[route];
  }

  document.title = `BudgetPulse | ${ROUTE_TITLES[route]}`;

  if (route === 'settings' && _authedEmail) {
    initAdminPanel('admin-panel', _authedEmail);
  }
}

function updateAuthControls() {
  const authenticated = isUserAuthenticated();
  qsa('.shell-nav-link').forEach((link) => {
    const route = link.dataset.route;
    if (route && route !== 'login' && route !== 'logout') {
      link.style.display = authenticated ? '' : 'none';
    }
  });
}

function setSyncMessage(message) {
  const statusText = qs('.sync-status span:last-child');
  if (statusText) {
    statusText.textContent = message;
  }
}

function setCategoryState(summary, source = 'sheet') {
  const categoryCount = qs('[data-category-count]');
  const categorySource = qs('[data-category-source]');
  const categoryStatus = qs('[data-category-status]');
  const spentAmount = qs('[data-spent-amount]');
  const budgetAmount = qs('[data-budget-amount]');
  const remainingAmount = qs('[data-remaining-amount]');

  if (categoryCount) {
    categoryCount.textContent = `${summary.count} categories`;
  }

  if (categorySource) {
    categorySource.textContent =
      source === 'cache'
        ? 'Loaded from local cache until the next live refresh.'
        : 'Loaded from Google Sheets category data.';
  }

  if (categoryStatus) {
    categoryStatus.textContent =
      source === 'cache'
        ? 'Showing cached category health while waiting for a live refresh.'
        : 'Live category health loaded from Google Sheets.';
  }

  if (spentAmount) {
    spentAmount.textContent = formatCurrencyINR(summary.totalSpent);
  }

  if (budgetAmount) {
    budgetAmount.textContent = formatCurrencyINR(summary.totalBudget);
  }

  if (remainingAmount) {
    remainingAmount.textContent = formatCurrencyINR(summary.totalRemaining);
  }
}

function renderCategoryHealthList(categories) {
  const list = qs('[data-testid="category-health-list"]');
  if (!list) {
    return;
  }

  list.innerHTML = renderCategoryHealthMarkup(categories);
  initializeIcons();
}

function renderCategoryOptions(categories) {
  const select = qs('#category');
  if (!select) {
    return;
  }

  select.innerHTML = `
    <option value="">Select a category</option>
    ${renderCategoryOptionsMarkup(categories)}
  `;
}

function renderDashboardPreview() {
  renderCategoryOptions(PREVIEW_CATEGORIES);
  renderCategoryHealthList(PREVIEW_CATEGORIES);
  const mockSummary = {
    count: 3,
    totalBudget: 13500,
    totalSpent: 10250,
    totalRemaining: 3250,
  };
  setCategoryState(mockSummary, 'preview');
  renderDashboardHealth(mockSummary, 'budget-health-panel');
}

async function hydrateCategoryData({ force = false } = {}) {
  // Wire expense form immediately — independent of Sheets data availability.
  initExpenseLogger('expense-log-form', 'recent-transactions-list');

  try {
    setSyncMessage('Loading categories from Sheets...');
    const { categories, summary, source } = await loadCategoryBundle({ force });
    renderCategoryOptions(categories);
    renderCategoryHealthList(categories);
    setCategoryState(summary, source);
    renderDashboardHealth(summary, 'budget-health-panel');
    initAnalytics('analytics-container');
    setSyncMessage('Connected to Google Sheets');
  } catch (error) {
    console.error('Failed to load category data', error);
    setSyncMessage('Auth is ready, but sheet data is not available yet');
  }
}

function wireNavigation() {
  qsa('[data-route], [data-go-route]').forEach((button) => {
    button.addEventListener('click', (event) => {
      const targetRoute = button.dataset.route || button.dataset.goRoute;
      if (targetRoute === 'logout') {
        event.preventDefault();
        clearSessionCaches();
        sessionStorage.removeItem('bp_access_token');
        signOut();
        updateAuthControls();
        setSyncMessage(DEFAULT_SYNC_MESSAGE);
        setRoute('login');
        return;
      }

      if (targetRoute) {
        setRoute(targetRoute);
      }
    });
  });

  window.addEventListener('hashchange', () => {
    updateRoute(getRouteFromHash());
  });
}

function hydrateShell() {
  const budgetAmount = qs('[data-budget-amount]');
  const spentAmount = qs('[data-spent-amount]');
  const sessionSeed = qs('[data-id-seed]');
  const today = qs('[data-today]');

  if (budgetAmount) {
    budgetAmount.textContent = formatCurrencyINR(8000);
  }

  if (spentAmount) {
    spentAmount.textContent = formatCurrencyINR(2785);
  }

  if (sessionSeed) {
    sessionSeed.textContent = generateId('bp-session');
  }

  if (today) {
    today.textContent = formatDateLabel(new Date('2026-06-21T00:00:00+05:30'));
  }

  setSyncMessage(DEFAULT_SYNC_MESSAGE);
  renderDashboardPreview();
}

function initializeChartPreview() {
  const chartCanvas = qs('#analytics-chart');

  if (!chartCanvas || !window.Chart) {
    return;
  }

  const context = chartCanvas.getContext('2d');
  if (!context) {
    return;
  }

  new window.Chart(context, {
    type: 'line',
    data: {
      labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
      datasets: [
        {
          label: 'Spend',
          data: [5200, 6100, 5400, 6700, 5900, 6400],
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59, 130, 246, 0.16)',
          fill: true,
          tension: 0.3,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false,
        },
      },
      scales: {
        y: {
          beginAtZero: true,
        },
      },
    },
  });
}

function initializeIcons() {
  if (window.lucide?.createIcons) {
    window.lucide.createIcons();
  }
}

async function handleAuthSuccess(accessToken) {
  updateAuthControls();
  setSyncMessage('Verifying authorization...');
  try {
    const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    
    if (!response.ok) {
      throw new Error('Failed to fetch user profile from Google');
    }
    const profile = await response.json();

    const setupReport = await bootstrapSpreadsheet(profile.email);
    if (!setupReport.ready) {
      throw new Error('Bootstrap failed: ' + setupReport.errors.join(', '));
    }
    
    const allowed = await isUserAllowed(profile.email);
    if (!allowed) {
      alert(`Access Denied: Your email (${profile.email}) is not authorized to use this app. Contact the owner.`);
      signOut();
      return;
    }

    _authedEmail = profile.email;
    setRoute('dashboard');
    hydrateCategoryData({ force: true });
    setSyncMessage('Ready');
  } catch (err) {
    console.error(err);
    setSyncMessage('Setup failed: ' + err.message);
    signOut();
  }
}

function handleAuthFailure() {
  updateAuthControls();
  setSyncMessage('Sign-in failed. Check Google OAuth configuration.');
}

function initializeIntegrations() {
  initAuth(handleAuthSuccess, handleAuthFailure);

  onTokenExpired(() => {
    clearSessionCaches();
    updateAuthControls();
    setSyncMessage('Session expired. Sign in again.');
    setRoute('login');
  });

  if (!isUserAuthenticated()) {
    updateAuthControls();
  }
}

function initializeApp() {
  wireNavigation();
  hydrateShell();
  initializeChartPreview();
  initializeIcons();
  updateRoute(getRouteFromHash());
  initializeIntegrations();
}

initializeApp();
