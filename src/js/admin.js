import { getAuthorizedUsers, addAuthorizedUser, removeAuthorizedUser, getSpreadsheetId, setSpreadsheetId } from './sheets-api.js';
import { bootstrapSpreadsheet } from './setup.js';
import { syncCategoriesFromSource } from './categories.js';

export function validateAdminEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function renderAdminPanel(users, currentUserEmail) {
  const userRows = users.length
    ? users
        .map(email => {
          const isSelf = email.toLowerCase() === currentUserEmail.toLowerCase();
          const removeBtn = isSelf
            ? ''
            : `<button class="btn btn-sm btn-danger" data-remove-user="${email}" type="button">Remove</button>`;
          return `<li class="admin-user-row"><span class="admin-user-email">${email}</span>${removeBtn}</li>`;
        })
        .join('')
    : '<li class="admin-user-empty">No authorized users</li>';

  return `
    <div class="admin-panel">
      <h3 class="admin-panel-title">Authorized Users</h3>
      <ul class="admin-user-list">${userRows}</ul>
      <form data-admin-add-form class="admin-add-form">
        <input
          data-admin-email-input
          type="email"
          placeholder="Add user email"
          class="form-input"
          required
        />
        <button data-admin-submit type="submit" class="btn btn-primary">Add</button>
      </form>
      <p data-admin-error class="admin-error" style="display:none"></p>
    </div>
  `;
}

export async function initAdminPanel(containerId, currentUserEmail) {
  const container = document.getElementById(containerId);
  if (!container) return;

  async function refresh() {
    const users = await getAuthorizedUsers();
    container.innerHTML = renderAdminPanel(users, currentUserEmail);
    wireEvents();
  }

  function wireEvents() {
    const form = container.querySelector('[data-admin-add-form]');
    if (form) {
      form.addEventListener('submit', async e => {
        e.preventDefault();
        const input = container.querySelector('[data-admin-email-input]');
        const email = input?.value?.trim() ?? '';
        if (!validateAdminEmail(email)) {
          input.setCustomValidity('Enter a valid email address');
          input.reportValidity();
          return;
        }
        input.setCustomValidity('');
        const errEl = container.querySelector('[data-admin-error]');
        if (errEl) { errEl.textContent = ''; errEl.style.display = 'none'; }
        form.querySelector('[data-admin-submit]').disabled = true;
        try {
          await addAuthorizedUser(email);
          input.value = '';
          await refresh();
        } catch (err) {
          console.error('[Admin] addAuthorizedUser failed:', err);
          if (errEl) { errEl.textContent = `Failed to add user: ${err.message}`; errEl.style.display = ''; }
        } finally {
          const submit = form.querySelector('[data-admin-submit]');
          if (submit) submit.disabled = false;
        }
      });
    }

    container.querySelectorAll('[data-remove-user]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const email = btn.dataset.removeUser;
        btn.disabled = true;
        try {
          await removeAuthorizedUser(email);
          await refresh();
        } catch {
          btn.disabled = false;
        }
      });
    });
  }

  await refresh();
}

/**
 * Initializes the settings configuration panel.
 * Handles display/rebind of Spreadsheet ID, and manual trigger of budget sync.
 *
 * @param {string} containerId
 */
