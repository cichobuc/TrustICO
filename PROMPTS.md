# TrustICO — Prompty pre každú fázu

Tieto prompty skopíruj a použi po `/clear` na začiatku každej session.

---

## Fáza 0: Project Init

```
Prečítaj CLAUDE.md a IMPLEMENTATION-PLAN.md. Sprav Fázu 0:
- npm init (name: trustico-mcp, type: module, engine: node 20+)
- Nainštaluj dependencies: @modelcontextprotocol/sdk, dotenv, soap
- Nainštaluj dev deps: typescript, @types/node, tsx, vitest, eslint
- Vytvor tsconfig.json (strict, ES2022, NodeNext, outDir: dist)
- Vytvor src/index.ts — HTTP server na PORT z env, placeholder /health endpoint
- Vytvor src/server.ts — MCP server s prázdnym tool listom
- Over že npm run build a npm run dev fungujú
- Commitni
```

---

## Fáza 1: Core Infrastructure

```
Prečítaj CLAUDE.md a IMPLEMENTATION-PLAN.md. Sprav Fázu 1 — Core Infrastructure:
- src/utils/http-client.ts — fetch wrapper s retry (1x, exp backoff), timeout (8s default), rate limiting (token bucket per source)
- src/utils/validators.ts — validácia a normalizácia IČO (8 číslic, pad left), DIČ (10 číslic), IČ DPH (SK prefix)
- src/utils/encoding.ts — fix broken UTF-8 z RPO API (latin1→utf8 re-encode)
- src/utils/cache.ts — in-memory LRU cache s TTL (pre RUZ šablóny)
- src/types/common.types.ts — AdapterResult<T>, MetaInfo, ZdrojStatus
- Auth middleware — Bearer token check z MCP_API_KEY env var
- Commitni
```

---

## Fáza 2a: RPO Adapter + Resolver

```
Prečítaj CLAUDE.md, TOOLS-SPEC.md (company_search, company_people, company_history, company_branches) a IMPLEMENTATION-PLAN.md. Sprav Fázu 2a:
- src/types/rpo.types.ts
- src/adapters/rpo.adapter.ts — search(identifier), searchByName(fullName), getEntity(rpoId) s encoding fixom
- src/orchestrator/resolver.ts — IČO resolver: rozpozná IČO/názov/DIČ a vráti IČO
- src/tools/company-search.ts, company-people.ts, company-history.ts, company-branches.ts
- Zaregistruj tools v server.ts
- Over s IČO 36421928 (Websupport)
- Commitni
```

---

## Fáza 2b: RegisterUZ Adapter

```
Prečítaj CLAUDE.md, TOOLS-SPEC.md (company_financials, financial_report_detail, financial_attachment, financial_report_pdf) a IMPLEMENTATION-PLAN.md. Sprav Fázu 2b — NAJKRITICKEJŠIU:
- src/types/ruz.types.ts
- src/adapters/ruz.adapter.ts — findEntity(ico), getEntity(id), getStatement(id), getReport(id), getTemplate(id) [cached!], getAttachment(id), getReportPdf(id)
- src/utils/ruz-parser.ts — mapovanie šablóna + surové dáta → pomenované riadky so stĺpcami
- src/orchestrator/ruz-pipeline.ts — IČO → entity → najnovšia závierka → výkazy → parsed data. Error handling na každom kroku.
- src/tools/company-financials.ts, financial-report.ts, financial-attachment.ts
- Zaregistruj tools v server.ts
- Over celý pipeline s IČO 36421928
- Commitni
```

---

## Fáza 2c: Sekundárne adaptery

```
Prečítaj CLAUDE.md, TOOLS-SPEC.md (company_kuv, company_tax_status, company_vat_check) a IMPLEMENTATION-PLAN.md. Sprav Fázu 2c:
- src/adapters/rpvs.adapter.ts — OData $filter=Ico eq '{ico}', $expand KÚV+OpravneneOsoby
- src/adapters/finspr.adapter.ts — search v ds_dphs, ds_dsdd, ds_dphz, ds_dphv, ds_ids. Použi FINSPR_API_KEY z env.
- src/adapters/vies.adapter.ts — REST POST /check-vat-number, auto-prefix SK
- src/tools/company-kuv.ts, company-tax-status.ts, company-vat-check.ts
- Zaregistruj tools v server.ts
- Over každý adapter
- Commitni
```

