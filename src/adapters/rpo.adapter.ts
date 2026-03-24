/**
 * Adapter for ŠÚSR RPO API (api.statistics.sk/rpo/v1).
 *
 * Quirks (verified 2026-03-24):
 * - Search endpoint is `/rpo/v1/search` (NOT `/rpo/v1/entity`)
 * - Parameter for IČO is `identifier`
 * - Search results use arrays: identifiers[], fullNames[], addresses[]
 * - Entity detail: `/rpo/v1/entity/{id}` with `?showHistoricalData=true&showOrganizationUnits=true`
 * - statutoryBodies is a flat array (each entry = one person), not nested
 * - Encoding: fetch raw buffer and decode as UTF-8 as safety measure
 */

import { HttpClient } from "../utils/http-client.js";
import { hasBrokenEncoding, fixBrokenUtf8 } from "../utils/encoding.js";
import type { AdapterResult } from "../types/common.types.js";
import type {
  RpoSearchResponse,
  RpoSearchResult,
  RpoEntityDetail,
  RpoAddress,
  RpoPersonName,
  RpoStakeholder,
  RpoDeposit,
  CompanySearchResult,
  CompanyPeopleResult,
  CompanyHistoryResult,
  CompanyBranchesResult,
  Statutar,
  Spolocnik,
  MappedAddress,
  Prevadzkaren,
} from "../types/rpo.types.js";

const RPO_BASE_URL = "https://api.statistics.sk/rpo/v1";
const SOURCE = "rpo";

export class RpoAdapter {
  constructor(private readonly http: HttpClient) {}

  /** Search RPO by IČO (identifier). */
  async search(identifier: string): Promise<AdapterResult<CompanySearchResult[]>> {
    const start = Date.now();
    try {
      const url = `${RPO_BASE_URL}/search?identifier=${encodeURIComponent(identifier)}`;
      const resp = await this.fetchJson<RpoSearchResponse>(url);

      if (!resp.results || resp.results.length === 0) {
        return { found: false, data: [], durationMs: Date.now() - start, source: SOURCE };
      }

      const data = resp.results.map(mapSearchResult);
      return { found: true, data, durationMs: Date.now() - start, source: SOURCE };
    } catch (err) {
      return {
        found: false,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - start,
        source: SOURCE,
      };
    }
  }

  /** Search RPO by company name. */
  async searchByName(fullName: string): Promise<AdapterResult<CompanySearchResult[]>> {
    const start = Date.now();
    try {
      const url =
        `${RPO_BASE_URL}/search?fullName=${encodeURIComponent(fullName)}&onlyActive=true`;
      const resp = await this.fetchJson<RpoSearchResponse>(url);

      if (!resp.results || resp.results.length === 0) {
        return { found: false, data: [], durationMs: Date.now() - start, source: SOURCE };
      }

      const data = resp.results.map(mapSearchResult);
      return { found: true, data, durationMs: Date.now() - start, source: SOURCE };
    } catch (err) {
      return {
        found: false,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - start,
        source: SOURCE,
      };
    }
  }

  /** Get full entity detail by RPO internal ID. */
  async getEntity(rpoId: number): Promise<AdapterResult<RpoEntityDetail>> {
    const start = Date.now();
    try {
      const url =
        `${RPO_BASE_URL}/entity/${rpoId}?showHistoricalData=true&showOrganizationUnits=true`;
      const data = await this.fetchJson<RpoEntityDetail>(url);

      if (!data || !data.id) {
        return { found: false, durationMs: Date.now() - start, source: SOURCE };
      }

      return { found: true, data, durationMs: Date.now() - start, source: SOURCE };
    } catch (err) {
      return {
        found: false,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - start,
        source: SOURCE,
      };
    }
  }

  /** Search by IČO → get first match → fetch full entity detail. */
  async getEntityByIco(ico: string): Promise<AdapterResult<RpoEntityDetail>> {
    const start = Date.now();

    const searchResult = await this.search(ico);
    if (!searchResult.found || !searchResult.data || searchResult.data.length === 0) {
      return {
        found: false,
        error: searchResult.error ?? "Firma s daným IČO nebola nájdená v RPO",
        durationMs: Date.now() - start,
        source: SOURCE,
      };
    }

    const rpoId = searchResult.data[0].rpoId;
    const entityResult = await this.getEntity(rpoId);
    return { ...entityResult, durationMs: Date.now() - start };
  }

  // --- Mapping: People ---

