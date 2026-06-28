# Sprint 14: Visual Polish (Dark Mode Toggle)

## Goal
Implement a premium Dark Mode toggle (B-034) in the header/settings with local storage state persistence, system preference auto-detection (prefers-color-scheme), and fully customized dark theme color variables.

## Tasks
- [ ] **B-034: Dark Mode Toggle**
  - Add a theme toggle button to the top-right of the header in `index.html`.
  - Define a complete dark theme variable block under `[data-theme="dark"]` (or `.dark-theme`) in `src/css/`.
  - Implement client-side theme switcher logic in `app.js` that checks user preference in `localStorage`, auto-detects system theme, updates the DOM class/attribute, and persists selection.
