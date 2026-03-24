/**
 * Types for RPVS (Register partnerov verejného sektora) OData API.
 * Endpoint: rpvs.gov.sk/OpenData
 *
 * Quirks:
 * - OData v4 — $filter=Ico eq '36421928'
 * - $top=0 is NOT allowed!
 * - Most companies are NOT in the register (only public sector partners)
 */

// --- OData response wrapper ---

export type RpvsODataResponse<T> = {
  "@odata.context"?: string;
  value: T[];
};

// --- Partner entity ---

export type RpvsPartner = {
  Id: number;
  ObchodneMeno: string;
  Ico: string;
  AdresaSidla?: string;
  DatumRegistracie?: string;
  DatumVymazu?: string;
  KonecniUzivateliaVyhod?: RpvsKuv[];
  OpravneneOsoby?: RpvsOpravnenaOsoba[];
};

// --- Konečný užívateľ výhod ---

export type RpvsKuv = {
  Id: number;
  Meno?: string;
  Priezvisko?: string;
  DatumNarodenia?: string;
  StatnaPrislusnost?: string;
  JeVerejnyCinitel?: boolean;
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
    statnaPrislusnost: string | null;
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
