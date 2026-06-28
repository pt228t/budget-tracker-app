import { getAuthorizedUsers, addAuthorizedUser, removeAuthorizedUser } from './sheets-api.js';

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
