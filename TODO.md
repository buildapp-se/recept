# TODO: receptsajten

Byggt och live 2026-07-07: sajt, worker, D1, konton, kvittolista, 17 startrecept, näringsvärde per portion, receptkategorier, hel-state backup/återställning. 2026-07-08: ingrediensbockning i receptvyn (grön bock till vänster, senast bockad överst i avbockat-blocket, utesluts ur listan), wake lock, helklickbara kort, multi-recept-import från AI, PWA-manifest med riktiga ikoner (icons/, "g."-ordmärke), "Dela receptet" via urklipps-JSON, designöversyn (senap ersatt av grönt #2E6B43, AA-kontrast på sekundär/överstruken text), "Gör en kopia" borttagen. Se PROJECT.md för arkitektur.

## Kvar / idéer
- [ ] Stående agentrutin: före riskabla ändringar, D1-migreringar eller deploy ska Codex/Claude köra D1-export till lokal `backups/` (`npx wrangler d1 export recept --remote --output backups/recept-YYYY-MM-DD-HHMMSS.sql`). `backups/` är git-ignored och får inte pushas/publiceras.
- [ ] (pausad 2026-07-08, Patrik vill inte ha fler just nu) Fler recept ur `recept 2.mht` konverterade till starter.json-format. 16 importerade totalt (11 st 2026-07-07, plus chiliräkor/avocadosalsa, Årengs Bloody Mary, Strawberry Daiquiri och Nubbesallad 2026-07-07). Kandidat kvar bl.a.: Höstgryta Irland, Gubbröra (finns bara som tom rubrik i mht, inget recept nedskrivet). Fullständig titellista på ~90 sidor i mht-filen finns inte sparad någonstans, kör om extraktionen i PROJECT.md om fler ska plockas ut. Nya starter-recept syns direkt för alla i "Allas recept", ingen per-konto-migrering behövs längre.
- [ ] Riktig verifiering i mobil/butik (planerad, "det gör vi sen"): logga in, wake lock-test (skärmen ska inte slockna i receptvyn), bocka ingredienser, handla med listan, ladda om mitt i, kolla synk på andra enheten. Full checklista i HANDOFF.md.
- [ ] Fyra av de nyimporterade recepten (salsiccia, räkpasta, chili con carne, gazpacho) saknar steg ("Inga steg nedskrivna") eftersom källan bara var video/länk, fyll på vid tillfälle.
- [ ] Ev. service worker för offline i butiken (PWA-manifest + hemskärmsikon klart 2026-07-08; SW kräver cache-versionering vid varje deploy, läggs till om täckningen i butiken faktiskt är dålig).

## Kända begränsningar (medvetna)
- Sista skrivning vinner vid sync; ok eftersom varje lista har en ägare.
- Summering kräver identisk stavning av ingrediensnamn mellan recept.
- Ingen e-post, ingen självservice-PIN-återställning.
