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
const glossPanelEl = document.querySelector('#glossaryPanel');
const glossSearchEl = document.querySelector('#glossSearch');
const glossClearEl  = document.querySelector('#glossClear');

let GLOSSARY = {}; // loaded from data/glossary.json

// ----- Tooltip plumbing -----
const tooltipEl = document.createElement('div');
tooltipEl.className = 'tooltip';
document.body.appendChild(tooltipEl);

function tooltipShow(html, x, y) {
  tooltipEl.innerHTML = html;
  tooltipEl.style.left = Math.min(x + 14, window.innerWidth - 340) + 'px';
  tooltipEl.style.top  = Math.min(y + 14, window.innerHeight - 120) + 'px';
  tooltipEl.style.display = 'block';
}
function tooltipHide() { tooltipEl.style.display = 'none'; }

function glossaryPreview(term) {
  const entry = findGlossaryEntry(term);
  if (!entry) return null;
  const concerns = entry.concerns ? `<div class="t-muted"><strong>Concerns:</strong> ${entry.concerns}</div>` : '';
  const uses = entry.commonUses ? `<div class="t-muted"><strong>Uses:</strong> ${entry.commonUses}</div>` : '';
  return `<div class="t-head">${entry.name}</div>
          <div>${entry.definition || ''}</div>
          ${uses}${concerns}`;
}

// Build a set of glossary names/aliases flagged as "isActive"
function buildActiveSet() {
  const set = new Set();
  for (const [name, entry] of Object.entries(GLOSSARY || {})) {
    if (entry && entry.isActive) {
      set.add(name.toLowerCase());
      (entry.aliases || []).forEach(a => set.add(String(a).toLowerCase()));
    }
  }
  // Fallback list in case glossary hasn't loaded yet or is missing entries
  ['zinc oxide','titanium dioxide','avobenzone','oxybenzone','octocrylene','homosalate',
   'retinol','retinyl','retinal','niacinamide','salicylic acid','benzoyl peroxide','ascorbic acid','vitamin c']
   .forEach(x => set.add(x));
  return set;
}

function splitByActives(ingredients) {
  const ACTIVE_SET = buildActiveSet();
  const actives = [];
  const others  = [];
  for (const ing of (ingredients || [])) {
    const key = String(ing).toLowerCase().trim();
    // match exact or prefix like "Retinyl Palmitate" when base active is "Retinyl"
    const isActive = ACTIVE_SET.has(key) || [...ACTIVE_SET].some(a => key.startsWith(a + ' '));
    (isActive ? actives : others).push(ing);
  }
  return { actives, others };
}

// Reuse your existing chip builder logic for any list
function renderIngredientChips(list, flags) {
  return (list || []).map(i => {
    const hit = flags.find(f => f.ingredient === i);
    const cls = hit ? `ing flag ${hit.level}` : 'ing';
    const title = hit ? `${hit.label}: ${hit.info}` : '';
    return `<span class="${cls}" title="${title}">${i}</span>`;
  }).join('');
}

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

// Simple scoring / message generator
function generateConclusion(flags, product) {
  if (!flags.length) {
    return `✅ "${product.name}" has no flagged ingredients in your current rules. It looks safe to use.`;
  }

  const hasBad = flags.some(f => f.level === 'bad');
  const hasWarn = flags.some(f => f.level === 'warn');

  if (hasBad) {
    return `⚠️ "${product.name}" contains ingredients of high concern. Use with caution or consider alternatives.`;
  }

  if (hasWarn) {
    return `ℹ️ "${product.name}" contains some ingredients that people prefer to avoid (e.g., ${flags.map(f => f.label).join(', ')}). Otherwise, it looks acceptable for most users.`;
  }

  return `ℹ️ "${product.name}" has only low-level concerns. Overall, it appears reasonably safe.`;
}

/***********************
 * Renderers
 ***********************/
