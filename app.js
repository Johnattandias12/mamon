/* =================================================================
   FinDash — Financial Dashboard Core Logic
   Parse CSV → Categorize → Filter → Render KPIs + Charts + Tables
   ================================================================= */

'use strict';

// ─── CATEGORY RULES ──────────────────────────────────────────────
const CAT_RULES = [
  { id: 'transporte',    label: '🚕 Transporte',      keywords: ['99', 'nupay', 'uber', 'cabify', 'taxi', '99pay', 'indriver'] },
  { id: 'supermercado',  label: '🛒 Supermercado',    keywords: ['supermercado', 'mercado', 'fort', 'fortello', 'atacadao', 'assai', 'carrefour', 'extra'] },
  { id: 'alimentacao',   label: '🍔 Alimentação',     keywords: ['cantina', 'restaurante', 'lanche', 'food', 'burger', 'pizza', 'cafe', 'padaria', 'jim.com', 'ifood'] },
  { id: 'saude',         label: '💊 Saúde',           keywords: ['farmácia', 'farmacia', 'pague menos', 'drogaria', 'medico', 'saude', 'hospital', 'clinica'] },
  { id: 'transferencia', label: '💸 Transferência',   keywords: ['transferência enviada', 'transferencia enviada', 'pix enviado', 'enviada pelo pix', 'enviado pelo pix'] },
  { id: 'recebimento',   label: '💰 Recebimento',     keywords: ['transferência recebida', 'transferencia recebida', 'pix recebido', 'recebida pelo pix', 'recebido pelo pix', 'transferência recebida -'] },
  { id: 'assinatura',    label: '📱 Assinatura',      keywords: ['netflix', 'spotify', 'amazon', 'apple', 'google', 'microsoft', 'youtube', 'prime'] },
  { id: 'vestuario',     label: '👕 Vestuário',       keywords: ['roupa', 'moda', 'loja', 'renner', 'riachuelo', 'c&a', 'zara', 'hm', 'shein'] },
];

// ─── STATE ────────────────────────────────────────────────────────
let allTransactions = [];          // all parsed transactions
let filteredTransactions = [];     // after filters
let charts = {};                   // chart instances
let currentPage = 1;
const PAGE_SIZE = 20;
let sortCol = 'date';
let sortDir = 'desc';
let currentNav = 'dashboard';

// Filters state
let activeFilters = {
  dateStart: null,
  dateEnd:   null,
  type:      'all',
  category:  'all',
  search:    '',
  range:     'all',
};

// ─── INIT ─────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initMouseGradient();
  initRipple();
  initCharts();
  loadFromStorage();
  fixMobileMenu();
  renderCatRules();
  navigate('dashboard');
});

// ─── MOUSE GRADIENT (from DigitalSerenity theme) ─────────────────
function initMouseGradient() {
  const el = document.getElementById('mouse-gradient');
  if (!el) return;
  document.addEventListener('mousemove', e => {
    el.style.left = e.clientX + 'px';
    el.style.top  = e.clientY + 'px';
    el.style.opacity = '1';
  });
  document.addEventListener('mouseleave', () => { el.style.opacity = '0'; });
}

// ─── RIPPLE (from DigitalSerenity theme) ─────────────────────────
function initRipple() {
  document.addEventListener('click', e => {
    if (e.target.closest('.chart-canvas-wrap') || e.target.tagName === 'CANVAS') return;
    const r = document.createElement('div');
    r.className = 'ripple';
    r.style.left = e.clientX + 'px';
    r.style.top  = e.clientY + 'px';
    r.style.width = r.style.height = '40px';
    document.body.appendChild(r);
    setTimeout(() => r.remove(), 700);
  });
}

// ─── NAVIGATION ───────────────────────────────────────────────────
function navigate(page) {
  currentNav = page;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const pageEl = document.getElementById('page-' + page);
  const navEl  = document.getElementById('nav-' + page);
  if (pageEl) pageEl.classList.add('active');
  if (navEl)  navEl.classList.add('active');

  const titles = {
    dashboard:  ['Dashboard', 'Visão geral da sua vida financeira'],
    transacoes: ['Transações', 'Histórico completo de movimentações'],
    graficos:   ['Gráficos', 'Análise visual detalhada'],
    insights:   ['Insights', 'Inteligência financeira personalizada'],
    upload:     ['Importar CSV', 'Adicione seus extratos bancários'],
    config:     ['Configurações', 'Regras e preferências'],
  };
  const [title, sub] = titles[page] || ['FinDash', ''];
  document.getElementById('pageTitle').textContent = title;
  document.getElementById('pageSubtitle').textContent = sub;

  if (page === 'graficos') renderChartsPage();
  if (page === 'insights') renderInsights();
  if (page === 'transacoes') renderTable();
  if (page === 'config') renderStats();
}

// ─── SIDEBAR TOGGLE ───────────────────────────────────────────────
function toggleSidebar() {
  const sb   = document.getElementById('sidebar');
  const main = document.getElementById('main');
  sb.classList.toggle('collapsed');
  main.classList.toggle('sidebar-collapsed');
}

// ─── MOBILE MENU ──────────────────────────────────────────────────
function fixMobileMenu() {
  if (window.innerWidth <= 768) {
    document.getElementById('mobileMenuBtn').style.display = 'flex';
  }
}
function toggleMobileMenu() {
  document.getElementById('sidebar').classList.toggle('mobile-open');
}

// ─── STORAGE ──────────────────────────────────────────────────────
function saveToStorage() {
  try {
    localStorage.setItem('findash_data', JSON.stringify(allTransactions));
    localStorage.setItem('findash_files', JSON.stringify(
      Array.from(document.querySelectorAll('.file-chip')).map(c => c.dataset.name)
    ));
  } catch (e) { /* storage full */ }
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem('findash_data');
    if (raw) {
      allTransactions = JSON.parse(raw);
      afterLoad();
    }
  } catch (e) { localStorage.removeItem('findash_data'); }
}

// ─── FILE DROP & INPUT ────────────────────────────────────────────
function handleDrop(e) {
  e.preventDefault();
  document.getElementById('dropZone').classList.remove('drag-over');
  processFiles(Array.from(e.dataTransfer.files));
}
function handleSidebarDrop(e) {
  e.preventDefault();
  e.stopPropagation();
  document.getElementById('sidebarDrop').classList.remove('drag-over');
  processFiles(Array.from(e.dataTransfer.files));
}
function handleFileSelect(e) {
  processFiles(Array.from(e.target.files));
  e.target.value = '';
}

