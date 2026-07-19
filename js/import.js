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
  const headers = ['tanggal', 'keterangan', 'tipe', 'kategori', 'jumlah', 'sumber_dana'];
  const instructions = [
    ['FORMAT: YYYY-MM-DD', 'Keterangan transaksi', 'pemasukan / pengeluaran', 'Nama kategori (lihat sheet Kategori)', 'Angka tanpa titik/koma (contoh: 50000)', 'kas / bank'],
  ];
  const samples = [
    ['2026-07-01', 'Gaji bulan Juli', 'pemasukan', 'Gaji', 3500000, 'bank'],
    ['2026-07-02', 'Makan siang', 'pengeluaran', 'Makanan', 35000, 'kas'],
    ['2026-07-03', 'Bensin motor', 'pengeluaran', 'Transport', 50000, 'kas'],
    ['2026-07-05', 'Freelance project', 'pemasukan', 'Freelance', 1500000, 'bank'],
    ['2026-07-10', 'Belanja bulanan', 'pengeluaran', 'Belanja', 450000, 'kas'],
  ];

  const txSheet = XLSX.utils.aoa_to_sheet([headers, ...instructions, ...samples]);

  // Style kolom width
  txSheet['!cols'] = [
    { wch: 14 }, // tanggal
    { wch: 30 }, // keterangan
    { wch: 14 }, // tipe
    { wch: 18 }, // kategori
    { wch: 16 }, // jumlah
    { wch: 14 }, // sumber_dana
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
    ['6. Kolom SUMBER_DANA: isi "kas" (Kas Tunai) atau "bank" (Rekening Bank)'],
    ['7. Jangan mengubah nama kolom di baris pertama'],
    ['8. Simpan file dalam format .xlsx atau .xls sebelum diupload'],
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
        let aoa = [];
        
        try {
          const wb = XLSX.read(data, { type: 'array', cellDates: true });
          const sheetName = wb.SheetNames[0];
          const sheet = wb.Sheets[sheetName];
          aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
        } catch (readErr) {
          // Fallback: Bank sering export file HTML biasa yang di-rename jadi .xls
          // Jika SheetJS gagal baca karena "Invalid HTML" atau sejenisnya, kita parse manual
          if (readErr.message && String(readErr.message).toLowerCase().includes('html')) {
            const text = new TextDecoder('utf-8').decode(data);
            const parser = new DOMParser();
            const doc = parser.parseFromString(text, 'text/html');
            const rows = doc.querySelectorAll('tr');
            if (rows.length === 0) throw new Error('Tabel tidak ditemukan di dalam file XLS/HTML ini.');
            aoa = Array.from(rows).map(tr => 
              Array.from(tr.querySelectorAll('td, th')).map(td => td.innerText.trim())
            );
          } else {
            throw readErr;
          }
        }
        
        let headerRowIdx = -1;
        let templateType = 'standard'; // 'standard' | 'bsi'
        
        // Cari baris header
        for (let i = 0; i < aoa.length; i++) {
          const rowStr = aoa[i].map(c => String(c).toLowerCase()).join('|');
          if (rowStr.includes('waktu transaksi') && rowStr.includes('deskripsi')) {
            headerRowIdx = i;
            templateType = 'bsi';
            break;
          } else if (rowStr.includes('tanggal') && rowStr.includes('keterangan')) {
            headerRowIdx = i;
            templateType = 'standard';
            break;
          }
        }
        
        if (headerRowIdx === -1) {
          // Asumsi standard tapi mungkin dari baris 0
          headerRowIdx = 0;
        }

        const headers = aoa[headerRowIdx].map(c => String(c).trim());
        const dataRows = aoa.slice(headerRowIdx + 1);
        const mappedRows = [];

        if (templateType === 'bsi') {
          // Mutasi BSI
          const wTIdx = headers.findIndex(h => h.toLowerCase() === 'waktu transaksi');
          const descIdx = headers.findIndex(h => h.toLowerCase() === 'deskripsi');
          const debetIdx = headers.findIndex(h => h.toLowerCase() === 'debet');
          const kreditIdx = headers.findIndex(h => h.toLowerCase() === 'kredit');

          // Helper: menyederhanakan deskripsi panjang dari BSI
          const simplifyBSIDescription = (desc) => {
            if (!desc) return '';
            let s = String(desc).trim();
            // Contoh: "BIFAST - TRF Ke - Bank BRI Jkt - Pembelian LKS" -> "Pembelian LKS"
            if (s.startsWith('BIFAST - TRF Ke -')) {
              const parts = s.split('-');
              return parts[parts.length - 1].trim();
            }
            // Contoh: "Transport - TRF Ke - MUHAMMAD AZDY SOBRI" -> "Transport"
            // Contoh: "Pelunasan seragam - TRF Ke - 014 - DEWI..." -> "Pelunasan seragam"
            if (s.includes('- TRF Ke -')) {
              return s.split('- TRF Ke -')[0].trim();
            }
            // Contoh: "Transfer Dari - FULAN - Gaji"
            if (s.includes('- Transfer Dari -') || s.includes('TRF Dari')) {
              const parts = s.split('-');
              if (parts.length > 2) return parts[parts.length - 1].trim(); // Ambil bagian paling akhir
            }
            return s;
          };

          dataRows.forEach(row => {
            if (!row[wTIdx] && !row[descIdx]) return;
            
            let tanggal = row[wTIdx];
            if (typeof tanggal === 'string' && tanggal.includes('-')) {
              const parts = tanggal.split(' ')[0].split('-');
              if (parts.length === 3) tanggal = `${parts[2]}-${parts[1]}-${parts[0]}`;
            } else if (tanggal instanceof Date) {
              tanggal = new Date(tanggal.getTime() - (tanggal.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
            }

            const debetStr = String(row[debetIdx] || '').replace(/[^0-9.]/g, '');
            const kreditStr = String(row[kreditIdx] || '').replace(/[^0-9.]/g, '');
            const debet = parseFloat(debetStr);
            const kredit = parseFloat(kreditStr);

            let tipe = '';
            let jumlah = 0;
            if (debet > 0) { tipe = 'pengeluaran'; jumlah = debet; }
            else if (kredit > 0) { tipe = 'pemasukan'; jumlah = kredit; }

            if (jumlah > 0) {
              mappedRows.push({
                tanggal: tanggal,
                keterangan: simplifyBSIDescription(row[descIdx]),
                tipe: tipe,
                kategori: '', // kosong, biarkan user mapping jika perlu, atau jadi 'Lainnya'
                jumlah: jumlah,
                sumber_dana: 'bank' // Mutasi bank pasti 'bank'
              });
            }
          });
        } else {
          // Template standard Annida2Finance
          const tglIdx = headers.findIndex(h => h.toLowerCase() === 'tanggal') > -1 ? headers.findIndex(h => h.toLowerCase() === 'tanggal') : 0;
          const ketIdx = headers.findIndex(h => h.toLowerCase() === 'keterangan') > -1 ? headers.findIndex(h => h.toLowerCase() === 'keterangan') : 1;
          const tipeIdx = headers.findIndex(h => h.toLowerCase() === 'tipe') > -1 ? headers.findIndex(h => h.toLowerCase() === 'tipe') : 2;
          const katIdx = headers.findIndex(h => h.toLowerCase() === 'kategori') > -1 ? headers.findIndex(h => h.toLowerCase() === 'kategori') : 3;
          const jmlIdx = headers.findIndex(h => h.toLowerCase() === 'jumlah') > -1 ? headers.findIndex(h => h.toLowerCase() === 'jumlah') : 4;
          const sumIdx = headers.findIndex(h => h.toLowerCase() === 'sumber_dana') > -1 ? headers.findIndex(h => h.toLowerCase() === 'sumber_dana') : 5;

          dataRows.forEach(row => {
            const tipe = String(row[tipeIdx] || '').toLowerCase().trim();
            const jumlah = row[jmlIdx];
            if (jumlah && (tipe === 'pemasukan' || tipe === 'pengeluaran')) {
              mappedRows.push({
                tanggal: row[tglIdx],
                keterangan: row[ketIdx],
                tipe: row[tipeIdx],
                kategori: row[katIdx],
                jumlah: row[jmlIdx],
                sumber_dana: row[sumIdx]
              });
            }
          });
        }

        resolve(mappedRows);
      } catch (err) {
        reject(new Error('Gagal membaca file: ' + err.message));
      }
    };
    reader.onerror = () => reject(new Error('Gagal membaca file'));
    reader.readAsArrayBuffer(file);
  });
}

