/**
 * Types for RegisterUZ API (registeruz.sk/cruz-public/api).
 *
 * Verified against live API responses (2026-03-24).
 *
 * Workflow: search → entity → statement → report → template → parsed data
 * Quirk: `zmenene-od` parameter is MANDATORY on search endpoints.
 */

// --- Raw API Response Types ---

/** Search response from /api/uctovne-jednotky — returns only IDs. */
export interface RuzSearchResponse {
  id: number[];
  existujeDalsieId: boolean;
}

/** Entity detail from /api/uctovna-jednotka. */
export interface RuzEntityRaw {
  id: number;
  ico: string;
  dic: string | null;
  nazovUJ: string;
  pravnaForma: string | null;
  skNace: string | null;
  velkostOrganizacie: string | null;
  datumZalozenia: string | null;
  datumPoslednejUpravy: string | null;
  konsolidovana: boolean;
  idUctovnychZavierok: number[];
  idVyrocnychSprav: number[];
  psc: string | null;
  mesto: string | null;
  ulica: string | null;
  zdrojDat: string | null;
  kraj: string | null;
  okres: string | null;
  druhVlastnictva: string | null;
  sidlo: string | null;
}

/** Statement from /api/uctovna-zavierka. */
export interface RuzStatementRaw {
  id: number;
  idUJ: number;
  idUctovnychVykazov: number[];
  typ: string | null;
  obdobieOd: string | null;
  obdobieDo: string | null;
  datumPodania: string | null;
  datumZostavenia: string | null;
  datumZostaveniaK: string | null;
  datumPoslednejUpravy: string | null;
  datumPrilozeniaSpravyAuditora: string | null;
  zdrojDat: string | null;
}

/** Report from /api/uctovny-vykaz. */
export interface RuzReportRaw {
  id: number;
  idUctovnejZavierky: number;
  idSablony: number | null;
  obsah: RuzReportContent;
  prilohy: RuzAttachmentRaw[];
  pristupnostDat: string | null;
  kodDanovehoUradu: string | null;
  zdrojDat: string | null;
  datumPoslednejUpravy: string | null;
}

/** Report content — contains tables and cover page. */
export interface RuzReportContent {
  tabulky?: RuzReportTableRaw[];
  titulnaStrana?: RuzTitulnaStrana;
}

/** Raw table in report — data is a FLAT STRING ARRAY (chunks of numColumns values per row). */
export interface RuzReportTableRaw {
  nazov: { sk: string; en?: string };
  data: string[];
}

/** Cover page info from report. */
export interface RuzTitulnaStrana {
  nazovUctovnejJednotky?: string;
  ico?: string;
  dic?: string;
  typUctovnejJednotky?: string;
  skNace?: string;
  typZavierky?: string;
  obdobieOd?: string;
  obdobieDo?: string;
  predchadzajuceObdobieOd?: string;
  predchadzajuceObdobieDo?: string;
  datumZostavenia?: string;
  oznacenieObchodnehoRegistra?: string;
  adresa?: {
    ulica?: string;
    cislo?: string;
    psc?: string;
    mesto?: string;
  };
}

/** Attachment on a report. */
export interface RuzAttachmentRaw {
  id: number;
  meno: string | null;
  velkostPrilohy: number | null;
  pocetStran: number | null;
  jazyk: string | null;
  mimeType: string | null;
  digest: string | null;
}

/** Template from /api/sablona. */
export interface RuzTemplateRaw {
  id: number;
  nazov: string | null;
  nariadenieMF: string | null;
  platneOd: string | null;
  tabulky: RuzTemplateTableRaw[];
}

/** Template table — has header definitions and row definitions. */
export interface RuzTemplateTableRaw {
  hlavicka: RuzTemplateHeaderCell[];
  riadky: RuzTemplateRowRaw[];
}

/** Header cell in template — defines column structure. */
export interface RuzTemplateHeaderCell {
  text: { sk: string; en?: string };
  riadok: number;
  stlpec: number;
  sirkaStlpca: number;
  vyskaRiadku: number;
}

/** Row definition in template. */
export interface RuzTemplateRowRaw {
  text: { sk: string; en?: string };
  cisloRiadku: number;
  oznacenie?: string;
}

// --- Mapped Output Types (for MCP tools) ---

/** Accounting entity info for tool output. */
export interface RuzUctovnaJednotka {
  id: number;
  ico: string;
  dic: string | null;
  nazov: string;
  pravnaForma: string | null;
  skNace: string | null;
  velkost: string | null;
}

/** Statement summary for tool output. */
export interface RuzZavierkaSummary {
  id: number;
  obdobieOd: string | null;
  obdobieDo: string | null;
  typ: string | null;
  datumPodania: string | null;
  datumZostavenia: string | null;
  vykazy: RuzVykazSummary[];
  prilohy: RuzPrilohaSummary[];
}

/** Report summary for tool output. */
export interface RuzVykazSummary {
  id: number;
  typ: string | null;
  idSablony: number | null;
}

/** Attachment summary for tool output. */
export interface RuzPrilohaSummary {
  id: number;
  nazov: string | null;
  velkost: number | null;
}

/** Key financial indicators extracted from parsed reports. */
export interface KlucoveUkazovatele {
  aktivaCelkom: number | null;
  neobeznyMajetok: number | null;
  obeznyMajetok: number | null;
  vlastneImanie: number | null;
  zavazky: number | null;
  trzby: number | null;
  vysledokHospodarenia: number | null;
}

/** Parsed table with named rows — output of ruz-parser. */
export interface ParsedTable {
  nazov: string;
  stlpce: string[];
  riadky: ParsedRow[];
}

/** Single parsed row. */
export interface ParsedRow {
  cislo: number;
  nazov: string;
  hodnoty: (number | null)[];
}

/** Full financial report detail — output of financial_report tool. */
export interface FinancialReportDetail {
  reportId: number;
  idSablony: number | null;
  nazovSablony: string | null;
  tabulky: ParsedTable[];
  prilohy: RuzPrilohaSummary[];
}

/** company_financials tool output. */
export interface CompanyFinancialsResult {
  uctovnaJednotka: RuzUctovnaJednotka;
  zavierky: RuzZavierkaSummary[];
  klucoveUkazovatele: KlucoveUkazovatele;
}
