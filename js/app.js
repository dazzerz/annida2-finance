// =====================================================
// ANNIDA2FINANCE - Main App Controller (Dashboard)
// =====================================================
import supabaseClient from './supabase.js';
import { getOptionalUser, handleLogout } from './auth.js';
import { injectLayout } from './layout.js';
import { formatCurrency, formatDate, getMonthYear, showToast, setupThemeToggle, applySavedTheme } from './utils.js';
import {
  fetchCategories, fetchMonthlySummary, fetchMonthlyTrend, fetchCategoryBreakdown,
  fetchRecentTransactions, addTransaction, updateTransaction, deleteTransaction,
  renderRecentTransactions, populateCategoryDropdown,
} from './transactions.js';
import { fetchBudgets, fetchBudgetSpending, renderBudgetOverview } from './budget.js';
import { renderTrendChart, renderDonutChart, setupChartDefaults } from './charts.js';

// State Global
let currentMonth = new Date().getMonth() + 1;
let currentYear = new Date().getFullYear();
let currentUser = null;

// ── Counter animation ─────────────────────────────
function animateCounter(element, target) {
  const duration = 800;
  const start = performance.now();
  function update(ts) {
    const progress = Math.min((ts - start) / duration, 1);
    const ease = 1 - Math.pow(1 - progress, 3);
    element.textContent = formatCurrency(target * ease);
    if (progress < 1) requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
}

// ── Greeting ──────────────────────────────────────
function updateGreeting(user) {
  const hour = new Date().getHours();
  let greeting = 'Selamat Malam';
  if (hour < 12) greeting = 'Selamat Pagi';
  else if (hour < 15) greeting = 'Selamat Siang';
  else if (hour < 18) greeting = 'Selamat Sore';

  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('current-date', new Date().toLocaleDateString('id-ID', { weekday:'long', year:'numeric', month:'long', day:'numeric' }));

  if (user) {
    const fullName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'Pengguna';
    const initials = fullName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    set('greeting-text', `${greeting}, 👋`);
    set('user-name-display', fullName);
    set('nav-user-name', fullName);
    set('nav-user-email', user.email);
    set('user-avatar', initials);
  } else {
    set('greeting-text', `${greeting}, 👋`);
    set('user-name-display', 'Pengunjung');
    set('nav-user-name', 'Guest');
    set('nav-user-email', 'Read-Only Access');
    set('user-avatar', 'G');
    
    // Hide Quick Actions
    const quickActions = document.querySelector('.quick-actions');
    if (quickActions) quickActions.style.display = 'none';
    
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
      logoutBtn.innerHTML = '<span class="nav-icon">🔑</span> Login';
      logoutBtn.addEventListener('click', () => window.location.href = './login.html');
    }
    
    // Hide Transaksi and Budget in sidebar for guests
    const navTransactions = document.getElementById('nav-transactions');
    if (navTransactions) navTransactions.style.display = 'none';
    const navBudget = document.getElementById('nav-budget');
    if (navBudget) navBudget.style.display = 'none';
    
    // Hide Quick Actions / Buttons
    const addTxBtn = document.getElementById('add-transaction-btn');
    if (addTxBtn) addTxBtn.style.display = 'none';
  }
}

// ── Sidebar ───────────────────────────────────────
function initSidebar(user) {
  document.getElementById('mobile-menu-btn')?.addEventListener('click', () => {
    document.getElementById('sidebar')?.classList.toggle('open');
    document.getElementById('sidebar-overlay')?.classList.toggle('show');
  });
  document.getElementById('sidebar-overlay')?.addEventListener('click', () => {
    document.getElementById('sidebar')?.classList.remove('open');
    document.getElementById('sidebar-overlay')?.classList.remove('show');
  });
  if (user) {
    document.getElementById('logout-btn')?.addEventListener('click', handleLogout);
  }
}

// ── Load dashboard data ───────────────────────────
async function loadDashboard(user) {
  const monthFilter = document.getElementById('dashboard-month')?.value;
  let year = null, month = null;
  if (monthFilter) {
    [year, month] = monthFilter.split('-').map(Number);
  }

  const userId = user ? user.id : null;

  const [, summary, trend, catData, recent, budgets, spending] = await Promise.all([
    fetchCategories(userId),
    fetchMonthlySummary(userId, year, month),
    fetchMonthlyTrend(userId),
    fetchCategoryBreakdown(userId, year, month),
    fetchRecentTransactions(userId),
    fetchBudgets(userId, year, month),
    fetchBudgetSpending(userId, year, month),
  ]);

  // Stats
  animateCounter(document.getElementById('stat-income'), summary.income);
  animateCounter(document.getElementById('stat-expense'), summary.expense);
  animateCounter(document.getElementById('stat-balance'), summary.income - summary.expense);

  // Charts
  setupChartDefaults();
  renderTrendChart('trend-chart', trend);
  renderDonutChart('donut-chart', catData);

  // Lists
  renderRecentTransactions(recent);
  renderBudgetOverview(budgets, spending);
}