function renderProduct(p) {
  const rules = getRules();
  const flags = analyzeIngredients(p.ingredients || [], rules);
  const risk = scoreFlags(flags);
  const { actives, others } = splitByActives(p.ingredients || []);
  const activeChips = renderIngredientChips(actives, flags);
  const otherChips  = renderIngredientChips(others,  flags);
  const notices = (p.notices || []).sort((a, b) => b.date.localeCompare(a.date));
  
  let ingredientsHtml = '';
  if (actives.length) {
    ingredientsHtml += `
      <h3>Active ingredients</h3>
      <div class="ing-grid">${activeChips}</div>
    `;
  }
  ingredientsHtml += `
    <h3 style="margin-top:16px">${actives.length ? 'Other ingredients' : 'Ingredients'}</h3>
    <div class="ing-grid">${otherChips || '<span class="muted">No ingredients provided.</span>'}</div>
  `;
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

  const noticesCount = notices.length;
  const suitsCount   = suits.length;

  const noticesBlock = `
  <details ${noticesCount ? 'open' : ''} class="coll">
    <summary><strong>Recalls & Notices</strong> ${noticesCount ? `(${noticesCount})` : ''}</summary>
    ${noticesCount
      ? `<div class="list">${notices.map(n=>`
          <div class="history-item">
            <div>
              <div><strong>${(n.type||'NOTICE').toUpperCase()}</strong> — ${n.title||''}</div>
              <div class="muted">${n.status||''} • ${n.date||''}</div>
            </div>
            ${n.source?`<a href="${n.source}" target="_blank" rel="noopener">Source ↗</a>`:''}
          </div>`).join('')}</div>`
      : `<div class="muted">None found in local dataset.</div>`
    }
  </details>`;

  const suitsBlock = `
  <details ${suitsCount ? '' : ''} class="coll">
    <summary><strong>Lawsuits</strong> ${suitsCount ? `(${suitsCount})` : ''}</summary>
    ${suitsCount
      ? `<div class="list">${suits.map(s=>`
          <div class="history-item">
            <div>
              <div><strong>${(s.status||'FILED').toUpperCase()}</strong> — ${s.title||''}</div>
              <div class="muted">${s.date||''}</div>
            </div>
            ${s.source?`<a href="${s.source}" target="_blank" rel="noopener">Details ↗</a>`:''}
          </div>`).join('')}</div>`
      : `<div class="muted">None recorded in local dataset.</div>`
    }
  </details>`;

  const conclusion = generateConclusion(flags, p);

resultEl.innerHTML = `
  <div class="risk-banner ${risk.cls}">
    <div class="rb-left">
      <div class="pill">UPC: ${p.upc}</div>
      <h2>${p.name || 'Unnamed product'}</h2>
      <div class="meta">${p.brand || '—'} • ${p.category || '—'}</div>
      <div style="margin-top:8px">${conclusion}</div>
    </div>

    ${p.image ? `
      <div class="prod-img">
        <img src="${p.image}" alt="${p.name}" loading="lazy"
             onerror="this.parentNode.innerHTML='<div class=\\'muted\\'>Image unavailable</div>'">
      </div>` : ''}

    <div class="risk-chip ${risk.cls}">
      <span>Overall risk:</span> <span class="score">${risk.label}</span>
    </div>
  </div>

  ${ingredientsHtml}

  <h3 style="margin-top:16px">Flags</h3>
  ${flagsList}

  ${noticesBlock}
  ${suitsBlock}
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
  
  // Normalize data button (UI): call quickNormalize
  document.querySelector('#normalizeData')?.addEventListener('click', quickNormalize);
}

/***********************
 * Import / Export
 ***********************/
$('#importBtn')?.addEventListener('click', () => $('#filePicker').click());
$('#filePicker')?.addEventListener('change', onFilePicked);
$('#exportBtn')?.addEventListener('click', exportProducts);

// Click any ingredient chip to open glossary
resultEl.addEventListener('click', (e) => {
  const chip = e.target.closest('.ing');
  if (!chip) return;
  const term = chip.textContent.trim();
  const entry = findGlossaryEntry(term);
  renderGlossaryEntry(entry, term);
});

// Click any flag pill to open glossary (look up by label)
resultEl.addEventListener('click', (e) => {
  const pill = e.target.closest('.pill');
  if (!pill) return;
  const maybeTerm = pill.textContent.split('(')[0].trim(); // crude extract of label
  const entry = findGlossaryEntry(maybeTerm);
  if (entry) renderGlossaryEntry(entry, maybeTerm);
});

// Search box for manual lookups
glossSearchEl?.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  const q = glossSearchEl.value.trim();
  renderGlossaryEntry(findGlossaryEntry(q), q);
});

glossClearEl?.addEventListener('click', () => {
  glossSearchEl.value = '';
  glossPanelEl.innerHTML = '';
});

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
        image: (r[idx('image')] || '').trim(),
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
    image: p.image ? String(p.image).trim() : '',
    category: p.category ? String(p.category) : '',
    ingredients: Array.isArray(p.ingredients) ? p.ingredients : [],
    notices: Array.isArray(p.notices) ? p.notices : [],
    lawsuits: Array.isArray(p.lawsuits) ? p.lawsuits : []
  };
}

// Data health helpers
function healthCheck(products) {
  const report = {
    total: products.length,
    missingUPC: [],
    missingName: [],
    dupUPCs: [],
    catCounts: {},
  };

  // category counts & basic missing fields
  const seen = new Map();
  for (const p of products) {
    const upc = String(p.upc || '').trim();
    const name = String(p.name || '').trim();
    const cat = (p.category || '').trim() || '—';

    report.catCounts[cat] = (report.catCounts[cat] || 0) + 1;

    if (!upc) report.missingUPC.push(p);
    if (!name) report.missingName.push(p);

    if (upc) {
      if (seen.has(upc)) seen.get(upc).push(p);
      else seen.set(upc, [p]);
    }
  }
  // duplicates
  for (const [k, arr] of seen.entries()) {
    if (arr.length > 1) report.dupUPCs.push({ upc: k, count: arr.length });
  }
  return report;
}

function renderHealthReport(report) {
  const host = document.querySelector('#dataReport');
  if (!host) return;

  const cats = Object.entries(report.catCounts)
    .sort((a,b)=>b[1]-a[1])
    .map(([c,n]) => `<li>${c}: <strong>${n}</strong></li>`).join('');

  const dups = report.dupUPCs.length
    ? `<ul>${report.dupUPCs.map(d=>`<li>UPC <code>${d.upc}</code> appears ${d.count} times</li>`).join('')}</ul>`
    : `<div>No duplicate UPCs found.</div>`;

  const miss = (arr,label) => arr.length
    ? `<div class="bad">• ${label}: ${arr.length}</div>`
    : `<div class="ok">• ${label}: 0</div>`;

  host.innerHTML = `
    <div class="history-item" style="align-items:flex-start">
      <div>
        <div><strong>Data Health</strong></div>
        <div class="muted">Products total: <strong>${report.total}</strong></div>
        ${miss(report.missingUPC, 'Missing UPC')}
        ${miss(report.missingName, 'Missing name')}
        <div style="margin-top:8px"><strong>Duplicates</strong></div>
        ${dups}
        <div style="margin-top:8px"><strong>Categories</strong></div>
        <ul>${cats || '<li>None</li>'}</ul>
      </div>
    </div>
  `;
}

// Normalize a few common ingredient aliases
const ING_CANON = {
  'parfum': 'Fragrance',
  'parfume': 'Fragrance',
  'fragrance (parfum)': 'Fragrance',
  'oxybenzone': 'Benzophenone-3 (Oxybenzone)'
};

function canonicalizeIngredients(products) {
  for (const p of products) {
    if (!Array.isArray(p.ingredients)) continue;
    p.ingredients = p.ingredients.map(i => {
      const key = String(i).trim().toLowerCase();
      return ING_CANON[key] || i;
    });
  }
}

// Keep categories tidy (map variants into a small set)
const CAT_CANON = {
  'hair': 'Hair Care',
  'haircare': 'Hair Care',
  'hair styling': 'Hair Styling',
  'skin': 'Skin Care',
  'skincare': 'Skin Care',
  'body': 'Body Care',
  'sun': 'Sunscreen'
};
function canonicalizeCategories(products) {
  for (const p of products) {
    if (!p.category) continue;
    const k = String(p.category).trim().toLowerCase();
    if (CAT_CANON[k]) p.category = CAT_CANON[k];
  }
}

// One-click cleaner
function quickNormalize() {
  canonicalizeIngredients(PRODUCT_DB);
  canonicalizeCategories(PRODUCT_DB);
  persistProducts(PRODUCT_DB);
  alert('Normalization done. Data saved.');
}

// Glossary loader and lookup helpers
async function loadGlossary() {
  try {
    const res = await fetch('data/glossary.json');
    if (res.ok) GLOSSARY = await res.json();
  } catch (e) { console.warn('Glossary load failed', e); }
}

function normalizeKey(s) {
  return String(s).trim().toLowerCase();
}

function findGlossaryEntry(term) {
  if (!term) return null;
  const t = normalizeKey(term);

  // Direct key match
  for (const key of Object.keys(GLOSSARY)) {
    if (normalizeKey(key) === t) return { name: key, ...GLOSSARY[key] };
  }
  // Alias match
  for (const key of Object.keys(GLOSSARY)) {
    const aliases = (GLOSSARY[key].aliases || []).map(normalizeKey);
    if (aliases.includes(t)) return { name: key, ...GLOSSARY[key] };
  }
  return null;
}

function renderGlossaryEntry(entry, query) {
  if (!glossPanelEl) return;
  if (!entry) {
    glossPanelEl.innerHTML = `
      <div class="history-item"><div>
        <div><strong>No glossary entry</strong>${query ? ` for “${query}”` : ''}</div>
        <div class="muted">Try another term, or add it to <code>data/glossary.json</code>.</div>
      </div></div>`;
    return;
  }

  const srcLinks = (entry.sources || []).map(u => `<a href="${u}" target="_blank" rel="noopener">Source ↗</a>`).join(' • ') || '<span class="muted">—</span>';

  glossPanelEl.innerHTML = `
    <div class="history-item" style="align-items:flex-start">
      <div>
        <div><strong>${entry.name}</strong>${entry.aliases && entry.aliases.length ? ` <span class="muted">(${entry.aliases.join(', ')})</span>` : ''}</div>
        <div style="margin-top:6px">${entry.definition || ''}</div>
        <div class="muted" style="margin-top:6px"><strong>Common uses:</strong> ${entry.commonUses || '—'}</div>
        <div class="warn" style="margin-top:6px"><strong>Concerns:</strong> ${entry.concerns || '—'}</div>
        <div style="margin-top:6px">${srcLinks}</div>
      </div>
    </div>
  `;
}

function showQuickAdd(upc) {
  resultEl.innerHTML = `
    <div class="card">
      <h3 style="margin:0 0 8px">Add product</h3>
      <div class="muted" style="margin-bottom:8px">UPC <strong>${upc}</strong> was not found. Add it below:</div>
      <div class="list" style="gap:8px">
        <input id="qa_name" type="text" placeholder="Name (required)" />
        <input id="qa_brand" type="text" placeholder="Brand" />
        <input id="qa_cat" type="text" placeholder="Category (e.g., Hair Care)" />
        <input id="qa_img" type="text" placeholder="Image URL (optional)" />
        <textarea id="qa_ings" rows="3" placeholder="Ingredients (separate with | or ;)"></textarea>
        <div class="row">
          <button id="qa_save" class="primary">💾 Save</button>
          <button id="qa_cancel" class="linklike">Cancel</button>
        </div>
        <div class="footnote muted">Tip: you can paste a long list; we’ll split on “|” or “;”.</div>
      </div>
    </div>
  `;

  document.querySelector('#qa_cancel').addEventListener('click', renderEmpty);
  document.querySelector('#qa_save').addEventListener('click', () => {
    const p = {
      upc: String(upc).trim(),
      name: document.querySelector('#qa_name').value.trim(),
      brand: document.querySelector('#qa_brand').value.trim(),
      category: document.querySelector('#qa_cat').value.trim(),
      image: document.querySelector('#qa_img').value.trim(),
      ingredients: splitIngredients(document.querySelector('#qa_ings').value)
    };
    if (!p.name) { alert('Name is required.'); return; }
    const { added, updated } = mergeProducts([p]);
    persistProducts(PRODUCT_DB);
    alert(added ? 'Product added.' : updated ? 'Product updated.' : 'Saved.');
    renderProduct(findProduct(upc));
  });
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
 * Quagga (camera scan) 
 ***********************/
let scanning = false;
let onDetectedBound = false;

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
    // 🔧 force inline playback attributes for iOS Safari
    const vid = document.querySelector('#scannerViewport video');
  if (vid) {
    vid.setAttribute('playsinline', '');
    vid.setAttribute('webkit-playsinline', '');
    vid.setAttribute('muted', '');  // also important for autoplay
  }

  });
  

  if (!onDetectedBound) { Quagga.onDetected(onDetected); onDetectedBound = true; }
}

function stopScanner() {
  if (!scanning) return;
  Quagga.offDetected(onDetected);
  Quagga.stop();
  scanning = false;
  onDetectedBound = false;
}

let lastCode = "", lastTime = 0;
function onDetected(result) {
  const code = result?.codeResult?.code;
  const now = Date.now();
  if (!code || (code === lastCode && now - lastTime < 2000)) return;
  lastCode = code; lastTime = now;

  const p = findProduct(code);
  if (p) { renderProduct(p); stopScanner(); }
  else { 
    showQuickAdd(code);
    stopScanner(); 
  }
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
  p ? renderProduct(p) : showQuickAdd(code);
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

// Tabs
document.querySelectorAll('.tabs .tab').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    const target = btn.dataset.tab;
    document.querySelectorAll('.tabs .tab').forEach(b=>b.classList.remove('active'));
    document.querySelectorAll('.tabpane').forEach(p=>p.classList.remove('active'));
    btn.classList.add('active');
    const pane = document.querySelector(`#tab-${target}`);
    if (pane) pane.classList.add('active');
  });
});

