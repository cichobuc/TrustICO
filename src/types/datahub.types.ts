/**
 * Types for DataHub slovensko.digital (CRZ + OV).
 * Source: data.slovensko.digital
 *
 * Quirks:
 * - Uses internal IDs, not IČO
 * - Rate limit: 60 req/min per IP
 */

// --- CRZ (Centrálny register zmlúv) ---

export type CrzContractRaw = {
  id?: number;
  contract_identifier?: string;
  subject?: string;
  total_amount?: number;
  published_at?: string;
  effective_from?: string;
  effective_to?: string;
  departments?: CrzDepartmentRaw[];
  contractors?: CrzContractorRaw[];
};

export type CrzDepartmentRaw = {
  name?: string;
  cin?: string;
};

export type CrzContractorRaw = {
  name?: string;
  cin?: string;
};

export type CrzContractResult = {
  id: number;
  cisloZmluvy: string | null;
  predmet: string | null;
  suma: number | null;
  datumZverejnenia: string | null;
  datumUcinnosti: string | null;
  strany: { nazov: string | null; ico: string | null }[];
};

// --- OV (Obchodný vestník) ---

export type OvFilingRaw = {
  id?: number;
  bulletin_issue_id?: number;
  raw_issue_id?: string;
  published_at?: string;
  corporate_body_name?: string;
  cin?: string;
  content?: string;
  document_type?: string;
};

export type OvFilingType = "or_podanie" | "konkurz" | "likvidacia";

export type OvFilingResult = {
  id: number;
  typ: string | null;
  cisloVestnika: string | null;
  datumZverejnenia: string | null;
  firma: { nazov: string | null; ico: string | null };
  obsah: string | null;
};
