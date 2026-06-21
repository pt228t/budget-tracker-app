import {
  formatCurrencyINR,
  formatDateLabel,
  generateId,
  qs,
  qsa,
} from './utils.js';

const ROUTES = ['login', 'dashboard', 'expense-log', 'analytics', 'settings'];

const ROUTE_TITLES = {
  login: 'Login',
  dashboard: 'Dashboard',
  'expense-log': 'Expense Log',
  analytics: 'Analytics',
  settings: 'Settings',
};

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
}

function wireNavigation() {
  qsa('[data-route], [data-go-route]').forEach((button) => {
    button.addEventListener('click', () => {
      const targetRoute = button.dataset.route || button.dataset.goRoute;
      setRoute(targetRoute);
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

function initializeApp() {
  wireNavigation();
  hydrateShell();
  initializeChartPreview();
  initializeIcons();
  updateRoute(getRouteFromHash());
}

initializeApp();