  mapPeople(entity: RpoEntityDetail): CompanyPeopleResult {
    const ico = getIco(entity);
    const nazov = getCurrentName(entity);

    const statutari: Statutar[] = (entity.statutoryBodies ?? []).map((member) => {
      const names = extractNameParts(member.personName);
      return {
        typ: member.stakeholderType?.value ?? null,
        meno: names.givenName,
        priezvisko: names.familyName,
        titulyPred: names.prefix,
        titulyZa: null,
        adresa: mapAddress(member.address),
        od: member.validFrom ?? null,
        do: member.validTo ?? null,
        aktivny: !member.validTo,
      };
    });

    // Build deposit map for stakeholder vklady
    const depositMap = buildDepositMap(entity.deposits ?? []);

    const spolocnici: Spolocnik[] = (entity.stakeholders ?? []).map((s) => {
      const nazov = s.fullName ?? formatPersonName(s.personName);
      const deposit = findCurrentDeposit(depositMap, nazov);
      return {
        nazov,
        ico: s.identifier && s.identifier !== "Neuvedené" ? s.identifier : null,
        vklad: deposit
          ? { suma: deposit.amount ?? null, splateny: null, mena: deposit.currency?.code ?? null }
          : null,
        podiel: null,
        od: s.validFrom ?? null,
        do: s.validTo ?? null,
      };
    });

    // Current authorization (spôsob konania)
    const currentAuth = getCurrentValue(entity.authorizations ?? []);

    // Current equity (základné imanie)
    const currentEquity = (entity.equities ?? []).find(
      (e) => !e.validTo && e.value !== undefined,
    );

    return {
      ico,
      nazov,
      statutari,
      spolocnici,
      sposobKonania: currentAuth?.value ?? null,
      zakladneImanie: currentEquity
        ? { suma: currentEquity.value ?? null, mena: currentEquity.currency?.code ?? null }
        : null,
    };
  }

  // --- Mapping: History ---

  mapHistory(entity: RpoEntityDetail): CompanyHistoryResult {
    const ico = getIco(entity);
    const nazov = getCurrentName(entity);

    const zmenyNazvov = (entity.fullNames ?? []).map((n) => ({
      nazov: n.value,
      od: n.validFrom ?? null,
      do: n.validTo ?? null,
    }));

    const zmenyAdries = (entity.addresses ?? []).map((a) => ({
      adresa: formatAddressString(a),
      od: a.validFrom ?? null,
      do: a.validTo ?? null,
    }));

    const zmenyStatutarov = (entity.statutoryBodies ?? []).map((member) => ({
      meno: member.personName?.formatedName ?? formatPersonName(member.personName),
      funkcia: member.stakeholderType?.value ?? null,
      od: member.validFrom ?? null,
      do: member.validTo ?? null,
    }));

    const zmenySpolocnikov = (entity.stakeholders ?? []).map((s) => ({
      nazov: s.fullName ?? formatPersonName(s.personName),
      od: s.validFrom ?? null,
      do: s.validTo ?? null,
    }));

    return { ico, nazov, zmenyNazvov, zmenyAdries, zmenyStatutarov, zmenySpolocnikov };
  }

  // --- Mapping: Branches ---

  mapBranches(entity: RpoEntityDetail): CompanyBranchesResult {
    const ico = getIco(entity);

    const prevadzkarne: Prevadzkaren[] = (entity.organizationUnits ?? []).map((unit) => {
      const name = unit.fullNames?.[0]?.value ?? `Organizačná zložka ${unit.id}`;
      const addr = unit.addresses?.[0] ?? null;
      return {
        nazov: name,
        adresa: addr ? mapAddress(addr) : null,
        predmetPodnikania: (unit.activities ?? []).map((a) => a.economicActivityDescription),
        veduci: unit.statutoryBodies?.[0]?.personName?.formatedName ?? null,
        od: unit.validFrom ?? null,
      };
    });

    return { ico, prevadzkarne, pocet: prevadzkarne.length };
  }

  // --- Internal: fetch with encoding safety ---

  private async fetchJson<T>(url: string): Promise<T> {
    const resp = await this.http.get<Buffer>(url, { source: SOURCE, raw: true });

    if (resp.status === 404) {
      throw new Error("Not found (404)");
    }
    if (resp.status >= 400) {
      throw new Error(`RPO API error: HTTP ${resp.status}`);
    }

    if (!Buffer.isBuffer(resp.data)) {
      throw new Error("Expected raw Buffer from RPO API");
    }
    let text = resp.data.toString("utf-8");
    if (hasBrokenEncoding(text)) {
      text = fixBrokenUtf8(text);
    }
    return JSON.parse(text) as T;
  }
}

