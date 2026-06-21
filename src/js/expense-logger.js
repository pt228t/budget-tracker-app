import { appendRow, readRange } from './sheets-api.js';
import { generateId } from '../../utils.js';

export async function initExpenseLogger(formId, listId) {
  const form = document.getElementById(formId);
  const listContainer = document.getElementById(listId);
  
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      await handleExpenseSubmit(form, listContainer);
    });
  }
  
  if (listContainer) {
    await renderTransactions(listContainer);
  }
}

export function validateExpense(data) {
  const errors = [];
  if (!data.amount || isNaN(data.amount) || Number(data.amount) <= 0) {
    errors.push('Please enter a valid amount.');
  }
  if (!data.category) {
    errors.push('Please select a category.');
  }
  if (!data.description) {
    errors.push('Please enter a vendor or description.');
  }
  return errors;
}

export async function handleExpenseSubmit(form, listContainer) {
  const submitBtn = form.querySelector('button[type="submit"]');
  const originalText = submitBtn ? submitBtn.textContent : 'Submit';
  
  try {
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Logging...';
    }
    
    const formData = new FormData(form);
    const data = {
      amount: formData.get('amount'),
      category: formData.get('category'),
      description: formData.get('description') || formData.get('vendor'),
      paid_by: formData.get('payment-source'),
      funding_source: formData.get('payment-source')
    };
    
    const errors = validateExpense(data);
    if (errors.length > 0) {
      alert(errors.join('\\n'));
      return;
    }
    
    // Create new transaction row based on SCHEMA
    // ["transaction_id", "date", "month", "amount", "category_id", "sub_category", "description", "paid_by", "funding_source", "logged_by", "logged_at", "modified_at", "notes"]
    const now = new Date();
    const isoDate = now.toISOString().split('T')[0];
    const month = isoDate.substring(0, 7);
    const transactionId = generateId('tx');
    
    const row = [
      transactionId,
      isoDate,
      month,
      data.amount,
      data.category,
      '', // sub_category
      data.description,
      data.paid_by,
      data.funding_source,
      'app_user',
      now.toISOString(),
      now.toISOString(),
      '' // notes
    ];
    
    // Optimistic UI update
    if (listContainer) {
      const tempId = 'temp-' + transactionId;
      const li = document.createElement('li');
      li.id = tempId;
      li.className = 'list-item pending-sync';
      li.innerHTML = `
        <div class="flex justify-between w-full">
          <span>${data.description} (${data.category})</span>
          <span class="text-secondary opacity-50">Logging...</span>
        </div>
      `;
      listContainer.prepend(li);
      
      // Actual API call
      await appendRow('Transactions', row);
      
      // Update UI to success
      const tempEl = document.getElementById(tempId);
      if (tempEl) {
        tempEl.className = 'list-item';
        tempEl.innerHTML = `
          <div class="flex justify-between w-full">
            <span>${data.description} <span class="badge ml-2">${data.category}</span></span>
            <span class="font-bold text-danger">-INR ${Number(data.amount).toFixed(2)}</span>
          </div>
        `;
      }
    } else {
      await appendRow('Transactions', row);
    }
    
    form.reset();
  } catch (err) {
    console.error('Failed to log expense:', err);
    alert('Failed to log expense: ' + err.message);
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = originalText;
    }
  }
}

export async function renderTransactions(container) {
  try {
    container.innerHTML = '<li class="list-item text-secondary">Loading transactions...</li>';
    const rows = await readRange('Transactions');
    
    if (!rows || rows.length <= 1) {
      container.innerHTML = '<li class="list-item text-secondary">No transactions logged yet.</li>';
      return;
    }
    
    const currentMonth = new Date().toISOString().substring(0, 7);
    
    // Skip headers, filter by month, sort newest first
    const txs = rows.slice(1)
      .filter(row => row[2] === currentMonth)
      .reverse()
      .slice(0, 10); // top 10
      
    if (txs.length === 0) {
      container.innerHTML = '<li class="list-item text-secondary">No transactions this month.</li>';
      return;
    }
    
    container.innerHTML = txs.map(row => `
      <li class="list-item">
        <div class="flex justify-between w-full">
          <span>${row[6]} <span class="badge ml-2">${row[4]}</span></span>
          <span class="font-bold text-danger">-INR ${Number(row[3]).toFixed(2)}</span>
        </div>
      </li>
    `).join('');
  } catch (err) {
    container.innerHTML = `<li class="list-item text-danger">Failed to load transactions: ${err.message}</li>`;
  }
}
