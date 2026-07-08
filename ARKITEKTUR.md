# Arkitekturplan: Grammat v2 (live site, Sverige först, engelska sen)

Skiss 2026-07-08, reviderad samma dag efter beslut: inget hushåll (delat konto löser det), inga bilder, blob-modellen behålls. Målbild, vägval, datamodell, faser.
Nuläge: GH Pages + vanilla JS, Worker + D1 med en `users`-tabell, hela state som JSON-blob, PIN-login, sista skrivning vinner.

## Beslut som styr allt (2026-07-08)
- **Inget hushåll.** Par delar ETT konto: gemensamma recept och gemensam inköpslista gratis, noll hushållskod. Kravet är i stället att samma konto kan ha flera inloggningssätt (Patrik via Google, Julia via e-post+lösenord) och att man förblir inloggad.
- **Inga bilder.** Cleant, snabbt, användbart är #1. Omprövas bara om användarna ber om det.
- **Blob-modellen behålls.** Utan hushåll har varje konto en skribent, så sista skrivning vinner fungerar fortsatt. Ingen stor normalisering.

## Målbild
- Riktiga konton (e-post + lösenord, Google-login, återställning, autoinlogg).
- Grupper (vänner): alla i mina grupper ser mina recept och tvärtom, i en "Vänners recept"-vy.
- Per recept: liten "hemlig"-toggle (finns men tar inte plats).
- Ny flik: ALLA recept på sajten, sparräknare i hörnet på kortet, mest sparade överst per course.
- App för iOS/Android på sikt, samma data som sajten.
- Engelska på sikt.

## Vägval

### V1. Inloggning: Firebase Auth, men BARA för identitet
| Alternativ | För | Emot |
|---|---|---|
| **A. Firebase Auth (rek)** | Gratis i praktiken, e-post + återställning + Google/Apple-login färdigt, kontolänkning (flera inloggningssätt på ett konto) inbyggd, sessionen persisteras lokalt = autoinlogg utan egen kod, officiella SDK:er för iOS/Android | Andra molnleverantören i stacken, Google-beroende |
| B. Bygga själv (e-post + magic link) | Allt hos Cloudflare | Egen e-postutskick/deliverability, egen säkerhet, egen kontolänkning, mest kod att äga |
| C. Clerk/Auth0/Supabase Auth | Snyggt färdigt | Kostar per användare resp. drar in en hel plattform för en delfunktion |

Rekommendation: A. Firebase används ENDAST som identitetsleverantör. All data stannar i D1. Workern verifierar Firebase ID-token (RS256-JWT, publika nycklar från Googles JWKS, cacheas i Workern, ingen SDK behövs) och slår upp/skapar user-raden på `firebase_uid`.

Delat konto-scenariot: Firebase account linking låter samma konto ha providrarna `password` och `google.com`. Under Konto: "Lägg till inloggningssätt". Autoinlogg är default (persistence LOCAL, överlever omstart tills utloggning).

Migrering av dagens konton: engångsflöde "logga in med användarnamn+PIN → koppla nytt konto" som sätter `firebase_uid` på befintlig rad. Fem användare idag, kan göras manuellt i D1.

### V2. Databas: stanna i D1
Som tidigare: D1 finns, är gratis, har Time Travel och är exportbar SQL. Postgres/Firestore löser inget dagens behov kräver. 10 GB-taket är irrelevant länge till för textrecept; ombesluta vid ~miljonen användare.

### V3. Sparräknare: saves-tabell bredvid bloben (LITEN ändring)
"Lägg till i mina recept" kopierar recept-JSON in i mottagarens blob, det behålls. Servern kan inte räkna sparningar ur blobbar i efterhand, så sparningen registreras när knappen trycks:
- `saves(user_id, recipe_id)` med sammansatt PK: dubbelsparning räknas inte dubbelt, "Ta bort ur mina recept" gör DELETE.
- `saves_count` denormaliserad på indexraden (V4), uppdateras i samma transaktion.
- Klientändring: ett extra fetch-anrop i befintliga add/remove-knappen. Det är hela ändringen.

Medveten begränsning (kopiemodellen): ägarens senare rättningar når inte de som redan sparat, deras kopia är frusen. Ok, räknaren är poängen, inte livesynk. Referensmodell (kanoniskt recept + pekare) är uppgraderingsvägen om det någonsin börjar skava.

### V4. Publika fliken: indextabell deriverad ur blobbarna
Dagens `GET /allas-recept` parsar ALLA användares blobbar per request. Funkar för fem vänner, dör med tusen användare. I stället:
- Vid `PUT /state` extraherar Workern användarens icke-hemliga recept och skriver om användarens rader i `recipes_index`. Enkelt: DELETE ägarens rader + INSERT. (ponytail: skriv-om-allt per PUT, diffa bara om skrivvolymen börjar kosta.)
- Publika fliken läser `recipes_index` paginerat: `WHERE visibility='public' ORDER BY saves_count DESC` per course, index på `(course, saves_count)`. Skicka ALDRIG hela sajtens recept till klienten.
- Cachea `GET /feed/public` på edgen 60 s. Räknaren får vara en minut gammal.
- Rena antal sparningar som ranking. Tidsviktning/trending: YAGNI.
- `starter.json`-recepten blir recept på ett systemkonto så publika fliken är EN källa.
- Vänner-flödet (V6) läser SAMMA index filtrerat på gruppmedlemmars owner_id. En mekanism, två flöden.

### V5. Synlighet: binär, litet hänglås
`private: true` i recept-JSON (default synlig). Liten ikonknapp i redigeringsvyn. Workern hoppar över privata recept vid indexeringen, så de kan aldrig läcka via flöden. Schema-mässigt är `visibility` i indexet en TEXT-kolumn så "endast grupper" kan läggas till utan migrering om det efterfrågas.

