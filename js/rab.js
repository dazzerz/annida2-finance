import { supabaseClient, formatCurrency } from './supabase-client.js';
import { getOptionalUser, handleLogout } from './auth.js';

let userId = null;
let currentRabId = null;

// Initial values state
let state = {
  siswaL: 8,
  siswaP: 14,
  pendaftaran: { full: {qty:3, val:2500000}, sebagian: {qty:3, val:2500000}, khusus: {qty:6, val:1850000}, gratis: {qty:10, val:0} },
  modal: [50000, 25000, 66000, 50000, 75000, 65000, 95000, 7500, 80000, 12000, 10000],
  opsBulan: [150000, 200000, 100000, 250000], // Listrik, Air, Kebersihan, ATK
  opsTahun: [75000, 40000, 84000], // Bingkai, Sapu, Pel
  spp: { anak: 9, nominal: 150000 }
};

document.addEventListener('DOMContentLoaded', async () => {
  const user = await getOptionalUser();
  if (user) {
    userId = user.id;
    const fullName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'Pengguna';
    const initials = fullName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    const userAvatar = document.getElementById('user-avatar');
    if (userAvatar) userAvatar.textContent = initials;
    const navUserName = document.getElementById('nav-user-name');
    if (navUserName) navUserName.textContent = fullName;
    const navUserEmail = document.getElementById('nav-user-email');
    if (navUserEmail) navUserEmail.textContent = user.email;
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);
    
    // Load from DB
    await loadRAB();
  } else {
    // Guest mode
    const navUserName = document.getElementById('nav-user-name');
    if (navUserName) navUserName.textContent = 'Guest';
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
      logoutBtn.innerHTML = '<span class="nav-icon">🔑</span> Login';
      logoutBtn.addEventListener('click', () => window.location.href = '../login.html');
    }
    const navTransactions = document.getElementById('nav-transactions');
    if (navTransactions) navTransactions.style.display = 'none';
    const navBudget = document.getElementById('nav-budget');
    if (navBudget) navBudget.style.display = 'none';
    
    // Guest using default state
    calculateRAB();
  }

  setupEventListeners();
  
  // Theme Toggle
  const themeToggle = document.getElementById('theme-toggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      document.documentElement.setAttribute('data-theme', isDark ? 'light' : 'dark');
      localStorage.setItem('theme', isDark ? 'light' : 'dark');
      themeToggle.textContent = isDark ? '🌙' : '☀️';
    });
    
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    themeToggle.textContent = savedTheme === 'dark' ? '☀️' : '🌙';
  }
  
  // Mobile Menu
  const mobileMenuBtn = document.getElementById('mobile-menu-btn');
  const sidebar = document.getElementById('sidebar');
  const sidebarOverlay = document.getElementById('sidebar-overlay');
  
  if (mobileMenuBtn && sidebar && sidebarOverlay) {
    mobileMenuBtn.addEventListener('click', () => {
      sidebar.classList.add('open');
      sidebarOverlay.classList.add('open');
    });
    sidebarOverlay.addEventListener('click', () => {
      sidebar.classList.remove('open');
      sidebarOverlay.classList.remove('open');
    });
  }
});

function setupEventListeners() {
  // Listen for changes in all inputs
  document.querySelectorAll('input[type="number"]').forEach(input => {
    input.addEventListener('input', () => {
      updateStateFromUI();
      calculateRAB();
    });
  });

  document.getElementById('btn-save-rab')?.addEventListener('click', saveRAB);
  document.getElementById('btn-sync-budget')?.addEventListener('click', syncToBudget);
}

