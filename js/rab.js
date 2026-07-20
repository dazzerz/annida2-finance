import supabaseClient from './supabase.js';
import { formatCurrency } from './utils.js';
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
    // Guest mode is not allowed for RAB Kelas
    window.location.href = '../index.html';
    return;
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
  document.getElementById('btn-export-excel')?.addEventListener('click', exportToExcel);
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
    const el = document.getElementById(`pendaftaran-${key}`);
    if (el) el.textContent = formatCurrency(itemTotal);
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
    { name: 'Air (Operasional)', icon: '💧', color: '#7ced50', amount: state.opsBulan[1] },
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
          await supabaseClient.from('budgets').update({ amount: item.amount })
            .eq('id', existingBudget.id);
        } else {
          await supabaseClient.from('budgets').insert([{
            user_id: userId,
            category_id: catId,
            year: period.year,
            month: period.month,
            amount: item.amount
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

function exportToExcel() {
  updateStateFromUI();
  calculateRAB(); 

  const formatNum = (num) => Number(num).toLocaleString('id-ID');

  let tPend = 0;
  let htmlPend = '';
  ['full', 'sebagian', 'khusus', 'gratis'].forEach(k => {
    const qty = state.pendaftaran[k].qty;
    const val = state.pendaftaran[k].val;
    const tot = qty * val;
    tPend += tot;
    let label = k === 'full' ? 'Siswa Full Bayar' : k === 'sebagian' ? 'Siswa Bayar Sebagian' : k === 'khusus' ? 'Siswa Bayar Khusus' : 'Siswa Gratis';
    htmlPend += `<tr><td>${label}</td><td class="num">${qty}</td><td class="num">${formatNum(val)}</td><td class="num">${formatNum(tot)}</td></tr>`;
  });

  const uraian = ["Pendaftaran", "Kitab", "Buku LKS", "Foto & Kartu", "Rapor", "Seragam Batik", "Seragam Olahraga", "Bet & Lokasi", "Baju Muslim", "Dasi", "Gesper"];
  let tAnak = 0;
  let htmlModal = '';
  uraian.forEach((u, i) => {
    htmlModal += `<tr><td>${u}</td><td class="num">${formatNum(state.modal[i])}</td><td colspan="2"></td></tr>`;
    tAnak += state.modal[i];
  });

  const mL = state.siswaL * tAnak;
  const mP = state.siswaP * tAnak;
  const tM = mL + mP;
  const dD = tM * 0.3;
  const tAll = tM + dD;

  const opsB = ["Listrik", "Air", "Kebersihan", "ATK"];
  let tOpsB = 0;
  let htmlOpsB = '';
  opsB.forEach((u, i) => { 
    htmlOpsB += `<tr><td>${u}</td><td class="num">${formatNum(state.opsBulan[i])}</td><td colspan="2"></td></tr>`;
    tOpsB += state.opsBulan[i]; 
  });
  const tOps12 = tOpsB * 12;

  const opsT = ["Bingkai Presiden", "Sapu Set Pengki", "Pel + Ember"];
  let tOpsT = 0;
  let htmlOpsT = '';
  opsT.forEach((u, i) => { 
    htmlOpsT += `<tr><td>${u}</td><td class="num">${formatNum(state.opsTahun[i])}</td><td colspan="2"></td></tr>`;
    tOpsT += state.opsTahun[i]; 
  });
  const tOpsAll = tOps12 + tOpsT;

  const tSppB = state.spp.anak * state.spp.nominal;
  const tSppT = tSppB * 12;
  const tIn = tPend + tSppT;
  const tOut = tAll + tOpsAll;

  let html = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
    <head>
      <meta charset="utf-8" />
      <style>
        table { border-collapse: collapse; width: 100%; font-family: Arial, sans-serif; }
        th, td { border: 1px solid #000000; padding: 6px; }
        th { background-color: #d9e1f2; font-weight: bold; text-align: center; }
        .title { font-size: 18px; font-weight: bold; text-align: center; border: none; }
        .section { background-color: #c6e0b4; font-weight: bold; }
        .num { text-align: right; }
        .total { font-weight: bold; background-color: #fff2cc; }
        .grand-total { font-weight: bold; background-color: #fce4d6; }
      </style>
    </head>
    <body>
      <table>
        <tr><td colspan="4" class="title">RAB KELAS ANNIDA 2</td></tr>
        <tr><td colspan="4" style="border:none;"></td></tr>
        
        <tr class="section"><td colspan="4">A. Data Siswa</td></tr>
        <tr><th colspan="2">Keterangan</th><th colspan="2">Jumlah</th></tr>
        <tr><td colspan="2">Siswa Laki-laki</td><td colspan="2" class="num">${state.siswaL}</td></tr>
        <tr><td colspan="2">Siswa Perempuan</td><td colspan="2" class="num">${state.siswaP}</td></tr>
        <tr class="total"><td colspan="2">Total Siswa</td><td colspan="2" class="num">${state.siswaL + state.siswaP}</td></tr>
        <tr><td colspan="4" style="border:none;"></td></tr>

        <tr class="section"><td colspan="4">B. Pemasukan Awal Pendaftaran</td></tr>
        <tr><th>Keterangan</th><th>Qty</th><th>Nilai (Rp)</th><th>Total (Rp)</th></tr>
        ${htmlPend}
        <tr class="total"><td colspan="3" style="text-align:right;">Total Pemasukan Awal</td><td class="num">${formatNum(tPend)}</td></tr>
        <tr><td colspan="4" style="border:none;"></td></tr>

        <tr class="section"><td colspan="4">C. Modal Pengadaan Siswa</td></tr>
        <tr><th colspan="2">Uraian</th><th colspan="2">Biaya/Siswa (Rp)</th></tr>
        ${htmlModal}
        <tr class="total"><td colspan="2">Total Biaya per Anak</td><td colspan="2" class="num">${formatNum(tAnak)}</td></tr>
        <tr><td colspan="4" style="border:none;"></td></tr>

        <tr class="section"><td colspan="4">D. Total Modal Awal</td></tr>
        <tr><td colspan="2">Modal Laki-laki</td><td colspan="2" class="num">${formatNum(mL)}</td></tr>
        <tr><td colspan="2">Modal Perempuan</td><td colspan="2" class="num">${formatNum(mP)}</td></tr>
        <tr><td colspan="2">Total Modal Anak</td><td colspan="2" class="num">${formatNum(tM)}</td></tr>
        <tr><td colspan="2">Dana Darurat (30%)</td><td colspan="2" class="num">${formatNum(dD)}</td></tr>
        <tr class="total"><td colspan="2">Total Modal + Darurat</td><td colspan="2" class="num">${formatNum(tAll)}</td></tr>
        <tr><td colspan="4" style="border:none;"></td></tr>

        <tr class="section"><td colspan="4">E. Operasional Tahunan</td></tr>
        <tr><td colspan="4" style="font-weight:bold; background:#e2efda;">Operasional Bulanan</td></tr>
        <tr><th colspan="2">Uraian</th><th colspan="2">Biaya/Bulan (Rp)</th></tr>
        ${htmlOpsB}
        <tr class="total"><td colspan="2">Total / Bulan</td><td colspan="2" class="num">${formatNum(tOpsB)}</td></tr>
        <tr class="total"><td colspan="2">Total 12 Bulan</td><td colspan="2" class="num">${formatNum(tOps12)}</td></tr>
        
        <tr><td colspan="4" style="font-weight:bold; background:#e2efda;">Pembelian Isi Kelas (Tahunan)</td></tr>
        <tr><th colspan="2">Uraian</th><th colspan="2">Biaya (Rp)</th></tr>
        ${htmlOpsT}
        <tr class="total"><td colspan="2">Total Isi Kelas (Thn)</td><td colspan="2" class="num">${formatNum(tOpsT)}</td></tr>
        <tr class="grand-total"><td colspan="2">Total Pengeluaran Tahunan</td><td colspan="2" class="num">${formatNum(tOpsAll)}</td></tr>
        <tr><td colspan="4" style="border:none;"></td></tr>

        <tr class="section"><td colspan="4">F. Pemasukan SPP Tahunan</td></tr>
        <tr><td colspan="2">Jumlah Anak Bayar SPP</td><td colspan="2" class="num">${state.spp.anak}</td></tr>
        <tr><td colspan="2">SPP / Bulan / Anak (Rp)</td><td colspan="2" class="num">${formatNum(state.spp.nominal)}</td></tr>
        <tr><td colspan="2">Total SPP / Bulan</td><td colspan="2" class="num">${formatNum(tSppB)}</td></tr>
        <tr class="total"><td colspan="2">Total SPP Tahunan</td><td colspan="2" class="num">${formatNum(tSppT)}</td></tr>
        <tr><td colspan="4" style="border:none;"></td></tr>

        <tr class="section"><td colspan="4">G. Ringkasan RAB</td></tr>
        <tr><td colspan="2">Pemasukan Pendaftaran</td><td colspan="2" class="num">${formatNum(tPend)}</td></tr>
        <tr><td colspan="2">Pemasukan SPP (1 Thn)</td><td colspan="2" class="num">${formatNum(tSppT)}</td></tr>
        <tr class="total"><td colspan="2">TOTAL PEMASUKAN</td><td colspan="2" class="num">${formatNum(tIn)}</td></tr>
        <tr><td colspan="4" style="border:none;"></td></tr>
        <tr><td colspan="2">Modal Awal + Darurat</td><td colspan="2" class="num">${formatNum(tAll)}</td></tr>
        <tr><td colspan="2">Operasional Tahunan</td><td colspan="2" class="num">${formatNum(tOpsAll)}</td></tr>
        <tr class="total"><td colspan="2">TOTAL PENGELUARAN</td><td colspan="2" class="num">${formatNum(tOut)}</td></tr>
        <tr><td colspan="4" style="border:none;"></td></tr>
        <tr class="grand-total" style="font-size:14px;"><td colspan="2">SISA SALDO / SURPLUS</td><td colspan="2" class="num">${formatNum(tIn - tOut)}</td></tr>
      </table>
    </body>
    </html>
  `;

  // Encode safely for UTF-8
  const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", "RAB_Kelas_Annida2.xls");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
