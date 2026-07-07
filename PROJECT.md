# Projekt: Grammat (recept + inköpslista)

Personlig receptsajt för Patrik + vänner. **Live:** https://orgutveckling.se/recept/
Repo: https://github.com/Elwyndaz/recept (GH Pages, branch `main`, root). Custom-domänen ärvs från elwyndaz.github.io, ingen CNAME här.

## Funktion (as built)
- Receptbibliotek och inköpslista är UNIKA per användare. `starter.json` (6 recept) är bara fröet: kopieras till localStorage vid första besöket och laddas upp till kontot vid registrering. Recept läggs till/redigeras/tas bort i UI:t, INTE via repot.
- Konto = användarnamn + PIN (inga mejl). Token (uuid) sparas i localStorage. PIN kan inte återställas i UI, reset görs manuellt i D1.
- Alla ingrediensmängder kanoniskt i g eller ml så att listan kan summera över recept. `count`/`countUnit` ger ungefärligt styckantal i visningen ("220 g (~2 st)"). `toTaste: true` = "efter smak" (ingen mängd). `skipList: true` = ingrediens (t.ex. vatten) utesluts ur inköpslistan. `group` = rubrik inom receptet (t.ex. "Sås"). `cat` = varukategori: grönt/kött/mejeri/skafferi/fryst/övrigt.
- Portionsskalning linjärt mot `portions` (basportioner). Summeringsnyckel = ingrediensnamn lowercase/trim, så samma vara MÅSTE stavas lika mellan recept för att slås ihop.
- Inköpslistan är formgiven som ett butikskvitto (signaturelementet): mono-typsnitt, kategorirubriker, avbockning, källrecept per rad (tap på namnet), egna extrarader, "Töm listan".
- Backup finns under Konto: laddar ner hela state som `grammat-backup-YYYY-MM-DD.json` och kan återställa samma format senare. Backupen innehåller recept, val, extrarader och avbockningar. Vid inloggat konto synkas återställd backup vidare till D1 via ordinarie save.
- Serverbackup utan kort/R2: D1 Time Travel är den automatiska korttidsbackupen. För stående agentbackup ska Codex/Claude exportera D1 till lokal `backups/` innan riskabla ändringar, D1-migreringar eller deploy. `backups/` är git-ignored och ska inte pushas eller publiceras på GitHub Pages.

## Filer
- `index.html`: all CSS inline, design tokens i `:root`. Typsnitt: Bricolage Grotesque (display), Schibsted Grotesk (brödtext), Spline Sans Mono (siffror/kvitto). Palett: papper #EAEDDF, ink #20281A, lingon #9E2B3E, senap #DDA321, kvitto #FBFAF2. Mobil: fast bottennav; desktop (≥720px): nav under ordmärket. noindex.
- `app.js`: rena funktioner överst (aggregate, fmtNum, fmtItem, fmtIngredient, slugify, parseImport, normalizeState, makeBackup — exporteras för test). AI-import: vyn #/importera visar en kopierbar prompt (AI_PROMPT i app.js) som får valfri AI-modell att svara med recept-JSON i exakt rätt format; parseImport validerar, normaliserar och lägger in receptet i biblioteket, därefter SPA:n (hash-routing: #/ katalog, #/recept/:id, #/nytt, #/redigera/:id, #/importera, #/lista, #/konto). State = `{recipes, selections, extras, checked}` i localStorage; PUT:as hel (debounce 800 ms) till API:t när man är inloggad; vid inloggning/sidladdning hämtas serverns state (servern vinner om den har data, annars laddas lokalt upp). Sista skrivning vinner.
- `starter.json`: de 6 startrecepten, konverterade till g/ml (1 msk=15 ml, 1 tsk=5 ml, 1 dl=100 ml + vikttabeller).
- `test.js`: `node test.js` — kontrollerar summering, skalning, skipList, efter smak, svenskt talformat. Kör vid ändringar i app.js/starter.json.
- `worker/`: Cloudflare Worker `recept-api` på **recept-api.orgutveckling.se** (custom domain). OBS: separat från `orgutveckling-votes` på api.orgutveckling.se (rör ej den). D1-databas `recept`, id `519f743c-9c5e-48c0-930b-c615ada71f0c`, en tabell: `users(id, name UNIQUE, pin_hash, token, state)`. `pin_hash` = `salt:sha256hex(salt+pin)`. Endpoints: POST /register, POST /login → `{token,name}`; GET/PUT /state (Bearer token), PUT max 256 kB och kräver `recipes`-array.

## Kommandon
- Deploy worker: `cd worker && npx wrangler deploy`
- D1-konsol: `npx wrangler d1 execute recept --remote --command "..."`.
- PIN-reset (behåller receptdata): räkna ut ny `salt:hash` lokalt med `node -e "const c=require('crypto');const salt=c.randomUUID();const h=c.createHash('sha256').update(salt+'NYPIN').digest('hex');console.log(salt+':'+h)"`, kör sedan `UPDATE users SET pin_hash='<salt:hash>' WHERE name='användarnamn'` mot D1. Token och state påverkas inte. Använd ENDAST DELETE + återregistrering om kontot är trasigt på annat sätt, det raderar all state om den inte kopierats ut först.
- Agentbackup före riskabla ändringar/deploy: `New-Item -ItemType Directory -Force backups; npx wrangler d1 export recept --remote --output backups/recept-YYYY-MM-DD-HHMMSS.sql`. Ersätt timestamp med aktuell tid. Kontrollera att filen hamnar i `backups/`, inte i repo-roten.
- D1 Time Travel restore: `npx wrangler d1 time-travel info recept --timestamp "YYYY-MM-DDTHH:MM:SSZ"` och `npx wrangler d1 time-travel restore recept --timestamp "YYYY-MM-DDTHH:MM:SSZ"`.
- Frontend deployas genom push till `main` (GH Pages, ~30 s).
- Lokal test: `python -m http.server` i repo-roten (API:t är CORS-öppet).

## Konventioner
- Allt användarvänt är på svenska: decimalkomma, mellanslag som tusentalsavgränsare, aldrig tankstreck (—).
- Vanilla JS, inga beroenden, ingen byggkedja. Behåll det så.

## Källmaterial
OneNote-exporten `c:\Users\patri\Downloads\recept 2.mht` ("Dom vi brukar laga", ~60 recept). Extraherad text: kör
`python -c "import email;msg=email.message_from_binary_file(open(r'C:/Users/patri/Downloads/recept 2.mht','rb'));[print(p.get_payload(decode=True).decode('utf-8')) for p in msg.walk() if p.get_content_type()=='text/html']" > recept.html`
och strippa taggarna. Nya recept konverteras till g/ml enligt modellen i starter.json.