function updateStateFromUI() {
  state.siswaL = parseInt(document.getElementById('siswa-l').value) || 0;
  state.siswaP = parseInt(document.getElementById('siswa-p').value) || 0;
  
  // Pendaftaran
  ['full', 'sebagian', 'khusus', 'gratis'].forEach(key => {
    const qtyInput = document.querySelector(`input.qty[data-target="${key}"]`);
    const valInput = document.querySelector(`input.val[data-target="${key}"]`);
    if (qtyInput) state.pendaftaran[key].qty = parseInt(qtyInput.value) || 0;
    if (valInput) state.pendaftaran[key].val = parseInt(valInput.value) || 0;
  });

  // Modal Anak
  const modalInputs = document.querySelectorAll('#modal-tbody input.val');
  modalInputs.forEach((input, i) => {
    state.modal[i] = parseInt(input.value) || 0;
  });

  // Ops Bulan
  const opsBulanInputs = document.querySelectorAll('#ops-bulan-tbody input.val');
  opsBulanInputs.forEach((input, i) => {
    state.opsBulan[i] = parseInt(input.value) || 0;
  });

  // Ops Tahun
  const opsTahunInputs = document.querySelectorAll('#ops-tahunan-tbody input.val');
  opsTahunInputs.forEach((input, i) => {
    state.opsTahun[i] = parseInt(input.value) || 0;
  });

  // SPP
  state.spp.anak = parseInt(document.getElementById('spp-anak').value) || 0;
  state.spp.nominal = parseInt(document.getElementById('spp-nominal').value) || 0;
}

function updateUIFromState() {
  document.getElementById('siswa-l').value = state.siswaL;
  document.getElementById('siswa-p').value = state.siswaP;

  ['full', 'sebagian', 'khusus', 'gratis'].forEach(key => {
    document.querySelector(`input.qty[data-target="${key}"]`).value = state.pendaftaran[key].qty;
    document.querySelector(`input.val[data-target="${key}"]`).value = state.pendaftaran[key].val;
  });

  const modalInputs = document.querySelectorAll('#modal-tbody input.val');
  modalInputs.forEach((input, i) => {
    if (state.modal[i] !== undefined) input.value = state.modal[i];
  });

  const opsBulanInputs = document.querySelectorAll('#ops-bulan-tbody input.val');
  opsBulanInputs.forEach((input, i) => {
    if (state.opsBulan[i] !== undefined) input.value = state.opsBulan[i];
  });

  const opsTahunInputs = document.querySelectorAll('#ops-tahunan-tbody input.val');
  opsTahunInputs.forEach((input, i) => {
    if (state.opsTahun[i] !== undefined) input.value = state.opsTahun[i];
  });

  document.getElementById('spp-anak').value = state.spp.anak;
  document.getElementById('spp-nominal').value = state.spp.nominal;

  calculateRAB();
}