function processFiles(files) {
  const csvFiles = files.filter(f => f.name.toLowerCase().endsWith('.csv'));
  if (!csvFiles.length) { toast('Apenas arquivos .csv são suportados!', 'error'); return; }
  csvFiles.forEach(f => parseCSV(f));
}

function parseCSV(file) {
  Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    encoding: 'UTF-8',
    complete: (results) => {
      const rows = results.data;
      if (!rows.length) { toast(`Arquivo vazio: ${file.name}`, 'error'); return; }

      // Detect format: Nubank CSV has columns: Data, Valor, Identificador, Descrição
      const headers = Object.keys(rows[0]).map(h => h.trim().toLowerCase());
      const isNubank = headers.includes('data') && headers.includes('valor') && headers.includes('descrição');
      if (!isNubank) { toast(`Formato não reconhecido: ${file.name}`, 'error'); return; }

      let count = 0;
      rows.forEach(row => {
        // Normalize keys (handle BOM or encoding quirks)
        const data   = getField(row, ['data', 'Data']);
        const valor  = getField(row, ['valor', 'Valor']);
        const desc   = getField(row, ['descrição', 'Descrição', 'descricao', 'Descricao']);
        const id     = getField(row, ['identificador', 'Identificador']) || generateId();

        if (!data || valor === undefined || valor === '') return;
        const valNum = parseFloat(String(valor).replace(',', '.'));
        if (isNaN(valNum)) return;

        // Skip if already exists
        if (allTransactions.find(t => t.id === id)) return;

        const tx = {
          id,
          date:     parseDate(data),
          dateStr:  data.trim(),
          value:    valNum,
          desc:     (desc || '').trim(),
          type:     valNum >= 0 ? 'credit' : 'debit',
          category: categorize(desc || ''),
        };
        allTransactions.push(tx);
        count++;
      });

      if (count > 0) {
        addFileChip(file.name, file.size);
        afterLoad();
        toast(`✅ ${count} transações importadas de ${file.name}`, 'success');
        if (currentNav === 'upload') navigate('dashboard');
      } else {
        toast(`Nenhuma transação nova em ${file.name}`, 'info');
      }
    },
    error: () => toast(`Erro ao ler ${file.name}`, 'error')
  });
}

function getField(row, keys) {
  for (const k of keys) {
    if (row[k] !== undefined) return row[k];
    // Case-insensitive search
    const found = Object.keys(row).find(rk => rk.trim().toLowerCase() === k.toLowerCase());
    if (found) return row[found];
  }
  return '';
}

// ─── DATE PARSE ───────────────────────────────────────────────────
function parseDate(str) {
  if (!str) return new Date(0);
  const s = str.trim();
  // DD/MM/YYYY
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return new Date(`${m[3]}-${m[2]}-${m[1]}`);
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return new Date(s);
  return new Date(s);
}
function fmtDate(d) {
  if (!d || isNaN(d)) return '—';
  return d.toLocaleDateString('pt-BR');
}
function fmtDateInput(d) {
  if (!d || isNaN(d)) return '';
  return d.toISOString().slice(0, 10);
}

// ─── CATEGORIZE ───────────────────────────────────────────────────
function categorize(desc) {
  const low = desc.toLowerCase();
  for (const rule of CAT_RULES) {
    if (rule.keywords.some(kw => low.includes(kw))) return rule.id;
  }
  return 'outros';
}

function getCatLabel(id) {
  const rule = CAT_RULES.find(r => r.id === id);
  return rule ? rule.label : '📄 Outros';
}

// ─── AFTER LOAD ───────────────────────────────────────────────────
function afterLoad() {
  allTransactions.sort((a, b) => b.date - a.date);
  saveToStorage();
  updateCategoryFilter();
  applyFilters();
  document.getElementById('badge-transacoes').textContent = allTransactions.length;
  updateTopbarPeriod();
}

function updateCategoryFilter() {
  const cats = [...new Set(allTransactions.map(t => t.category))];
  const select = document.getElementById('filterCategory');
  const txCat  = document.getElementById('txCatFilter');
  [select, txCat].forEach(sel => {
    if (!sel) return;
    const val = sel.value;
    sel.innerHTML = '<option value="all">Todas</option>';
    cats.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c; opt.textContent = getCatLabel(c);
      sel.appendChild(opt);
    });
    sel.value = val;
  });
}

function updateTopbarPeriod() {
  const el = document.getElementById('topbar-period-summary');
  if (!allTransactions.length) { el.textContent = ''; return; }
  const dates = allTransactions.map(t => t.date).filter(d => !isNaN(d));
  const min = new Date(Math.min(...dates));
  const max = new Date(Math.max(...dates));
  el.textContent = `${fmtDate(min)} → ${fmtDate(max)}`;
}

// ─── FILTERS ──────────────────────────────────────────────────────
function setRange(range) {
  document.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
  const btn = document.querySelector(`[data-range="${range}"]`);
  if (btn) btn.classList.add('active');
  activeFilters.range = range;

  if (range === 'all') {
    activeFilters.dateStart = null;
    activeFilters.dateEnd   = null;
    document.getElementById('filterDateStart').value = '';
    document.getElementById('filterDateEnd').value   = '';
  } else {
    const end   = new Date();
    const start = new Date();
    start.setDate(end.getDate() - Number(range));
    activeFilters.dateStart = start;
    activeFilters.dateEnd   = end;
    document.getElementById('filterDateStart').value = fmtDateInput(start);
    document.getElementById('filterDateEnd').value   = fmtDateInput(end);
  }
  applyFilters();
}

function applyFilters() {
  const ds = document.getElementById('filterDateStart').value;
  const de = document.getElementById('filterDateEnd').value;
  if (ds) activeFilters.dateStart = new Date(ds);
  if (de) activeFilters.dateEnd   = new Date(de + 'T23:59:59');

  activeFilters.type     = document.getElementById('filterType').value;
  activeFilters.category = document.getElementById('filterCategory').value;
  activeFilters.search   = document.getElementById('filterSearch').value.toLowerCase().trim();

  filteredTransactions = allTransactions.filter(t => {
    if (activeFilters.dateStart && t.date < activeFilters.dateStart) return false;
    if (activeFilters.dateEnd   && t.date > activeFilters.dateEnd)   return false;
    if (activeFilters.type !== 'all' && t.type !== activeFilters.type) return false;
    if (activeFilters.category !== 'all' && t.category !== activeFilters.category) return false;
    if (activeFilters.search && !t.desc.toLowerCase().includes(activeFilters.search)) return false;
    return true;
  });

  currentPage = 1;
  renderKPIs();
  renderAllCharts();
  if (currentNav === 'transacoes') renderTable();
  if (currentNav === 'insights')   renderInsights();
}

