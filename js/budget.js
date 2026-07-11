// =====================================================
// ANNIDA2FINANCE - Budget Module
// =====================================================
import supabaseClient from './supabase.js';
import { formatCurrency } from './utils.js';

export async function fetchBudgets(userId, year, month) {
  const { data, error } = await supabaseClient
    .from('budgets').select('*, categories(id, name, icon, color)')
    .eq('year', year).eq('month', month);
  if (error) return [];
  return data || [];
}

export async function fetchBudgetSpending(userId, year, month) {
  const mm = String(month).padStart(2, '0');
  const start = `${year}-${mm}-01`;
  const end = `${year}-${mm}-${new Date(year, month, 0).getDate()}`;
  const { data, error } = await supabaseClient
    .from('transactions').select('amount, category_id')
    .eq('type', 'expense').gte('date', start).lte('date', end);
  if (error) return {};
  const spending = {};
  (data || []).forEach(t => {
    if (!spending[t.category_id]) spending[t.category_id] = 0;
    spending[t.category_id] += Number(t.amount);
  });
  return spending;
}

export async function upsertBudget(userId, categoryId, amount, month, year) {
  const { data, error } = await supabaseClient.from('budgets')
    .upsert({ user_id: userId, category_id: categoryId, amount: Number(amount), month, year },
      { onConflict: 'user_id,category_id,month,year' })
    .select().single();
  if (error) throw error;
  return data;
}

export async function deleteBudget(id) {
  const { error } = await supabaseClient.from('budgets').delete().eq('id', id);
  if (error) throw error;
}

export function renderBudgetCards(budgets, spending, canEdit = true) {
  const grid = document.getElementById('budget-grid');
  if (!grid) return;
  if (!budgets || !budgets.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;padding:3rem;">
      <div class="empty-state-icon">🎯</div>
      <div class="empty-state-title">Belum ada budget bulan ini</div>
      <div class="empty-state-desc">${canEdit ? 'Klik "+ Tambah Budget" untuk mulai merencanakan keuanganmu.' : 'Belum ada data.'}</div>
    </div>`;
    return;
  }

  grid.innerHTML = budgets.map(b => {
    const spent = spending[b.category_id] || 0;
    const progress = Math.min((spent / b.amount) * 100, 100);
    const sisa = b.amount - spent;
    let colorVar = '--income-color';
    if (progress > 90) colorVar = '--expense-color';
    else if (progress > 75) colorVar = '--warning-color';

    const actionHtml = canEdit ? `<div class="budget-card-actions">
        <button class="table-action-btn edit" onclick="editBudget('${b.id}', '${b.category_id}', ${b.amount})" title="Edit Budget">✏️</button>
        <button class="table-action-btn delete" onclick="confirmDeleteBudget('${b.id}')" title="Hapus Budget">🗑️</button>
      </div>` : '';

    return `
      <div class="budget-card">
        <div class="budget-card-header">
          <div class="budget-category">
            <span class="budget-icon">${b.categories?.icon || '💰'}</span>
            <span class="budget-name">${b.categories?.name || 'Kategori'}</span>
          </div>
          ${actionHtml}
        </div>
        <div class="budget-amounts">
          <div class="budget-spent" style="color:var(${colorVar})">${formatCurrency(spent)}</div>
          <div class="budget-total">/ ${formatCurrency(b.amount)}</div>
        </div>
        <div class="budget-progress-bar">
          <div class="budget-progress-fill" style="width:${progress}%;background:var(${colorVar})"></div>
        </div>
        <div class="budget-status">
          ${sisa >= 0 ? `Sisa: ${formatCurrency(sisa)}` : `<span style="color:var(--expense-color)">Overbudget: ${formatCurrency(Math.abs(sisa))}</span>`}
        </div>
      </div>
    `;
  }).join('');
}

export function renderBudgetOverview(budgets, spending) {
  const el = document.getElementById('budget-overview');
  if (!el) return;
  if (!budgets.length) {
    el.innerHTML = `<div class="empty-state" style="padding:1.5rem"><div class="empty-state-icon">💰</div><div class="empty-state-title" style="font-size:.9rem">Belum ada budget</div></div>`;
    return;
  }
  el.innerHTML = budgets.slice(0, 5).map(b => {
    const cat = b.categories;
    const spent = spending[b.category_id] || 0;
    const budget = Number(b.amount);
    const percent = budget > 0 ? Math.min((spent / budget) * 100, 100) : 0;
    let fillClass = '';
    if (percent >= 100) fillClass = 'danger';
    else if (percent >= 80) fillClass = 'warning';
    return `<div class="budget-item">
      <div class="budget-item-header">
        <div class="budget-item-label"><span class="budget-item-emoji">${cat?.icon || '💰'}</span>${cat?.name || 'Kategori'}</div>
        <div class="budget-item-amount"><span>${formatCurrency(spent)}</span> / ${formatCurrency(budget)}</div>
      </div>
      <div class="progress-bar"><div class="progress-fill ${fillClass}" style="width:${percent}%"></div></div>
    </div>`;
  }).join('');
}

export function updateBudgetSummary(budgets, spending) {
  const el = document.getElementById('budget-total-amount');
  const spentEl = document.getElementById('budget-total-spent');
  const totalBudget = budgets.reduce((s, b) => s + Number(b.amount), 0);
  const totalSpent = budgets.reduce((s, b) => s + (spending[b.category_id] || 0), 0);
  if (el) el.textContent = formatCurrency(totalBudget);
  if (spentEl) spentEl.textContent = `${formatCurrency(totalSpent)} telah digunakan`;
}
