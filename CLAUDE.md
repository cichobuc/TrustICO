# TrustICO MCP Server

Remote MCP Server pre kompletný lookup slovenských firiem z oficiálnych štátnych registrov SR.

## Tech Stack

- **Runtime:** Node.js 20+ (TypeScript 5.x, strict mode)
- **MCP SDK:** `@modelcontextprotocol/sdk` (latest)
- **HTTP:** native `fetch` (Node 20+) + custom wrapper s retry/timeout
- **SOAP:** `soap` npm package (len pre IS REPLIK)
- **Build:** `tsc` → `dist/`
- **Deploy:** Docker → Render.com (Web Service)
- **Transport:** Streamable HTTP na `/mcp`, health check na `/health`

## Príkazy

```bash
npm install          # Inštalácia závislostí
npm run build        # TypeScript → dist/
npm run dev          # Dev server s watch mode (tsx)
npm run start        # Produkčný štart (node dist/index.js)
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit
npm test             # Integration testy (vitest)
```

## Štruktúra projektu

```
src/
  index.ts              # HTTP server + MCP transport
  server.ts             # MCP tool/resource registrácia
  tools/                # MCP tool handlery (jeden súbor = jeden tool)
  adapters/             # API adaptery (jeden súbor = jeden dátový zdroj)
  orchestrator/         # Multi-source orchestrácia (full-profile, resolver)
  utils/                # HTTP client, SOAP client, cache, parsery, validátory
  types/                # TypeScript typy (jeden súbor per zdroj + common)
tests/                  # Integration testy
```

## Kódové konvencie

### Pomenovanie
- Súbory: `kebab-case.ts` (napr. `rpo.adapter.ts`, `company-search.ts`)
- Triedy/Typy: `PascalCase` (napr. `RpoAdapter`, `CompanyProfile`)
- Funkcie/premenné: `camelCase`
- Konštanty: `UPPER_SNAKE_CASE` (napr. `RPO_BASE_URL`)
- MCP tool mená: `snake_case` (napr. `company_full_profile`)

### Adaptery
Každý adapter je trieda s týmito pravidlami:
- Exportuje jednu triedu (napr. `RpoAdapter`)
- Konštruktor prijíma `HttpClient` dependency
- Metódy vracajú `Promise<AdapterResult<T>>` kde:
  ```typescript
  type AdapterResult<T> = {
    found: boolean;
    data?: T;
    error?: string;
    durationMs: number;
    source: string;
  }
  ```
- **NIKDY** nehádže exceptions na API chyby — vráti `{ found: false, error: "..." }`
- Timeout per request: 8s (konfigurovalné)
- Max 1 retry s exponential backoff

### Tool handlery
- Každý tool handler je funkcia registrovaná v `server.ts`
- Validácia inputu (IČO = 8 číslic, DIČ = 10 číslic)
- Vracia JSON s `_meta` sekciou:
  ```typescript
  {
    ...data,
    _meta: {
      source: "rpo",
      durationMs: 234,
      timestamp: "2026-03-24T18:00:00Z"
    }
  }
  ```

### Error handling
- **Graceful degradation** — ak jeden API zdroj padne, ostatné fungujú
- `Promise.allSettled()` pre paralelné volania
- Žiadne `throw` v adapteroch — len `{ found: false, error }`
- MCP tool error = `{ isError: true, content: [{ type: "text", text: "..." }] }`

## API Quirks (KRITICKÉ — prečítaj pred implementáciou)

### ŠÚSR RPO (api.statistics.sk/rpo/v1)
- Parameter pre IČO je **`identifier`**, NIE `ico`!
- Search vracia `results[].id` — toto je interné ID, nie IČO
- Pre detail: `/entity/{id}` (nie `/entity/{ico}`)
- **Encoding bug:** Response content vracia broken UTF-8 — treba `Buffer` decode ako `latin1` → re-encode `utf8`
- Parametre: `fullName`, `onlyActive`, `showHistoricalData`, `showOrganizationUnits`

### RegisterUZ (registeruz.sk/cruz-public/api)
- **`zmenene-od` je POVINNÝ** parameter aj pri search by IČO! Použiť `zmenene-od=2000-01-01`
- Workflow je 4-krokový: jednotka → závierka → výkaz → šablóna
- Šablóny (`/api/sablona?id=`) mapujú surové čísla na pomenované riadky — **CACHUJ šablóny**
- PDF prílohy: `/domain/financialreport/attachment/{id}` (binary)
- Generované PDF: `/domain/financialreport/pdf/{id}`
- IČO search: `/api/uctovne-jednotky?zmenene-od=2000-01-01&ico=36421928`

