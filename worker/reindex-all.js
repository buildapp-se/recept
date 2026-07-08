// Engångs-reindex av ALLA användares blobbar till recipes_index (behövs vid fas 2-deployen:
// befintliga blobbar indexeras annars först vid användarens nästa PUT /state). Rerunnbar.
//   npx wrangler d1 execute recept --remote --command "SELECT id, state FROM users WHERE state != ''" --json > dump.json
//   node reindex-all.js dump.json > reindex.sql
//   npx wrangler d1 execute recept --remote --file reindex.sql     (radera dump.json + reindex.sql efteråt)
const rows = require(require('path').resolve(process.argv[2]))[0].results;
const COURSES = ['forratt', 'huvudratt', 'efterratt', 'dryck', 'sas'];
const normalizeCourse = course => COURSES.includes(course) ? course : 'huvudratt';
const q = s => "'" + String(s).replace(/'/g, "''") + "'";
let sql = '';
for (const { id, state } of rows) {
  let s;
  try { s = JSON.parse(state); } catch (e) { continue; }
  if (!s || !Array.isArray(s.recipes)) continue;
  sql += `DELETE FROM recipes_index WHERE owner_id = ${id};\n`;
  for (const r of s.recipes) {
    if (r.private === true || !r.id || !r.title) continue;
    const data = { ...r, course: normalizeCourse(r.course) };
    sql += `INSERT INTO recipes_index (owner_id, id, title, course, visibility, saves_count, data)
  VALUES (${id}, ${q(r.id)}, ${q(r.title)}, ${q(data.course)}, 'public',
    (SELECT COUNT(*) FROM saves WHERE owner_id = ${id} AND recipe_id = ${q(r.id)}), ${q(JSON.stringify(data))});\n`;
  }
}
process.stdout.write(sql);
