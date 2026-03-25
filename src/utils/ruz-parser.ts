/**
 * RUZ Parser — maps template + raw report data → named rows with columns.
 *
 * Actual RegisterUZ data format:
 * - Report data: `obsah.tabulky[].data` — FLAT string array (chunks of N values per row)
 * - Template: `tabulky[].hlavicka` — header cells with row/column positions
 * - Template: `tabulky[].riadky` — row definitions with `text.sk` and `cisloRiadku`
 *
 * The parser:
 * 1. Extracts column names from template hlavicka (data columns only)
 * 2. Matches template tables to report tables by index
 * 3. Splits flat data array into chunks of numColumns values per row
 * 4. Maps each chunk to a named row using template riadky
 */

import type {
  RuzReportRaw,
  RuzTemplateRaw,
  RuzTemplateTableRaw,
  RuzReportTableRaw,
  ParsedTable,
  ParsedRow,
  KlucoveUkazovatele,
} from "../types/ruz.types.js";

/**
 * Parse a raw report using its template → named tables with named rows.
 */
export function parseReport(
  report: RuzReportRaw,
  template: RuzTemplateRaw,
): ParsedTable[] {
  const rawTables = report.obsah?.tabulky ?? [];
  const templateTables = template.tabulky ?? [];
  const tables: ParsedTable[] = [];

  // Match tables by index (both arrays follow the same order)
  const maxTables = Math.min(rawTables.length, templateTables.length);

  for (let i = 0; i < maxTables; i++) {
    const rawTable = rawTables[i];
    const tmplTable = templateTables[i];

    if (!rawTable.data || rawTable.data.length === 0) continue;

    const parsed = parseTable(rawTable, tmplTable);
    if (parsed) tables.push(parsed);
  }

  return tables;
}

/**
 * Parse a single table: flat data array + template → named rows.
 */
function parseTable(
  rawTable: RuzReportTableRaw,
  tmplTable: RuzTemplateTableRaw,
): ParsedTable | null {
  const tableName = rawTable.nazov?.sk ?? "Tabuľka";
  const columns = extractDataColumnNames(tmplTable);
  const numColumns = columns.length;

  if (numColumns === 0) return null;

  // Template rows define the order — Nth data chunk = Nth template row
  const templateRows = tmplTable.riadky ?? [];

  // Split flat data array into chunks of numColumns per row
  const riadky: ParsedRow[] = [];
  const data = rawTable.data;
  const numDataRows = Math.floor(data.length / numColumns);

  for (let rowIndex = 0; rowIndex < numDataRows; rowIndex++) {
    const offset = rowIndex * numColumns;
    const templateRow = templateRows[rowIndex];
    const cislo = templateRow?.cisloRiadku ?? (rowIndex + 1);
    const nazov = templateRow?.text?.sk ?? `Riadok ${cislo}`;

    const hodnoty: (number | null)[] = [];
    for (let col = 0; col < numColumns; col++) {
      const raw = data[offset + col];
      if (raw === undefined || raw === null || raw === "") {
        hodnoty.push(null);
      } else {
        const num = Number(raw);
        hodnoty.push(Number.isNaN(num) ? null : num);
      }
    }

    riadky.push({ cislo, nazov, hodnoty });
  }

  return { nazov: tableName, stlpce: columns, riadky };
}

/**
 * Extract data column names from template hlavicka.
 *
 * Template hlavicka has multiple header rows:
 * - Aktíva: Row 2 has descriptive names (Brutto, Korekcia, Netto 2, Netto 3)
 * - Pasíva: Row 2 has numeric refs ("4","5"), Row 1 has descriptive names
 * - VZaS: Row 3 has numeric refs ("1","2"), Row 2 has descriptive names
 *
 * Strategy: get data column positions from the last row, then find
 * descriptive names by walking up the header rows.
 */
