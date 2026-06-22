# Apps Script Auto-Deploy Setup

This document covers the **one-time** steps needed to wire up the automated
Apps Script deployment. After this is done, every `git push` to `main` that
touches a `.gs` file will automatically push to the Apps Script project — no
manual copy-paste ever again.

---

## ⚠️ Important: The Pipeline Does NOT Create the Project

`clasp push` can only sync files into an **already-existing** Apps Script project.
It cannot create one. You must create the project manually — but only once, and it
takes about 2 minutes.

There is also a critical constraint: `Sync.gs` uses `SpreadsheetApp.getActiveSpreadsheet()`,
which only works when the Apps Script is **container-bound** — meaning it lives
**inside** the BudgetPulse Google Sheet, not as a separate standalone project.
This means the project must be created from within the Sheet itself.

---

## Real Setup Sequence (do these in order)

```
1. Log into BudgetPulse app   →  setup.js auto-creates the Google Sheet
2. Open that Sheet            →  Extensions → Apps Script  (creates bound project)
3. Copy Script ID from URL
4. Run clasp login locally    →  get your CLASP_ACCESS_TOKEN
5. Add both to GitHub Secrets →  APPS_SCRIPT_ID + CLASP_ACCESS_TOKEN
6. git push any .gs change    →  pipeline auto-deploys forever after
```

Steps 1–5 happen once. Step 6 is permanent and fully automatic.

---

## Step 0 — Do You Have the BudgetPulse Google Sheet?

**Scenario A — Sheet does not exist yet (starting fresh)**

