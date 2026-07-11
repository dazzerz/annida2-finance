// =====================================================
// ANNIDA2FINANCE - Authentication Module
// =====================================================
import supabaseClient from './supabase.js';

// ── Toast helper ──────────────────────────────────
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type]}</span>
    <span class="toast-message">${message}</span>
  `;
  container.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 400);
  }, 3500);
}

// ── Show auth message (form-level error/success) ──
function showAuthMessage(message, type) {
  const el = document.getElementById('auth-message');
  if (!el) return;
  el.textContent = message;
  el.className = `auth-message ${type} show`;
  setTimeout(() => el.classList.remove('show'), 5000);
}

// ── Toggle button loading state ───────────────────
function setLoading(btnId, isLoading) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  if (isLoading) {
    btn.classList.add('loading');
    btn.disabled = true;
  } else {
    btn.classList.remove('loading');
    btn.disabled = false;
  }
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

  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    const messages = {
      'Invalid login credentials': 'Email atau password salah.',
      'Email not confirmed': 'Silakan verifikasi email kamu terlebih dahulu.',
    };
    showAuthMessage(messages[error.message] || error.message, 'error');
    setLoading('login-btn', false);
    return;
  }

  showAuthMessage('Login berhasil! Mengalihkan...', 'success');
  setTimeout(() => {
    window.location.href = './index.html';
  }, 1000);
}

// ── REGISTER ──────────────────────────────────────
async function handleRegister(e) {
  e.preventDefault();
  const name = document.getElementById('register-name').value.trim();
  const email = document.getElementById('register-email').value.trim();
  const password = document.getElementById('register-password').value;
  const confirmPassword = document.getElementById('register-confirm').value;

  if (!name || !email || !password || !confirmPassword) {
    showAuthMessage('Mohon isi semua kolom.', 'error');
    return;
  }

  if (password.length < 6) {
    showAuthMessage('Password minimal 6 karakter.', 'error');
    return;
  }

  if (password !== confirmPassword) {
    showAuthMessage('Konfirmasi password tidak cocok.', 'error');
    return;
  }

  setLoading('register-btn', true);

  const { data, error } = await supabaseClient.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: name },
    },
  });

  if (error) {
    const messages = {
      'User already registered': 'Email ini sudah terdaftar. Silakan login.',
    };
    showAuthMessage(messages[error.message] || error.message, 'error');
    setLoading('register-btn', false);
    return;
  }

  // Check if email confirmation is required
  if (data.user && data.user.identities && data.user.identities.length === 0) {
    showAuthMessage('Email ini sudah terdaftar. Silakan login.', 'error');
    setLoading('register-btn', false);
    return;
  }

  showAuthMessage(
    'Registrasi berhasil! Cek email kamu untuk verifikasi, lalu login.',
    'success'
  );

  // Reset form
  document.getElementById('register-form').reset();
  setLoading('register-btn', false);

  // Switch to login tab after 3 seconds
  setTimeout(() => switchTab('login'), 3000);
}

// ── LOGOUT ────────────────────────────────────────
async function handleLogout() {
  const { error } = await supabaseClient.auth.signOut();
  if (error) {
    console.error('Logout error:', error);
    return;
  }
  window.location.href = '../login.html';
}

// ── Get current user ──────────────────────────────
async function getCurrentUser() {
  const { data: { user }, error } = await supabaseClient.auth.getUser();
  if (error || !user) return null;
  return user;
}

// ── Auth guard: redirect to login if not logged in ─
async function requireAuth() {
  const user = await getCurrentUser();
  if (!user) {
    const isInPages = window.location.pathname.includes('/pages/');
    window.location.href = isInPages ? '../login.html' : './login.html';
    return null;
  }
  return user;
}

// ── Auth redirect: redirect to dashboard if logged in ─
async function redirectIfLoggedIn() {
  const user = await getCurrentUser();
  if (user) {
    window.location.href = './index.html';
  }
}

// ── Tab Switching ─────────────────────────────────
function switchTab(tab) {
  document.querySelectorAll('.auth-tab-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  document.querySelectorAll('.auth-form-panel').forEach((panel) => {
    panel.classList.toggle('active', panel.id === `${tab}-panel`);
  });
  // Clear messages on tab switch
  const msgEl = document.getElementById('auth-message');
  if (msgEl) {
    msgEl.className = 'auth-message';
    msgEl.textContent = '';
  }
}

// ── Password visibility toggle ────────────────────
function setupPasswordToggles() {
  document.querySelectorAll('[data-toggle-password]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.togglePassword;
      const input = document.getElementById(targetId);
      if (!input) return;
      const isPassword = input.type === 'password';
      input.type = isPassword ? 'text' : 'password';
      btn.textContent = isPassword ? '🙈' : '👁️';
    });
  });
}

// ── Theme Toggle ──────────────────────────────────
function setupThemeToggle(btnId = 'theme-toggle') {
  const btn = document.getElementById(btnId);
  if (!btn) return;

  const saved = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  btn.textContent = saved === 'dark' ? '☀️' : '🌙';

  btn.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    btn.textContent = next === 'dark' ? '☀️' : '🌙';
  });
}

// ── Initialize Auth Page ──────────────────────────
function initAuthPage() {
  // Apply saved theme
  const savedTheme = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);

  // Redirect if already logged in
  redirectIfLoggedIn();

  // Tab buttons
  document.querySelectorAll('.auth-tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Forms
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  if (loginForm) loginForm.addEventListener('submit', handleLogin);
  if (registerForm) registerForm.addEventListener('submit', handleRegister);

  // Password toggles
  setupPasswordToggles();

  // Theme toggle
  setupThemeToggle('auth-theme-toggle');
}

export {
  initAuthPage,
  handleLogout,
  getCurrentUser,
  requireAuth,
  setupThemeToggle,
  showToast,
};
