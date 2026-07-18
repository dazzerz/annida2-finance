import dotenv from 'dotenv';
import pkgBaileys from '@whiskeysockets/baileys';
import pkgPino from 'pino';
import qrcode from 'qrcode-terminal';
import cron from 'node-cron';
import { createClient } from '@supabase/supabase-js';

// Load environment variables
dotenv.config();

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = pkgBaileys;
const pino = pkgPino;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || SUPABASE_SERVICE_ROLE_KEY === 'YOUR_SUPABASE_SERVICE_ROLE_KEY_HERE') {
  console.error('❌ ERROR: SUPABASE_URL atau SUPABASE_SERVICE_ROLE_KEY belum dikonfigurasi di file .env');
  process.exit(1);
}

// Initialize Supabase Client (bypassing RLS with Service Role Key)
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Helper: Format number to Rupiah (e.g. Rp 15.000)
function formatRupiah(number) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(number).replace(/\s/g, ' ');
}

// Helper: Get start and end dates of the current month
function getCurrentMonthRange() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0); // Last day of month
  
  const toISODate = (date) => date.toISOString().split('T')[0];
  return {
    start: toISODate(start),
    end: toISODate(end)
  };
}

// Function to fetch monthly summary for a user
async function getMonthlySummary(userId) {
  const { start, end } = getCurrentMonthRange();
  
  const { data: txs, error } = await supabase
    .from('transactions')
    .select('amount, type')
    .eq('user_id', userId)
    .gte('date', start)
    .lte('date', end);
    
  if (error) throw error;
  
  let income = 0;
  let expense = 0;
  
  txs.forEach(tx => {
    const amt = parseFloat(tx.amount);
    if (tx.type === 'income') {
      income += amt;
    } else {
      expense += amt;
    }
  });
  
  return {
    income,
    expense,
    balance: income - expense
  };
}

// Robust message parser for transactions
async function parseTransactionMessage(text, userId) {
  // 1. Ambil kategori milik user dari database
  const { data: categories, error } = await supabase
    .from('categories')
    .select('*')
    .eq('user_id', userId);
    
  if (error || !categories) return null;
  
  // 2. Bersihkan teks dan cari nominal angka (amount)
  // Menghapus 'rp', spasi, titik, koma yang biasanya jadi pemisah ribuan
  const textClean = text.replace(/rp\.?/gi, '').trim();
  
  // Cari semua substring yang mirip angka (misal: 15.000 atau 15000)
  const numberRegex = /\b\d+[\d.,]*\b/g;
  const matches = textClean.match(numberRegex);
  
  if (!matches) return null; // Tidak ada nominal angka ditemukan
  
  let amount = null;
  let amountString = null;
  
  // Cari angka pertama yang valid (di atas 100 rupiah untuk mengabaikan kuantiti kecil seperti "beli 2")
  for (const match of matches) {
    const cleaned = match.replace(/[.,]/g, '');
    const num = parseFloat(cleaned);
    if (!isNaN(num) && num >= 100) {
      amount = num;
      amountString = match;
      break;
    }
  }
  
  if (!amount) {
    const cleaned = matches[0].replace(/[.,]/g, '');
    amount = parseFloat(cleaned);
    amountString = matches[0];
  }
  
  if (isNaN(amount) || amount <= 0) return null;
  
  // 3. Cari kategori yang cocok
  let matchedCategory = null;
  let categoryToken = null;
  const words = textClean.toLowerCase().split(/\s+/);
  
  for (const category of categories) {
    const catNameLower = category.name.toLowerCase();
    
    // Periksa apakah ada kata di pesan yang cocok dengan nama kategori (atau sebaliknya)
    for (const word of words) {
      if (word.length >= 3 && (catNameLower.includes(word) || word.includes(catNameLower))) {
        matchedCategory = category;
        categoryToken = word;
        break;
      }
    }
    if (matchedCategory) break;
  }
  
  // Jika tidak ada kategori yang cocok, gunakan fallback kategori 'Lainnya' pengeluaran
  if (!matchedCategory) {
    matchedCategory = categories.find(c => c.name.toLowerCase() === 'lainnya' && c.type === 'expense') || 
                      categories.find(c => c.type === 'expense');
  }
  
  if (!matchedCategory) return null;
  
  // 4. Ambil deskripsi/keterangan transaksi
  // Hapus nominal uang, kata kategori yang terdeteksi, dan "rp" dari pesan asli
  let description = text;
  if (amountString) {
    description = description.replace(amountString, '');
  }
  description = description.replace(/rp\.?/gi, '');
  if (categoryToken) {
    const escapedToken = categoryToken.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    description = description.replace(new RegExp(escapedToken, 'i'), '');
  }
  
  // Bersihkan spasi berlebih
  description = description.replace(/\s+/g, ' ').trim();
  
  // Jika deskripsi kosong, beri deskripsi default
  if (!description) {
    description = `Transaksi via WhatsApp (${matchedCategory.name})`;
  }
  
  return {
    category_id: matchedCategory.id,
    amount: amount,
    type: matchedCategory.type,
    description: description,
    category_name: matchedCategory.name,
    category_icon: matchedCategory.icon || '💰'
  };
}

