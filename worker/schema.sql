CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  pin_hash TEXT NOT NULL,          -- 'salt:sha256hex(salt+pin)', '' för rena Firebase-konton
  token TEXT UNIQUE NOT NULL,      -- legacy bearer-token, slumpad och oanvänd för Firebase-konton
  state TEXT NOT NULL DEFAULT '',
  firebase_uid TEXT                -- tillagd 2026-07-08 (ALTER TABLE), NULL för olänkade legacy-konton
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_firebase_uid ON users(firebase_uid);

-- Deriverat index över icke-privata recept, skrivs om per ägare vid PUT /state.
-- Kan alltid byggas om från users.state. saves är sanningen för saves_count.
CREATE TABLE IF NOT EXISTS recipes_index (
  owner_id INTEGER NOT NULL,
  id TEXT NOT NULL,                          -- receptets slug, unik per ägare
  title TEXT NOT NULL,
  course TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'public', -- TEXT så "grupper" kan läggas till utan migrering
  saves_count INTEGER NOT NULL DEFAULT 0,
  data TEXT NOT NULL,                        -- hela recept-JSON:en
  PRIMARY KEY (owner_id, id)
);
CREATE INDEX IF NOT EXISTS idx_index_course_saves ON recipes_index(course, saves_count);

CREATE TABLE IF NOT EXISTS saves (
  user_id INTEGER NOT NULL,
  owner_id INTEGER NOT NULL,
  recipe_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, owner_id, recipe_id)
);
