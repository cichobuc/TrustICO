/**
 * Adapter for IS REPLIK (insolvenčné konania).
 * Endpoint: replik-ws.justice.sk/ru-verejnost-ws SOAP 1.1
 *
 * IS REPLIK v2 (od 1.10.2025) — nahradil starý "Register úpadcov".
 * Operácie (v1.0.7):
 * - Search by IČO: `getKonaniePodlaICO` s parametrom `ico`
 * - Detail: `getKonanieDetail` s parametrom `konanieId`
 * - Notices: `vyhladajOznamy` s parametrom `ico` (oznamService)
 * - Full-text: `vyhladajKonanie` (paginovaný)
 * - Ďalšie: `getKonanieDetailPodlaZnackyASudu`, `getKonaniePreObdobie`, `getZoznamSudov`
 */

import { callKonanieService, callOznamService } from "../utils/soap-client.js";
import type { AdapterResult } from "../types/common.types.js";
import type {
  ReplikKonaniaResponse,
  ReplikKonanieRaw,
  ReplikKonanieDetailRaw,
  ReplikOznamyResponse,
  ReplikOznamRaw,
  CompanyInsolvencyResult,
  InsolvencyProceeding,
  InsolvencyDetailResult,
  InsolvencyEvent,
  CompanyInsolvencyNoticesResult,
  InsolvencyNotice,
} from "../types/replik.types.js";

const SOURCE = "replik";

/** Normalize SOAP arrays — SOAP may return a single object instead of array. */
function toArray<T>(val: T[] | T | undefined): T[] {
  if (!val) return [];
  return Array.isArray(val) ? val : [val];
}

export class ReplikAdapter {
  /**
   * Search insolvency proceedings by IČO.
   */
  async getKonania(ico: string): Promise<AdapterResult<CompanyInsolvencyResult>> {
    const start = Date.now();
    try {
      const resp = await callKonanieService<ReplikKonaniaResponse>(
        "getKonaniePodlaICO",
        { ico },
      );

      const rawKonania = toArray<ReplikKonanieRaw>(resp?.konania);

      const konania: InsolvencyProceeding[] = rawKonania.map((k) => ({
        konanieId: k.konanieId ?? "",
        spisovaZnacka: k.spisovaZnacka ?? null,
        sud: k.sud ?? null,
        druhKonania: k.druhKonania ?? null,
        stavKonania: k.stavKonania ?? null,
        spravca: k.spravcaMeno
          ? { meno: k.spravcaMeno, znacka: k.spravcaZnacka ?? null }
          : null,
        datumZaciatku: k.datumZaciatku ?? null,
        datumUkoncenia: k.datumUkoncenia ?? null,
      }));

      const result: CompanyInsolvencyResult = {
        ico,
        found: konania.length > 0,
        konania,
      };

      return { found: result.found, data: result, durationMs: Date.now() - start, source: SOURCE };
    } catch (err) {
      return {
        found: false,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - start,
        source: SOURCE,
      };
    }
  }

  /**
   * Get detailed information about a specific insolvency proceeding.
   */
  async getKonanieDetail(konanieId: string): Promise<AdapterResult<InsolvencyDetailResult>> {
    const start = Date.now();
    try {
      const raw = await callKonanieService<ReplikKonanieDetailRaw>(
        "getKonanieDetail",
        { konanieId },
      );

      const rawUdalosti = toArray(raw?.udalosti);
      const udalosti: InsolvencyEvent[] = rawUdalosti.map((u) => ({
        datum: u.datum ?? null,
        typ: u.typ ?? null,
        popis: u.popis ?? null,
      }));

      const result: InsolvencyDetailResult = {
        konanieId: raw?.konanieId ?? konanieId,
        spisovaZnacka: raw?.spisovaZnacka ?? null,
        sud: raw?.sud ?? null,
        druhKonania: raw?.druhKonania ?? null,
        stavKonania: raw?.stavKonania ?? null,
        dlznik: raw?.dlznik
          ? {
              nazov: raw.dlznik.nazov ?? null,
              ico: raw.dlznik.ico ?? null,
              sidlo: raw.dlznik.sidlo ?? null,
            }
          : null,
        spravca: raw?.spravca
          ? {
              meno: raw.spravca.meno ?? null,
              znacka: raw.spravca.znacka ?? null,
              adresa: raw.spravca.adresa ?? null,
            }
          : null,
        datumZaciatku: raw?.datumZaciatku ?? null,
        datumUkoncenia: raw?.datumUkoncenia ?? null,
        udalosti,
      };

      return { found: true, data: result, durationMs: Date.now() - start, source: SOURCE };
    } catch (err) {
      return {
        found: false,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - start,
        source: SOURCE,
      };
    }
  }

  /**
   * Search insolvency notices by IČO.
   */
  async getOznamy(ico: string): Promise<AdapterResult<CompanyInsolvencyNoticesResult>> {
    const start = Date.now();
    try {
      const resp = await callOznamService<ReplikOznamyResponse>(
        "vyhladajOznamy",
        { ico },
      );

      const rawOznamy = toArray<ReplikOznamRaw>(resp?.oznamy);

      const oznamy: InsolvencyNotice[] = rawOznamy.map((o) => ({
        oznamId: o.oznamId ?? "",
        konanieId: o.konanieId ?? null,
        druhOznamu: o.druhOznamu ?? null,
        datumZverejnenia: o.datumZverejnenia ?? null,
        text: o.text ?? null,
      }));

      const result: CompanyInsolvencyNoticesResult = {
        ico,
        found: oznamy.length > 0,
        oznamy,
      };

      return { found: result.found, data: result, durationMs: Date.now() - start, source: SOURCE };
    } catch (err) {
      return {
        found: false,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - start,
        source: SOURCE,
      };
    }
  }
}