// --- Helper functions ---

function getIco(entity: RpoEntityDetail): string {
  return entity.identifiers?.[0]?.value ?? "";
}

function getCurrentName(entity: RpoEntityDetail): string {
  const current = entity.fullNames?.find((n) => !n.validTo);
  return current?.value ?? entity.fullNames?.[0]?.value ?? "";
}

function mapSearchResult(r: RpoSearchResult): CompanySearchResult {
  const ico = r.identifiers?.[0]?.value ?? "";
  const currentName = r.fullNames?.find((n) => !n.validTo);
  const nazov = currentName?.value ?? r.fullNames?.[0]?.value ?? "";
  const currentAddr = r.addresses?.find((a) => !a.validTo) ?? r.addresses?.[0];

  return {
    ico,
    nazov,
    sidlo: currentAddr ? formatAddressString(currentAddr) : "",
    pravnaForma: null, // Search results don't include legalForm
    datumVzniku: r.establishment ?? null,
    aktivna: !r.termination,
    rpoId: r.id,
  };
}

function mapAddress(addr: RpoAddress | null | undefined): MappedAddress | null {
  if (!addr) return null;
  const street = [addr.street, addr.buildingNumber].filter(Boolean).join(" ") || null;
  const mesto = typeof addr.municipality === "object" ? addr.municipality?.value ?? null : null;
  const psc = addr.postalCodes?.[0] ?? null;
  return { ulica: street, mesto, psc };
}

function formatAddressString(addr: RpoAddress): string {
  const parts: string[] = [];
  if (addr.street) parts.push(addr.street);
  if (addr.buildingNumber) parts.push(addr.buildingNumber);
  const psc = addr.postalCodes?.[0];
  const mesto = typeof addr.municipality === "object" ? addr.municipality?.value : undefined;
  if (psc && mesto) {
    parts.push(`${psc} ${mesto}`);
  } else {
    if (psc) parts.push(psc);
    if (mesto) parts.push(mesto);
  }
  return parts.join(", ");
}

function extractNameParts(pn: RpoPersonName | undefined): {
  givenName: string | null;
  familyName: string | null;
  prefix: string | null;
} {
  if (!pn) return { givenName: null, familyName: null, prefix: null };

  const formatted = pn.formatedName ?? "";
  const familyName = pn.familyNames?.[0] ?? null;
  const givenName = pn.givenNames?.[0] ?? null;

  // Extract prefix (titles) from formatted name
  let prefix: string | null = null;
  if (formatted && familyName) {
    const titleMatch = formatted.match(/^((?:Ing\.|Mgr\.|Bc\.|JUDr\.|MUDr\.|RNDr\.|PhDr\.|PaedDr\.|ThDr\.|MVDr\.|DrSc\.|doc\.|prof\.|PhD\.|CSc\.|MBA|Dipl\.)\s*)+/i);
    if (titleMatch) {
      prefix = titleMatch[0].trim();
    }
  }

  return { givenName, familyName, prefix };
}

function formatPersonName(pn: RpoPersonName | undefined): string {
  if (!pn) return "";
  if (pn.formatedName) return pn.formatedName;
  return [...(pn.givenNames ?? []), ...(pn.familyNames ?? [])].join(" ");
}

function getCurrentValue<T extends { validTo?: string }>(items: T[]): T | null {
  return items.find((i) => !i.validTo) ?? items[items.length - 1] ?? null;
}

/** Build map of deposits by name for quick lookup. */
function buildDepositMap(deposits: RpoDeposit[]): Map<string, RpoDeposit[]> {
  const map = new Map<string, RpoDeposit[]>();
  for (const d of deposits) {
    const key = d.fullName ?? d.personName?.formatedName ?? "";
    if (!key) continue;
    const list = map.get(key) ?? [];
    list.push(d);
    map.set(key, list);
  }
  return map;
}

/** Find the current (no validTo) deposit for a given name. */
function findCurrentDeposit(map: Map<string, RpoDeposit[]>, name: string): RpoDeposit | null {
  const deposits = map.get(name);
  if (!deposits) return null;
  return deposits.find((d) => !d.validTo) ?? deposits[deposits.length - 1] ?? null;
}
