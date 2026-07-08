# Handoff

Senast uppdaterad: 2026-07-08 (kväll). Läget för nästa session (människa eller agent). Arkitektur i PROJECT.md, v2-planen i ARKITEKTUR.md, öppna punkter i TODO.md.

## Läget just nu
- **Fas 1 (Firebase Auth) är FÄRDIGBYGGD och lokalt verifierad men INTE deployad.** Worker-deployn nekades av permission-läget, så varken worker eller frontend är pushad. Livesajten kör fortfarande PIN-inloggningen och är opåverkad.
- Byggt idag (utöver förmiddagens leveranser, se git-loggen): Firebase-projekt `grammat-78450` (Patrik skapade i konsolen: Email/Password + Google aktiverade, kontolänkning "same email", orgutveckling.se i authorized domains), `firebase_uid`-kolumn i D1 (remote-migrerad, backup tagen först: `backups/recept-2026-07-08-fas1.sql`), ny worker.js (JWT-verifiering mot Googles JWKS, /link, /account DELETE, {state,name}-svar), index.html (Firebase ESM från CDN → `window.fb`), app.js (Google/e-post-login, glömt lösenord, "Skapa lösenord" för partnern, koppla gammalt konto via PIN eller automatiskt vid kvarvarande legacy-session, radera konto, authName från servern).
- Lokal e2e-verifiering (wrangler dev + lokal D1 + riktiga Firebase-tokens, chrome-devtools): legacy-registrering/-login, state-sync, uppgradering legacy→Firebase (raden fick uid, namn+recept bevarade, ingen dubblett), autoinlogg efter omladdning, ut/inloggning med e-post, kontoradering (D1-rad + Firebase-user borta), auto-skapande av nytt konto (namn från e-postens lokaldel). `node test.js` grönt. Testkonton städade ur både lokal D1 och Firebase.

## Nästa steg (ORDNINGEN ÄR VIKTIG)
1. **Deploya workern FÖRST**: `cd worker && npx wrangler deploy`. Gamla klienten funkar mot nya workern (bakåtkompatibel). Nya klienten funkar INTE mot gamla workern (Firebase-JWT ger 401).
2. **Pusha frontend** (index.html + app.js) till main efter 1.
3. **Manuellt Google-test**: "Fortsätt med Google" och "Koppla Google-inloggning" gick inte att automatisera (riktig Google-inloggning krävs). Testa i webbläsaren efter deploy. E-post+lösenord är e2e-testat.
4. Befintliga användare (julia, hans, m.fl.): loggar in som vanligt (PIN-formen ligger hopfälld under "Gammalt konto med namn + PIN?"), går till Konto och skapar ny inloggning, recepten följer med automatiskt. Alternativt kopplar de i efterhand via "Hämta hit det"-formen med namn+PIN.
5. Mobilverifieringen i butik (checklistan från förmiddagen) står kvar.

## Bra att veta
- **Agentrutin**: D1-export till `backups/` FÖRE riskabla ändringar/D1-migreringar/deploy (kommando i PROJECT.md). Gjord 2026-07-08 10:58 och 15:52 (fas1).
- **Deploy/push kräver Patriks godkännande** i det här permission-läget, planera inte in det som agentsteg.
- **Lokal verifiering**: `python -m http.server 8123` i REPO-ROTEN (OBS: cwd:t kan stå kvar i worker/ efter wrangler-kommandon) + `cd worker && npx wrangler dev --port 8787` + peka om `const API` i app.js tillfälligt. Hård omladdning (ignoreCache) efter app.js-ändringar. Lokal D1 seedas med `npx wrangler d1 execute recept --local --file schema.sql`.
- **PowerShell 5.1**: citattecken i `git commit -m`-here-strings mangalas till pathspecs, undvik `"` i commit-meddelanden eller använd `-F fil`.
- **Dataobservation 2026-07-08**: julia/hans state krympte mellan 2026-07-07 14:57 och 2026-07-08 (12→0 resp. 11→1 recept), troligen avsiktligt. Vill någon ha tillbaka recept: `backups/recept-2026-07-07-145724.sql`.
- Fyra recept saknar steg (salsiccia, räkpasta, chili con carne, gazpacho).
