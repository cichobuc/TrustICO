# TrustICO — MCP Tools Specification

Presná definícia každého MCP toolu. Toto je blueprint pre implementáciu.

---

## Konvencie

**Každý tool response obsahuje `_meta`:**
```typescript
{
  _meta: {
    source: string;        // "rpo" | "ruz" | "rpvs" | "finspr" | "replik" | "vies" | "itms" | "datahub"
    durationMs: number;    // čas odozvy v ms
    timestamp: string;     // ISO 8601
    cached?: boolean;      // true ak z cache (šablóny)
  }
}
```

**Pre multi-source tools (full_profile) obsahuje `_meta.zdrojeStatus`:**
```typescript
{
  _meta: {
    zdrojeStatus: {
      [source: string]: {
        status: "ok" | "error" | "not_found" | "timeout";
        durationMs: number;
        error?: string;
      }
    },
    totalDurationMs: number;
  }
}
```

---

## TIER 1 — Hlavné nástroje

### `company_search`

Inteligentný search — rozpozná IČO, názov aj DIČ a vráti zoznam zhôd.

**Input:**
```typescript
{
  query: string;  // IČO (8 číslic), názov firmy, alebo DIČ/IČ DPH
}
```

**Logika:**
1. Regex: `^\d{8}$` → IČO → RPO search `identifier={query}`
2. Regex: `^(SK)?\d{10}$` → DIČ → FinSpr search `ds_dphs` → extrahuj IČO
3. Inak → názov → RPO search `fullName={query}&onlyActive=true`

**Output:**
```json
{
  "results": [
    {
      "ico": "36421928",
      "nazov": "Websupport s. r. o.",
      "sidlo": "Karadžičova 7608/12, 821 08 Bratislava",
      "pravnaForma": "Spoločnosť s ručením obmedzeným",
      "datumVzniku": "2004-08-12",
      "aktivna": true,
      "rpoId": 1049550
    }
  ],
  "count": 1,
  "_meta": { "source": "rpo", "durationMs": 450 }
}
```

---

### `company_full_profile`

Mega-profil zo VŠETKÝCH zdrojov naraz (paralelné volanie).

**Input:**
```typescript
{
  ico: string;  // 8-miestne IČO
}
```

**Output:**
```json
{
  "zakladneUdaje": {
    "ico": "36421928",
    "dic": "2021869234",
    "icDph": "SK2021869234",
    "nazov": "Websupport s. r. o.",
    "sidlo": { "ulica": "Karadžičova 7608/12", "mesto": "Bratislava", "psc": "82108" },
    "pravnaForma": { "kod": "112", "nazov": "Spoločnosť s ručením obmedzeným" },
    "datumVzniku": "2004-08-12",
    "datumZaniku": null,
    "registrovySud": "Mestský súd Bratislava III",
    "spisovaZnacka": "Sro 25158/B",
    "predmetyPodnikania": ["Počítačové služby...", "Kúpa tovaru..."],
    "skNace": "63110"
  },

  "statutari": [
    {
      "meno": "Ján",
      "priezvisko": "Bednár",
      "funkcia": "konateľ",
      "od": "2019-01-01",
      "do": null,
      "adresa": "..."
    }
  ],

  "spolocnici": [
    {
      "nazov": "Loopia Group AB",
      "vklad": 5000,
      "splateny": 5000,
      "mena": "EUR",
      "od": "2019-01-01"
    }
  ],

  "sposobKonania": "Konateľ koná v mene spoločnosti samostatne.",

  "financie": {
    "poslednaZavierka": {
      "obdobie": "2024-01 — 2024-12",
      "typ": "Riadna",
      "datumPodania": "2025-06-30"
    },
    "klucoveUkazovatele": {
      "trzby": 15991975,
      "zisk": 1234567,
      "aktiva": 11060923,
      "vlastneImanie": 5000000,
      "zadlzenost": 0.55,
      "roa": 0.11
    },
    "pocetZavierok": 13,
    "idNajnovsejZavierky": 6514349
  },

  "dph": {
    "registrovany": true,
    "icDph": "SK2021869234",
    "paragraf": "4",
    "vymazany": false,
    "dovodyZrusenia": null
  },

  "danovaSpolahlivost": {
    "index": "vysoko spoľahlivý"
  },

  "danovyDlznik": false,

  "insolvencia": {
    "found": false,
    "konania": []
  },

  "kuv": {
    "found": false,
    "poznamka": "Firma nie je partnerom verejného sektora"
  },

  "eurofondy": {
    "found": false,
    "projekty": []
  },

  "dlhy": {
    "socpoist": false,
    "dovera": false,
    "union": false
  },

  "vies": {
    "valid": true,
    "nazov": "Websupport s. r. o.",
    "adresa": "Karadžičova 7608/12..."
  },

  "_meta": {
    "zdrojeStatus": {
      "rpo": { "status": "ok", "durationMs": 520 },
      "ruz": { "status": "ok", "durationMs": 1200 },
      "rpvs": { "status": "not_found", "durationMs": 340 },
      "finspr_dlznici": { "status": "ok", "durationMs": 280 },
      "finspr_dph": { "status": "ok", "durationMs": 310 },
      "finspr_index": { "status": "ok", "durationMs": 290 },
      "replik": { "status": "ok", "durationMs": 450 },
      "vies": { "status": "ok", "durationMs": 380 },
      "itms": { "status": "not_found", "durationMs": 600 }
    },
    "totalDurationMs": 1850,
    "timestamp": "2026-03-24T18:30:00Z"
  }
}
```

