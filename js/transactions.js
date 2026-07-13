// =====================================================
// ANNIDA2FINANCE - Transactions Module
// =====================================================
import supabaseClient from './supabase.js';
import { formatCurrency, formatDate, showToast, escapeHTML } from './utils.js';

let allCategories = [];
const PAGE_SIZE = 10;

// ── Fetch categories ──────────────────────────────
export async function fetchCategories(userId) {
  const { data, error } = await supabaseClient
    .from('categories').select('*').order('name');
  if (error) return [];
  allCategories = data || [];
  return allCategories;
}

export function getAllCategories() { return allCategories; }

// ── Fetch transactions ────────────────────────────
export async function fetchTransactions(userId, filters = {}, page = 1, pageSize = PAGE_SIZE) {
  let query = supabaseClient
    .from('transactions')
    .select('*, categories(id, name, icon, color, type)', { count: 'exact' })
    .order('date', { ascending: false })
    .order('created_at', { ascending: false });

  if (filters.type) query = query.eq('type', filters.type);
  if (filters.categoryId) query = query.eq('category_id', filters.categoryId);
  if (filters.month) {
    const [year, month] = filters.month.split('-');
    const start = `${year}-${month}-01`;
    const endDate = new Date(year, parseInt(month), 0);
    const end = `${year}-${month}-${endDate.getDate()}`;
    query = query.gte('date', start).lte('date', end);
  }
  if (filters.search) query = query.ilike('description', `%${filters.search}%`);

  const from = (page - 1) * pageSize;
  query = query.range(from, from + pageSize - 1);

  const { data, error, count } = await query;
  if (error) { console.error('fetchTransactions error:', error); return { data: [], count: 0 }; }
  return { data: data || [], count: count || 0 };
}

// ── Monthly summary ───────────────────────────────
export async function fetchMonthlySummary(userId, year, month) {
  let query = supabaseClient.from('transactions').select('amount, type');
  if (year && month) {
    const mm = String(month).padStart(2, '0');
    const start = `${year}-${mm}-01`;
    const end = `${year}-${mm}-${new Date(year, month, 0).getDate()}`;
    query = query.gte('date', start).lte('date', end);
  }
  const { data, error } = await query;
  if (error) return { income: 0, expense: 0 };
  const income = data.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
  const expense = data.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);
  return { income, expense };
}

// ── 6-month trend ─────────────────────────────────
export async function fetchMonthlyTrend(userId) {
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(); d.setMonth(d.getMonth() - i);
    months.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
  }
  const summaries = await Promise.all(months.map(m => fetchMonthlySummary(userId, m.year, m.month)));
  return {
    labels: months.map(m => new Date(m.year, m.month - 1).toLocaleDateString('id-ID', { month: 'short' })),
    income: summaries.map(s => s.income),
    expense: summaries.map(s => s.expense),
  };
}

// ── Category breakdown for donut chart ───────────
export async function fetchCategoryBreakdown(userId, year, month) {
  let query = supabaseClient
    .from('transactions').select('amount, categories(name, color)')
    .eq('type', 'expense');
  if (year && month) {
    const mm = String(month).padStart(2, '0');
    const start = `${year}-${mm}-01`;
    const end = `${year}-${mm}-${new Date(year, month, 0).getDate()}`;
    query = query.gte('date', start).lte('date', end);
  }
  const { data, error } = await query;
  if (error || !data) return [];
  const grouped = {};
  data.forEach(t => {
    const name = t.categories?.name || 'Lainnya';
    const color = t.categories?.color || '#64748b';
    if (!grouped[name]) grouped[name] = { name, color, total: 0 };
    grouped[name].total += Number(t.amount);
  });
  return Object.values(grouped).sort((a, b) => b.total - a.total).slice(0, 6);
}

// ── Recent transactions ───────────────────────────
export async function fetchRecentTransactions(userId, limit = 5) {
  const { data, error } = await supabaseClient
    .from('transactions').select('*, categories(name, icon, color, type)')
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return [];
  return data || [];
}

// ── CRUD ─────────────────────────────────────────
export async function addTransaction(userId, payload) {
  const { data, error } = await supabaseClient
    .from('transactions').insert([{ ...payload, user_id: userId }]).select().single();
  if (error) throw error;
  return data;
}

