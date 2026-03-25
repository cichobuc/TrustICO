# TrustICO MCP Server

> Remote MCP Server pre kompletný lookup slovenských firiem z oficiálnych štátnych registrov SR.

Jeden MCP endpoint, 17 toolov, 8 dátových zdrojov — všetko cez jedno IČO.

## Dátové zdroje

| Zdroj | Typ | Čo poskytuje |
|-------|-----|-------------|
| **ŠÚSR RPO** | REST | Základné údaje, štatutári, spoločníci, história, prevádzkarne |
| **RegisterÚZ** | REST | Účtovné závierky, finančné výkazy, PDF prílohy |
| **RPVS** | OData v4 | Koneční užívatelia výhod (KÚV), oprávnené osoby |
| **Finančná správa** | REST | DPH registrácia, daňový dlžník, index spoľahlivosti |
| **EU VIES** | REST | Overenie IČ DPH v rámci EÚ |
| **IS REPLIK** | SOAP | Insolvenčné konania, oznamy |
| **DataHub** | REST | CRZ zmluvy, Obchodný vestník |
| **ITMS2014+** | REST | Eurofondy (best-effort) |

## Rýchly štart

```bash
git clone https://github.com/<your-org>/trustico-mcp.git
cd trustico-mcp
npm install
cp .env.example .env   # vyplň FINSPR_API_KEY
npm run dev
```

Server beží na `http://localhost:3000`. Health check: `GET /health`, MCP: `POST /mcp`.

## Konfigurácia

| Premenná | Povinné | Popis |
|----------|---------|-------|
| `PORT` | nie | HTTP port (default: `3000`) |
| `FINSPR_API_KEY` | áno* | API kľúč pre Finančnú správu ([registrácia](https://opendata.financnasprava.sk/page/openapi)) |
| `MCP_API_KEY` | nie | Bearer token pre prístup k MCP serveru |
| `NODE_ENV` | nie | `production` / `development` |
| `LOG_LEVEL` | nie | `debug` / `info` / `warn` / `error` |

\* Bez `FINSPR_API_KEY` fungujú všetky nástroje okrem `company_tax_status`.

## Príkazy

```bash
npm install          # Inštalácia závislostí
npm run build        # TypeScript → dist/
npm run dev          # Dev server s watch mode (tsx)
npm start            # Produkčný štart
npm run typecheck    # tsc --noEmit
npm test             # Integration testy (vitest)
```

## Endpointy

| Metóda | Path | Auth | Popis |
|--------|------|------|-------|
| `POST` | `/mcp` | Bearer | MCP Streamable HTTP transport |
| `GET` | `/mcp` | Bearer | SSE stream (existujúca session) |
| `DELETE` | `/mcp` | Bearer | Ukončenie session |
| `GET` | `/health` | — | Health check všetkých zdrojov |

## MCP Tooly

### Základné (RPO)

| Tool | Vstup | Popis |
|------|-------|-------|
| `company_search` | query | Inteligentný search — rozpozná IČO, názov firmy alebo DIČ |
| `company_people` | IČO | Štatutári, spoločníci, vklady, spôsob konania |
| `company_history` | IČO | História zmien názvov, adries, štatutárov |
| `company_branches` | IČO | Prevádzkarne a organizačné zložky |

### Financie (RegisterÚZ)

| Tool | Vstup | Popis |
|------|-------|-------|
| `company_financials` | IČO, rok? | Závierky, výkazy, kľúčové ukazovatele |
| `financial_report_detail` | reportId | Detailný výkaz s pomenovanými riadkami |
| `financial_attachment` | attachmentId | PDF príloha (base64) |
| `financial_report_pdf` | reportId | Generované PDF výkazu (base64) |

### Dane a DPH

| Tool | Vstup | Popis |
|------|-------|-------|
| `company_tax_status` | IČO | DPH, index spoľahlivosti, daňový dlžník |
| `company_vat_check` | IČ DPH | Overenie IČ DPH cez EU VIES |

### Ďalšie zdroje

| Tool | Vstup | Popis |
|------|-------|-------|
| `company_kuv` | IČO | Koneční užívatelia výhod (RPVS) |
| `company_insolvency` | IČO | Insolvenčné konania |
| `company_insolvency_notices` | IČO | Oznamy k insolvenčným konaniam |
| `insolvency_detail` | konanieId | Detail konania s udalosťami |
| `crz_contracts` | contractId | Detail CRZ zmluvy |
| `ov_filing` | id, typ | Podanie z Obchodného vestníka |
| `company_eu_funds` | IČO | Eurofondy (ITMS2014+) |

### Orchestrácia

| Tool | Vstup | Popis |
|------|-------|-------|
| `company_full_profile` | IČO | Kompletný profil zo všetkých zdrojov naraz (max 15s) |
| `company_compare` | 2–10 IČO | Porovnanie firiem + personálne prepojenia |

## Architektúra

```
src/
  index.ts              # HTTP server + MCP transport + auth
  server.ts             # Registrácia všetkých toolov
  tools/                # MCP tool handlery (1 súbor = 1 tool)
    _shared-clients.ts  # Singleton adaptery a pipeline
  adapters/             # API adaptery (1 súbor = 1 dátový zdroj)
  orchestrator/         # Multi-source orchestrácia
    resolver.ts         # IČO / DIČ / názov → RPO výsledky
    ruz-pipeline.ts     # IČO → závierky → výkazy → parsed data
    full-profile.ts     # Paralelné volanie všetkých zdrojov
  utils/                # HTTP client, SOAP client, cache, parsery
  types/                # TypeScript typy (1 súbor per zdroj)
```

### Kľúčové dizajnové rozhodnutia

- **Žiadne `throw` v adapteroch** — vždy `{ found: false, error: "..." }`
- **`Promise.allSettled`** pre paralelné volania — ak jeden zdroj padne, ostatné fungujú
- **Token bucket rate limiting** per zdroj — ochrana pred API throttlingom
- **LRU cache s TTL** — šablóny (24h), entity detail (5min)
- **Timing-safe auth** — `crypto.timingSafeEqual` pre Bearer token
- **`_meta`** v každej odpovedi — source, durationMs, timestamp

## Deploy

### Docker

```bash
docker build -t trustico .
docker run -p 3000:3000 --env-file .env trustico
```

### Render.com

Projekt obsahuje `render.yaml` — stačí pripojiť repo a deploy prebehne automaticky.

## Tech Stack

- **Runtime:** Node.js 20+ (TypeScript 5.x, strict mode)
- **MCP SDK:** `@modelcontextprotocol/sdk`
- **HTTP:** native `fetch` + custom wrapper s retry/timeout
- **SOAP:** `soap` npm package (IS REPLIK)
- **Build:** `tsc` → `dist/`
- **Testy:** Vitest (integration)

## Licencia

ISC
