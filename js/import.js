// =====================================================
// ANNIDA2FINANCE - Excel Import Module
// Menggunakan SheetJS (xlsx) untuk baca & buat Excel
// =====================================================
import supabaseClient from './supabase.js';

// ── Generate & download template Excel ────────────
export function downloadTemplate(categories) {
  const XLSX = window.XLSX;
  if (!XLSX) { alert('Library Excel belum siap, coba refresh halaman.'); return; }

  // Sheet 1: Template transaksi
  const headers = ['tanggal', 'keterangan', 'tipe', 'kategori', 'jumlah'];
  const instructions = [
    ['FORMAT: YYYY-MM-DD', 'Keterangan transaksi', 'pemasukan / pengeluaran', 'Nama kategori (lihat sheet Kategori)', 'Angka tanpa titik/koma (contoh: 50000)'],
  ];
  const samples = [
    ['2026-07-01', 'Gaji bulan Juli', 'pemasukan', 'Gaji', 3500000],
    ['2026-07-02', 'Makan siang', 'pengeluaran', 'Makanan', 35000],
    ['2026-07-03', 'Bensin motor', 'pengeluaran', 'Transport', 50000],
    ['2026-07-05', 'Freelance project', 'pemasukan', 'Freelance', 1500000],
    ['2026-07-10', 'Belanja bulanan', 'pengeluaran', 'Belanja', 450000],
  ];

  const txSheet = XLSX.utils.aoa_to_sheet([headers, ...instructions, ...samples]);

  // Style kolom width
  txSheet['!cols'] = [
    { wch: 14 }, // tanggal
    { wch: 30 }, // keterangan
    { wch: 14 }, // tipe
    { wch: 18 }, // kategori
    { wch: 16 }, // jumlah
  ];

  // Sheet 2: Daftar kategori valid
  const catHeaders = ['Nama Kategori', 'Tipe'];
  const catRows = categories.map(c => [c.name, c.type === 'income' ? 'pemasukan' : 'pengeluaran']);
  const catSheet = XLSX.utils.aoa_to_sheet([catHeaders, ...catRows]);
  catSheet['!cols'] = [{ wch: 20 }, { wch: 14 }];

  // Sheet 3: Petunjuk
  const guideSheet = XLSX.utils.aoa_to_sheet([
    ['PETUNJUK PENGISIAN TEMPLATE'],
    [''],
    ['1. Isi data mulai dari baris ke-3 (baris kuning adalah contoh, boleh dihapus)'],
    ['2. Kolom TANGGAL: format YYYY-MM-DD (contoh: 2026-07-15)'],
    ['3. Kolom TIPE: isi "pemasukan" atau "pengeluaran" (huruf kecil)'],
    ['4. Kolom KATEGORI: isi nama kategori sesuai daftar di sheet "Kategori"'],
    ['5. Kolom JUMLAH: angka saja, tanpa Rp, titik, atau koma (contoh: 50000)'],
    ['6. Jangan mengubah nama kolom di baris pertama'],
    ['7. Simpan file dalam format .xlsx atau .xls sebelum diupload'],
    [''],
    ['TIPS: Gunakan sheet "Kategori" sebagai referensi kategori yang tersedia'],
  ]);
  guideSheet['!cols'] = [{ wch: 65 }];

  // Buat workbook
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, txSheet, 'Transaksi');
  XLSX.utils.book_append_sheet(wb, catSheet, 'Kategori');
  XLSX.utils.book_append_sheet(wb, guideSheet, 'Petunjuk');

  XLSX.writeFile(wb, 'template-annida2finance.xlsx');
}

// ── Parse file Excel yang diupload ────────────────
export function parseExcelFile(file) {
  return new Promise((resolve, reject) => {
    const XLSX = window.XLSX;
    if (!XLSX) { reject(new Error('Library XLSX belum dimuat')); return; }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, { type: 'array', cellDates: true });

        // Ambil sheet pertama (Transaksi)
        const sheetName = wb.SheetNames[0];
        const sheet = wb.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet, {
          header: ['tanggal', 'keterangan', 'tipe', 'kategori', 'jumlah'],
          range: 1, // skip header row
          defval: '',
        });

        // Filter baris kosong dan baris instruksi
        const filtered = rows.filter(r => {
          const tipe = String(r.tipe || '').toLowerCase().trim();
          return r.jumlah && (tipe === 'pemasukan' || tipe === 'pengeluaran');
        });

        resolve(filtered);
      } catch (err) {
        reject(new Error('Gagal membaca file: ' + err.message));
      }
    };
    reader.onerror = () => reject(new Error('Gagal membaca file'));
    reader.readAsArrayBuffer(file);
  });
}

// ── Validasi & map rows ke format transaksi ────────
export function validateAndMapRows(rows, categories) {
  const results = [];

  rows.forEach((row, idx) => {
    const errors = [];
    const rowNum = idx + 2; // +2 karena skip header + 0-index

    // Tanggal
    let date = '';
    if (row.tanggal instanceof Date) {
      date = row.tanggal.toISOString().split('T')[0];
    } else {
      const str = String(row.tanggal || '').trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
        date = str;
      } else if (str) {
        // Coba parse tanggal format lain
        const parsed = new Date(str);
        if (!isNaN(parsed)) {
          date = parsed.toISOString().split('T')[0];
        } else {
          errors.push('Format tanggal tidak valid (gunakan YYYY-MM-DD)');
        }
      } else {
        errors.push('Tanggal kosong');
      }
    }

    // Tipe
    const tipeRaw = String(row.tipe || '').toLowerCase().trim();
    let type = '';
    if (tipeRaw === 'pemasukan' || tipeRaw === 'income') type = 'income';
    else if (tipeRaw === 'pengeluaran' || tipeRaw === 'expense') type = 'expense';
    else errors.push(`Tipe tidak valid: "${row.tipe}" (harus: pemasukan/pengeluaran)`);

    // Jumlah
    const jumlahRaw = String(row.jumlah || '').replace(/[^0-9.]/g, '');
    const amount = parseFloat(jumlahRaw);
    if (!amount || amount <= 0) errors.push('Jumlah harus lebih dari 0');

    // Kategori (opsional - cari match)
    const katNama = String(row.kategori || '').trim().toLowerCase();
    const matchedCat = categories.find(c =>
      c.name.toLowerCase() === katNama &&
      ((type === 'income' && c.type === 'income') || (type === 'expense' && c.type === 'expense'))
    );
    const categoryId = matchedCat?.id || null;
    if (katNama && !matchedCat) {
      errors.push(`Kategori "${row.kategori}" tidak ditemukan (akan diisi "Lainnya")`);
    }

    // Keterangan
    const description = String(row.keterangan || '').trim();

    results.push({
      rowNum,
      date,
      type,
      amount,
      description,
      category_id: categoryId,
      categoryName: matchedCat?.name || row.kategori || '-',
      categoryIcon: matchedCat?.icon || '💰',
      errors,
      valid: errors.length === 0 || errors.every(e => e.includes('tidak ditemukan')),
      _raw: row,
    });
  });

  return results;
}

// ── Bulk insert ke Supabase ───────────────────────
export async function bulkInsertTransactions(userId, validRows) {
  const payload = validRows.map(r => ({
    user_id: userId,
    date: r.date,
    type: r.type,
    amount: r.amount,
    description: r.description || null,
    category_id: r.category_id || null,
  }));

  const { data, error } = await supabaseClient
    .from('transactions')
    .insert(payload)
    .select();

  if (error) throw error;
  return data;
}