### RPVS OData (rpvs.gov.sk/OpenData)
- OData v4 — `$filter=Ico eq '36421928'`
- **`$top=0` nie je povolené!**
- Väčšina firiem NIE JE v registri (len partneri verejného sektora)
- Vždy vráť `{ found: false }` ak prázdny výsledok, nie error

### Finančná správa (iz.opendata.financnasprava.sk/api)
- **Vyžaduje API kľúč** v header `key`
- Search min. 5 znakov (IČO = 8 → OK)
- Slugy: `ds_dphs` (DPH), `ds_dsdd` (dlžníci), `ds_dphz` (zrušenie), `ds_dphv` (vymazanie), `ds_ids` (index)
- Endpoint: `/api/data/{slug}/search?column=ico&search={ico}&page=1`

### EU VIES
- **Používaj REST API**, nie SOAP: `POST https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number`
- Používa **DIČ** (nie IČO)! `{"countryCode": "SK", "vatNumber": "{dic}"}`
- DIČ získaj z RegisterUZ alebo RPO

### IS REPLIK SOAP (replik-ws.justice.sk)
- **Od 1.10.2025 nový systém** — nahradil starý "Register úpadcov"
- SOAP 1.1 — `konanieService` a `oznamService`
- **WSDL path sa zmenil!** Starý: `/replik/...?wsdl` → Nový: `/ru-verejnost-ws/...Service.wsdl`
- Production WSDL: `https://replik-ws.justice.sk/ru-verejnost-ws/konanieService.wsdl`
- Production WSDL: `https://replik-ws.justice.sk/ru-verejnost-ws/oznamService.wsdl`
- Test WSDL: `https://replik-wst.justice.sk/ru-verejnost-ws/konanieService.wsdl`
- **Autentifikácia NIE JE potrebná** — verejné API bez registrácie
- Search by IČO: operácia `vyhladajKonania` s parametrom `ico`
- Detail: operácia `getKonanieDetail` s parametrom `konanieId`
- Integračný manuál: https://www.justice.gov.sk/sluzby/register-predinsolvencnych-likvidacnych-a-insolvencnych-konani/prirucky-a-manualy-k-is-replik/

### DataHub slovensko.digital
- Používa **interné ID**, nie IČO — pre IČO lookup radšej ŠÚSR RPO
- Rate limit: **60 req/min** per IP
- Pre OV/CRZ detail: `/api/data/{source}/{type}/{id}`

### ITMS2014+ (opendata.itms2014.sk/v2)
- **Nemá priamy search podľa IČO na projektoch!**
- Endpoint `/v2/subjekty/{id}` funguje len s interným ID
- Pre eurofondy lookup: iterovať projekty, filtrovať podľa `prijimatel.subjekt.ico`

## Testovacie IČO

| IČO | Firma | Účel testu |
|-----|-------|------------|
| `36421928` | Websupport s.r.o. | Happy path — aktívna, závierky, DPH |
| `35757442` | ESET, spol. s r.o. | Veľká firma, veľa závierok |
| `00000001` | Neexistuje | 404/not found handling |
| `31322832` | Slovenská pošta | Štátny podnik, RPVS |
| `00151742` | Zrušená firma | Terminated company |

## Rozhodnutia (2026-03-24)

- **ZP dlžníci (Dôvera, Union, SocPoist):** VYNECHANÉ v v1. Legalita scrapingu sporná, pomalé, nízky business value. Ak bude dopyt, pridať SocPoist cez DataHub v v2.
- **Autentifikácia:** MCP server chránený Bearer tokenom (`MCP_API_KEY`). Middleware overí header `Authorization: Bearer {key}` na každom requeste.
- **VIES:** Používať REST API (nie SOAP). Overené, funguje.
- **ITMS:** Nemá search by IČO — implementovať ako best-effort (iterácia projektov). Nízka priorita.

## Environment Variables

```
PORT=3000                    # HTTP port
FINSPR_API_KEY=              # Finančná správa API kľúč (povinný pre FS endpointy)
MCP_API_KEY=                 # Bearer token pre prístup k MCP serveru
NODE_ENV=production          # production / development
LOG_LEVEL=info               # debug / info / warn / error
```

## Rate Limiting (interný, per-source)

```
ŠÚSR RPO:       30 req/min
RegisterUZ:     30 req/min
RPVS:           20 req/min
Finančná správa: 15 req/min
DataHub:        50 req/min
ITMS:           30 req/min
IS REPLIK:      20 req/min
EU VIES:        10 req/min
```
