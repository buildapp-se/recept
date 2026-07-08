'use strict';

// ---------- rena funktioner (testas i test.js) ----------
const CATS = ['grönt', 'kött', 'mejeri', 'skafferi', 'fryst', 'övrigt'];
const CAT_LABELS = { 'grönt': 'Grönt', 'kött': 'Kött & chark', 'mejeri': 'Mejeri', 'skafferi': 'Skafferi', 'fryst': 'Fryst', 'övrigt': 'Övrigt' };
const COURSES = ['forratt', 'huvudratt', 'efterratt', 'dryck', 'sas'];
const COURSE_LABELS = { forratt: 'Förrätt', huvudratt: 'Huvudrätt', efterratt: 'Efterrätt', dryck: 'Drycker', sas: 'Såser & röror' };

function keyOf(name) { return name.toLowerCase().trim(); }

// Summerar valda recept (skalade till valda portioner) till inköpsrader.
// struck = { receptId: [ingrediensnyckel, ...] }: bockade ingredienser (har hemma/redan i grytan) utesluts.
function aggregate(recipes, selections, struck) {
  const byId = Object.fromEntries(recipes.map(r => [r.id, r]));
  const items = new Map();
  for (const sel of selections) {
    const r = byId[sel.id];
    if (!r) continue;
    const f = sel.portions / r.portions;
    for (const ing of r.ingredients) {
      if (ing.skipList) continue;
      const k = keyOf(ing.name);
      if (struck && struck[sel.id] && struck[sel.id].includes(k)) continue;
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

// ponytail: kryddmått/tsk/msk-gissning för småmängder skafferivaror man inte vill väga upp.
// Antar densitet ~1 g/ml (stämmer ungefär för salt/kryddpulver, inte exakt för flingiga örter) - ren display, ingen datamigrering.
function spiceHint(amount, unit, cat) {
  if (unit !== 'g' || cat !== 'skafferi' || !(amount > 0) || amount > 30) return '';
  if (amount < 4) return fmtCount(amount) + ' krm';
  if (amount < 12.5) return fmtCount(amount / 5) + ' tsk';
  return fmtCount(amount / 15) + ' msk';
}

function fmtItem(it) {
  if (it.amount > 0) {
    let s = fmtNum(it.amount) + ' ' + it.unit;
    if (it.count > 0) s += ' (~' + fmtCount(it.count) + ' ' + (it.countUnit || 'st') + ')';
    else { const hint = spiceHint(it.amount, it.unit, it.cat); if (hint) s += ' (~' + hint + ')'; }
    if (it.toTaste) s += ' + efter smak';
    return s;
  }
  return 'efter smak';
}

function fmtIngredient(ing, f) {
  if (ing.amount == null) return 'efter smak';
  const amount = ing.amount * f;
  let s = fmtNum(amount) + ' ' + (ing.unit || 'g');
  if (ing.count) s += ' (~' + fmtCount(ing.count * f) + ' ' + (ing.countUnit || 'st') + ')';
  else { const hint = spiceHint(amount, ing.unit, ing.cat); if (hint) s += ' (~' + hint + ')'; }
  return s;
}

function recipeAsText(recipe, portions) {
  const p = portions || recipe.portions;
  const f = p / recipe.portions;
  const lines = [recipe.title, '', fmtNum(p) + ' portioner', '', 'Ingredienser'];
  let lastGroup = null;
  for (const ing of recipe.ingredients) {
    if ((ing.group || null) !== lastGroup) {
      lastGroup = ing.group || null;
      if (lastGroup) lines.push('', lastGroup);
    }
    lines.push('- ' + ing.name + ': ' + fmtIngredient(ing, f));
  }
  lines.push('', 'Gör så här');
  if (recipe.steps && recipe.steps.length) {
    recipe.steps.forEach((step, i) => lines.push((i + 1) + '. ' + step));
  } else {
    lines.push('Inga steg nedskrivna.');
  }
  if (recipe.source) lines.push('', 'Källa', recipe.source);
  return lines.join('\n');
}

// Näringsvärde per portion, oberoende av hur många portioner man just nu lagar.
// ponytail: ml behandlas som g (ingen densitetstabell), samma precisionsnivå som aggregate().
function nutritionPerPortion(recipe, nutrients) {
  const t = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  const missing = [];
  for (const ing of recipe.ingredients) {
    if (ing.amount == null) continue; // efter smak: går inte att räkna
    const n = nutrients[keyOf(ing.name)];
    if (!n) { missing.push(ing.name); continue; }
    const f = ing.amount / 100;
    t.kcal += n.kcal * f; t.protein += n.protein * f; t.carbs += n.carbs * f; t.fat += n.fat * f;
  }
  return { kcal: t.kcal / recipe.portions, protein: t.protein / recipe.portions, carbs: t.carbs / recipe.portions, fat: t.fat / recipe.portions, missing };
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
      course: COURSES.includes(r.course) ? r.course : 'huvudratt',
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

  const struck = {};
  if (s.struck && typeof s.struck === 'object' && !Array.isArray(s.struck)) {
    for (const [id, keys] of Object.entries(s.struck)) {
      if (!Array.isArray(keys) || !recipes.some(r => r.id === id)) continue;
      const ks = keys.filter(k => typeof k === 'string' && k);
      if (ks.length) struck[id] = ks;
    }
  }

  return {
    recipes,
    selections: Array.isArray(s.selections) ? s.selections.map(x => ({ id: String(x.id || ''), portions: Math.max(1, Math.round(Number(x.portions) || 1)) })).filter(x => recipes.some(r => r.id === x.id)) : [],
    extras: Array.isArray(s.extras) ? s.extras.map(x => ({ id: x.id != null ? x.id : Date.now(), text: String(x.text || '').trim().slice(0, 80) })).filter(x => x.text) : [],
    checked: Array.isArray(s.checked) ? s.checked.map(String) : [],
    struck,
  };
}

function makeBackup(state) {
  return { app: 'grammat', version: 1, exportedAt: new Date().toISOString(), state: normalizeState(state) };
}

// Allas recept: plockar bort recept som redan finns i startpaketet, taggar kvarvarande
// med ägarnamn ENDAST när samma id förekommer hos fler än en ägare (disambiguering).
function dedupeAllas(allasList, starterIds) {
  const starterSet = new Set(starterIds);
  const others = allasList.filter(r => !starterSet.has(r.id));
  const counts = {};
  for (const r of others) counts[r.id] = (counts[r.id] || 0) + 1;
  return others.map(r => ({ ...r, _ownerLabel: counts[r.id] > 1 ? r.owner : null }));
}

// Tolkar och normaliserar JSON (ett recept eller en array av recept) som en AI-modell
// producerat med importprompten. Returnerar alltid en array. Allt eller inget vid fel.
function parseImport(text, takenIds) {
  let t = String(text).trim().replace(/^```[a-z]*\s*/i, '').replace(/```\s*$/, '');
  const oa = t.indexOf('{'), ob = t.lastIndexOf('}');
  const aa = t.indexOf('['), ab = t.lastIndexOf(']');
  let d = null;
  if (aa !== -1 && ab > aa && (oa === -1 || aa < oa)) {
    try { d = JSON.parse(t.slice(aa, ab + 1)); } catch (e) { /* prova objektet nedan */ }
  }
  if (d === null) {
    if (oa === -1 || ob <= oa) throw new Error('Hittar ingen JSON i det inklistrade. Klistra in hela svaret från AI-modellen.');
    try { d = JSON.parse(t.slice(oa, ob + 1)); } catch (e) { throw new Error('Trasig JSON: ' + e.message); }
  }
  const list = Array.isArray(d) ? d : [d];
  if (!list.length) throw new Error('Arrayen är tom, inga recept att läsa in.');
  const taken = takenIds.slice();
  return list.map((r, i) => {
    let recipe;
    try { recipe = importRecipe(r, taken); }
    catch (e) { throw list.length > 1 ? new Error('Recept ' + (i + 1) + ': ' + e.message) : e; }
    taken.push(recipe.id);
    return recipe;
  });
}

function importRecipe(d, takenIds) {
  if (!d || typeof d !== 'object') throw new Error('Receptet är inte ett JSON-objekt.');
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
    course: COURSES.includes(d.course) ? d.course : 'huvudratt',
    source: safeUrl(d.source),
    ingredients,
    steps: Array.isArray(d.steps) ? d.steps.filter(s => typeof s === 'string' && s.trim()).map(s => s.trim()) : [],
  };
}

const AI_PROMPT = `Du får ett eller flera recept nedan (som text eller länkar). Gör om dem till JSON enligt exakt detta format och svara med ENBART en JSON-array, utan kodstaket och utan förklaringar.

[{
  "title": "Receptets namn",
  "portions": 4,
  "course": "huvudratt",
  "source": "",
  "ingredients": [
    { "name": "gul lök", "amount": 220, "unit": "g", "count": 2, "countUnit": "st", "cat": "grönt" },
    { "name": "olivolja", "amount": 30, "unit": "ml", "cat": "skafferi" },
    { "name": "salt", "toTaste": true, "cat": "skafferi" },
    { "name": "vatten", "amount": 200, "unit": "ml", "skipList": true, "cat": "övrigt" }
  ],
  "steps": ["Första steget.", "Andra steget."]
}]

Regler:
- Svara alltid med en array, även för ett enda recept. Får du flera recept eller flera länkar: lägg alla som egna objekt i samma array.
- Alla mängder i gram ("unit": "g") eller milliliter ("unit": "ml"). Konvertera: 1 msk = 15 ml, 1 tsk = 5 ml, 1 krm = 1 ml, 1 dl = 100 ml.
- Styckvaror: räkna om till gram med normalvikter (gul lök 110 g/st, morot 120 g/st, tomat 120 g/st, vitlök 5 g/klyfta, lime 65 g/st, potatis 100 g/st) och ange dessutom "count" (ungefärligt antal) och "countUnit" ("st", "klyftor", "burk", "förp", "bunt").
- Torrvaror per dl: vetemjöl 60 g, socker 85 g, ris 85 g, havregryn 35 g, riven ost 40 g, linser 85 g. Smör: 1 msk = 15 g.
- Kryddor eller annat utan angiven mängd ("efter smak", "till servering"): utelämna "amount" och sätt "toTaste": true.
- Vatten och annat man inte köper i butiken: behåll mängden men sätt "skipList": true.
- "cat" måste vara exakt en av: "grönt", "kött", "mejeri", "skafferi", "fryst", "övrigt".
- "portions": antalet portioner receptet gäller. Framgår det inte, uppskatta.
- "course" måste vara exakt en av: "forratt", "huvudratt", "efterratt", "dryck", "sas" (såser & röror). Gissa den som passar bäst, framgår det inte: "huvudratt".
- Har receptet delar (t.ex. sås, garnering): sätt "group": "Sås" osv. på de ingrediensernas rader.
- "steps": tillagningsstegen som en lista med strängar, ett steg per element. Saknas steg: tom lista.
- Ingrediensnamn: gemener, korta och butiksvänliga ("gul lök", inte "finhackad stor gul lök"). Samma vara ska heta samma sak som i andra recept.
- "source": receptets webbadress om den framgår, annars tom sträng.

Recept:
`;

if (typeof module !== 'undefined') { module.exports = { CATS, COURSES, COURSE_LABELS, aggregate, fmtNum, fmtItem, fmtIngredient, recipeAsText, spiceHint, nutritionPerPortion, keyOf, slugify, safeUrl, normalizeState, makeBackup, parseImport, dedupeAllas }; }

// ---------- app ----------
if (typeof document !== 'undefined') (async function () {
  const API = 'https://recept-api.orgutveckling.se';
  const $ = sel => document.querySelector(sel);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let fb = null;                 // Firebase-modulen (window.fb), null tills CDN-laddningen är klar
  let fbUser = null;             // inloggad Firebase-användare
  let legacy = JSON.parse(localStorage.getItem('auth') || 'null'); // gammalt namn+PIN-konto (utfasas)
  let authName = localStorage.getItem('authName') || (legacy ? legacy.name : null); // D1-namnet, sätts av /state
  const loggedIn = () => !!(fbUser || legacy);
  let state = JSON.parse(localStorage.getItem('state') || 'null');
  let starter = [];
  let nutrients = {};
  try { starter = await (await fetch('starter.json')).json(); } catch (e) { /* offline utan cache */ }
  try { nutrients = await (await fetch('nutrients.json')).json(); } catch (e) { /* offline utan cache */ }
  if (!state) state = { recipes: [], selections: [], extras: [], checked: [], struck: {} };
  try { state = normalizeState(state); } catch (e) { state = { recipes: [], selections: [], extras: [], checked: [], struck: {} }; }

  async function api(path, opts = {}) {
    const token = fbUser ? await fbUser.getIdToken() : legacy ? legacy.token : null;
    const res = await fetch(API + path, {
      ...opts,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Något gick fel (' + res.status + ').');
    return data;
  }

  let pushTimer = null;
  let syncError = false;
  function save(rerender = true) {
    localStorage.setItem('state', JSON.stringify(state));
    if (loggedIn()) {
      clearTimeout(pushTimer);
      pushTimer = setTimeout(async () => {
        try { await api('/state', { method: 'PUT', body: JSON.stringify(state) }); syncError = false; }
        catch (e) { syncError = true; renderNav(); }
      }, 800);
    }
    if (rerender) render();
  }

  async function pullState() {
    if (!loggedIn()) return;
    try {
      const { state: remote, name } = await api('/state');
      if (name) { authName = name; localStorage.setItem('authName', name); }
      if (remote && Array.isArray(remote.recipes)) { state = normalizeState(remote); localStorage.setItem('state', JSON.stringify(state)); }
      else save(false); // nytt konto: ladda upp det lokala
      syncError = false;
    } catch (e) {
      if (e.message === 'Inte inloggad.' || String(e.message).includes('401')) { legacy = null; localStorage.removeItem('auth'); }
      syncError = true;
    }
  }

  // ---------- vyer ----------
  function selFor(id) { return state.selections.find(s => s.id === id); }
  const previewPortions = {}; // portionsvisning på receptsidan innan receptet lagts i listan
  // recept kan visas/öppnas innan de finns i egna state.recipes (Allas recept-fliken)
  function findRecipe(id) { return state.recipes.find(x => x.id === id) || starter.find(x => x.id === id) || (allasList || []).find(x => x.id === id); }

  let allasList = null; // null = ej hämtad än
  let allasLoading = false;
  function loadAllas() {
    if (!loggedIn() || allasList !== null || allasLoading) return;
    allasLoading = true;
    api('/allas-recept').then(list => { allasList = list; render(); }).catch(() => {}).finally(() => { allasLoading = false; });
  }

  function recipeCard(r) {
    const sel = selFor(r.id);
    const nutr = nutritionPerPortion(r, nutrients);
    return `<article class="card" data-card="${esc(r.id)}">
      <a class="card-title" href="#/recept/${esc(r.id)}">${esc(r.title)}</a>
      <div class="card-meta">bas ${r.portions} port · ${r.ingredients.length} ingredienser${nutr.kcal ? ` · ${fmtNum(nutr.kcal)} kcal/port` : ''}</div>
      <div class="card-row">
        ${sel
          ? `<div class="stepper"><button data-step="${esc(r.id)}|-1" aria-label="Färre portioner">−</button><span>${sel.portions} port</span><button data-step="${esc(r.id)}|1" aria-label="Fler portioner">+</button></div>
             <button class="btn btn-ghost" data-unselect="${esc(r.id)}">Ta bort ur listan</button>`
          : `<button class="btn" data-select="${esc(r.id)}">Lägg i listan</button>`}
      </div>
    </article>`;
  }

  function viewCatalog() {
    const byCourse = {};
    for (const r of state.recipes) (byCourse[r.course] = byCourse[r.course] || []).push(r);
    const sections = COURSES.filter(c => byCourse[c]).map(c => `
      <h2>${esc(COURSE_LABELS[c])}</h2>
      <div class="cards">${byCourse[c].map(recipeCard).join('')}</div>`).join('');
    return `<div class="view-head"><h1>Mina recept</h1><span><a class="btn btn-ghost" href="#/nytt">+ Nytt recept</a> <a class="btn btn-ghost" href="#/importera">Klistra in från AI</a></span></div>
      ${state.recipes.length ? sections : '<p class="empty">Inga recept än. Lägg till ditt första med "Nytt recept".</p>'}`;
  }

  function viewAllasRecept() {
    const myIds = new Set(state.recipes.map(r => r.id));

    function card(r) {
      const mine = myIds.has(r.id);
      const nutr = nutritionPerPortion(r, nutrients);
      return `<article class="card" data-card="${esc(r.id)}">
        <a class="card-title" href="#/recept/${esc(r.id)}">${esc(r.title)}</a>
        <div class="card-meta">bas ${r.portions} port · ${r.ingredients.length} ingredienser${nutr.kcal ? ` · ${fmtNum(nutr.kcal)} kcal/port` : ''}${r._ownerLabel ? ' · ' + esc(r._ownerLabel) : ''}</div>
        <div class="card-row">
          ${mine ? `<button class="btn btn-ghost" data-remove-allas="${esc(r.id)}">Ta bort ur mina recept</button>` : `<button class="btn" data-add-allas="${esc(r.id)}">Lägg till i mina recept</button>`}
        </div>
      </article>`;
    }

    function sections(list) {
      const byCourse = {};
      for (const r of list) (byCourse[r.course] = byCourse[r.course] || []).push(r);
      return COURSES.filter(c => byCourse[c]).map(c => `
        <h2>${esc(COURSE_LABELS[c])}</h2>
        <div class="cards">${byCourse[c].map(card).join('')}</div>`).join('');
    }

    let othersHtml;
    if (!loggedIn()) {
      othersHtml = '<p class="hint">Logga in för att se recept andra lagt till.</p>';
    } else if (allasList === null) {
      loadAllas();
      othersHtml = '<p class="hint">Laddar recept från andra …</p>';
    } else {
      const withLabels = dedupeAllas(allasList, starter.map(r => r.id));
      othersHtml = withLabels.length ? sections(withLabels) : '';
    }

    return `<div class="view-head"><h1>Allas recept</h1></div>
      ${sections(starter)}
      ${othersHtml}`;
  }

  function viewRecipe(id) {
    const r = findRecipe(id);
    if (!r) return '<p class="empty">Receptet finns inte.</p>';
    const mine = state.recipes.some(x => x.id === id);
    const sel = mine ? selFor(id) : null;
    const portions = sel ? sel.portions : (previewPortions[id] || r.portions);
    const f = portions / r.portions;
    // Bockade rader (har hemma/redan i grytan) samlas längst ner, senast bockad överst,
    // och utesluts ur inköpslistan.
    const struckKeys = state.struck[id] || [];
    let rows = '', lastGroup = null;
    const struckRows = [];
    r.ingredients.forEach((ing, i) => {
      const k = keyOf(ing.name);
      const isStruck = mine && struckKeys.includes(k);
      const attr = mine ? ` data-ing="${esc(k)}" style="view-transition-name:ing-${i}"` : '';
      const row = `<tr class="ing-row${isStruck ? ' struck' : ''}"${attr}><td>${isStruck ? '<span class="tick">✓</span>' : ''}${esc(ing.name)}</td><td class="num">${fmtIngredient(ing, f)}</td></tr>`;
      if (isStruck) { struckRows.push({ row, order: struckKeys.indexOf(k) }); return; }
      if ((ing.group || null) !== lastGroup) { lastGroup = ing.group || null; if (lastGroup) rows += `<tr class="ing-group"><td colspan="2">${esc(lastGroup)}</td></tr>`; }
      rows += row;
    });
    rows += struckRows.sort((a, b) => b.order - a.order).map(x => x.row).join('');
    const steps = r.steps.length
      ? '<ol class="steps">' + r.steps.map(s => `<li>${esc(s)}</li>`).join('') + '</ol>'
      : '<p class="empty">Inga steg nedskrivna.</p>';
    const nutr = nutritionPerPortion(r, nutrients);
    const nutrLine = `<p class="hint">Per portion: ${fmtNum(nutr.kcal)} kcal · ${fmtNum(nutr.protein)} g protein · ${fmtNum(nutr.carbs)} g kolhydrater · ${fmtNum(nutr.fat)} g fett${nutr.missing.length ? ' · ofullständigt, ' + nutr.missing.length + ' ingrediens' + (nutr.missing.length > 1 ? 'er' : '') + ' saknar data' : ''} (källa: <a href="https://soknaringsinnehall.livsmedelsverket.se/" rel="noopener">Livsmedelsverket</a> m.fl.)</p>`;
    const portionBar = mine
      ? `<div class="portion-bar">
        <div class="stepper"><button data-rstep="-1" aria-label="Färre portioner">−</button><span>${portions} portioner</span><button data-rstep="1" aria-label="Fler portioner">+</button></div>
        ${sel ? `<button class="btn btn-ghost" data-unselect="${esc(id)}">Ta bort ur listan</button>` : `<button class="btn" data-select-p="${esc(id)}|${portions}">Lägg i listan</button>`}
      </div>`
      : '';
    const actionBar = mine
      ? `<p class="action-row">
        <button class="btn btn-ghost" data-share="${esc(id)}">Kopiera recept</button>
        <button class="btn btn-danger" data-delete="${esc(id)}">Ta bort recept</button>
      </p>`
      : `<p class="action-row"><button class="btn" data-add-allas="${esc(id)}">Lägg till i mina recept</button> <button class="btn btn-ghost" data-share="${esc(id)}">Kopiera recept</button></p>`;
    return `<div class="view-head"><h1>${esc(r.title)}</h1>${mine ? `<a class="btn btn-ghost" href="#/redigera/${esc(r.id)}">Redigera</a>` : ''}</div>
      <p class="hint">${esc(COURSE_LABELS[r.course])}</p>
      ${portionBar}
      ${nutrLine}
      <h2>Ingredienser</h2>
      ${mine ? '<p class="hint">Tryck på en rad när du har varan hemma eller redan lagt den i grytan, den stryks och hoppar ur inköpslistan.</p>' : ''}
      <table class="ing-table"><tbody>${rows}</tbody></table>
      <h2>Gör så här</h2>
      ${steps}
      ${r.source ? `<p class="source"><a href="${esc(r.source)}" rel="noopener">Källa</a></p>` : ''}
      ${actionBar}`;
  }

  function listAsText() {
    const checked = new Set(state.checked);
    const items = aggregate(state.recipes, state.selections, state.struck).filter(it => !checked.has(it.key));
    const byCat = {};
    for (const it of items) (byCat[it.cat] = byCat[it.cat] || []).push(it);
    const lines = [];
    for (const cat of CATS) {
      if (!byCat[cat]) continue;
      lines.push(CAT_LABELS[cat].toUpperCase());
      for (const it of byCat[cat].sort((a, b) => a.name.localeCompare(b.name, 'sv'))) lines.push('- ' + it.name + ': ' + fmtItem(it));
    }
    const extras = state.extras.filter(ex => !checked.has('extra:' + ex.id));
    if (extras.length) {
      lines.push('EGNA RADER');
      for (const ex of extras) lines.push('- ' + ex.text);
    }
    return lines.join('\n');
  }

  function viewList() {
    const items = aggregate(state.recipes, state.selections, state.struck);
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
      ${total > 0 ? '<p class="action-row"><button class="btn btn-ghost" id="copyList" type="button">Kopiera listan</button> <button class="btn btn-danger" id="clearList">Töm listan</button></p>' : ''}`;
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
        <label>Kategori <select id="edCourse">${COURSES.map(c => `<option value="${c}"${(r ? r.course : 'huvudratt') === c ? ' selected' : ''}>${COURSE_LABELS[c]}</option>`).join('')}</select></label>
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
        <li>Klistra in den i valfri AI-modell (Claude, ChatGPT, Gemini ...) och klistra in ett eller flera recept efter, eller länkar till recepten.</li>
        <li>Kopiera JSON-svaret du får tillbaka och klistra in det i rutan längst ner. Alla recepten läses in på en gång. Klart.</li>
      </ol>
      <p><button class="btn" id="copyPrompt">Kopiera prompten</button></p>
      <details class="prompt-box"><summary>Visa prompten</summary><pre>${esc(AI_PROMPT)}</pre></details>
      <form id="importForm">
        <label>AI-modellens svar
        <textarea id="importText" rows="10" placeholder='[ { "title": ... } ]' required></textarea></label>
        <p id="importError" class="warn" hidden></p>
        <p><button class="btn" type="submit">Läs in</button></p>
      </form>`;
  }

  // Firebase-felkoder till svenska.
  function fbErr(e) {
    const m = {
      'auth/invalid-credential': 'Fel e-post eller lösenord.',
      'auth/wrong-password': 'Fel e-post eller lösenord.',
      'auth/user-not-found': 'Inget konto med den e-postadressen.',
      'auth/email-already-in-use': 'E-postadressen har redan ett konto, logga in i stället.',
      'auth/weak-password': 'Lösenordet behöver minst 6 tecken.',
      'auth/invalid-email': 'Ogiltig e-postadress.',
      'auth/popup-closed-by-user': 'Inloggningen avbröts.',
      'auth/cancelled-popup-request': 'Inloggningen avbröts.',
      'auth/popup-blocked': 'Webbläsaren blockerade inloggningsfönstret, tillåt popupfönster och försök igen.',
      'auth/credential-already-in-use': 'Den inloggningen används redan av ett annat konto.',
      'auth/requires-recent-login': 'Av säkerhetsskäl: logga ut, logga in igen och försök direkt.',
      'auth/too-many-requests': 'För många försök, vänta en stund.',
      'auth/network-request-failed': 'Ingen kontakt med inloggningstjänsten.',
    };
    return (e && m[e.code]) || (e && e.message) || 'Något gick fel.';
  }

  function viewAccount() {
    const backup = `<h2>Backup</h2>
      <p>Backupen innehåller alla recept, valda recept, egna rader och avbockningar.</p>
      <p class="backup-actions">
        <button class="btn" id="exportBackup" type="button">Ladda ner backup</button>
        <label class="btn btn-ghost backup-file">Återställ från backup <input type="file" id="importBackup" accept="application/json,.json"></label>
      </p>
      <p id="backupError" class="warn" hidden></p>`;
    const loginForms = `
      <p><button class="btn" id="googleLogin" type="button">Fortsätt med Google</button></p>
      <form id="emailForm">
        <label>E-post <input type="email" id="authEmail" autocomplete="username" required></label>
        <label>Lösenord <input type="password" id="authPw" minlength="6" maxlength="64" autocomplete="current-password" required></label>
        <p id="authError" class="warn" hidden></p>
        <p><button class="btn" type="submit" data-mode="login">Logga in</button>
        <button class="btn btn-ghost" type="submit" data-mode="register">Skapa konto</button>
        <button class="btn btn-ghost" type="button" id="forgotPw">Glömt lösenordet?</button></p>
      </form>`;
    if (fbUser) {
      const providers = fbUser.providerData.map(p => p.providerId);
      const hasPw = providers.includes('password'), hasGoogle = providers.includes('google.com');
      const ways = [hasGoogle ? 'Google' : '', hasPw ? 'e-post & lösenord' : ''].filter(Boolean).join(' · ');
      return `<div class="view-head"><h1>Konto</h1></div>
        <p>Inloggad som <strong>${esc(authName || fbUser.email || '')}</strong>${fbUser.email ? ' · ' + esc(fbUser.email) : ''}. Recept och inköpslista synkas mellan dina enheter.</p>
        ${syncError ? '<p class="warn">Kunde inte nå servern, ändringar sparas lokalt och synkas när det går igen.</p>' : ''}
        <h2>Inloggningssätt</h2>
        <p class="hint">${ways}</p>
        ${hasGoogle ? '' : '<p><button class="btn btn-ghost" id="linkGoogle" type="button">Koppla Google-inloggning</button></p>'}
        ${hasPw ? '' : `<form id="pwForm">
          <label>Skapa lösenord: då kan även din partner logga in på kontot med ${esc(fbUser.email || 'din e-post')} och lösenordet.
          <input type="password" id="pwNew" minlength="6" maxlength="64" autocomplete="new-password" required></label>
          <p id="pwError" class="warn" hidden></p>
          <p><button class="btn btn-ghost" type="submit">Spara lösenord</button></p>
        </form>`}
        <details class="prompt-box"><summary>Har du ett gammalt konto med namn + PIN? Hämta hit det.</summary>
          <form id="linkForm">
            <label>Namn <input type="text" id="linkName" maxlength="20" required></label>
            <label>PIN-kod <input type="password" id="linkPin" inputmode="numeric" minlength="4" maxlength="64" required></label>
            <p id="linkError" class="warn" hidden></p>
            <p><button class="btn btn-ghost" type="submit">Koppla gamla kontot</button></p>
          </form>
        </details>
        ${backup}
        <p class="action-row"><button class="btn btn-ghost" id="logout">Logga ut</button> <button class="btn btn-danger" id="deleteAccount" type="button">Radera kontot</button></p>`;
    }
    if (legacy) {
      return `<div class="view-head"><h1>Konto</h1></div>
        <p>Inloggad som <strong>${esc(legacy.name)}</strong> med gamla PIN-inloggningen.</p>
        ${syncError ? '<p class="warn">Kunde inte nå servern, ändringar sparas lokalt och synkas när det går igen.</p>' : ''}
        <h2>Byt till nya inloggningen</h2>
        <p class="hint">PIN-inloggningen fasas ut. Logga in med Google eller skapa konto med e-post, så följer dina recept med automatiskt och du kan återställa lösenordet själv.</p>
        ${loginForms}
        ${backup}
        <p><button class="btn btn-ghost" id="logout">Logga ut</button></p>`;
    }
    return `<div class="view-head"><h1>Konto</h1></div>
      <p>Utan konto sparas allt bara i den här webbläsaren. Logga in för att nå recepten och listan från mobilen i butiken.</p>
      ${loginForms}
      <details class="prompt-box"><summary>Gammalt konto med namn + PIN?</summary>
        <p class="hint">Logga in en sista gång här, byt sedan till nya inloggningen under Konto.</p>
        <form id="authForm">
          <label>Namn <input type="text" id="authName" autocomplete="username" maxlength="20" required></label>
          <label>PIN-kod <input type="password" id="authPin" inputmode="numeric" autocomplete="current-password" minlength="4" maxlength="64" required></label>
          <p id="authOldError" class="warn" hidden></p>
          <p><button class="btn btn-ghost" type="submit">Logga in</button></p>
        </form>
      </details>
      ${backup}`;
  }

  // ---------- render + händelser ----------
  // Skärmen hålls vaken medan ett recept är uppe (man står och lagar mat).
  let wakeLock = null; // promise för aktivt/väntande lås
  function syncWakeLock() {
    const want = /^#\/recept\//.test(location.hash) && document.visibilityState === 'visible';
    if (want && !wakeLock && navigator.wakeLock) {
      const p = navigator.wakeLock.request('screen').then(l => {
        l.addEventListener('release', () => { if (wakeLock === p) wakeLock = null; });
        return l;
      }).catch(() => { if (wakeLock === p) wakeLock = null; return null; });
      wakeLock = p;
    } else if (!want && wakeLock) {
      wakeLock.then(l => l && l.release().catch(() => {}));
      wakeLock = null;
    }
  }
  document.addEventListener('visibilitychange', syncWakeLock);

  function renderNav() {
    const n = state.selections.length;
    $('#navListCount').textContent = n ? ' (' + n + ')' : '';
    $('#navUser').textContent = loggedIn() && authName ? authName : 'konto';
    const h = location.hash || '#/';
    document.querySelectorAll('.nav a').forEach(a => {
      const m = a.dataset.match;
      let active;
      const recipeMatch = h.match(/^#\/recept\/(.+)$/);
      if (recipeMatch) {
        const id = decodeURIComponent(recipeMatch[1]);
        const mine = state.recipes.some(x => x.id === id);
        active = mine ? m === '#/' : m === '#/allas';
      } else {
        active = m === '#/' ? !h.startsWith('#/lista') && !h.startsWith('#/konto') && !h.startsWith('#/allas') : h.startsWith(m);
      }
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
    else if (h === '#/allas') html = viewAllasRecept();
    else html = viewCatalog();
    $('#view').innerHTML = html;
    renderNav();
    bind();
    syncWakeLock();
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
      delete state.struck[b.dataset.unselect]; // klar med receptet: nollställ bockade ingredienser
      save();
    });
    view.querySelectorAll('[data-ing]').forEach(row => row.onclick = () => {
      const id = decodeURIComponent(location.hash.replace('#/recept/', ''));
      const k = row.dataset.ing;
      const cur = state.struck[id] || [];
      const next = cur.includes(k) ? cur.filter(x => x !== k) : [...cur, k];
      if (next.length) state.struck[id] = next; else delete state.struck[id];
      if (document.startViewTransition) document.startViewTransition(() => save()); else save();
    });
    view.querySelectorAll('[data-card]').forEach(c => c.onclick = e => {
      if (e.target.closest('.card-row, a, button')) return; // knappraden är död zon
      location.hash = '#/recept/' + encodeURIComponent(c.dataset.card);
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
    view.querySelectorAll('[data-share]').forEach(b => b.onclick = async () => {
      const r = findRecipe(b.dataset.share);
      const portions = selFor(r.id)?.portions || previewPortions[r.id] || r.portions;
      try { await navigator.clipboard.writeText(recipeAsText(r, portions)); b.textContent = 'Kopierat till urklipp!'; }
      catch (e) { b.textContent = 'Kunde inte kopiera'; }
      setTimeout(() => { b.textContent = 'Kopiera recept'; }, 2500);
    });
    view.querySelectorAll('[data-add-allas]').forEach(b => b.onclick = () => {
      const id = b.dataset.addAllas;
      const r = starter.find(x => x.id === id) || (allasList || []).find(x => x.id === id);
      if (!r) return;
      const copy = JSON.parse(JSON.stringify(r));
      delete copy.owner;
      if (state.recipes.some(x => x.id === copy.id)) copy.id = slugify(copy.title, state.recipes.map(x => x.id));
      state.recipes.push(copy);
      save();
    });
    view.querySelectorAll('[data-remove-allas]').forEach(b => b.onclick = () => {
      const id = b.dataset.removeAllas;
      state.recipes = state.recipes.filter(x => x.id !== id);
      state.selections = state.selections.filter(s => s.id !== id);
      delete state.struck[id];
      save();
    });
    view.querySelectorAll('[data-delete]').forEach(b => b.onclick = () => {
      const r = state.recipes.find(x => x.id === b.dataset.delete);
      if (!confirm('Ta bort "' + r.title + '"? Tas endast bort från dina recept, går inte att ångra.')) return;
      state.recipes = state.recipes.filter(x => x.id !== r.id);
      state.selections = state.selections.filter(s => s.id !== r.id);
      delete state.struck[r.id];
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
      for (const s of state.selections) delete state.struck[s.id]; // recepten lämnar listan: nollställ bockar
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
          course: $('#edCourse').value,
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
        const recipes = parseImport($('#importText').value, state.recipes.map(r => r.id));
        state.recipes.push(...recipes);
        location.hash = recipes.length === 1 ? '#/recept/' + recipes[0].id : '#/';
        save();
      } catch (err) {
        errEl.textContent = err.message;
        errEl.hidden = false;
      }
    };

    // ---- inloggning (Firebase + legacy) ----
    const showErr = (el, msg) => { el.textContent = msg; el.hidden = false; };
    const googleLogin = $('#googleLogin');
    if (googleLogin) googleLogin.onclick = async () => {
      const errEl = $('#authError');
      errEl.hidden = true;
      if (!fb) return showErr(errEl, 'Inloggningen kunde inte laddas, kontrollera nätet och ladda om sidan.');
      try { await fb.signInWithPopup(fb.auth, new fb.GoogleAuthProvider()); location.hash = '#/'; }
      catch (e) { showErr(errEl, fbErr(e)); }
    };
    const emailForm = $('#emailForm');
    if (emailForm) emailForm.onsubmit = async e => {
      e.preventDefault();
      const errEl = $('#authError');
      errEl.hidden = true;
      if (!fb) return showErr(errEl, 'Inloggningen kunde inte laddas, kontrollera nätet och ladda om sidan.');
      const mode = e.submitter ? e.submitter.dataset.mode : 'login';
      try {
        if (mode === 'register') await fb.createUserWithEmailAndPassword(fb.auth, $('#authEmail').value.trim(), $('#authPw').value);
        else await fb.signInWithEmailAndPassword(fb.auth, $('#authEmail').value.trim(), $('#authPw').value);
        location.hash = '#/';
      } catch (err) { showErr(errEl, fbErr(err)); }
    };
    const forgotPw = $('#forgotPw');
    if (forgotPw) forgotPw.onclick = async () => {
      const errEl = $('#authError');
      errEl.hidden = true;
      const email = $('#authEmail').value.trim();
      if (!fb || !email) return showErr(errEl, 'Fyll i e-postadressen först.');
      try { await fb.sendPasswordResetEmail(fb.auth, email); showErr(errEl, 'Återställningsmejl skickat till ' + email + '.'); }
      catch (err) { showErr(errEl, fbErr(err)); }
    };
    const pwForm = $('#pwForm');
    if (pwForm) pwForm.onsubmit = async e => {
      e.preventDefault();
      try { await fb.updatePassword(fbUser, $('#pwNew').value); render(); }
      catch (err) { showErr($('#pwError'), fbErr(err)); }
    };
    const linkGoogle = $('#linkGoogle');
    if (linkGoogle) linkGoogle.onclick = async () => {
      try { await fb.linkWithPopup(fbUser, new fb.GoogleAuthProvider()); render(); }
      catch (e) { alert(fbErr(e)); }
    };
    const linkForm = $('#linkForm');
    if (linkForm) linkForm.onsubmit = async e => {
      e.preventDefault();
      const errEl = $('#linkError');
      errEl.hidden = true;
      try {
        const data = await api('/login', { method: 'POST', body: JSON.stringify({ name: $('#linkName').value, pin: $('#linkPin').value }) });
        await api('/link', { method: 'POST', body: JSON.stringify({ legacyToken: data.token }) });
        allasList = null;
        await pullState();
        render();
      } catch (err) { showErr(errEl, err.message); }
    };
    const authForm = $('#authForm');
    if (authForm) authForm.onsubmit = async e => {
      e.preventDefault();
      const errEl = $('#authOldError');
      errEl.hidden = true;
      try {
        const data = await api('/login', { method: 'POST', body: JSON.stringify({ name: $('#authName').value, pin: $('#authPin').value }) });
        legacy = { name: data.name, token: data.token };
        authName = data.name;
        localStorage.setItem('auth', JSON.stringify(legacy));
        localStorage.setItem('authName', data.name);
        allasList = null;
        await pullState();
        location.hash = '#/';
        render();
      } catch (err) { showErr(errEl, err.message); }
    };
    const logout = $('#logout');
    if (logout) logout.onclick = async () => {
      if (fbUser && fb) await fb.signOut(fb.auth).catch(() => {});
      legacy = null;
      localStorage.removeItem('auth');
      authName = null;
      localStorage.removeItem('authName');
      allasList = null;
      render();
    };
    const deleteAccount = $('#deleteAccount');
    if (deleteAccount) deleteAccount.onclick = async () => {
      if (!confirm('Radera kontot permanent? Allt på servern försvinner, går inte att ångra. Recepten i den här webbläsaren behålls lokalt.')) return;
      try {
        await api('/account', { method: 'DELETE' });
        if (fbUser) await fbUser.delete(); // raderar Firebase-användaren, triggar onAuthStateChanged(null)
        authName = null;
        localStorage.removeItem('authName');
        allasList = null;
        render();
      } catch (e) { alert(fbErr(e)); }
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

  // Firebase startas efter första renderingen. onAuthStateChanged fyller på när den
  // persisterade sessionen återställts; hade man kvar en legacy-inloggning kopplas den
  // gamla kontoraden automatiskt till Firebase-uid:t (engångsuppgradering).
  function initFirebase() {
    fb = window.fb;
    fb.onAuthStateChanged(fb.auth, async user => {
      fbUser = user;
      if (user) {
        if (legacy) {
          try { await api('/link', { method: 'POST', body: JSON.stringify({ legacyToken: legacy.token }) }); }
          catch (e) { /* redan kopplat eller konflikt: /state avgör vad kontot ser */ }
          legacy = null;
          localStorage.removeItem('auth');
        }
        allasList = null;
        await pullState();
      } else if (!legacy) {
        authName = null;
        localStorage.removeItem('authName');
      }
      render();
    });
  }

  window.addEventListener('hashchange', render);
  if (legacy) await pullState(); // gammal inloggning funkar som förut, utan Firebase
  render();
  if (window.fb) initFirebase(); else window.addEventListener('fb-ready', initFirebase, { once: true });
})();
