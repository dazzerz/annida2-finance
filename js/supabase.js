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
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4cmdlenlmeHp5bnB1Y3VvbWNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM3NzgxNDEsImV4cCI6MjA5OTM1NDE0MX0.3Y9Mal4M76D8fJfcVXQLbPSpLL_m8H7zQ-oVQG6e5IA';

// Initialize Supabase Client
const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export default supabaseClient;
