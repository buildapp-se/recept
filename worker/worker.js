// API för "Grammat" (buildapp.se/grammat)
// Auth: Firebase ID-token (JWT, verifieras mot Googles JWKS) ELLER legacy uuid-token (utfasas).
// POST /register {name,pin} -> {token,name}   (legacy, utfasas)
// POST /login    {name,pin} -> {token,name}   (legacy, utfasas)
// POST /link     (Bearer Firebase-JWT) {legacyToken} -> {ok,name}  kopplar gammalt konto till Firebase-uid
// PUT  /name   (Bearer) {name} -> {ok,name}  byter kontonamn (unikt, 409 vid krock)
// GET  /state  (Bearer) -> {state,name}
// PUT  /state  (Bearer) <- hela state-blobben {recipes,selections,extras,checked,struck}
// GET  /allas-recept (Bearer) -> [{...recipe, owner}, ...] från alla konton (utfasas, ersatt av /feed)
// GET  /feed   (Bearer) -> [{...recipe, owner, ownerId, saves}, ...] ur recipes_index
// GET  /users/:id/recipes (Bearer) -> {owner, ownerId, recipes:[...]} offentliga skapade recept
// GET  /friends-feed (Bearer) -> [{...recipe, owner, ownerId, saves}, ...] fran gruppmedlemmar
// GET  /groups (Bearer) -> [{id,name,createdBy,canInvite,members:[...]}]
// POST /groups (Bearer) {name} -> {id,name}
// DELETE /groups/:id (Bearer) -> {ok}  bara skaparen
// POST /groups/:id/invite (Bearer) -> {code,expiresAt}
// POST /join/:code (Bearer) -> {ok,group}
// POST /save   (Bearer) {ownerId,recipeId} -> {ok,saves}   registrerar sparning
// DELETE /save (Bearer) {ownerId,recipeId} -> {ok,saves}   tar bort sparning
// DELETE /account (Bearer Firebase-JWT) -> {ok}  raderar D1-raden (Firebase-usern raderas client-side)
const FIREBASE_PROJECT = 'grammat-78450';
const COURSES = ['forratt', 'huvudratt', 'efterratt', 'dryck', 'sas'];
const normalizeCourse = course => COURSES.includes(course) ? course : 'huvudratt';
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};
const json = (d, s = 200) => Response.json(d, { status: s, headers: cors });

async function sha256hex(s) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}

// ---- Firebase ID-token-verifiering (RS256 mot Googles publika JWKS, ingen SDK) ----
let jwksCache = null, jwksExpires = 0;
async function googleJwk(kid) {
  if (!jwksCache || Date.now() > jwksExpires) {
    const res = await fetch('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com');
    if (!res.ok) return null;
    const m = /max-age=(\d+)/.exec(res.headers.get('Cache-Control') || '');
    jwksExpires = Date.now() + (m ? Number(m[1]) : 3600) * 1000;
    jwksCache = (await res.json()).keys;
  }
  return jwksCache.find(k => k.kid === kid) || null;
}

function b64urlToBytes(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  s += '='.repeat((4 - (s.length % 4)) % 4);
  return Uint8Array.from(atob(s), c => c.charCodeAt(0));
}

async function verifyFirebaseToken(token) {
  try {
    const [h, p, sig] = token.split('.');
    const header = JSON.parse(new TextDecoder().decode(b64urlToBytes(h)));
    if (header.alg !== 'RS256') return null;
    const jwk = await googleJwk(header.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlToBytes(sig), new TextEncoder().encode(h + '.' + p));
    if (!ok) return null;
    const c = JSON.parse(new TextDecoder().decode(b64urlToBytes(p)));
    const now = Date.now() / 1000;
    if (c.aud !== FIREBASE_PROJECT || c.iss !== 'https://securetoken.google.com/' + FIREBASE_PROJECT) return null;
    if (!(c.exp > now) || !c.sub) return null;
    return c;
  } catch (e) {
    return null;
  }
}

