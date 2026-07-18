import dotenv from 'dotenv';
import makeWASocket, { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import cron from 'node-cron';
import { createClient } from '@supabase/supabase-js';

// Override console.error to suppress harmless WhatsApp E2EE sync warnings (like Bad MAC / Failed to decrypt)
const originalConsoleError = console.error;
console.error = function (...args) {
  const msg = args.join(' ');
  if (msg.includes('Bad MAC') || msg.includes('Failed to decrypt') || msg.includes('libsignal') || msg.includes('SessionCipher')) {
    return; // Silently suppress decryption warnings
  }
  originalConsoleError.apply(console, args);
};

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

// Global cache to map WhatsApp LID (privacy JID) to Phone Number (PN)
const lidToPnMap = new Map();

// Timestamp when the bot successfully established open connection
let botStartupTime = 0;

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
  
  const toISODate = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };
  return {
    start: toISODate(start),
    end: toISODate(end)
  };
}

// Function to fetch monthly summary and overall balance for a user
async function getMonthlySummary(userId) {
  const { data: txs, error } = await supabase
    .from('transactions')
    .select('amount, type, date')
    .eq('user_id', userId);
    
  if (error) throw error;
  
  const { start, end } = getCurrentMonthRange();
  
  let monthlyIncome = 0;
  let monthlyExpense = 0;
  let allTimeIncome = 0;
  let allTimeExpense = 0;
  
  txs.forEach(tx => {
    const amt = parseFloat(tx.amount);
    const isCurrentMonth = tx.date >= start && tx.date <= end;
    
    if (tx.type === 'income') {
      allTimeIncome += amt;
      if (isCurrentMonth) monthlyIncome += amt;
    } else {
      allTimeExpense += amt;
      if (isCurrentMonth) monthlyExpense += amt;
    }
  });
  
  return {
    income: monthlyIncome,
    expense: monthlyExpense,
    balance: allTimeIncome - allTimeExpense
  };
}

// Function to generate and send daily report to a user's group or private chat
async function sendDailyReport(sock, whatsappNumber, profile, customJid = null) {
  try {
    const summary = await getMonthlySummary(profile.id);
    
    let monthName = new Date().toLocaleString('id-ID', { month: 'long' });
    monthName = monthName.charAt(0).toUpperCase() + monthName.slice(1);

    const reportMessage = `Rekap Keuangan SMP Annida Al Islamy Setu
Pemasukan (${monthName}) : ${formatRupiah(summary.income)}
Pengeluaran (${monthName}) : ${formatRupiah(summary.expense)}
Sisa saldo : ${formatRupiah(summary.balance)}`;

    const jid = customJid || profile.whatsapp_group_id || `${whatsappNumber}@s.whatsapp.net`;
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
      botStartupTime = Math.floor(Date.now() / 1000);
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

  // Sync and map contacts (especially LIDs to Phone Numbers)
  sock.ev.on('contacts.upsert', (contacts) => {
    for (const contact of contacts) {
      const jid = contact.id || '';
      const pn = contact.phoneNumber || (contact.id && contact.id.includes('@s.whatsapp.net') ? contact.id.split('@')[0] : '');
      if (jid && pn) {
        lidToPnMap.set(jid.split('@')[0], pn.split('@')[0]);
      }
    }
  });

  sock.ev.on('contacts.update', (updates) => {
    for (const update of updates) {
      const jid = update.id || '';
      const pn = update.phoneNumber || (update.id && update.id.includes('@s.whatsapp.net') ? update.id.split('@')[0] : '');
      if (jid && pn) {
        lidToPnMap.set(jid.split('@')[0], pn.split('@')[0]);
      }
    }
  });

  // Listen to incoming messages
  sock.ev.on('messages.upsert', async (m) => {
    const msg = m.messages[0];
    if (!msg.message) return;

    // Abaikan pesan offline/sinkronisasi lama yang dikirim sebelum bot online
    const msgTime = Number(msg.messageTimestamp || 0);
    if (msgTime && botStartupTime && msgTime < botStartupTime) {
      return; 
    }

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

    // Resolve LID to Phone Number using altJid or contactMap
    const senderJid = participantJid || fromJid;
    if (cleanNumber && senderJid.endsWith('@lid')) {
      const lidClean = cleanNumber;
      if (lidToPnMap.has(lidClean)) {
        cleanNumber = lidToPnMap.get(lidClean);
      } else {
        const altJid = msg.key.remoteJidAlt || msg.key.participantAlt || msg.senderPn || msg.participantAlt || msg.remoteJidAlt || '';
        if (altJid && altJid.includes('@s.whatsapp.net')) {
          cleanNumber = altJid.split('@')[0];
        }
      }
    }

    if (!cleanNumber) return;

    try {
      let profile = null;

      // Jika perintah adalah trigger laporan, cari profil yang menautkan chat/grup ini
      const isTrigger = textTrimmed === 'test-report' || textTrimmed === '/test-report' || textTrimmed === 'laporan' || textTrimmed === '/laporan';
      if (isTrigger) {
        const { data: linkedProfile, error: linkErr } = await supabase
          .from('profiles')
          .select('*')
          .eq('whatsapp_group_id', fromJid)
          .maybeSingle();

        if (linkedProfile) {
          profile = linkedProfile;
        }
      }

      // Jika belum menemukan profil (karena perintahnya adalah /setgrup / /unlinkgrup), cari berdasarkan nomor pengirim
      if (!profile && !isTrigger) {
        const { data: senderProfile, error: sendErr } = await supabase
          .from('profiles')
          .select('*')
          .eq('whatsapp_number', cleanNumber)
          .maybeSingle();

        if (senderProfile) {
          profile = senderProfile;
        }
      }

      if (!profile) {
        return; // Jika tidak terdaftar, diam saja
      }

      // Perintah: Tautkan Chat/Grup
      if (textTrimmed === '/setgrup' || textTrimmed === '!setgrup' || textTrimmed === 'set grup') {
        const { error: updateError } = await supabase
          .from('profiles')
          .update({ whatsapp_group_id: fromJid })
          .eq('id', profile.id);

        if (updateError) throw updateError;

        await sock.sendMessage(fromJid, {
          text: `✅ *Target Laporan Berhasil Ditautkan!*
          
Laporan keuangan harian milik *Yayasan Annida Setu* akan otomatis dikirim ke chat/grup ini setiap pagi pukul 06:00.`,
          mentions: [participantJid]
        });
        return;
      }

      // Pastikan pesan dikirim di grup yang benar (jika grup) atau di chat pribadi
      if (isGroup && profile.whatsapp_group_id !== fromJid) {
        return; // Abaikan grup lain
      }

      // Perintah: Lepas Tautan Chat/Grup
      if (textTrimmed === '/unlinkgrup') {
        const { error: updateError } = await supabase
          .from('profiles')
          .update({ whatsapp_group_id: null })
          .eq('id', profile.id);

        if (updateError) throw updateError;

        await sock.sendMessage(fromJid, {
          text: `❌ *Target Laporan Berhasil Dilepas!*
          
Laporan keuangan harian milik *Yayasan Annida Setu* tidak akan lagi dikirim ke chat/grup ini.`,
          mentions: [participantJid]
        });
        return;
      }

      // Perintah: Kirim Laporan Keuangan Secara Instan (Manual)
      if (textTrimmed === 'test-report' || textTrimmed === '/test-report' || textTrimmed === 'laporan' || textTrimmed === '/laporan') {
        await sendDailyReport(sock, cleanNumber, profile, fromJid);
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
