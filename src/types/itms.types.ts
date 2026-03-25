/**
 * Types for ITMS2014+ (eurofondy).
 * Source: opendata.itms2014.sk/v2
 *
 * Quirks:
 * - No direct search by IČO on projects!
 * - /v2/subjekty/{id} works only with internal ID
 * - No feasible way to search by IČO (no server-side filter on any endpoint)
 */

// --- Raw API types ---

export type ItmsSubjektRaw = {
  id?: number;
  nazov?: string;
  ico?: string;
  dic?: string;
  pravnaForma?: string;
  sidlo?: {
    ulica?: string;
    mesto?: string;
    psc?: string;
  };
};

// --- Mapped output types ---

export type EuFundProject = {
  kod: string | null;
  nazov: string | null;
  stav: string | null;
  sumaZazmluvnena: number | null;
  operacnyProgram: string | null;
};

export type CompanyEuFundsResult = {
  ico: string;
  found: boolean;
  prijimatel: { id: number; nazov: string } | null;
  projekty: EuFundProject[];
  celkovaSuma: number;
};
