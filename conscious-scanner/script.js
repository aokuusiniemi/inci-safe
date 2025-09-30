/***********************
 * Product DB (Default) + Persistence
 ***********************/
const DEFAULT_DB = [
  {
    upc: "012345678905",
    name: "HydraShine Shampoo",
    brand: "Riverglow",
    category: "Hair Care",
    ingredients: [
      "Aqua (Water)",
      "Sodium Laureth Sulfate",
      "Cocamidopropyl Betaine",
      "Parfum (Fragrance)",
      "Methylparaben",
      "Benzophenone-3 (Oxybenzone)",
      "Polyfluoroalkyl Polymer",
      "Citric Acid"
    ],
    notices: [
      { type: "recall", status: "past", date: "2022-07-15", title: "Batch recall due to contamination risk", source: "https://example.org/recall-hydrashine-2022" }
    ],
    lawsuits: [
      { status: "settled", date: "2023-03-09", title: "Labeling dispute re: 'natural' claim", source: "https://example.org/case-23-0399" }
    ]
  },
  {
    upc: "036000291452",
    name: "Daily Calm Face Moisturizer SPF 30",
    brand: "Everdew",
    category: "Skin Care",
    ingredients: [
      "Aqua (Water)", "Glycerin", "Homosalate", "Octisalate", "Avobenzone",
      "Oxybenzone", "Butylated Hydroxytoluene (BHT)", "Dimethicone",
      "Phenoxyethanol", "Carbomer"
    ],
    notices: [{ type: "notice", status: "current", date: "2025-06-11", title: "Sunscreen actives labeling update", source: "https://example.org/notice-spf-labeling" }],
    lawsuits: []
  },
  {
    upc: "490000567890",
    name: "SilkGuard Heat Serum",
    brand: "ThermaLux",
    category: "Hair Styling",
    ingredients: ["Cyclopentasiloxane", "Dimethiconol", "Quaternium-15", "Fragrance", "Linalool", "Limonene"],
    notices: [],
    lawsuits: [{ status: "filed", date: "2024-10-21", title: "Formaldehyde-releaser allegation", source: "https://example.org/case-24-1031" }]
  },
  {
    upc: "9501101530003",
    name: "PureBloom Night Cream (Pregnancy Safe)",
    brand: "Bloomery",
    category: "Skin Care",
    ingredients: ["Aqua (Water)", "Squalane", "Shea Butter", "Niacinamide", "Hyaluronic Acid", "Panthenol", "Allantoin"],
    notices: [],
    lawsuits: []
  }
];

const PRODUCTS_KEY = 'inci_products';

function loadProducts() {
  try {
    const raw = localStorage.getItem(PRODUCTS_KEY);
    if (!raw) return [...DEFAULT_DB];
    const saved = JSON.parse(raw);
    // Merge saved over defaults (by UPC)
    const map = new Map(DEFAULT_DB.map(p => [String(p.upc), p]));
    for (const p of saved) map.set(String(p.upc), p);
    return Array.from(map.values());
  } catch {
    return [...DEFAULT_DB];
  }
}

function persistProducts(dbArray) {
  localStorage.setItem(PRODUCTS_KEY, JSON.stringify(dbArray));
}

let PRODUCT_DB = loadProducts();

// Log the number of products loaded in the dataset
function showDatasetCount() {
  console.log(`INCI-Safe: ${PRODUCT_DB.length} products loaded`);
}
showDatasetCount();

/***********************
 * Rules (same as before)
 ***********************/
