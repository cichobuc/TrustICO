# TrustICO — Zoznam API zdrojov

> Overené live testovaním dňa 2026-03-24. Stav: OK = funguje, KEY = vyžaduje API kľúč, SOAP = SOAP protokol.

| # | API | Base URL | Auth | Stav | Na čo |
|---|-----|----------|------|------|-------|
| 1 | **ŠÚSR RPO** | `api.statistics.sk/rpo/v1` | Žiadna | OK | Základné údaje, štatutári, spoločníci, prevádzkarne, história |
| 2 | **RegisterUZ** | `www.registeruz.sk/cruz-public/api` | Žiadna | OK | Účtovné závierky, výkazy, PDF prílohy (NAJDÔLEŽITEJŠÍ) |
| 3 | **RPVS** | `rpvs.gov.sk/OpenData` | Žiadna | OK | Koneční užívatelia výhod — KÚV (OData v4) |
| 4 | **Finančná správa** | `iz.opendata.financnasprava.sk/api` | API kľúč | KEY | Daňoví dlžníci, DPH, index spoľahlivosti |
| 5 | **IS REPLIK** | `replik-ws.justice.sk/ru-verejnost-ws` | Žiadna | SOAP | Konkurzy, reštrukturalizácie, likvidácie |
| 6 | **EU VIES** | `ec.europa.eu/taxation_customs/vies/rest-api` | Žiadna | OK | Overenie IČ DPH v celej EÚ (REST!) |
| 7 | **DataHub** | `datahub.ekosystem.slovensko.digital/api/data` | Žiadna | OK | CRZ zmluvy, OV podania, RPO sync (60 req/min) |
| 8 | **ITMS2014+** | `opendata.itms2014.sk/v2` | Žiadna | OK* | Eurofondy — projekty, prijímatelia (*nemá IČO search) |
| 9 | **ORSR.sk** | `www.orsr.sk` | Žiadna | Scrape | Fallback — štatutári, predmety podnikania (HTML) |

## Overené endpointy

### ŠÚSR RPO
```
GET /rpo/v1/search?identifier={ico}&onlyActive=true        → zoznam zhôd
GET /rpo/v1/search?fullName={nazov}&onlyActive=true         → search by name
GET /rpo/v1/entity/{rpoId}?showHistoricalData=true&showOrganizationUnits=true  → detail
```
**POZOR:** Parameter pre IČO je `identifier`, NIE `ico`!

### RegisterUZ
```
GET /cruz-public/api/uctovne-jednotky?zmenene-od=2000-01-01&ico={ico}  → {id:[...]}
GET /cruz-public/api/uctovna-jednotka?id={id}               → detail ÚJ
GET /cruz-public/api/uctovna-zavierka?id={id}                → detail závierky
GET /cruz-public/api/uctovny-vykaz?id={id}                   → detail výkazu (tabulky)
GET /cruz-public/api/sablona?id={id}                         → šablóna (mapovanie riadkov)
GET /cruz-public/domain/financialreport/attachment/{id}       → PDF príloha (binary)
GET /cruz-public/domain/financialreport/pdf/{id}              → generovaný PDF
```

### RPVS OData
```
GET /OpenData/PartneriVerejnehoSektora?$filter=Ico eq '{ico}'
GET /OpenData/Partneri({id})?$expand=KonecniUzivateliaVyhod,OpravneneOsoby
GET /OpenData/KonecniUzivateliaVyhod                          → všetci KÚV (paginated)
```

### Finančná správa (header `key: {API_KEY}`)
```
GET /api/data/{slug}/search?column=ico&search={ico}&page=1
```
Slugy: `ds_dphs` (DPH), `ds_dsdd` (dlžníci), `ds_dphz` (zrušenie), `ds_dphv` (vymazanie), `ds_ids` (index)

### EU VIES (REST — nie SOAP!)
```
POST /rest-api/check-vat-number
Body: {"countryCode": "SK", "vatNumber": "{dic}"}
```

### IS REPLIK (SOAP 1.1)
```
WSDL: /ru-verejnost-ws/konanieService.wsdl
WSDL: /ru-verejnost-ws/oznamService.wsdl
Operácie: vyhladajKonania(ico), getKonanieDetail(konanieId), vyhladajOznamy(ico)
```

### DataHub slovensko.digital (60 req/min!)
```
GET /api/data/rpo2/organizations/{internalId}                 → RPO detail
GET /api/data/crz/contracts/{id}                              → CRZ zmluva
GET /api/data/ov/or_podanie_issues/{id}                       → OR podania
GET /api/data/ov/konkurz_restrukturalizacia_issues/{id}       → konkurzy (hist. do 9/2025)
GET /api/data/ov/likvidator_issues/{id}                       → likvidácie (hist. do 9/2025)
```

### ITMS2014+
```
GET /v2/projekty/vrealizacii?limit=20&minId=0                → projekty (bez IČO filtra!)
GET /v2/projekty/ukoncene?limit=20                            → ukončené projekty
GET /v2/subjekty/{internalId}                                 → detail subjektu
```

## Bez API (scraping / manuálne)

| Zdroj | URL | Poznámka |
|-------|-----|----------|
| Dôvera ZP | dovera.sk/dlznici | Zoznam dlžníkov (HTML) |
| Union ZP | union.sk/dlznici | Zoznam dlžníkov (HTML) |
| Sociálna poisťovňa | socpoist.sk/dlznici | Zoznam dlžníkov (HTML) |
| ORSR.sk | orsr.sk/hladaj_ico.asp | Obchodný register (HTML scraping) |