function calculateRAB() {
  // A. Data Siswa
  const totalSiswa = state.siswaL + state.siswaP;
  document.getElementById('total-siswa').textContent = totalSiswa;

  // B. Pemasukan Awal Pendaftaran
  let totalPendaftaran = 0;
  ['full', 'sebagian', 'khusus', 'gratis'].forEach(key => {
    const itemTotal = state.pendaftaran[key].qty * state.pendaftaran[key].val;
    totalPendaftaran += itemTotal;
    document.getElementById(`pendaftaran-${key}`).textContent = formatCurrency(itemTotal);
  });
  document.getElementById('total-pendaftaran').textContent = formatCurrency(totalPendaftaran);

  // C. Modal Pengadaan Siswa
  const totalPerAnak = state.modal.reduce((a, b) => a + b, 0);
  document.getElementById('total-per-anak').textContent = formatCurrency(totalPerAnak);

  // D. Total Modal Awal
  const modalL = state.siswaL * totalPerAnak;
  const modalP = state.siswaP * totalPerAnak;
  const totalModalAnak = modalL + modalP;
  const danaDarurat = totalModalAnak * 0.3; // 30%
  const totalModalAll = totalModalAnak + danaDarurat;

  document.getElementById('modal-l').textContent = formatCurrency(modalL);
  document.getElementById('modal-p').textContent = formatCurrency(modalP);
  document.getElementById('total-modal-anak').textContent = formatCurrency(totalModalAnak);
  document.getElementById('dana-darurat').textContent = formatCurrency(danaDarurat);
  document.getElementById('total-modal-all').textContent = formatCurrency(totalModalAll);

  // E. Operasional Tahunan
  const totalOpsBulan = state.opsBulan.reduce((a, b) => a + b, 0);
  const totalOps12Bulan = totalOpsBulan * 12;
  const totalIsiKelas = state.opsTahun.reduce((a, b) => a + b, 0);
  const totalPengeluaranTahunan = totalOps12Bulan + totalIsiKelas;

  document.getElementById('total-ops-bulan').textContent = formatCurrency(totalOpsBulan);
  document.getElementById('total-ops-12bulan').textContent = formatCurrency(totalOps12Bulan);
  document.getElementById('total-isi-kelas').textContent = formatCurrency(totalIsiKelas);
  document.getElementById('total-pengeluaran-tahunan').textContent = formatCurrency(totalPengeluaranTahunan);

  // F. Pemasukan SPP Tahunan
  const totalSppBulan = state.spp.anak * state.spp.nominal;
  const totalSppTahunan = totalSppBulan * 12;

  document.getElementById('total-spp-bulan').textContent = formatCurrency(totalSppBulan);
  document.getElementById('total-spp-tahunan').textContent = formatCurrency(totalSppTahunan);

  // G. Ringkasan RAB
  const ringkasanTotalPemasukan = totalPendaftaran + totalSppTahunan;
  const ringkasanTotalPengeluaran = totalModalAll + totalPengeluaranTahunan;
  const surplus = ringkasanTotalPemasukan - ringkasanTotalPengeluaran;

  document.getElementById('ringkasan-pendaftaran').textContent = formatCurrency(totalPendaftaran);
  document.getElementById('ringkasan-spp').textContent = formatCurrency(totalSppTahunan);
  document.getElementById('ringkasan-total-pemasukan').textContent = formatCurrency(ringkasanTotalPemasukan);
  
  document.getElementById('ringkasan-modal').textContent = formatCurrency(totalModalAll);
  document.getElementById('ringkasan-ops').textContent = formatCurrency(totalPengeluaranTahunan);
  document.getElementById('ringkasan-total-pengeluaran').textContent = formatCurrency(ringkasanTotalPengeluaran);
  
  document.getElementById('ringkasan-surplus').textContent = formatCurrency(surplus);
  document.getElementById('ringkasan-surplus').style.color = surplus >= 0 ? 'var(--income-color)' : 'var(--expense-color)';
}

async function loadRAB() {
  // Always try to load from localStorage first as a fallback/cache
  const localSaved = localStorage.getItem('rab_state_v1');
  if (localSaved) {
    try {
      const parsed = JSON.parse(localSaved);
      state = { ...state, ...parsed };
      updateUIFromState();
    } catch (e) { console.error('Failed to parse local RAB state', e); }
  }

  if (!userId) {
    calculateRAB();
    return;
  }

  const { data, error } = await supabaseClient
    .from('rab_plans')
    .select('*')
    .eq('user_id', userId)
    .eq('title', 'Kelas Annida 2')
    .limit(1)
    .single();

  if (error) {
    console.log("Belum ada RAB tersimpan di database, menggunakan nilai default/lokal.");
    calculateRAB();
    return;
  }

  if (data) {
    currentRabId = data.id;
    if (data.data) {
      state = { ...state, ...data.data };
      updateUIFromState();
      // Update local storage to match cloud
      localStorage.setItem('rab_state_v1', JSON.stringify(state));
    }
  }
}

async function saveRAB() {
  updateStateFromUI();
  // Always save to localStorage immediately for fast persistence
  localStorage.setItem('rab_state_v1', JSON.stringify(state));

  if (!userId) {
    showToast('Tersimpan secara lokal (Mode Guest). Harap login untuk simpan ke cloud.', 'success');
    return;
  }
  
  const btn = document.getElementById('btn-save-rab');
  const originalText = btn.innerHTML;
  btn.textContent = 'Menyimpan...';

  const payload = {
    user_id: userId,
    title: 'Kelas Annida 2',
    data: state,
    updated_at: new Date().toISOString()
  };

  let res;
  if (currentRabId) {
    res = await supabaseClient.from('rab_plans').update(payload).eq('id', currentRabId);
  } else {
    res = await supabaseClient.from('rab_plans').insert([payload]).select();
    if (res.data && res.data.length > 0) currentRabId = res.data[0].id;
  }

  btn.innerHTML = originalText;
  
  if (res.error) {
    // Check if it's the specific missing table error
    if (res.error.code === '42P01') {
      showToast('Gagal menyimpan ke cloud: Tabel rab_plans belum dibuat (cek SQL Editor!). Data tersimpan secara lokal.', 'error');
    } else {
      showToast('Gagal menyimpan RAB ke cloud: ' + res.error.message, 'error');
    }
    console.error(res.error);
  } else {
    showToast('RAB berhasil disimpan ke Database Cloud!', 'success');
  }
}