const DEFAULT_RULES = [
  { label: "Parabens", regex: /paraben\b/i, level: "warn", info: "Preservatives; some prefer to avoid." },
  { label: "Phthalates", regex: /phthalate/i, level: "bad", info: "Plasticizers; often avoided in cosmetics." },
  { label: "Formaldehyde releasers", regex: /quaternium-15|DMDM hydantoin|imidazolidinyl urea|diazolidinyl urea/i, level: "bad", info: "May release formaldehyde." },
  { label: "Triclosan", regex: /triclosan/i, level: "warn", info: "Antibacterial agent; restricted in some regions." },
  { label: "Oxybenzone", regex: /oxybenzone|benzophenone-3/i, level: "warn", info: "UV filter; some users avoid." },
  { label: "Retinoids", regex: /retinol|retinal|retinyl/i, level: "warn", info: "Often avoided during pregnancy." },
  { label: "PFAS / Fluorinated", regex: /PFAS|perfluoro|polyfluoro|PTFE/i, level: "bad", info: "‘Forever chemicals’ class." },
  { label: "Fragrance (unspecified)", regex: /\bfragrance\b|\bparfum\b/i, level: "warn", info: "Catch-all; sensitivity for some." },
  { label: "BHT/BHA", regex: /\bBHT\b|\bbutylated hydroxyanisole\b/i, level: "warn", info: "Antioxidants some users avoid." }
];

const $ = (sel) => document.querySelector(sel);
const resultEl = $('#result');
const historyEl = $('#history');
const rulesEl = $('#rules');
const viewportEl = $('#scannerViewport');
const importSummaryEl = $('#importSummary');

/***********************
 * Rules & History state
 ***********************/
function getRules() {
  const saved = localStorage.getItem('inci_rules');
  if (!saved) return DEFAULT_RULES;
  try {
    const raw = JSON.parse(saved);
    return raw.map(r => ({ label: r.label, regex: new RegExp(r.pattern, 'i'), level: r.level, info: r.info }));
  } catch {
    return DEFAULT_RULES;
  }
}

function persistRules(rules) {
  const payload = rules.map(r => ({ label: r.label, pattern: r.regex.source, level: r.level, info: r.info }));
  localStorage.setItem('inci_rules', JSON.stringify(payload));
}

function saveHistory(item) {
  const h = JSON.parse(localStorage.getItem('inci_history') || '[]');
  const now = new Date().toISOString();
  const entry = { time: now, upc: item.upc, name: item.name, brand: item.brand };
  const dedup = [entry, ...h.filter(x => x.upc !== item.upc)].slice(0, 25);
  localStorage.setItem('inci_history', JSON.stringify(dedup));
  renderHistory();
}

function timeago(iso) {
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  const units = [["y", 31536000], ["mo", 2592000], ["d", 86400], ["h", 3600], ["m", 60]];
  for (const [u, s] of units) if (diff >= s) return Math.floor(diff / s) + u;
  return "just now";
}

/***********************
 * Lookup & Analysis
 ***********************/
function findProduct(code) {
  return PRODUCT_DB.find(p => String(p.upc) === String(code).trim());
}

function analyzeIngredients(ings, rules) {
  const flags = [];
  for (const ing of ings) {
    for (const rule of rules) {
      if (rule.regex.test(ing)) {
        flags.push({ ingredient: ing, label: rule.label, level: rule.level, info: rule.info });
      }
    }
  }
  const key = f => f.ingredient + "|" + f.label;
  return Array.from(new Map(flags.map(f => [key(f), f])).values());
}

function scoreFlags(flags) {
  const hasBad = flags.some(f => f.level === 'bad');
  const hasWarn = flags.some(f => f.level === 'warn');
  return hasBad ? { label: 'High', cls: 'bad' } : hasWarn ? { label: 'Moderate', cls: 'warn' } : { label: 'Low', cls: 'ok' };
}

/***********************
 * Renderers
 ***********************/
