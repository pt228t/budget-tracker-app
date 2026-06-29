# BudgetPulse

BudgetPulse is a zero-backend budgeting app that stores all data in a Google Sheet.
The web app runs on GitHub Pages, signs users in with Google OAuth, and then reads
and writes directly to the linked spreadsheet.

## What you need before using the app

- A Google account
- A Google Sheet that will act as the BudgetPulse workbook
- Edit access to that sheet if you need to update data

When you sign in for the first time, approve all requested Google permissions.

BudgetPulse asks for:

- Google Sheets access
- Google Drive read access
- Email address
- Basic profile

These permissions are needed so the app can:

- find an existing BudgetPulse workbook
- verify that the required tabs exist
- create missing tabs when needed
- keep the allowed user list updated

## How the app chooses which sheet to use

On startup, BudgetPulse chooses the spreadsheet in this order:

1. `spreadsheetId` or `sheetId` in the app URL
2. `VITE_BUDGETPULSE_SHEET_ID` from the deployed build
3. the last sheet ID saved in this browser's local storage
4. a Google Drive search for a spreadsheet named `BudgetPulse`
5. create a new sheet if nothing valid is found

This is important because browser local storage is different on every device and browser.

## Best ways to use the app

### 1. One person, one device

Use the app normally.
After the first successful setup, this browser remembers the workbook ID.

### 2. One person, multiple devices

Recommended setup:

1. Use the same Google account everywhere
2. Deploy the app with one canonical sheet ID
3. Let every device point to that same sheet

Best option:

- set `BUDGETPULSE_SHEET_ID` in GitHub Secrets so the deployed app always knows the canonical workbook

### 3. More than one person sharing the app

Recommended setup:

1. Pick one Google Sheet as the source of truth
2. Share that sheet with every user
3. Give edit access to people who should be able to change data
4. Set `BUDGETPULSE_SHEET_ID` in GitHub Secrets
5. Redeploy the app

This is the safest way to make sure all users, devices, and browsers use the same workbook.

## First-time sharing flow for multiple people

If you want more than one person to use BudgetPulse:

1. Open the correct Google Sheet
2. Copy its spreadsheet ID from the URL
3. Share the sheet with all intended users
4. Set GitHub secret `BUDGETPULSE_SHEET_ID` to that spreadsheet ID
5. Push to `main` so GitHub Pages rebuilds
6. Ask users to open the app and sign in with Google
7. Ask users to approve all requested permissions

If this is configured correctly, everyone should land on the same workbook.

## Alternate sharing option: pass the sheet in the URL

You can also send users a link like this:

```text
https://your-app-url/?spreadsheetId=1AbCdEfGhIjKlMnOpQrStUvWxYz
```

BudgetPulse also accepts a full Google Sheets URL in that parameter and normalizes it.

Use this when:

- you want a one-off shared link
- you want to test a different workbook temporarily
- you do not want to redeploy immediately

## How bootstrap works

Bootstrap runs automatically after sign-in.

During bootstrap, BudgetPulse:

1. picks the target spreadsheet
2. loads the existing tabs
3. checks whether all required tabs exist
4. creates missing tabs if needed
5. writes default `App_Config` values when required
6. updates the allowed user list when appropriate

If the sheet is already correct, bootstrap only verifies it and continues.

## If a new sheet gets created by mistake

This can happen when:

- a user signs in from a new browser
- local storage is empty
- the app does not know the canonical sheet ID
- Drive search finds the wrong file or finds nothing

If that happens, do not keep using the wrong sheet.
Switch back to the original workbook from `Settings`.

## How to repair the app using Settings

BudgetPulse has a built-in repair flow in `Settings`.

Use this if:

- the app linked to the wrong sheet
- a duplicate sheet was created
- you want to switch back to the original workbook

Steps:

1. Open the app
2. Go to `Settings`
3. Find `Spreadsheet Configuration & Sync`
4. Paste either:
   - the original spreadsheet ID
   - or the full Google Sheets URL
5. Click `Save & Verify`
6. Wait for the result message

What `Save & Verify` does:

1. stores the new sheet ID temporarily
2. runs bootstrap on that sheet
3. verifies that the required tabs exist
4. keeps the new sheet only if verification succeeds
5. restores the old sheet ID automatically if verification fails

Success message:

- `Spreadsheet verified successfully! All tabs are intact.`

Failure message:

- `Verification failed: ...`

If verification fails, the previous workbook is restored automatically.

## How to recover if you know the old sheet ID

If you already know the original workbook ID:

1. Copy the old sheet ID from the Google Sheets URL
2. Open BudgetPulse
3. Go to `Settings`
4. Paste the old ID or full sheet URL
5. Click `Save & Verify`
6. Use the `Open in Google Sheets` link shown there to confirm it is the correct workbook

## What `Sync Now` does

The `Sync Now` button in `Settings` runs a manual category sync from the configured source.

Use it when:

- you have just switched sheets
- you want to refresh categories immediately
- you want to confirm the new workbook is syncing correctly

## Required GitHub secrets

For the web app:

- `GOOGLE_CLIENT_ID`
- `BUDGETPULSE_SHEET_ID`

Legacy fallback still supported:

- `JOINT_SPEND_SHEET_ID`

For Apps Script deployment:

- `APPS_SCRIPT_ID`
- `CLASPRC_JSON`
- `BUDGETPULSE_SHEET_ID`

Legacy fallback still supported there too:

- `JOINT_SPEND_SHEET_ID`

## Local development

Install dependencies:

```bash
npm ci
```

Run locally:

```bash
npm run dev
```

Preview the production build:

```bash
npm run preview
```

## Tests

Run all tests:

```bash
npm test
```

Run unit tests:

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

## Deployment

### Web app

Push to `main`.
GitHub Pages deploy runs from `.github/workflows/deploy.yml`.

### Apps Script

Push changes under `scripts/apps-script/` or `scripts/deploy-apps-script.mjs`.
Apps Script deploy runs from `.github/workflows/deploy-apps-script.yml`.

Manual deploy:

```bash
npm run deploy:gs
```

Dry run:

```bash
npm run deploy:gs:dry
```

## Quick guide for a stable shared setup

If you want the app to work properly for multiple users, do this:

1. Decide which Google Sheet is the real BudgetPulse workbook
2. Share that sheet with all users
3. Set `BUDGETPULSE_SHEET_ID` in GitHub Secrets
4. Push to `main`
5. Let GitHub Pages redeploy
6. Ask each user to sign in and approve all requested permissions
7. If anyone lands on the wrong sheet, repair it from `Settings` using `Save & Verify`

That gives you one shared workbook across users, browsers, and devices.