function clearFilters() {
  document.getElementById('filterDateStart').value = '';
  document.getElementById('filterDateEnd').value   = '';
  document.getElementById('filterType').value = 'all';
  document.getElementById('filterCategory').value = 'all';
  document.getElementById('filterSearch').value = '';
  activeFilters = { dateStart: null, dateEnd: null, type: 'all', category: 'all', search: '', range: 'all' };
  document.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('[data-range="all"]')?.classList.add('active');
  applyFilters();
  toast('Filtros limpos', 'info');
}

// ─── KPIs ─────────────────────────────────────────────────────────
function renderKPIs() {
  const grid    = document.getElementById('kpiGrid');
  const empty   = document.getElementById('kpi-empty');
  const data    = filteredTransactions;

  if (!data.length) {
    grid.innerHTML = '';
    grid.appendChild(empty || makeEmptyKPI());
    return;
  }
  if (empty) empty.remove();

  const credits  = data.filter(t => t.type === 'credit');
  const debits   = data.filter(t => t.type === 'debit');
  const totalIn  = credits.reduce((s, t) => s + t.value, 0);
  const totalOut = debits.reduce((s, t) => s + Math.abs(t.value), 0);
  const balance  = totalIn - totalOut;
  const maxDebit = debits.reduce((m, t) => Math.abs(t.value) > Math.abs(m.value) ? t : m, { value: 0 });
  const maxCredit = credits.reduce((m, t) => t.value > m.value ? t : m, { value: 0 });
  const dates    = [...new Set(data.map(t => fmtDate(t.date)))];
  const avgDaily = dates.length ? totalOut / dates.length : 0;
  const transport = data.filter(t => t.category === 'transporte').reduce((s, t) => s + Math.abs(t.value), 0);

  const kpis = [
    {
      icon: '💵', iconClass: balance >= 0 ? 'green' : 'red',
      value: fmtCurrency(balance), valueClass: balance >= 0 ? 'green' : 'red',
      label: 'Saldo do Período',
      trend: balance >= 0 ? { cls: 'up', text: 'Positivo ✓' } : { cls: 'down', text: 'Negativo ✗' },
      accentClass: balance >= 0 ? 'accent-green' : 'accent-red',
    },
    {
      icon: '📈', iconClass: 'green',
      value: fmtCurrency(totalIn), valueClass: 'green',
      label: 'Total Entradas',
      trend: { cls: 'neutral', text: `${credits.length} movimentos` },
      accentClass: 'accent-green',
    },
    {
      icon: '📉', iconClass: 'red',
      value: fmtCurrency(totalOut), valueClass: 'red',
      label: 'Total Saídas',
      trend: { cls: 'neutral', text: `${debits.length} movimentos` },
      accentClass: 'accent-red',
    },
    {
      icon: '🔢', iconClass: 'blue',
      value: String(data.length), valueClass: 'blue',
      label: 'Nº de Transações',
      trend: { cls: 'neutral', text: `${dates.length} dias com movimentos` },
      accentClass: 'accent-blue',
    },
    {
      icon: '💳', iconClass: 'red',
      value: fmtCurrency(Math.abs(maxDebit.value)), valueClass: 'red',
      label: 'Maior Gasto',
      trend: { cls: 'neutral', text: truncate(maxDebit.desc || '—', 28) },
    },
    {
      icon: '🏆', iconClass: 'green',
      value: fmtCurrency(maxCredit.value), valueClass: 'green',
      label: 'Maior Recebimento',
      trend: { cls: 'neutral', text: truncate(maxCredit.desc || '—', 28) },
    },
    {
      icon: '📊', iconClass: 'purple',
      value: fmtCurrency(avgDaily), valueClass: 'purple',
      label: 'Média Diária de Gasto',
      trend: { cls: 'neutral', text: `Em ${dates.length} dias` },
      accentClass: 'accent-purple',
    },
    {
      icon: '🚕', iconClass: 'amber',
      value: fmtCurrency(transport), valueClass: 'amber',
      label: 'Gasto com Transporte',
      trend: { cls: 'neutral', text: 'Táxi, 99, Uber, NuPay' },
    },
  ];

  grid.innerHTML = '';
  kpis.forEach((k, i) => {
    const card = document.createElement('div');
    card.className = `kpi-card ${k.accentClass || ''} fade-in stagger-${i + 1}`;
    card.innerHTML = `
      <div class="kpi-card-header">
        <div class="kpi-icon ${k.iconClass}">${k.icon}</div>
        <span class="kpi-trend ${k.trend.cls}">${k.trend.text}</span>
      </div>
      <div class="kpi-value ${k.valueClass}">${k.value}</div>
      <div class="kpi-label">${k.label}</div>
    `;
    grid.appendChild(card);
  });

  // Category progress bars
  renderCatProgressBars(debits);
}

function makeEmptyKPI() {
  const div = document.createElement('div');
  div.id = 'kpi-empty';
  div.className = 'empty-state fade-in';
  div.style.gridColumn = 'span 4';
  div.innerHTML = `<div class="empty-icon">💰</div>
    <div class="empty-title">Nenhum dado carregado</div>
    <div class="empty-desc">Arraste um extrato CSV do Nubank na barra lateral ou acesse "Importar CSV".</div>`;
  return div;
}