function extractDataColumnNames(tmplTable: RuzTemplateTableRaw): string[] {
  const headers = tmplTable.hlavicka ?? [];
  if (headers.length === 0) return [];

  const metaLabels = new Set(["a", "b", "c"]);

  // Get all unique row numbers sorted
  const rowNums = [...new Set(headers.map((h) => h.riadok))].sort((a, b) => a - b);

  // Start from the last row and find data columns
  const lastRow = rowNums[rowNums.length - 1];
  const lastRowCells = headers
    .filter((h) => h.riadok === lastRow)
    .sort((a, b) => a.stlpec - b.stlpec);

  const dataPositions = lastRowCells
    .filter((h) => !metaLabels.has(h.text?.sk?.toLowerCase() ?? ""))
    .map((h) => h.stlpec);

  if (dataPositions.length === 0) return [];

  // Check if last row has only numeric/short labels (reference numbers)
  const lastRowDataCells = lastRowCells.filter(
    (h) => !metaLabels.has(h.text?.sk?.toLowerCase() ?? ""),
  );
  const allNumeric = lastRowDataCells.every((h) => /^\d+$/.test(h.text?.sk ?? ""));

  if (allNumeric && rowNums.length > 1) {
    // Walk up to find descriptive names for these column positions
    for (let ri = rowNums.length - 2; ri >= 0; ri--) {
      const rowCells = headers
        .filter((h) => h.riadok === rowNums[ri])
        .sort((a, b) => a.stlpec - b.stlpec);

      // Find cells that overlap with our data column positions
      // (headers can span multiple columns via sirkaStlpca)
      const names: string[] = [];
      for (const pos of dataPositions) {
        const match = rowCells.find(
          (h) => pos >= h.stlpec && pos < h.stlpec + h.sirkaStlpca,
        );
        if (match && !metaLabels.has(match.text?.sk?.toLowerCase() ?? "")) {
          names.push(match.text?.sk ?? `Stĺpec ${pos}`);
        } else {
          names.push(`Stĺpec ${pos}`);
        }
      }

      // If we found at least some non-generic names, use them
      if (names.some((n) => !n.startsWith("Stĺpec"))) {
        return names;
      }
    }
  }

  // Use names from the last row directly
  return lastRowDataCells.map((h) => h.text?.sk ?? `Stĺpec ${h.stlpec}`);
}

/**
 * Extract key financial indicators from parsed tables.
 *
 * Standard row numbers for "Úč POD" (Súvaha, podvojné účtovníctvo):
 * - Row 1: SPOLU MAJETOK (total assets)
 * - Row 2: Neobežný majetok (non-current assets)
 * - Row 33: Obežný majetok (current assets)
 *
 * For "Strana pasív":
 * - Row 80 area: Vlastné imanie (equity)
 * - Row 101 area: Záväzky (liabilities)
 *
 * For "Výkaz ziskov a strát":
 * - Row 1: Čistý obrat (net turnover)
 * - Last rows: Výsledok hospodárenia (profit/loss)
 */
