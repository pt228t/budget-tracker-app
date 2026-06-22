#!/usr/bin/env node
/**
 * scripts/deploy-apps-script.mjs — BudgetPulse
 *
 * Deploys all Apps Script .gs files to the Google Apps Script project
 * using clasp. This is the canonical deploy mechanism — no more
 * manual copy-paste into the script editor.
 *
 * Usage:
 *   node scripts/deploy-apps-script.mjs            # Deploy
 *   node scripts/deploy-apps-script.mjs --dry-run  # Validate only, no push
 *
 * Guardrails (all enforced before any push):
 *   1. SCRIPT_ID must be set (env var or .clasp.json) — blocks deploy on unconfigured projects
 *   2. All expected .gs files must be present — no deploy if a file went missing
 *   3. Every .gs file is syntactically scanned for obvious bad patterns
 *   4. Dry-run flag prints what would be pushed without actually pushing
 *   5. CI=true env skips interactive prompts and fails fast on any error
 *
 * Required secrets (GitHub Actions / local .env):
 *   CLASP_ACCESS_TOKEN   — OAuth2 access token for the service account
 *   APPS_SCRIPT_ID       — The script project ID (from script.google.com URL)
 *
 * First-time local setup: see APPS_SCRIPT_SETUP.md
 */

import { spawnSync } from 'child_process';
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = resolve(__dirname, '..');
const GS_DIR    = resolve(ROOT, 'scripts', 'apps-script');
const CLASP_JSON = resolve(GS_DIR, '.clasp.json');

// ─── Guardrail: Expected files manifest ──────────────────────────────────────
// Every .gs file that should exist in the Apps Script project.
// Add to this list when a new .gs file is created — the deploy will
// refuse to run if any file in this list is missing.
const REQUIRED_GS_FILES = [
  'appsscript.json',
  'Config.gs',
  'Helpers.gs',
  'Triggers.gs',
  'Sync.gs',
  'Alerts.gs',
  'Notifications.gs',
];

// ─── Guardrail: Forbidden patterns ───────────────────────────────────────────
// Patterns that must NOT appear in any .gs file before deploy.
// Catches common accidental debug/prototype pollution issues.
const FORBIDDEN_PATTERNS = [
  { pattern: /console\.log\b/,          reason: 'Use logInfo() instead of console.log — not available in Apps Script' },
  { pattern: /debugger\b/,              reason: 'debugger statement left in code' },
  { pattern: /TODO.*DEPLOY/i,           reason: 'Unresolved TODO marked as blocking deploy' },
  { pattern: /__PLACEHOLDER__/,         reason: 'Unfilled placeholder value found' },
];

// ─── CLI args ─────────────────────────────────────────────────────────────────
const args      = process.argv.slice(2);
const DRY_RUN   = args.includes('--dry-run');
const IS_CI     = process.env.CI === 'true';

// ─── Helpers ─────────────────────────────────────────────────────────────────
function log(msg)        { console.log(`[deploy-gs] ${msg}`); }
function warn(msg)       { console.warn(`[deploy-gs] ⚠️  ${msg}`); }
function fail(msg)       { console.error(`[deploy-gs] ❌ ${msg}`); process.exit(1); }
function success(msg)    { console.log(`[deploy-gs] ✅ ${msg}`); }

// ─── Step 1: Resolve script ID ───────────────────────────────────────────────
function resolveScriptId() {
  // Priority: env var > .clasp.json
  const envId = process.env.APPS_SCRIPT_ID;
  if (envId && envId !== '__APPS_SCRIPT_PROJECT_ID__') {
    return envId;
  }

  if (!existsSync(CLASP_JSON)) {
    fail(
      'No APPS_SCRIPT_ID env var and no .clasp.json found.\n' +
      '  → Run: cp scripts/apps-script/.clasp.json.example scripts/apps-script/.clasp.json\n' +
      '  → Fill in your scriptId from script.google.com\n' +
      '  → See APPS_SCRIPT_SETUP.md for full setup guide'
    );
  }

  const clasp = JSON.parse(readFileSync(CLASP_JSON, 'utf8'));
  if (!clasp.scriptId || clasp.scriptId === '__APPS_SCRIPT_PROJECT_ID__') {
    fail(
      'scriptId in .clasp.json is still the placeholder "__APPS_SCRIPT_PROJECT_ID__".\n' +
      '  → Open your Apps Script project at script.google.com\n' +
      '  → Copy the script ID from the URL and paste it into .clasp.json\n' +
      '  → Or set the APPS_SCRIPT_ID environment variable\n' +
      '  → See APPS_SCRIPT_SETUP.md for full instructions'
    );
  }

  return clasp.scriptId;
}

// ─── Step 2: Verify all required files exist ─────────────────────────────────
function verifyFilesExist() {
  log('Checking required .gs files...');
  const missing = [];
  for (const file of REQUIRED_GS_FILES) {
    const path = resolve(GS_DIR, file);
    if (!existsSync(path)) {
      missing.push(file);
    }
  }

  if (missing.length > 0) {
    fail(
      `Missing required .gs files — deploy aborted:\n` +
      missing.map(f => `    scripts/apps-script/${f}`).join('\n') + '\n' +
      '  → Add the file or remove it from REQUIRED_GS_FILES in deploy-apps-script.mjs'
    );
  }

  success(`All ${REQUIRED_GS_FILES.length} required .gs files present.`);
}

