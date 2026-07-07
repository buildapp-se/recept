'use strict';

// ---------- rena funktioner (testas i test.js) ----------
const CATS = ['grönt', 'kött', 'mejeri', 'skafferi', 'fryst', 'övrigt'];
const CAT_LABELS = { 'grönt': 'Grönt', 'kött': 'Kött & chark', 'mejeri': 'Mejeri', 'skafferi': 'Skafferi', 'fryst': 'Fryst', 'övrigt': 'Övrigt' };

function keyOf(name) { return name.toLowerCase().trim(); }

// Summerar valda recept (skalade till valda portioner) till inköpsrader.
function aggregate(recipes, selections) {
  const byId = Object.fromEntries(recipes.map(r => [r.id, r]));
  const items = new Map();
  for (const sel of selections) {
    const r = byId[sel.id];
    if (!r) continue;
    const f = sel.portions / r.portions;
    for (const ing of r.ingredients) {
      if (ing.skipList) continue;
      const k = keyOf(ing.name);
      let it = items.get(k);
      if (!it) {
        it = { key: k, name: ing.name, cat: CATS.includes(ing.cat) ? ing.cat : 'övrigt', amount: 0, unit: null, count: 0, countUnit: null, toTaste: false, sources: [] };
        items.set(k, it);
      }
      if (ing.amount != null) {
        it.amount += ing.amount * f;
        if (!it.unit) it.unit = ing.unit || 'g';
        if (ing.count) { it.count += ing.count * f; if (!it.countUnit) it.countUnit = ing.countUnit || 'st'; }
      } else if (ing.toTaste) {
        it.toTaste = true;
      }
      it.sources.push({ title: r.title, amount: ing.amount != null ? ing.amount * f : null, unit: ing.unit || null });
    }
  }
  return [...items.values()];
}

// Svenskt talformat: decimalkomma, mellanslag som tusentalsavgränsare.
function fmtNum(n) {
  const r = n >= 100 ? Math.round(n / 5) * 5 : n >= 10 ? Math.round(n) : Math.round(n * 10) / 10;
  const [int, dec] = String(r).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return dec ? grouped + ',' + dec : grouped;
}

function fmtCount(n) { return fmtNum(Math.round(n * 2) / 2); }

function fmtItem(it) {
  if (it.amount > 0) {
    let s = fmtNum(it.amount) + ' ' + it.unit;
    if (it.count > 0) s += ' (~' + fmtCount(it.count) + ' ' + (it.countUnit || 'st') + ')';
    if (it.toTaste) s += ' + efter smak';
    return s;
  }
  return 'efter smak';
}

function fmtIngredient(ing, f) {
  if (ing.amount == null) return 'efter smak';
  let s = fmtNum(ing.amount * f) + ' ' + (ing.unit || 'g');
  if (ing.count) s += ' (~' + fmtCount(ing.count * f) + ' ' + (ing.countUnit || 'st') + ')';
  return s;
}

function slugify(title, taken) {
  let base = title.toLowerCase().replace(/[åä]/g, 'a').replace(/ö/g, 'o').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'recept';
  let id = base, i = 2;
  while (taken.includes(id)) id = base + '-' + i++;
  return id;
}

function safeUrl(value) {
  const s = typeof value === 'string' ? value.trim() : '';
  if (!s) return '';
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : '';
  } catch (e) {
    return '';
  }
}