function renderCatProgressBars(debits) {
  const container = document.getElementById('catProgressBars');
  if (!container) return;
  if (!debits.length) { container.innerHTML = '<p style="color:var(--text-muted);font-size:13px">Sem dados de saída.</p>'; return; }

  const totals = {};
  debits.forEach(t => {
    totals[t.category] = (totals[t.category] || 0) + Math.abs(t.value);
  });
  const total = Object.values(totals).reduce((s, v) => s + v, 0);
  const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]);

  const COLORS = {
    transporte:   '#3b82f6', supermercado: '#10b981',
    alimentacao: '#f59e0b', saude:        '#ec4899',
    transferencia:'#8b5cf6', recebimento: '#10b981',
    assinatura:  '#14b8a6', vestuario:    '#f97316', outros: '#64748b',
  };

  container.innerHTML = sorted.map(([cat, val]) => {
    const pct = total > 0 ? (val / total) * 100 : 0;
    const color = COLORS[cat] || '#64748b';
    return `<div class="progress-row">
      <div class="progress-row-header">
        <span style="font-weight:500;font-size:13px">${getCatLabel(cat)}</span>
        <span style="font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--text-muted)">${fmtCurrency(val)} <span style="opacity:0.5">(${pct.toFixed(1)}%)</span></span>
      </div>
      <div class="progress-bar">
        <div class="progress-fill" style="width:${pct}%;background:${color}"></div>
      </div>
    </div>`;
  }).join('');
}

// ─── CHARTS INIT ──────────────────────────────────────────────────
const CHART_DEFAULTS = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false }, tooltip: { backgroundColor: '#0f1521', titleColor: '#f1f5f9', bodyColor: '#94a3b8', borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1, padding: 10, callbacks: { label: ctx => ' ' + fmtCurrency(ctx.parsed.y ?? ctx.parsed) } } },
  scales: {
    x: { ticks: { color: '#64748b', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.04)', drawBorder: false } },
    y: { ticks: { color: '#64748b', font: { size: 11 }, callback: v => fmtCurrencyShort(v) }, grid: { color: 'rgba(255,255,255,0.04)', drawBorder: false } },
  },
};

function initCharts() {
  Chart.defaults.font.family = "'Plus Jakarta Sans', sans-serif";
  Chart.defaults.color = '#64748b';

  // Cashflow
  charts.cashflow = createLineChart('chartCashflow');
  charts.donut    = createDonutChart('chartDonut');
  charts.monthly  = createBarChart('chartMonthly');
  charts.accum    = createLineChart('chartAccumulated', 'purple');
  charts.weekday  = createRadarChart('chartWeekday');
  charts.top10    = createHBarChart('chartTop10');
}

function createLineChart(id, color = 'green') {
  const canvas = document.getElementById(id);
  if (!canvas) return null;
  const c = color === 'purple' ? { main: '#8b5cf6', fill: 'rgba(139,92,246,0.08)' } : { main: '#10b981', fill: 'rgba(16,185,129,0.08)' };
  return new Chart(canvas, {
    type: 'line',
    data: { labels: [], datasets: [] },
    options: {
      ...CHART_DEFAULTS,
      maintainAspectRatio: false,
      plugins: { ...CHART_DEFAULTS.plugins, legend: { display: true, labels: { color: '#64748b', font: { size: 11 } } } },
      scales: { ...CHART_DEFAULTS.scales },
      elements: { point: { radius: 3, hoverRadius: 5 } },
    }
  });
}

function createBarChart(id) {
  const canvas = document.getElementById(id);
  if (!canvas) return null;
  return new Chart(canvas, {
    type: 'bar',
    data: { labels: [], datasets: [] },
    options: {
      ...CHART_DEFAULTS,
      maintainAspectRatio: false,
      plugins: { ...CHART_DEFAULTS.plugins, legend: { display: true, labels: { color: '#64748b', font: { size: 11 } } } },
      borderRadius: 6,
      borderSkipped: false,
    }
  });
}

