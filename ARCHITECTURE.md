# TrustICO MCP Server — Kompletná architektúra

## 1. Čo je TrustICO

Remote MCP Server (deploynutý na Render), ktorý na základe **IČO alebo názvu** slovenskej firmy
zhromažďuje, normalizuje a vracia kompletné informácie z **13+ oficiálnych štátnych registrov SR a EÚ**.

**Kľúčové princípy:**
- **Spoľahlivosť > Rýchlosť** — radšej 3 s spoľahlivý výsledok ako 1 s s chýbajúcimi dátami
- **IČO je kráľ** — každý lookup začína resolvnutím na IČO; názov sa najprv preloží na IČO
- **Graceful degradation** — ak jeden zdroj padne, ostatné vrátia dáta + metadata o chybách
- **Žiadne cachované stále dáta** — vždy čerstvé z registrov (okrem šablón a číselníkov)

---

## 2. Architektúra — vysoký pohľad

```
┌──────────────────────────────────────────────────────┐
│  Claude Desktop / Claude.ai / API klient             │
│  (MCP klient)                                        │
└────────────────────┬─────────────────────────────────┘
                     │ MCP protocol (SSE/streamable HTTP)
                     ▼
┌──────────────────────────────────────────────────────┐
│  TrustICO MCP Server  (Node.js / TypeScript)         │
│  Render.com — Web Service                            │
│                                                      │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐ │
│  │ MCP Router  │→ │ Tool Handler │→ │ Orchestrator │ │
│  │ (tools,     │  │ (validácia,  │  │ (paralelné  │ │
│  │  resources) │  │  normalizácia│  │  volania API)│ │
│  └─────────────┘  └──────────────┘  └──────┬──────┘ │
│                                            │        │
│  ┌─────────────────────────────────────────┼──────┐ │
│  │           API Adapters Layer            │      │ │
│  │                                         ▼      │ │
│  │  ┌────────┐ ┌──────┐ ┌─────┐ ┌──────┐ ┌────┐  │ │
│  │  │ŠÚSR RPO│ │RegUZ │ │RPVS │ │FinSpr│ │SOAP│  │ │
│  │  │adapter │ │adapt.│ │OData│ │adapt.│ │wrap│  │ │
│  │  └────────┘ └──────┘ └─────┘ └──────┘ └────┘  │ │
│  │  ┌────────┐ ┌──────┐ ┌─────┐ ┌──────┐         │ │
│  │  │DataHub │ │ITMS  │ │VIES │ │Scrape│         │ │
│  │  │adapter │ │adapt.│ │SOAP │ │(ZP)  │         │ │
│  │  └────────┘ └──────┘ └─────┘ └──────┘         │ │
│  └────────────────────────────────────────────────┘ │
│                                                      │
│  ┌─────────────┐  ┌──────────────┐                   │
│  │ Cache Layer │  │ Rate Limiter │                   │
│  │ (šablóny,   │  │ (per-source) │                   │
│  │  číselníky) │  │              │                   │
│  └─────────────┘  └──────────────┘                   │
└──────────────────────────────────────────────────────┘
```

---

## 3. Krok za krokom — Workflow keď príde IČO alebo názov

### 3.1 Krok 0: Resolve na IČO

```
Input: "36421928" alebo "Websupport" alebo "SK2021869234"
                    │
                    ▼
            ┌───────────────┐
            │ Je to IČO?    │──Yes──→ IČO = input (pad left '0' na 8 cifier)
            │ (8 číslic)    │
            └───────┬───────┘
                    │ No
                    ▼
            ┌───────────────┐
            │ Je to DIČ/    │──Yes──→ Hľadaj v FinSpr ds_dphs cez column=ic_dph
            │ IČ DPH?       │         → extrahuj IČO z výsledku
            └───────┬───────┘
                    │ No
                    ▼
            ┌───────────────┐
            │ Textový názov │──→ RPO search: fullName={input}&onlyActive=true
            │               │    → vráť zoznam zhôd (IČO, názov, sídlo)
            │               │    → ak 1 zhoda → použi IČO
            │               │    → ak viac → vráť disambiguation list
            └───────────────┘
```

**Prečo je toto kritické:**
Bez spoľahlivého resolve na IČO je zvyšok pipeline bezcenný. RPO API podporuje
fuzzy search cez `fullName` parameter, čo je najspoľahlivejší zdroj na resolve.

