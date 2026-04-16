/* =================================================================
   MAMON — Financial Intelligence Platform · Core Logic
   ================================================================= */
'use strict';

// ── CATEGORY RULES ────────────────────────────────────────────────
const CATS = [
  { id:'transporte',   label:'Transporte',    kws:['99','nupay','uber','cabify','taxi','99pay','indriver','onix'] },
  { id:'supermercado', label:'Supermercado',  kws:['supermercado','mercado','fort','fortello','atacadao','assai','carrefour','extra','dia %'] },
  { id:'alimentacao',  label:'Alimentação',   kws:['cantina','restaurante','lanche','food','burger','pizza','cafe','padaria','jim.com','ifood','rappi','ifd*'] },
  { id:'saude',        label:'Saúde',         kws:['farmácia','farmacia','pague menos','drogaria','medico','saude','hospital','clinica','ultra'] },
  { id:'assinatura',   label:'Assinatura',    kws:['netflix','spotify','amazon','apple','google','microsoft','youtube','prime','disney','hbo'] },
  { id:'vestuario',    label:'Vestuário',     kws:['roupa','moda','renner','riachuelo','c&a','zara','hm','shein','lojas'] },
  { id:'transferencia',label:'Transferência', kws:['enviada pelo pix','enviado pelo pix','transferência enviada','transferencia enviada'] },
  { id:'recebimento',  label:'Recebimento',   kws:['recebida pelo pix','recebido pelo pix','transferência recebida','transferencia recebida','transferência recebida -'] },
];
const CAT_COLORS = {
  transporte:'#0a84ff', supermercado:'#30d158', alimentacao:'#ffd60a',
  saude:'#ff453a', assinatura:'#32ade6', vestuario:'#bf5af2',
  transferencia:'#8e8e93', recebimento:'#34c759', outros:'#48484a',
};

// ── STATE ─────────────────────────────────────────────────────────
let ALL  = [];   // all transactions
let DATA = [];   // filtered
let chartInstances = {}; // registered Chart.js instances
let curPage = 1;
const PER_PAGE = 20;
let sortK = 'date', sortD = 'desc';
let curPage_ = 'dashboard';
let fState = { start:null, end:null, type:'all', cat:'all', q:'', range:'all' };

// ── BOOT ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initCursor();
  Chart.defaults.font.family = "'Inter', sans-serif";
  Chart.defaults.color = 'rgba(255,255,255,0.28)';
  loadStorage();
  renderRules();
  document.getElementById('modClose').onclick = closeModal;
  document.getElementById('modalBg').onclick = e => { if(e.target === e.currentTarget) closeModal(); };
  go('dashboard');
});

// ── CURSOR GLOW ───────────────────────────────────────────────────
function initCursor() {
  const el = document.getElementById('cursor-glow');
  document.addEventListener('mousemove', e => {
    el.style.left = e.clientX+'px'; el.style.top = e.clientY+'px'; el.style.opacity='1';
  });
  document.addEventListener('mouseleave', () => el.style.opacity='0');
}

// ── NAVIGATION ────────────────────────────────────────────────────
const PAGE_META = {
  dashboard:  ['Dashboard',    'Visão geral da sua vida financeira'],
  transacoes: ['Transações',   'Histórico completo de movimentações'],
  graficos:   ['Gráficos',     'Análise visual detalhada'],
  insights:   ['Insights',     'Inteligência financeira personalizada'],
  upload:     ['Importar',     'Adicione seus extratos bancários CSV'],
  config:     ['Configurações','Regras e gerenciamento de dados'],
};

function go(page) {
  curPage_ = page;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(n => n.classList.remove('active'));
  document.getElementById('page-'+page)?.classList.add('active');
  document.getElementById('nav-'+page)?.classList.add('active');
  const [t, s] = PAGE_META[page] || ['Mamon',''];
  document.getElementById('pg-title').textContent = t;
  document.getElementById('pg-sub').textContent   = s;
  // Lazy render
  if (page === 'transacoes') renderTbl();
  if (page === 'graficos')   renderGpage();
  if (page === 'insights')   renderInsights();
  if (page === 'config')     renderStats();
}

// ── SIDEBAR ───────────────────────────────────────────────────────
function toggleSb() {
  document.getElementById('sidebar').classList.toggle('collapsed');
  document.getElementById('main').classList.toggle('sb-collapsed');
}

// ── FILE HANDLING ─────────────────────────────────────────────────
function onDrop(e) {
  e.preventDefault();
  document.getElementById('dropZone').classList.remove('over');
  handleFiles([...e.dataTransfer.files]);
}
function onSbDrop(e) {
  e.preventDefault(); e.stopPropagation();
  document.getElementById('sbDrop').classList.remove('over');
  handleFiles([...e.dataTransfer.files]);
}
function onFileSelect(e) { handleFiles([...e.target.files]); e.target.value=''; }

function handleFiles(files) {
  const csvs = files.filter(f => f.name.toLowerCase().endsWith('.csv'));
  if (!csvs.length) { toast('Apenas arquivos .csv são aceitos', 'err'); return; }
  csvs.forEach(parseCSV);
}

