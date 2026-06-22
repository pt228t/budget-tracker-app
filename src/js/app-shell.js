const overviewCards = [
  {
    label: 'Monthly Budget',
    value: 'INR 0',
    note: 'Will hydrate from Budget_Categories after auth.',
  },
  {
    label: 'Logged This Week',
    value: '0 expenses',
    note: 'Quick-add flow starts in B-007.',
  },
  {
    label: 'Sync Status',
    value: 'Disconnected',
    note: 'Sheets API wrapper lands in B-006.',
  },
];

const nextSteps = [
  'Connect Google account',
  'Read budget categories from Sheets',
  'Enable quick-add logging',
  'Activate alerts and health indicators',
];

export function renderAppShell() {
  const cardsMarkup = overviewCards
    .map(
      (card) => `
        <article class="card shell-card" data-testid="overview-card">
          <p class="shell-label">${card.label}</p>
          <h3 class="shell-value">${card.value}</h3>
          <p class="text-secondary">${card.note}</p>
        </article>
      `
    )
    .join('');

  const stepsMarkup = nextSteps
    .map((step) => `<li class="checklist-item">${step}</li>`)
    .join('');

  return `
    <main class="app-shell">
      <div class="container shell-layout">
        <header class="shell-header">
          <div>
            <p class="shell-eyebrow">BudgetPulse</p>
            <h1 data-testid="app-title">Google Sheets Budget Tracking Without a Backend</h1>
            <p class="shell-copy">
              Static frontend shell for authentication, daily sync, expense logging,
              and budget health analytics.
            </p>
          </div>
          <div class="shell-actions" data-testid="login-shell">
            <button class="btn btn-primary" type="button" data-auth-action="signin">Sign in with Google</button>
            <button class="btn btn-outline" type="button">View Setup Notes</button>
          </div>
        </header>

        <section class="shell-hero">
          <article class="card hero-panel">
            <div class="sync-status">
              <span class="status-dot" aria-hidden="true"></span>
              <span>Awaiting OAuth and Sheets connection</span>
            </div>
            <h2>Frontend scaffold is ready for auth and data wiring.</h2>
            <p class="text-secondary">
              This shell defines the layout contract for Sprint 1 and exposes
              the entry points for B-005 and B-006.
            </p>
          </article>
          <aside class="card hero-panel hero-panel-accent">
            <p class="shell-label">Sprint 1 focus</p>
            <ul class="checklist" data-testid="checklist">
              ${stepsMarkup}
            </ul>
          </aside>
        </section>

        <section class="overview-grid" aria-label="Overview placeholders">
          ${cardsMarkup}
        </section>

        <section class="detail-grid">
          <article class="card section-panel">
            <div class="panel-header">
              <h2>Quick Add Shell</h2>
              <span class="status-pill">B-007 later</span>
            </div>
            <p class="text-secondary">
              Reserved area for vendor, amount, category suggestion, payment source,
              and overflow tracking.
            </p>
            <div class="placeholder-stack">
              <div class="placeholder-line placeholder-line-lg"></div>
              <div class="placeholder-line"></div>
              <div class="placeholder-line"></div>
            </div>
          </article>

          <article class="card section-panel">
            <div class="panel-header">
              <h2>Budget Health Panels</h2>
              <span class="status-pill status-pill-muted">FR-3 placeholders</span>
            </div>
            <p class="text-secondary">
              KPI cards, category progress bars, and health color states will mount here.
            </p>
            <div class="placeholder-stack">
              <div class="placeholder-chip">Remaining Budget</div>
              <div class="placeholder-chip">Savings Rate</div>
              <div class="placeholder-chip">Pool Health</div>
            </div>
          </article>

          <article class="card section-panel section-panel-wide">
            <div class="panel-header">
              <h2>Integration Notes</h2>
              <span class="status-pill status-pill-muted">Repo-ready</span>
            </div>
            <ul class="notes-list">
              <li>Static hosting target: GitHub Pages via Vite build output.</li>
              <li>Auth target: Google OAuth in browser session.</li>
              <li>Data target: Sheets API wrapper for read/write flows.</li>
              <li>Automation target: Apps Script remains separate from static UI.</li>
            </ul>
          </article>
        </section>
      </div>
    </main>
  `;
}