### 3.2 Krok 1: Paralelný fetch zo VŠETKÝCH zdrojov

Po resolve na IČO sa spustia **všetky zdroje paralelne** s `Promise.allSettled()`:

```typescript
const results = await Promise.allSettled([
  rpoAdapter.search(ico),           // ŠÚSR RPO — základné údaje
  rpoAdapter.entityDetail(rpoId),   // ŠÚSR RPO — detail (štatutári, spoločníci)
  ruzAdapter.getFinancials(ico),     // RegisterUZ — závierky
  rpvsAdapter.getKUV(ico),           // RPVS — koneční užívatelia výhod
  finsprAdapter.getDlznici(ico),     // FinSpr — daňoví dlžníci
  finsprAdapter.getDPH(ico),         // FinSpr — DPH registrácia
  finsprAdapter.getIndex(ico),       // FinSpr — index spoľahlivosti
  replikAdapter.getKonania(ico),     // IS REPLIK — insolvenčné konania
  itmsAdapter.getPrijimatel(ico),    // ITMS — eurofondy
  viesAdapter.checkVAT(dic),         // EU VIES — overenie DPH
  zpAdapters.checkDebtors(ico),      // ZP — dlžníci Dôvera, Union, SocPoist
]);
```

**Timeout per zdroj:** 8 sekúnd (ak zdroj neodpovie, vráti `{ found: false, error: "timeout" }`)

### 3.3 Krok 2: Normalizácia a zlúčenie

Každý adapter vráti štruktúrovaný objekt. Orchestrator ich zlúči do jedného profilu
s `_meta` seciou, kde je pre každý zdroj: `status`, `durationMs`, `error?`.

### 3.4 Krok 3: RegisterUZ — Deep Dive (najdôležitejší zdroj)

RegisterUZ workflow je viac-krokový, preto je implementovaný ako pipeline:

```
IČO → /api/uctovne-jednotky?zmenene-od=2000-01-01&ico={ico}
     → vráti { id: [96001] }

     → /api/uctovna-jednotka?id=96001
       → vráti { idUctovnychZavierok: [6514349, 6055265, ...], dic, nazov, ... }

       → Pre NAJNOVŠIU závierku (najvyššie ID = najnovšia):
         /api/uctovna-zavierka?id=6514349
         → vráti { idUctovnychVykazov: [9806005, 9734410], typ, obdobieOd/Do, ... }

         → Pre KAŽDÝ výkaz:
           /api/uctovny-vykaz?id=9734410
           → vráti { obsah: { tabulky: [...] }, prilohy: [...], idSablony }

           → Šablóna (cached): /api/sablona?id=700
             → mapuje čísla v tabulkách na pomenované riadky
             → "Strana aktív" riadok 1 = "SPOLU MAJETOK"
```

**PDF prílohy (na požiadanie):**
```
/domain/financialreport/attachment/{attachmentId}
→ binary PDF/TIFF → base64 → Claude vizuálne čítanie
```

---

## 4. Overené API endpointy (LIVE testované 2026-03-24)

### 4.1 ŠÚSR RPO (api.statistics.sk)

| Endpoint | Metóda | Kľúčové parametre | Popis |
|----------|--------|--------------------|-------|
| `/rpo/v1/search` | GET | `identifier` (IČO!), `fullName`, `legalForm`, `legalStatus`, `addressMunicipality`, `onlyActive`, `mainActivity`, `sourceRegister`, `stakeholderPersonFamilyName`, `statutoryBodyFamilyName`, `establishmentAfter/Before` | Vyhľadávanie |
| `/rpo/v1/entity/{id}` | GET | `showHistoricalData`, `showOrganizationUnits` | Detail entity (štatutári, spoločníci, činnosti, prevádzkarne) |

**Auth:** Žiadna
**Rate limit:** Neznámy (pravdepodobne ~100/min)
**POZOR:** Parameter pre IČO je `identifier`, NIE `ico`! Search vracia interné `id`, ktoré sa potom použije v `/entity/{id}`.