// ── Validasi & map rows ke format transaksi ────────
export async function validateAndMapRows(rows, categories) {
  const results = [];
  const unmatchedRows = [];

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

    // Keterangan
    const description = String(row.keterangan || '').trim();

    // Kategori (opsional - cari match)
    const katNama = String(row.kategori || '').trim().toLowerCase();
    let matchedCat = categories.find(c =>
      c.name.toLowerCase() === katNama &&
      ((type === 'income' && c.type === 'income') || (type === 'expense' && c.type === 'expense'))
    );

    // Auto-categorize jika kategori kosong (biasanya dari file bank mutasi)
    if (!katNama && !matchedCat && description) {
      unmatchedRows.push({
        idx: idx,
        description: description,
        type: type
      });
    }

    const categoryId = matchedCat?.id || null;
    if (katNama && !matchedCat) {
      errors.push(`Kategori "${row.kategori}" tidak ditemukan (akan diisi "Lainnya")`);
    }

    // Sumber Dana
    const sumberRaw = String(row.sumber_dana || '').toLowerCase().trim();
    const sumberDana = (sumberRaw === 'kas') ? 'kas' : 'bank'; // Default to bank if empty or invalid

    results.push({
      rowNum,
      date,
      type,
      amount,
      description,
      sumber_dana: sumberDana,
      category_id: categoryId,
      categoryName: matchedCat?.name || row.kategori || '-',
      categoryIcon: matchedCat?.icon || '💰',
      errors,
      valid: errors.length === 0 || errors.every(e => e.includes('tidak ditemukan')),
      _raw: row,
    });
  });

  // --- HUGGING FACE AI INTEGRATION ---
  if (unmatchedRows.length > 0) {
    console.log(`Mengirim ${unmatchedRows.length} baris ke AI Hugging Face...`);
    
    // Pisahkan berdasarkan tipe agar pilihan kategorinya spesifik
    const incomeRows = unmatchedRows.filter(r => r.type === 'income');
    const expenseRows = unmatchedRows.filter(r => r.type === 'expense');

    const incomeCategories = categories.filter(c => c.type === 'income').map(c => c.name);
    const expenseCategories = categories.filter(c => c.type === 'expense').map(c => c.name);

    async function fetchAI(unmatchedBatch, catList) {
      if (unmatchedBatch.length === 0) return;
      
      const apiKey = localStorage.getItem('gemini_api_key') || '';
      if (!apiKey) {
        alert("Kunci API Google Gemini belum diisi! Silakan isi di menu Pengaturan.");
        return;
      }
      
      const catNames = catList.join(', ');
      const descList = unmatchedBatch.map((r, i) => `${i+1}. ${r.description}`).join('\n');
      
      const prompt = `Kamu adalah pakar keuangan pribadi cerdas dari Indonesia. Kategorikan daftar transaksi bank mutasi ini berdasarkan deskripsinya.
Pilih HANYA dari kategori berikut: [${catNames}, Lainnya].
Pahami konteks lokal: "Bet/Seragam/SPP" = Pendidikan, "Biaya Adm/Admin" = Belanja/Tagihan, "Gopay/Dana/Shopeepay" = Belanja, "Makan/Snack" = Makanan, "Bonus/Bagi Hasil" = Pemasukan/Bonus.

Kembalikan hasil HANYA dalam bentuk array JSON string, di mana urutannya persis sama dengan urutan transaksi. Contoh jawaban valid: ["Pendidikan", "Tagihan", "Lainnya"]

Daftar Transaksi:
${descList}`;

      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: {
                temperature: 0.1,
                maxOutputTokens: 8192,
                responseMimeType: "application/json"
              }
            }),
          }
        );
        
        if (response.ok) {
          const data = await response.json();
          const answer = data.candidates?.[0]?.content?.parts?.[0]?.text;
          
          if (answer) {
              let parsedArray = [];
              try {
                let cleanAnswer = answer.trim();
                if (cleanAnswer.startsWith('```json')) cleanAnswer = cleanAnswer.substring(7);
                else if (cleanAnswer.startsWith('```')) cleanAnswer = cleanAnswer.substring(3);
                if (cleanAnswer.endsWith('```')) cleanAnswer = cleanAnswer.slice(0, -3);
                cleanAnswer = cleanAnswer.trim();
                if (!cleanAnswer.endsWith(']')) cleanAnswer += ']'; // Auto-fix missing bracket
                
                parsedArray = JSON.parse(cleanAnswer);
              } catch (parseErr) {
                console.warn("JSON parse gagal, mencoba regex fallback...", parseErr);
                const matches = answer.match(/"([^"]+)"/g);
                if (matches) {
                  parsedArray = matches.map(m => m.slice(1, -1));
                } else {
                  console.error("Gagal parse JSON Gemini:", answer);
                  alert("Gemini mengembalikan format yang salah, tapi koneksi berhasil. Silakan cek console.");
                  return;
                }
              }
              
              unmatchedBatch.forEach((r, index) => {
                const label = parsedArray[index];
                if (label && label.toLowerCase() !== 'lainnya') {
                  const matchedCategory = categories.find(c => c.name.toLowerCase() === label.toLowerCase());
                  if (matchedCategory) {
                    results[r.idx].categoryName = matchedCategory.name;
                    results[r.idx].category_id = matchedCategory.id;
                    results[r.idx].categoryIcon = matchedCategory.icon;
                  }
                }
              });
          }
        } else {
          const errData = await response.json();
          console.error("Gemini API Error:", errData);
          alert("Gagal memanggil Gemini AI: " + (errData.error?.message || response.statusText));
        }
      } catch (err) {
        console.error("Gemini Fetch Error:", err);
        alert("Gagal koneksi ke Gemini AI: " + err.message);
      }
    }

    // Panggil API secara paralel untuk Pemasukan dan Pengeluaran
    await Promise.all([
      fetchAI(incomeRows, incomeCategories),
      fetchAI(expenseRows, expenseCategories)
    ]);
  }

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