// ─── Step 3: Scan for forbidden patterns ─────────────────────────────────────
function scanForbiddenPatterns() {
  log('Scanning .gs files for forbidden patterns...');
  const violations = [];

  for (const file of REQUIRED_GS_FILES) {
    const path = resolve(GS_DIR, file);
    const content = readFileSync(path, 'utf8');
    const lines = content.split('\n');

    for (const { pattern, reason } of FORBIDDEN_PATTERNS) {
      lines.forEach((line, idx) => {
        if (pattern.test(line)) {
          violations.push(`  ${file}:${idx + 1} — ${reason}\n    → ${line.trim()}`);
        }
      });
    }
  }

  if (violations.length > 0) {
    fail(`Forbidden patterns found in .gs files:\n${violations.join('\n')}`);
  }

  success('No forbidden patterns detected.');
}

// ─── Step 4: Write ephemeral .clasp.json with resolved scriptId ──────────────
function writeClasp(scriptId) {
  const config = {
    scriptId,
    rootDir: '.',
    filePushOrder: REQUIRED_GS_FILES,
  };
  writeFileSync(CLASP_JSON, JSON.stringify(config, null, 2));
  log(`Wrote .clasp.json with scriptId: ${scriptId.slice(0, 8)}...`);
}

// ─── Step 5: Authenticate clasp with token from env ──────────────────────────
/**
 * Reads clasp credentials from the environment and writes a complete 
 * ~/.clasprc.json. Clasp will automatically use the refresh token to 
 * get a fresh access token when it runs.
 */
function authenticateClasp() {
  const refreshToken = process.env.CLASP_REFRESH_TOKEN;
  const clientId     = process.env.CLASP_CLIENT_ID;
  const clientSecret = process.env.CLASP_CLIENT_SECRET;

  if (!refreshToken || !clientId || !clientSecret) {
    if (IS_CI) {
      fail(
        'Missing clasp credentials in environment.\n' +
        '  → Make sure CLASP_REFRESH_TOKEN, CLASP_CLIENT_ID, and CLASP_CLIENT_SECRET\n' +
        '  → are all set as GitHub repository secrets.'
      );
    }
    // Local dev: assume user is already logged in via `npm run clasp:login`
    log('Clasp credentials not found in env — using local clasp login session.');
    return;
  }

  // Write a complete .clasprc.json.
  const clasprc = {
    token: {
      access_token:  'dummy-access-token-to-force-refresh',
      refresh_token: refreshToken,
      token_type:    'Bearer',
      expiry_date:   0, // Force clasp to refresh immediately
    },
    oauth2ClientSettings: {
      clientId:     clientId,
      clientSecret: clientSecret,
      redirectUri:  'http://localhost',
    },
    isLocalCreds: false,
  };

  const clasprcPath = resolve(process.env.HOME || '/root', '.clasprc.json');
  writeFileSync(clasprcPath, JSON.stringify(clasprc));
  log('Clasp credentials injected into ~/.clasprc.json');
}

// ─── Step 6: Push via clasp ───────────────────────────────────────────────────
function pushWithClasp() {
  const claspBin = resolve(ROOT, 'node_modules', '.bin', 'clasp');

  if (!existsSync(claspBin)) {
    fail(
      'clasp binary not found in node_modules/.bin/clasp.\n' +
      '  → Run: npm ci\n' +
      '  → clasp is listed in devDependencies'
    );
  }

  log(`Pushing ${REQUIRED_GS_FILES.length} files to Apps Script...`);

  const result = spawnSync(claspBin, ['push', '--force'], {
    cwd: GS_DIR,
    stdio: 'inherit',
    env: { ...process.env },
  });

  if (result.status !== 0) {
    fail(`clasp push failed with exit code ${result.status}`);
  }

  success(`All ${REQUIRED_GS_FILES.length} .gs files pushed successfully.`);
}

// ─── Step 7: Print dry-run summary ───────────────────────────────────────────
function printDryRunSummary(scriptId) {
  log('');
  log('─── DRY RUN — No files were pushed ───────────────────────────');
  log(`  Script ID : ${scriptId}`);
  log(`  Directory : scripts/apps-script/`);
  log('  Files that would be pushed:');
  for (const file of REQUIRED_GS_FILES) {
    const path = resolve(GS_DIR, file);
    const bytes = readFileSync(path).length;
    log(`    ${file.padEnd(20)} ${(bytes / 1024).toFixed(1)} KB`);
  }
  log('─────────────────────────────────────────────────────────────');
  log('  Run without --dry-run to deploy.');
  log('');
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  log('BudgetPulse Apps Script deploy');
  log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'DEPLOY'}${IS_CI ? ' (CI)' : ' (local)'}`);
  log('');

  const scriptId = resolveScriptId();
  verifyFilesExist();
  scanForbiddenPatterns();

  if (DRY_RUN) {
    printDryRunSummary(scriptId);
    success('Dry run complete — all guardrails passed.');
    return;
  }

  writeClasp(scriptId);
  authenticateClasp();
  pushWithClasp();

  success('Deploy complete. Verify in the Apps Script editor:');
  log(`  https://script.google.com/d/${scriptId}/edit`);
}

main().catch(err => {
  console.error('[deploy-gs] Fatal error:', err);
  process.exit(1);
});