---

### `company_financials`

Účtovné závierky a kľúčové finančné dáta z RegisterUZ.

**Input:**
```typescript
{
  ico: string;     // 8-miestne IČO
  year?: number;   // Konkrétny rok (default: najnovšia)
}
```

**Output:**
```json
{
  "uctovnaJednotka": {
    "id": 96001,
    "ico": "36421928",
    "dic": "2021869234",
    "nazov": "Websupport s. r. o.",
    "pravnaForma": "112",
    "skNace": "63110",
    "velkost": "12"
  },
  "zavierky": [
    {
      "id": 6514349,
      "obdobieOd": "2024-01",
      "obdobieDo": "2024-12",
      "typ": "Riadna",
      "datumPodania": "2025-06-30",
      "datumZostavenia": "2025-06-27",
      "vykazy": [
        { "id": 9806005, "typ": "Správa audítora", "idSablony": null },
        { "id": 9734410, "typ": "Súvaha + VZaS", "idSablony": 700 }
      ],
      "prilohy": [
        { "id": 12002976, "nazov": "Správa audítora.PDF", "velkost": 1600649 },
        { "id": 11875443, "nazov": "Účtovná závierka PODindiv..PDF", "velkost": 881833 },
        { "id": 11875444, "nazov": "Poznámky.pdf", "velkost": 449961, "strany": 12 }
      ]
    }
  ],
  "klucoveUkazovatele": {
    "aktivaCelkom": 11060923,
    "neobeznyMajetok": 7250403,
    "obeznyMajetok": 2816579,
    "vlastneImanie": 4354348,
    "zavazky": null,
    "trzby": null,
    "vysledokHospodarenia": null
  },
  "_meta": { "source": "ruz", "durationMs": 1100 }
}
```

---

### `financial_report_detail`

Detailný účtovný výkaz — všetky riadky s pomenovaním podľa šablóny.

**Input:**
```typescript
{
  reportId: number;  // ID výkazu z company_financials
}
```

**Output:**
```json
{
  "reportId": 9734410,
  "idSablony": 700,
  "nazovSablony": "Súvaha + VZaS (podvojné účtovníctvo, veľká/stredná ÚJ)",
  "tabulky": [
    {
      "nazov": "Strana aktív",
      "stlpce": ["Brutto", "Korekcia", "Netto bežné", "Netto minulé"],
      "riadky": [
        { "cislo": 1, "nazov": "SPOLU MAJETOK", "hodnoty": [15991975, 4931052, 11060923, 10126601] },
        { "cislo": 2, "nazov": "Neobežný majetok", "hodnoty": [12181455, 4931052, 7250403, 6939598] },
        { "cislo": 3, "nazov": "Dlhodobý nehmotný majetok", "hodnoty": [343650, 277138, 66512, 87679] }
      ]
    },
    {
      "nazov": "Výkaz ziskov a strát",
      "stlpce": ["Bežné obdobie", "Predchádzajúce obdobie"],
      "riadky": [
        { "cislo": 1, "nazov": "Čistý obrat", "hodnoty": [12345678, 11234567] },
        { "cislo": 2, "nazov": "Tržby z predaja tovaru", "hodnoty": [...] }
      ]
    }
  ],
  "prilohy": [
    { "id": 11875444, "nazov": "Poznámky.pdf", "velkost": 449961 }
  ],
  "_meta": { "source": "ruz", "durationMs": 800, "cached": false }
}
```