function renderProduct(p) {
  const rules = getRules();
  const flags = analyzeIngredients(p.ingredients || [], rules);
  const risk = scoreFlags(flags);
  const notices = (p.notices || []).sort((a, b) => b.date.localeCompare(a.date));
  const suits = (p.lawsuits || []).sort((a, b) => b.date.localeCompare(a.date));

  const ingChips = (p.ingredients || []).map(i => {
    const hit = flags.find(f => f.ingredient === i);
    const cls = hit ? `ing flag ${hit.level}` : 'ing';
    const title = hit ? `${hit.label}: ${hit.info}` : '';
    return `<span class="${cls}" title="${title}">${i}</span>`;
  }).join('');

  const flagsList = flags.length
    ? `<ul class="inline">${flags.map(f => `<li class="pill ${f.level}">${f.label} <small class="muted">(${f.ingredient})</small></li>`).join('')}</ul>`
    : `<div class="muted">No rule matches. This doesn’t guarantee safety — review the list above.</div>`;

  const noticesList = notices.length
    ? `<div class="list">${notices.map(n => `
        <div class="history-item">
          <div>
            <div><strong>${n.type?.toUpperCase?.() || 'NOTICE'}</strong> — ${n.title || ''}</div>
            <div class="muted">${n.status || ''} • ${n.date || ''}</div>
          </div>
          ${n.source ? `<a href="${n.source}" target="_blank" rel="noopener">Source ↗</a>` : ''}
        </div>`).join('')}</div>`
    : `<div class="muted">None found in local dataset.</div>`;

  const suitsList = suits.length
    ? `<div class="list">${suits.map(s => `
        <div class="history-item">
          <div>
            <div><strong>${(s.status || 'filed').toUpperCase()}</strong> — ${s.title || ''}</div>
            <div class="muted">${s.date || ''}</div>
          </div>
          ${s.source ? `<a href="${s.source}" target="_blank" rel="noopener">Details ↗</a>` : ''}
        </div>`).join('')}</div>`
    : `<div class="muted">None recorded in local dataset.</div>`;

  resultEl.innerHTML = `
    <div class="igh">
      <div>
        <div class="pill">UPC: ${p.upc}</div>
        <h2 style="margin:.4rem 0 0">${p.name || 'Unnamed product'}</h2>
        <div class="muted">${p.brand || '—'} • ${p.category || '—'}</div>
      </div>
      <div class="pill ${risk.cls}">Overall risk: <span class="score">${risk.label}</span></div>
    </div>

    <h3>Ingredients</h3>
    <div class="ing-grid">${ingChips || '<span class="muted">No ingredients provided.</span>'}</div>

    <h3 style="margin-top:16px">Flags</h3>
    ${flagsList}

    <h3 style="margin-top:16px">Recalls & Notices</h3>
    ${noticesList}

    <h3 style="margin-top:16px">Lawsuits</h3>
    ${suitsList}
  `;

  saveHistory(p);
}

function renderEmpty() {
  resultEl.innerHTML = `<div class="empty">Scan a barcode or enter a UPC/EAN above to begin.</div>`;
}

function renderHistory() {
  const h = JSON.parse(localStorage.getItem('inci_history') || '[]');
  historyEl.innerHTML = h.length
    ? h.map(item => `
        <div class="history-item">
          <div>
            <div><strong>${item.name}</strong></div>
            <div class="muted">${item.brand} • UPC ${item.upc} • ${timeago(item.time)}</div>
          </div>
          <button data-upc="${item.upc}" class="linklike">View</button>
        </div>`).join('')
    : `<div class="empty">No scans yet.</div>`;

  historyEl.querySelectorAll('button[data-upc]').forEach(b => {
    b.addEventListener('click', () => {
      const p = findProduct(b.dataset.upc);
      p ? renderProduct(p) : alert('Item not found in current dataset.');
    });
  });
}

function renderRules() {
  const rules = getRules();
  rulesEl.innerHTML = rules.map((r, idx) => `
    <div class="history-item">
      <div>
        <div><strong>${r.label}</strong> — <span class="muted">${r.regex.source}</span></div>
        <div class="muted">Level: ${r.level} • ${r.info}</div>
      </div>
      <button data-del="${idx}" class="linklike">Remove</button>
    </div>
  `).join('');
  rulesEl.querySelectorAll('button[data-del]').forEach(btn => {
    btn.addEventListener('click', () => {
      const current = getRules();
      current.splice(parseInt(btn.dataset.del, 10), 1);
      persistRules(current);
      renderRules();
    });
  });
}

/***********************
 * Import / Export
 ***********************/
$('#importBtn')?.addEventListener('click', () => $('#filePicker').click());
$('#filePicker')?.addEventListener('change', onFilePicked);
$('#exportBtn')?.addEventListener('click', exportProducts);

