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

  // Load existing setting
  const geminiInput = document.getElementById('gemini-key');
  
  const savedKey = localStorage.getItem('gemini_api_key') || '';
  geminiInput.value = savedKey;

  // Handle save
  document.getElementById('settings-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const keyVal = geminiInput.value.trim();
    
    localStorage.setItem('gemini_api_key', keyVal);
    showToast('Pengaturan berhasil disimpan!', 'success');
  });
});