### V6. Grupper (vänner): medlemskap + inbjudningslänk
- `groups`, `group_members`, `invites` (kod, engångs/tidsbegränsad). Inbjudan via länk/kod (`#/join/AB3F9K`) som skickas via sms/valfri kanal, ingen e-postinfrastruktur.
- Gruppmedlemmar ser varandras icke-hemliga recept i "Vänners recept"-fliken (läser recipes_index) och kan spara dem. Ingen redigeringsrätt.
- Inga roller/admin i v1: den som skapade gruppen kan ta bort medlemmar, klart.

### V7. Sync: bloben behålls, per-konto
State = `{recipes, selections, extras, checked, struck}` per användare precis som idag, debounce-PUT, sista skrivning vinner. Delat konto betyder i praktiken två personer på samma blob, men samtidig redigering av samma recept är osannolik och skadan är en förlorad ändring, inte korruption. 256 kB-gränsen: höj till 1 MB och visa varning i UI:t nära taket; recepten är text, det räcker länge.

### V8. App: PWA → Capacitor, ingen omskrivning
PWA-manifest + ikoner finns. Appspåret = (1) service worker + offline med cache-versionering per deploy, (2) Capacitor-wrap av samma kodbas när butiksnärvaro känns viktig. Firebase Auth fungerar i båda. React Native/Flutter: nej, dödar vanilla-enkelheten.

### V9. Frontend och hosting
- Vanilla JS behålls. Flikar: Mina recept, Vänners recept, Alla recept, Lista, Konto.
- Publika/vänner-flikarna hämtar paginerade API-svar i stället för allt-i-state.
- GH Pages → Cloudflare Pages är rimligt men inte nödvändigt, gör det när något skaver.
- Egen domän (grammat.se?) + bort med noindex innan lansering utåt, orgutveckling.se/recept är fel adress för främlingar. Beslut 2026-07-08: bygg kvar på /recept och flytta VID traktion, bytet är billigt (Firebase: lägg till domän i authorized domains; sessioner: alla loggar in en gång till; API:t redan på egen subdomän; redirect-regel för gamla länkar). Förutsätter två regler under bygget: relativa sökvägar och aldrig hårdkodad origin (länkar byggs med `location.origin`).

### V10. Engelska sen
UI-strängar extraheras till strängtabell FÖRST när engelskan är beslutad (YAGNI nu). Recepten är användardata, översätts inte.

## Datamodell (D1, tillägg bredvid dagens users-tabell)
```sql
users(id, firebase_uid UNIQUE, name, created_at, state TEXT)   -- state-bloben bor kvar här
recipes_index(id, owner_id, title, course, visibility, saves_count INTEGER DEFAULT 0, data TEXT)
saves(user_id, recipe_id, created_at, PRIMARY KEY(user_id, recipe_id))
groups(id, name, created_by, created_at)
group_members(group_id, user_id, joined_at, PRIMARY KEY(group_id, user_id))
invites(code UNIQUE, group_id, created_by, expires_at, used_by)
```
Receptformatet (g/ml, cat, group, toTaste osv) ändras inte. Indexet är deriverat och kan alltid byggas om från blobbarna.

## Faser (varje fas shipbar för sig)
1. **Firebase Auth**: tokenverifiering i Workern, kontolänkning (Google + lösenord på samma konto), koppla befintliga konton, PIN pensioneras. **KLAR: deployad + live-verifierad 2026-07-08 (Patrik testade e-post + Google + länkning i produktion).**
1b. **Namnbyte** (litet, före fas 2): auto-genererade namn ("patzlofgren") blir synliga ägaretiketter, användaren måste kunna byta. PUT /name (unikt, samma regex som legacy) + fält under Konto.
2. **Publika fliken + sparräknare**: hemlig-toggle, saves-tabell, recipes_index deriverad vid PUT, paginerad flik sorterad per course, starter.json → systemkonto. **DEPLOYAD till Worker + D1 2026-07-08.** (Avsteg: LIMIT 200 i stället för riktig paginering, edgecache på feeden skippad — Bearer-header gör den ändå ocachebar utan extra regler; båda omprövas vid volym.)
3. **Grupper**: groups/invites, inbjudningslänk, "Vänners recept"-flik ur samma index.
4. **Offline/PWA**: service worker med cache-versionering per deploy.
5. **Capacitor-appar** när butiksnärvaro är motiverad.
6. **Engelska + egen domän** när Sverige-versionen sitter.

Ordning 2↔3 kan bytas; 2 ger mest synligt värde per timme.

## Risker och öppna punkter
- **Moderation**: publik flik = främlingars innehåll hos dig. Minimum före lansering utåt: rapportera-knapp, `hidden`-flagga admin kan sätta i indexet, användarvillkor.
- **GDPR**: radera konto måste radera user-rad, indexrader, saves, gruppmedlemskap OCH Firebase-användaren. Byggs i fas 1, inte som eftertanke.
- **Delat konto vs sparräknaren**: två personer på ett konto = en sparning, räknaren undervärderar par. Acceptabelt, ingen åtgärd.
- **Kopiemodellens frusna kopior** (V3): uppgradera till referensmodell bara om användare klagar på att rättningar inte når dem.
- **D1-taket** (10 GB, en region): ombesluta vid ~miljonen användare, inte före. Exportvägen till Postgres finns.
- **Google-consentskärmen** visar `grammat-78450.firebaseapp.com` i stället för "Grammat" tills OAuth-brandingen är verifierad (namn/logga/integritetspolicy i Google Cloud Console) och riktigt snyggt först med egen domän som authDomain. Görs i lanseringsfasen (fas 6), funktionen påverkas inte.
