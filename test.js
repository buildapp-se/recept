// ponytail: minsta möjliga check av summering/skalning - körs med: node test.js
const assert = require('assert');
const fs = require('fs');
const { aggregate, fmtNum, fmtItem, fmtIngredient, recipeAsText, spiceHint, parseImport, normalizeState, makeBackup, safeUrl, nutritionPerPortion, COURSES, normalizeCourse, dedupeAllas } = require('./app.js');

const recipes = JSON.parse(fs.readFileSync(__dirname + '/starter.json', 'utf8'));

// 1. Summering över två recept: vitlök finns i både köttfärssås (20 g) och kebab (5 g)
let items = aggregate(recipes, [{ id: 'kottfarssas', portions: 6 }, { id: 'kebab', portions: 6 }]);
const vitlok = items.find(i => i.key === 'vitlök');
assert.strictEqual(vitlok.amount, 25, 'vitlök ska summeras till 25 g');
assert.strictEqual(vitlok.count, 5, 'vitlök ~5 klyftor');
assert.strictEqual(vitlok.sources.length, 2, 'två källrecept');
const olivolja = items.find(i => i.key === 'olivolja');
assert.strictEqual(olivolja.amount, 170, 'olivolja 100+70 ml');

// 2. Skalning: veg-lasagne 16 -> 4 portioner = fjärdedel
items = aggregate(recipes, [{ id: 'veg-lasagne', portions: 4 }]);
assert.strictEqual(items.find(i => i.key === 'lasagneplattor').amount, 250, 'lasagneplattor 1000/4');
assert.strictEqual(items.find(i => i.key === 'riven ost').amount, 65, 'riven ost (160+100)/4');

// 3. skipList: vatten ska inte hamna i listan
assert.ok(!items.find(i => i.key === 'vatten'), 'vatten utesluts');

// 3b. struck: bockade ingredienser (har hemma/redan i grytan) utesluts per recept
items = aggregate(recipes, [{ id: 'kottfarssas', portions: 6 }, { id: 'kebab', portions: 6 }], { kottfarssas: ['vitlök'] });
assert.strictEqual(items.find(i => i.key === 'vitlök').amount, 5, 'bara kebabens vitlök kvar');
items = aggregate(recipes, [{ id: 'kottfarssas', portions: 6 }], { kottfarssas: ['vitlök'] });
assert.ok(!items.find(i => i.key === 'vitlök'), 'helt bockad vara försvinner ur listan');

// 4. efter smak: svartpeppar i veg-lasagne saknar mängd
const peppar = items.find(i => i.key === 'svartpeppar');
assert.strictEqual(fmtItem(peppar), 'efter smak');

// 5. svenskt talformat
assert.strictEqual(fmtNum(1234), '1 235', 'avrundas till närmsta 5, tusentalsmellanslag');
assert.strictEqual(fmtNum(2.5), '2,5', 'decimalkomma');

// 6. AI-import: kodstaket + prat runt JSON ska tolereras, fält normaliseras, alltid array tillbaka
const aiSvar = 'Här är receptet!\n```json\n{"title":"Testgryta","portions":4,"ingredients":[{"name":"Gul Lök ","amount":110,"unit":"g","count":1,"cat":"grönt"},{"name":"salt","toTaste":true,"cat":"felkategori"},{"name":"vatten","amount":500,"unit":"ml","skipList":true,"cat":"övrigt"}],"steps":["Koka.",""]}\n```';
const [imp, ...rest] = parseImport(aiSvar, ['testgryta']);
assert.strictEqual(rest.length, 0, 'enstaka objekt ger array med ett recept');
assert.strictEqual(imp.id, 'testgryta-2', 'krockande id får suffix');
assert.strictEqual(imp.ingredients[0].name, 'Gul Lök', 'namn trimmas');
assert.strictEqual(imp.ingredients[1].cat, 'övrigt', 'okänd kategori faller tillbaka');
assert.strictEqual(imp.ingredients[1].toTaste, true);
assert.strictEqual(imp.ingredients[2].skipList, true);
assert.strictEqual(imp.steps.length, 1, 'tomma steg filtreras');
assert.strictEqual(imp.course, 'huvudratt', 'saknad/okänd course faller tillbaka till huvudratt');
assert.throws(() => parseImport('inget json här', []), /Hittar ingen JSON/);
assert.throws(() => parseImport('{"portions":4}', []), /title/);

