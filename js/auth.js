// =====================================================
// ANNIDA2FINANCE - Authentication Module
// =====================================================
import supabaseClient from './supabase.js';
import { showToast, setupThemeToggle, applySavedTheme } from './utils.js';

function showAuthMessage(message, type) {
  const el = document.getElementById('auth-message');
  if (!el) return;
  el.textContent = message;
  el.className = `auth-message ${type} show`;
  setTimeout(() => el.classList.remove('show'), 5000);
}

function setLoading(btnId, isLoading) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.classList.toggle('loading', isLoading);
  btn.disabled = isLoading;
}

// ── LOGIN ─────────────────────────────────────────
async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  if (!email || !password) {
    showAuthMessage('Mohon isi email dan password.', 'error');
    return;
  }
  setLoading('login-btn', true);
  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) {
    const msgs = {
      'Invalid login credentials': 'Email atau password salah.',
      'Email not confirmed': 'Cek email kamu dan klik link verifikasi terlebih dahulu.',
    };
    showAuthMessage(msgs[error.message] || error.message, 'error');
    setLoading('login-btn', false);
    return;
  }
  showAuthMessage('Login berhasil! Mengalihkan...', 'success');
  setTimeout(() => { window.location.href = './index.html'; }, 800);
}

// ── REGISTER ──────────────────────────────────────
async function handleRegister(e) {
  e.preventDefault();
  const name = document.getElementById('register-name').value.trim();
  const email = document.getElementById('register-email').value.trim();
  const password = document.getElementById('register-password').value;
  const confirmPassword = document.getElementById('register-confirm').value;

  if (!name || !email || !password || !confirmPassword) {
    showAuthMessage('Mohon isi semua kolom.', 'error'); return;
  }
  if (password.length < 6) {
    showAuthMessage('Password minimal 6 karakter.', 'error'); return;
  }
  if (password !== confirmPassword) {
    showAuthMessage('Konfirmasi password tidak cocok.', 'error'); return;
  }
  setLoading('register-btn', true);

  const { data, error } = await supabaseClient.auth.signUp({
    email, password,
    options: { data: { full_name: name } },
  });

  if (error) {
    const msgs = { 'User already registered': 'Email ini sudah terdaftar. Silakan login.' };
    showAuthMessage(msgs[error.message] || error.message, 'error');
    setLoading('register-btn', false);
    return;
  }

  showAuthMessage(
    data.session
      ? 'Registrasi berhasil! Mengalihkan ke dashboard...'
      : 'Registrasi berhasil! Cek email kamu untuk verifikasi lalu login.',
    'success'
  );
  setLoading('register-btn', false);

  if (data.session) {
    setTimeout(() => { window.location.href = './index.html'; }, 800);
  } else {
    document.getElementById('register-form').reset();
    setTimeout(() => switchTab('login'), 3000);
  }
}

// ── LOGOUT ────────────────────────────────────────
export async function handleLogout() {
  await supabaseClient.auth.signOut();
  const isInPages = window.location.pathname.includes('/pages/');
  window.location.href = isInPages ? '../login.html' : './login.html';
}

// ── AUTH GUARD ────────────────────────────────────
export async function requireAuth() {
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) {
    const isInPages = window.location.pathname.includes('/pages/');
    window.location.href = isInPages ? '../login.html' : './login.html';
    return null;
  }
  return user;
}

// ── TAB SWITCHING ─────────────────────────────────
function switchTab(tab) {
  document.querySelectorAll('.auth-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  document.querySelectorAll('.auth-form-panel').forEach(panel => {
    panel.classList.toggle('active', panel.id === `${tab}-panel`);
  });
  const msgEl = document.getElementById('auth-message');
  if (msgEl) { msgEl.className = 'auth-message'; msgEl.textContent = ''; }
}

// ── PASSWORD TOGGLE ───────────────────────────────
function setupPasswordToggles() {
  document.querySelectorAll('[data-toggle-password]').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = document.getElementById(btn.dataset.togglePassword);
      if (!input) return;
      const isPass = input.type === 'password';
      input.type = isPass ? 'text' : 'password';
      btn.textContent = isPass ? '🙈' : '👁️';
    });
  });
}

// ── INIT AUTH PAGE ────────────────────────────────
export function initAuthPage() {
  applySavedTheme();

  // Redirect if already logged in
  supabaseClient.auth.getUser().then(({ data: { user } }) => {
    if (user) window.location.href = './index.html';
  });

  // Tab buttons
  document.querySelectorAll('.auth-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Quick switch links
  document.getElementById('goto-register')?.addEventListener('click', e => { e.preventDefault(); switchTab('register'); });
  document.getElementById('goto-login')?.addEventListener('click', e => { e.preventDefault(); switchTab('login'); });

  // Forms
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  if (loginForm) loginForm.addEventListener('submit', handleLogin);
  if (registerForm) registerForm.addEventListener('submit', handleRegister);

  setupPasswordToggles();
  setupThemeToggle('auth-theme-toggle');
}
