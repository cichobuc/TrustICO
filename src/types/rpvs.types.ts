/**
 * Types for RPVS (Register partnerov verejného sektora) OData API.
 * Endpoint: rpvs.gov.sk/OpenData
 *
 * Quirks (verified 2026-03-25):
 * - OData v4
 * - $top is NOT allowed (server returns 400)
 * - $expand on PartneriVerejnehoSektora doesn't work for KUV/OO
 * - Must query Partneri entity set with $filter=PartneriVerejnehoSektora/any()
 * - Most companies are NOT in the register (only public sector partners)
 */

// --- OData response wrapper ---

export type RpvsODataResponse<T> = {
  "@odata.context"?: string;
  value: T[];
};

// --- Partneri entity (root, has KUV and OO navigation props) ---

export type RpvsPartner = {
  Id: number;
  CisloVlozky: number;
  PartneriVerejnehoSektora?: RpvsPartnerVS[];
  KonecniUzivateliaVyhod?: RpvsKuv[];
  OpravneneOsoby?: RpvsOpravnenaOsoba[];
};

// --- PartnerVerejnehoSektora (the company identity with ICO) ---

export type RpvsPartnerVS = {
  Id: number;
  Meno?: string;
  Priezvisko?: string;
  DatumNarodenia?: string;
  TitulPred?: string;
  TitulZa?: string;
  ObchodneMeno?: string;
  Ico?: string;
  FormaOsoby?: string;
  PlatnostOd?: string;
  PlatnostDo?: string;
};

// --- Konečný užívateľ výhod ---

export type RpvsKuv = {
  Id: number;
  Meno?: string;
  Priezvisko?: string;
  DatumNarodenia?: string;
  JeVerejnyCinitel?: boolean;
  ObchodneMeno?: string;
  Ico?: string;
  PlatnostOd?: string;
  PlatnostDo?: string;
};

// --- Oprávnená osoba ---

export type RpvsOpravnenaOsoba = {
  Id: number;
  Meno?: string;
  Priezvisko?: string;
  ObchodneMeno?: string;
  Ico?: string;
  FormaOsoby?: string;
  PlatnostOd?: string;
  PlatnostDo?: string;
};

// --- Mapped output types ---

export type CompanyKuvResult = {
  ico: string;
  found: boolean;
  poznamka?: string;
  partner?: {
    id: number;
    obchodneMeno: string;
    datumRegistracie: string | null;
  };
  konecniUzivatelia?: Array<{
    meno: string | null;
    priezvisko: string | null;
    datumNarodenia: string | null;
    jeVerejnyCinitel: boolean;
    od: string | null;
    do: string | null;
  }>;
  opravneneOsoby?: Array<{
    meno: string | null;
    ico: string | null;
    od: string | null;
  }>;
};
