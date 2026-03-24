---
name: check-health
description: Check health and latency of all Slovak registry API endpoints
---

Skontroluj zdravie všetkých API zdrojov, ktoré TrustICO MCP server používa.

## Kroky

### 1. Ping každý API endpoint

Pošli lightweight GET request na každý endpoint a zmeraj latency:

```bash
# RPO
curl -s -o /dev/null -w "%{http_code} %{time_total}" "https://api.statistics.sk/rpo/v1/entity?identifier=36421928"

# RegisterUZ
curl -s -o /dev/null -w "%{http_code} %{time_total}" "https://registeruz.sk/cruz-public/api/uctovne-jednotky?zmenene-od=2000-01-01&ico=36421928"

# RPVS
curl -s -o /dev/null -w "%{http_code} %{time_total}" "https://rpvs.gov.sk/OpenData/Partneri?\$filter=Ico%20eq%20%2736421928%27"

# Finančná správa (vyžaduje API kľúč)
curl -s -o /dev/null -w "%{http_code} %{time_total}" -H "key: $FINSPR_API_KEY" "https://iz.opendata.financnasprava.sk/api/data/ds_dphs/search?column=ico&search=36421928&page=1"

# VIES
curl -s -o /dev/null -w "%{http_code} %{time_total}" -X POST "https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number" -H "Content-Type: application/json" -d '{"countryCode":"SK","vatNumber":"2020270604"}'

# IS REPLIK
curl -s -o /dev/null -w "%{http_code} %{time_total}" "https://replik-ws.justice.sk/konanieService?wsdl"
```

### 2. Ak beží lokálny server, skontroluj aj health endpoint

```bash
curl -s http://localhost:3000/health
```

### 3. Zobraz status tabuľku

```
┌───────────────────┬────────┬───────────┬─────────────────────────┐
│ Zdroj             │ Status │ Latency   │ Poznámka                │
├───────────────────┼────────┼───────────┼─────────────────────────┤
│ ŠÚSR RPO          │ ✅ UP  │ 342ms     │                         │
│ RegisterUZ        │ ✅ UP  │ 1203ms    │ Pomalý, ale funkčný     │
│ RPVS              │ ✅ UP  │ 156ms     │                         │
│ Finančná správa   │ ⚠️ KEY │ —         │ Chýba FINSPR_API_KEY    │
│ EU VIES           │ ✅ UP  │ 890ms     │                         │
│ IS REPLIK         │ ❌ DOWN│ timeout   │ SOAP service nedostupný │
│ Lokálny server    │ ✅ UP  │ 12ms      │ /health OK              │
└───────────────────┴────────┴───────────┴─────────────────────────┘
```

## Status definície

- **UP** — HTTP 200, response < 5s
- **SLOW** — HTTP 200, response 5-10s
- **DOWN** — HTTP error alebo timeout > 10s
- **KEY** — Chýba API kľúč (nemožno otestovať)
- **N/A** — Endpoint ešte nie je implementovaný