// 6b. AI-import av flera recept i en array: id-krock inom batchen, allt eller inget vid fel
const ing = '[{"name":"pasta","amount":200,"unit":"g","cat":"skafferi"}]';
const multi = parseImport(`Här! [{"title":"Soppa","ingredients":${ing}},{"title":"Soppa","ingredients":${ing}}]`, []);
assert.strictEqual(multi.length, 2, 'två recept läses in');
assert.strictEqual(multi[0].id, 'soppa');
assert.strictEqual(multi[1].id, 'soppa-2', 'id-krock inom samma inklistring får suffix');
assert.throws(() => parseImport(`[{"title":"Ok","ingredients":${ing}},{"portions":4}]`, []), /Recept 2: .*title/, 'fel pekar ut vilket recept, inget importeras');
assert.throws(() => parseImport('[]', []), /tom/);
const [medHakar] = parseImport(`prat [med hakar] i {"title":"Hak","ingredients":${ing}} slutet]`, []);
assert.strictEqual(medHakar.id, 'hak', 'hakparenteser i prat runt ett objekt lurar inte tolkningen');

// 7. Backup: wrapper + rå state tolereras, trasiga/okända fält normaliseras
assert.strictEqual(safeUrl('javascript:alert(1)'), '', 'osäkra käll-länkar stoppas');
const backup = makeBackup({
  recipes: [{
    id: 'test',
    title: 'Backuprecept',
    portions: 2,
    source: 'javascript:alert(1)',
    ingredients: [{ name: 'pasta', amount: 200, unit: 'g', cat: 'skafferi' }],
    steps: ['Koka.'],
  }],
  selections: [{ id: 'test', portions: 2 }, { id: 'saknas', portions: 4 }],
  extras: [{ id: 1, text: 'mjölk' }],
  checked: ['pasta'],
  struck: { test: ['pasta'], saknas: ['x'], trasig: 'inte en array' },
});
const restored = normalizeState(backup);
assert.strictEqual(restored.recipes.length, 1, 'backup wrapper läses');
assert.deepStrictEqual(restored.struck, { test: ['pasta'] }, 'struck utan recept eller med trasigt format filtreras');
assert.deepStrictEqual(normalizeState({ recipes: [] }).struck, {}, 'gammal state utan struck får tomt objekt');
assert.strictEqual(restored.recipes[0].source, '', 'osäker källa följer inte med backup');
assert.strictEqual(restored.recipes[0].course, 'huvudratt', 'saknad course i backup faller tillbaka till huvudratt');
assert.ok(COURSES.includes('sas'), 'såser & röror finns som course');
assert.strictEqual(restored.selections.length, 1, 'val utan recept filtreras');
assert.strictEqual(normalizeState(restored).extras[0].text, 'mjölk', 'rå state kan också återställas');

// 8. Näringsvärde per portion: skalning, efter smak-uteslutning, saknad data flaggas
const testNutrients = { 'lök': { kcal: 40, protein: 1, carbs: 9, fat: 0.1 }, 'salt': { kcal: 0, protein: 0, carbs: 0, fat: 0 } };
const testRecipe = { portions: 2, ingredients: [
  { name: 'lök', amount: 200 },
  { name: 'salt', toTaste: true },
  { name: 'okänd ingrediens', amount: 100 },
] };
const nutr = nutritionPerPortion(testRecipe, testNutrients);
assert.strictEqual(nutr.kcal, 40, 'lök 200 g à 40 kcal/100g delat på 2 portioner = 40 kcal/portion');
assert.deepStrictEqual(nutr.missing, ['okänd ingrediens'], 'okänd ingrediens flaggas, efter smak räknas inte som saknad');

