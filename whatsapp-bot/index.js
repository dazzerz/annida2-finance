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

// Timestamp (detik) saat bot berhasil konek — pesan lebih lama dari ini akan diabaikan
let botConnectedAt = 0;
let isReady = false;

// Set untuk tracking pesan yang sudah diproses (mencegah duplikasi)
const processedMsgIds = new Set();

// Map untuk cooldown auto-reply per pengirim (mencegah spam balasan)
// Key: JID pengirim, Value: timestamp terakhir auto-reply
const autoReplyCooldown = new Map();
const AUTO_REPLY_COOLDOWN_MS = 60 * 60 * 1000; // 1 jam

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

// Function to fetch monthly summary and overall balance (semua transaksi semua akun)
async function getMonthlySummary() {
  const { data: txs, error } = await supabase
    .from('transactions')
    .select('amount, type, date, sumber_dana');
    
  if (error) throw error;
  
  const { start, end } = getCurrentMonthRange();
  
  let monthlyIncome = 0, monthlyExpense = 0;
  let allTimeKasIncome = 0, allTimeKasExpense = 0;
  let allTimeBankIncome = 0, allTimeBankExpense = 0;
  
  txs.forEach(tx => {
    const amt = parseFloat(tx.amount);
    const isCurrentMonth = tx.date >= start && tx.date <= end;
    const isKas = tx.sumber_dana === 'kas';
    
    if (tx.type === 'income') {
      if (isCurrentMonth) monthlyIncome += amt;
      if (isKas) allTimeKasIncome += amt; else allTimeBankIncome += amt;
    } else {
      if (isCurrentMonth) monthlyExpense += amt;
      if (isKas) allTimeKasExpense += amt; else allTimeBankExpense += amt;
    }
  });
  
  return {
    income: monthlyIncome,
    expense: monthlyExpense,
    balance: (allTimeKasIncome + allTimeBankIncome) - (allTimeKasExpense + allTimeBankExpense),
    kasBalance: allTimeKasIncome - allTimeKasExpense,
    bankBalance: allTimeBankIncome - allTimeBankExpense,
  };
}

// Helper: Resolve JID ke nama yang mudah dibaca (nama grup / nomor HP)
async function getFriendlyName(sock, jid) {
  try {
    if (jid.endsWith('@g.us')) {
      const meta = await sock.groupMetadata(jid);
      return `Grup "${meta.subject}"`;
    }
    if (jid.endsWith('@s.whatsapp.net')) {
      return `+${jid.split('@')[0]}`;
    }
    if (jid.endsWith('@lid')) {
      const lidClean = jid.split('@')[0];
      const pn = lidToPnMap.get(lidClean);
      return pn ? `+${pn}` : `Chat Pribadi`;
    }
  } catch (_) {}
  return jid;
}

// Function to generate and send report to a specific JID
async function sendReportToJid(sock, jid, profile) {
  try {
    const summary = await getMonthlySummary();
    
    let monthName = new Date().toLocaleString('id-ID', { month: 'long' });
    monthName = monthName.charAt(0).toUpperCase() + monthName.slice(1);

    const reportMessage = `Rekap Keuangan SMP Annida Al Islamy Setu
Pemasukan (${monthName}) : ${formatRupiah(summary.income)}
Pengeluaran (${monthName}) : ${formatRupiah(summary.expense)}

💵 Kas Tunai  : ${formatRupiah(summary.kasBalance)}
🏦 Bank       : ${formatRupiah(summary.bankBalance)}
📊 Total Saldo: ${formatRupiah(summary.balance)}`;

    await sock.sendMessage(jid, { text: reportMessage });
    const friendlyName = await getFriendlyName(sock, jid);
    console.log(`✉️  Laporan berhasil dikirim ke ${friendlyName} (Akun: ${profile.full_name || 'User'})`);
  } catch (err) {
    console.error(`❌ Gagal mengirim laporan ke ${jid}:`, err);
  }
}

