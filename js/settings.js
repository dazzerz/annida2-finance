import supabaseClient from './supabase.js';
import { requireAuth, handleLogout } from './auth.js';
import { showToast, setupThemeToggle, applySavedTheme } from './utils.js';

document.addEventListener('DOMContentLoaded', async () => {
  applySavedTheme();
  setupThemeToggle();

  const user = await requireAuth();
  if (!user) return;

  // Set user info di sidebar
  const email = user.email || '';
  document.getElementById('nav-user-email').textContent = email;
  document.getElementById('nav-user-name').textContent = email.split('@')[0];
  document.getElementById('user-avatar').textContent = email.charAt(0).toUpperCase();

  // Handle logout
  document.getElementById('logout-btn').addEventListener('click', handleLogout);

  // Mobile menu toggle
  const mobileMenuBtn = document.getElementById('mobile-menu-btn');
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');

  mobileMenuBtn.addEventListener('click', () => {
    sidebar.classList.add('open');
    overlay.classList.add('show');
  });

  overlay.addEventListener('click', () => {
    sidebar.classList.remove('open');
    overlay.classList.remove('show');
  });

  // Load existing settings
  const geminiInput = document.getElementById('gemini-key');
  const whatsappInput = document.getElementById('whatsapp-number');
  
  const savedKey = localStorage.getItem('gemini_api_key') || '';
  geminiInput.value = savedKey;

  // Fetch profiles from Supabase to load whatsapp_number
  try {
    const { data: profile, error } = await supabaseClient
      .from('profiles')
      .select('whatsapp_number')
      .eq('id', user.id)
      .maybeSingle();

    if (error) {
      console.error('Error fetching profile:', error);
    } else if (profile && profile.whatsapp_number) {
      whatsappInput.value = profile.whatsapp_number;
    }
  } catch (err) {
    console.error('Failed to load profile settings:', err);
  }

  // Handle save
  document.getElementById('settings-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const keyVal = geminiInput.value.trim();
    const whatsappVal = whatsappInput.value.trim();
    
    // Clean WhatsApp number: keep only digits
    const whatsappClean = whatsappVal.replace(/[^0-9]/g, '');

    try {
      // Save Gemini key to localStorage
      localStorage.setItem('gemini_api_key', keyVal);

      // Save WhatsApp number to Supabase profiles table
      const { error } = await supabaseClient
        .from('profiles')
        .update({ 
          whatsapp_number: whatsappClean || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id);

      if (error) {
        if (error.code === '23505') { // Unique constraint violation
          showToast('Nomor WhatsApp sudah digunakan oleh akun lain!', 'error');
        } else {
          showToast('Gagal menyimpan nomor WhatsApp: ' + error.message, 'error');
        }
      } else {
        showToast('Pengaturan berhasil disimpan!', 'success');
      }
    } catch (err) {
      console.error('Error saving settings:', err);
      showToast('Terjadi kesalahan saat menyimpan pengaturan.', 'error');
    }
  });
});