function parseCSV(file) {
  Papa.parse(file, {
    header: true, skipEmptyLines: true, encoding: 'UTF-8',
    complete(res) {
      const rows = res.data;
      if (!rows.length) { toast('Arquivo vazio: ' + file.name, 'err'); return; }
      const hdr = Object.keys(rows[0]).map(h => h.trim().toLowerCase());
      const ok = hdr.some(h => h.includes('data')) && hdr.some(h => h.includes('valor'));
      if (!ok) { toast('Formato não reconhecido: ' + file.name, 'err'); return; }
      let added = 0;
      rows.forEach(row => {
        const data_  = gf(row, ['data','Data']);
        const valor_ = gf(row, ['valor','Valor']);
        const desc_  = gf(row, ['descrição','Descrição','descricao','Descricao']);
        const id_    = gf(row, ['identificador','Identificador']) || uid();
        if (!data_ || valor_==='' || valor_===undefined) return;
        const v = parseFloat(String(valor_).replace(',','.'));
        if (isNaN(v)) return;
        if (ALL.find(t=>t.id===id_)) return;
        ALL.push({
          id: id_, date: pDate(data_), dateStr: data_.trim(),
          value: v, desc: (desc_||'').trim(),
          type: v>=0 ? 'credit' : 'debit',
          cat: categorize(desc_||''),
        });
        added++;
      });
      if (added) {
        addChip(file.name, file.size);
        afterLoad();
        toast(added + ' transações importadas de ' + file.name, 'ok');
        if (curPage_ === 'upload') go('dashboard');
      } else {
        toast('Nenhuma transação nova em ' + file.name, 'inf');
      }
    },
    error() { toast('Erro ao ler ' + file.name, 'err'); },
  });
}

function gf(row, keys) {
  for (const k of keys) {
    if (row[k] !== undefined) return row[k];
    const found = Object.keys(row).find(rk => rk.trim().toLowerCase() === k.toLowerCase());
    if (found) return row[found];
  }
  return '';
}

function pDate(s) {
  if (!s) return new Date(0);
  const m = s.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return new Date(`${m[3]}-${m[2]}-${m[1]}T00:00:00`);
  return new Date(s.trim());
}

function categorize(desc) {
  const low = desc.toLowerCase();
  for (const cat of CATS) {
    if (cat.kws.some(k => low.includes(k))) return cat.id;
  }
  return 'outros';
}

// ── AFTER LOAD ────────────────────────────────────────────────────
function afterLoad() {
  ALL.sort((a,b) => b.date - a.date);
  saveStorage();
  syncCatFilters();
  document.getElementById('nav-badge').textContent = ALL.length;
  applyF();
}

function syncCatFilters() {
  const cats = [...new Set(ALL.map(t=>t.cat))];
  ['fCat','tCat'].forEach(id => {
    const sel = document.getElementById(id); if (!sel) return;
    const prev = sel.value;
    sel.innerHTML = '<option value="all">Todas</option>';
    cats.forEach(c => {
      const o = document.createElement('option'); o.value=c; o.textContent=catLabel(c); sel.appendChild(o);
    });
    sel.value = prev;
  });
}

function updatePeriodLabel() {
  const el = document.getElementById('period-label');
  if (!ALL.length) { el.textContent=''; return; }
  const ds = ALL.map(t=>t.date).filter(d=>!isNaN(d));
  const mn = new Date(Math.min(...ds)), mx = new Date(Math.max(...ds));
  el.textContent = fmt(mn) + ' → ' + fmt(mx);
}

// ── FILTERS ───────────────────────────────────────────────────────
function setRange(r) {
  document.querySelectorAll('.pill').forEach(p=>p.classList.remove('active'));
  document.querySelector(`[data-r="${r}"]`)?.classList.add('active');
  fState.range = r;
  if (r === 'all') {
    fState.start = null; fState.end = null;
    document.getElementById('fStart').value = '';
    document.getElementById('fEnd').value   = '';
  } else {
    const end = new Date(), start = new Date();
    start.setDate(end.getDate() - Number(r));
    fState.start = start; fState.end = end;
    document.getElementById('fStart').value = fmtI(start);
    document.getElementById('fEnd').value   = fmtI(end);
  }
  applyF();
}

function applyF() {
  const ds = document.getElementById('fStart').value;
  const de = document.getElementById('fEnd').value;
  if (ds) fState.start = new Date(ds+'T00:00:00');
  if (de) fState.end   = new Date(de+'T23:59:59');
  fState.type = document.getElementById('fType').value;
  fState.cat  = document.getElementById('fCat').value;
  fState.q    = document.getElementById('fSearch').value.toLowerCase().trim();

  DATA = ALL.filter(t => {
    if (fState.start && t.date < fState.start) return false;
    if (fState.end   && t.date > fState.end)   return false;
    if (fState.type !== 'all' && t.type !== fState.type) return false;
    if (fState.cat  !== 'all' && t.cat  !== fState.cat)  return false;
    if (fState.q && !t.desc.toLowerCase().includes(fState.q)) return false;
    return true;
  });

  curPage = 1;
  updatePeriodLabel();
  renderKPIs();
  renderDashCharts();
  if (curPage_ === 'transacoes') renderTbl();
  if (curPage_ === 'graficos')   renderGpage();
  if (curPage_ === 'insights')   renderInsights();
}