// Function to generate and send daily report to a user
async function sendDailyReport(sock, whatsappNumber, profile) {
  try {
    const summary = await getMonthlySummary(profile.id);
    const todayStr = new Date().toLocaleDateString('id-ID', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
    
    const reportMessage = `☀️ *Laporan Keuangan Pagi* ☀️
Tanggal: ${todayStr}

Pemasukan : ${formatRupiah(summary.income)}
Pengeluaran : ${formatRupiah(summary.expense)}
Saldo sisa : ${formatRupiah(summary.balance)}

Semangat beraktivitas hari ini! 💪`;

    const jid = `${whatsappNumber}@s.whatsapp.net`;
    await sock.sendMessage(jid, { text: reportMessage });
    console.log(`✉️ Laporan harian berhasil dikirim ke ${whatsappNumber} (${profile.full_name || 'User'})`);
  } catch (err) {
    console.error(`❌ Gagal mengirim laporan harian ke ${whatsappNumber}:`, err);
  }
}

// Main function to establish WhatsApp socket connection
async function startWhatsAppBot() {
  console.log('🔄 Menginisialisasi koneksi WhatsApp...');
  
  const { state, saveCreds } = await useMultiFileAuthState('auth_info');
  
  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false, // Kita print manual menggunakan qrcode-terminal agar lebih rapi
    logger: pino({ level: 'silent' }) // Matikan log verbose Baileys
  });

  // Handle connection updates (QR code generation, reconnection, etc.)
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    
    if (qr) {
      console.log('\n📱 Scan QR Code berikut dengan aplikasi WhatsApp di handphone Anda (Linked Devices):');
      qrcode.generate(qr, { small: true });
    }
    
    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log(`🔌 Koneksi terputus karena: ${lastDisconnect?.error}. Memulai ulang koneksi: ${shouldReconnect}`);
      if (shouldReconnect) {
        startWhatsAppBot();
      } else {
        console.log('❌ Anda telah keluar dari sesi WhatsApp. Silakan hapus folder "auth_info" dan jalankan ulang bot untuk login.');
      }
    } else if (connection === 'open') {
      console.log('✅ Bot WhatsApp berhasil tersambung dan siap digunakan!');
      
      // Setup scheduler untuk Laporan Harian setiap jam 06:00 Pagi
      // '0 6 * * *' = Setiap hari jam 06:00
      cron.schedule('0 6 * * *', async () => {
        console.log('⏰ Menjalankan scheduler Laporan Keuangan Harian (06:00 AM)...');
        try {
          const { data: profiles, error } = await supabase
            .from('profiles')
            .select('*')
            .not('whatsapp_number', 'is', null);
            
          if (error) throw error;
          
          console.log(`📢 Mengirim laporan ke ${profiles.length} nomor WhatsApp terdaftar...`);
          for (const profile of profiles) {
            await sendDailyReport(sock, profile.whatsapp_number, profile);
          }
        } catch (err) {
          console.error('❌ Gagal menjalankan scheduler laporan harian:', err);
        }
      });
      console.log('📅 Scheduler laporan keuangan harian jam 06:00 pagi aktif.');
    }
  });

  // Save session credentials
  sock.ev.on('creds.update', saveCreds);

  // Listen to incoming messages
  sock.ev.on('messages.upsert', async (m) => {
    const msg = m.messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const fromJid = msg.key.remoteJid;
    
    // Abaikan jika pesan dari grup atau status broadcast
    if (fromJid.endsWith('@g.us') || fromJid === 'status@broadcast') return;

    // Bersihkan nomor WhatsApp pengirim (misal: 628123456789@s.whatsapp.net -> 628123456789)
    const cleanNumber = fromJid.split('@')[0];
    
    // Ambil isi teks pesan
    const msgText = msg.message.conversation || 
                    msg.message.extendedTextMessage?.text || 
                    '';
                    
    const textTrimmed = msgText.trim().toLowerCase();
    if (!textTrimmed) return;

    console.log(`💬 Pesan masuk dari ${cleanNumber}: "${msgText}"`);

    try {
      // 1. Cari profile pengguna berdasarkan nomor WhatsApp
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('whatsapp_number', cleanNumber)
        .maybeSingle();

      if (error) {
        console.error('Error fetching profile:', error);
        return;
      }

      // Jika nomor WhatsApp tidak terdaftar di database
      if (!profile) {
        await sock.sendMessage(fromJid, { 
          text: `Halo! Nomor WhatsApp Anda (*${cleanNumber}*) belum terdaftar di aplikasi *Annida2Finance*.

Silakan ikuti langkah berikut:
1. Buka website *Annida2Finance*.
2. Masuk ke halaman *Pengaturan*.
3. Masukkan nomor WhatsApp Anda pada kolom yang disediakan dan klik *Simpan*.
4. Setelah itu, silakan kirim ulang pesan ke bot ini.` 
        });
        return;
      }

      // 2. Tangani Perintah Khusus (help, saldo, kategori, test-report)
      if (textTrimmed === 'help' || textTrimmed === 'menu' || textTrimmed === 'bantuan' || textTrimmed === 'halo' || textTrimmed === 'hi') {
        const helloName = profile.full_name || 'Pengguna';
        const helpMessage = `Halo *${helloName}*! 👋 Selamat datang di bot asisten *Annida2Finance*.

Berikut adalah format pesan untuk mencatat transaksi Anda:

*1. Catat Pengeluaran (Default)*
Format: \`[Nama Kategori] [Jumlah] [Keterangan]\`
Contoh: \`Makanan 15000 nasi uduk di warung\`
Contoh: \`Transport 20000 bensin motor\`

*2. Catat Pemasukan*
Format: \`[Nama Kategori] [Jumlah] [Keterangan]\` (pastikan kategori terdaftar sebagai tipe Pemasukan)
Contoh: \`Gaji 2500000 transfer bulanan\`
Contoh: \`Freelance 500000 jasa pembuatan web\`

*3. Cek Ringkasan Keuangan*
Ketik: \`saldo\` atau \`cek\`

*4. Lihat Kategori Anda*
Ketik: \`kategori\`

*5. Uji Coba Laporan Pagi*
Ketik: \`test-report\` (laporan harian jam 6 pagi akan dikirim langsung)`;

        await sock.sendMessage(fromJid, { text: helpMessage });
        return;
      }

      if (textTrimmed === 'saldo' || textTrimmed === 'cek') {
        const summary = await getMonthlySummary(profile.id);
        const balanceMessage = `📊 *Ringkasan Keuangan Bulan Ini* 📊

🟢 Pemasukan: *${formatRupiah(summary.income)}*
🔴 Pengeluaran: *${formatRupiah(summary.expense)}*
━━━━━━━━━━━━━━━━━━
💵 Saldo Sisa: *${formatRupiah(summary.balance)}*`;

        await sock.sendMessage(fromJid, { text: balanceMessage });
        return;
      }

      if (textTrimmed === 'kategori') {
        const { data: categories } = await supabase
          .from('categories')
          .select('name, type, icon')
          .eq('user_id', profile.id);

        if (!categories || categories.length === 0) {
          await sock.sendMessage(fromJid, { text: 'Anda belum memiliki kategori keuangan di akun Anda.' });
          return;
        }

        const incomeCats = categories.filter(c => c.type === 'income').map(c => `${c.icon} ${c.name}`).join('\n');
        const expenseCats = categories.filter(c => c.type === 'expense').map(c => `${c.icon} ${c.name}`).join('\n');

        const catMessage = `📋 *Daftar Kategori Anda*

🟢 *Pemasukan:*
${incomeCats || '-'}

🔴 *Pengeluaran:*
${expenseCats || '-'}`;

        await sock.sendMessage(fromJid, { text: catMessage });
        return;
      }

      if (textTrimmed === 'test-report') {
        await sock.sendMessage(fromJid, { text: '⏳ Sedang menyiapkan laporan keuangan pagi Anda...' });
        await sendDailyReport(sock, cleanNumber, profile);
        return;
      }

      // 3. Coba parsing pesan sebagai transaksi baru
      const transactionData = await parseTransactionMessage(msgText, profile.id);

      if (transactionData) {
        // Insert transaction ke database Supabase
        const { data, error: insertError } = await supabase
          .from('transactions')
          .insert({
            user_id: profile.id,
            category_id: transactionData.category_id,
            amount: transactionData.amount,
            type: transactionData.type,
            description: transactionData.description,
            date: new Date().toISOString().split('T')[0] // Hari ini
          })
          .select()
          .single();

        if (insertError) {
          throw insertError;
        }

        const typeLabel = transactionData.type === 'income' ? '🟢 PEMASUKAN' : '🔴 PENGELUARAN';
        const successMessage = `✅ *Transaksi Berhasil Dicatat!*

Tipe: *${typeLabel}*
Kategori: *${transactionData.category_icon} ${transactionData.category_name}*
Jumlah: *${formatRupiah(transactionData.amount)}*
Keterangan: _"${transactionData.description}"_
Tanggal: *${new Date().toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' })}*

Transaksi telah ditambahkan ke dashboard *Annida2Finance* Anda.`;

        await sock.sendMessage(fromJid, { text: successMessage });
      } else {
        // Jika pesan tidak berupa perintah dan gagal diparsing sebagai transaksi
        await sock.sendMessage(fromJid, { 
          text: `Maaf, format pesan tidak dikenali atau nominal uang tidak ditemukan.

Ketik *help* untuk melihat format penulisan pencatatan transaksi yang benar.` 
        });
      }
    } catch (err) {
      console.error('❌ Gagal memproses pesan:', err);
      await sock.sendMessage(fromJid, { 
        text: `⚠️ Terjadi kesalahan sistem saat memproses pesan Anda. Silakan coba beberapa saat lagi.` 
      });
    }
  });
}

// Start the bot
startWhatsAppBot().catch(err => {
  console.error('❌ CRITICAL ERROR starting WhatsApp bot:', err);
});
