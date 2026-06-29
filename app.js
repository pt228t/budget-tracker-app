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
  let width = canvas.width = window.innerWidth * devicePixelRatio;
  let height = canvas.height = window.innerHeight * devicePixelRatio;
  canvas.style.width = window.innerWidth + 'px';
  canvas.style.height = window.innerHeight + 'px';
  ctx.scale(devicePixelRatio, devicePixelRatio);
  let W = window.innerWidth;
  let H = window.innerHeight;

  // ─── Color Palettes ───────────────────────────────────────────────
  const palettes = {
    dark: {
      sky:        ['#0f0e1a', '#1a1633', '#252145'],
      // 3 mountain layers: far → mid → near
      mtFar:      { top: '#2d2854', bot: '#1e1940' },
      mtMid:      { top: '#3b3570', bot: '#2a2555' },
      mtNear:     { top: '#4a4285', bot: '#352f65' },
      fog:        'rgba(15, 14, 26, 0.35)',
      snow:       'rgba(200, 210, 230, 0.85)',
      snowCap:    '#c8d4ec',
      ground:     { top: '#3b3570', bot: '#252145' },
      groundSnow: 'rgba(200, 210, 230, 0.12)',
      treeTrunk:  '#2a2555',
      treeFoliage:['#1a2e1a', '#1e3a1e', '#224422'],
      treeSnow:   'rgba(200, 215, 235, 0.7)',
      flakeNear:  (o) => `rgba(255, 255, 255, ${o})`,
      flakeMid:   (o) => `rgba(200, 215, 240, ${o * 0.7})`,
      flakeFar:   (o) => `rgba(180, 195, 225, ${o * 0.4})`,
      glow:       'rgba(100, 120, 200, 0.06)',
    },
    light: {
      sky:        ['#e8ecf8', '#dce4f5', '#d0d8f0'],
      mtFar:      { top: '#c5cce6', bot: '#b8c2de' },
      mtMid:      { top: '#adb8d8', bot: '#9daace' },
      mtNear:     { top: '#95a2c5', bot: '#8595bb' },
      fog:        'rgba(232, 236, 248, 0.45)',
      snow:       'rgba(255, 255, 255, 0.9)',
      snowCap:    '#ffffff',
      ground:     { top: '#adb8d8', bot: '#c5cce6' },
      groundSnow: 'rgba(255, 255, 255, 0.25)',
      treeTrunk:  '#5a6478',
      treeFoliage:['#3d5c3d', '#4a6b4a', '#557a55'],
      treeSnow:   'rgba(255, 255, 255, 0.85)',
      flakeNear:  (o) => `rgba(255, 255, 255, ${o})`,
      flakeMid:   (o) => `rgba(220, 228, 245, ${o * 0.7})`,
      flakeFar:   (o) => `rgba(200, 210, 235, ${o * 0.45})`,
      glow:       'rgba(255, 255, 255, 0.15)',
    }
  };

  // ─── Depth-layered Snowflakes ─────────────────────────────────────
  class Snowflake {
    constructor(layer, initial) { // layer: 0=far, 1=mid, 2=near
      this.layer = layer;
      this.reset(initial);
    }
    reset(initial = false) {
      const cfg = [
        { minSize: 0.5, maxSize: 1.5, minSpd: 0.15, maxSpd: 0.5,  opMul: 0.35 },
        { minSize: 1.2, maxSize: 2.5, minSpd: 0.35, maxSpd: 0.9,  opMul: 0.6  },
        { minSize: 2.0, maxSize: 4.0, minSpd: 0.6,  maxSpd: 1.4,  opMul: 1.0  },
      ][this.layer];
      this.x = Math.random() * W;
      this.y = initial ? Math.random() * H : -(Math.random() * 40 + 10);
      this.size = Math.random() * (cfg.maxSize - cfg.minSize) + cfg.minSize;
      this.speed = Math.random() * (cfg.maxSpd - cfg.minSpd) + cfg.minSpd;
      this.opacity = (Math.random() * 0.4 + 0.3) * cfg.opMul;
      this.swing = Math.random() * 0.8 + 0.2;
      this.swingSpeed = Math.random() * 0.008 + 0.003;
      this.phase = Math.random() * Math.PI * 2;
    }
    update() {
      this.y += this.speed;
      this.phase += this.swingSpeed;
      this.x += Math.sin(this.phase) * this.swing;
      if (this.y > H + 5 || this.x < -15 || this.x > W + 15) this.reset(false);
    }
    draw(p) {
      const colorFn = [p.flakeFar, p.flakeMid, p.flakeNear][this.layer];
      ctx.fillStyle = colorFn(this.opacity);
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ─── Smooth Bezier Mountain Generator ─────────────────────────────
  // Creates natural-looking mountain silhouettes using quadratic bezier curves
  function generateMountainPath(peaks) {
    // peaks: [{x, y}...] — key peak/valley positions
    const pts = peaks.map(p => ({ x: p.x * W, y: H - p.y * H }));
    return pts;
  }

  function drawSmoothMountain(pts, gradTop, gradBot, snowCapColor, snowDepth) {
    // Draw filled mountain shape with smooth bezier connections
    const grad = ctx.createLinearGradient(0, Math.min(...pts.map(p => p.y)), 0, H);
    grad.addColorStop(0, gradTop);
    grad.addColorStop(1, gradBot);
    ctx.fillStyle = grad;

    ctx.beginPath();
    ctx.moveTo(-10, H + 10);
    ctx.lineTo(pts[0].x, pts[0].y);

    for (let i = 0; i < pts.length - 1; i++) {
      const curr = pts[i];
      const next = pts[i + 1];
      const cpx = (curr.x + next.x) / 2;
      const cpy1 = curr.y;
      const cpy2 = next.y;
      ctx.bezierCurveTo(cpx, cpy1, cpx, cpy2, next.x, next.y);
    }

    ctx.lineTo(W + 10, H + 10);
    ctx.closePath();
    ctx.fill();

    // Snow caps on peaks (only on local high points)
    if (snowCapColor && snowDepth > 0) {
      for (let i = 1; i < pts.length - 1; i++) {
        if (pts[i].y < pts[i - 1].y && pts[i].y < pts[i + 1].y) {
          // This is a peak
          const px = pts[i].x;
          const py = pts[i].y;
          const capW = snowDepth * 2.5;
          const capH = snowDepth;

          const snowGrad = ctx.createLinearGradient(px, py, px, py + capH * 1.2);
          snowGrad.addColorStop(0, snowCapColor);
          snowGrad.addColorStop(1, 'transparent');

          ctx.fillStyle = snowGrad;
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.bezierCurveTo(px - capW * 0.3, py + capH * 0.3, px - capW * 0.8, py + capH * 0.9, px - capW, py + capH * 1.2);
          ctx.lineTo(px + capW, py + capH * 1.2);
          ctx.bezierCurveTo(px + capW * 0.8, py + capH * 0.9, px + capW * 0.3, py + capH * 0.3, px, py);
          ctx.closePath();
          ctx.fill();
        }
      }
    }
  }

  // Pre-generated mountain profiles (normalized 0-1 coords)
  const farMountain = [
    {x:-0.05, y:0.08}, {x:0.08, y:0.18}, {x:0.18, y:0.28},
    {x:0.30, y:0.14}, {x:0.42, y:0.24}, {x:0.55, y:0.32},
    {x:0.68, y:0.19}, {x:0.78, y:0.27}, {x:0.90, y:0.22},
    {x:1.05, y:0.12}
  ];
  const midMountain = [
    {x:-0.05, y:0.06}, {x:0.10, y:0.15}, {x:0.25, y:0.23},
    {x:0.38, y:0.11}, {x:0.52, y:0.20}, {x:0.62, y:0.26},
    {x:0.75, y:0.14}, {x:0.88, y:0.22}, {x:1.05, y:0.10}
  ];
  const nearMountain = [
    {x:-0.05, y:0.04}, {x:0.12, y:0.12}, {x:0.22, y:0.18},
    {x:0.35, y:0.08}, {x:0.48, y:0.16}, {x:0.60, y:0.10},
    {x:0.72, y:0.17}, {x:0.85, y:0.11}, {x:1.05, y:0.06}
  ];

  // ─── Organic Pine Tree ────────────────────────────────────────────
  // Pre-generate consistent tree positions with depth layers
  const treeData = [];
  // Near trees (larger, darker, in front)
  for (let i = 0; i < 8; i++) {
    treeData.push({
      xPct: 0.02 + (i * 0.135) + (Math.random() * 0.04 - 0.02),
      h: Math.random() * 30 + 50,
      tiers: Math.floor(Math.random() * 2) + 4,
      lean: (Math.random() - 0.5) * 0.04,
      layer: 2,
    });
  }
  // Mid trees (smaller, lighter, behind)
  for (let i = 0; i < 6; i++) {
    treeData.push({
      xPct: 0.06 + (i * 0.17) + (Math.random() * 0.06 - 0.03),
      h: Math.random() * 18 + 28,
      tiers: Math.floor(Math.random() * 2) + 3,
      lean: (Math.random() - 0.5) * 0.02,
      layer: 1,
    });
  }

  function drawOrganicTree(tree, p, groundY) {
    const x = tree.xPct * W;
    const th = tree.h;
    const baseY = groundY;

    // Trunk: tapered rectangle
    const trunkW = th * 0.07;
    const trunkH = th * 0.18;
    ctx.fillStyle = p.treeTrunk;
    ctx.beginPath();
    ctx.moveTo(x - trunkW, baseY);
    ctx.lineTo(x - trunkW * 0.6, baseY - trunkH);
    ctx.lineTo(x + trunkW * 0.6, baseY - trunkH);
    ctx.lineTo(x + trunkW, baseY);
    ctx.closePath();
    ctx.fill();

    // Foliage tiers with slight organic curves
    for (let i = 0; i < tree.tiers; i++) {
      const t = i / tree.tiers;
      const tierY = baseY - trunkH - (i * th * 0.18);
      const tierW = th * (0.32 - t * 0.06);
      const tierH = th * 0.26;
      const lean = tree.lean * th;

      // Dark foliage
      ctx.fillStyle = p.treeFoliage[Math.min(i, p.treeFoliage.length - 1)];
      ctx.beginPath();
      ctx.moveTo(x + lean, tierY - tierH);
      ctx.bezierCurveTo(
        x - tierW * 0.5 + lean, tierY - tierH * 0.4,
        x - tierW, tierY + tierH * 0.1,
        x - tierW * 0.85, tierY
      );
      ctx.lineTo(x + tierW * 0.85, tierY);
      ctx.bezierCurveTo(
        x + tierW, tierY + tierH * 0.1,
        x + tierW * 0.5 + lean, tierY - tierH * 0.4,
        x + lean, tierY - tierH
      );
      ctx.closePath();
      ctx.fill();

      // Snow draping on each tier
      ctx.fillStyle = p.treeSnow;
      ctx.beginPath();
      ctx.moveTo(x + lean, tierY - tierH);
      ctx.bezierCurveTo(
        x - tierW * 0.3 + lean, tierY - tierH * 0.5,
        x - tierW * 0.6, tierY - tierH * 0.15,
        x - tierW * 0.4, tierY - tierH * 0.05
      );
      // Undulating snow edge
      ctx.quadraticCurveTo(x - tierW * 0.1, tierY - tierH * 0.22, x, tierY - tierH * 0.12);
      ctx.quadraticCurveTo(x + tierW * 0.1, tierY - tierH * 0.22, x + tierW * 0.4, tierY - tierH * 0.05);
      ctx.bezierCurveTo(
        x + tierW * 0.6, tierY - tierH * 0.15,
        x + tierW * 0.3 + lean, tierY - tierH * 0.5,
        x + lean, tierY - tierH
      );
      ctx.closePath();
      ctx.fill();
    }
  }

  // ─── Ground Snow Blanket ──────────────────────────────────────────
  function drawGroundSnow(p) {
    const groundY = H * 0.92;
    const grad = ctx.createLinearGradient(0, groundY - 15, 0, H);
    grad.addColorStop(0, p.groundSnow);
    grad.addColorStop(0.5, p.ground.top);
    grad.addColorStop(1, p.ground.bot);
    ctx.fillStyle = grad;

    ctx.beginPath();
    ctx.moveTo(-10, H + 10);
    // Gentle rolling snow drifts using bezier curves
    const driftCount = 8;
    let cx = -10;
    ctx.lineTo(cx, groundY + 3);
    for (let i = 0; i < driftCount; i++) {
      const nx = (i + 1) * (W + 20) / driftCount;
      const midX = (cx + nx) / 2;
      const driftH = Math.sin(i * 1.3 + 0.5) * 6 + 3;
      ctx.quadraticCurveTo(midX, groundY - driftH, nx, groundY + (i % 2 === 0 ? 2 : -1));
      cx = nx;
    }
    ctx.lineTo(W + 10, H + 10);
    ctx.closePath();
    ctx.fill();
  }

  // ─── Atmospheric Fog Layer ────────────────────────────────────────
  function drawFogLayer(yStart, fogHeight, color) {
    const grad = ctx.createLinearGradient(0, yStart, 0, yStart + fogHeight);
    grad.addColorStop(0, 'transparent');
    grad.addColorStop(0.4, color);
    grad.addColorStop(0.6, color);
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.fillRect(0, yStart, W, fogHeight);
  }

  // ─── Ambient Glow ─────────────────────────────────────────────────
  function drawAmbientGlow(p) {
    const grad = ctx.createRadialGradient(W * 0.7, H * 0.15, 0, W * 0.7, H * 0.15, H * 0.6);
    grad.addColorStop(0, p.glow);
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  }

  // ─── Create Snowflakes ────────────────────────────────────────────
  const totalFlakes = Math.min(180, Math.floor((W * H) / 7000));
  const flakes = [];
  // 40% far, 35% mid, 25% near
  const layerSplit = [0.4, 0.35, 0.25];
  for (let layer = 0; layer < 3; layer++) {
    const n = Math.floor(totalFlakes * layerSplit[layer]);
    for (let i = 0; i < n; i++) flakes.push(new Snowflake(layer, true));
  }

  // ─── Animation Loop ──────────────────────────────────────────────
  function animate() {
    ctx.clearRect(0, 0, W, H);
    const themeKey = document.documentElement.getAttribute('data-theme') || 'light';
    const p = palettes[themeKey] || palettes.light;

    // 0. Ambient glow
    drawAmbientGlow(p);

    // 1. Far snowflakes (behind everything)
    for (const f of flakes) { if (f.layer === 0) { f.update(); f.draw(p); } }

    // 2. Far mountains
    drawSmoothMountain(generateMountainPath(farMountain), p.mtFar.top, p.mtFar.bot, p.snowCap, 18);

    // 3. Atmospheric fog between far & mid
    drawFogLayer(H * 0.65, H * 0.12, p.fog);

    // 4. Mid snowflakes
    for (const f of flakes) { if (f.layer === 1) { f.update(); f.draw(p); } }

    // 5. Mid mountains
    drawSmoothMountain(generateMountainPath(midMountain), p.mtMid.top, p.mtMid.bot, p.snowCap, 14);

    // 6. Fog between mid & near
    drawFogLayer(H * 0.75, H * 0.10, p.fog);

    // 7. Mid trees (behind near mountains)
    const midGroundY = H * 0.89;
    for (const t of treeData) { if (t.layer === 1) drawOrganicTree(t, p, midGroundY); }

    // 8. Near mountains
    drawSmoothMountain(generateMountainPath(nearMountain), p.mtNear.top, p.mtNear.bot, p.snowCap, 10);

    // 9. Ground snow blanket
    drawGroundSnow(p);

    // 10. Near trees (in front of ground)
    const nearGroundY = H * 0.925;
    for (const t of treeData) { if (t.layer === 2) drawOrganicTree(t, p, nearGroundY); }

    // 11. Near snowflakes (in front of everything)
    for (const f of flakes) { if (f.layer === 2) { f.update(); f.draw(p); } }

    requestAnimationFrame(animate);
  }

  window.addEventListener('resize', () => {
    width = canvas.width = window.innerWidth * devicePixelRatio;
    height = canvas.height = window.innerHeight * devicePixelRatio;
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(devicePixelRatio, devicePixelRatio);
    W = window.innerWidth;
    H = window.innerHeight;
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