function clearF() {
  ['fStart','fEnd'].forEach(id => document.getElementById(id).value='');
  ['fType','fCat'].forEach(id => document.getElementById(id).value='all');
  document.getElementById('fSearch').value='';
  fState = { start:null, end:null, type:'all', cat:'all', q:'', range:'all' };
  document.querySelectorAll('.pill').forEach(p=>p.classList.remove('active'));
  document.querySelector('[data-r="all"]')?.classList.add('active');
  applyF();
}

// ── KPIs ──────────────────────────────────────────────────────────
function renderKPIs() {
  const grid  = document.getElementById('kpiGrid');
  const empty = document.getElementById('kpiEmpty');

  if (!DATA.length) {
    grid.innerHTML = '';
    if (empty) { empty.style.display=''; grid.appendChild(empty); }
    else grid.innerHTML = `<div class="empty" style="grid-column:1/-1"><svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg><div class="empty-title">Sem dados</div><div class="empty-desc">Adicione um CSV para começar.</div></div>`;
    document.getElementById('catBars').innerHTML='';
    return;
  }
  if (empty) empty.style.display='none';

  const cr  = DATA.filter(t=>t.type==='credit');
  const db  = DATA.filter(t=>t.type==='debit');
  const tin = cr.reduce((s,t)=>s+t.value,0);
  const tout= db.reduce((s,t)=>s+Math.abs(t.value),0);
  const bal = tin - tout;
  const mxD = db.length ? db.reduce((m,t)=>Math.abs(t.value)>Math.abs(m.value)?t:m) : null;
  const mxC = cr.length ? cr.reduce((m,t)=>t.value>m.value?t:m) : null;
  const days= new Set(DATA.map(t=>fmt(t.date))).size;
  const avg = days ? tout/days : 0;
  const tr  = DATA.filter(t=>t.cat==='transporte').reduce((s,t)=>s+Math.abs(t.value),0);

  const kpis = [
    { ico:'green',  valCls: bal>=0?'green':'red', val:fmtR(bal), label:'Saldo do Período',
      badge: bal>=0 ? {cls:'pos',t:'Positivo'} : {cls:'neg',t:'Negativo'},
      bar: Math.min(100, Math.abs(bal/Math.max(tin,tout))*100), barColor: bal>=0?'#30d158':'#ff453a' },
    { ico:'green',  valCls:'green',  val:fmtR(tin),  label:'Total Entradas',    badge:{cls:'neu',t:cr.length+' mov.'}, bar:100, barColor:'#30d158' },
    { ico:'red',    valCls:'red',    val:fmtR(tout), label:'Total Saídas',      badge:{cls:'neu',t:db.length+' mov.'}, bar:tout>0?Math.min(100,(tout/Math.max(tin,tout))*100):0, barColor:'#ff453a' },
    { ico:'white',  valCls:'',       val:String(DATA.length), label:'Transações',  badge:{cls:'neu',t:days+' dias'}, bar:0, barColor:'' },
    { ico:'red',    valCls:'red',    val:mxD?fmtR(Math.abs(mxD.value)):'—', label:'Maior Gasto',     badge:{cls:'neu',t:trunc(mxD?.desc||'—',22)}, bar:0, barColor:'' },
    { ico:'green',  valCls:'green',  val:mxC?fmtR(mxC.value):'—',          label:'Maior Entrada',   badge:{cls:'neu',t:trunc(mxC?.desc||'—',22)}, bar:0, barColor:'' },
    { ico:'purple', valCls:'purple', val:fmtR(avg), label:'Média Diária Gasto', badge:{cls:'neu',t:'por dia'}, bar:0, barColor:'' },
    { ico:'blue',   valCls:'blue',   val:fmtR(tr),  label:'Transporte',         badge:{cls:'neu',t:'99 · Uber · NuPay'}, bar:tr>0?Math.min(100,(tr/tout)*100):0, barColor:'#0a84ff' },
  ];

  grid.innerHTML = kpis.map(k => `
    <div class="kpi-card">
      <div class="kpi-top">
        <div class="kpi-icon ${k.ico}">${kpiSvg(k.ico)}</div>
        <span class="kpi-badge ${k.badge.cls}">${esc(k.badge.t)}</span>
      </div>
      <div class="kpi-value ${k.valCls}">${k.val}</div>
      <div class="kpi-label">${k.label}</div>
      ${k.bar ? `<div class="kpi-bar"><div class="kpi-bar-fill" style="width:${k.bar}%;background:${k.barColor}"></div></div>` : ''}
    </div>`).join('');

  renderCatBars(db);
}