async function onFilePicked(e) {
  const file = e.target.files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    const isJSON = file.name.toLowerCase().endsWith('.json') || text.trim().startsWith('{') || text.trim().startsWith('[');
    const parsed = isJSON ? parseJSONProducts(text) : parseCSVProducts(text);

    const { added, updated } = mergeProducts(parsed);
    persistProducts(PRODUCT_DB);
    if (importSummaryEl) {
      importSummaryEl.textContent = `Imported ${parsed.length} item(s): ${added} added, ${updated} updated.`;
    } else {
      alert(`Imported ${parsed.length} item(s): ${added} added, ${updated} updated.`);
    }
  } catch (err) {
    console.error(err);
    if (importSummaryEl) importSummaryEl.textContent = `Import failed: ${err.message || err}`;
    else alert(`Import failed: ${err.message || err}`);
  } finally {
    // reset input so same file can be re-imported
    e.target.value = '';
  }
}

function parseJSONProducts(text) {
  const data = JSON.parse(text);
  if (!Array.isArray(data)) throw new Error('JSON must be an array of products.');
  return data.map(normalizeProduct);
}

/* CSV format (header required):
upc,name,brand,category,ingredients,notices_json,lawsuits_json
- ingredients: pipe- or semicolon-separated list (e.g. "Water|Glycerin|Fragrance")
- notices_json/lawsuits_json: optional JSON arrays (or leave blank)
*/
function parseCSVProducts(text) {
  const rows = csvToRows(text);
  if (rows.length === 0) throw new Error('CSV is empty.');
  const header = rows[0].map(h => h.trim().toLowerCase());
  const idx = (name) => header.indexOf(name);

  const required = ['upc', 'name'];
  for (const r of required) if (idx(r) === -1) throw new Error(`Missing required column: ${r}`);

  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.length === 0 || r.every(c => c.trim() === '')) continue;

    try {
      const prod = {
        upc: (r[idx('upc')] || '').trim(),
        name: (r[idx('name')] || '').trim(),
        brand: (r[idx('brand')] || '').trim(),
        category: (r[idx('category')] || '').trim(),
        ingredients: splitIngredients(r[idx('ingredients')]),
        notices: safeJSON(r[idx('notices_json')]) || [],
        lawsuits: safeJSON(r[idx('lawsuits_json')]) || []
      };
      if (!prod.upc || !prod.name) throw new Error('Missing UPC or name');
      out.push(normalizeProduct(prod));
    } catch (e) {
      console.warn(`CSV row ${i+1} skipped: ${e.message || e}`);
    }
  }
  return out;
}

function csvToRows(str) {
  // Minimal CSV parser that supports quotes and commas
  const rows = [];
  let row = [];
  let cur = '';
  let inQuotes = false;

  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    const next = str[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') { cur += '"'; i++; continue; }
      if (ch === '"') { inQuotes = false; continue; }
      cur += ch;
    } else {
      if (ch === '"') { inQuotes = true; continue; }
      if (ch === ',') { row.push(cur); cur = ''; continue; }
      if (ch === '\n' || ch === '\r') {
        // handle \r\n or \n
        if (ch === '\r' && next === '\n') i++;
        row.push(cur); rows.push(row); row = []; cur = '';
        continue;
      }
      cur += ch;
    }
  }
  // last cell
  if (cur.length > 0 || inQuotes || row.length) row.push(cur);
  if (row.length) rows.push(row);
  return rows;
}

function splitIngredients(val) {
  if (!val) return [];
  // allow either | or ; separators
  return String(val).split(/[|;]+/).map(s => s.trim()).filter(Boolean);
}

function safeJSON(maybe) {
  if (!maybe || String(maybe).trim() === '') return null;
  try { return JSON.parse(maybe); } catch { return null; }
}

function normalizeProduct(p) {
  // ensure shape + types
  return {
    upc: String(p.upc || '').trim(),
    name: String(p.name || '').trim(),
    brand: p.brand ? String(p.brand) : '',
    category: p.category ? String(p.category) : '',
    ingredients: Array.isArray(p.ingredients) ? p.ingredients : [],
    notices: Array.isArray(p.notices) ? p.notices : [],
    lawsuits: Array.isArray(p.lawsuits) ? p.lawsuits : []
  };
}

