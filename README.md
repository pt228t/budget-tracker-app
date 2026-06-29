# BudgetPulse

BudgetPulse is a zero-backend budgeting app that stores its data in a Google Sheet.
The web app runs on GitHub Pages, authenticates with Google OAuth, and reads or writes
directly to the linked spreadsheet.

## What this app needs

- A Google account that can sign in to the app
- A Google Sheet that will act as the BudgetPulse workbook
- Permission to edit that sheet if you want to add or change data

On first sign-in, approve all requested Google permissions.
BudgetPulse currently asks for:

- Google Sheets access
- Google Drive read access
- Basic profile
- Email address

These permissions are required so the app can:

- locate an existing BudgetPulse workbook
- verify that the required tabs exist
- create missing tabs when needed
- keep the allowed user list in sync

## How BudgetPulse chooses a sheet

When the app starts, it tries to find the workbook in this order:

1. `spreadsheetId` or `sheetId` in the app URL
2. the build-time value in `VITE_BUDGETPULSE_SHEET_ID`
3. the last sheet saved in this browser's local storage
4. a Google Drive search for a spreadsheet named `BudgetPulse`
5. create a new spreadsheet if nothing valid is found

This matters because different people and different devices do not share browser
local storage.

## Recommended ways to use the app

### 1. Single person, one device

Use the app normally.
After the first successful setup, this browser remembers the workbook ID.

### 2. Single person, multiple devices

Recommended:

- use the same Google account everywhere
- deploy with a canonical sheet ID using `VITE_BUDGETPULSE_SHEET_ID`

Without a canonical sheet ID, a new browser may fall back to Drive search.
That can still work, but it is less deterministic.

### 3. Shared by more than one person

Recommended:

1. Pick one canonical Google Sheet
2. Share that sheet with every user who should use BudgetPulse
3. Give them edit access if they need to change data
4. Deploy the app with the canonical sheet ID

For shared usage, do not rely only on local storage.
Use one of these two approaches:

- Best for production: set `VITE_BUDGETPULSE_SHEET_ID`
- Good for one-off sharing: send the app URL with `?spreadsheetId=<sheet-id-or-full-sheet-url>`

Example:

```text
https://your-app-url/?spreadsheetId=1AbCdEfGhIjKlMnOpQrStUvWxYz
```

You can also pass the full Google Sheets URL. BudgetPulse normalizes it.

## Bootstrap behavior

Bootstrap happens automatically after sign-in.

During bootstrap, BudgetPulse:

1. chooses the target spreadsheet
2. loads the spreadsheet tabs
3. checks the required tabs
4. creates missing tabs if needed
5. writes default `App_Config` values if required
6. adds the signed-in user to `allowed_users` when appropriate

If the target spreadsheet is already correct and complete, bootstrap only verifies it.

## If an old sheet exists but a new sheet was created by mistake

This can happen if:

- a user signs in from a fresh browser or device
- the browser has no saved workbook ID
- Drive search finds the wrong sheet or finds nothing

### Recovery using Settings

BudgetPulse includes a safe repair flow in `Settings`.

Use this when you know the original workbook ID and want to switch back to it.

Steps:

1. Open the app
2. Go to `Settings`
3. In `Spreadsheet Configuration & Sync`, paste either:
   - the original spreadsheet ID
   - or the full Google Sheets URL
4. Click `Save & Verify`
5. Wait for the verification message

What happens internally:

- BudgetPulse stores the new sheet ID temporarily
- it runs bootstrap against that sheet
- if verification succeeds, the new sheet becomes the active workbook
- if verification fails, the previous sheet ID is restored automatically

Success message:

- `Spreadsheet verified successfully! All tabs are intact.`

Failure message:

- `Verification failed: ...`

This means the app did not switch permanently and your previous sheet link was restored.

### Recovery checklist

If you need to repair a mistaken sheet switch:

1. Open the original sheet in Google Sheets
2. Copy its spreadsheet ID from the URL
3. Go to BudgetPulse `Settings`
4. Paste the ID or full URL
5. Click `Save & Verify`
6. Use the `Open in Google Sheets` link to confirm you are on the correct workbook

## Sync button in Settings

The `Sync Now` button runs a manual category sync from the configured source.
Use it after changing the linked workbook or when you want to force a fresh sync.

## Production configuration

### Front-end deployment

GitHub Pages builds the app from `.github/workflows/deploy.yml`.

The build uses:

- `GOOGLE_CLIENT_ID`
- `BUDGETPULSE_SHEET_ID` if present
- otherwise `JOINT_SPEND_SHEET_ID` as a legacy fallback

Recommended GitHub secrets:

- `GOOGLE_CLIENT_ID`
- `BUDGETPULSE_SHEET_ID`

Legacy fallback still accepted:

- `JOINT_SPEND_SHEET_ID`

### Apps Script deployment

Apps Script deploys from `.github/workflows/deploy-apps-script.yml`.

The deploy script now prefers:

- `BUDGETPULSE_SHEET_ID`

But still accepts:

- `JOINT_SPEND_SHEET_ID`

This keeps older deployments working while giving the project a clearer sheet secret name.

## Local development

Install dependencies:

```bash
npm ci
```

Run the app locally:

```bash
npm run dev
```

Preview the production build locally:

```bash
npm run preview
```

## Testing

Run all tests:

```bash
npm test
```

Run only unit tests:

```bash
npm run test:unit
```

Run end-to-end tests:

```bash
npm run test:e2e
```

Build the app:

```bash
npm run build
```

## Deploying

### Web app

Push to `main`.
GitHub Pages deploy runs automatically from `.github/workflows/deploy.yml`.

### Apps Script

Push changes under `scripts/apps-script/` or `scripts/deploy-apps-script.mjs`.
The Apps Script workflow runs automatically from `.github/workflows/deploy-apps-script.yml`.

You can also deploy manually:

```bash
npm run deploy:gs
```

Dry run:

```bash
npm run deploy:gs:dry
```

## Practical sharing guide

If you want the app to work cleanly for multiple people, use this setup:

1. Create or pick the one Google Sheet that should be the source of truth
2. Share that sheet with all users
3. Set `BUDGETPULSE_SHEET_ID` in GitHub Secrets
4. Push to `main` so GitHub Pages rebuilds with that sheet ID
5. Ask users to sign in and approve all requested Google permissions
6. If any user lands on the wrong sheet, repair it from `Settings` using `Save & Verify`

That gives you one shared workbook across users, browsers, and devices.