---

### `financial_attachment`

Stiahne PDF prílohu (poznámky k závierke, skeny) z RegisterUZ.

**Input:**
```typescript
{
  attachmentId: number;  // ID prílohy z company_financials alebo financial_report_detail
}
```

**Output:**
```json
{
  "attachmentId": 11875444,
  "nazov": "Poznámky.pdf",
  "mimeType": "application/pdf",
  "velkost": 449961,
  "content": "<base64-encoded PDF>",
  "_meta": { "source": "ruz", "durationMs": 1500 }
}
```

**Poznámka:** Claude dokáže prečítať base64 PDF vrátane OCR skenov.

---

### `financial_report_pdf`

Generovaný PDF účtovného výkazu (vizualizácia štruktúrovaných dát).

**Input:**
```typescript
{
  reportId: number;  // ID výkazu
}
```

**Output:** Rovnaká štruktúra ako `financial_attachment` (base64 PDF).

---

## TIER 2 — Špecializované nástroje

### `company_people`

Všetky osoby vo firme — štatutári, spoločníci, vklady, spôsob konania.

**Input:** `{ ico: string }`

**Output:**
```json
{
  "ico": "36421928",
  "nazov": "Websupport s. r. o.",
  "statutari": [
    {
      "typ": "konateľ",
      "meno": "Ján", "priezvisko": "Bednár",
      "titulyPred": "Ing.", "titulyZa": null,
      "adresa": { "ulica": "...", "mesto": "...", "psc": "..." },
      "od": "2019-01-01", "do": null,
      "aktivny": true
    }
  ],
  "spolocnici": [
    {
      "nazov": "Loopia Group AB",
      "ico": null,
      "vklad": { "suma": 5000, "splateny": 5000, "mena": "EUR" },
      "podiel": "100%",
      "od": "2019-01-01", "do": null
    }
  ],
  "sposobKonania": "Konateľ koná v mene spoločnosti samostatne.",
  "zakladneImanie": { "suma": 5000, "mena": "EUR" },
  "_meta": { "source": "rpo", "durationMs": 600 }
}
```

---

### `company_history`

História zmien firmy — zmeny názvov, adries, štatutárov, spoločníkov.

**Input:** `{ ico: string }`

**Output:**
```json
{
  "ico": "36421928",
  "nazov": "Websupport s. r. o.",
  "zmenyNazvov": [
    { "nazov": "Websupport, s.r.o.", "od": "2004-08-12", "do": "2019-01-31" },
    { "nazov": "WebSupport s. r. o.", "od": "2019-02-01", "do": "2021-10-05" },
    { "nazov": "Websupport s. r. o.", "od": "2021-10-06", "do": null }
  ],
  "zmenyAdries": [
    { "adresa": "Kysucký Lieskovec 457", "od": "2004-08-12", "do": "2010-01-13" },
    { "adresa": "Staré Grunty 12, Bratislava", "od": "2010-01-14", "do": "2019-01-31" },
    { "adresa": "Karadžičova 7608/12, Bratislava", "od": "2019-02-01", "do": null }
  ],
  "zmenyStatutarov": [...],
  "zmenySpolocnikov": [...],
  "_meta": { "source": "rpo", "durationMs": 700 }
}
```

---

### `company_branches`

Prevádzkarne a organizačné zložky z RPO.

**Input:** `{ ico: string }`

**Output:**
```json
{
  "ico": "36421928",
  "prevadzkarne": [
    {
      "nazov": "Prevádzkareň Bratislava",
      "adresa": { "ulica": "...", "mesto": "Bratislava", "psc": "..." },
      "predmetPodnikania": ["Počítačové služby..."],
      "veduci": "Ján Novák",
      "od": "2015-01-01"
    }
  ],
  "pocet": 1,
  "_meta": { "source": "rpo", "durationMs": 500 }
}
```

---

### `company_kuv`

Koneční užívatelia výhod z RPVS.

**Input:** `{ ico: string }`