function mergeProducts(list) {
  let added = 0, updated = 0;
  const map = new Map(PRODUCT_DB.map(p => [String(p.upc), p]));
  for (const p of list) {
    if (!p.upc) continue;
    if (map.has(p.upc)) {
      map.set(p.upc, { ...map.get(p.upc), ...p }); // shallow merge; imported fields override
      updated++;
    } else {
      map.set(p.upc, p);
      added++;
    }
  }
  PRODUCT_DB = Array.from(map.values());
  return { added, updated };
}

function exportProducts() {
  const blob = new Blob([JSON.stringify(PRODUCT_DB, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `inci-products-${new Date().toISOString().slice(0,10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/***********************
 * Quagga (camera scan) — same as before
 ***********************/
let scanning = false;

function startScanner() {
  if (scanning) return;
  if (!window.Quagga) { alert("Quagga failed to load."); return; }
  scanning = true;

  Quagga.init({
    inputStream: {
      type: "LiveStream",
      target: viewportEl,
      constraints: { facingMode: "environment" }
    },
    decoder: { readers: ["upc_reader", "upc_e_reader", "ean_reader", "ean_8_reader"] },
    locate: true,
    numOfWorkers: navigator.hardwareConcurrency || 2
  }, (err) => {
    if (err) { console.error(err); alert("Camera init failed. Is camera allowed?"); scanning = false; return; }
    Quagga.start();
  });

  Quagga.onDetected(onDetected);
}

function stopScanner() {
  if (!scanning) return;
  Quagga.offDetected(onDetected);
  Quagga.stop();
  scanning = false;
}

let lastCode = "", lastTime = 0;
function onDetected(result) {
  const code = result?.codeResult?.code;
  const now = Date.now();
  if (!code || (code === lastCode && now - lastTime < 2000)) return;
  lastCode = code; lastTime = now;

  const p = findProduct(code);
  if (p) { renderProduct(p); stopScanner(); }
  else { resultEl.innerHTML = `<div class="empty">Scanned <strong>${code}</strong> — not found in current dataset.</div>`; }
}

/***********************
 * Wire up UI
 ***********************/
$('#startScan').addEventListener('click', startScanner);
$('#stopScan').addEventListener('click', stopScanner);
$('#lookup').addEventListener('click', () => {
  const code = $('#manualCode').value.trim();
  if (!code) return;
  const p = findProduct(code);
  p ? renderProduct(p) : (resultEl.innerHTML = `<div class="empty">UPC <strong>${code}</strong> not found in current dataset.</div>`);
});
$('#clearHistory').addEventListener('click', () => {
  localStorage.removeItem('inci_history');
  renderHistory();
});

// Reset product database to defaults when clearProducts button is clicked
$('#clearProducts').addEventListener('click', () => {
  if (!confirm('Reset product database to defaults? This clears imported items.')) return;
  localStorage.removeItem('inci_products');
  PRODUCT_DB = [...DEFAULT_DB];
  alert('Product database reset.');
});

// Allow Enter key to trigger lookup from manualCode input
$('#manualCode').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('#lookup').click();
});

$('#addRule').addEventListener('click', () => {
  const txt = $('#newRule').value.trim();
  if (!txt) return;
  const current = getRules();
  current.push({ label: txt, regex: new RegExp(txt, 'i'), level: "warn", info: "Custom rule" });
  persistRules(current);
  $('#newRule').value = '';
  renderRules();
});

/***********************
 * Boot
 ***********************/
renderEmpty();
renderHistory();
renderRules();
// Note: Quagga is loaded via <script> in index.html

// Preload seed products from data/seed-products.json if local storage is empty
(async function bootstrapSeedOnce() {
  if (!localStorage.getItem('inci_products')) {
    try {
      const res = await fetch('data/seed-products.json');
      if (res.ok) {
        const list = await res.json();
        const { added } = mergeProducts(list);
        persistProducts(PRODUCT_DB);
        importSummaryEl && (importSummaryEl.textContent = `Preloaded ${added} seed items.`);
        console.log(`Seed preload: ${added} items`);
      }
    } catch {}
  }
})();