---

## Fáza 2d: SOAP + DataHub

```
Prečítaj CLAUDE.md, TOOLS-SPEC.md (company_insolvency, company_eu_funds, crz, ov) a IMPLEMENTATION-PLAN.md. Sprav Fázu 2d:
- src/utils/soap-client.ts — SOAP wrapper pre IS REPLIK
- src/adapters/replik.adapter.ts — getKonania(ico), getKonanieDetail(id), getOznamy(ico)
- src/adapters/datahub.adapter.ts — getCRZContract(id), getOVFiling(id, type). Rate limit 60/min!
- src/adapters/itms.adapter.ts — getSubjekt(id), best-effort findPrijimatel(ico)
- src/tools/company-insolvency.ts, crz-ov-tools.ts, company-eu-funds.ts
- Zaregistruj tools v server.ts
- Commitni
```

---

## Fáza 3: Orchestrácia + Full Profile

```
Prečítaj CLAUDE.md, TOOLS-SPEC.md (company_full_profile, company_compare) a IMPLEMENTATION-PLAN.md. Sprav Fázu 3:
- src/orchestrator/full-profile.ts — Promise.allSettled() pre všetky zdroje, zlúčenie do jedného profilu, _meta.zdrojeStatus, celkový timeout 15s
- src/tools/company-full-profile.ts
- src/tools/company-compare.ts — fetch people pre každú firmu, nájdi personálne prepojenia (rovnaké meno+priezvisko), porovnanie financií
- Over: company_full_profile pre 36421928 musí vrátiť dáta zo všetkých zdrojov
- Commitni
```

---

## Fáza 4: Deploy

```
Prečítaj CLAUDE.md a IMPLEMENTATION-PLAN.md. Sprav Fázu 4 — Deploy:
- Dockerfile — multi-stage build (node:20-slim, builder→runner)
- render.yaml — web service, envVars, healthCheckPath: /health
- GET /health endpoint — vráť status všetkých API zdrojov (quick ping each)
- Structured JSON logging v produkcii
- Over: docker build funguje lokálne
- Commitni
```

---

## Fáza 5: Integration testy

```
Prečítaj CLAUDE.md a IMPLEMENTATION-PLAN.md. Sprav Fázu 5 — testy:
- tests/adapters/ — test pre každý adapter (rpo, ruz, rpvs, finspr, vies, replik)
- tests/orchestrator/ — full-profile.test.ts, resolver.test.ts
- Každý test volá live API s IČO 36421928
- Assertuj response štruktúru (nie konkrétne hodnoty — tie sa menia)
- Timeout 15s per test
- Over: npm test prejde
- Commitni
```

---

## Fáza 6: Review + Polish

```
Prečítaj CLAUDE.md. Sprav code review celého projektu:
- Skontroluj TypeScript strict compliance
- Skontroluj error handling (žiadne throw v adapteroch, graceful degradation)
- Skontroluj konzistenciu response formátov (_meta vo všetkých tools)
- Skontroluj bezpečnosť (žiadne secret leaky, SSRF, injection)
- Oprav čo nájdeš
- Commitni a tagni v1.0.0
```

---

## Bonus: Hotfix / Debug prompty

### Keď API nefunguje:
```
API {nazov} vracia chybu: {error message}. Prečítaj CLAUDE.md sekciu "API Quirks"
a src/adapters/{nazov}.adapter.ts. Nájdi a oprav problém.
```

### Keď tool vracia zlý formát:
```
Tool {nazov} nevracia správny output. Prečítaj TOOLS-SPEC.md pre {nazov}
a porovnaj s aktuálnou implementáciou v src/tools/{nazov}.ts. Oprav.
```

### Keď chceš pridať nový zdroj:
```
Pridaj nový API zdroj: {nazov}, endpoint: {url}.
Použi /add-adapter pattern z AGENTS-AND-SKILLS.md:
1. src/types/{nazov}.types.ts
2. src/adapters/{nazov}.adapter.ts
3. src/tools/{nazov}-tool.ts
4. Zaregistruj v server.ts
5. Pridaj do full-profile orchestrátora
```
