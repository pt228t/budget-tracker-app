# Frontend Scaffold

## Scope

This document tracks the local implementation slice for `B-004 Frontend scaffold + design system`.

## Implemented

- Static entry point with `index.html`
- Root SPA controller in `app.js`
- Root utility module in `utils.js`
- Shell layout for auth, health, logging, and integration placeholders
- Existing CSS token system reused and extended with `src/css/app-shell.css`
- Local dev/build flow via Vite
- Unit scaffolding via Vitest
- Browser smoke test scaffolding via Playwright
- Apps Script mock classes and sample sync test
- GitHub Actions workflow stubs for CI and Pages deployment

## Pending

- Hosted GitHub Pages validation against a real remote repository
- Google OAuth browser flow (`B-005`)
- Sheets API wrapper and live data hydration (`B-006`)

## File Contract

- `index.html`: static host shell
- `app.js`: router, page switching, hydration, and event wiring
- `utils.js`: formatter and DOM helpers
- `src/css/app-shell.css`: scaffold-specific layout styles
- `tests/unit/utils.test.js`: utility sample coverage
- `tests/e2e/app.spec.js`: navigation e2e sample coverage
- `tests/apps-script/mocks.js`: Apps Script mock layer
- `tests/apps-script/sync.test.js`: sample sync coverage

## Why This Shape

The scaffold stays framework-free, keeps the browser bundle small, and creates stable test seams before auth and Sheets integration are introduced.
