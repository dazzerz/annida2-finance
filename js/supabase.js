// =====================================================
// ANNIDA2FINANCE - Supabase Client Initialization
// =====================================================
// ⚠️  CARA MENGISI KONFIGURASI:
//  1. Buka https://supabase.com/dashboard
//  2. Pilih project "Annida2 Finance"
//  3. Pergi ke Settings → API
//  4. Copy "Project URL" dan ganti SUPABASE_URL di bawah
//  5. Copy "anon public" key dan ganti SUPABASE_ANON_KEY di bawah
// =====================================================

const SUPABASE_URL = 'https://vxrgezyfxzynpucuomci.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY_HERE'; // ← Ganti dengan anon key kamu

// Initialize Supabase Client
const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export default supabaseClient;
