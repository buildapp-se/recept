# Handoff

Senast uppdaterad: 2026-07-08. Läget för nästa session (människa eller agent). Arkitektur i PROJECT.md, öppna punkter i TODO.md.

## Läget just nu
- Allt byggt t.o.m. 2026-07-08 är live på https://orgutveckling.se/recept/ (sista commit `d98d7c9`). `node test.js` grönt.
- Dagens leveranser: ingrediensbockning (grön bock vänster, senast bockad överst, utesluts ur inköpslistan, nollas när receptet lämnar listan), Screen Wake Lock i receptvyn, helklickbara receptkort, multi-recept-import från AI (JSON-array, allt eller inget), PWA-manifest + `icons/` ("g."-ikonen från designzippen i Downloads), "Dela receptet" (urklipps-JSON i importformatet), designöversyn (senap → grönt #2E6B43, AA-kontrast, tokens `--gron`/`--strykt`, mörkare `--ink2`).
- Borttaget: "Gör en kopia"-knappen (täcks av Lägg till i mina recept + Dela receptet), gamla emoji-ikonen, senap ur paletten.

## Nästa steg
1. **Mobilverifiering i butik** (Patrik gör den, checklista): logga in på mobilen → öppna recept, låt skärmen vara i 1-2 min (ska INTE slockna) → bocka ingredienser (stryks, hoppar ner, senast bockad överst) → lägg 2-3 recept i listan, olika portioner → i butiken: bocka av, tap på varunamn visar källrecept, egen rad → ladda om mitt i (avbockat kvar) → andra enheten: samma konto, allt synkat (vänta ~1 s efter sista ändring). Wake lock går bara att verifiera på riktig mobil.
2. Ev. service worker för offline (bara om butikstäckningen är dålig; kräver cache-versionering per deploy).
3. Fyra recept saknar steg (salsiccia, räkpasta, chili con carne, gazpacho), fylls på vid tillfälle.

## Bra att veta
- **Agentrutin**: D1-export till `backups/` FÖRE riskabla ändringar/D1-migreringar/deploy (kommando i PROJECT.md). Gjord 2026-07-08 10:58.
- **Dataobservation 2026-07-08**: julia/hans state krympte kraftigt mellan backuperna 2026-07-07 14:57 och 2026-07-08 (12→0 resp. 11→1 recept). Troligen avsiktligt (omläggningen där starter inte längre seedar personlig state), hans egna gazpacho och julias extrarader finns kvar. Vill någon ha tillbaka recept: `backups/recept-2026-07-07-145724.sql`.
- **Lokal verifiering**: `python -m http.server 8123` + chrome-devtools-MCP. OBS: hård omladdning (ignoreCache) krävs efter app.js-ändringar, annars testar man cachad kod (hänt två gånger).
- **PowerShell 5.1**: citattecken i `git commit -m`-here-strings mangalas till pathspecs, undvik `"` i commit-meddelanden eller använd `-F fil`.
- Ikonkällan: `C:\Users\patri\Downloads\Grammat webbplats och design.zip` (= `Downloads\icons`), redan uppackad till `icons/` i repot.
- Manifest/ikoner använder RELATIVA sökvägar (sajten ligger under `/recept/`).