function normalizeState(raw) {
  const s = raw && typeof raw === 'object' && raw.state && typeof raw.state === 'object' ? raw.state : raw;
  if (!s || typeof s !== 'object') throw new Error('Backupen innehåller ingen giltig state.');
  if (!Array.isArray(s.recipes)) throw new Error('Backupen saknar receptlista.');

  const taken = [];
  const recipes = s.recipes.map(r => {
    if (!r || typeof r !== 'object') throw new Error('Backupen innehåller ett trasigt recept.');
    const title = typeof r.title === 'string' && r.title.trim() ? r.title.trim() : '';
    if (!title) throw new Error('Ett recept i backupen saknar namn.');
    if (!Array.isArray(r.ingredients) || !r.ingredients.length) throw new Error('Receptet "' + title + '" saknar ingredienser.');
    const idBase = typeof r.id === 'string' && r.id.trim() ? slugify(r.id, []) : slugify(title, []);
    const id = taken.includes(idBase) ? slugify(idBase, taken) : idBase;
    taken.push(id);
    return {
      id,
      title,
      portions: typeof r.portions === 'number' && r.portions >= 1 ? Math.round(r.portions) : 4,
      source: safeUrl(r.source),
      ingredients: r.ingredients.map(x => {
        if (!x || typeof x !== 'object' || typeof x.name !== 'string' || !x.name.trim()) throw new Error('En ingrediens i "' + title + '" saknar namn.');
        const ing = { name: x.name.trim(), cat: CATS.includes(x.cat) ? x.cat : 'övrigt' };
        if (typeof x.amount === 'number' && x.amount > 0) { ing.amount = x.amount; ing.unit = x.unit === 'ml' ? 'ml' : 'g'; }
        else ing.toTaste = true;
        if (typeof x.count === 'number' && x.count > 0) { ing.count = x.count; ing.countUnit = typeof x.countUnit === 'string' && x.countUnit.trim() ? x.countUnit.trim() : 'st'; }
        if (x.skipList === true) ing.skipList = true;
        if (typeof x.group === 'string' && x.group.trim()) ing.group = x.group.trim();
        return ing;
      }),
      steps: Array.isArray(r.steps) ? r.steps.filter(x => typeof x === 'string' && x.trim()).map(x => x.trim()) : [],
    };
  });

  return {
    recipes,
    selections: Array.isArray(s.selections) ? s.selections.map(x => ({ id: String(x.id || ''), portions: Math.max(1, Math.round(Number(x.portions) || 1)) })).filter(x => recipes.some(r => r.id === x.id)) : [],
    extras: Array.isArray(s.extras) ? s.extras.map(x => ({ id: x.id != null ? x.id : Date.now(), text: String(x.text || '').trim().slice(0, 80) })).filter(x => x.text) : [],
    checked: Array.isArray(s.checked) ? s.checked.map(String) : [],
  };
}

function makeBackup(state) {
  return { app: 'grammat', version: 1, exportedAt: new Date().toISOString(), state: normalizeState(state) };
}

// Tolkar och normaliserar JSON som en AI-modell producerat med importprompten.
function parseImport(text, takenIds) {
  let t = String(text).trim().replace(/^```[a-z]*\s*/i, '').replace(/```\s*$/, '');
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a === -1 || b <= a) throw new Error('Hittar ingen JSON i det inklistrade. Klistra in hela svaret från AI-modellen.');
  let d;
  try { d = JSON.parse(t.slice(a, b + 1)); } catch (e) { throw new Error('Trasig JSON: ' + e.message); }
  if (typeof d.title !== 'string' || !d.title.trim()) throw new Error('Fältet "title" saknas.');
  if (!Array.isArray(d.ingredients) || !d.ingredients.length) throw new Error('Fältet "ingredients" saknas eller är tomt.');
  const ingredients = d.ingredients.map(x => {
    if (!x || typeof x.name !== 'string' || !x.name.trim()) throw new Error('En ingrediens saknar namn.');
    const ing = { name: x.name.trim(), cat: CATS.includes(x.cat) ? x.cat : 'övrigt' };
    if (typeof x.amount === 'number' && x.amount > 0) { ing.amount = x.amount; ing.unit = x.unit === 'ml' ? 'ml' : 'g'; }
    else ing.toTaste = true;
    if (typeof x.count === 'number' && x.count > 0) { ing.count = x.count; ing.countUnit = typeof x.countUnit === 'string' && x.countUnit.trim() ? x.countUnit.trim() : 'st'; }
    if (x.skipList === true) ing.skipList = true;
    if (typeof x.group === 'string' && x.group.trim()) ing.group = x.group.trim();
    return ing;
  });
  return {
    id: slugify(d.title, takenIds),
    title: d.title.trim(),
    portions: typeof d.portions === 'number' && d.portions >= 1 ? Math.round(d.portions) : 4,
    source: safeUrl(d.source),
    ingredients,
    steps: Array.isArray(d.steps) ? d.steps.filter(s => typeof s === 'string' && s.trim()).map(s => s.trim()) : [],
  };
}

