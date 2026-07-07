// ponytail: minsta möjliga check av summering/skalning - körs med: node test.js
const assert = require('assert');
const fs = require('fs');
const { aggregate, fmtNum, fmtItem, parseImport, normalizeState, makeBackup, safeUrl, nutritionPerPortion } = require('./app.js');

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

// 4. efter smak: svartpeppar i veg-lasagne saknar mängd
const peppar = items.find(i => i.key === 'svartpeppar');
assert.strictEqual(fmtItem(peppar), 'efter smak');

// 5. svenskt talformat
assert.strictEqual(fmtNum(1234), '1 235', 'avrundas till närmsta 5, tusentalsmellanslag');
assert.strictEqual(fmtNum(2.5), '2,5', 'decimalkomma');

// 6. AI-import: kodstaket + prat runt JSON ska tolereras, fält normaliseras
const aiSvar = 'Här är receptet!\n```json\n{"title":"Testgryta","portions":4,"ingredients":[{"name":"Gul Lök ","amount":110,"unit":"g","count":1,"cat":"grönt"},{"name":"salt","toTaste":true,"cat":"felkategori"},{"name":"vatten","amount":500,"unit":"ml","skipList":true,"cat":"övrigt"}],"steps":["Koka.",""]}\n```';
const imp = parseImport(aiSvar, ['testgryta']);
assert.strictEqual(imp.id, 'testgryta-2', 'krockande id får suffix');
assert.strictEqual(imp.ingredients[0].name, 'Gul Lök', 'namn trimmas');
assert.strictEqual(imp.ingredients[1].cat, 'övrigt', 'okänd kategori faller tillbaka');
assert.strictEqual(imp.ingredients[1].toTaste, true);
assert.strictEqual(imp.ingredients[2].skipList, true);
assert.strictEqual(imp.steps.length, 1, 'tomma steg filtreras');
assert.throws(() => parseImport('inget json här', []), /Hittar ingen JSON/);
assert.throws(() => parseImport('{"portions":4}', []), /title/);

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
});
const restored = normalizeState(backup);
assert.strictEqual(restored.recipes.length, 1, 'backup wrapper läses');
assert.strictEqual(restored.recipes[0].source, '', 'osäker källa följer inte med backup');
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

console.log('Alla test OK');
