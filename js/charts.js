// =====================================================
// ANNIDA2FINANCE - Charts Module (Chart.js)
// =====================================================

let lineChartInstance = null;
let donutChartInstance = null;
let reportLineInstance = null;
let reportBarInstance = null;

// ── Global Chart defaults ─────────────────────────
function setupChartDefaults() {
  if (typeof Chart === 'undefined') return;
  Chart.defaults.font.family = "'Inter', sans-serif";
  Chart.defaults.color = '#8899b0';
  Chart.defaults.plugins.legend.display = false;
  Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(17, 24, 39, 0.95)';
  Chart.defaults.plugins.tooltip.borderColor = 'rgba(255, 255, 255, 0.08)';
  Chart.defaults.plugins.tooltip.borderWidth = 1;
  Chart.defaults.plugins.tooltip.padding = 12;
  Chart.defaults.plugins.tooltip.cornerRadius = 10;
  Chart.defaults.plugins.tooltip.titleFont = { weight: '700', size: 13 };
  Chart.defaults.plugins.tooltip.bodyFont = { size: 12 };
}

// ── Trend Line Chart (Dashboard & Reports) ────────
export function renderTrendChart(canvasId, trendData) {
  if (typeof Chart === 'undefined') return;
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  if (lineChartInstance) lineChartInstance.destroy();

  lineChartInstance = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels: trendData.labels,
      datasets: [
        {
          label: 'Pemasukan',
          data: trendData.income,
          borderColor: '#10b981',
          backgroundColor: 'rgba(16, 185, 129, 0.08)',
          borderWidth: 2.5,
          pointBackgroundColor: '#10b981',
          pointRadius: 4,
          pointHoverRadius: 6,
          tension: 0.4,
          fill: true,
        },
        {
          label: 'Pengeluaran',
          data: trendData.expense,
          borderColor: '#ef4444',
          backgroundColor: 'rgba(239, 68, 68, 0.06)',
          borderWidth: 2.5,
          pointBackgroundColor: '#ef4444',
          pointRadius: 4,
          pointHoverRadius: 6,
          tension: 0.4,
          fill: true,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: true, position: 'top', align: 'end',
          labels: { usePointStyle: true, pointStyleWidth: 8, boxHeight: 6 }
        },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${ctx.dataset.label}: ${formatCurrencyTooltip(ctx.parsed.y)}`,
          },
        },
      },
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,0.04)', drawBorder: false },
          ticks: { font: { size: 11 } },
        },
        y: {
          grid: { color: 'rgba(255,255,255,0.04)', drawBorder: false },
          ticks: {
            font: { size: 11 },
            callback: (val) => formatCurrencyTooltip(val),
          },
          beginAtZero: true,
        },
      },
    },
  });
}

// ── Donut Chart (Category Breakdown) ─────────────
export function renderDonutChart(canvasId, categoryData) {
  if (typeof Chart === 'undefined') return;
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  if (donutChartInstance) donutChartInstance.destroy();

  const labels = categoryData.map((c) => c.name);
  const values = categoryData.map((c) => c.total);
  const colors = categoryData.map((c) => c.color);

  donutChartInstance = new Chart(canvas.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: colors.map((c) => c + 'cc'),
        borderColor: colors,
        borderWidth: 2,
        hoverOffset: 8,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '72%',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${ctx.label}: ${formatCurrencyTooltip(ctx.parsed)}`,
          },
        },
      },
    },
  });

  // Render legend below chart
  const legendEl = document.getElementById('donut-legend');
  if (legendEl && categoryData.length > 0) {
    const total = values.reduce((a, b) => a + b, 0);
    legendEl.innerHTML = categoryData.map((c) => `
      <div class="donut-label-item">
        <div class="donut-label-left">
          <span class="donut-color-dot" style="background:${c.color}"></span>
          ${c.name}
        </div>
        <div class="donut-label-value">${total > 0 ? Math.round((c.total / total) * 100) : 0}%</div>
      </div>
    `).join('');
  }
}

// ── Report Bar Chart ──────────────────────────────
export function renderReportBarChart(canvasId, trendData) {
  if (typeof Chart === 'undefined') return;
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  if (reportBarInstance) reportBarInstance.destroy();

  reportBarInstance = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: trendData.labels,
      datasets: [
        {
          label: 'Pemasukan',
          data: trendData.income,
          backgroundColor: 'rgba(16, 185, 129, 0.7)',
          borderRadius: 6,
          borderSkipped: false,
        },
        {
          label: 'Pengeluaran',
          data: trendData.expense,
          backgroundColor: 'rgba(239, 68, 68, 0.7)',
          borderRadius: 6,
          borderSkipped: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: true, position: 'top', align: 'end',
          labels: { usePointStyle: true, boxHeight: 8 }
        },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${ctx.dataset.label}: ${formatCurrencyTooltip(ctx.parsed.y)}`,
          },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 11 } } },
        y: {
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: { callback: (val) => formatCurrencyTooltip(val), font: { size: 11 } },
          beginAtZero: true,
        },
      },
    },
  });
}

// ── Report Donut Chart ────────────────────────────
export function renderReportDonutChart(canvasId, categoryData) {
  if (typeof Chart === 'undefined') return;
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  if (reportLineInstance) reportLineInstance.destroy();

  const labels = categoryData.map((c) => c.name);
  const values = categoryData.map((c) => c.total);
  const colors = categoryData.map((c) => c.color);

  reportLineInstance = new Chart(canvas.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: colors.map((c) => c + 'cc'),
        borderColor: colors,
        borderWidth: 2,
        hoverOffset: 6,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '65%',
      plugins: {
        legend: { display: true, position: 'right',
          labels: { usePointStyle: true, boxHeight: 8, font: { size: 11 } }
        },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${ctx.label}: ${formatCurrencyTooltip(ctx.parsed)}`,
          },
        },
      },
    },
  });
}

// ── Mini bar chart animation (auth page illustration) ─
export function animateMiniBar() {
  const bars = document.querySelectorAll('.mini-bar');
  const heights = [30, 60, 45, 80, 55, 70, 40];
  bars.forEach((bar, i) => {
    bar.style.height = `${heights[i % heights.length]}%`;
  });
}

// ── Helper: format currency for tooltips ──────────
function formatCurrencyTooltip(value) {
  if (value >= 1000000) return `Rp${(value / 1000000).toFixed(1)}jt`;
  if (value >= 1000) return `Rp${(value / 1000).toFixed(0)}rb`;
  return `Rp${value}`;
}

// Initialize defaults on load
if (typeof Chart !== 'undefined') {
  setupChartDefaults();
}

export { setupChartDefaults };
