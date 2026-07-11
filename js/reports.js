// =====================================================
// ANNIDA2FINANCE - Reports Module
// =====================================================
import { formatCurrency, formatDate } from './utils.js';

export async function exportToPDF(reportData) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const { period, userName, income, expense, balance, transactions, categoryBreakdown } = reportData;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 18;
  let y = margin;

  // Header
  doc.setFillColor(10, 15, 30);
  doc.rect(0, 0, pageWidth, 48, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20); doc.setFont('helvetica', 'bold');
  doc.text('Annida2Finance', margin, 22);
  doc.setFontSize(10); doc.setFont('helvetica', 'normal');
  doc.setTextColor(136, 153, 176);
  doc.text('Laporan Keuangan', margin, 32);
  doc.text(period, margin, 40);
  doc.text(`Dibuat: ${new Date().toLocaleDateString('id-ID', { dateStyle: 'long' })}`, pageWidth - margin, 22, { align: 'right' });
  doc.text(`Pengguna: ${userName}`, pageWidth - margin, 30, { align: 'right' });
  y = 58;

  // Summary cards
  doc.setTextColor(30, 42, 61); doc.setFontSize(12); doc.setFont('helvetica', 'bold');
  doc.text('Ringkasan Keuangan', margin, y); y += 6;
  const cardWidth = (pageWidth - margin * 2 - 8) / 3;

  [[230,252,245,[16,185,129],'Total Pemasukan',income],
   [255,235,235,[239,68,68],'Total Pengeluaran',expense],
   [235,242,255,[59,130,246],'Saldo Bersih',Math.abs(balance)]].forEach(([r,g,b,color,label,val], i) => {
    const x = margin + i * (cardWidth + 4);
    doc.setFillColor(r, g, b); doc.roundedRect(x, y, cardWidth, 24, 3, 3, 'F');
    doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 120, 140);
    doc.text(label, x + 6, y + 8);
    doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(...color);
    doc.text(formatCurrency(val), x + 6, y + 18);
  });
  y += 34;

  // Category breakdown
  if (categoryBreakdown?.length) {
    doc.setTextColor(30,42,61); doc.setFontSize(12); doc.setFont('helvetica','bold');
    doc.text('Pengeluaran per Kategori', margin, y); y += 6;
    const totalExp = categoryBreakdown.reduce((s, c) => s + c.total, 0);
    categoryBreakdown.slice(0, 8).forEach(cat => {
      const pct = totalExp > 0 ? cat.total / totalExp : 0;
      const barWidth = (pageWidth - margin * 2 - 40) * pct;
      doc.setTextColor(60,80,100); doc.setFontSize(9); doc.setFont('helvetica','normal');
      doc.text(cat.name, margin, y + 5);
      doc.text(formatCurrency(cat.total), pageWidth - margin, y + 5, { align: 'right' });
      doc.setFillColor(230,235,245); doc.roundedRect(margin + 30, y, pageWidth - margin * 2 - 35, 5, 1, 1, 'F');
      if (barWidth > 0) {
        const hex = cat.color || '#3b82f6';
        doc.setFillColor(parseInt(hex.slice(1,3),16), parseInt(hex.slice(3,5),16), parseInt(hex.slice(5,7),16));
        doc.roundedRect(margin + 30, y, barWidth, 5, 1, 1, 'F');
      }
      y += 10;
    });
    y += 4;
  }

  // Transactions table
  doc.setTextColor(30,42,61); doc.setFontSize(12); doc.setFont('helvetica','bold');
  doc.text('Rincian Transaksi', margin, y); y += 6;
  doc.setFillColor(15,24,41); doc.rect(margin, y, pageWidth - margin*2, 8, 'F');
  doc.setTextColor(255,255,255); doc.setFontSize(8); doc.setFont('helvetica','bold');
  doc.text('Tanggal', margin+3, y+5.5); doc.text('Keterangan', margin+28, y+5.5);
  doc.text('Kategori', margin+95, y+5.5); doc.text('Tipe', margin+130, y+5.5);
  doc.text('Jumlah', pageWidth-margin-3, y+5.5, { align:'right' });
  y += 10;

  (transactions || []).forEach((t, i) => {
    if (y > pageHeight - 20) { doc.addPage(); y = margin; }
    if (i % 2 === 0) { doc.setFillColor(245,248,255); doc.rect(margin, y, pageWidth-margin*2, 8, 'F'); }
    const isIncome = t.type === 'income';
    doc.setFontSize(8); doc.setFont('helvetica','normal'); doc.setTextColor(80,100,120);
    doc.text(formatDate(t.date), margin+3, y+5.5);
    doc.text((t.description||t.categories?.name||'-').substring(0,35), margin+28, y+5.5);
    doc.text((t.categories?.name||'Lainnya').substring(0,20), margin+95, y+5.5);
    doc.setTextColor(isIncome ? 16 : 239, isIncome ? 185 : 68, isIncome ? 129 : 68);
    doc.text(isIncome ? 'Pemasukan' : 'Pengeluaran', margin+130, y+5.5);
    doc.setFont('helvetica','bold');
    doc.text(`${isIncome?'+':'-'}${formatCurrency(t.amount)}`, pageWidth-margin-3, y+5.5, { align:'right' });
    y += 8;
  });

  // Footer
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setDrawColor(200,210,225); doc.line(margin, pageHeight-12, pageWidth-margin, pageHeight-12);
    doc.setFontSize(8); doc.setTextColor(136,153,176); doc.setFont('helvetica','normal');
    doc.text('Annida2Finance — Laporan Keuangan Pribadi', margin, pageHeight-6);
    doc.text(`Halaman ${i} dari ${totalPages}`, pageWidth-margin, pageHeight-6, { align:'right' });
  }

  doc.save(`annida2finance-laporan-${period.replace(/\s/g,'-')}.pdf`);
}

export function renderReportTransactions(transactions) {
  const el = document.getElementById('report-transactions-list');
  if (!el) return;
  if (!transactions?.length) {
    el.innerHTML = `<div class="empty-state" style="padding:2rem"><div class="empty-state-icon">📭</div><div class="empty-state-title">Tidak ada transaksi</div></div>`;
    return;
  }
  el.innerHTML = transactions.map(t => {
    const cat = t.categories;
    const isIncome = t.type === 'income';
    return `<div class="transaction-item">
      <div class="transaction-icon" style="background:${cat?.color||'#64748b'}22">${cat?.icon||'💰'}</div>
      <div class="transaction-info">
        <div class="transaction-name">${t.description||cat?.name||'Transaksi'}</div>
        <div class="transaction-date">${cat?.name||'Lainnya'} · ${formatDate(t.date)}</div>
      </div>
      <div class="transaction-amount ${t.type}">${isIncome?'+':'-'}${formatCurrency(t.amount)}</div>
    </div>`;
  }).join('');
}
