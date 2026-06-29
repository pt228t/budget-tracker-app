# BudgetPulse

BudgetPulse is a zero-backend budget tracker that uses Google Sheets as the data store, Apps Script for sync/alerts, and a static frontend deployed to GitHub Pages.

## Current Status

- Codex Phase 1 contract complete: `B-004`, `B-004a`, `B-004b`
- Implemented in this repo: SPA shell, root `app.js` router/init wiring, root `utils.js`, Vite dev/build flow, Vitest unit scaffolding, Playwright e2e scaffolding, Apps Script mock tests, and setup docs
- Still pending for broader Sprint 1 completion: GitHub Pages remote publish/validation, external Google Sheet setup, and daily sync trigger work outside the repo-local Codex contract

## Repo Layout

```text
budget-tracker-app/
├── app.js
├── .agile/
│   ├── backlog/
│   └── sprints/
├── docs/
│   ├── architecture/
│   ├── design/
│   └── requirements/
├── src/
│   ├── css/
│   └── js/
├── tests/
│   ├── apps-script/
│   ├── e2e/
│   └── unit/
├── utils.js
├── index.html
├── package.json
├── playwright.config.js
└── vitest.config.js
```

## Getting Started

### Prerequisites

- Node.js 22.x
- npm 10.x or newer

### Install

```bash
npm install
npx playwright install chromium
```

### Run Locally

```bash
npm run dev
```

Default local URL: `http://127.0.0.1:4173`

### Test

```bash
npm run test:unit
npm run test:e2e
npm run build
```

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Local Vite dev server |
| `npm run build` | Production build for GitHub Pages |
| `npm run preview` | Preview built app locally |
| `npm run test:unit` | Vitest unit tests |
| `npm run test:e2e` | Playwright smoke tests |
| `npm run test` | Unit + e2e tests |

## Documentation

- Product requirements: `docs/requirements/PRD.md`
- User stories: `docs/requirements/user-stories.md`
- Tech stack: `docs/architecture/tech-stack.md`
- System architecture: `docs/architecture/system-architecture.md`
- Frontend scaffold notes: `docs/design/frontend-scaffold.md`
- Sprint tracking: `.agile/sprints/sprint-01.md`

## Next Backlog Steps

1. Publish and validate the hosted shell on the real GitHub Pages remote.
2. Start `B-005` Google OAuth sign-in flow.
3. Start `B-006` Sheets API wrapper once auth is in place.
4. Begin `B-007` quick-add logging on top of the finished scaffold.



CODEX ISSUE : https://github.com/openai/codex/issues/30224