// Function to send daily report to ALL targets of a profile
async function sendDailyReport(sock, profile) {
  const targets = profile.whatsapp_targets || [];

  // Fallback ke whatsapp_group_id lama jika targets kosong
  if (targets.length === 0 && profile.whatsapp_group_id) {
    targets.push(profile.whatsapp_group_id);
  }

  // Fallback ke nomor pribadi jika masih kosong
  if (targets.length === 0 && profile.whatsapp_number) {
    targets.push(`${profile.whatsapp_number}@s.whatsapp.net`);
  }

  if (targets.length === 0) {
    console.log(`⚠️  Profil "${profile.full_name}" tidak memiliki target penerima, lewati.`);
    return;
  }

  for (const jid of targets) {
    await sendReportToJid(sock, jid, profile);
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
      isReady = false;
      botConnectedAt = Math.floor(Date.now() / 1000); // Simpan waktu koneksi dalam detik
      console.log('✅ Bot WhatsApp berhasil tersambung! Sedang menyinkronkan data...');
      
      // Tunggu 5 detik agar sinkronisasi pesan offline selesai sebelum bot merespon perintah
      setTimeout(() => {
        isReady = true;
        console.log('⚡ Bot siap merespon perintah baru!');
      }, 5000);
      
      // Setup scheduler untuk Laporan Keuangan Harian setiap jam 06:00 Pagi
      cron.schedule('0 6 * * *', async () => {
        console.log('⏰ Menjalankan scheduler Laporan Keuangan Harian (06:00 AM)...');
        try {
          const { data: profiles, error } = await supabase
            .from('profiles')
            .select('*')
            .not('whatsapp_number', 'is', null);
            
          if (error) throw error;
          
          console.log(`📢 Mengirim laporan ke ${profiles.length} profil...`);
          for (const profile of profiles) {
            await sendDailyReport(sock, profile);
          }
        } catch (err) {
          console.error('❌ Gagal menjalankan scheduler laporan harian:', err);
        }
      }, { timezone: 'Asia/Jakarta' });
      console.log('📅 Scheduler laporan keuangan harian jam 06:00 pagi (WIB) aktif.');
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

    // Abaikan semua pesan jika bot belum siap (sedang menyinkronkan pesan lama di 5 detik pertama)
    if (!isReady) return;

    // Abaikan pesan lama yang dikirim SEBELUM bot terhubung (mencegah replay pesan historis)
    const msgTimestamp = msg.messageTimestamp?.toNumber?.() || Number(msg.messageTimestamp) || 0;
    if (msgTimestamp && botConnectedAt && msgTimestamp < botConnectedAt) return;

    // Abaikan pesan yang sudah pernah diproses (mencegah duplikasi event dari Baileys)
    const msgId = msg.key.id;
    if (msgId && processedMsgIds.has(msgId)) return;
    if (msgId) processedMsgIds.add(msgId);
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

    // ── AUTO-REPLY untuk chat pribadi ─────────────────────────────────────
    // Balas sekali per jam jika ada chat masuk ke chat pribadi (bukan grup, bukan dari diri sendiri)
    const isPrivateChat = !isGroup && 
                          !isFromMe && 
                          (fromJid.endsWith('@s.whatsapp.net') || fromJid.endsWith('@lid'));

    if (isPrivateChat && !isCommand) {
      const now = Date.now();
      const lastReplied = autoReplyCooldown.get(fromJid) || 0;
      if (now - lastReplied > AUTO_REPLY_COOLDOWN_MS) {
        autoReplyCooldown.set(fromJid, now);
        await sock.sendMessage(fromJid, {
          text: 'Pengguna nomer whatsapp ini sedang tidak menggunakan hp-nya mohon telpon jika ada hal yang urgent'
        });
        console.log(`📨 Auto-reply terkirim ke ${fromJid}`);
      }
      return; // Jangan proses lebih lanjut, ini bukan perintah bot
    }

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

      const isTrigger = textTrimmed === 'test-report' || textTrimmed === '/test-report' || textTrimmed === 'laporan' || textTrimmed === '/laporan';
      const isSetGrup = textTrimmed === '/setgrup' || textTrimmed === '!setgrup' || textTrimmed === 'set grup';
      const isUnlinkGrup = textTrimmed === '/unlinkgrup';

      if (isTrigger) {
        // Cari profil yang memiliki fromJid di dalam array whatsapp_targets
        const { data: allProfiles, error: fetchErr } = await supabase
          .from('profiles')
          .select('*')
          .not('whatsapp_targets', 'is', null);

        if (!fetchErr && allProfiles) {
          profile = allProfiles.find(p => (p.whatsapp_targets || []).includes(fromJid)) || null;
        }

        // Fallback: cek whatsapp_group_id lama
        if (!profile) {
          const { data: legacyProfile } = await supabase
            .from('profiles')
            .select('*')
            .eq('whatsapp_group_id', fromJid)
            .maybeSingle();
          if (legacyProfile) profile = legacyProfile;
        }
      }

      // Untuk /setgrup dan /unlinkgrup, cari profil berdasarkan nomor pengirim
      if (!profile && (isSetGrup || isUnlinkGrup)) {
        const { data: senderProfile } = await supabase
          .from('profiles')
          .select('*')
          .eq('whatsapp_number', cleanNumber)
          .maybeSingle();

        if (senderProfile) profile = senderProfile;
      }

      if (!profile) {
        return; // Jika tidak terdaftar, diam saja
      }

      // ── Perintah: Tambahkan Chat/Grup ke daftar penerima ──
      if (isSetGrup) {
        const currentTargets = profile.whatsapp_targets || [];

        if (currentTargets.includes(fromJid)) {
          // Sudah terdaftar
          const sentMsg = await sock.sendMessage(fromJid, {
            text: `ℹ️ Chat/grup ini sudah terdaftar sebagai penerima laporan keuangan *Yayasan Annida Setu*.`,
            mentions: [participantJid]
          });
          // Auto-hapus pesan konfirmasi setelah 5 detik
          setTimeout(async () => {
            try { await sock.sendMessage(fromJid, { delete: sentMsg.key }); } catch (_) {}
          }, 5000);
          return;
        }

        const newTargets = [...currentTargets, fromJid];
        const { error: updateError } = await supabase
          .from('profiles')
          .update({ whatsapp_targets: newTargets, whatsapp_group_id: fromJid })
          .eq('id', profile.id);

        if (updateError) throw updateError;

        const sentMsg = await sock.sendMessage(fromJid, {
          text: `✅ *Berhasil Ditambahkan!*\n\nChat/grup ini akan menerima laporan keuangan harian *Yayasan Annida Setu* setiap pagi pukul 06:00.\n\nTotal penerima aktif: *${newTargets.length}*`,
          mentions: [participantJid]
        });
        // Auto-hapus pesan konfirmasi setelah 5 detik
        setTimeout(async () => {
          try { await sock.sendMessage(fromJid, { delete: sentMsg.key }); } catch (_) {}
        }, 5000);
        return;
      }

      // Pastikan pesan /laporan dikirim di chat yang terdaftar (untuk keamanan)
      if (isTrigger && isGroup && !(profile.whatsapp_targets || []).includes(fromJid)) {
        return;
      }

      // ── Perintah: Hapus Chat/Grup dari daftar penerima ──
      if (isUnlinkGrup) {
        const currentTargets = profile.whatsapp_targets || [];
        const newTargets = currentTargets.filter(jid => jid !== fromJid);

        const { error: updateError } = await supabase
          .from('profiles')
          .update({
            whatsapp_targets: newTargets,
            whatsapp_group_id: newTargets.length > 0 ? newTargets[0] : null
          })
          .eq('id', profile.id);

        if (updateError) throw updateError;

        const sentMsg = await sock.sendMessage(fromJid, {
          text: `❌ *Berhasil Dihapus!*\n\nChat/grup ini tidak akan lagi menerima laporan keuangan *Yayasan Annida Setu*.\n\nSisa penerima aktif: *${newTargets.length}*`,
          mentions: [participantJid]
        });
        // Auto-hapus pesan konfirmasi setelah 5 detik
        setTimeout(async () => {
          try { await sock.sendMessage(fromJid, { delete: sentMsg.key }); } catch (_) {}
        }, 5000);
        return;
      }

      // ── Perintah: Kirim Laporan Keuangan Secara Instan (Manual) ──
      if (isTrigger) {
        await sendReportToJid(sock, fromJid, profile);
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