// Första Firebase-inloggningen: skapa D1-rad. Namn från Google-displayName eller mejlens lokaldel,
// unikgörs med siffersuffix. pin_hash '' = kan inte PIN-loggas; token slumpas men lämnar aldrig servern.
async function createFirebaseUser(env, claims) {
  let base = String(claims.name || (claims.email || '').split('@')[0] || '')
    .toLowerCase().replace(/[^a-zåäö0-9_-]+/g, '').slice(0, 16);
  if (base.length < 2) base = 'kock';
  for (let i = 0; i < 100; i++) {
    try {
      await env.DB.prepare('INSERT INTO users (name, pin_hash, token, state, firebase_uid) VALUES (?,?,?,?,?)')
        .bind(i ? base + i : base, '', crypto.randomUUID(), '', claims.sub).run();
    } catch (e) {
      // namnkrock: prova nästa suffix. uid-krock (dubbelanrop): raden finns, hämta den.
      const existing = await env.DB.prepare('SELECT * FROM users WHERE firebase_uid = ?').bind(claims.sub).first();
      if (existing) return existing;
      continue;
    }
    return env.DB.prepare('SELECT * FROM users WHERE firebase_uid = ?').bind(claims.sub).first();
  }
  return null;
}

// Skriver om ägarens rader i recipes_index från state-bloben (privata recept hoppas över,
// de kan aldrig läcka via flöden). saves-tabellen är sanningen för saves_count.
// ponytail: DELETE+INSERT allt per PUT, diffa först om skrivvolymen börjar kosta.
function reindexStmts(env, ownerId, recipes) {
  const stmts = [env.DB.prepare('DELETE FROM recipes_index WHERE owner_id = ?').bind(ownerId)];
  for (const r of recipes) {
    // r.src = sparad kopia av någon annans recept: originalägarens index har den redan
    if (r.private === true || r.src || !r.id || !r.title) continue;
    stmts.push(env.DB.prepare(
      `INSERT INTO recipes_index (owner_id, id, title, course, visibility, saves_count, data)
       VALUES (?,?,?,?,'public',(SELECT COUNT(*) FROM saves WHERE owner_id = ? AND recipe_id = ?),?)`
    ).bind(ownerId, String(r.id), String(r.title), normalizeCourse(r.course), ownerId, String(r.id), JSON.stringify({ ...r, course: normalizeCourse(r.course) })));
  }
  return stmts;
}

function inviteCode() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase();
}

function rowRecipe(r) {
  return { ...JSON.parse(r.data), owner: r.owner, ownerId: r.owner_id, saves: r.saves_count };
}

