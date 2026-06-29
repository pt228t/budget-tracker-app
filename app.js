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
import { renderDashboardHealth, renderPersonalSettlement } from './src/js/dashboard.js';
import { initExpenseLogger } from './src/js/expense-logger.js';
import { initAnalytics } from './src/js/analytics.js';
import { initAdminPanel, initSettingsPanel } from './src/js/admin.js';
import { reRequestConsent } from './src/js/auth.js';
import { onScopeInsufficient, ScopeError, getAuthorizedUsers } from './src/js/sheets-api.js';

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
  const authenticated = isUserAuthenticated();
  updateAuthControls();
  
  if (route !== 'login' && !authenticated) {
    setRoute('login');
    return;
  }
  if (route === 'login' && authenticated) {
    setRoute('dashboard');
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
    initSettingsPanel('settings-config-panel');
  }
}

function updateAuthControls() {
  const authenticated = isUserAuthenticated();
  
  // Show navigation bar only when authenticated
  const nav = qs('.shell-nav');
  if (nav) {
    nav.style.display = authenticated ? 'flex' : 'none';
  }
  
  // Show logout button only when authenticated
  const logoutBtn = document.getElementById('auth-logout-btn');
  if (logoutBtn) {
    logoutBtn.style.display = authenticated ? 'inline-flex' : 'none';
  }

  // Show shell-status bar only when authenticated
  const shellStatus = qs('.shell-status');
  if (shellStatus) {
    shellStatus.style.display = authenticated ? 'flex' : 'none';
  }
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
    const { categories, summary, source, transactions } = await loadCategoryBundle({ force });
    renderCategoryOptions(categories);
    renderCategoryHealthList(categories);
    setCategoryState(summary, source);
    renderDashboardHealth(summary, 'budget-health-panel');

    // Render personal settlement panel
    const allowedUsers = await getAuthorizedUsers().catch(() => []);
    renderPersonalSettlement(transactions, allowedUsers, _authedEmail, 'personal-settlement-panel');

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
      maintainAspectRatio: true,
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

// ─── Theme Switcher ───────────────────────────────────────────────────────────

const THEME_KEY = 'bp_theme';

function _getPreferredTheme() {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === 'dark' || stored === 'light') return stored;
  // Auto-detect system preference
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function _applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);

  const sunIcon = document.querySelector('#theme-toggle .icon-sun');
  const moonIcon = document.querySelector('#theme-toggle .icon-moon');
  if (sunIcon && moonIcon) {
    sunIcon.style.display = theme === 'dark' ? '' : 'none';
    moonIcon.style.display = theme === 'dark' ? 'none' : '';
  }
}

function initThemeToggle() {
  // Apply saved or system-detected theme immediately
  const initial = _getPreferredTheme();
  _applyTheme(initial);

  const btn = document.getElementById('theme-toggle');
  if (btn) {
    btn.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') || 'light';
      const next = current === 'dark' ? 'light' : 'dark';
      localStorage.setItem(THEME_KEY, next);
      _applyTheme(next);
    });
  }

  // Listen for system theme changes (only when user hasn't explicitly set one)
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (!localStorage.getItem(THEME_KEY)) {
      _applyTheme(e.matches ? 'dark' : 'light');
    }
  });
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
    if (err instanceof ScopeError) {
      setSyncMessage('Re-authorizing — please approve all requested permissions.');
      reRequestConsent();
      return;
    }
    setSyncMessage('Setup failed: ' + err.message);
    alert(`Setup failed: ${err.message}\n\nOpen browser console (F12) for details.`);
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

  onScopeInsufficient(() => {
    setSyncMessage('Re-authorizing — please approve all requested permissions.');
    reRequestConsent();
  });

  if (!isUserAuthenticated()) {
    updateAuthControls();
  }
}