function createDonutChart(id) {
  const canvas = document.getElementById(id);
  if (!canvas) return null;
  return new Chart(canvas, {
    type: 'doughnut',
    data: { labels: [], datasets: [{ data: [], backgroundColor: [], borderColor: 'transparent', borderWidth: 0 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      cutout: '65%',
      plugins: {
        legend: { display: true, position: 'bottom', labels: { color: '#94a3b8', padding: 14, font: { size: 11 } } },
        tooltip: { backgroundColor: '#0f1521', bodyColor: '#94a3b8', borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1, callbacks: { label: ctx => ` ${ctx.label}: ${fmtCurrency(ctx.parsed)}` } }
      }
    }
  });
}

function createHBarChart(id) {
  const canvas = document.getElementById(id);
  if (!canvas) return null;
  return new Chart(canvas, {
    type: 'bar',
    data: { labels: [], datasets: [] },
    options: {
      indexAxis: 'y',
      responsive: true, maintainAspectRatio: false,
      plugins: { ...CHART_DEFAULTS.plugins },
      scales: {
        x: { ticks: { color: '#64748b', font: { size: 11 }, callback: v => fmtCurrencyShort(v) }, grid: { color: 'rgba(255,255,255,0.04)' } },
        y: { ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { display: false } },
      },
      borderRadius: 4,
    }
  });
}

function createRadarChart(id) {
  const canvas = document.getElementById(id);
  if (!canvas) return null;
  return new Chart(canvas, {
    type: 'radar',
    data: { labels: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'], datasets: [] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { ...CHART_DEFAULTS.plugins },
      scales: {
        r: {
          ticks: { color: '#64748b', backdropColor: 'transparent', font: { size: 10 }, callback: v => fmtCurrencyShort(v) },
          grid:       { color: 'rgba(255,255,255,0.06)' },
          pointLabels: { color: '#94a3b8', font: { size: 11 } },
        }
      }
    }
  });
}

// ─── RENDER CHARTS ────────────────────────────────────────────────
function renderAllCharts() {
  const data = filteredTransactions;
  if (!data.length) { clearAllCharts(); return; }

  renderCashflowChart(data);
  renderDonutChartFn(data);
  renderMonthlyChart(data);
  renderAccumChart(data);
  renderWeekdayChart(data);
  renderTop10Chart(data);
}

function clearAllCharts() {
  Object.values(charts).forEach(c => {
    if (!c) return;
    c.data.labels = [];
    c.data.datasets = [];
    c.update();
  });
}

function renderCashflowChart(data) {
  // Group by date → sum credits and debits
  const byDate = {};
  data.forEach(t => {
    const k = fmtDate(t.date);
    if (!byDate[k]) byDate[k] = { credit: 0, debit: 0 };
    if (t.type === 'credit') byDate[k].credit += t.value;
    else byDate[k].debit += Math.abs(t.value);
  });
  const labels = Object.keys(byDate).sort((a, b) => parseDate2(a) - parseDate2(b));
  const credits = labels.map(l => byDate[l].credit);
  const debits  = labels.map(l => byDate[l].debit);

  const ds = [
    { label: 'Entradas', data: credits, borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.1)', fill: true, tension: 0.4, borderWidth: 2 },
    { label: 'Saídas',   data: debits,  borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.1)',  fill: true, tension: 0.4, borderWidth: 2 },
  ];
  updateChart(charts.cashflow, labels, ds);
}

function renderDonutChartFn(data) {
  const debits = data.filter(t => t.type === 'debit');
  if (!debits.length) return;
  const totals = {};
  debits.forEach(t => { totals[t.category] = (totals[t.category] || 0) + Math.abs(t.value); });
  const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 8);

  const DONUT_COLORS = ['#3b82f6','#8b5cf6','#10b981','#f59e0b','#ef4444','#ec4899','#14b8a6','#f97316'];
  const labels = sorted.map(([c]) => getCatLabel(c));
  const values = sorted.map(([, v]) => v);

  if (charts.donut) {
    charts.donut.data.labels = labels;
    charts.donut.data.datasets[0].data = values;
    charts.donut.data.datasets[0].backgroundColor = DONUT_COLORS.slice(0, sorted.length);
    charts.donut.update();
  }
}

function renderMonthlyChart(data) {
  const byMonth = {};
  data.forEach(t => {
    const d = t.date;
    if (isNaN(d)) return;
    const k = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    if (!byMonth[k]) byMonth[k] = { credit: 0, debit: 0 };
    if (t.type === 'credit') byMonth[k].credit += t.value;
    else byMonth[k].debit += Math.abs(t.value);
  });
  const labels = Object.keys(byMonth).sort().map(k => {
    const [y, m] = k.split('-');
    return new Date(y, m-1).toLocaleString('pt-BR', { month: 'short', year: '2-digit' });
  });
  const keys = Object.keys(byMonth).sort();
  const credits = keys.map(k => byMonth[k].credit);
  const debits  = keys.map(k => byMonth[k].debit);

  const ds = [
    { label: 'Entradas', data: credits, backgroundColor: 'rgba(16,185,129,0.7)', borderRadius: 6 },
    { label: 'Saídas',   data: debits,  backgroundColor: 'rgba(239,68,68,0.7)',  borderRadius: 6 },
  ];
  updateChart(charts.monthly, labels, ds);
}

function renderAccumChart(data) {
  const sorted = [...data].sort((a, b) => a.date - b.date);
  let accum = 0;
  const byDate2 = {};
  sorted.forEach(t => {
    const k = fmtDate(t.date);
    accum += t.value;
    byDate2[k] = accum;
  });
  const labels = Object.keys(byDate2);
  const values = Object.values(byDate2);
  const ds = [{
    label: 'Saldo Acumulado',
    data: values,
    borderColor: '#8b5cf6',
    backgroundColor: 'rgba(139,92,246,0.08)',
    fill: true, tension: 0.4, borderWidth: 2,
  }];
  updateChart(charts.accum, labels, ds);
}

function renderWeekdayChart(data) {
  const weekTotals = [0, 0, 0, 0, 0, 0, 0]; // Mon-Sun
  const debits = data.filter(t => t.type === 'debit');
  debits.forEach(t => {
    if (isNaN(t.date)) return;
    const dow = (t.date.getDay() + 6) % 7; // 0=Mon
    weekTotals[dow] += Math.abs(t.value);
  });
  const ds = [{
    label: 'Gasto médio (R$)',
    data: weekTotals,
    borderColor: '#3b82f6',
    backgroundColor: 'rgba(59,130,246,0.15)',
    pointBackgroundColor: '#3b82f6',
    borderWidth: 2,
    fill: true,
  }];
  if (charts.weekday) {
    charts.weekday.data.datasets = ds;
    charts.weekday.update();
  }
}

function renderTop10Chart(data) {
  const debits = data.filter(t => t.type === 'debit')
    .sort((a, b) => a.value - b.value) // most negative first
    .slice(0, 10)
    .reverse();

  const labels = debits.map(t => truncate(t.desc, 30));
  const values = debits.map(t => Math.abs(t.value));
  const ds = [{
    data: values,
    backgroundColor: values.map((_, i) => `hsla(${220 + i * 15},70%,60%,0.75)`),
    borderRadius: 4,
  }];

  if (charts.top10) {
    charts.top10.options.plugins.tooltip.callbacks.label = ctx => ' R$ ' + fmtCurrency(ctx.parsed.x);
    updateChart(charts.top10, labels, ds);
  }
}

// ─── UPDATE CHART HELPER ─────────────────────────────────────────
function updateChart(chart, labels, datasets) {
  if (!chart) return;
  chart.data.labels = labels;
  chart.data.datasets = datasets;
  chart.update();
}

// ─── CHARTS PAGE (duplicate charts for the dedicated Gráficos page) ─
function renderChartsPage() {
  if (!filteredTransactions.length) return;

  if (!charts.cashflow2) {
    charts.cashflow2 = createLineChart('chartCashflow2');
    charts.donut2    = createDonutChart('chartDonut2');
    charts.acc2      = createLineChart('chartAcc2', 'purple');
    charts.top2      = createHBarChart('chartTop2');
    charts.monthly2  = createBarChart('chartMonthly2');
    charts.weekday2  = createRadarChart('chartWeekday2');
  }

  const data = filteredTransactions;
  renderCashflowChartTo(data, charts.cashflow2);
  renderDonutTo(data, charts.donut2);
  renderAccumTo(data, charts.acc2);
  renderTop10To(data, charts.top2);
  renderMonthlyTo(data, charts.monthly2);
  renderWeekdayTo(data, charts.weekday2);
}

// Generic helpers → re-use logic from main charts
function renderCashflowChartTo(data, chart) {
  const byDate = {};
  data.forEach(t => { const k = fmtDate(t.date); if (!byDate[k]) byDate[k] = { credit:0,debit:0 }; if(t.type==='credit')byDate[k].credit+=t.value;else byDate[k].debit+=Math.abs(t.value); });
  const labels = Object.keys(byDate).sort((a,b)=>parseDate2(a)-parseDate2(b));
  updateChart(chart, labels, [
    { label:'Entradas', data:labels.map(l=>byDate[l].credit), borderColor:'#10b981', backgroundColor:'rgba(16,185,129,0.1)', fill:true, tension:0.4, borderWidth:2 },
    { label:'Saídas',   data:labels.map(l=>byDate[l].debit),  borderColor:'#ef4444', backgroundColor:'rgba(239,68,68,0.1)',  fill:true, tension:0.4, borderWidth:2 },
  ]);
}
function renderDonutTo(data, chart) {
  const totals = {};
  data.filter(t=>t.type==='debit').forEach(t=>{totals[t.category]=(totals[t.category]||0)+Math.abs(t.value);});
  const sorted = Object.entries(totals).sort((a,b)=>b[1]-a[1]).slice(0,8);
  const COLS = ['#3b82f6','#8b5cf6','#10b981','#f59e0b','#ef4444','#ec4899','#14b8a6','#f97316'];
  if (chart) { chart.data.labels=sorted.map(([c])=>getCatLabel(c)); chart.data.datasets[0].data=sorted.map(([,v])=>v); chart.data.datasets[0].backgroundColor=COLS.slice(0,sorted.length); chart.update(); }
}
function renderAccumTo(data, chart) {
  const sorted=[...data].sort((a,b)=>a.date-b.date); let acc=0; const bd={};
  sorted.forEach(t=>{const k=fmtDate(t.date);acc+=t.value;bd[k]=acc;});
  updateChart(chart, Object.keys(bd), [{label:'Saldo Acumulado',data:Object.values(bd),borderColor:'#8b5cf6',backgroundColor:'rgba(139,92,246,0.08)',fill:true,tension:0.4,borderWidth:2}]);
}
function renderTop10To(data, chart) {
  const debits=data.filter(t=>t.type==='debit').sort((a,b)=>a.value-b.value).slice(0,10).reverse();
  updateChart(chart, debits.map(t=>truncate(t.desc,30)), [{data:debits.map(t=>Math.abs(t.value)),backgroundColor:debits.map((_,i)=>`hsla(${220+i*15},70%,60%,0.75)`),borderRadius:4}]);
}
function renderMonthlyTo(data, chart) {
  const byMonth={};
  data.forEach(t=>{const d=t.date;if(isNaN(d))return;const k=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;if(!byMonth[k])byMonth[k]={credit:0,debit:0};if(t.type==='credit')byMonth[k].credit+=t.value;else byMonth[k].debit+=Math.abs(t.value);});
  const keys=Object.keys(byMonth).sort();
  const labels=keys.map(k=>{const[y,m]=k.split('-');return new Date(y,m-1).toLocaleString('pt-BR',{month:'short',year:'2-digit'});});
  updateChart(chart, labels, [{label:'Entradas',data:keys.map(k=>byMonth[k].credit),backgroundColor:'rgba(16,185,129,0.7)',borderRadius:6},{label:'Saídas',data:keys.map(k=>byMonth[k].debit),backgroundColor:'rgba(239,68,68,0.7)',borderRadius:6}]);
}
function renderWeekdayTo(data, chart) {
  const wt=[0,0,0,0,0,0,0];
  data.filter(t=>t.type==='debit').forEach(t=>{if(isNaN(t.date))return;const dow=(t.date.getDay()+6)%7;wt[dow]+=Math.abs(t.value);});
  if(chart){chart.data.datasets=[{label:'Gasto (R$)',data:wt,borderColor:'#3b82f6',backgroundColor:'rgba(59,130,246,0.15)',pointBackgroundColor:'#3b82f6',borderWidth:2,fill:true}];chart.update();}
}

// ─── TRANSACTIONS TABLE ───────────────────────────────────────────
function renderTable() {
  const search  = (document.getElementById('txSearch')?.value || '').toLowerCase();
  const typeF   = document.getElementById('txTypeFilter')?.value || 'all';
  const catF    = document.getElementById('txCatFilter')?.value || 'all';

  let data = filteredTransactions.filter(t => {
    if (typeF !== 'all' && t.type !== typeF) return false;
    if (catF  !== 'all' && t.category !== catF) return false;
    if (search && !t.desc.toLowerCase().includes(search)) return false;
    return true;
  });

  // Sort
  data = [...data].sort((a, b) => {
    let va, vb;
    if (sortCol === 'date')  { va = a.date; vb = b.date; }
    else if (sortCol === 'value') { va = a.value; vb = b.value; }
    else { va = a.desc; vb = b.desc; }
    if (va < vb) return sortDir === 'asc' ? -1 : 1;
    if (va > vb) return sortDir === 'asc' ?  1 : -1;
    return 0;
  });

  const total = data.length;
  const pages = Math.ceil(total / PAGE_SIZE);
  currentPage = Math.min(currentPage, pages || 1);
  const start = (currentPage - 1) * PAGE_SIZE;
  const page  = data.slice(start, start + PAGE_SIZE);

  document.getElementById('tableCountLabel').textContent = `${total} transações`;
  document.getElementById('paginationInfo').textContent  = `Mostrando ${start + 1}–${Math.min(start + PAGE_SIZE, total)} de ${total}`;

  // Update txCatFilter
  const txCat = document.getElementById('txCatFilter');
  if (txCat && txCat.options.length < 3) {
    const cats = [...new Set(filteredTransactions.map(t => t.category))];
    cats.forEach(c => {
      if (!txCat.querySelector(`[value="${c}"]`)) {
        const o = document.createElement('option');
        o.value = c; o.textContent = getCatLabel(c);
        txCat.appendChild(o);
      }
    });
  }

  const tbody = document.getElementById('txTableBody');
  tbody.innerHTML = '';

  if (!page.length) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:40px;color:var(--text-muted)">Nenhuma transação encontrada</td></tr>`;
  } else {
    page.forEach(t => {
      const tr = document.createElement('tr');
      tr.onclick = () => openModal(t);
      tr.innerHTML = `
        <td class="td-date">${fmtDate(t.date)}</td>
        <td class="td-desc" title="${escHtml(t.desc)}">${escHtml(truncate(t.desc, 50))}</td>
        <td><span class="cat-badge cat-${t.category}">${getCatLabel(t.category)}</span></td>
        <td class="td-value ${t.type === 'credit' ? 'positive' : 'negative'}">${t.type === 'credit' ? '+' : ''}${fmtCurrency(t.value)}</td>
        <td><span class="cat-badge ${t.type === 'credit' ? 'cat-recebimento' : 'cat-transferencia'}">${t.type === 'credit' ? '↑ Entrada' : '↓ Saída'}</span></td>
      `;
      tbody.appendChild(tr);
    });
  }

  renderPagination(pages);
}