**Output:**
```json
{
  "ico": "36421928",
  "found": false,
  "poznamka": "Firma nie je registrovaná v RPVS (nie je partner verejného sektora)",
  "_meta": { "source": "rpvs", "durationMs": 340 }
}
```

**Ak found=true:**
```json
{
  "ico": "31322832",
  "found": true,
  "partner": {
    "id": 123,
    "obchodneMeno": "Slovenská pošta, a.s.",
    "datumRegistracie": "2017-02-01"
  },
  "konecniUzivatelia": [
    {
      "meno": "Ján", "priezvisko": "Novák",
      "datumNarodenia": "1975-01-15",
      "statnaPrislusnost": "Slovenská republika",
      "jeVerejnyCinitel": false,
      "od": "2017-02-01", "do": null
    }
  ],
  "opravneneOsoby": [
    {
      "meno": "JUDr. Peter Horváth",
      "ico": "12345678",
      "od": "2017-02-01"
    }
  ],
  "_meta": { "source": "rpvs", "durationMs": 450 }
}
```

---

### `company_insolvency`

Insolvenčné konania z IS REPLIK.

**Input:** `{ ico: string }`

**Output:**
```json
{
  "ico": "36421928",
  "found": false,
  "konania": [],
  "_meta": { "source": "replik", "durationMs": 400 }
}
```

**Ak found=true:**
```json
{
  "ico": "...",
  "found": true,
  "konania": [
    {
      "konanieId": "K-123/2024",
      "spisovaZnacka": "31K/5/2024",
      "sud": "Okresný súd Bratislava I",
      "druhKonania": "konkurz",
      "stavKonania": "prebiehajúce",
      "spravca": { "meno": "JUDr. Peter Správca", "znacka": "S-456" },
      "datumZaciatku": "2024-01-15",
      "datumUkoncenia": null
    }
  ],
  "_meta": { "source": "replik", "durationMs": 500 }
}
```

---

### `company_insolvency_notices`

Oznamy k insolvenčným konaniam z IS REPLIK.

**Input:** `{ ico: string }`

**Output:**
```json
{
  "ico": "...",
  "found": true,
  "oznamy": [
    {
      "oznamId": "O-789",
      "konanieId": "K-123/2024",
      "druhOznamu": "uznesenie",
      "datumZverejnenia": "2024-02-01",
      "text": "Uznesenie o vyhlásení konkurzu..."
    }
  ],
  "_meta": { "source": "replik", "durationMs": 450 }
}
```

---

### `company_tax_status`

Kompletný daňový status z Finančnej správy (3 endpointy v jednom).

**Input:** `{ ico: string }`

**Output:**
```json
{
  "ico": "36421928",
  "dph": {
    "registrovany": true,
    "icDph": "SK2021869234",
    "paragraf": "4",
    "datumRegistracie": "2005-01-01",
    "vymazany": false,
    "dovodyZrusenia": null
  },
  "indexSpolahlivosti": "vysoko spoľahlivý",
  "danovyDlznik": false,
  "_meta": {
    "source": "finspr",
    "durationMs": 650,
    "zdrojeStatus": {
      "dph_registracia": { "status": "ok", "durationMs": 210 },
      "dph_vymazani": { "status": "ok", "durationMs": 190 },
      "dph_zrusenie": { "status": "ok", "durationMs": 200 },
      "index_spolahlivosti": { "status": "ok", "durationMs": 220 },
      "danovi_dlznici": { "status": "ok", "durationMs": 180 }
    }
  }
}
```

---

### `company_eu_funds`

Eurofondy z ITMS2014+.

**Input:** `{ ico: string }`

**Output:**
```json
{
  "ico": "36421928",
  "found": false,
  "prijimatel": null,
  "projekty": [],
  "_meta": { "source": "itms", "durationMs": 800 }
}
```

**Ak found=true:**
```json
{
  "ico": "...",
  "found": true,
  "prijimatel": { "id": 12345, "nazov": "Firma s.r.o." },
  "projekty": [
    {
      "kod": "313011V336",
      "nazov": "Názov projektu...",
      "stav": "Zmluva uzavretá",
      "sumaZazmluvnena": 500000.00,
      "operacnyProgram": "Výskum a inovácie"
    }
  ],
  "celkovaSuma": 500000.00,
  "_meta": { "source": "itms", "durationMs": 1200 }
}
```

---

