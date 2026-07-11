// =====================================================
// ANNIDA2FINANCE - Main App Controller
// =====================================================
import supabaseClient from './supabase.js';
import { requireAuth, handleLogout, setupThemeToggle, showToast } from './auth.js';
import {
  fetchCategories,
  fetchMonthlySummary,
  fetchMonthlyTrend,
  fetchCategoryBreakdown,
  fetchRecentTransactions,
  addTransaction,
  updateTransaction,
  deleteTransaction,
  renderTransactionsTable,
  renderPagination,
  populateCategoryDropdown,
  renderRecentTransactions,
  fetchTransactions,
  allCategories,
} from './transactions.js';
import {
  fetchBudgets,
  fetchBudgetSpending,
  renderBudgetOverview,
} from './budget.js';
import { renderTrendChart, renderDonutChart, setupChartDefaults } from './charts.js';

// ── Utility: Format currency (IDR) ────────────────
export function formatCurrency(amount) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount || 0);
}

// ── Utility: Format date ──────────────────────────
export function formatDate(dateStr) {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

// ── Utility: Get month/year ────────────────────────
export function getMonthYear() {
  const now = new Date();
  return { month: now.getMonth() + 1, year: now.getFullYear() };
}

// ── Number counter animation ──────────────────────
function animateCounter(element, target) {
  const duration = 800;
  const start = performance.now();
  const startVal = 0;

  function update(timestamp) {
    const elapsed = timestamp - start;
    const progress = Math.min(elapsed / duration, 1);
    const ease = 1 - Math.pow(1 - progress, 3);
    const current = startVal + (target - startVal) * ease;
    element.textContent = formatCurrency(current);
    if (progress < 1) requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
}

// ── Dashboard greeting ────────────────────────────
function updateGreeting(user) {
  const hour = new Date().getHours();
  let greeting = 'Selamat Malam';
  if (hour < 12) greeting = 'Selamat Pagi';
  else if (hour < 15) greeting = 'Selamat Siang';
  else if (hour < 18) greeting = 'Selamat Sore';

  const greetEl = document.getElementById('greeting-text');
  const nameEl = document.getElementById('user-name-display');
  const navNameEl = document.getElementById('nav-user-name');
  const navEmailEl = document.getElementById('nav-user-email');
  const avatarEl = document.getElementById('user-avatar');

  const fullName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'Pengguna';
  const initials = fullName.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);

  if (greetEl) greetEl.textContent = `${greeting}, 👋`;
  if (nameEl) nameEl.textContent = fullName;
  if (navNameEl) navNameEl.textContent = fullName;
  if (navEmailEl) navEmailEl.textContent = user.email;
  if (avatarEl) avatarEl.textContent = initials;
}

// ── Update date header ────────────────────────────
function updateDateHeader() {
  const el = document.getElementById('current-date');
  if (!el) return;
  el.textContent = new Date().toLocaleDateString('id-ID', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

// ── Init sidebar & mobile menu ────────────────────
function initSidebar() {
  const mobileMenuBtn = document.getElementById('mobile-menu-btn');
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  const logoutBtn = document.getElementById('logout-btn');

  if (mobileMenuBtn && sidebar) {
    mobileMenuBtn.addEventListener('click', () => {
      sidebar.classList.toggle('open');
      overlay?.classList.toggle('show');
    });
  }

  if (overlay) {
    overlay.addEventListener('click', () => {
      sidebar?.classList.remove('open');
      overlay.classList.remove('show');
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', handleLogout);
  }

  // Highlight active nav item
  const currentPath = window.location.pathname;
  document.querySelectorAll('.nav-item').forEach((item) => {
    const href = item.getAttribute('href');
    if (href && currentPath.endsWith(href.replace('./', '').replace('../', ''))) {
      item.classList.add('active');
    }
  });
}

// ── Transaction Modal ─────────────────────────────
let editingId = null;

function openTransactionModal(transaction = null) {
  const modal = document.getElementById('transaction-modal');
  const title = document.getElementById('modal-title');
  const form = document.getElementById('transaction-form');
  if (!modal) return;

  editingId = transaction?.id || null;

  if (title) title.textContent = transaction ? 'Edit Transaksi' : 'Tambah Transaksi';

  if (form) {
    form.reset();
    if (transaction) {
      document.getElementById('modal-type').value = transaction.type;
      document.getElementById('modal-description').value = transaction.description || '';
      document.getElementById('modal-amount').value = transaction.amount;
      document.getElementById('modal-date').value = transaction.date;
      populateCategoryDropdown(transaction.type);
      setTimeout(() => {
        document.getElementById('modal-category').value = transaction.category_id || '';
      }, 50);
    } else {
      document.getElementById('modal-date').value = new Date().toISOString().split('T')[0];
      const typeEl = document.getElementById('modal-type');
      if (typeEl) populateCategoryDropdown(typeEl.value);
    }
  }

  modal.classList.add('active');
}

function closeTransactionModal() {
  const modal = document.getElementById('transaction-modal');
  if (modal) modal.classList.remove('active');
  editingId = null;
}

// ── Initialize Dashboard ──────────────────────────
async function initDashboard(user) {
  const { month, year } = getMonthYear();

  // Load data in parallel
  const [categories, summary, trend, categoryData, recent, budgets, spending] = await Promise.all([
    fetchCategories(user.id),
    fetchMonthlySummary(user.id, year, month),
    fetchMonthlyTrend(user.id),
    fetchCategoryBreakdown(user.id, year, month),
    fetchRecentTransactions(user.id),
    fetchBudgets(user.id, year, month),
    fetchBudgetSpending(user.id, year, month),
  ]);

  // Stats
  const balance = summary.income - summary.expense;
  const statCards = {
    'stat-income': summary.income,
    'stat-expense': summary.expense,
    'stat-balance': balance,
  };

  Object.entries(statCards).forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (el) animateCounter(el, val);
  });

  // Charts
  setupChartDefaults();
  renderTrendChart('trend-chart', trend);
  renderDonutChart('donut-chart', categoryData);

  // Recent transactions
  renderRecentTransactions(recent);

  // Budget overview
  renderBudgetOverview(budgets, spending);

  // Period month label
  const periodLabel = document.getElementById('period-label');
  if (periodLabel) {
    periodLabel.textContent = new Date(year, month - 1).toLocaleDateString('id-ID', {
      month: 'long',
      year: 'numeric',
    });
  }
}

// ── Initialize Transaction Form ───────────────────
async function initTransactionModal(user) {
  const typeSelect = document.getElementById('modal-type');
  if (typeSelect) {
    typeSelect.addEventListener('change', () => {
      populateCategoryDropdown(typeSelect.value);
    });
  }

  const form = document.getElementById('transaction-form');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const type = document.getElementById('modal-type').value;
      const description = document.getElementById('modal-description').value.trim();
      const amount = parseFloat(document.getElementById('modal-amount').value);
      const date = document.getElementById('modal-date').value;
      const categoryId = document.getElementById('modal-category').value;

      if (!type || !amount || !date) {
        showToast('Mohon isi semua kolom wajib.', 'warning');
        return;
      }

      const payload = { type, description, amount, date, category_id: categoryId || null };

      try {
        if (editingId) {
          await updateTransaction(editingId, payload);
          showToast('Transaksi berhasil diperbarui!', 'success');
        } else {
          await addTransaction(user.id, payload);
          showToast('Transaksi berhasil ditambahkan!', 'success');
        }
        closeTransactionModal();
        // Reload page data
        await initDashboard(user);
      } catch (err) {
        showToast('Gagal menyimpan transaksi: ' + err.message, 'error');
      }
    });
  }

  // Add transaction button
  const addBtn = document.getElementById('add-transaction-btn');
  if (addBtn) addBtn.addEventListener('click', () => openTransactionModal());

  // Close modal
  document.getElementById('modal-close-btn')?.addEventListener('click', closeTransactionModal);
  document.getElementById('modal-cancel-btn')?.addEventListener('click', closeTransactionModal);
  document.getElementById('transaction-modal')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeTransactionModal();
  });
}

// ── Main Entry Point ──────────────────────────────
async function main() {
  // Apply saved theme
  const savedTheme = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);

  // Require authentication
  const user = await requireAuth();
  if (!user) return;

  // Update UI with user info
  updateGreeting(user);
  updateDateHeader();

  // Init sidebar
  initSidebar();

  // Init theme toggle
  setupThemeToggle('theme-toggle');

  // Init dashboard data
  await initDashboard(user);

  // Init transaction modal
  await initTransactionModal(user);

  // Expose functions to global scope (for onclick handlers)
  window.editTransaction = async (id) => {
    const { data } = await supabaseClient
      .from('transactions')
      .select('*')
      .eq('id', id)
      .single();
    if (data) openTransactionModal(data);
  };

  window.confirmDeleteTransaction = async (id) => {
    if (!confirm('Hapus transaksi ini?')) return;
    try {
      await deleteTransaction(id);
      showToast('Transaksi dihapus.', 'success');
      await initDashboard(user);
    } catch (err) {
      showToast('Gagal menghapus: ' + err.message, 'error');
    }
  };
}

// ── Start app ─────────────────────────────────────
main();