function sortTable(col) {
  if (sortCol === col) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
  else { sortCol = col; sortDir = 'desc'; }
  document.querySelectorAll('.sort-icon').forEach(el => el.textContent = '↕');
  const icon = document.getElementById(`sort-${col}`);
  if (icon) icon.textContent = sortDir === 'asc' ? '↑' : '↓';
  renderTable();
}

function renderPagination(pages) {
  const ctrl = document.getElementById('paginationControls');
  ctrl.innerHTML = '';

  const mkBtn = (label, pg, disabled = false, active = false) => {
    const b = document.createElement('button');
    b.className = 'page-btn' + (active ? ' active' : '');
    b.textContent = label; b.disabled = disabled;
    b.onclick = () => { currentPage = pg; renderTable(); };
    ctrl.appendChild(b);
  };

  mkBtn('‹', currentPage - 1, currentPage <= 1);
  const start = Math.max(1, currentPage - 2);
  const end   = Math.min(pages, currentPage + 2);
  for (let i = start; i <= end; i++) mkBtn(i, i, false, i === currentPage);
  mkBtn('›', currentPage + 1, currentPage >= pages);
}

// ─── MODAL ────────────────────────────────────────────────────────
function openModal(t) {
  const overlay = document.getElementById('modalOverlay');
  const body    = document.getElementById('modal-body');
  document.getElementById('modal-title').textContent = 'Detalhes da Transação';
  body.innerHTML = [
    ['Data',      fmtDate(t.date)],
    ['Valor',     `<span style="font-family:'JetBrains Mono',monospace;font-weight:700;color:${t.type==='credit'?'var(--accent-green)':'var(--accent-red)'}">${t.type==='credit'?'+':''}${fmtCurrency(t.value)}</span>`],
    ['Tipo',      t.type === 'credit' ? '↑ Entrada' : '↓ Saída'],
    ['Categoria', getCatLabel(t.category)],
    ['Descrição', escHtml(t.desc)],
    ['ID',        `<span style="font-size:10px;font-family:'JetBrains Mono',monospace;color:var(--text-muted)">${t.id}</span>`],
  ].map(([k, v]) => `<div class="modal-row"><span class="modal-key">${k}</span><span class="modal-val">${v}</span></div>`).join('');
  overlay.classList.add('open');
}

