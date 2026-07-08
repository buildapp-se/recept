# TODO: receptsajten

Byggt och live 2026-07-07: sajt, worker, D1, konton, kvittolista, 17 startrecept, näringsvärde per portion, receptkategorier, hel-state backup/återställning. 2026-07-08: ingrediensbockning i receptvyn (grön bock till vänster, senast bockad överst i avbockat-blocket, utesluts ur listan), wake lock, helklickbara kort, multi-recept-import från AI, PWA-manifest med riktiga ikoner (icons/, "g."-ordmärke), "Dela receptet" via urklipps-JSON, designöversyn (senap ersatt av grönt #2E6B43, AA-kontrast på sekundär/överstruken text), "Gör en kopia" borttagen. Se PROJECT.md för arkitektur.

## Kvar / idéer
- [ ] **v2 (stora live-sajten)**: plan och vägval i `ARKITEKTUR.md` (2026-07-08). Beslut: inget hushåll (par delar konto, Firebase-kontolänkning ger Google + lösenord på samma konto), inga bilder, blob-modellen behålls. Fas 1 = Firebase Auth, sen publik flik + sparräknare (saves-tabell + recipes_index deriverad vid PUT), grupper med inbjudningslänk, PWA/Capacitor, engelska sist.
- [x] **Fas 1 deployad + live-verifierad 2026-07-08** (e-post, Google, kontolänkning testade i produktion av Patrik).
- [x] **Namnbyte under Konto** byggt 2026-07-08 (PUT /name i worker + fält under Konto, lokalt verifierat). Deployat, purgat och live-verifierat av Patrik (patzlofgren → patrik).
- [x] **Fas 2 deployad till Worker + D1 2026-07-08** (publik feed, `recipes_index`, `saves`, `grammat`-seed, reindex). Frontendfix samma session: Allas grupperas i en gemensam kurslista, ägare visas som "från X", `course` normaliseras, spara/ta bort använder `ownerId|id`.
- [x] Klickbar ägare/profilsida för skapade offentliga recept: deployat och prodverifierat 2026-07-08. När ett kort visar "från Julia" kan man klicka på Julia och se alla offentliga recept skapade av den användaren. Bygger på `recipes_index WHERE owner_id = ?`, inte på sparade recept. Form: `GET /users/:id/recipes` + `#/anvandare/:ownerId`, samma kort/gruppering som Allas recept.
- [ ] Google-consentskärmens branding (visar firebaseapp.com-domänen): OAuth-verifiering + egen authDomain, hör till lanseringsfasen.
- [ ] Legacy-PIN-koden (register/login/token-auth i worker + hopfällda formulär i app.js) rensas när alla befintliga konton är kopplade till Firebase (kolla: `SELECT name FROM users WHERE firebase_uid IS NULL`).
- [ ] Stående agentrutin: före riskabla ändringar, D1-migreringar eller deploy ska Codex/Claude köra D1-export till lokal `backups/` (`npx wrangler d1 export recept --remote --output backups/recept-YYYY-MM-DD-HHMMSS.sql`). `backups/` är git-ignored och får inte pushas/publiceras.
- [ ] (pausad 2026-07-08, Patrik vill inte ha fler just nu) Fler recept ur `recept 2.mht` konverterade till starter.json-format. 16 importerade totalt (11 st 2026-07-07, plus chiliräkor/avocadosalsa, Årengs Bloody Mary, Strawberry Daiquiri och Nubbesallad 2026-07-07). Kandidat kvar bl.a.: Höstgryta Irland, Gubbröra (finns bara som tom rubrik i mht, inget recept nedskrivet). Fullständig titellista på ~90 sidor i mht-filen finns inte sparad någonstans, kör om extraktionen i PROJECT.md om fler ska plockas ut. Nya starter-recept syns direkt för alla i "Allas recept", ingen per-konto-migrering behövs längre.
- [ ] Riktig verifiering i mobil/butik (planerad, "det gör vi sen"): logga in, wake lock-test (skärmen ska inte slockna i receptvyn), bocka ingredienser, handla med listan, ladda om mitt i, kolla synk på andra enheten. Full checklista i HANDOFF.md.
- [ ] Fyra av de nyimporterade recepten (salsiccia, räkpasta, chili con carne, gazpacho) saknar steg ("Inga steg nedskrivna") eftersom källan bara var video/länk, fyll på vid tillfälle.
- [ ] Ev. service worker för offline i butiken (PWA-manifest + hemskärmsikon klart 2026-07-08; SW kräver cache-versionering vid varje deploy, läggs till om täckningen i butiken faktiskt är dålig).

## Kända begränsningar (medvetna)
- Sista skrivning vinner vid sync; ok eftersom varje lista har en ägare.
- Summering kräver identisk stavning av ingrediensnamn mellan recept.
- Ingen e-post, ingen självservice-PIN-återställning.