async function syncToBudget() {
  if (!userId) {
    showToast('Harap login untuk sinkronisasi budget.', 'warning');
    return;
  }
  
  const confirmed = confirm("Tindakan ini akan mengambil data biaya operasional bulanan (Listrik, Air, Kebersihan, ATK, & Isi Kelas) dan otomatis membuat/memperbarui daftar Budget di menu Budget. Lanjutkan?");
  if (!confirmed) return;

  const btn = document.getElementById('btn-sync-budget');
  btn.textContent = 'Menyinkronkan...';

  updateStateFromUI();

  // Categories mapping to create/update
  // Listrik, Air, Kebersihan, ATK, Isi Kelas
  const opsItems = [
    { name: 'Listrik (Operasional)', icon: '⚡', color: '#eab308', amount: state.opsBulan[0] },
    { name: 'Air (Operasional)', icon: '💧', color: '#3b82f6', amount: state.opsBulan[1] },
    { name: 'Kebersihan (Operasional)', icon: '🧹', color: '#10b981', amount: state.opsBulan[2] },
    { name: 'ATK (Operasional)', icon: '✏️', color: '#8b5cf6', amount: state.opsBulan[3] },
    { name: 'Isi Kelas (Operasional)', icon: '🏫', color: '#ec4899', amount: Math.round(state.opsTahun.reduce((a, b) => a + b, 0) / 12) } // Average per month
  ];

  try {
    // 1. Dapatkan daftar kategori yang ada, kalau belum ada, buat.
    const { data: existingCats } = await supabaseClient.from('categories').select('*').eq('user_id', userId);
    const catMap = {};

    for (const item of opsItems) {
      let cat = existingCats?.find(c => c.name === item.name);
      if (!cat) {
        const { data: newCat } = await supabaseClient.from('categories').insert([{
          user_id: userId,
          name: item.name,
          type: 'expense',
          icon: item.icon,
          color: item.color
        }]).select();
        if (newCat && newCat.length > 0) cat = newCat[0];
      }
      if (cat) catMap[item.name] = cat.id;
    }

    // 2. Buat budget untuk bulan berjalan (dan bulan depan)
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const nextMonthDate = new Date(currentYear, currentMonth, 1);
    const nextYear = nextMonthDate.getFullYear();
    const nextMonth = nextMonthDate.getMonth() + 1;

    const periods = [
      { year: currentYear, month: currentMonth },
      { year: nextYear, month: nextMonth }
    ];

    for (const period of periods) {
      for (const item of opsItems) {
        const catId = catMap[item.name];
        if (!catId) continue;

        // Check if budget exists
        const { data: existingBudget } = await supabaseClient.from('budgets')
          .select('id').eq('user_id', userId).eq('category_id', catId)
          .eq('year', period.year).eq('month', period.month).maybeSingle();

        if (existingBudget) {
          await supabaseClient.from('budgets').update({ amount_limit: item.amount })
            .eq('id', existingBudget.id);
        } else {
          await supabaseClient.from('budgets').insert([{
            user_id: userId,
            category_id: catId,
            year: period.year,
            month: period.month,
            amount_limit: item.amount
          }]);
        }
      }
    }

    showToast('Berhasil sinkronisasi ke Budget!', 'success');
  } catch (err) {
    showToast('Gagal sinkronisasi: ' + err.message, 'error');
    console.error(err);
  }

  btn.textContent = '🔄 Sinkronkan ke Budget';
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}