**Response štruktúra (search):**
```json
{
  "results": [{
    "id": 1049550,
    "identifiers": [{"value": "36421928", "validFrom": "2004-08-12"}],
    "fullNames": [{"value": "Websupport s. r. o.", "validFrom": "2021-10-06"}],
    "addresses": [{"street": "Karadžičova", "buildingNumber": "7608/12", "municipality": {"value": "Bratislava"}}],
    "establishment": "2004-08-12",
    "legalForms": [{"value": {"value": "Spoločnosť s ručením obmedzeným", "code": "112"}}],
    "activities": [...],
    "sourceRegister": {"value": {"value": "Obchodný register"}, "registrationOffices": [...], "registrationNumbers": [...]},
    "statutoryBodies": [...],
    "stakeholders": [...]
  }]
}
```

### 4.2 Register účtovných závierok (registeruz.sk)

| Endpoint | Metóda | Parametre | Popis |
|----------|--------|-----------|-------|
| `/cruz-public/api/uctovne-jednotky` | GET | `zmenene-od` (povinný!), `ico`, `dic`, `max-zaznamov` | Hľadať účtovnú jednotku |
| `/cruz-public/api/uctovna-jednotka` | GET | `id` | Detail účtovnej jednotky |
| `/cruz-public/api/uctovna-zavierka` | GET | `id` | Detail účtovnej závierky |
| `/cruz-public/api/uctovny-vykaz` | GET | `id` | Detail výkazu (tabulky s dátami) |
| `/cruz-public/api/sablona` | GET | `id` | Šablóna výkazu (mapovanie riadkov) |
| `/cruz-public/api/sablony` | GET | — | Všetky šablóny |
| `/cruz-public/domain/financialreport/attachment/{id}` | GET | — | PDF príloha (binary) |
| `/cruz-public/domain/financialreport/pdf/{id}` | GET | — | Generovaný PDF z dát |
| `/cruz-public/api/pravne-formy` | GET | — | Číselník právnych foriem |
| `/cruz-public/api/sk-nace` | GET | — | Číselník SK NACE |

**Auth:** Žiadna
**POZOR:** `zmenene-od` je POVINNÝ parameter! Použiť `zmenene-od=2000-01-01` pre "všetko".
**API verzia:** 2.5 (header `X-API-Version`)

**Response flow:**
```
uctovne-jednotky?ico=X → {id: [96001]}
  → uctovna-jednotka?id=96001 → {idUctovnychZavierok: [...], dic, nazovUJ, ico, ...}
    → uctovna-zavierka?id=... → {idUctovnychVykazov: [...], obdobieOd, obdobieDo, typ, ...}
      → uctovny-vykaz?id=... → {obsah: {tabulky: [...]}, prilohy: [...], idSablony}
```

### 4.3 RPVS OData (rpvs.gov.sk)

| Endpoint | Filtrovanie | Popis |
|----------|-------------|-------|
| `/OpenData/PartneriVerejnehoSektora` | `$filter=Ico eq '{ico}'` | Partner podľa IČO |
| `/OpenData/KonecniUzivateliaVyhod` | `$expand=Partner($filter=Ico eq '...')` | KÚV |
| `/OpenData/OpravneneOsoby` | `$expand=Partner` | Oprávnené osoby |
| `/OpenData/VerejniFunkcionari` | — | Verejní funkcionári |
| `/OpenData/VerifikacneDokumenty` | — | Verifikačné dokumenty |

**Auth:** Žiadna
**Formát:** OData v4, JSON
**POZOR:** `$top=0` nie je povolené! Navigácia cez `$skip`.

**Kľúčové entity a ich vlastnosti:**
- **PartnerVerejnehoSektora:** Id, Meno, Priezvisko, ObchodneMeno, Ico, FormaOsoby, PlatnostOd/Do
- **KonecnyUzivatelVyhod:** Id, Meno, Priezvisko, DatumNarodenia, JeVerejnyCinitel, Ico, PlatnostOd/Do
- **OpravnenaOsoba:** Id, Meno, Priezvisko, ObchodneMeno, Ico, PlatnostOd/Do

**Workflow pre KÚV:**
```
1. /OpenData/PartneriVerejnehoSektora?$filter=Ico eq '{ico}'
   → vráti PartnerId
2. /OpenData/Partneri({partnerId})?$expand=KonecniUzivateliaVyhod,OpravneneOsoby
   → vráti KÚV a oprávnené osoby
```

### 4.4 Finančná správa SR (iz.opendata.financnasprava.sk)