// 9. spiceHint: krm/tsk/msk-gissning för ovägda kryddor, bara för skafferi under 30 g utan count
assert.strictEqual(spiceHint(2, 'g', 'skafferi'), '2 krm');
assert.strictEqual(spiceHint(10, 'g', 'skafferi'), '2 tsk');
assert.strictEqual(spiceHint(30, 'g', 'skafferi'), '2 msk');
assert.strictEqual(spiceHint(50, 'g', 'skafferi'), '', 'för stor mängd, ingen gissning');
assert.strictEqual(spiceHint(5, 'g', 'grönt'), '', 'bara skafferi');
assert.strictEqual(spiceHint(5, 'ml', 'skafferi'), '', 'bara g, redan volym i ml');
assert.strictEqual(fmtIngredient({ amount: 3, unit: 'g', cat: 'skafferi' }, 1), '3 g (~3 krm)');
assert.strictEqual(fmtIngredient({ amount: 220, unit: 'g', count: 2, countUnit: 'st', cat: 'grönt' }, 1), '220 g (~2 st)', 'count vinner över spiceHint');

// 10. Allas recept: startpaket-id:n filtreras bort, ägarnamn visas på andras recept
const allasList = [
  { id: 'starter-1', title: 'Redan i startpaketet', owner: 'julia' },
  { id: 'unik', title: 'Bara julias', owner: 'julia' },
  { id: 'kollision', title: 'Kollision A', owner: 'julia' },
  { id: 'kollision', title: 'Kollision B', owner: 'hans' },
];
const others = dedupeAllas(allasList, ['starter-1']);
assert.strictEqual(others.length, 3, 'startpaket-id filtreras bort');
assert.strictEqual(others.find(r => r.id === 'unik')._ownerLabel, 'julia', 'ägaretikett visas alltid för andras recept');
assert.strictEqual(others.find(r => r.id === 'unik')._idCollision, false, 'unik slug flaggas inte som krock');
assert.strictEqual(others.find(r => r.owner === 'julia' && r.id === 'kollision')._ownerLabel, 'julia', 'ägaretikett vid krock');
assert.strictEqual(others.find(r => r.owner === 'hans')._ownerLabel, 'hans', 'ägaretikett vid krock');
assert.strictEqual(others.find(r => r.owner === 'hans')._idCollision, true, 'slug-krock flaggas');
assert.strictEqual(normalizeCourse('Huvudrätt'), 'huvudratt', 'visningsetikett som course normaliseras till huvudratt');
assert.strictEqual(normalizeCourse('huvudratt'), 'huvudratt', 'giltig course behålls');

// 10b. private + src överlever normalisering (sync/backup), skräp-src slängs
const privState = normalizeState({ recipes: [
  { id: 'hemlis', title: 'Hemlis', private: true, ingredients: [{ name: 'pasta', amount: 200, unit: 'g', cat: 'skafferi' }] },
  { id: 'sparad', title: 'Sparad', src: { owner: 3, id: 'original' }, ingredients: [{ name: 'pasta', amount: 200, unit: 'g', cat: 'skafferi' }] },
  { id: 'trasig-src', title: 'Trasig', src: { owner: 'inte-ett-tal' }, ingredients: [{ name: 'pasta', amount: 200, unit: 'g', cat: 'skafferi' }] },
] });
assert.strictEqual(privState.recipes[0].private, true, 'private överlever normalisering');
assert.strictEqual(privState.recipes[1].private, undefined, 'private smittar inte');
assert.deepStrictEqual(privState.recipes[1].src, { owner: 3, id: 'original' }, 'src överlever normalisering');
assert.strictEqual(privState.recipes[2].src, undefined, 'trasig src slängs');

// 11. Kopiera recept: ren text för sms/texteditor, inte JSON
const copyRecipe = {
  title: 'Testpasta',
  portions: 2,
  source: 'https://example.com/recept',
  ingredients: [
    { name: 'pasta', amount: 200, unit: 'g', cat: 'skafferi' },
    { name: 'salt', toTaste: true, cat: 'skafferi', group: 'Sås' },
  ],
  steps: ['Koka pastan.', 'Blanda med såsen.'],
};
assert.strictEqual(recipeAsText(copyRecipe, 4), [
  'Testpasta',
  '',
  '4 portioner',
  '',
  'Ingredienser',
  '- pasta: 400 g',
  '',
  'Sås',
  '- salt: efter smak',
  '',
  'Gör så här',
  '1. Koka pastan.',
  '2. Blanda med såsen.',
  '',
  'Källa',
  'https://example.com/recept',
].join('\n'), 'kopierat recept är läsbar ren text');

console.log('Alla test OK');
