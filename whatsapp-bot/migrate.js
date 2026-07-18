import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function migrate() {
  console.log('🔄 Menjalankan migrasi database...');

  // Tambah kolom whatsapp_targets sebagai array teks
  const { error } = await supabase.rpc('exec_sql', {
    sql: `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS whatsapp_targets text[] DEFAULT '{}';`
  });

  if (error) {
    // Coba cara alternatif - update salah satu row untuk test apakah kolom sudah ada
    const { error: testErr } = await supabase
      .from('profiles')
      .update({ whatsapp_targets: [] })
      .eq('id', '00000000-0000-0000-0000-000000000000'); // dummy ID, pasti tidak ada

    if (testErr && testErr.message && testErr.message.includes('whatsapp_targets')) {
      console.error('❌ Kolom whatsapp_targets belum ada dan gagal dibuat otomatis.');
      console.error('Silakan jalankan SQL ini secara manual di Supabase SQL Editor:');
      console.error('ALTER TABLE profiles ADD COLUMN whatsapp_targets text[] DEFAULT \'{}\';');
      process.exit(1);
    } else {
      console.log('✅ Kolom whatsapp_targets sudah ada atau berhasil dibuat.');
    }
  } else {
    console.log('✅ Kolom whatsapp_targets berhasil ditambahkan ke tabel profiles.');
  }

  // Migrasi data lama: pindahkan whatsapp_group_id ke whatsapp_targets jika whatsapp_targets masih kosong
  const { data: profiles, error: fetchErr } = await supabase
    .from('profiles')
    .select('id, whatsapp_group_id, whatsapp_targets')
    .not('whatsapp_group_id', 'is', null);

  if (fetchErr) {
    console.error('❌ Gagal mengambil data profil:', fetchErr);
    process.exit(1);
  }

  let migrated = 0;
  for (const profile of profiles || []) {
    const targets = profile.whatsapp_targets || [];
    if (!targets.includes(profile.whatsapp_group_id)) {
      const newTargets = [...targets, profile.whatsapp_group_id];
      const { error: updateErr } = await supabase
        .from('profiles')
        .update({ whatsapp_targets: newTargets })
        .eq('id', profile.id);

      if (updateErr) {
        console.error(`❌ Gagal migrasi profil ${profile.id}:`, updateErr);
      } else {
        console.log(`✅ Migrasi profil ${profile.id}: whatsapp_group_id → whatsapp_targets`);
        migrated++;
      }
    }
  }

  console.log(`\n✅ Migrasi selesai! ${migrated} profil berhasil dimigrasikan.`);
  process.exit(0);
}

migrate().catch(err => {
  console.error('❌ Error migrasi:', err);
  process.exit(1);
});