const AI_PROMPT = `Du får ett recept nedan. Gör om det till JSON enligt exakt detta format och svara med ENBART JSON, utan kodstaket och utan förklaringar.

{
  "title": "Receptets namn",
  "portions": 4,
  "source": "",
  "ingredients": [
    { "name": "gul lök", "amount": 220, "unit": "g", "count": 2, "countUnit": "st", "cat": "grönt" },
    { "name": "olivolja", "amount": 30, "unit": "ml", "cat": "skafferi" },
    { "name": "salt", "toTaste": true, "cat": "skafferi" },
    { "name": "vatten", "amount": 200, "unit": "ml", "skipList": true, "cat": "övrigt" }
  ],
  "steps": ["Första steget.", "Andra steget."]
}

Regler:
- Alla mängder i gram ("unit": "g") eller milliliter ("unit": "ml"). Konvertera: 1 msk = 15 ml, 1 tsk = 5 ml, 1 krm = 1 ml, 1 dl = 100 ml.
- Styckvaror: räkna om till gram med normalvikter (gul lök 110 g/st, morot 120 g/st, tomat 120 g/st, vitlök 5 g/klyfta, lime 65 g/st, potatis 100 g/st) och ange dessutom "count" (ungefärligt antal) och "countUnit" ("st", "klyftor", "burk", "förp", "bunt").
- Torrvaror per dl: vetemjöl 60 g, socker 85 g, ris 85 g, havregryn 35 g, riven ost 40 g, linser 85 g. Smör: 1 msk = 15 g.
- Kryddor eller annat utan angiven mängd ("efter smak", "till servering"): utelämna "amount" och sätt "toTaste": true.
- Vatten och annat man inte köper i butiken: behåll mängden men sätt "skipList": true.
- "cat" måste vara exakt en av: "grönt", "kött", "mejeri", "skafferi", "fryst", "övrigt".
- "portions": antalet portioner receptet gäller. Framgår det inte, uppskatta.
- Har receptet delar (t.ex. sås, garnering): sätt "group": "Sås" osv. på de ingrediensernas rader.
- "steps": tillagningsstegen som en lista med strängar, ett steg per element. Saknas steg: tom lista.
- Ingrediensnamn: gemener, korta och butiksvänliga ("gul lök", inte "finhackad stor gul lök"). Samma vara ska heta samma sak som i andra recept.
- "source": receptets webbadress om den framgår, annars tom sträng.

Recept:
`;

if (typeof module !== 'undefined') { module.exports = { CATS, aggregate, fmtNum, fmtItem, fmtIngredient, keyOf, slugify, safeUrl, normalizeState, makeBackup, parseImport }; }