function kpiSvg(color) {
  const icons = {
    green:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><line x1="12" y1="2" x2="12" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`,
    red:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>`,
    blue:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>`,
    purple: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`,
    white:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>`,
    amber:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`,
    teal:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>`,
  };
  return icons[color] || icons.white;
}

function renderCatBars(debits) {
  const el = document.getElementById('catBars');
  if (!el || !debits.length) { if(el) el.innerHTML='<div style="font-size:12px;color:var(--text-3);padding:4px 0">Sem dados de saída.</div>'; return; }
  const tot = {};
  debits.forEach(t => { tot[t.cat]=(tot[t.cat]||0)+Math.abs(t.value); });
  const total = Object.values(tot).reduce((s,v)=>s+v,0);
  const sorted= Object.entries(tot).sort((a,b)=>b[1]-a[1]);

  el.innerHTML = `<div style="display:flex;flex-direction:column;gap:10px">` + sorted.map(([cat,val]) => {
    const pct = total>0?(val/total)*100:0;
    const col = CAT_COLORS[cat]||'#48484a';
    return `<div class="prog-row" style="margin-bottom:0">
      <div class="prog-hd">
        <span class="prog-name">${catLabel(cat)}</span>
        <span class="prog-val">${fmtR(val)} <span style="opacity:0.45">${pct.toFixed(1)}%</span></span>
      </div>
      <div class="prog-track"><div class="prog-fill" style="width:${pct}%;background:${col}"></div></div>
    </div>`;
  }).join('') + '</div>';
}

// ── CHART HELPERS ─────────────────────────────────────────────────
const TOOLTIP = {
  backgroundColor: '#1c1c1e',
  titleColor: 'rgba(255,255,255,0.75)',
  bodyColor:  'rgba(255,255,255,0.45)',
  borderColor: 'rgba(255,255,255,0.08)',
  borderWidth: 1,
  padding: 10,
  cornerRadius: 8,
};

const BASE_OPTS = {
  responsive: true, maintainAspectRatio: false,
  plugins: { legend: { display:false }, tooltip: { ...TOOLTIP } },
  scales: {
    x: { grid:{ color:'rgba(255,255,255,0.04)', drawBorder:false }, ticks:{ color:'rgba(255,255,255,0.28)', font:{size:10} } },
    y: { grid:{ color:'rgba(255,255,255,0.04)', drawBorder:false }, ticks:{ color:'rgba(255,255,255,0.28)', font:{size:10}, callback:v=>fmtShort(v) } },
  },
};

function mkChart(id, cfg) {
  const canvas = document.getElementById(id);
  if (!canvas) return null;
  if (chartInstances[id]) { try { chartInstances[id].destroy(); } catch(e){} }
  const c = new Chart(canvas, cfg);
  chartInstances[id] = c;
  return c;
}

function lineDs(label, data, color, fill=false) {
  return { label, data, borderColor:color, backgroundColor: fill ? hexA(color,0.1):'transparent', fill, tension:0.4, borderWidth:2, pointRadius:2, pointHoverRadius:4, pointBackgroundColor:color };
}
function barDs(label, data, color) {
  return { label, data, backgroundColor: hexA(color,0.7), borderRadius:4, borderSkipped:false };
}

// ── DASHBOARD CHARTS ──────────────────────────────────────────────
function renderDashCharts() {
  if (!DATA.length) { Object.keys(chartInstances).forEach(id=>{ try{chartInstances[id]?.destroy();}catch(e){} delete chartInstances[id]; }); return; }
  renderCashflow('cCashflow', DATA);
  renderDonut   ('cDonut',    DATA);
  renderMonthly ('cMonthly',  DATA);
  renderAccum   ('cAccum',    DATA);
  renderWeekday ('cWeek',     DATA);
  renderTop10   ('cTop10',    DATA);
}

// ── G PAGE ────────────────────────────────────────────────────────
function renderGpage() {
  if (!DATA.length) return;
  renderCashflow('g-cashflow', DATA);
  renderDonut   ('g-donut',    DATA);
  renderMonthly ('g-monthly',  DATA);
  renderAccum   ('g-accum',    DATA);
  renderTop10   ('g-top10',    DATA);
  renderWeekday ('g-week',     DATA);
}

// ── CHART BUILDERS ────────────────────────────────────────────────
function renderCashflow(id, data) {
  const byDate = {};
  data.forEach(t => {
    const k = fmt(t.date);
    if (!byDate[k]) byDate[k] = {cr:0,db:0};
    if (t.type==='credit') byDate[k].cr+=t.value;
    else byDate[k].db+=Math.abs(t.value);
  });
  const labels = Object.keys(byDate).sort((a,b)=>pDateStr(a)-pDateStr(b));
  mkChart(id, {
    type:'line',
    data:{ labels, datasets:[
      lineDs('Entradas', labels.map(l=>byDate[l].cr), '#30d158', true),
      lineDs('Saídas',   labels.map(l=>byDate[l].db), '#ff453a', true),
    ]},
    options:{ ...BASE_OPTS, plugins:{ ...BASE_OPTS.plugins, legend:{ display:true, labels:{ color:'rgba(255,255,255,0.45)', font:{size:11}, boxWidth:8, boxHeight:8, padding:16 } }, tooltip:{ ...TOOLTIP, callbacks:{ label:ctx=>' '+fmtR(ctx.parsed.y) } } } },
  });
}

function renderDonut(id, data) {
  const debits = data.filter(t=>t.type==='debit');
  if (!debits.length) return;
  const tot = {};
  debits.forEach(t=>{ tot[t.cat]=(tot[t.cat]||0)+Math.abs(t.value); });
  const sorted = Object.entries(tot).sort((a,b)=>b[1]-a[1]).slice(0,8);
  mkChart(id, {
    type:'doughnut',
    data:{
      labels: sorted.map(([c])=>catLabel(c)),
      datasets:[{ data:sorted.map(([,v])=>v), backgroundColor:sorted.map(([c])=>CAT_COLORS[c]||'#48484a'), borderColor:'transparent', borderWidth:0, hoverOffset:6 }],
    },
    options:{
      responsive:true, maintainAspectRatio:false, cutout:'68%',
      plugins:{
        legend:{ display:true, position:'bottom', labels:{ color:'rgba(255,255,255,0.45)', font:{size:10}, padding:14, boxWidth:8, boxHeight:8 } },
        tooltip:{ ...TOOLTIP, callbacks:{ label:ctx=>` ${ctx.label}: ${fmtR(ctx.parsed)}` } },
      },
    },
  });
}

function renderMonthly(id, data) {
  const bm = {};
  data.forEach(t => {
    if (isNaN(t.date)) return;
    const k = `${t.date.getFullYear()}-${String(t.date.getMonth()+1).padStart(2,'0')}`;
    if (!bm[k]) bm[k]={cr:0,db:0};
    if (t.type==='credit') bm[k].cr+=t.value; else bm[k].db+=Math.abs(t.value);
  });
  const keys = Object.keys(bm).sort();
  const labels = keys.map(k => { const [y,m]=k.split('-'); return new Date(+y,+m-1).toLocaleString('pt-BR',{month:'short',year:'2-digit'}); });
  mkChart(id, {
    type:'bar',
    data:{ labels, datasets:[
      barDs('Entradas', keys.map(k=>bm[k].cr), '#30d158'),
      barDs('Saídas',   keys.map(k=>bm[k].db), '#ff453a'),
    ]},
    options:{ ...BASE_OPTS, plugins:{ ...BASE_OPTS.plugins, legend:{ display:true, labels:{ color:'rgba(255,255,255,0.45)', font:{size:11}, boxWidth:8, boxHeight:8, padding:14 } }, tooltip:{ ...TOOLTIP, callbacks:{ label:ctx=>' '+fmtR(ctx.parsed.y) } } } },
  });
}

function renderAccum(id, data) {
  const sorted=[...data].sort((a,b)=>a.date-b.date);
  let acc=0; const bd={};
  sorted.forEach(t=>{ const k=fmt(t.date); acc+=t.value; bd[k]=acc; });
  const labels=Object.keys(bd);
  const values=Object.values(bd);
  const color = values[values.length-1]>=0 ? '#30d158' : '#ff453a';
  mkChart(id, {
    type:'line',
    data:{ labels, datasets:[lineDs('Saldo', values, color, true)] },
    options:{ ...BASE_OPTS, plugins:{ ...BASE_OPTS.plugins, tooltip:{ ...TOOLTIP, callbacks:{ label:ctx=>' '+fmtR(ctx.parsed.y) } } } },
  });
}

function renderWeekday(id, data) {
  const wt=[0,0,0,0,0,0,0];
  data.filter(t=>t.type==='debit').forEach(t=>{ if(!isNaN(t.date)) wt[(t.date.getDay()+6)%7]+=Math.abs(t.value); });
  mkChart(id, {
    type:'radar',
    data:{
      labels:['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'],
      datasets:[{ label:'Gastos', data:wt, borderColor:'#0a84ff', backgroundColor:'rgba(10,132,255,0.08)', pointBackgroundColor:'#0a84ff', borderWidth:1.5, pointRadius:3 }],
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{display:false}, tooltip:{ ...TOOLTIP, callbacks:{ label:ctx=>' '+fmtR(ctx.parsed.r) } } },
      scales:{
        r:{
          ticks:{ color:'rgba(255,255,255,0.25)', backdropColor:'transparent', font:{size:9.5}, callback:v=>fmtShort(v) },
          grid:{ color:'rgba(255,255,255,0.06)' },
          pointLabels:{ color:'rgba(255,255,255,0.45)', font:{size:11} },
          angleLines:{ color:'rgba(255,255,255,0.06)' },
        },
      },
    },
  });
}

function renderTop10(id, data) {
  const db = [...data.filter(t=>t.type==='debit')].sort((a,b)=>a.value-b.value).slice(0,10).reverse();
  if (!db.length) return;
  const labels = db.map(t=>trunc(t.desc,28));
  const vals   = db.map(t=>Math.abs(t.value));
  mkChart(id, {
    type:'bar',
    data:{ labels, datasets:[{ data:vals, backgroundColor:vals.map((_,i)=>`hsla(${210+i*12},80%,60%,0.7)`), borderRadius:4, borderSkipped:false }] },
    options:{
      indexAxis:'y', responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{display:false}, tooltip:{ ...TOOLTIP, callbacks:{ label:ctx=>' '+fmtR(ctx.parsed.x) } } },
      scales:{ x:{ grid:{color:'rgba(255,255,255,0.04)'}, ticks:{color:'rgba(255,255,255,0.28)', font:{size:10}, callback:v=>fmtShort(v)} }, y:{grid:{display:false}, ticks:{color:'rgba(255,255,255,0.45)', font:{size:10.5}}} },
    },
  });
}

// ── TABLE ──────────────────────────────────────────────────────────
function renderTbl() {
  const q   = (document.getElementById('tSearch')?.value||'').toLowerCase();
  const typ = document.getElementById('tType')?.value||'all';
  const cat = document.getElementById('tCat')?.value||'all';

  // sync cat filter
  const tcat = document.getElementById('tCat');
  if (tcat && tcat.options.length < 3) {
    const cats=[...new Set(DATA.map(t=>t.cat))];
    cats.forEach(c=>{ if (!tcat.querySelector(`[value="${c}"]`)) { const o=document.createElement('option'); o.value=c; o.textContent=catLabel(c); tcat.appendChild(o); } });
  }

  let rows = DATA.filter(t=> {
    if (typ!=='all'&&t.type!==typ) return false;
    if (cat!=='all'&&t.cat!==cat)  return false;
    if (q&&!t.desc.toLowerCase().includes(q)) return false;
    return true;
  });

  rows = [...rows].sort((a,b) => {
    let va,vb;
    if (sortK==='date')  { va=a.date; vb=b.date; }
    else if (sortK==='value') { va=a.value; vb=b.value; }
    else { va=a.desc; vb=b.desc; }
    return (va<vb?-1:va>vb?1:0)*(sortD==='asc'?1:-1);
  });

  const total=rows.length, pages=Math.ceil(total/PER_PAGE)||1;
  curPage=Math.min(curPage,pages);
  const sl=rows.slice((curPage-1)*PER_PAGE, curPage*PER_PAGE);

  document.getElementById('tblCount').textContent = total + ' registros';
  document.getElementById('pgInfo').textContent   = `${(curPage-1)*PER_PAGE+1}–${Math.min(curPage*PER_PAGE,total)} de ${total}`;

  const body=document.getElementById('tblBody');
  body.innerHTML='';
  if (!sl.length) {
    body.innerHTML=`<tr><td colspan="5" style="text-align:center;padding:40px;color:var(--text-3)">Nenhuma transação encontrada</td></tr>`;
  } else {
    sl.forEach(t=>{
      const tr=document.createElement('tr');
      tr.onclick=()=>openModal(t);
      tr.innerHTML=`
        <td class="td-date mono">${fmt(t.date)}</td>
        <td class="td-desc">${esc(trunc(t.desc,48))}</td>
        <td><span class="tag tag-${t.cat}">${catLabel(t.cat)}</span></td>
        <td class="td-val ${t.type==='credit'?'pos':'neg'}">${t.type==='credit'?'+':''}${fmtR(t.value)}</td>
        <td><span class="tag ${t.type==='credit'?'tag-entrada':'tag-saida'}">${t.type==='credit'?'Entrada':'Saída'}</span></td>`;
      body.appendChild(tr);
    });
  }

  renderPg(pages);
}

function srtTbl(col) {
  sortD = sortK===col ? (sortD==='asc'?'desc':'asc') : 'desc';
  sortK = col;
  document.querySelectorAll('.sort-ic').forEach(e=>e.textContent='↕');
  const ic=document.getElementById('s-'+col); if(ic) ic.textContent=sortD==='asc'?'↑':'↓';
  renderTbl();
}

function renderPg(pages) {
  const ctrl=document.getElementById('pgCtrl'); ctrl.innerHTML='';
  const mk=(label,pg,dis,active)=>{
    const b=document.createElement('button'); b.className='pg-btn'+(active?' active':'');
    b.textContent=label; b.disabled=dis;
    b.onclick=()=>{ curPage=pg; renderTbl(); };
    ctrl.appendChild(b);
  };
  mk('‹',curPage-1,curPage<=1);
  const s=Math.max(1,curPage-2), e=Math.min(pages,curPage+2);
  for(let i=s;i<=e;i++) mk(i,i,false,i===curPage);
  mk('›',curPage+1,curPage>=pages);
}

// ── MODAL ──────────────────────────────────────────────────────────
function openModal(t) {
  document.getElementById('mod-title').textContent='Transação';
  document.getElementById('mod-body').innerHTML=[
    ['Data',      fmt(t.date)],
    ['Valor',     `<span style="font-family:var(--font-mono);font-weight:600;color:${t.type==='credit'?'var(--green)':'var(--red)'}">${t.type==='credit'?'+':''}${fmtR(t.value)}</span>`],
    ['Tipo',      t.type==='credit'?'Entrada':'Saída'],
    ['Categoria', catLabel(t.cat)],
    ['Descrição', esc(t.desc)],
    ['ID',        `<span style="font-size:10px;font-family:var(--font-mono);color:var(--text-3)">${t.id}</span>`],
  ].map(([k,v])=>`<div class="mod-row"><span class="mod-key">${k}</span><span class="mod-val">${v}</span></div>`).join('');
  document.getElementById('modalBg').classList.add('open');
}
function closeModal() { document.getElementById('modalBg').classList.remove('open'); }

// ── INSIGHTS ──────────────────────────────────────────────────────
function renderInsights() {
  const grid=document.getElementById('insGrid');
  if (!DATA.length) {
    grid.innerHTML=`<div class="empty" style="grid-column:1/-1"><svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg><div class="empty-title">Sem dados</div></div>`;
    return;
  }
  const cr=DATA.filter(t=>t.type==='credit'), db=DATA.filter(t=>t.type==='debit');
  const tin=cr.reduce((s,t)=>s+t.value,0), tout=db.reduce((s,t)=>s+Math.abs(t.value),0), bal=tin-tout;
  const tot={};
  db.forEach(t=>tot[t.cat]=(tot[t.cat]||0)+Math.abs(t.value));
  const topCat=Object.entries(tot).sort((a,b)=>b[1]-a[1])[0];
  const wt=[0,0,0,0,0,0,0];
  db.forEach(t=>{ if(!isNaN(t.date)) wt[(t.date.getDay()+6)%7]+=Math.abs(t.value); });
  const maxDow=wt.indexOf(Math.max(...wt));
  const DOW=['Segunda','Terça','Quarta','Quinta','Sexta','Sábado','Domingo'];
  const bigE=db.length?db.reduce((m,t)=>Math.abs(t.value)>Math.abs(m.value)?t:m):null;
  const days=new Set(DATA.map(t=>fmt(t.date))).size;
  const savR=tin>0?((bal/tin)*100):0;

  const insSvg = k => ({
    bal:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><line x1="12" y1="2" x2="12" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`,
    cat:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>`,
    day:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
    top:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/></svg>`,
    save:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>`,
    freq:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`,
  })[k];

  const INS = [
    { k:'bal',  cls:bal>=0?'good':'warn', icoBg:bal>=0?'var(--green-dim)':'var(--red-dim)', icoC:bal>=0?'var(--green)':'var(--red)', val:fmtR(bal), valC:bal>=0?'var(--green)':'var(--red)', title:'Saldo do Período', body:`Suas entradas superaram ${bal>=0?'suas saídas':'<strong style="color:var(--red)">as entradas</strong>'} no período.` },
    { k:'cat',  cls:'',    icoBg:'var(--amber-dim)', icoC:'var(--amber)',  val:topCat?fmtR(topCat[1]):'—', valC:'var(--amber)',  title:'Categoria Líder', body:`Maior gasto em <strong>${topCat?catLabel(topCat[0]):'—'}</strong>.` },
    { k:'day',  cls:'',    icoBg:'var(--blue-dim)',  icoC:'var(--blue)',   val:DOW[maxDow], valC:'var(--blue)',   title:'Dia de Maior Gasto', body:`Você concentra mais despesas às <strong>${DOW[maxDow]}s</strong>.` },
    { k:'top',  cls:'',    icoBg:'var(--red-dim)',   icoC:'var(--red)',    val:bigE?fmtR(Math.abs(bigE.value)):'—', valC:'var(--red)', title:'Maior Despesa', body:bigE?`<span title="${esc(bigE.desc)}">${esc(trunc(bigE.desc,50))}</span>`:'—' },
    { k:'save', cls:savR>=0?'good':'warn', icoBg:savR>=0?'var(--green-dim)':'var(--red-dim)', icoC:savR>=0?'var(--green)':'var(--red)', val:(savR>=0?'+':'')+savR.toFixed(1)+'%', valC:savR>=0?'var(--green)':'var(--red)', title:'Taxa de Poupança', body:`Você recebeu ${fmtR(tin)} e gastou ${fmtR(tout)}.` },
    { k:'freq', cls:'',    icoBg:'var(--blue-dim)',  icoC:'var(--blue)',   val:days+' dias', valC:'var(--blue)', title:'Frequência', body:`${DATA.length} transações em ${days} dias — média de <strong>${days?(DATA.length/days).toFixed(1):0}/dia</strong>.` },
  ];

  grid.innerHTML=INS.map(i=>`
    <div class="ins-card ${i.cls}">
      <div class="ins-hd">
        <div class="ins-ico" style="background:${i.icoBg};color:${i.icoC}">${insSvg(i.k)}</div>
        <span class="ins-title">${i.title}</span>
      </div>
      <div class="ins-val" style="color:${i.valC}">${i.val}</div>
      <div class="ins-body">${i.body}</div>
    </div>`).join('');
}

