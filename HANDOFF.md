# Handoff

Senast uppdaterad: 2026-07-08 (sen kväll). Läget för nästa session (människa eller agent). Arkitektur i PROJECT.md, v2-planen i ARKITEKTUR.md, öppna punkter i TODO.md.

## Läget just nu
- **Fas 2 (publik flik + sparräknare) är deployad till Worker + D1 2026-07-08.** Worker-version `559aa3c3-e410-4511-a45c-5ef02c81d9f3`. D1-backup togs först: `backups/recept-2026-07-08-171859.sql`. Schema, `grammat`-seed och engångs-reindex kördes remote; indexkontroll visade `grammat` 22 recept, `hans` 1, `julia` 1, `patrik` 1. Frontendfix: Allas-vyn slår nu ihop alla recept per kategori (ingen extra Huvudrätt längst ner), visar ägare som "från X" på andras recept, normaliserar trasig `course`, använder `ownerId|id` för spara/ta bort, och faller tillbaka till gamla `/allas-recept` om `/feed` inte kan laddas.
- **Fas 1 (Firebase Auth) + namnbyte är live sedan tidigare 2026-07-08.** Worker `7eb79d3c`, frontend `2b17923`.
- Auth-modellen: Firebase ID-token (JWT, verifieras i workern mot Googles JWKS) eller legacy uuid-token under övergången. julia + hans är ännu INTE uppgraderade (`SELECT name FROM users WHERE firebase_uid IS NULL`).

## Nästa steg
1. Prodtesta fas 2 efter frontend-push/cache-purge: Allas-fliken (andra ägare syns, ingen dubbel Huvudrätt), spara/ta bort, hemlig-toggle.
2. Julia loggar in på delade kontot: Patrik trycker "Skapa lösenord" under Konto (syns när kontot saknar lösenordsinloggning), sen loggar hon in med samma e-post + lösenordet.
3. Mobilverifieringen i butik (checklista i git-historiken för HANDOFF, förmiddagens version) står kvar.
4. Fas 3 i ARKITEKTUR.md: grupper + inbjudningslänk + "Vänners recept" ur samma index.

## Bra att veta
- **Agentrutin**: D1-export till `backups/` FÖRE riskabla ändringar/D1-migreringar/deploy (kommando i PROJECT.md). Senast 2026-07-08 17:18 (`recept-2026-07-08-171859.sql`).
- **Deploy/push kräver Patriks godkännande** i det här permission-läget, planera inte in det som eget agentsteg.
- **Cloudflare-edgecache på frontenden**: orgutveckling.se ligger bakom Cloudflare med `max-age=14400`, app.js kan serveras GAMMAL i upp till 4 h efter push. Botemedel: purge i Cloudflare-dashboarden (exakt URL: `https://orgutveckling.se/recept/app.js`) eller vänta. Purge via API/agent går inte i det här permission-läget, be Patrik. Långsiktig fix när deployerna blir tätare: versionsquery (`app.js?v=N`).
- **Google-consentskärmen** visar `grammat-78450.firebaseapp.com`: normalt för overifierad OAuth-branding, fixas i lanseringsfasen (se ARKITEKTUR.md risker).
- **Lokal verifiering**: `python -m http.server 8123` i REPO-ROTEN (cwd:t kan stå kvar i worker/ efter wrangler-kommandon) + `cd worker && npx wrangler dev --port 8787` + peka om `const API` i app.js tillfälligt (återställ före commit!). Hård omladdning (ignoreCache) efter app.js-ändringar. Lokal D1 seedas med `npx wrangler d1 execute recept --local --file schema.sql`.
- **PowerShell 5.1**: citattecken i `git commit -m`-here-strings mangalas till pathspecs, undvik `"` eller använd `-F fil`.
- **Dataobservation 2026-07-08**: julia/hans state krympte mellan 2026-07-07 14:57 och 2026-07-08 (12→0 resp. 11→1 recept), troligen avsiktligt. Återställning vid behov: `backups/recept-2026-07-07-145724.sql`.
- Fyra recept saknar steg (salsiccia, räkpasta, chili con carne, gazpacho).