// ---------- app ----------
if (typeof document !== 'undefined') (async function () {
  const API = 'https://recept-api.orgutveckling.se';
  const $ = sel => document.querySelector(sel);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let auth = JSON.parse(localStorage.getItem('auth') || 'null');
  let state = JSON.parse(localStorage.getItem('state') || 'null');
  let starter = [];
  try { starter = await (await fetch('starter.json')).json(); } catch (e) { /* offline utan cache */ }
  if (!state) state = { recipes: structuredClone(starter), selections: [], extras: [], checked: [] };
  try { state = normalizeState(state); } catch (e) { state = { recipes: structuredClone(starter), selections: [], extras: [], checked: [] }; }

  async function api(path, opts = {}) {
    const res = await fetch(API + path, {
      ...opts,
      headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: 'Bearer ' + auth.token } : {}) },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Något gick fel (' + res.status + ').');
    return data;
  }

  let pushTimer = null;
  let syncError = false;
  function save(rerender = true) {
    localStorage.setItem('state', JSON.stringify(state));
    if (auth) {
      clearTimeout(pushTimer);
      pushTimer = setTimeout(async () => {
        try { await api('/state', { method: 'PUT', body: JSON.stringify(state) }); syncError = false; }
        catch (e) { syncError = true; renderNav(); }
      }, 800);
    }
    if (rerender) render();
  }

  async function pullState() {
    if (!auth) return;
    try {
      const { state: remote } = await api('/state');
      if (remote && Array.isArray(remote.recipes)) { state = normalizeState(remote); localStorage.setItem('state', JSON.stringify(state)); }
      else save(false); // nytt konto: ladda upp det lokala
      syncError = false;
    } catch (e) {
      if (String(e.message).includes('401')) { auth = null; localStorage.removeItem('auth'); }
      syncError = true;
    }
  }

  // ---------- vyer ----------
  function selFor(id) { return state.selections.find(s => s.id === id); }
  const previewPortions = {}; // portionsvisning på receptsidan innan receptet lagts i listan

  function viewCatalog() {
    const cards = state.recipes.map(r => {
      const sel = selFor(r.id);
      return `<article class="card">
        <a class="card-title" href="#/recept/${esc(r.id)}">${esc(r.title)}</a>
        <div class="card-meta">bas ${r.portions} port · ${r.ingredients.length} ingredienser</div>
        <div class="card-row">
          ${sel
            ? `<div class="stepper"><button data-step="${esc(r.id)}|-1" aria-label="Färre portioner">−</button><span>${sel.portions} port</span><button data-step="${esc(r.id)}|1" aria-label="Fler portioner">+</button></div>
               <button class="btn btn-ghost" data-unselect="${esc(r.id)}">Ta bort ur listan</button>`
            : `<button class="btn" data-select="${esc(r.id)}">Lägg i listan</button>`}
        </div>
      </article>`;
    }).join('');
    return `<div class="view-head"><h1>Mina recept</h1><span><a class="btn btn-ghost" href="#/nytt">+ Nytt recept</a> <a class="btn btn-ghost" href="#/importera">Klistra in från AI</a></span></div>
      ${state.recipes.length ? `<div class="cards">${cards}</div>` : '<p class="empty">Inga recept än. Lägg till ditt första med "Nytt recept".</p>'}`;
  }

  function viewRecipe(id) {
    const r = state.recipes.find(x => x.id === id);
    if (!r) return '<p class="empty">Receptet finns inte.</p>';
    const sel = selFor(id);
    const portions = sel ? sel.portions : (previewPortions[id] || r.portions);
    const f = portions / r.portions;
    let rows = '', lastGroup = null;
    for (const ing of r.ingredients) {
      if ((ing.group || null) !== lastGroup) { lastGroup = ing.group || null; if (lastGroup) rows += `<tr class="ing-group"><td colspan="2">${esc(lastGroup)}</td></tr>`; }
      rows += `<tr><td>${esc(ing.name)}</td><td class="num">${fmtIngredient(ing, f)}</td></tr>`;
    }
    const steps = r.steps.length
      ? '<ol class="steps">' + r.steps.map(s => `<li>${esc(s)}</li>`).join('') + '</ol>'
      : '<p class="empty">Inga steg nedskrivna.</p>';
    return `<div class="view-head"><h1>${esc(r.title)}</h1><a class="btn btn-ghost" href="#/redigera/${esc(r.id)}">Redigera</a></div>
      <div class="portion-bar">
        <div class="stepper"><button data-rstep="-1" aria-label="Färre portioner">−</button><span>${portions} portioner</span><button data-rstep="1" aria-label="Fler portioner">+</button></div>
        ${sel ? `<button class="btn btn-ghost" data-unselect="${esc(id)}">Ta bort ur listan</button>` : `<button class="btn" data-select-p="${esc(id)}|${portions}">Lägg i listan</button>`}
      </div>
      <h2>Ingredienser</h2>
      <table class="ing-table"><tbody>${rows}</tbody></table>
      <h2>Gör så här</h2>
      ${steps}
      ${r.source ? `<p class="source"><a href="${esc(r.source)}" rel="noopener">Källa</a></p>` : ''}
      <p><button class="btn btn-danger" data-delete="${esc(id)}">Ta bort receptet</button></p>`;
  }

  function listAsText() {
    const items = aggregate(state.recipes, state.selections);
    const byCat = {};
    for (const it of items) (byCat[it.cat] = byCat[it.cat] || []).push(it);
    const lines = [];
    for (const cat of CATS) {
      if (!byCat[cat]) continue;
      lines.push(CAT_LABELS[cat].toUpperCase());
      for (const it of byCat[cat].sort((a, b) => a.name.localeCompare(b.name, 'sv'))) lines.push('- ' + it.name + ': ' + fmtItem(it));
    }
    if (state.extras.length) {
      lines.push('EGNA RADER');
      for (const ex of state.extras) lines.push('- ' + ex.text);
    }
    return lines.join('\n');
  }

  function viewList() {
    const items = aggregate(state.recipes, state.selections);
    const byCat = {};
    for (const it of items) (byCat[it.cat] = byCat[it.cat] || []).push(it);
    const checked = new Set(state.checked);
    let body = '';
    for (const cat of CATS) {
      if (!byCat[cat]) continue;
      body += `<div class="kvitto-cat">· · · ${esc(CAT_LABELS[cat].toUpperCase())} · · ·</div>`;
      for (const it of byCat[cat].sort((a, b) => a.name.localeCompare(b.name, 'sv'))) {
        const done = checked.has(it.key);
        const srcs = it.sources.map(s => esc(s.title) + (s.amount != null ? ' ' + fmtNum(s.amount) + ' ' + (s.unit || '') : '')).join(' · ');
        body += `<div class="kvitto-item${done ? ' done' : ''}">
          <button class="kvitto-check" data-check="${esc(it.key)}" aria-label="Bocka av ${esc(it.name)}">${done ? '×' : ''}</button>
          <details class="kvitto-name"><summary>${esc(it.name)}</summary><div class="kvitto-src">${srcs}</div></details>
          <span class="kvitto-amount">${fmtItem(it)}</span>
        </div>`;
      }
    }
    if (state.extras.length) {
      body += '<div class="kvitto-cat">· · · EGNA RADER · · ·</div>';
      for (const ex of state.extras) {
        const done = checked.has('extra:' + ex.id);
        body += `<div class="kvitto-item${done ? ' done' : ''}">
          <button class="kvitto-check" data-check="extra:${esc(ex.id)}" aria-label="Bocka av ${esc(ex.text)}">${done ? '×' : ''}</button>
          <span class="kvitto-name">${esc(ex.text)}</span>
          <button class="kvitto-del" data-del-extra="${esc(ex.id)}" aria-label="Ta bort ${esc(ex.text)}">🗑</button>
        </div>`;
      }
    }
    const total = items.length + state.extras.length;
    const doneCount = state.checked.length;
    const recipesLine = state.selections.map(s => { const r = state.recipes.find(x => x.id === s.id); return r ? esc(r.title) + ' × ' + s.portions : ''; }).filter(Boolean).join('<br>');
    return `<div class="view-head"><h1>Att köpa</h1></div>
      ${total === 0 ? '<p class="empty">Listan är tom. Lägg recept i listan under Recept.</p>' : `
      <div class="kvitto">
        <div class="kvitto-head">GRAMMAT<br>${new Date().toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
        <div class="kvitto-recipes">${recipesLine}</div>
        ${body}
        <div class="kvitto-foot">SUMMA: ${total} varor · ${doneCount} avbockade</div>
      </div>`}
      <form class="extra-form" id="extraForm">
        <input type="text" id="extraText" placeholder="Egen rad, t.ex. mjölk eller toapapper" maxlength="80" required>
        <button class="btn" type="submit">Lägg till</button>
      </form>
      ${total > 0 ? '<p><button class="btn btn-ghost" id="copyList" type="button">Kopiera listan</button> <button class="btn btn-danger" id="clearList">Töm listan</button></p>' : ''}`;
  }

  function viewEditor(id) {
    const r = id ? state.recipes.find(x => x.id === id) : null;
    if (id && !r) return '<p class="empty">Receptet finns inte.</p>';
    const ings = r ? r.ingredients : [{}, {}, {}];
    const rowHtml = (ing = {}) => `<div class="ed-row">
      <input type="text" class="ed-name" placeholder="ingrediens" value="${esc(ing.name || '')}" maxlength="80">
      <input type="number" class="ed-amount" placeholder="mängd" value="${ing.amount != null ? ing.amount : ''}" min="0" step="any" inputmode="decimal">
      <select class="ed-unit"><option value="g"${(ing.unit || 'g') === 'g' ? ' selected' : ''}>g</option><option value="ml"${ing.unit === 'ml' ? ' selected' : ''}>ml</option></select>
      <input type="number" class="ed-count" placeholder="antal" value="${ing.count != null ? ing.count : ''}" min="0" step="any" inputmode="decimal" title="ungefärligt antal (st), valfritt">
      <select class="ed-cat">${CATS.map(c => `<option value="${c}"${(ing.cat || 'övrigt') === c ? ' selected' : ''}>${CAT_LABELS[c]}</option>`).join('')}</select>
      <button type="button" class="ed-remove" aria-label="Ta bort raden">×</button>
    </div>`;
    return `<div class="view-head"><h1>${r ? 'Redigera recept' : 'Nytt recept'}</h1></div>
      <form id="edForm" data-id="${r ? esc(r.id) : ''}">
        <label>Namn <input type="text" id="edTitle" value="${r ? esc(r.title) : ''}" maxlength="80" required></label>
        <label>Basportioner <input type="number" id="edPortions" value="${r ? r.portions : 4}" min="1" max="99" required></label>
        <label>Källa (länk, valfritt) <input type="url" id="edSource" value="${r ? esc(r.source || '') : ''}"></label>
        <h2>Ingredienser</h2>
        <p class="hint">Mängd i gram eller ml så att listan kan räkna. Lämna mängden tom för "efter smak". Antal är ungefärligt styckantal (valfritt). Tumregler: 1 msk = 15 ml, 1 tsk = 5 ml, 1 dl = 100 ml.</p>
        <div id="edRows">${ings.map(rowHtml).join('')}</div>
        <p><button type="button" class="btn btn-ghost" id="edAddRow">+ Rad</button></p>
        <h2>Gör så här</h2>
        <p class="hint">Ett steg per rad.</p>
        <textarea id="edSteps" rows="8">${r ? esc(r.steps.join('\n')) : ''}</textarea>
        <p><button class="btn" type="submit">Spara recept</button> <a class="btn btn-ghost" href="${r ? '#/recept/' + esc(r.id) : '#/'}">Avbryt</a></p>
      </form>
      <template id="edRowTpl">${rowHtml()}</template>`;
  }

  function viewImport() {
    return `<div class="view-head"><h1>Klistra in från AI</h1></div>
      <ol class="steps howto">
        <li>Kopiera prompten nedan.</li>
        <li>Klistra in den i valfri AI-modell (Claude, ChatGPT, Gemini ...) och klistra in receptet efter, eller ge en länk till receptet.</li>
        <li>Kopiera JSON-svaret du får tillbaka och klistra in det i rutan längst ner. Klart.</li>
      </ol>
      <p><button class="btn" id="copyPrompt">Kopiera prompten</button></p>
      <details class="prompt-box"><summary>Visa prompten</summary><pre>${esc(AI_PROMPT)}</pre></details>
      <form id="importForm">
        <label>AI-modellens svar
        <textarea id="importText" rows="10" placeholder='{ "title": ... }' required></textarea></label>
        <p id="importError" class="warn" hidden></p>
        <p><button class="btn" type="submit">Läs in receptet</button></p>
      </form>`;
  }

  function viewAccount() {
    const backup = `<h2>Backup</h2>
      <p>Backupen innehåller alla recept, valda recept, egna rader och avbockningar.</p>
      <p class="backup-actions">
        <button class="btn" id="exportBackup" type="button">Ladda ner backup</button>
        <label class="btn btn-ghost backup-file">Återställ från backup <input type="file" id="importBackup" accept="application/json,.json"></label>
      </p>
      <p id="backupError" class="warn" hidden></p>`;
    if (auth) {
      return `<div class="view-head"><h1>Konto</h1></div>
        <p>Inloggad som <strong>${esc(auth.name)}</strong>. Recept och inköpslista synkas mellan dina enheter.</p>
        ${syncError ? '<p class="warn">Kunde inte nå servern, ändringar sparas lokalt och synkas när det går igen.</p>' : ''}
        ${backup}
        <p><button class="btn btn-ghost" id="logout">Logga ut</button></p>`;
    }
    return `<div class="view-head"><h1>Konto</h1></div>
      <p>Utan konto sparas allt bara i den här webbläsaren. Skapa ett konto med namn och PIN-kod för att nå recepten och listan från mobilen i butiken.</p>
      <form id="authForm">
        <label>Namn <input type="text" id="authName" autocomplete="username" maxlength="20" required></label>
        <label>PIN-kod <input type="password" id="authPin" inputmode="numeric" autocomplete="current-password" minlength="4" maxlength="64" required></label>
        <p class="hint">PIN-koden går inte att återställa själv, välj något du kommer ihåg.</p>
        <p id="authError" class="warn" hidden></p>
        <p><button class="btn" type="submit" data-mode="login">Logga in</button>
        <button class="btn btn-ghost" type="submit" data-mode="register">Skapa konto</button></p>
      </form>
      ${backup}`;
  }

  // ---------- render + händelser ----------
  function renderNav() {
    const n = state.selections.length;
    $('#navListCount').textContent = n ? ' (' + n + ')' : '';
    $('#navUser').textContent = auth ? auth.name : 'konto';
    const h = location.hash || '#/';
    document.querySelectorAll('.nav a').forEach(a => {
      const m = a.dataset.match;
      const active = m === '#/' ? !h.startsWith('#/lista') && !h.startsWith('#/konto') : h.startsWith(m);
      a.classList.toggle('active', active);
    });
  }

  function render() {
    const h = location.hash || '#/';
    const m = h.match(/^#\/(recept|redigera)\/(.+)$/);
    let html;
    if (m && m[1] === 'recept') html = viewRecipe(decodeURIComponent(m[2]));
    else if (m && m[1] === 'redigera') html = viewEditor(decodeURIComponent(m[2]));
    else if (h === '#/nytt') html = viewEditor(null);
    else if (h === '#/importera') html = viewImport();
    else if (h === '#/lista') html = viewList();
    else if (h === '#/konto') html = viewAccount();
    else html = viewCatalog();
    $('#view').innerHTML = html;
    renderNav();
    bind();
  }

  function bind() {
    const view = $('#view');

    view.querySelectorAll('[data-select]').forEach(b => b.onclick = () => {
      const r = state.recipes.find(x => x.id === b.dataset.select);
      state.selections.push({ id: r.id, portions: r.portions });
      save();
    });
    view.querySelectorAll('[data-select-p]').forEach(b => b.onclick = () => {
      const [id, p] = b.dataset.selectP.split('|');
      state.selections.push({ id, portions: Number(p) });
      save();
    });
    view.querySelectorAll('[data-unselect]').forEach(b => b.onclick = () => {
      state.selections = state.selections.filter(s => s.id !== b.dataset.unselect);
      save();
    });
    view.querySelectorAll('[data-step]').forEach(b => b.onclick = () => {
      const [id, d] = b.dataset.step.split('|');
      const sel = selFor(id);
      sel.portions = Math.max(1, sel.portions + Number(d));
      save();
    });
    view.querySelectorAll('[data-rstep]').forEach(b => b.onclick = () => {
      const id = location.hash.replace('#/recept/', '');
      const r = state.recipes.find(x => x.id === decodeURIComponent(id));
      const sel = selFor(r.id);
      if (sel) { sel.portions = Math.max(1, sel.portions + Number(b.dataset.rstep)); save(); }
      else { // inte i listan än: ändra bara förhandsvisningen
        previewPortions[r.id] = Math.max(1, (previewPortions[r.id] || r.portions) + Number(b.dataset.rstep));
        render();
      }
    });
    view.querySelectorAll('[data-delete]').forEach(b => b.onclick = () => {
      const r = state.recipes.find(x => x.id === b.dataset.delete);
      if (!confirm('Ta bort "' + r.title + '"? Det går inte att ångra.')) return;
      state.recipes = state.recipes.filter(x => x.id !== r.id);
      state.selections = state.selections.filter(s => s.id !== r.id);
      location.hash = '#/';
      save();
    });

    view.querySelectorAll('[data-check]').forEach(b => b.onclick = () => {
      const k = b.dataset.check;
      state.checked = state.checked.includes(k) ? state.checked.filter(x => x !== k) : [...state.checked, k];
      save();
    });
    view.querySelectorAll('[data-del-extra]').forEach(b => b.onclick = () => {
      state.extras = state.extras.filter(x => String(x.id) !== b.dataset.delExtra);
      state.checked = state.checked.filter(k => k !== 'extra:' + b.dataset.delExtra);
      save();
    });
    const extraForm = $('#extraForm');
    if (extraForm) extraForm.onsubmit = e => {
      e.preventDefault();
      state.extras.push({ id: Date.now(), text: $('#extraText').value.trim() });
      save();
    };
    const copyListBtn = $('#copyList');
    if (copyListBtn) copyListBtn.onclick = async () => {
      try { await navigator.clipboard.writeText(listAsText()); copyListBtn.textContent = 'Kopierad!'; }
      catch (e) { copyListBtn.textContent = 'Kunde inte kopiera'; }
      setTimeout(() => { copyListBtn.textContent = 'Kopiera listan'; }, 2500);
    };
    const clearBtn = $('#clearList');
    if (clearBtn) clearBtn.onclick = () => {
      if (!confirm('Töm hela listan?')) return;
      state.selections = []; state.extras = []; state.checked = [];
      save();
    };

    const edForm = $('#edForm');
    if (edForm) {
      $('#edAddRow').onclick = () => $('#edRows').insertAdjacentHTML('beforeend', $('#edRowTpl').innerHTML);
      view.querySelector('#edRows').onclick = e => { if (e.target.classList.contains('ed-remove')) e.target.closest('.ed-row').remove(); };
      edForm.onsubmit = e => {
        e.preventDefault();
        const ingredients = [...view.querySelectorAll('.ed-row')].map(row => {
          const name = row.querySelector('.ed-name').value.trim();
          if (!name) return null;
          const amount = row.querySelector('.ed-amount').value;
          const count = row.querySelector('.ed-count').value;
          const ing = { name, cat: row.querySelector('.ed-cat').value };
          if (amount !== '') { ing.amount = Number(amount); ing.unit = row.querySelector('.ed-unit').value; }
          else ing.toTaste = true;
          if (count !== '') { ing.count = Number(count); ing.countUnit = 'st'; }
          return ing;
        }).filter(Boolean);
        if (!ingredients.length) { alert('Minst en ingrediens behövs.'); return; }
        const oldId = edForm.dataset.id;
        const recipe = {
          id: oldId || slugify($('#edTitle').value, state.recipes.map(r => r.id)),
          title: $('#edTitle').value.trim(),
          portions: Number($('#edPortions').value),
          source: safeUrl($('#edSource').value),
          ingredients,
          steps: $('#edSteps').value.split('\n').map(s => s.trim()).filter(Boolean),
        };
        if (oldId) state.recipes = state.recipes.map(r => r.id === oldId ? recipe : r);
        else state.recipes.push(recipe);
        location.hash = '#/recept/' + recipe.id;
        save();
      };
    }

    const copyBtn = $('#copyPrompt');
    if (copyBtn) copyBtn.onclick = async () => {
      try { await navigator.clipboard.writeText(AI_PROMPT); copyBtn.textContent = 'Kopierad!'; }
      catch (e) { copyBtn.textContent = 'Kunde inte kopiera, visa prompten och kopiera manuellt'; }
      setTimeout(() => { copyBtn.textContent = 'Kopiera prompten'; }, 2500);
    };
    const importForm = $('#importForm');
    if (importForm) importForm.onsubmit = e => {
      e.preventDefault();
      const errEl = $('#importError');
      errEl.hidden = true;
      try {
        const recipe = parseImport($('#importText').value, state.recipes.map(r => r.id));
        state.recipes.push(recipe);
        location.hash = '#/recept/' + recipe.id;
        save();
      } catch (err) {
        errEl.textContent = err.message;
        errEl.hidden = false;
      }
    };

    const authForm = $('#authForm');
    if (authForm) {
      authForm.onsubmit = async e => {
        e.preventDefault();
        const mode = e.submitter ? e.submitter.dataset.mode : 'login';
        const errEl = $('#authError');
        errEl.hidden = true;
        try {
          const data = await api('/' + mode, { method: 'POST', body: JSON.stringify({ name: $('#authName').value, pin: $('#authPin').value }) });
          auth = { name: data.name, token: data.token };
          localStorage.setItem('auth', JSON.stringify(auth));
          await pullState();
          location.hash = '#/';
          render();
        } catch (err) {
          errEl.textContent = err.message;
          errEl.hidden = false;
        }
      };
    }
    const logout = $('#logout');
    if (logout) logout.onclick = () => {
      auth = null;
      localStorage.removeItem('auth');
      render();
    };

    const exportBackup = $('#exportBackup');
    if (exportBackup) exportBackup.onclick = () => {
      const blob = new Blob([JSON.stringify(makeBackup(state), null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'grammat-backup-' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    };
    const importBackup = $('#importBackup');
    if (importBackup) importBackup.onchange = async () => {
      const errEl = $('#backupError');
      errEl.hidden = true;
      const file = importBackup.files && importBackup.files[0];
      if (!file) return;
      try {
        const restored = normalizeState(JSON.parse(await file.text()));
        if (!confirm('Återställ backupen? Nuvarande recept och lista ersätts.')) return;
        state = restored;
        localStorage.setItem('state', JSON.stringify(state));
        save();
        location.hash = '#/';
      } catch (err) {
        errEl.textContent = err.message || 'Kunde inte läsa backupen.';
        errEl.hidden = false;
      } finally {
        importBackup.value = '';
      }
    };
  }

  window.addEventListener('hashchange', render);
  await pullState();
  render();
})();
