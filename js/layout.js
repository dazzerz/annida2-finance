export function injectLayout(activeId, pageTitle, pageSubtitle) {
  const sidebarHtml = `
    <!-- ── SIDEBAR ── -->
    <nav class="sidebar" id="sidebar" aria-label="Navigasi utama">
      <div class="sidebar-header">
        <img src="${isRoot() ? '.' : '..'}/assets/logo/1.png" alt="Logo" class="sidebar-logo" style="background:transparent;box-shadow:none;padding:2px;" />
        <span class="sidebar-title">Annida2Finance</span>
      </div>

      <div class="sidebar-nav">
        <span class="nav-section-label">Menu Utama</span>
        <a href="${isRoot() ? '.' : '..'}/index.html" class="nav-item ${activeId === 'dashboard' ? 'active' : ''}" id="nav-dashboard">
          <span class="nav-icon">🏠</span> Dashboard
        </a>
        <a href="${isRoot() ? '.' : '..'}/pages/transactions.html" class="nav-item ${activeId === 'transactions' ? 'active' : ''}" id="nav-transactions">
          <span class="nav-icon">💸</span> Transaksi
        </a>
        <a href="${isRoot() ? '.' : '..'}/pages/budget.html" class="nav-item ${activeId === 'budget' ? 'active' : ''}" id="nav-budget">
          <span class="nav-icon">💰</span> Budget
        </a>
        <a href="${isRoot() ? '.' : '..'}/pages/reports.html" class="nav-item ${activeId === 'reports' ? 'active' : ''}" id="nav-reports">
          <span class="nav-icon">📄</span> Laporan
        </a>
        <a href="${isRoot() ? '.' : '..'}/pages/rab.html" class="nav-item ${activeId === 'rab' ? 'active' : ''}" id="nav-rab">
          <span class="nav-icon">📋</span> RAB Kelas
        </a>
        <a href="${isRoot() ? '.' : '..'}/pages/settings.html" class="nav-item ${activeId === 'settings' ? 'active' : ''}" id="nav-settings">
          <span class="nav-icon">⚙️</span> Pengaturan
        </a>
      </div>

      <div class="sidebar-footer">
        <div class="sidebar-user">
          <div class="user-avatar" id="user-avatar">?</div>
          <div class="user-info">
            <div class="user-name" id="nav-user-name">Memuat...</div>
            <div class="user-email" id="nav-user-email">—</div>
          </div>
        </div>
        <button class="sidebar-logout-btn" id="logout-btn" aria-label="Keluar">
          <span>🚪</span> Keluar
        </button>
      </div>
    </nav>
    <div class="sidebar-overlay" id="sidebar-overlay" aria-hidden="true"></div>
  `;

  const topbarHtml = `
    <!-- Topbar -->
    <header class="topbar">
      <div class="flex items-center gap-md">
        <button class="mobile-menu-btn" id="mobile-menu-btn" aria-label="Buka menu">☰</button>
        <div class="topbar-left">
          <div class="topbar-greeting" id="greeting-text">${pageTitle}</div>
          <div class="topbar-title" id="user-name-display">${pageSubtitle}</div>
        </div>
      </div>
      <div class="topbar-right" id="topbar-right-container">
        <!-- Right actions injected here by specific pages -->
        <button class="theme-toggle" id="theme-toggle" aria-label="Ganti tema">☀️</button>
      </div>
    </header>
  `;

  // Inject to DOM
  const appLayout = document.querySelector('.app-layout');
  if (appLayout) {
    appLayout.insertAdjacentHTML('afterbegin', sidebarHtml);
    const mainContent = document.querySelector('.main-content');
    if (mainContent) {
      mainContent.insertAdjacentHTML('afterbegin', topbarHtml);
    }
  }
}

function isRoot() {
  return window.location.pathname.endsWith('index.html') || window.location.pathname.endsWith('Annida2Finance/') || !window.location.pathname.includes('/pages/');
}