document.getElementById('modalClose').onclick = () => document.getElementById('modalOverlay').classList.remove('open');
document.getElementById('modalOverlay').onclick = e => { if (e.target === e.currentTarget) e.currentTarget.classList.remove('open'); };

// ─── INSIGHTS ────────────────────────────────────────────────────
function renderInsights() {
  const grid = document.getElementById('insightsGrid');
  const data = filteredTransactions;
  if (!data.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:span 3"><div class="empty-icon">💡</div><div class="empty-title">Nenhum dado</div></div>`;
    return;
  }

  const credits = data.filter(t => t.type === 'credit');
  const debits  = data.filter(t => t.type === 'debit');
  const totalIn  = credits.reduce((s, t) => s + t.value, 0);
  const totalOut = debits.reduce((s, t) => s + Math.abs(t.value), 0);
  const balance  = totalIn - totalOut;

  // Biggest category
  const catTotals = {};
  debits.forEach(t => { catTotals[t.category] = (catTotals[t.category] || 0) + Math.abs(t.value); });
  const topCat = Object.entries(catTotals).sort((a,b)=>b[1]-a[1])[0];

  // Day of week with most spending
  const dowTotals = [0,0,0,0,0,0,0];
  const dowNames  = ['Segunda','Terça','Quarta','Quinta','Sexta','Sábado','Domingo'];
  debits.forEach(t => { if(!isNaN(t.date)) dowTotals[(t.date.getDay()+6)%7]+=Math.abs(t.value); });
  const maxDow = dowTotals.indexOf(Math.max(...dowTotals));

  // Biggest single expense
  const biggestExpense = debits.length ? debits.reduce((m,t)=>Math.abs(t.value)>Math.abs(m.value)?t:m) : null;

  // Number of days with transactions
  const days = new Set(data.map(t => fmtDate(t.date))).size;

  const insights = [
    {
      emoji: balance >= 0 ? '✅' : '⚠️',
      title: 'Saldo do Período',
      body: `Seu saldo ${balance >= 0 ? 'ficou positivo' : '<strong style="color:var(--accent-red)">ficou negativo</strong>'} no período analisado.`,
      value: fmtCurrency(balance),
      valueColor: balance >= 0 ? 'var(--accent-green)' : 'var(--accent-red)',
      cardClass: balance >= 0 ? 'success' : 'alert',
    },
    {
      emoji: '🏆',
      title: 'Categoria Campeã de Gastos',
      body: `Sua maior categoria de despesa foi <strong>${topCat ? getCatLabel(topCat[0]) : '—'}</strong>.`,
      value: topCat ? fmtCurrency(topCat[1]) : '—',
      valueColor: 'var(--accent-amber)',
      cardClass: '',
    },
    {
      emoji: '📅',
      title: 'Dia de Maior Gasto',
      body: `Você gasta mais às <strong>${dowNames[maxDow]}</strong>s. Considere planejar suas compras em outros dias.`,
      value: dowNames[maxDow],
      valueColor: 'var(--accent-purple)',
      cardClass: '',
    },
    {
      emoji: '💸',
      title: 'Maior Despesa Única',
      body: biggestExpense ? `<span title="${escHtml(biggestExpense.desc)}">${escHtml(truncate(biggestExpense.desc, 45))}</span>` : '—',
      value: biggestExpense ? fmtCurrency(Math.abs(biggestExpense.value)) : '—',
      valueColor: 'var(--accent-red)',
      cardClass: '',
    },
    {
      emoji: '📊',
      title: 'Taxa de Poupança',
      body: `Você recebeu ${fmtCurrency(totalIn)} e gastou ${fmtCurrency(totalOut)} no período.`,
      value: totalIn > 0 ? `${((balance / totalIn) * 100).toFixed(1)}%` : '—',
      valueColor: balance >= 0 ? 'var(--accent-green)' : 'var(--accent-red)',
      cardClass: balance >= 0 ? 'success' : 'alert',
    },
    {
      emoji: '📆',
      title: 'Frequência de Uso',
      body: `Você teve movimentações em <strong>${days} dias</strong> no período analisado. Média de <strong>${data.length > 0 ? (data.length/days).toFixed(1) : 0} transações/dia</strong>.`,
      value: `${days} dias`,
      valueColor: 'var(--accent-blue)',
      cardClass: '',
    },
  ];

  grid.innerHTML = insights.map(ins => `
    <div class="insight-card ${ins.cardClass} fade-in">
      <div class="insight-header">
        <span class="insight-emoji">${ins.emoji}</span>
        <span class="insight-title">${ins.title}</span>
      </div>
      <div class="insight-value" style="color:${ins.valueColor}">${ins.value}</div>
      <div class="insight-body">${ins.body}</div>
    </div>
  `).join('');
}

