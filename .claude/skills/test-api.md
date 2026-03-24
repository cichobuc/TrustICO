---
name: test-api
description: Test a specific API adapter with a known IČO (36421928 - Websupport s.r.o.)
arguments:
  - name: adapter
    description: "Adapter name (rpo, ruz, rpvs, finspr, replik, vies, itms, all)"
    required: true
---

Otestuj API adapter "{{adapter}}" s testovacím IČO 36421928 (Websupport s.r.o.).

## Kroky

1. **Nájdi adapter súbor:** Hľadaj `src/adapters/{{adapter}}.adapter.ts`
2. **Prečítaj adapter kód** a identifikuj hlavné metódy
3. **Spusti test:** Ak existuje `tests/adapters/{{adapter}}.test.ts`, spusti `npx vitest run tests/adapters/{{adapter}}.test.ts`
4. **Ak test neexistuje:** Vytvor rýchly inline test:
   ```bash
   npx tsx -e "
     import { {{AdapterClass}} } from './src/adapters/{{adapter}}.adapter.js';
     import { HttpClient } from './src/utils/http-client.js';
     const client = new HttpClient();
     const adapter = new {{AdapterClass}}(client);
     const start = Date.now();
     const result = await adapter.search('36421928');
     console.log(JSON.stringify({
       status: result.found ? 'OK' : 'FAIL',
       durationMs: Date.now() - start,
       error: result.error || null,
       preview: JSON.stringify(result.data).slice(0, 200)
     }, null, 2));
   "
   ```
5. **Ak adapter={{all}}:** Iteruj cez všetky adaptery v `src/adapters/` a otestuj každý

## Výstupný formát

```
┌──────────┬────────┬───────────┬─────────────────────────┐
│ Adapter  │ Status │ Čas (ms)  │ Poznámka                │
├──────────┼────────┼───────────┼─────────────────────────┤
│ rpo      │ ✅ OK  │ 342       │ Found: Websupport s.r.o.│
│ ruz      │ ✅ OK  │ 1203      │ 5 závierok              │
│ rpvs     │ ⚠️ EMPTY│ 156      │ Nie je partner VS       │
└──────────┴────────┴───────────┴─────────────────────────┘
```

## Testovacie IČO referencia

| IČO | Firma | Účel |
|-----|-------|------|
| `36421928` | Websupport s.r.o. | Happy path (default) |
| `35757442` | ESET, spol. s r.o. | Veľká firma |
| `00000001` | Neexistuje | Not found handling |
| `31322832` | Slovenská pošta | Štátny podnik |
