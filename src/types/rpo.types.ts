/**
 * Types for ŠÚSR RPO API (api.statistics.sk/rpo/v1).
 * Based on actual API responses (verified 2026-03-24).
 */

// --- Codelist item used throughout RPO responses ---

export interface RpoCodelistItem {
  value: string;
  code: string;
  codelistCode?: string;
}

// --- Search Response (/rpo/v1/search) ---

export interface RpoSearchResponse {
  results: RpoSearchResult[];
  license?: string;
}

export interface RpoSearchResult {
  id: number;
  dbModificationDate?: string;
  identifiers: Array<{ value: string; validFrom?: string }>;
  fullNames: Array<{ value: string; validFrom?: string; validTo?: string }>;
  addresses: RpoAddress[];
  establishment: string | null;
  sourceRegister?: RpoSourceRegister;
}

// --- Entity Detail (/rpo/v1/entity/{id}) ---

export interface RpoEntityDetail {
  id: number;
  dbModificationDate?: string;
  identifiers: Array<{ value: string; validFrom?: string }>;
  fullNames: Array<{ value: string; validFrom?: string; validTo?: string }>;
  addresses: RpoAddress[];
  legalForms: Array<{ value: RpoCodelistItem; validFrom?: string; validTo?: string }>;
  establishment: string | null;
  activities: RpoActivity[];
  statutoryBodies: RpoStatutoryMember[];
  stakeholders: RpoStakeholder[];
  authorizations: Array<{ value: string; validFrom?: string; validTo?: string }>;
  equities: RpoEquity[];
  deposits: RpoDeposit[];
  otherLegalFacts?: Array<{ value: string; validFrom?: string }>;
  sourceRegister?: RpoSourceRegister;
  statisticalCodes?: RpoStatisticalCodes;
  organizationUnits?: RpoOrganizationUnit[];
  license?: string;
}

export interface RpoAddress {
  street?: string;
  regNumber?: number;
  buildingNumber?: string;
  postalCodes?: string[];
  municipality?: RpoCodelistItem | { value: string };
  country?: RpoCodelistItem | { value: string };
  validFrom?: string;
  validTo?: string;
}

export interface RpoActivity {
  economicActivityDescription: string;
  validFrom?: string;
  validTo?: string;
}

export interface RpoStatutoryMember {
  stakeholderType: RpoCodelistItem;
  personName: RpoPersonName;
  address?: RpoAddress;
  validFrom?: string;
  validTo?: string;
}

export interface RpoPersonName {
  formatedName?: string;
  familyNames?: string[];
  givenNames?: string[];
}

export interface RpoStakeholder {
  stakeholderType: RpoCodelistItem;
  personName?: RpoPersonName;
  fullName?: string;
  identifier?: string;
  address?: RpoAddress | { validFrom?: string; validTo?: string } & RpoAddress;
  establishment?: string;
  validFrom?: string;
  validTo?: string;
}

export interface RpoEquity {
  value?: number;
  valuePaid?: number;
  currency?: RpoCodelistItem;
  validFrom?: string;
  validTo?: string;
}

export interface RpoDeposit {
  fullName?: string;
  personName?: RpoPersonName;
  type?: string;
  amount?: number;
  currency?: RpoCodelistItem;
  validFrom?: string;
  validTo?: string;
}

export interface RpoSourceRegister {
  value?: RpoCodelistItem;
  registrationOffices?: Array<{ value: string; validFrom?: string }>;
  registrationNumbers?: Array<{ value: string; validFrom?: string }>;
}

export interface RpoStatisticalCodes {
  statCodesActualization?: string;
  mainActivity?: RpoCodelistItem;
  esa2010?: RpoCodelistItem;
}

export interface RpoOrganizationUnit {
  id: number;
  identifiers?: Array<{ value: string; validFrom?: string }>;
  fullNames?: Array<{ value: string; validFrom?: string; validTo?: string }>;
  addresses?: RpoAddress[];
  activities?: RpoActivity[];
  statutoryBodies?: RpoStatutoryMember[];
  validFrom?: string;
  validTo?: string;
}

// --- Mapped Output Types (for MCP tools) ---

export interface CompanySearchResult {
  ico: string;
  nazov: string;
  sidlo: string;
  pravnaForma: string | null;
  datumVzniku: string | null;
  aktivna: boolean;
  rpoId: number;
}

export interface CompanyPeopleResult {
  ico: string;
  nazov: string;
  statutari: Statutar[];
  spolocnici: Spolocnik[];
  sposobKonania: string | null;
  zakladneImanie: { suma: number | null; mena: string | null } | null;
}

export interface Statutar {
  typ: string | null;
  meno: string | null;
  priezvisko: string | null;
  titulyPred: string | null;
  titulyZa: string | null;
  adresa: MappedAddress | null;
  od: string | null;
  do: string | null;
  aktivny: boolean;
}

export interface Spolocnik {
  nazov: string;
  ico: string | null;
  vklad: { suma: number | null; splateny: number | null; mena: string | null } | null;
  podiel: string | null;
  od: string | null;
  do: string | null;
}

export interface MappedAddress {
  ulica: string | null;
  mesto: string | null;
  psc: string | null;
}

export interface CompanyHistoryResult {
  ico: string;
  nazov: string;
  zmenyNazvov: Array<{ nazov: string; od: string | null; do: string | null }>;
  zmenyAdries: Array<{ adresa: string; od: string | null; do: string | null }>;
  zmenyStatutarov: Array<{ meno: string; funkcia: string | null; od: string | null; do: string | null }>;
  zmenySpolocnikov: Array<{ nazov: string; od: string | null; do: string | null }>;
}

export interface CompanyBranchesResult {
  ico: string;
  prevadzkarne: Prevadzkaren[];
  pocet: number;
}

export interface Prevadzkaren {
  nazov: string;
  adresa: MappedAddress | null;
  predmetPodnikania: string[];
  veduci: string | null;
  od: string | null;
}
