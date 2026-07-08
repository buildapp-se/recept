CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  pin_hash TEXT NOT NULL,          -- 'salt:sha256hex(salt+pin)', '' för rena Firebase-konton
  token TEXT UNIQUE NOT NULL,      -- legacy bearer-token, slumpad och oanvänd för Firebase-konton
  state TEXT NOT NULL DEFAULT '',
  firebase_uid TEXT                -- tillagd 2026-07-08 (ALTER TABLE), NULL för olänkade legacy-konton
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_firebase_uid ON users(firebase_uid);
