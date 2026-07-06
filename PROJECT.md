# Projekt: Receptsajt + inköpslista

Ny sajt på orgutveckling.se/recept (eget repo `Elwyndaz/recept`, GH Pages, samma mönster som /ai). Egen visuell identitet (inte kopia av orgutveckling), mobilanpassad för butiksbruk, noindex.

## Funktion
- Gemensamt receptbibliotek: statiskt innehåll (`recipes.json`), fler recept läggs till via repo-redigering. Källa: OneNote-export "Dom vi brukar laga" (`recept 2.mht`, ~60 recept).
- Användare: användarnamn + PIN (inga mejl). Eget receptval + egen inköpslista per användare, synkas mellan enheter.
- Alla ingredienser kanoniskt i g/ml så mängder summeras över recept. Smart visning: "330 g gul lök (~3 st)", smaksättare utan mängd. Portionsskalning linjärt.
- Inköpslista: avbockning i butik (synkad), grupperad per varukategori (grönt/mejeri/kött/skafferi/fryst/övrigt), visar bidragande recept per rad, manuella extraposter.

## Teknik
- Frontend: statisk SPA, index.html + app.js + recipes.json, hash-routing, inline CSS, svenska (decimalkomma).
- Backend: NY Cloudflare Worker `recept-api` på recept-api.orgutveckling.se + D1. Separat från votes-workern på api.orgutveckling.se (den publika /ai-sajten rörs ej).
- D1: en tabell `users(id, name UNIQUE, pin_hash, token, state)`; state = JSON-blob `{selections, extras, checked}`. Endpoints: POST /register, POST /login, GET/PUT /state (Bearer token). Sista skrivning vinner (listor är personliga).

## Startrecept (6 st, ur recept 2.mht)
Köttfärssås, Kebab (Zeina), Lövbiff teriyaki med pak choi, Veg lasagne, Broccolisoppa, Karls loomisar.
