/**
 * Types for Finančná správa SR API (iz.opendata.financnasprava.sk/api).
 *
 * Quirks:
 * - Requires API key in header `key`
 * - Search min 5 chars (IČO = 8 → OK)
 * - Slugs: ds_dphs (DPH), ds_dsdd (dlžníci), ds_dphz (zrušenie), ds_dphv (vymazanie), ds_ids (index)
 */

// --- Generic search response ---

export type FinsprSearchResponse = {
  page: number;
  total_rows: number;
  total_pages: number;
  results: FinsprSearchRow[];
};

export type FinsprSearchRow = {
  id: number;
  [key: string]: unknown;
};

// --- DPH registration (ds_dphs) ---

export type FinsprDphRow = {
  id: number;
  ico: string;
  dic: string;
  ic_dph: string;
  nazov: string;
  paragraf?: string;
  datum_registracie?: string;
  datum_zmeny?: string;
};

// --- Tax debtor (ds_dsdd) ---

export type FinsprDlznikRow = {
  id: number;
  ico: string;
  dic: string;
  nazov: string;
  suma_nedoplatkov?: number;
  datum_zverejnenia?: string;
};

// --- DPH cancellation (ds_dphz) ---

export type FinsprDphZrusenieRow = {
  id: number;
  ico: string;
  dic: string;
  ic_dph: string;
  nazov: string;
  dovod_zrusenia?: string;
  datum_zrusenia?: string;
};

// --- DPH removal (ds_dphv) ---

export type FinsprDphVymazanieRow = {
  id: number;
  ico: string;
  dic: string;
  ic_dph: string;
  nazov: string;
  datum_vymazania?: string;
};

// --- Reliability index (ds_ids) ---

export type FinsprIndexRow = {
  id: number;
  ico: string;
  dic: string;
  nazov: string;
  index_danovej_spolahlivosti?: string;
};

// --- Sub-source status for zdrojeStatus ---

export type FinsprSubStatus = {
  status: "ok" | "error" | "not_found";
  durationMs: number;
  error?: string;
};

// --- Aggregated tax status output ---

export type CompanyTaxStatusResult = {
  ico: string;
  dph: {
    registrovany: boolean;
    icDph: string | null;
    paragraf: string | null;
    datumRegistracie: string | null;
    vymazany: boolean;
    dovodyZrusenia: string | null;
  };
  indexSpolahlivosti: string | null;
  danovyDlznik: boolean;
  zdrojeStatus: Record<string, FinsprSubStatus>;
};

// --- FinSpr slugs ---

export const FINSPR_SLUGS = {
  DPH: "ds_dphs",
  DLZNICI: "ds_dsdd",
  DPH_ZRUSENIE: "ds_dphz",
  DPH_VYMAZANIE: "ds_dphv",
  INDEX: "ds_ids",
} as const;

export type FinsprSlug = (typeof FINSPR_SLUGS)[keyof typeof FINSPR_SLUGS];
