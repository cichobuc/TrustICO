# TrustICO — Implementačný plán

## Workflow pravidlá

### Kedy `/clear`
- **Pred každou novou fázou** (CLAUDE.md sa automaticky načíta)
- **Keď kontext začne byť príliš dlhý** (veľa tool outputov)
- **VŽDY commitni pred /clear!**

### Kedy commitovať
- Po dokončení každého adaptéra (`feat: add rpo adapter`)
- Po dokončení každého toolu (`feat: add company_search tool`)
- Po dokončení celej fázy (`feat: complete phase 2`)
- **Pred každým /clear**
- Pred zmenou prístupu / refaktorom

### Commit message konvencia
```
feat: add RPO adapter with search and entity detail
fix: handle broken UTF-8 encoding in RPO responses
refactor: extract HTTP client retry logic
test: add integration tests for RegisterUZ pipeline
chore: configure Dockerfile and render.yaml
```

### Kedy `/loop`
- Až po deployi: `/loop 10m /check-health` — monitoring API zdrojov
- Pri dlhých testoch: `/loop 2m npm test` — sledovanie CI

---

## Fáza 0: Project Init
> Session 1 | Pred /clear: commitni

- [ ] `npm init` + `package.json` (name: trustico-mcp, type: module)
- [ ] Nainštalovať dependencies:
  ```
  @modelcontextprotocol/sdk
  dotenv
  soap
  ```
- [ ] Nainštalovať dev dependencies:
  ```
  typescript
  @types/node
  tsx
  vitest
  eslint
  ```
- [ ] `tsconfig.json` (strict, ES2022, NodeNext)
- [ ] `src/index.ts` — placeholder HTTP server
- [ ] `src/server.ts` — placeholder MCP server
- [ ] Overiť: `npm run build` funguje, `npm run dev` štartuje
- [ ] **COMMIT:** `chore: initialize project with TypeScript and MCP SDK`

---

## Fáza 1: Core Infrastructure
> Session 2 | /clear pred štartom

- [ ] `src/utils/http-client.ts` — fetch wrapper
  - retry (max 1, exponential backoff)
  - timeout (configurable, default 8s)
  - rate limiting (per-source token bucket)
  - response logging (debug level)
- [ ] `src/utils/validators.ts` — IČO, DIČ, IČ DPH validácia + normalizácia
- [ ] `src/utils/encoding.ts` — UTF-8 fix pre RPO
- [ ] `src/utils/cache.ts` — in-memory LRU (pre šablóny)
- [ ] `src/types/common.types.ts` — AdapterResult<T>, MetaInfo, atď.
- [ ] Auth middleware — Bearer token check (`MCP_API_KEY`)
- [ ] **COMMIT:** `feat: add core infrastructure — HTTP client, validators, cache, auth`

---

## Fáza 2a: RPO Adapter + Resolver
> Session 3 | /clear pred štartom

- [ ] `src/types/rpo.types.ts`
- [ ] `src/adapters/rpo.adapter.ts`
  - `search(identifier)` → RPO search
  - `searchByName(fullName)` → RPO search by name
  - `getEntity(rpoId)` → entity detail
  - encoding fix integrovaný
- [ ] `src/orchestrator/resolver.ts` — IČO resolver
  - input: IČO → priamy RPO search
  - input: názov → RPO fullName search → disambiguation
  - input: DIČ → FinSpr ds_dphs search → IČO
- [ ] `src/tools/company-search.ts` — MCP tool handler
- [ ] `src/tools/company-people.ts`
- [ ] `src/tools/company-history.ts`
- [ ] `src/tools/company-branches.ts`
- [ ] Otestovať s IČO `36421928` (Websupport)
- [ ] **COMMIT:** `feat: add RPO adapter, IČO resolver, and company tools`

---

## Fáza 2b: RegisterUZ Adapter (NAJKRITICKEJŠÍ)
> Session 4 | /clear pred štartom

- [ ] `src/types/ruz.types.ts`
- [ ] `src/adapters/ruz.adapter.ts`
  - `findEntity(ico)` → uctovne-jednotky search
  - `getEntity(id)` → uctovna-jednotka detail
  - `getStatement(id)` → uctovna-zavierka detail
  - `getReport(id)` → uctovny-vykaz detail (s tabulkami)
  - `getTemplate(id)` → sablona (cached!)
  - `getAttachment(id)` → binary PDF → base64
  - `getReportPdf(id)` → generated PDF → base64
- [ ] `src/utils/ruz-parser.ts`
  - mapovanie šablóna + data → pomenované riadky
  - kľúčové ukazovatele (aktíva, tržby, zisk, VH)
- [ ] `src/orchestrator/ruz-pipeline.ts`
  - IČO → entity → najnovšia závierka → výkazy → parsed data
  - error handling na každom kroku
- [ ] `src/tools/company-financials.ts`
- [ ] `src/tools/financial-report.ts`
- [ ] `src/tools/financial-attachment.ts`
- [ ] Otestovať celý pipeline s `36421928`
- [ ] **COMMIT:** `feat: add RegisterUZ adapter with full financial pipeline`

---

## Fáza 2c: Sekundárne adaptery
> Session 5 | /clear pred štartom