// ── CONFIG ────────────────────────────────────────────────────────
function renderRules() {
  const el=document.getElementById('rulesBody'); if(!el) return;
  el.innerHTML=CATS.map(r=>`
    <div class="rule-row">
      <div class="rule-name">${r.label}</div>
      <div class="rule-kws">${r.kws.map(k=>`<span class="kw-tag">${k}</span>`).join('')}</div>
    </div>`).join('');
}
function renderStats() {
  const el=document.getElementById('statsBody'); if(!el) return;
  if (!ALL.length) { el.innerHTML='<span style="color:var(--text-3)">Nenhum dado carregado.</span>'; return; }
  const ds=ALL.map(t=>t.date).filter(d=>!isNaN(d));
  const mn=new Date(Math.min(...ds)), mx=new Date(Math.max(...ds));
  const cats={}; ALL.forEach(t=>{ cats[t.cat]=(cats[t.cat]||0)+1; });
  el.innerHTML=`
    Total de transações: <strong style="color:var(--text-1)">${ALL.length}</strong><br>
    Período analisado: <strong style="color:var(--text-1)">${fmt(mn)} → ${fmt(mx)}</strong><br>
    Entradas: <strong style="color:var(--green)">${ALL.filter(t=>t.type==='credit').length}</strong> &nbsp;·&nbsp; Saídas: <strong style="color:var(--red)">${ALL.filter(t=>t.type==='debit').length}</strong><br>
    Categorias detectadas: <strong style="color:var(--text-1)">${Object.keys(cats).length}</strong> de ${CATS.length+1} disponíveis`;
}

