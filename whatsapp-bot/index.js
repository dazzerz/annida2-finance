import dotenv from 'dotenv';
import makeWASocket, { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import cron from 'node-cron';
import { createClient } from '@supabase/supabase-js';

// Load environment variables
dotenv.config();

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

// Function to generate and send daily report to a user's group or private chat
async function sendDailyReport(sock, whatsappNumber, profile) {
  try {
    const summary = await getMonthlySummary(profile.id);
    
    // User requested format:
    // Pemasukan : 
    // Pengeluaran : 
    // saldo sisa : 
    const reportMessage = `Pemasukan : ${formatRupiah(summary.income)}
Pengeluaran : ${formatRupiah(summary.expense)}
saldo sisa : ${formatRupiah(summary.balance)}`;

    const jid = profile.whatsapp_group_id || `${whatsappNumber}@s.whatsapp.net`;
    await sock.sendMessage(jid, { text: reportMessage });
    console.log(`✉️ Laporan keuangan berhasil dikirim ke ${jid} (Akun: ${profile.full_name || 'User'})`);
  } catch (err) {
    console.error(`❌ Gagal mengirim laporan keuangan ke ${whatsappNumber}:`, err);
  }
}

// Main function to establish WhatsApp socket connection
async function startWhatsAppBot() {
  console.log('🔄 Menginisialisasi koneksi WhatsApp...');
  
  const { state, saveCreds } = await useMultiFileAuthState('auth_info');
  
  // Dapatkan versi WhatsApp terbaru untuk menghindari error protokol
  let version = [2, 3000, 1015970092]; // Fallback version
  try {
    const { version: latestVersion, isLatest } = await fetchLatestBaileysVersion();
    version = latestVersion;
    console.log(`🌐 Menggunakan versi WhatsApp Web v${version.join('.')}, isLatest: ${isLatest}`);
  } catch (err) {
    console.log('⚠️ Gagal memuat versi terbaru WhatsApp Web, menggunakan versi bawaan.');
  }

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false, // Kita print manual menggunakan qrcode-terminal agar lebih rapi
    logger: pino({ level: 'silent' }), // Matikan log verbose Baileys
    browser: ['Annida2Finance Bot', 'Chrome', '1.0.0']
  });

  // Handle connection updates (QR code generation, reconnection, etc.)
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    
    if (qr) {
      console.log('\n📱 Scan QR Code berikut dengan aplikasi WhatsApp di handphone Anda (Linked Devices):');
      qrcode.generate(qr, { small: true });
    }
    
    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.log(`🔌 Koneksi terputus. Status Code: ${statusCode || 'Unknown'}. Error: ${lastDisconnect?.error}`);
      
      if (shouldReconnect) {
        console.log('🔄 Mencoba menghubungkan kembali dalam 5 detik...');
        setTimeout(() => {
          startWhatsAppBot();
        }, 5000);
      } else {
        console.log('❌ Anda telah keluar dari sesi WhatsApp. Silakan hapus folder "auth_info" dan jalankan ulang bot untuk login.');
      }
    } else if (connection === 'open') {
      console.log('✅ Bot WhatsApp berhasil tersambung dan siap digunakan!');
      
      // Setup scheduler untuk Laporan Keuangan Harian setiap jam 06:00 Pagi
      // '0 6 * * *' = Setiap hari jam 06:00
      cron.schedule('0 6 * * *', async () => {
        console.log('⏰ Menjalankan scheduler Laporan Keuangan Harian (06:00 AM)...');
        try {
          const { data: profiles, error } = await supabase
            .from('profiles')
            .select('*')
            .not('whatsapp_number', 'is', null);
            
          if (error) throw error;
          
          console.log(`📢 Mengirim laporan ke ${profiles.length} target...`);
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
    if (!msg.message) return;

    const fromJid = msg.key.remoteJid;
    if (fromJid === 'status@broadcast') return;

    const isGroup = fromJid.endsWith('@g.us');
    
    // Ambil isi teks pesan
    const msgText = msg.message.conversation || 
                    msg.message.extendedTextMessage?.text || 
                    '';
                    
    const textTrimmed = msgText.trim().toLowerCase();
    if (!textTrimmed) return;

    // Cek jika pesan dikirim dari akun bot itu sendiri
    const isFromMe = msg.key.fromMe;
    const isCommand = textTrimmed === '/setgrup' || 
                      textTrimmed === '!setgrup' || 
                      textTrimmed === 'set grup' ||
                      textTrimmed === '/unlinkgrup' ||
                      textTrimmed === '/laporan' ||
                      textTrimmed === 'test-report' ||
                      textTrimmed === '/test-report' ||
                      textTrimmed === 'laporan';

    // Jika pesan dari saya sendiri (fromMe) tapi bukan perintah bot, abaikan
    if (isFromMe && !isCommand) return;

    // Ambil nomor pengirim pesan
    let cleanNumber = '';
    let participantJid = '';
    if (isFromMe) {
      const myJid = sock.user.id || '';
      cleanNumber = myJid.split(':')[0].split('@')[0];
      participantJid = myJid;
    } else if (isGroup) {
      participantJid = msg.key.participant || msg.participant || '';
      cleanNumber = participantJid.split('@')[0];
    } else {
      cleanNumber = fromJid.split('@')[0];
    }

    console.log(`\n[DEBUG] Pesan Masuk: "${msgText}" | Dari JID: ${fromJid} | Pengirim JID: ${participantJid || fromJid} | Clean Number: ${cleanNumber} | isFromMe: ${isFromMe}`);

    if (!cleanNumber) return;

    try {
      // Cari profile pengguna berdasarkan nomor WhatsApp
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('whatsapp_number', cleanNumber)
        .maybeSingle();

      console.log(`[DEBUG] Database Lookup -> Error: ${error ? error.message : 'none'} | Profile Ditemukan: ${!!profile} | Data:`, profile);

      if (error || !profile) return; // Jika tidak terdaftar, diam saja

      // Perintah: Tautkan Grup (bisa dari grup mana saja)
      if (isGroup && (textTrimmed === '/setgrup' || textTrimmed === '!setgrup' || textTrimmed === 'set grup')) {
        const { error: updateError } = await supabase
          .from('profiles')
          .update({ whatsapp_group_id: fromJid })
          .eq('id', profile.id);

        if (updateError) throw updateError;

        await sock.sendMessage(fromJid, {
          text: `✅ *Grup Berhasil Ditautkan!*
          
Laporan keuangan harian milik *${profile.full_name || 'User'}* akan otomatis dikirim ke grup ini setiap pagi pukul 06:00.`,
          mentions: [participantJid]
        });
        return;
      }

      // Pastikan pesan dikirim di grup yang benar (jika grup) atau di chat pribadi
      if (isGroup && profile.whatsapp_group_id !== fromJid) {
        return; // Abaikan grup lain
      }

      // Perintah: Lepas Tautan Grup
      if (isGroup && textTrimmed === '/unlinkgrup') {
        const { error: updateError } = await supabase
          .from('profiles')
          .update({ whatsapp_group_id: null })
          .eq('id', profile.id);

        if (updateError) throw updateError;

        await sock.sendMessage(fromJid, {
          text: `❌ *Grup Berhasil Dilepas!*
          
Laporan keuangan harian milik *${profile.full_name || 'User'}* tidak akan lagi dikirim ke grup ini.`,
          mentions: [participantJid]
        });
        return;
      }

      // Perintah: Kirim Laporan Keuangan Secara Instan (Manual)
      if (textTrimmed === 'test-report' || textTrimmed === '/test-report' || textTrimmed === 'laporan' || textTrimmed === '/laporan') {
        // Beri feedback di chat tempat dia memicu perintah (bisa pribadi atau grup)
        await sock.sendMessage(fromJid, { text: '⏳ Sedang mengirimkan laporan keuangan...' });
        await sendDailyReport(sock, cleanNumber, profile);
        return;
      }

    } catch (err) {
      console.error('❌ Gagal memproses pesan:', err);
    }
  });
}

// Start the bot
startWhatsAppBot().catch(err => {
  console.error('❌ CRITICAL ERROR starting WhatsApp bot:', err);
});