// ─── CONFIG / STATS ───────────────────────────────────────────────
function renderCatRules() {
  const el = document.getElementById('catRulesDisplay');
  if (!el) return;
  el.innerHTML = CAT_RULES.map(r => `
    <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border)">
      <span style="font-size:13px;font-weight:600;min-width:160px">${r.label}</span>
      <span style="font-size:12px;color:var(--text-muted)">${r.keywords.map(k => `<code style="background:var(--bg-elevated);padding:2px 6px;border-radius:4px;font-size:11px">${k}</code>`).join(' ')}</span>
    </div>
  `).join('');
}

function renderStats() {
  const el = document.getElementById('statsDisplay');
  if (!el) return;
  if (!allTransactions.length) { el.innerHTML = 'Nenhum dado carregado.'; return; }
  const cats = {};
  allTransactions.forEach(t => { cats[t.category] = (cats[t.category]||0)+1; });
  const dates = allTransactions.map(t=>t.date).filter(d=>!isNaN(d));
  const minD = new Date(Math.min(...dates));
  const maxD = new Date(Math.max(...dates));
  el.innerHTML = `
    Total de transações: <strong>${allTransactions.length}</strong><br>
    Período: <strong>${fmtDate(minD)}</strong> até <strong>${fmtDate(maxD)}</strong><br>
    Entradas: <strong style="color:var(--accent-green)">${allTransactions.filter(t=>t.type==='credit').length}</strong><br>
    Saídas: <strong style="color:var(--accent-red)">${allTransactions.filter(t=>t.type==='debit').length}</strong><br>
    Categorias detectadas: <strong>${Object.keys(cats).length}</strong>
  `;
}

// ─── FILE CHIPS ───────────────────────────────────────────────────
function addFileChip(name, size) {
  const list = document.getElementById('filesList');
  if (!list) return;
  const old = document.getElementById('kpi-empty');
  if (old) old.remove();

  const chip = document.createElement('div');
  chip.className = 'file-chip';
  chip.dataset.name = name;
  chip.innerHTML = `
    <span class="file-chip-icon">📄</span>
    <span class="file-chip-name">${escHtml(name)}</span>
    <span class="file-chip-size">${fmtBytes(size)}</span>
    <button class="file-chip-remove" onclick="removeFile(this, '${escHtml(name)}')" title="Remover">✕</button>
  `;
  list.appendChild(chip);

  // Preview card
  document.getElementById('uploadPreviewCard').style.display = 'block';
  updatePreview();
}

function removeFile(btn, name) {
  btn.closest('.file-chip').remove();
  allTransactions = allTransactions.filter(t => !t._file || t._file !== name);
  afterLoad();
  toast(`Arquivo ${name} removido`, 'info');
}

function updatePreview() {
  const body = document.getElementById('previewBody');
  if (!body) return;
  const preview = filteredTransactions.slice(0, 10);
  body.innerHTML = preview.map(t => `
    <tr>
      <td class="td-date">${fmtDate(t.date)}</td>
      <td class="td-desc">${escHtml(truncate(t.desc, 40))}</td>
      <td><span class="cat-badge cat-${t.category}">${getCatLabel(t.category)}</span></td>
      <td class="td-value ${t.type==='credit'?'positive':'negative'}">${t.type==='credit'?'+':''}${fmtCurrency(t.value)}</td>
    </tr>
  `).join('');
}

// ─── EXPORT ───────────────────────────────────────────────────────
function exportCSV() {
  const data = filteredTransactions;
  if (!data.length) { toast('Nenhum dado para exportar', 'error'); return; }
  const rows = [['Data', 'Descrição', 'Categoria', 'Valor', 'Tipo']];
  data.forEach(t => rows.push([fmtDate(t.date), t.desc, getCatLabel(t.category), t.value, t.type === 'credit' ? 'Entrada' : 'Saída']));
  const csv  = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `findash_export_${new Date().toISOString().slice(0,10)}.csv`;
  a.click(); URL.revokeObjectURL(url);
  toast('CSV exportado com sucesso!', 'success');
}

// ─── CLEAR ALL ────────────────────────────────────────────────────
function clearAll() {
  if (!confirm('Tem certeza? Todos os dados serão apagados.')) return;
  allTransactions = [];
  filteredTransactions = [];
  localStorage.removeItem('findash_data');
  localStorage.removeItem('findash_files');
  document.getElementById('filesList').innerHTML = '';
  document.getElementById('uploadPreviewCard').style.display = 'none';
  renderKPIs();
  renderAllCharts();
  document.getElementById('badge-transacoes').textContent = '0';
  document.getElementById('topbar-period-summary').textContent = '';
  toast('Dados apagados', 'info');
}

function refreshAll() {
  applyFilters();
  toast('Dashboard atualizado', 'success');
}

// ─── TOAST ────────────────────────────────────────────────────────
function toast(msg, type = 'info') {
  const container = document.getElementById('toastContainer');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  t.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${msg}</span>`;
  container.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity 0.3s'; setTimeout(() => t.remove(), 300); }, 3500);
}

// ─── HELPERS ─────────────────────────────────────────────────────
function fmtCurrency(v) {
  return 'R$ ' + Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtCurrencyShort(v) {
  if (Math.abs(v) >= 1000) return 'R$' + (v/1000).toFixed(1) + 'k';
  return 'R$' + v.toFixed(0);
}
function fmtBytes(b) {
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b/1024).toFixed(1) + ' KB';
  return (b/1048576).toFixed(1) + ' MB';
}
function truncate(str, n) {
  return str && str.length > n ? str.slice(0, n) + '…' : (str || '');
}
function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function generateId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
function parseDate2(str) {
  // DD/MM/YYYY
  const m = str.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return new Date(`${m[3]}-${m[2]}-${m[1]}`);
  return new Date(str);
}