| Endpoint | Parametre | Popis |
|----------|-----------|-------|
| `/api/lists` | — | Zoznam dostupných zoznamov |
| `/api/data/{slug}?page=` | `page` (od 1) | Dáta z registra (stránkované, 1000/page) |
| `/api/data/{slug}/search` | `column`, `search` (min 5 znakov!), `page` | Hľadanie |

**Dôležité slugy:**
| Slug | Čo obsahuje | Hľadací stĺpec |
|------|-------------|-----------------|
| `ds_dphs` | Registrovaní platitelia DPH | `ic_dph` (napr. "SK2021869234") |
| `ds_dsdd` | Daňoví dlžníci | `ico` alebo `nazov` |
| `ds_dphz` | Dôvody na zrušenie DPH | `ico` |
| `ds_dphv` | Vymazaní z DPH | `ico` |
| `ds_ids` | Index daňovej spoľahlivosti | `ico` |

**Auth:** API kľúč (header `key`)
**Rate limit:** 1 000 req/hodina
**POZOR:** Search parameter `search` musí mať minimálne 5 znakov! Pre IČO 8 znakov OK, pre kratšie treba dopadovať.

### 4.5 IS REPLIK SOAP (replik-ws.justice.sk)

| WSDL | Služba |
|------|--------|
| `https://replik-ws.justice.sk/ru-verejnost-ws/konanieService.wsdl` | Konania (konkurzy, reštrukturalizácie, likvidácie) |
| `https://replik-ws.justice.sk/ru-verejnost-ws/oznamService.wsdl` | Oznamy (uznesenia, rozhodnutia) |