function initWinterTheme() {
  const canvas = document.getElementById('snow-canvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  let width = canvas.width = window.innerWidth;
  let height = canvas.height = window.innerHeight;

  class Snowflake {
    constructor(initial = false) {
      this.reset(initial);
    }
    reset(initial = false) {
      this.x = Math.random() * width;
      this.y = initial ? Math.random() * height : Math.random() * -20;
      this.size = Math.random() * 3 + 1.5;
      this.speed = Math.random() * 1.2 + 0.4;
      this.opacity = Math.random() * 0.5 + 0.3;
      this.swing = Math.random() * 1.5;
      this.swingSpeed = Math.random() * 0.015 + 0.005;
      this.swingOffset = Math.random() * Math.PI * 2;
    }
    update() {
      this.y += this.speed;
      this.swingOffset += this.swingSpeed;
      this.x += Math.sin(this.swingOffset) * this.swing;

      if (this.y > height || this.x < -10 || this.x > width + 10) {
        this.reset(false);
      }
    }
    draw(theme) {
      const color = theme === 'dark' 
        ? `rgba(255, 255, 255, ${this.opacity})` 
        : `rgba(99, 102, 241, ${this.opacity * 0.65})`;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Pre-generate tree metadata so they stay consistent on redraw/resize
  const treeCount = 10;
  const trees = Array.from({ length: treeCount }, (_, i) => ({
    xPercent: 0.05 + (i * 0.9 / (treeCount - 1)) + (Math.random() * 0.04 - 0.02),
    size: Math.random() * 30 + 40
  }));

  function drawMountains(theme) {
    const farColor = theme === 'dark' ? 'rgba(30, 27, 75, 0.4)' : 'rgba(224, 231, 255, 0.5)';
    const nearColor = theme === 'dark' ? 'rgba(49, 46, 129, 0.45)' : 'rgba(199, 210, 254, 0.55)';
    const snowColor = theme === 'dark' ? '#cbd5e1' : '#eff6ff';

    // Far range
    ctx.fillStyle = farColor;
    ctx.beginPath();
    ctx.moveTo(0, height);
    ctx.lineTo(0, height - 150);
    ctx.lineTo(width * 0.2, height - 220);
    ctx.lineTo(width * 0.4, height - 140);
    ctx.lineTo(width * 0.65, height - 250);
    ctx.lineTo(width * 0.85, height - 170);
    ctx.lineTo(width, height - 210);
    ctx.lineTo(width, height);
    ctx.closePath();
    ctx.fill();

    // Far snow peaks
    ctx.fillStyle = snowColor;
    const farPeaks = [
      { x: width * 0.2, y: height - 220, w: 40 },
      { x: width * 0.65, y: height - 250, w: 55 }
    ];
    for (const p of farPeaks) {
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.w, p.y + p.w * 0.8);
      ctx.lineTo(p.x + p.w, p.y + p.w * 0.8);
      ctx.closePath();
      ctx.fill();
    }

    // Near range
    ctx.fillStyle = nearColor;
    ctx.beginPath();
    ctx.moveTo(0, height);
    ctx.lineTo(0, height - 100);
    ctx.lineTo(width * 0.3, height - 170);
    ctx.lineTo(width * 0.55, height - 110);
    ctx.lineTo(width * 0.8, height - 190);
    ctx.lineTo(width, height - 120);
    ctx.lineTo(width, height);
    ctx.closePath();
    ctx.fill();

    // Near snow peaks
    for (const p of [
      { x: width * 0.3, y: height - 170, w: 35 },
      { x: width * 0.8, y: height - 190, w: 45 }
    ]) {
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.w, p.y + p.w * 0.8);
      ctx.lineTo(p.x + p.w, p.y + p.w * 0.8);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawPineTree(x, y, treeHeight, theme) {
    const foliageColor = theme === 'dark' ? '#0f172a' : '#1e1b4b';
    const snowColor = theme === 'dark' ? '#cbd5e1' : '#eff6ff';

    // Trunk
    ctx.fillStyle = theme === 'dark' ? '#334155' : '#475569';
    ctx.fillRect(x - 3, y - 8, 6, 8);

    // Foliage tiers
    for (let i = 0; i < 3; i++) {
      const levelY = y - 8 - (i * treeHeight * 0.25);
      const levelWidth = treeHeight * 0.25 * (1 - i * 0.22);
      const levelHeight = treeHeight * 0.35;

      ctx.fillStyle = foliageColor;
      ctx.beginPath();
      ctx.moveTo(x, levelY - levelHeight);
      ctx.lineTo(x - levelWidth, levelY);
      ctx.lineTo(x + levelWidth, levelY);
      ctx.closePath();
      ctx.fill();

      // Snow on foliage tips
      ctx.fillStyle = snowColor;
      ctx.beginPath();
      ctx.moveTo(x, levelY - levelHeight);
      ctx.lineTo(x - levelWidth * 0.35, levelY - levelHeight + levelHeight * 0.35);
      ctx.lineTo(x + levelWidth * 0.35, levelY - levelHeight + levelHeight * 0.35);
      ctx.closePath();
      ctx.fill();
    }
  }

  const count = Math.min(120, Math.floor((width * height) / 10000));
  const snowflakes = Array.from({ length: count }, () => new Snowflake(true));

  function animate() {
    ctx.clearRect(0, 0, width, height);
    const theme = document.documentElement.getAttribute('data-theme') || 'light';

    // 1. Draw Mountains
    drawMountains(theme);

    // 2. Draw Pine Trees
    for (const tree of trees) {
      const tx = tree.xPercent * width;
      drawPineTree(tx, height, tree.size, theme);
    }

    // 3. Draw Falling Snow on top
    for (const flake of snowflakes) {
      flake.update();
      flake.draw(theme);
    }

    requestAnimationFrame(animate);
  }

  window.addEventListener('resize', () => {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  });

  animate();
}

function initializeApp() {
  initThemeToggle();
  initWinterTheme();
  wireNavigation();
  hydrateShell();
  initializeChartPreview();
  initializeIcons();
  updateRoute(getRouteFromHash());
  initializeIntegrations();
}

initializeApp();