export async function updateTransaction(id, payload) {
  const { data, error } = await supabaseClient
    .from('transactions').update(payload).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteTransaction(id) {
  const { error } = await supabaseClient.from('transactions').delete().eq('id', id);
  if (error) throw error;
}

// ── Render table ──────────────────────────────────
export function renderTransactionsTable(transactions, canEdit = true) {
  const tbody = document.getElementById('transactions-tbody');
  const thAksi = document.getElementById('th-aksi');
  if (!tbody) return;
  if (!canEdit && thAksi) thAksi.style.display = 'none';

  if (!transactions.length) {
    tbody.innerHTML = `<tr><td colspan="${canEdit ? 7 : 6}"><div class="empty-state"><div class="empty-state-icon">💸</div><div class="empty-state-title">Belum ada transaksi</div><div class="empty-state-desc">Belum ada data yang bisa ditampilkan</div></div></td></tr>`;
    return;
  }
  tbody.innerHTML = transactions.map(t => {
    const cat = t.categories;
    const isIncome = t.type === 'income';
    const actionHtml = canEdit ? `<td><div class="table-actions">
        <button class="table-action-btn edit" onclick="editTransaction('${t.id}')" title="Edit">✏️</button>
        <button class="table-action-btn delete" onclick="confirmDeleteTransaction('${t.id}')" title="Hapus">🗑️</button>
      </div></td>` : '';
      
    return `<tr>
      <td><span style="font-size:1.2rem">${cat?.icon || '💰'}</span></td>
      <td><div style="font-weight:600;color:var(--text-primary);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;line-height:1.4;padding-right:1rem;" title="${escapeHTML(t.description)}">${escapeHTML(t.description)}</div></td>
      <td>${formatDate(t.date)}</td>
      <td><span class="badge" style="background:var(--bg-secondary);color:var(--text-secondary);font-weight:500;">${cat?.name || 'Lainnya'}</span></td>
      <td><span class="badge ${isIncome ? 'badge-income' : 'badge-expense'}">${isIncome ? '↑ Pemasukan' : '↓ Pengeluaran'}</span></td>
      <td class="transaction-amount ${t.type}">${isIncome ? '+' : '-'}${formatCurrency(t.amount)}</td>
      ${actionHtml}
    </tr>`;
  }).join('');
}

// ── Render pagination ─────────────────────────────
export function renderPagination(total, page) {
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const info = document.getElementById('pagination-info');
  const controls = document.getElementById('pagination-controls');
  if (!info || !controls) return;
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);
  info.textContent = `Menampilkan ${from}–${to} dari ${total} transaksi`;
  controls.innerHTML = `
    <button class="page-btn" ${page <= 1 ? 'disabled' : ''} onclick="goToPage(${page - 1})">‹</button>
    ${Array.from({ length: totalPages }, (_, i) => i + 1).filter(p => Math.abs(p - page) <= 2)
      .map(p => `<button class="page-btn ${p === page ? 'active' : ''}" onclick="goToPage(${p})">${p}</button>`).join('')}
    <button class="page-btn" ${page >= totalPages ? 'disabled' : ''} onclick="goToPage(${page + 1})">›</button>`;
}

// ── Populate category dropdown ────────────────────
export function populateCategoryDropdown(type, selectId = 'modal-category') {
  const select = document.getElementById(selectId);
  if (!select) return;
  const filtered = allCategories.filter(c => c.type === type);
  select.innerHTML = `<option value="">-- Pilih Kategori --</option>` +
    filtered.map(c => `<option value="${c.id}">${c.icon} ${c.name}</option>`).join('');
}

// ── Render recent (dashboard) ─────────────────────
export function renderRecentTransactions(transactions) {
  const el = document.getElementById('recent-transactions');
  if (!el) return;
  if (!transactions.length) {
    el.innerHTML = `<div class="empty-state" style="padding:2rem"><div class="empty-state-icon">📭</div><div class="empty-state-title">Belum ada transaksi</div></div>`;
    return;
  }
  el.innerHTML = transactions.map(t => {
    const cat = t.categories;
    return `<div class="transaction-item">
      <div class="transaction-icon" style="background:${cat?.color || '#64748b'}22">${cat?.icon || '💰'}</div>
      <div class="transaction-info">
        <div class="transaction-name">${escapeHTML(t.description || cat?.name || 'Transaksi')}</div>
        <div class="transaction-date">${formatDate(t.date)}</div>
      </div>
      <div class="transaction-amount ${t.type}">${t.type === 'income' ? '+' : '-'}${formatCurrency(t.amount)}</div>
    </div>`;
  }).join('');
}

export { PAGE_SIZE, allCategories };