### `company_vat_check`

Overenie IČ DPH cez EU VIES.

**Input:**
```typescript
{
  vatNumber: string;  // "SK2021869234" alebo "2021869234" (auto-prefix SK)
}
```

**Output:**
```json
{
  "vatNumber": "SK2021869234",
  "valid": true,
  "nazov": "Websupport s. r. o.",
  "adresa": "Karadžičova 7608/12\n82108 Bratislava",
  "datumOverenia": "2026-03-24",
  "_meta": { "source": "vies", "durationMs": 380 }
}
```

---

### `company_debts`

Dlhy voči ZP a Sociálnej poisťovni.

**Input:** `{ ico: string }`

**Output:**
```json
{
  "ico": "36421928",
  "socpoist": { "found": false, "dlznik": false },
  "dovera": { "found": false, "dlznik": false },
  "union": { "found": false, "dlznik": false },
  "_meta": { "source": "zp+socpoist", "durationMs": 900 }
}
```

---

### `company_compare`

Porovnanie 2–10 firiem + personálne prepojenia.

**Input:**
```typescript
{
  icos: string[];  // 2–10 IČO
}
```

**Output:**
```json
{
  "firmy": [
    {
      "ico": "36421928",
      "nazov": "Websupport s. r. o.",
      "trzby": 15991975,
      "zisk": 1234567,
      "aktivna": true,
      "pocetZamestnancov": null
    },
    {
      "ico": "35757442",
      "nazov": "ESET, spol. s r.o.",
      "trzby": 98765432,
      "zisk": 12345678,
      "aktivna": true,
      "pocetZamestnancov": null
    }
  ],
  "personalnePrepoojenia": [
    {
      "osoba": "Ing. Peter Novák",
      "firmy": [
        { "ico": "36421928", "funkcia": "konateľ", "od": "2020-01-01" },
        { "ico": "35757442", "funkcia": "člen dozornej rady", "od": "2018-06-01" }
      ]
    }
  ],
  "pocetPrepojeni": 1,
  "_meta": { "source": "rpo+ruz", "durationMs": 2500 }
}
```

---

## TIER 3 — Doplnkové

### `crz_contracts`

Zmluvy z Centrálneho registra zmlúv (DataHub CRZ).

**Input:** `{ contractId: number }`

**Output:**
```json
{
  "id": 12345,
  "cisloZmluvy": "123/2024",
  "predmet": "Dodávka IT služieb",
  "suma": 50000.00,
  "datumZverejnenia": "2024-03-01",
  "datumUcinnosti": "2024-03-15",
  "strany": [
    { "nazov": "Ministerstvo financií SR", "ico": "00166197" },
    { "nazov": "Websupport s. r. o.", "ico": "36421928" }
  ],
  "_meta": { "source": "datahub-crz", "durationMs": 400 }
}
```

### `ov_filing`

Podanie z Obchodného vestníka (DataHub OV).

**Input:** `{ id: number, type: "or_podanie" | "konkurz" | "likvidacia" }`

**Output:**
```json
{
  "id": 67890,
  "typ": "or_podanie",
  "cisloVestnika": "45/2024",
  "datumZverejnenia": "2024-03-01",
  "firma": { "nazov": "...", "ico": "..." },
  "obsah": "Text podania...",
  "_meta": { "source": "datahub-ov", "durationMs": 350 }
}
```

### `insolvency_detail`

Detail insolvenčného konania z IS REPLIK podľa ID.

**Input:** `{ konanieId: string }`

**Output:**
```json
{
  "konanieId": "K-123/2024",
  "spisovaZnacka": "31K/5/2024",
  "sud": "Okresný súd Bratislava I",
  "druhKonania": "konkurz",
  "stavKonania": "prebiehajúce",
  "dlznik": { "nazov": "Firma s.r.o.", "ico": "...", "sidlo": "..." },
  "spravca": { "meno": "JUDr. Peter Správca", "znacka": "S-456", "adresa": "..." },
  "datumZaciatku": "2024-01-15",
  "datumUkoncenia": null,
  "udalosti": [
    { "datum": "2024-01-15", "typ": "Podanie návrhu", "popis": "..." },
    { "datum": "2024-02-01", "typ": "Vyhlásenie konkurzu", "popis": "..." }
  ],
  "_meta": { "source": "replik", "durationMs": 500 }
}
```