- [ ] `src/types/rpvs.types.ts` + `src/adapters/rpvs.adapter.ts`
  - OData query builder
  - `getKUV(ico)` → PartneriVerejnehoSektora + expand KÚV
- [ ] `src/types/finspr.types.ts` + `src/adapters/finspr.adapter.ts`
  - `searchList(slug, column, value)` — generický search
  - `getDlznici(ico)`, `getDPH(ico)`, `getIndex(ico)`, `getDPHVymazani(ico)`, `getDPHZrusenie(ico)`
- [ ] `src/adapters/vies.adapter.ts`
  - REST POST `/check-vat-number`
  - auto-prefix "SK" ak chýba
- [ ] `src/tools/company-kuv.ts`
- [ ] `src/tools/company-tax-status.ts`
- [ ] `src/tools/company-vat-check.ts`
- [ ] Otestovať každý adapter
- [ ] **COMMIT:** `feat: add RPVS, FinSpr, and VIES adapters`

---

## Fáza 2d: SOAP + DataHub adaptery
> Session 6 | /clear pred štartom

- [ ] `src/utils/soap-client.ts` — SOAP wrapper
- [ ] `src/types/replik.types.ts` + `src/adapters/replik.adapter.ts`
  - `getKonania(ico)` — vyhladajKonania
  - `getKonanieDetail(konanieId)` — getKonanieDetail
  - `getOznamy(ico)` — vyhladajOznamy
- [ ] `src/adapters/datahub.adapter.ts`
  - `getCRZContract(id)`
  - `getOVFiling(id, type)`
- [ ] `src/adapters/itms.adapter.ts` (best-effort)
  - `getSubjekt(id)` — detail
  - `findPrijimatel(ico)` — iterácia projektov
- [ ] `src/tools/company-insolvency.ts`
- [ ] `src/tools/crz-ov-tools.ts`
- [ ] `src/tools/company-eu-funds.ts`
- [ ] **COMMIT:** `feat: add REPLIK SOAP, DataHub, and ITMS adapters`

---

## Fáza 3: Orchestrácia + Mega profil
> Session 7 | /clear pred štartom

- [ ] `src/orchestrator/full-profile.ts`
  - Promise.allSettled() pre všetky zdroje
  - Zlúčenie výsledkov do jedného profilu
  - `_meta.zdrojeStatus` pre každý zdroj
  - Celkový timeout 15s
- [ ] `src/tools/company-full-profile.ts`
- [ ] `src/tools/company-compare.ts`
  - Fetch people pre každú firmu
  - Nájdi personálne prepojenia (rovnaké meno+priezvisko vo viacerých)
  - Porovnanie financií
- [ ] Registrácia VŠETKÝCH tools v `server.ts`
- [ ] E2E test: `company_full_profile` pre `36421928`
- [ ] **COMMIT:** `feat: add full profile orchestrator and company compare`

---

## Fáza 4: Deploy
> Session 8 | /clear pred štartom

- [ ] `Dockerfile` (multi-stage build)
  ```dockerfile
  FROM node:20-slim AS builder
  WORKDIR /app
  COPY package*.json ./
  RUN npm ci
  COPY . .
  RUN npm run build

  FROM node:20-slim
  WORKDIR /app
  COPY --from=builder /app/dist ./dist
  COPY --from=builder /app/node_modules ./node_modules
  COPY --from=builder /app/package.json .
  EXPOSE 3000
  CMD ["node", "dist/index.js"]
  ```
- [ ] `render.yaml`
- [ ] Health check endpoint (`GET /health` → 200 + zdroje status)
- [ ] Logging (structured JSON v produkcii)
- [ ] Test Docker build lokálne
- [ ] **COMMIT:** `chore: add Dockerfile and Render deployment config`
- [ ] Push na GitHub
- [ ] Deploy na Render
- [ ] Overiť: MCP endpoint odpovedá

---

## Fáza 5: Integration testy
> Session 9 | /clear pred štartom

- [ ] `tests/adapters/rpo.test.ts`
- [ ] `tests/adapters/ruz.test.ts`
- [ ] `tests/adapters/rpvs.test.ts`
- [ ] `tests/adapters/finspr.test.ts`
- [ ] `tests/adapters/vies.test.ts`
- [ ] `tests/adapters/replik.test.ts`
- [ ] `tests/orchestrator/full-profile.test.ts`
- [ ] `tests/orchestrator/resolver.test.ts`
- [ ] **COMMIT:** `test: add integration tests for all adapters`

---

## Fáza 6: Polish + Review
> Session 10 | /clear pred štartom

- [ ] Code review (agent: code-reviewer)
- [ ] Opraviť nájdené issues
- [ ] README.md (ak treba)
- [ ] Final E2E test na produkčnom Render URL
- [ ] **COMMIT:** `fix: address code review findings`
- [ ] **TAG:** `v1.0.0`

---

## Quick Reference

| Akcia | Príkaz |
|-------|--------|
| Nová session | `/clear` |
| Otestovať API | `curl http://localhost:3000/health` |
| Build | `npm run build` |
| Dev server | `npm run dev` |
| Testy | `npm test` |
| Commit | `git add -A && git commit -m "..."` |
| Deploy | `git push` (Render auto-deploy) |