async function userFromRequest(req, env) {
  const t = (req.headers.get('Authorization') || '').replace(/^Bearer /, '');
  if (!t) return null;
  if (t.split('.').length === 3) {
    const claims = await verifyFirebaseToken(t);
    if (!claims) return null;
    const u = await env.DB.prepare('SELECT * FROM users WHERE firebase_uid = ?').bind(claims.sub).first();
    return u || createFirebaseUser(env, claims);
  }
  return env.DB.prepare('SELECT * FROM users WHERE token = ?').bind(t).first();
}

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    const path = new URL(req.url).pathname;
    try {
      if (req.method === 'POST' && (path === '/register' || path === '/login')) {
        const b = await req.json().catch(() => ({}));
        const name = String(b.name || '').trim().toLowerCase();
        const pin = String(b.pin || '');
        if (!/^[a-zåäö0-9_-]{2,20}$/.test(name) || pin.length < 4 || pin.length > 64) {
          return json({ error: 'Namn 2–20 tecken (bokstäver/siffror), PIN minst 4 tecken.' }, 400);
        }
        if (path === '/register') {
          const salt = crypto.randomUUID();
          const token = crypto.randomUUID();
          const hash = await sha256hex(salt + pin);
          try {
            await env.DB.prepare('INSERT INTO users (name, pin_hash, token, state) VALUES (?,?,?,?)')
              .bind(name, salt + ':' + hash, token, '').run();
          } catch (e) {
            return json({ error: 'Namnet är upptaget.' }, 409);
          }
          return json({ token, name });
        }
        const u = await env.DB.prepare('SELECT * FROM users WHERE name = ?').bind(name).first();
        if (!u || !u.pin_hash.includes(':')) return json({ error: 'Fel namn eller PIN.' }, 401);
        const [salt, hash] = u.pin_hash.split(':');
        if (await sha256hex(salt + pin) !== hash) return json({ error: 'Fel namn eller PIN.' }, 401);
        return json({ token: u.token, name });
      }

      // Koppla gammalt namn+PIN-konto till inloggad Firebase-användare.
      // Kräver JWT + det gamla kontots token (bevisar innehav utan att PIN skickas igen).
      if (path === '/link' && req.method === 'POST') {
        const t = (req.headers.get('Authorization') || '').replace(/^Bearer /, '');
        const claims = t.split('.').length === 3 ? await verifyFirebaseToken(t) : null;
        if (!claims) return json({ error: 'Inte inloggad.' }, 401);
        const b = await req.json().catch(() => ({}));
        const legacy = await env.DB.prepare('SELECT * FROM users WHERE token = ?').bind(String(b.legacyToken || '')).first();
        if (!legacy) return json({ error: 'Hittar inte det gamla kontot.' }, 404);
        if (legacy.firebase_uid === claims.sub) return json({ ok: true, name: legacy.name });
        if (legacy.firebase_uid) return json({ error: 'Kontot är redan kopplat till en annan inloggning.' }, 409);
        const current = await env.DB.prepare('SELECT * FROM users WHERE firebase_uid = ?').bind(claims.sub).first();
        if (current) {
          if (current.state && current.state !== '') return json({ error: 'Din nya inloggning har redan egna recept, kan inte koppla ihop automatiskt.' }, 409);
          await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(current.id).run();
        }
        await env.DB.prepare('UPDATE users SET firebase_uid = ? WHERE id = ?').bind(claims.sub, legacy.id).run();
        return json({ ok: true, name: legacy.name });
      }

      if (path === '/name' && req.method === 'PUT') {
        const u = await userFromRequest(req, env);
        if (!u) return json({ error: 'Inte inloggad.' }, 401);
        const b = await req.json().catch(() => ({}));
        const name = String(b.name || '').trim().toLowerCase();
        if (!/^[a-zåäö0-9_-]{2,20}$/.test(name)) return json({ error: 'Namn 2–20 tecken (små bokstäver, siffror, - eller _).' }, 400);
        if (name === u.name) return json({ ok: true, name });
        try {
          await env.DB.prepare('UPDATE users SET name = ? WHERE id = ?').bind(name, u.id).run();
        } catch (e) {
          return json({ error: 'Namnet är upptaget.' }, 409);
        }
        return json({ ok: true, name });
      }

      if (path === '/allas-recept' && req.method === 'GET') {
        const u = await userFromRequest(req, env);
        if (!u) return json({ error: 'Inte inloggad.' }, 401);
        const { results } = await env.DB.prepare('SELECT name, state FROM users').all();
        const out = [];
        for (const row of results) {
          if (!row.state) continue;
          let s;
          try { s = JSON.parse(row.state); } catch (e) { continue; }
          if (!s || !Array.isArray(s.recipes)) continue;
          for (const r of s.recipes) { if (r.private !== true) out.push({ ...r, owner: row.name }); }
        }
        return json(out);
      }

      if (path === '/state') {
        const u = await userFromRequest(req, env);
        if (!u) return json({ error: 'Inte inloggad.' }, 401);
        if (req.method === 'GET') return json({ state: u.state ? JSON.parse(u.state) : null, name: u.name });
        if (req.method === 'PUT') {
          const body = await req.text();
          if (body.length > 262144) return json({ error: 'För mycket data (max 256 kB).' }, 413);
          let s;
          try { s = JSON.parse(body); } catch (e) { return json({ error: 'Ogiltig data.' }, 400); }
          if (!s || typeof s !== 'object' || !Array.isArray(s.recipes)) return json({ error: 'Ogiltig data.' }, 400);
          await env.DB.batch([
            env.DB.prepare('UPDATE users SET state = ? WHERE id = ?').bind(JSON.stringify(s), u.id),
            ...reindexStmts(env, u.id, s.recipes),
          ]);
          return json({ ok: true });
        }
      }

      // Publika fliken: läser indexet, aldrig blobbarna. Mest sparade först.
      // ponytail: LIMIT utan offset-paginering, riktig paginering när sajten närmar sig 200 publika recept.
      if (path === '/feed' && req.method === 'GET') {
        const u = await userFromRequest(req, env);
        if (!u) return json({ error: 'Inte inloggad.' }, 401);
        const { results } = await env.DB.prepare(
          `SELECT i.owner_id, i.saves_count, i.data, u.name AS owner FROM recipes_index i
           JOIN users u ON u.id = i.owner_id WHERE i.visibility = 'public'
           ORDER BY i.saves_count DESC, i.title LIMIT 200`).all();
        return json(results.map(rowRecipe));
      }

      if (path === '/friends-feed' && req.method === 'GET') {
        const u = await userFromRequest(req, env);
        if (!u) return json({ error: 'Inte inloggad.' }, 401);
        const { results } = await env.DB.prepare(
          `SELECT i.owner_id, i.saves_count, i.data, users.name AS owner FROM recipes_index i
           JOIN users ON users.id = i.owner_id
           WHERE i.visibility = 'public' AND i.owner_id IN (
             SELECT DISTINCT gm2.user_id
             FROM group_members gm1
             JOIN group_members gm2 ON gm2.group_id = gm1.group_id
             WHERE gm1.user_id = ? AND gm2.user_id <> ?
           )
           ORDER BY i.saves_count DESC, i.title LIMIT 200`).bind(u.id, u.id).all();
        return json(results.map(rowRecipe));
      }

      const userRecipes = path.match(/^\/users\/(\d+)\/recipes$/);
      if (userRecipes && req.method === 'GET') {
        const u = await userFromRequest(req, env);
        if (!u) return json({ error: 'Inte inloggad.' }, 401);
        const ownerId = Number(userRecipes[1]);
        const owner = await env.DB.prepare('SELECT id, name FROM users WHERE id = ?').bind(ownerId).first();
        if (!owner) return json({ error: 'Användaren finns inte.' }, 404);
        const { results } = await env.DB.prepare(
          `SELECT i.owner_id, i.saves_count, i.data, u.name AS owner FROM recipes_index i
           JOIN users u ON u.id = i.owner_id
           WHERE i.visibility = 'public' AND i.owner_id = ?
           ORDER BY i.saves_count DESC, i.title LIMIT 200`).bind(ownerId).all();
        return json({
          owner: owner.name,
          ownerId,
          recipes: results.map(rowRecipe),
        });
      }

      if (path === '/groups' && req.method === 'GET') {
        const u = await userFromRequest(req, env);
        if (!u) return json({ error: 'Inte inloggad.' }, 401);
        const { results: groups } = await env.DB.prepare(
          `SELECT g.id, g.name, g.created_by FROM groups g
           JOIN group_members gm ON gm.group_id = g.id
           WHERE gm.user_id = ?
           ORDER BY g.created_at, g.name`).bind(u.id).all();
        const out = [];
        for (const g of groups) {
          const { results: members } = await env.DB.prepare(
            `SELECT users.id, users.name FROM group_members gm
             JOIN users ON users.id = gm.user_id
             WHERE gm.group_id = ?
             ORDER BY gm.joined_at, users.name`).bind(g.id).all();
          out.push({ id: g.id, name: g.name, createdBy: g.created_by, canInvite: g.created_by === u.id, members });
        }
        return json(out);
      }

      if (path === '/groups' && req.method === 'POST') {
        const u = await userFromRequest(req, env);
        if (!u) return json({ error: 'Inte inloggad.' }, 401);
        const b = await req.json().catch(() => ({}));
        const name = String(b.name || '').trim().slice(0, 40);
        if (name.length < 2) return json({ error: 'Gruppnamnet beh\u00f6ver minst 2 tecken.' }, 400);
        const created = await env.DB.prepare('INSERT INTO groups (name, created_by) VALUES (?,?)').bind(name, u.id).run();
        const id = created.meta.last_row_id;
        await env.DB.prepare('INSERT INTO group_members (group_id, user_id) VALUES (?,?)').bind(id, u.id).run();
        return json({ id, name });
      }

      const groupDel = path.match(/^\/groups\/(\d+)$/);
      if (groupDel && req.method === 'DELETE') {
        const u = await userFromRequest(req, env);
        if (!u) return json({ error: 'Inte inloggad.' }, 401);
        const groupId = Number(groupDel[1]);
        const group = await env.DB.prepare('SELECT id, created_by FROM groups WHERE id = ?').bind(groupId).first();
        if (!group) return json({ error: 'Gruppen finns inte.' }, 404);
        if (group.created_by !== u.id) return json({ error: 'Bara gruppskaparen kan ta bort gruppen.' }, 403);
        await env.DB.batch([
          env.DB.prepare('DELETE FROM invites WHERE group_id = ?').bind(groupId),
          env.DB.prepare('DELETE FROM group_members WHERE group_id = ?').bind(groupId),
          env.DB.prepare('DELETE FROM groups WHERE id = ?').bind(groupId),
        ]);
        return json({ ok: true });
      }

      const groupInvite = path.match(/^\/groups\/(\d+)\/invite$/);
      if (groupInvite && req.method === 'POST') {
        const u = await userFromRequest(req, env);
        if (!u) return json({ error: 'Inte inloggad.' }, 401);
        const groupId = Number(groupInvite[1]);
        const group = await env.DB.prepare('SELECT id, created_by FROM groups WHERE id = ?').bind(groupId).first();
        if (!group) return json({ error: 'Gruppen finns inte.' }, 404);
        if (group.created_by !== u.id) return json({ error: 'Bara gruppskaparen kan bjuda in.' }, 403);
        for (let i = 0; i < 5; i++) {
          const code = inviteCode();
          try {
            await env.DB.prepare(
              `INSERT INTO invites (code, group_id, created_by, expires_at)
               VALUES (?,?,?,datetime('now','+14 days'))`
            ).bind(code, groupId, u.id).run();
            const row = await env.DB.prepare('SELECT expires_at FROM invites WHERE code = ?').bind(code).first();
            return json({ code, expiresAt: row.expires_at });
          } catch (e) {}
        }
        return json({ error: 'Kunde inte skapa inbjudan.' }, 500);
      }

      const joinInvite = path.match(/^\/join\/([A-Z0-9]{6,16})$/);
      if (joinInvite && req.method === 'POST') {
        const u = await userFromRequest(req, env);
        if (!u) return json({ error: 'Inte inloggad.' }, 401);
        const code = joinInvite[1];
        const invite = await env.DB.prepare(
          `SELECT i.code, i.group_id, i.used_by, g.name
           FROM invites i JOIN groups g ON g.id = i.group_id
           WHERE i.code = ? AND i.expires_at > datetime('now')`).bind(code).first();
        if (!invite) return json({ error: 'Inbjudan finns inte eller har g\u00e5tt ut.' }, 404);
        if (invite.used_by && invite.used_by !== u.id) return json({ error: 'Inbjudan \u00e4r redan anv\u00e4nd.' }, 409);
        await env.DB.batch([
          env.DB.prepare('INSERT OR IGNORE INTO group_members (group_id, user_id) VALUES (?,?)').bind(invite.group_id, u.id),
          env.DB.prepare('UPDATE invites SET used_by = ? WHERE code = ? AND (used_by IS NULL OR used_by = ?)').bind(u.id, code, u.id),
        ]);
        return json({ ok: true, group: { id: invite.group_id, name: invite.name } });
      }

      // Sparräknaren: registreras när "Lägg till i mina recept" trycks, PK gör dubbelsparning ofarlig.
      if (path === '/save' && (req.method === 'POST' || req.method === 'DELETE')) {
        const u = await userFromRequest(req, env);
        if (!u) return json({ error: 'Inte inloggad.' }, 401);
        const b = await req.json().catch(() => ({}));
        const ownerId = Number(b.ownerId), recipeId = String(b.recipeId || '');
        if (!Number.isInteger(ownerId) || !recipeId) return json({ error: 'Ogiltig data.' }, 400);
        const write = req.method === 'POST'
          ? env.DB.prepare('INSERT OR IGNORE INTO saves (user_id, owner_id, recipe_id) VALUES (?,?,?)').bind(u.id, ownerId, recipeId)
          : env.DB.prepare('DELETE FROM saves WHERE user_id = ? AND owner_id = ? AND recipe_id = ?').bind(u.id, ownerId, recipeId);
        // räknaren sätts från saves (sanningen), aldrig +1/-1: idempotent, kan inte driva
        const [, , row] = await env.DB.batch([
          write,
          env.DB.prepare(`UPDATE recipes_index SET saves_count =
            (SELECT COUNT(*) FROM saves WHERE owner_id = ? AND recipe_id = ?)
            WHERE owner_id = ? AND id = ?`).bind(ownerId, recipeId, ownerId, recipeId),
          env.DB.prepare('SELECT saves_count FROM recipes_index WHERE owner_id = ? AND id = ?').bind(ownerId, recipeId),
        ]);
        return json({ ok: true, saves: row.results[0] ? row.results[0].saves_count : 0 });
      }

      // GDPR: raderar all serverdata (user-rad, indexrader, sparningar åt båda håll).
      // Firebase-användaren raderas client-side (user.delete()).
      if (path === '/account' && req.method === 'DELETE') {
        const u = await userFromRequest(req, env);
        if (!u) return json({ error: 'Inte inloggad.' }, 401);
        await env.DB.batch([
          env.DB.prepare('DELETE FROM invites WHERE created_by = ? OR used_by = ? OR group_id IN (SELECT id FROM groups WHERE created_by = ?)').bind(u.id, u.id, u.id),
          env.DB.prepare('DELETE FROM group_members WHERE user_id = ? OR group_id IN (SELECT id FROM groups WHERE created_by = ?)').bind(u.id, u.id),
          env.DB.prepare('DELETE FROM groups WHERE created_by = ?').bind(u.id),
          env.DB.prepare('DELETE FROM users WHERE id = ?').bind(u.id),
          env.DB.prepare('DELETE FROM recipes_index WHERE owner_id = ?').bind(u.id),
          env.DB.prepare('DELETE FROM saves WHERE user_id = ? OR owner_id = ?').bind(u.id, u.id),
          // användarens sparningar försvann: räkna om räknarna (sällsynt op, helt index ok)
          env.DB.prepare(`UPDATE recipes_index SET saves_count =
            (SELECT COUNT(*) FROM saves s WHERE s.owner_id = recipes_index.owner_id AND s.recipe_id = recipes_index.id)`),
        ]);
        return json({ ok: true });
      }
    } catch (e) {
      return json({ error: 'Serverfel.' }, 500);
    }
    return json({ error: 'Hittades inte.' }, 404);
  },
};