// Tooltip hover listeners (attach once)
if (!window.__inci_tooltip_listeners_attached) {
  resultEl.addEventListener('mousemove', (e) => {
    const chip = e.target.closest('.ing, .pill');
    if (!chip) { tooltipHide(); return; }

    let term = chip.textContent.trim();
    term = term.replace(/\(.+?\)/, '').replace(/—.*/, '').trim();

    const html = glossaryPreview(term);
    if (!html) { tooltipHide(); return; }

    tooltipShow(html, e.clientX, e.clientY);
  });

  resultEl.addEventListener('mouseleave', tooltipHide);
  window.__inci_tooltip_listeners_attached = true;
}

$('#addRule').addEventListener('click', () => {
  const txt = $('#newRule').value.trim();
  if (!txt) return;
  const current = getRules();
  current.push({ label: txt, regex: new RegExp(txt, 'i'), level: "warn", info: "Custom rule" });
  persistRules(current);
  $('#newRule').value = '';
  renderRules();
});

// Validate data button: show data health report
document.querySelector('#validateData')?.addEventListener('click', () => {
  try {
    const r = healthCheck(PRODUCT_DB);
    renderHealthReport(r);
    console.log('Health report:', r);
  } catch (err) {
    console.error('Health check failed', err);
  }
});

/***********************
 * Boot
 ***********************/
renderEmpty();
renderHistory();
renderRules();
loadGlossary();
// Note: Quagga is loaded via <script> in index.html

(async function loadProductsFromFile() {
  // If you want to always load from file, remove the localStorage guard below.
  if (!localStorage.getItem('inci_products')) {
    try {
      const res = await fetch('data/products.json');
      if (res.ok) {
        const list = await res.json();
        const { added, updated } = mergeProducts(list);
        persistProducts(PRODUCT_DB);
        console.log(`Loaded products.json → added ${added}, updated ${updated}`);
      }
    } catch (e) {
      console.warn('Could not load data/products.json', e);
    }
  }
  showDatasetCount();
})();