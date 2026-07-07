# TODO: receptsajten

Byggt och live 2026-07-07: sajt, worker, D1, konton, kvittolista, 6 startrecept, hel-state backup/återställning. Se PROJECT.md för arkitektur.

## Kvar / idéer
- [ ] Stående agentrutin: före riskabla ändringar, D1-migreringar eller deploy ska Codex/Claude köra D1-export till lokal `backups/` (`npx wrangler d1 export recept --remote --output backups/recept-YYYY-MM-DD-HHMMSS.sql`). `backups/` är git-ignored och får inte pushas/publiceras.
- [ ] Fler recept ur `recept 2.mht` konverterade till starter.json-format (kandidater: Salsiccia med fänkål, Höstgryta Irland, Korv & halloumigryta, Kyckling cashew, Sausage ragu, Tomato & basil soup). OBS: nya starter-recept når bara NYA konton; befintliga användare får lägga in dem via UI:t eller importfunktion (saknas).
- [ ] Riktig verifiering i mobil/butik: registrera, välj recept, bocka av, ladda om, andra enheten.
- [ ] Karls loomisar saknar steg ("Inga steg nedskrivna") — fråga Karl.
- [ ] Ev. PWA-manifest så sajten kan läggas på hemskärmen och funka offline i butiken.
- [ ] Ev. "dela recept till kompis"-funktion (export/import av ett enskilt recept som JSON eller länk; hel backup finns redan under Konto).

## Kända begränsningar (medvetna)
- Sista skrivning vinner vid sync; ok eftersom varje lista har en ägare.
- Summering kräver identisk stavning av ingrediensnamn mellan recept.
- Ingen e-post, ingen självservice-PIN-återställning.