export function extractKlucoveUkazovatele(
  tables: ParsedTable[],
): KlucoveUkazovatele {
  const result: KlucoveUkazovatele = {
    aktivaCelkom: null,
    neobeznyMajetok: null,
    obeznyMajetok: null,
    vlastneImanie: null,
    zavazky: null,
    kratkodobeZavazky: null,
    trzby: null,
    vysledokHospodarenia: null,
    zadlzenost: null,
    roa: null,
    roe: null,
    currentRatio: null,
  };

  for (const table of tables) {
    const tableName = table.nazov.toLowerCase();

    // Balance sheet — Assets (Strana aktív)
    if (tableName.includes("aktív") || tableName.includes("assets")) {
      const nettoIdx = findNettoColumnIndex(table);

      for (const row of table.riadky) {
        const name = row.nazov.toLowerCase();
        const value = row.hodnoty[nettoIdx] ?? null;

        if (name.includes("spolu majetok") || name.includes("total assets")) {
          result.aktivaCelkom = value;
        } else if (
          (name.includes("neobežný majetok") || name.includes("non-current assets")) &&
          !result.neobeznyMajetok
        ) {
          result.neobeznyMajetok = value;
        } else if (
          (name.includes("obežný majetok") || name.includes("current assets")) &&
          !name.includes("neobežný") &&
          !name.includes("non-current") &&
          !result.obeznyMajetok
        ) {
          result.obeznyMajetok = value;
        }
      }
    }

    // Balance sheet — Liabilities & Equity (Strana pasív)
    if (tableName.includes("pasív") || tableName.includes("liabilities")) {
      // Pasíva typically has 2 columns: bežné, minulé — find current period column
      const idx = findCurrentPeriodColumnIndex(table);

      for (const row of table.riadky) {
        const name = row.nazov.toLowerCase();
        const value = row.hodnoty[idx] ?? null;

        if (
          (name.includes("vlastné imanie") || name.includes("equity")) &&
          !name.includes("zmena") &&
          !name.includes("spolu vlastné imanie a záväzky") &&
          !result.vlastneImanie
        ) {
          result.vlastneImanie = value;
        } else if (
          (name.includes("záväzky") || name.includes("liabilities")) &&
          !name.includes("krátkodob") && !name.includes("dlhodob") &&
          !name.includes("short") && !name.includes("long") &&
          !name.includes("spolu") &&
          !result.zavazky
        ) {
          result.zavazky = value;
        }

        // Extract krátkodobé záväzky for Current Ratio
        if (
          (name.includes("krátkodobé záväzky") || name.includes("short-term liabilities") ||
           name.includes("current liabilities")) &&
          !result.kratkodobeZavazky
        ) {
          result.kratkodobeZavazky = value;
        }
      }
    }

    // P&L (Výkaz ziskov a strát / Income statement)
    if (
      tableName.includes("zisk") || tableName.includes("strát") ||
      tableName.includes("income") || tableName.includes("statement")
    ) {
      const plIdx = findCurrentPeriodColumnIndex(table);
      for (const row of table.riadky) {
        const name = row.nazov.toLowerCase();
        const value = row.hodnoty[plIdx] ?? null;

        if (
          (name.includes("čistý obrat") || name.includes("net turnover") ||
           name.includes("tržby z predaja výrobkov") || name.includes("tržby z predaja tovar")) &&
          !result.trzby
        ) {
          result.trzby = value;
        }

        if (
          name.includes("výsledok hospodárenia za účtovné obdobie") ||
          name.includes("profit/loss for the accounting period") ||
          name.includes("výsledok hospodárenia po zdanení")
        ) {
          result.vysledokHospodarenia = value;
        }
      }
    }
  }

  // Calculate financial ratios
  result.zadlzenost = safeDiv(result.zavazky, result.aktivaCelkom);
  result.roa = safeDiv(result.vysledokHospodarenia, result.aktivaCelkom);
  result.roe = safeDiv(result.vysledokHospodarenia, result.vlastneImanie);
  result.currentRatio = safeDiv(result.obeznyMajetok, result.kratkodobeZavazky);

  return result;
}

/** Safe division — returns null if divisor is 0 or either operand is null. Rounds to 4 decimals. */
function safeDiv(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || numerator === undefined || denominator === null || denominator === undefined || denominator === 0) return null;
  return Math.round((numerator / denominator) * 10000) / 10000;
}

/**
 * Find the column index for current period in 2-column tables (pasíva, VZaS).
 * Looks for "bežné" in column names; defaults to 0.
 */
function findCurrentPeriodColumnIndex(table: ParsedTable): number {
  for (let i = 0; i < table.stlpce.length; i++) {
    const col = table.stlpce[i].toLowerCase();
    if (col.includes("bežn") || col.includes("current")) return i;
  }
  return 0;
}

/**
 * Find the column index for "netto bežné" values.
 * For 4-column balance sheets (Brutto, Korekcia, Netto2, Netto3) → index 2
 * For 2-column tables → index 0
 */
function findNettoColumnIndex(table: ParsedTable): number {
  for (let i = 0; i < table.stlpce.length; i++) {
    const col = table.stlpce[i].toLowerCase();
    if (col.includes("netto 2") || (col.includes("netto") && col.includes("bežn"))) return i;
  }

  if (table.stlpce.length === 4) return 2;
  if (table.stlpce.length === 2) return 0;
  return 0;
}