1. Open the BudgetPulse web app in your browser and sign in with Google
2. `setup.js` automatically creates the Google Sheet and all required tabs on first login
3. Open [Google Sheets](https://sheets.google.com) → you will see a new sheet called **BudgetPulse**
4. Continue to Step 1 below

**Scenario B — Sheet already exists**

Skip straight to Step 1.

---

## Step 1 — Create the Container-Bound Apps Script Project

> This is the only step that can never be automated. Google does not allow
> creating container-bound script projects through any API.

1. Open your **BudgetPulse Google Sheet**
2. In the top menu click **Extensions → Apps Script**

   ![Extensions menu](https://i.imgur.com/placeholder.png)
   *(Google will open the Apps Script editor in a new tab)*

3. You will see an empty project called "BudgetPulse". **Do not paste any code** —
   the pipeline will push all files automatically
4. Look at the URL in your browser:
   ```
   https://script.google.com/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms/edit
                                   ↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑
                                   Copy this — this is your Script ID
   ```
5. Copy the Script ID and save it somewhere — you will need it in Steps 3 and 4
6. Close the Apps Script tab

---

## Step 2 — Get a clasp OAuth Token (one time, local)

Run this in your terminal from the project root:

```bash
cd /Users/prashant228/Documents/Projects/budget-tracker-app
npm run clasp:login
```

A browser window will open. Sign in with your **Google account that owns the
BudgetPulse Sheet** and click Allow.

Once done, read your token:

```bash
cat ~/.clasprc.json
```

You will see something like:

```json
{
  "token": {
    "access_token": "ya29.a0AfH6...",
    "refresh_token": "1//0g...",
    "token_type": "Bearer",
    ...
  }
}
```

Copy the **`access_token`** value (starts with `ya29.`). You will need it in Step 3.

> ⚠️ Personal access tokens expire in ~1 hour. This is fine for the initial
> setup. For a permanent CI solution, see the **Service Account** section at
> the bottom of this document.

---

## Step 3 — Add GitHub Secrets

Go to your GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**

Add these two secrets:

### Secret 1: `APPS_SCRIPT_ID`
Paste the Script ID you copied in Step 1.

```
1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms   ← example, use your real ID
```

### Secret 2: `CLASP_ACCESS_TOKEN`
Paste the `access_token` value you copied in Step 2.

```
ya29.a0AfH6SMB...   ← example, use your real token
```

---

## Step 4 — Fill in `.clasp.json` for Local Deploys

Open `scripts/apps-script/.clasp.json` and replace the placeholder with your real Script ID:

```json
{
  "scriptId": "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms",
  "rootDir": ".",
  "filePushOrder": ["Config.gs", "Helpers.gs", "Sync.gs", "Alerts.gs", "Notifications.gs"]
}
```

> `.clasp.json` is gitignored so your Script ID stays off GitHub. In CI the
> Script ID comes from the `APPS_SCRIPT_ID` secret instead.

---

## Step 5 — Validate and Deploy

Run a dry-run first to confirm all guardrails pass:

```bash
npm run deploy:gs:dry
```

Expected output:
```
[deploy-gs] ✅ All 5 required .gs files present.
[deploy-gs] ✅ No forbidden patterns detected.
[deploy-gs] ─── DRY RUN — No files were pushed ───
[deploy-gs]   Config.gs            4.9 KB
[deploy-gs]   Helpers.gs           7.0 KB
[deploy-gs]   Sync.gs              10.1 KB
[deploy-gs]   Alerts.gs            9.1 KB
[deploy-gs]   Notifications.gs     17.9 KB
[deploy-gs] ✅ Dry run complete — all guardrails passed.
```

Then do the real deploy:

```bash
npm run deploy:gs
```

Open your Apps Script project and verify all 5 files are there with your code.

---

## Step 6 — From Now On: Just Push to Git

Every time you edit a `.gs` file and push to `main`, GitHub Actions automatically:

1. Validates all files and patterns (dry-run guardrail)
2. Pushes to your Apps Script project via clasp

```bash
# Example: after fixing Sync.gs
git add scripts/apps-script/Sync.gs
git commit -m "fix: sync reads monthly_amount from correct column"
git push
# → GitHub Actions deploys automatically within ~60 seconds
```

You can watch it live in the **Actions** tab of your GitHub repo.

---

## How the Pipeline Works

```
git push to main (touching any .gs file)
        │
        ▼
GitHub Actions: .github/workflows/deploy-apps-script.yml
        │
        ├─ npm ci                     (installs clasp from devDependencies)
        ├─ deploy:gs:dry              (validates files + forbidden patterns)
        └─ deploy:gs                  (clasp push → Apps Script project)
```

Files pushed in this order (defined in `scripts/deploy-apps-script.mjs`):

| Order | File | Purpose |
|-------|------|---------|
| 1 | `Config.gs` | Sheet names, column indices, config keys |
| 2 | `Helpers.gs` | Logging, date utils, sheet helpers |
| 3 | `Sync.gs` | Budget sync from joint-spend Recurring_Items |
| 4 | `Alerts.gs` | 80% threshold budget alerts |
| 5 | `Notifications.gs` | Weekly/monthly email reports |

---

## Adding a New .gs File

1. Create the file in `scripts/apps-script/YourNew.gs`
2. Add its filename to `REQUIRED_GS_FILES` in `scripts/deploy-apps-script.mjs`
3. Add it to `filePushOrder` in `scripts/apps-script/.clasp.json`
4. Push to `main` — it deploys automatically

The deploy will **refuse to run** if a file is listed in `REQUIRED_GS_FILES` but
missing from disk, preventing accidental partial deploys.

---

## Guardrails Reference

| Guardrail | What it checks |
|-----------|---------------|
| Script ID set | `APPS_SCRIPT_ID` env or `.clasp.json` must have a real ID (not placeholder) |
| File manifest | Every file in `REQUIRED_GS_FILES` must exist on disk |
| Forbidden patterns | No `console.log`, `debugger`, `TODO DEPLOY`, or `__PLACEHOLDER__` |
| Dry-run first | CI always validates before pushing |
| CI fast-fail | Any error exits non-zero and blocks the deploy |

---

## Troubleshooting

**`scriptId is still the placeholder`**
→ Fill in `scripts/apps-script/.clasp.json` or set the `APPS_SCRIPT_ID` env var / GitHub secret

**`Missing required .gs files`**
→ Create the missing file or remove it from `REQUIRED_GS_FILES` in the deploy script

**`clasp push failed with auth error`**
→ Your `CLASP_ACCESS_TOKEN` has expired (~1 hour for personal tokens)
→ Re-run `npm run clasp:login`, copy the new `access_token`, update the GitHub secret

**`Forbidden patterns found`**
→ Fix the flagged line in the `.gs` file (e.g. replace `console.log` with `logInfo()`)

**`getActiveSpreadsheet() returns null`**
→ The Apps Script project is not container-bound — it was created as a standalone script
→ Delete it, open the BudgetPulse Sheet → Extensions → Apps Script to create a bound one

---

## Permanent CI: Service Account Token

This is the recommended approach — the service account key never expires and
no manual token rotation is needed.

### What you need to have done (prerequisites)
- ✅ Created the service account in GCP Console
- ✅ Linked the Apps Script project to the same GCP project (via Project Settings → GCP Project number)
- ✅ Shared the Apps Script project (via Google Drive) with the service account email as Editor
- ✅ Shared the BudgetPulse Google Sheet with the service account email as Editor

### Step A — Enable Apps Script API in GCP

1. Go to [GCP Console → APIs & Services → Library](https://console.cloud.google.com/apis/library)
2. Search for **Apps Script API**
3. Click it → **Enable**

> Without this, the service account cannot push to any Apps Script project regardless of sharing.

### Step B — Download the Service Account JSON Key

1. Go to [GCP Console → Service Accounts](https://console.cloud.google.com/iam-admin/serviceaccounts)
2. Click your service account → **Keys** tab
3. **Add Key → Create new key → JSON** → Download
4. Open the file and copy its **entire contents**

The file looks like this:
```json
{
  "type": "service_account",
  "project_id": "your-project",
  "private_key_id": "abc123",
  "private_key": "-----BEGIN RSA PRIVATE KEY-----\n...",
  "client_email": "budgetpulse-ci@your-project.iam.gserviceaccount.com",
  ...
}
```

### Step C — Add GitHub Secrets

Go to your repo → **Settings → Secrets and variables → Actions → New repository secret**

| Secret name | Value |
|-------------|-------|
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Paste the entire JSON key file contents |
| `APPS_SCRIPT_ID` | Your Apps Script project ID from the URL |

### How the workflow uses it

The `google-github-actions/auth@v2` action in the workflow automatically:
1. Reads `GOOGLE_SERVICE_ACCOUNT_JSON`
2. Signs a JWT with the private key
3. Exchanges it for a **fresh access token** (valid for 1 hour)
4. Passes it to `deploy-apps-script.mjs` as `CLASP_ACCESS_TOKEN`

Because a fresh token is minted on every run, expiry is never an issue.
