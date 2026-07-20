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
    
    // Hide Transaksi, Budget, and RAB Kelas in sidebar for guests
    const navTransactions = document.getElementById('nav-transactions');
    if (navTransactions) navTransactions.style.display = 'none';
    const navBudget = document.getElementById('nav-budget');
    if (navBudget) navBudget.style.display = 'none';
    const navRab = document.getElementById('nav-rab');
    if (navRab) navRab.style.display = 'none';
    
    // Hide Quick Actions / Buttons
    const addTxBtn = document.getElementById('add-transaction-btn');
    if (addTxBtn) addTxBtn.style.display = 'none';

    // Show Guest Unlock Button if not already unlocked
    const btnUnlock = document.getElementById('btn-guest-unlock');
    if (btnUnlock && !sessionStorage.getItem('guest_stats')) {
      btnUnlock.style.display = 'flex';
    }
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
  if (!user) {
    const cachedStats = sessionStorage.getItem('guest_stats');
    if (cachedStats) {
       const s = JSON.parse(cachedStats);
       animateCounter(document.getElementById('stat-income'), s.income);
       animateCounter(document.getElementById('stat-expense'), s.expense);
       animateCounter(document.getElementById('stat-balance'), s.balance);
       animateCounter(document.getElementById('stat-kas'), s.kas);
       animateCounter(document.getElementById('stat-bank'), s.bank);
    } else {
       const mask = 'Rp ***.***';
       document.getElementById('stat-income').textContent = mask;
       document.getElementById('stat-expense').textContent = mask;
       document.getElementById('stat-balance').textContent = mask;
       document.getElementById('stat-kas').textContent = mask;
       document.getElementById('stat-bank').textContent = mask;
    }
  } else {
    animateCounter(document.getElementById('stat-income'), summary.income);
    animateCounter(document.getElementById('stat-expense'), summary.expense);
    animateCounter(document.getElementById('stat-balance'), summary.income - summary.expense);
    animateCounter(document.getElementById('stat-kas'), summary.kasBalance ?? 0);
    animateCounter(document.getElementById('stat-bank'), summary.bankBalance ?? 0);
  }

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
    document.getElementById('modal-sumber-dana').value = transaction.sumber_dana || 'bank';
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
      sumber_dana: document.getElementById('modal-sumber-dana').value || 'bank',
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
  document.getElementById('btn-share-wa')?.addEventListener('click', async (e) => {
    e.preventDefault();
    const btn = e.currentTarget;
    const originalText = btn.innerHTML;
    btn.innerHTML = '⏳ Tunggu...';
    
    try {
      if (!user) { alert('Silakan login terlebih dahulu.'); return; }
      
      const today = new Date();
      const localDate = today.toLocaleDateString('en-CA'); // YYYY-MM-DD
      const { data, error } = await supabaseClient
        .from('transactions')
        .select('amount, type')
        .eq('user_id', user.id)
        .eq('date', localDate);
        
      if (error) throw error;
      
      let income = 0;
      let expense = 0;
      
      if (data) {
        data.forEach(t => {
          if (t.type === 'income') income += Number(t.amount);
          else if (t.type === 'expense') expense += Number(t.amount);
        });
      }
      
      const balance = income - expense;
      
      const text = `*Laporan Keuangan Hari Ini* 📊\n\n` +
                   `Pemasukan : Rp ${formatCurrency(income).replace('Rp','').trim()}\n` +
                   `Pengeluaran : Rp ${formatCurrency(expense).replace('Rp','').trim()}\n` +
                   `Saldo Sisa : Rp ${formatCurrency(balance).replace('Rp','').trim()}\n\n` +
                   `_Auto-generated by Annida2Finance_`;
                   
      const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
      window.open(url, '_blank');
    } catch (err) {
      alert('Gagal mengambil data hari ini: ' + err.message);
    } finally {
      btn.innerHTML = originalText;
    }
  });

  // Guest Unlock Button
  document.getElementById('btn-guest-unlock')?.addEventListener('click', async (e) => {
    e.preventDefault();
    const pass = prompt('Masukkan Password Akses:');
    if (!pass) return;

    const btn = e.currentTarget;
    const originalText = btn.innerHTML;
    btn.innerHTML = '⏳ Tunggu...';

    try {
      const monthFilter = document.getElementById('dashboard-month')?.value;
      let p_year = null, p_month = null;
      if (monthFilter) {
        [p_year, p_month] = monthFilter.split('-').map(Number);
      }

      const { data, error } = await supabaseClient.rpc('guest_get_totals', {
        p_pass: pass,
        p_year: p_year,
        p_month: p_month
      });

      if (error) throw error;

      sessionStorage.setItem('guest_stats', JSON.stringify(data));
      showToast('Kunci berhasil dibuka!', 'success');
      btn.style.display = 'none';
      loadDashboard(currentUser); // Reload dashboard to show numbers
    } catch (err) {
      showToast(err.message || 'Password salah atau gagal membuka kunci', 'error');
    } finally {
      btn.innerHTML = originalText;
    }
  });

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
