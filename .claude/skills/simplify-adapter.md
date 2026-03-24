---
name: simplify-adapter
description: Review an adapter for unnecessary complexity and suggest simplifications
arguments:
  - name: name
    description: "Adapter name in kebab-case (e.g., rpo, ruz, rpvs, finspr)"
    required: true
---

Preskúmaj adapter "{{name}}" a identifikuj zbytočnú komplexitu.

## Kroky

### 1. Prečítaj adapter kód

- `src/adapters/{{name}}.adapter.ts`
- `src/types/{{name}}.types.ts`
- Súvisiace utility (ak existujú)

### 2. Skontroluj tieto anti-patterny

**Over-abstraction:**
- Zbytočné wrapper triedy pre jednoduché operácie
- Abstract base class ak existuje len jedna implementácia
- Factory pattern kde stačí priame volanie
- Generický builder kde stačí jednoduchý objekt

**Zbytočná komplexita:**
- Try/catch bloky okolo kódu, ktorý nemôže hodiť výnimku
- Validácia dát, ktoré sú už validované na vyššej úrovni
- Duplicitné type assertions
- Defensive coding proti nemožným stavom

**Nepoužitý kód:**
- Metódy, ktoré nikto nevolá
- Exportované typy, ktoré nikto neimportuje
- Zakomentovaný kód
- TODO komentáre pre features, ktoré nie sú v scope

**Performance:**
- Sekvenčné `await` kde by mohol byť `Promise.all`
- Zbytočné serializácie (JSON.stringify → JSON.parse)
- Opakované volanie rovnakej funkcie s rovnakými parametrami

### 3. Navrhni zjednodušenia

Pre každý nájdený problém:

```
[PROBLÉM] Popis problému
  Súbor: src/adapters/{{name}}.adapter.ts:42
  Teraz: <aktuálny kód>
  Lepšie: <zjednodušený kód>
  Prečo: <vysvetlenie>
```

### 4. Ak používateľ súhlasí, aplikuj zmeny

- Urob zmeny inkrementálne (jedna za druhou)
- Po každej zmene over, že `npm run typecheck` prechádza
- Nepremenúvavaj verejné API metódy bez súhlasu

## Pravidlá

- **Tri rovnaké riadky sú lepšie ako predčasná abstrakcia**
- Nenavrhuj zmeny, ktoré len presúvajú komplexitu inam
- Zachovaj graceful degradation pattern (nikdy throw v adapteroch)
- Zachovaj `AdapterResult<T>` return type
- Nezmeň verejné API bez výslovného súhlasu