export async function initSettingsPanel(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const currentId = getSpreadsheetId() || '';
  
  function render() {
    container.innerHTML = `
      <div class="settings-panel" style="display: flex; flex-direction: column; gap: 20px;">
        <div>
          <label class="form-label" style="font-weight: 600;">Linked Google Spreadsheet ID</label>
          <div style="display: flex; gap: 10px; margin-top: 8px;">
            <input type="text" id="settings-sheet-id" class="form-control" value="${currentId}" placeholder="Paste a Spreadsheet ID or full Google Sheets URL" style="font-family: monospace; font-size: 0.875rem;" />
            <button type="button" id="settings-save-sheet-btn" class="btn btn-primary">Save &amp; Verify</button>
          </div>
          <p class="text-muted" style="font-size: 0.8rem; margin-top: 6px;">Use this to repair or switch sheets. Paste the original sheet ID or full Sheets URL, then click <strong>Save &amp; Verify</strong>. If verification fails, the previous sheet link is restored automatically.</p>
          ${currentId ? `<p class="text-muted" style="font-size: 0.8rem; margin-top: 6px;">Open in Google Sheets: <a href="https://docs.google.com/spreadsheets/d/${currentId}/edit" target="_blank" rel="noopener noreferrer" style="color: var(--color-brand-primary); text-decoration: underline;">${currentId}</a></p>` : ''}
          <p id="settings-verify-status" style="margin-top: 8px; font-size: 0.875rem; display: none;"></p>
        </div>

        <hr style="border: 0; border-top: 1px solid var(--color-border);" />

        <div>
          <h4 style="margin-bottom: 8px; font-weight: 600;">Manual Budget Sync</h4>
          <p class="text-secondary" style="font-size: 0.875rem; margin-bottom: 12px;">Sync budget categories and limits from your source spreadsheet configured in App_Config.</p>
          <button type="button" id="settings-sync-btn" class="btn btn-outline" ${!currentId ? 'disabled' : ''}>Sync Now</button>
          <p id="settings-sync-status" style="margin-top: 8px; font-size: 0.875rem; display: none;"></p>
        </div>
      </div>
    `;
    wireEvents();
  }

  function wireEvents() {
    const saveBtn = container.querySelector('#settings-save-sheet-btn');
    const syncBtn = container.querySelector('#settings-sync-btn');
    const input = container.querySelector('#settings-sheet-id');
    const verifyStatus = container.querySelector('#settings-verify-status');
    const syncStatus = container.querySelector('#settings-sync-status');

    saveBtn.addEventListener('click', async () => {
      const newId = input.value.trim();
      if (!newId) {
        verifyStatus.textContent = 'Please enter a spreadsheet ID or full Google Sheets URL.';
        verifyStatus.className = 'text-danger';
        verifyStatus.style.display = '';
        return;
      }

      saveBtn.disabled = true;
      saveBtn.textContent = 'Verifying…';
      verifyStatus.style.display = 'none';

      try {
        const oldId = getSpreadsheetId();
        setSpreadsheetId(newId);

        // Run bootstrap check
        const report = await bootstrapSpreadsheet();
        if (report.ready) {
          verifyStatus.textContent = 'Spreadsheet verified successfully! All tabs are intact.';
          verifyStatus.className = 'text-success';
          verifyStatus.style.display = '';
          
          // Re-enable sync button if disabled
          if (syncBtn) syncBtn.disabled = false;
        } else {
          setSpreadsheetId(oldId || ''); // Restore old ID
          verifyStatus.textContent = `Verification failed: ${report.errors.join(', ')}`;
          verifyStatus.className = 'text-danger';
          verifyStatus.style.display = '';
        }
      } catch (err) {
        verifyStatus.textContent = `Error verifying spreadsheet: ${err.message}`;
        verifyStatus.className = 'text-danger';
        verifyStatus.style.display = '';
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save & Verify';
      }
    });

    if (syncBtn) {
      syncBtn.addEventListener('click', async () => {
        syncBtn.disabled = true;
        syncBtn.textContent = 'Syncing…';
        syncStatus.style.display = 'none';

        try {
          const result = await syncCategoriesFromSource();
          syncStatus.innerHTML = `Sync completed successfully!<br/>
            Added: <strong>${result.added}</strong> &middot; 
            Updated: <strong>${result.updated}</strong> &middot; 
            Archived: <strong>${result.archived}</strong> &middot; 
            Unchanged: <strong>${result.unchanged}</strong>`;
          syncStatus.className = 'text-success';
          syncStatus.style.display = '';
        } catch (err) {
          syncStatus.textContent = `Sync failed: ${err.message}`;
          syncStatus.className = 'text-danger';
          syncStatus.style.display = '';
        } finally {
          syncBtn.disabled = false;
          syncBtn.textContent = 'Sync Now';
        }
      });
    }
  }

  render();
}
