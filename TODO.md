# TODO: receptsajten

- [x] starter.json: konvertera 6 startrecept till kanoniskt g/ml + varukategorier (1 msk=15 ml, 1 tsk=5 ml, 1 dl=100 ml + livsmedelsvikter)
- [x] Frontend: index.html + app.js. Vyer: Recept / Receptdetalj / Inköpslista / Logga in. Portionsväljare, summering, avbockning, kategorigruppering, källrecept per rad, extraposter, noindex, egen design (frontend-design-skill)
- [x] Worker: schema.sql, worker.js, wrangler.toml. `wrangler d1 create recept`, deploy till recept-api.orgutveckling.se
- [x] Verifiera: register/login/state-roundtrip. Lök summeras över Köttfärssås+Kebab. Avbockning överlever reload. Skalning 16 till 4 port. Andra enheten ser samma lista
- [x] Publicera: `gh repo create Elwyndaz/recept --public`, push, aktivera Pages, orgutveckling.se/recept/
- [ ] Senare: fler recept ur recept 2.mht