// ── Transaction Modal ─────────────────────────────
let editingId = null;

function openModal(transaction = null) {
  editingId = transaction?.id || null;
  const titleEl = document.getElementById('modal-title');
  if (titleEl) titleEl.textContent = transaction ? 'Edit Transaksi' : 'Tambah Transaksi';
  document.getElementById('transaction-form')?.reset();
  const dateEl = document.getElementById('modal-date');
  if (dateEl && !transaction) dateEl.value = new Date().toISOString().split('T')[0];
  if (transaction) {
    document.getElementById('modal-type').value = transaction.type;
    document.getElementById('modal-description').value = transaction.description || '';
    document.getElementById('modal-amount').value = transaction.amount;
    document.getElementById('modal-date').value = transaction.date;
    populateCategoryDropdown(transaction.type);
    setTimeout(() => { document.getElementById('modal-category').value = transaction.category_id || ''; }, 50);
  } else {
    populateCategoryDropdown(document.getElementById('modal-type')?.value || 'expense');
  }
  document.getElementById('transaction-modal')?.classList.add('active');
}

function closeModal() {
  document.getElementById('transaction-modal')?.classList.remove('active');
  editingId = null;
}

// ── Main ──────────────────────────────────────────
async function main() {
  injectLayout('dashboard', 'Selamat Datang, 👋', 'Memuat...');
  applySavedTheme();

  const user = await getOptionalUser();

  updateGreeting(user);
  initSidebar(user);
  setupThemeToggle('theme-toggle');

  // Populate Month Filter
  const monthSelect = document.getElementById('dashboard-month');
  if (monthSelect) {
    const now = new Date();
    let currentY = now.getFullYear();
    let currentM = now.getMonth() + 1;
    // Generate last 12 months
    for (let i = 0; i < 12; i++) {
      let m = currentM - i;
      let y = currentY;
      if (m <= 0) {
        m += 12;
        y -= 1;
      }
      const val = `${y}-${String(m).padStart(2, '0')}`;
      const label = new Date(y, m - 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
      const opt = document.createElement('option');
      opt.value = val;
      opt.textContent = label;
      monthSelect.appendChild(opt);
    }
    monthSelect.value = ''; // Default to All Time

    monthSelect.addEventListener('change', () => loadDashboard(user));
  }

  await loadDashboard(user);

  // Modal events
  document.getElementById('modal-type')?.addEventListener('change', e => populateCategoryDropdown(e.target.value));
  document.getElementById('add-transaction-btn')?.addEventListener('click', () => openModal());
  document.getElementById('modal-close-btn')?.addEventListener('click', closeModal);
  document.getElementById('modal-cancel-btn')?.addEventListener('click', closeModal);
  document.getElementById('transaction-modal')?.addEventListener('click', e => { if (e.target === e.currentTarget) closeModal(); });

  document.getElementById('transaction-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const payload = {
      type: document.getElementById('modal-type').value,
      description: document.getElementById('modal-description').value.trim(),
      amount: parseFloat(document.getElementById('modal-amount').value),
      date: document.getElementById('modal-date').value,
      category_id: document.getElementById('modal-category').value || null,
    };
    if (!payload.type || !payload.amount || !payload.date) {
      showToast('Mohon isi semua kolom wajib.', 'warning'); return;
    }
    try {
      if (editingId) {
        await updateTransaction(editingId, payload);
        showToast('Transaksi diperbarui!', 'success');
      } else {
        await addTransaction(user.id, payload);
        showToast('Transaksi ditambahkan!', 'success');
      }
      closeModal();
      await loadDashboard(user);
    } catch (err) {
      showToast('Gagal: ' + err.message, 'error');
    }
  });

  // Global onclick handlers
  window.editTransaction = async id => {
    const { data } = await supabaseClient.from('transactions').select('*').eq('id', id).single();
    if (data) openModal(data);
  };
  window.confirmDeleteTransaction = async id => {
    if (!confirm('Hapus transaksi ini?')) return;
    try {
      await deleteTransaction(id);
      showToast('Transaksi dihapus.', 'success');
      await loadDashboard(user);
    } catch (err) {
      showToast('Gagal menghapus: ' + err.message, 'error');
    }
  };
}

main();
