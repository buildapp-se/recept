// Genererar SQL som lägger/uppdaterar systemkontot "grammat" med starter.json-recepten,
// så publika fliken har EN källa. Rerunnbar (kör om när starter.json ändras):
//   node worker/seed-grammat.js > worker/seed-grammat.sql
//   npx wrangler d1 execute recept --local  --file seed-grammat.sql   (i worker/)
//   npx wrangler d1 execute recept --remote --file seed-grammat.sql
const { randomUUID } = require('crypto');
const starter = require('../starter.json');
const q = s => "'" + String(s).replace(/'/g, "''") + "'";
const state = { recipes: starter, selections: [], extras: [], checked: [], struck: {} };

const OWNER = "(SELECT id FROM users WHERE name = 'grammat')";
let sql = `INSERT INTO users (name, pin_hash, token, state) VALUES ('grammat', '', ${q(randomUUID())}, ${q(JSON.stringify(state))})
  ON CONFLICT(name) DO UPDATE SET state = excluded.state;
DELETE FROM recipes_index WHERE owner_id = ${OWNER};
`;
for (const r of starter) {
  sql += `INSERT INTO recipes_index (owner_id, id, title, course, visibility, saves_count, data)
  VALUES (${OWNER}, ${q(r.id)}, ${q(r.title)}, ${q(r.course || 'huvudratt')}, 'public',
    (SELECT COUNT(*) FROM saves WHERE owner_id = ${OWNER} AND recipe_id = ${q(r.id)}), ${q(JSON.stringify(r))});
`;
}
process.stdout.write(sql);
