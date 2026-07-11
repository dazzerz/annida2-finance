// =====================================================
// ANNIDA2FINANCE - Reports & PDF Export Module
// =====================================================
import { formatCurrency, formatDate } from './app.js';

// ── Generate and export PDF report ────────────────
export async function exportToPDF(reportData) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const {
    period,
    userName,
    income,
    expense,
    balance,
    transactions,
    categoryBreakdown,
  } = reportData;

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 18;
  let y = margin;

  // ── HEADER ──────────────────────────────────────
  // Background header gradient (approximated)
  doc.setFillColor(10, 15, 30);
  doc.rect(0, 0, pageWidth, 48, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('Annida2Finance', margin, 22);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(136, 153, 176);
  doc.text('Laporan Keuangan', margin, 32);
  doc.text(period, margin, 40);

  // Generated date (right side)
  doc.setTextColor(136, 153, 176);
  doc.setFontSize(9);
  doc.text(`Dibuat: ${new Date().toLocaleDateString('id-ID', { dateStyle: 'long' })}`, pageWidth - margin, 22, { align: 'right' });
  doc.text(`Pengguna: ${userName}`, pageWidth - margin, 30, { align: 'right' });

  y = 58;

  // ── SUMMARY CARDS ───────────────────────────────
  doc.setTextColor(30, 42, 61);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Ringkasan Keuangan', margin, y);
  y += 6;

  const cardWidth = (pageWidth - margin * 2 - 8) / 3;

  // Income card
  doc.setFillColor(16, 185, 129, 0.1);
  doc.setFillColor(230, 252, 245);
  doc.roundedRect(margin, y, cardWidth, 24, 3, 3, 'F');
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 120, 140);
  doc.text('Total Pemasukan', margin + 6, y + 8);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(16, 185, 129);
  doc.text(formatCurrency(income), margin + 6, y + 18);

  // Expense card
  const x2 = margin + cardWidth + 4;
  doc.setFillColor(255, 235, 235);
  doc.roundedRect(x2, y, cardWidth, 24, 3, 3, 'F');
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 120, 140);
  doc.text('Total Pengeluaran', x2 + 6, y + 8);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(239, 68, 68);
  doc.text(formatCurrency(expense), x2 + 6, y + 18);

  // Balance card
  const x3 = margin + (cardWidth + 4) * 2;
  doc.setFillColor(235, 242, 255);
  doc.roundedRect(x3, y, cardWidth, 24, 3, 3, 'F');
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 120, 140);
  doc.text('Saldo Bersih', x3 + 6, y + 8);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(balance >= 0 ? 16 : 239, balance >= 0 ? 185 : 68, balance >= 0 ? 129 : 68);
  doc.text(formatCurrency(Math.abs(balance)), x3 + 6, y + 18);

  y += 34;

  // ── CATEGORY BREAKDOWN ───────────────────────────
  if (categoryBreakdown && categoryBreakdown.length > 0) {
    doc.setTextColor(30, 42, 61);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Pengeluaran per Kategori', margin, y);
    y += 6;

    const totalExp = categoryBreakdown.reduce((s, c) => s + c.total, 0);

    categoryBreakdown.slice(0, 8).forEach((cat) => {
      const pct = totalExp > 0 ? (cat.total / totalExp) : 0;
      const barWidth = (pageWidth - margin * 2 - 40) * pct;

      doc.setTextColor(60, 80, 100);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text(cat.name, margin, y + 5);
      doc.text(formatCurrency(cat.total), pageWidth - margin, y + 5, { align: 'right' });

      // Progress bar background
      doc.setFillColor(230, 235, 245);
      doc.roundedRect(margin + 30, y, pageWidth - margin * 2 - 35, 5, 1, 1, 'F');
      // Progress bar fill
      if (barWidth > 0) {
        const hex = cat.color || '#3b82f6';
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        doc.setFillColor(r, g, b);
        doc.roundedRect(margin + 30, y, barWidth, 5, 1, 1, 'F');
      }
      y += 10;
    });
    y += 4;
  }

  // ── TRANSACTIONS TABLE ───────────────────────────
  doc.setTextColor(30, 42, 61);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Rincian Transaksi', margin, y);
  y += 6;

  // Table header
  doc.setFillColor(15, 24, 41);
  doc.rect(margin, y, pageWidth - margin * 2, 8, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('Tanggal', margin + 3, y + 5.5);
  doc.text('Keterangan', margin + 28, y + 5.5);
  doc.text('Kategori', margin + 95, y + 5.5);
  doc.text('Tipe', margin + 130, y + 5.5);
  doc.text('Jumlah', pageWidth - margin - 3, y + 5.5, { align: 'right' });
  y += 10;

  // Table rows
  if (!transactions || transactions.length === 0) {
    doc.setTextColor(136, 153, 176);
    doc.setFontSize(9);
    doc.text('Tidak ada transaksi pada periode ini.', pageWidth / 2, y + 5, { align: 'center' });
    y += 12;
  } else {
    transactions.forEach((t, i) => {
      if (y > pageHeight - 20) {
        doc.addPage();
        y = margin;
      }

      const isEven = i % 2 === 0;
      if (isEven) {
        doc.setFillColor(245, 248, 255);
        doc.rect(margin, y, pageWidth - margin * 2, 8, 'F');
      }

      const isIncome = t.type === 'income';
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(80, 100, 120);
      doc.text(formatDate(t.date), margin + 3, y + 5.5);
      doc.text(
        (t.description || t.categories?.name || '-').substring(0, 35),
        margin + 28,
        y + 5.5
      );
      doc.text((t.categories?.name || 'Lainnya').substring(0, 20), margin + 95, y + 5.5);

      doc.setTextColor(isIncome ? 16 : 239, isIncome ? 185 : 68, isIncome ? 129 : 68);
      doc.text(isIncome ? 'Pemasukan' : 'Pengeluaran', margin + 130, y + 5.5);

      doc.setFont('helvetica', 'bold');
      doc.text(
        `${isIncome ? '+' : '-'}${formatCurrency(t.amount)}`,
        pageWidth - margin - 3,
        y + 5.5,
        { align: 'right' }
      );
      y += 8;
    });
  }

  // ── FOOTER ──────────────────────────────────────
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setDrawColor(200, 210, 225);
    doc.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);
    doc.setFontSize(8);
    doc.setTextColor(136, 153, 176);
    doc.setFont('helvetica', 'normal');
    doc.text('Annida2Finance — Laporan Keuangan Pribadi', margin, pageHeight - 6);
    doc.text(`Halaman ${i} dari ${totalPages}`, pageWidth - margin, pageHeight - 6, { align: 'right' });
  }

  // ── SAVE ─────────────────────────────────────────
  const filename = `annida2finance-laporan-${period.replace(/\s/g, '-')}.pdf`;
  doc.save(filename);
}

// ── Render report transactions list ───────────────
export function renderReportTransactions(transactions) {
  const el = document.getElementById('report-transactions-list');
  if (!el) return;

  if (!transactions || transactions.length === 0) {
    el.innerHTML = `
      <div class="empty-state" style="padding:2rem;">
        <div class="empty-state-icon">📭</div>
        <div class="empty-state-title">Tidak ada transaksi</div>
      </div>
    `;
    return;
  }

  el.innerHTML = transactions.map((t) => {
    const cat = t.categories;
    const isIncome = t.type === 'income';
    return `
      <div class="transaction-item">
        <div class="transaction-icon" style="background:${cat?.color || '#64748b'}22;">${cat?.icon || '💰'}</div>
        <div class="transaction-info">
          <div class="transaction-name">${t.description || cat?.name || 'Transaksi'}</div>
          <div class="transaction-date">${cat?.name || 'Lainnya'} · ${formatDate(t.date)}</div>
        </div>
        <div class="transaction-amount ${t.type}">
          ${isIncome ? '+' : '-'}${formatCurrency(t.amount)}
        </div>
      </div>
    `;
  }).join('');
}