// ── CHIPS ─────────────────────────────────────────────────────────
function addChip(name, size) {
  const list=document.getElementById('filesList'); if(!list) return;
  const c=document.createElement('div'); c.className='file-chip'; c.dataset.n=name;
  c.innerHTML=`
    <span class="chip-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></span>
    <span class="chip-name">${esc(name)}</span>
    <span class="chip-size">${fmtBytes(size)}</span>
    <button class="chip-rm" onclick="rmChip(this)" title="Remover"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg></button>`;
  list.appendChild(c);
}
function rmChip(btn) { btn.closest('.file-chip').remove(); toast('Arquivo removido','inf'); }

// ── EXPORT ────────────────────────────────────────────────────────
function exportCSV() {
  if (!DATA.length) { toast('Nenhum dado para exportar','err'); return; }
  const rows=[['Data','Descrição','Categoria','Valor','Tipo']];
  DATA.forEach(t=>rows.push([fmt(t.date),t.desc,catLabel(t.cat),t.value,t.type==='credit'?'Entrada':'Saída']));
  const csv=rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\r\n');
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8;'}));
  a.download=`mamon_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  toast('Exportação concluída','ok');
}

// ── CLEAR ─────────────────────────────────────────────────────────
function clearAll() {
  if (!confirm('Apagar todos os dados do Mamon?')) return;
  ALL=[]; DATA=[];
  localStorage.removeItem('mamon_data');
  document.getElementById('filesList').innerHTML='';
  document.getElementById('nav-badge').textContent='0';
  document.getElementById('period-label').textContent='';
  Object.keys(chartInstances).forEach(id=>{ try{chartInstances[id]?.destroy();}catch(e){} delete chartInstances[id]; });
  renderKPIs();
  if(curPage_==='transacoes') renderTbl();
  if(curPage_==='insights')   renderInsights();
  toast('Dados apagados','inf');
}
function refreshAll() { applyF(); toast('Atualizado','ok'); }

// ── STORAGE ───────────────────────────────────────────────────────
function saveStorage() {
  try { localStorage.setItem('mamon_data', JSON.stringify(ALL)); } catch(e){}
}
function loadStorage() {
  try {
    const raw=localStorage.getItem('mamon_data');
    if (raw) {
      const parsed=JSON.parse(raw);
      // re-hydrate Date objects (JSON serializes as strings)
      ALL=parsed.map(t=>({ ...t, date: new Date(t.date) }));
      afterLoad();
    }
  } catch(e) { localStorage.removeItem('mamon_data'); }
}

// ── TOAST ─────────────────────────────────────────────────────────
const TSVG = {
  ok:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`,
  err: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
  inf: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
};
function toast(msg, type='inf') {
  const w=document.getElementById('toasts');
  const t=document.createElement('div'); t.className=`toast ${type}`;
  t.innerHTML=TSVG[type]+`<span>${msg}</span>`;
  w.appendChild(t);
  setTimeout(()=>{ t.style.opacity='0'; t.style.transform='translateX(10px)'; t.style.transition='all 0.3s'; setTimeout(()=>t.remove(),300); },3500);
}

// ── UTILS ─────────────────────────────────────────────────────────
function catLabel(id) { return CATS.find(c=>c.id===id)?.label||'Outros'; }
function fmt(d) { if(!d||isNaN(d)) return '—'; return d.toLocaleDateString('pt-BR'); }
function fmtI(d) { return d.toISOString().slice(0,10); }
function fmtR(v) { return 'R$ '+Math.abs(+v).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function fmtShort(v) { if(Math.abs(v)>=1000) return 'R$'+(v/1000).toFixed(1)+'k'; return 'R$'+v.toFixed(0); }
function fmtBytes(b) { return b<1024?b+' B':b<1048576?(b/1024).toFixed(1)+' KB':(b/1048576).toFixed(1)+' MB'; }
function trunc(s,n) { return s&&s.length>n?s.slice(0,n)+'…':(s||''); }
function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function uid() { return Math.random().toString(36).slice(2)+Date.now().toString(36); }
function pDateStr(s) {
  const m=s.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return m?new Date(`${m[3]}-${m[2]}-${m[1]}`):new Date(s);
}
function hexA(hex,a) {
  const r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${a})`;
}