**Auth:** Žiadna (verejný prístup)
**Formát:** SOAP/XML
**Integračná príručka:** [PDF v1.0.7](https://www.justice.gov.sk/dokumenty/2025/11/REPLIK_Integracny-manual-pre-verejnost_v1.0.7.pdf)

### 4.6 DataHub slovensko.digital

| Endpoint | Popis |
|----------|-------|
| `/api/data/rpo2/organizations/{id}` | RPO detail (interné ID, nie IČO!) |
| `/api/data/rpo2/organizations/sync?since=&last_id=&limit=` | RPO sync |
| `/api/data/crz/contracts/{id}` | CRZ zmluva detail |
| `/api/data/crz/contracts/sync` | CRZ sync |
| `/api/data/ov/or_podanie_issues/{id}` | OR podania z OV |
| `/api/data/ov/konkurz_restrukturalizacia_issues/{id}` | Konkurzy z OV |
| `/api/data/ov/likvidator_issues/{id}` | Likvidácie z OV |
| `/api/data/socpoist/debtors/{id}` | Dlžníci Soc. poisťovne |
| `/api/data/vszp/debtors/{id}` | Dlžníci VšZP |

**Auth:** Žiadna
**Rate limit:** 60 req/min per IP
**POZOR:** DataHub používa interné ID, nie IČO! Pre vyhľadávanie podľa IČO treba sync endpoint a filtrovať, alebo radšej použiť ŠÚSR RPO.

### 4.7 ITMS2014+ EU fondy

| Endpoint | Parametre | Popis |
|----------|-----------|-------|
| `/v2/projekty/vrealizacii` | `prijimatelId`, `limit`, `minId` | Projekty v realizácii |
| `/v2/projekty/ukoncene` | `prijimatelId`, `limit`, `minId` | Ukončené projekty |
| `/v2/subjekty/{subjektId}` | — | Detail subjektu |
| `/v2/dodavatelia/{id}` | — | Detail dodávateľa |
| `/v2/uctovneDoklady` | `projektId`, `dodavatelId` | Účtovné doklady |

**Auth:** Žiadna (verejné API)
**POZOR:** Nemá priamy search podľa IČO na projektoch! Workflow:
1. Iterovať `/v2/projekty/vrealizacii` a filtrovať podľa `prijimatel.subjekt.ico`
2. Alebo: ak poznáme `subjektId`, použiť `/v2/subjekty/{id}` pre detail
3. Žiadny `/v2/subjekty?ico=X` endpoint neexistuje (overené)
**Swagger:** https://opendata.itms2014.sk/swagger/?url=/v2/swagger.json

**ITMS subjekt response (overená):**
```json
{
  "id": 100142, "ico": "47759097", "dic": "2024091784",
  "nazov": "Slovak Investment Holding, a. s.",
  "ulica": "Grösslingová", "ulicaCislo": "44", "psc": "81109"
}
```

### 4.8 EU VIES (LIVE overené)

**REST API (odporúčané):**
```
POST https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number
Content-Type: application/json

{"countryCode": "SK", "vatNumber": "2021869234"}
```

**Overená response (Websupport):**
```json
{
  "countryCode": "SK",
  "vatNumber": "2021869234",
  "requestDate": "2026-03-24T18:43:14.965Z",
  "valid": true,
  "name": "Websupport s. r. o.",
  "address": "Karadžičova 7608/12\n82108 Bratislava..."
}
```

**Auth:** Žiadna
**POZOR:** Používa DIČ (nie IČO)! Treba DIČ získať z RegisterUZ alebo RPO.
**SOAP alternatíva:** `checkVatService` — ale REST je jednoduchší, **SOAP nie je potrebný pre VIES**.

---

## 5. MCP Tools — Navrhované nástroje

### 5.1 Tier 1 — Hlavné (vysoká priorita)

| Nástroj | Input | Čo robí |
|---------|-------|---------|
| `company_search` | `query` (IČO, názov, DIČ) | Inteligentný search → vráti IČO + základné info |
| `company_full_profile` | `ico` | Mega-profil zo VŠETKÝCH zdrojov paralelne |
| `company_financials` | `ico`, `year?` | RegisterUZ: závierky + rozparsované výkazy |
| `financial_report_detail` | `reportId` | Detail výkazu (všetky riadky s pomenovaním) |
| `financial_report_pdf` | `reportId` | Generovaný PDF výkaz |
| `financial_attachment` | `attachmentId` | PDF príloha (poznámky k závierke) |

### 5.2 Tier 2 — Špecializované

| Nástroj | Input | Zdroj |
|---------|-------|-------|
| `company_people` | `ico` | RPO — štatutári, spoločníci, vklady |
| `company_history` | `ico` | RPO — história zmien (názvy, adresy, osoby) |
| `company_branches` | `ico` | RPO — prevádzkarne a org. zložky |
| `company_kuv` | `ico` | RPVS — koneční užívatelia výhod |
| `company_insolvency` | `ico` | IS REPLIK — konkurzy, reštrukturalizácie |
| `company_insolvency_notices` | `ico` | IS REPLIK — oznamy k konaniam |
| `company_tax_status` | `ico` | FinSpr — DPH + dlžníci + index spoľahlivosti |
| `company_eu_funds` | `ico` | ITMS — eurofondy |
| `company_vat_check` | `vatNumber` | EU VIES — overenie IČ DPH |
| `company_debts` | `ico` | ZP + SocPoist dlžníci |
| `company_compare` | `icos[]` | Porovnanie 2–10 firiem + personálne prepojenia |

### 5.3 Tier 3 — Doplnkové

| Nástroj | Input | Zdroj |
|---------|-------|-------|
| `crz_contracts` | `ico` | DataHub CRZ — zmluvy s verejným sektorom |
| `ov_filings` | `ico` | DataHub OV — podania na obchodný register |
| `insolvency_detail` | `konanieId` | IS REPLIK — detail konania |

---

## 6. Technický stack

```
Runtime:          Node.js 20+ (TypeScript)
MCP SDK:          @modelcontextprotocol/sdk (latest)
HTTP klient:      undici (native fetch) + custom retry/timeout
SOAP klient:      soap (npm) pre REPLIK (VIES má REST API → nepotrebuje SOAP)
OData klient:     custom fetch s query builder
PDF download:     native fetch → Buffer → base64
Cache:            In-memory LRU (šablóny RUZ, číselníky)
Deploy:           Render.com Web Service (Docker)
Transport:        Streamable HTTP (SSE fallback)
```

---

## 7. Projektová štruktúra

```
trustico-mcp/
├── src/
│   ├── index.ts                    # Entry point, MCP server setup
│   ├── server.ts                   # MCP server konfigurácia, tool registrácia
│   │
│   ├── tools/                      # MCP tool handlery
│   │   ├── company-search.ts
│   │   ├── company-full-profile.ts
│   │   ├── company-financials.ts
│   │   ├── company-people.ts
│   │   ├── company-history.ts
│   │   ├── company-branches.ts
│   │   ├── company-kuv.ts
│   │   ├── company-insolvency.ts
│   │   ├── company-tax-status.ts
│   │   ├── company-eu-funds.ts
│   │   ├── company-vat-check.ts
│   │   ├── company-debts.ts
│   │   ├── company-compare.ts
│   │   ├── financial-report.ts
│   │   ├── financial-attachment.ts
│   │   └── crz-ov-tools.ts
│   │
│   ├── adapters/                   # API adaptery (jeden per zdroj)
│   │   ├── rpo.adapter.ts          # ŠÚSR RPO (api.statistics.sk)
│   │   ├── ruz.adapter.ts          # RegisterUZ (registeruz.sk)
│   │   ├── rpvs.adapter.ts         # RPVS OData (rpvs.gov.sk)
│   │   ├── finspr.adapter.ts       # Finančná správa (iz.opendata.financnasprava.sk)
│   │   ├── replik.adapter.ts       # IS REPLIK SOAP (replik-ws.justice.sk)
│   │   ├── datahub.adapter.ts      # DataHub slovensko.digital
│   │   ├── itms.adapter.ts         # ITMS2014+ (opendata.itms2014.sk)
│   │   ├── vies.adapter.ts         # EU VIES SOAP
│   │   └── zp.adapter.ts           # Zdravotné poisťovne (scraping)
│   │
│   ├── orchestrator/               # Orchestrácia paralelných volaní
│   │   ├── full-profile.ts         # Promise.allSettled() pre mega-profil
│   │   ├── ruz-pipeline.ts         # Multi-step RegisterUZ pipeline
│   │   └── resolver.ts             # IČO resolver (názov/DIČ → IČO)
│   │
│   ├── utils/
│   │   ├── http-client.ts          # Fetch wrapper s retry, timeout, rate limiting
│   │   ├── soap-client.ts          # SOAP wrapper pre REPLIK + VIES
│   │   ├── odata-builder.ts        # OData query builder
│   │   ├── ruz-parser.ts           # Parser RUZ tabuliek + šablón → pomenované riadky
│   │   ├── cache.ts                # In-memory LRU cache
│   │   ├── validators.ts           # IČO/DIČ/IČ DPH validácia
│   │   └── encoding.ts             # UTF-8 fix (RPO vracia broken encoding)
│   │
│   └── types/                      # TypeScript typy
│       ├── rpo.types.ts
│       ├── ruz.types.ts
│       ├── rpvs.types.ts
│       ├── finspr.types.ts
│       ├── replik.types.ts
│       └── common.types.ts
│
├── Dockerfile
├── render.yaml
├── package.json
├── tsconfig.json
└── .env.example                    # FINSPR_API_KEY, atď.
```

---

## 8. Kritické implementačné detaily

### 8.1 RPO encoding bug
RPO API vracia UTF-8 texty s broken encoding (napr. `"Karad\u00c5\u00bei\u00c4\udc8dova"` namiesto `"Karadžičova"`).
**Riešenie:** Dekódovať response buffer ako `latin1`, potom re-encode ako `utf8`.

### 8.2 RegisterUZ — mapovanie tabuliek na pomenované riadky
RUZ vracia čísla v poliach bez pomenovaní. Na mapovanie treba:
1. Z výkazu získať `idSablony` (napr. 700)
2. Stiahnuť šablónu `/api/sablona?id=700`
3. Šablóna definuje stĺpce a riadky → mapovať dáta na riadkové názvy
4. **Šablóny cachovať** (menia sa raz za rok)

### 8.3 Finančná správa — 5-znakový minimum
Search parameter musí mať min. 5 znakov. IČO má 8 → OK.
Ale DIČ/IČ DPH musí byť aspoň 5 znakov (vždy je, ale treba validovať).

### 8.4 RPVS — nie každá firma je v registri
RPVS obsahuje len firmy, ktoré sú **partnerom verejného sektora** (štátne zákazky > 100K €).
Väčšina firiem tam nie je → vrátiť `{ found: false }`, nie error.

### 8.5 DataHub — interné ID, nie IČO
DataHub nepoužíva IČO ako primárny kľúč. Pre lookup podľa IČO radšej používať:
- ŠÚSR RPO API priamo (má search by `identifier`)
- DataHub sync endpoint + filtrovanie (pomalšie, fallback)

### 8.6 Rate limiting stratégia
```
ŠÚSR RPO:       max 30 req/min (conservative)
RegisterUZ:     max 30 req/min
RPVS:           max 20 req/min
Finančná správa: max 15 req/min (1000/h ÷ 60 = 16.6)
DataHub:        max 50 req/min (limit 60)
ITMS:           max 30 req/min
REPLIK:         max 20 req/min
VIES:           max 10 req/min (EU service, be polite)
```

### 8.7 Timeout stratégia
- Per-adapter timeout: **8 sekúnd**
- Full profile celkový timeout: **15 sekúnd**
- RegisterUZ pipeline (s PDF): **20 sekúnd**
- Retry: max 1 retry s exponential backoff (1s, 2s)

---

## 9. Sub-agenti pre implementáciu

Pre efektívnu paralelizáciu práce navrhujem týchto sub-agentov:

### Agent 1: `core-setup`
**Čo robí:** Základná kostra projektu
- package.json, tsconfig.json, Dockerfile, render.yaml
- MCP server setup (index.ts, server.ts)
- HTTP client wrapper s retry/timeout
- Spoločné typy (common.types.ts)
- IČO/DIČ validátory

### Agent 2: `rpo-adapter`
**Čo robí:** ŠÚSR RPO adapter + IČO resolver
- rpo.adapter.ts — search + entity detail
- resolver.ts — IČO resolver (názov/DIČ → IČO)
- Encoding fix pre broken UTF-8
- Tool: company_search, company_people, company_history, company_branches

### Agent 3: `ruz-adapter`
**Čo robí:** RegisterUZ adapter (NAJKRITICKEJŠÍ)
- ruz.adapter.ts — full pipeline (jednotka → závierka → výkaz → šablóna)
- ruz-parser.ts — mapovanie tabuliek na pomenované riadky
- Cache pre šablóny
- PDF download + base64 encoding
- Tool: company_financials, financial_report_detail, financial_report_pdf, financial_attachment

### Agent 4: `secondary-adapters`
**Čo robí:** RPVS + FinSpr + DataHub + ITMS
- rpvs.adapter.ts — OData query builder + KÚV lookup
- finspr.adapter.ts — search v registroch FS
- datahub.adapter.ts — CRZ, OV endpoints
- itms.adapter.ts — eurofondy
- Tool: company_kuv, company_tax_status, company_eu_funds, crz/ov tools

### Agent 5: `soap-adapters`
**Čo robí:** IS REPLIK + EU VIES (SOAP)
- replik.adapter.ts — SOAP wrapper pre konanieService + oznamService
- vies.adapter.ts — SOAP wrapper pre checkVatService
- soap-client.ts — shared SOAP utilities
- Tool: company_insolvency, company_vat_check

### Agent 6: `orchestrator-and-tools`
**Čo robí:** Orchestrácia + tool handlery
- full-profile.ts — mega-profil orchestrátor
- Všetky MCP tool handlery v tools/
- company_compare logika (personálne prepojenia)
- company_debts (ZP scraping)

### Agent 7: `deploy-and-test`
**Čo robí:** Deployment + testovanie
- Dockerfile optimalizácia
- render.yaml konfigurácia
- Integration testy pre každý adapter
- E2E test: full_profile pre testovacie IČO

---

## 10. Deployment na Render

```yaml
# render.yaml
services:
  - type: web
    name: trustico-mcp
    runtime: docker
    plan: starter
    envVars:
      - key: FINSPR_API_KEY
        sync: false
      - key: NODE_ENV
        value: production
      - key: PORT
        value: "3000"
    healthCheckPath: /health
```

**Dockerfile:**
```dockerfile
FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY dist/ ./dist/
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

**MCP transport:** Streamable HTTP na `/mcp` endpointe.

---

## 11. Rozhodnutia (2026-03-24)

| Otázka | Rozhodnutie |
|--------|-------------|
| FinSpr API kľúč | **Máme.** Uložený v `.env` |
| ZP dlžníci | **VYNECHANÉ v v1.** Scraping = šedá zóna legality, pomalé, nízky business value |
| Autentifikácia | **Bearer token** (`MCP_API_KEY` env var). Middleware na každom requeste. |
| ITMS2014+ | Best-effort, nízka priorita (nemá IČO search) |
| ORSR.sk fallback | Neskôr v v2 ak bude dopyt |
| Caching | In-memory LRU (šablóny RUZ, číselníky). Redis zbytočný pre v1. |
