/**
 * Adapter for ITMS2014+ (eurofondy).
 * Endpoint: opendata.itms2014.sk/v2
 *
 * Quirks (from CLAUDE.md):
 * - No direct search by IČO on projects!
 * - /v2/subjekty/{id} works only with internal ID
 * - Best-effort: iterate pages of projects, filter by prijimatel.subjekt.ico
 * - Low priority, may be slow
 */

import { HttpClient } from "../utils/http-client.js";
import type { AdapterResult } from "../types/common.types.js";
import type {
  ItmsSubjektRaw,
  ItmsProjektRaw,
  ItmsProjektyPageRaw,
  CompanyEuFundsResult,
  EuFundProject,
} from "../types/itms.types.js";

const ITMS_BASE_URL = "https://opendata.itms2014.sk/v2";
const SOURCE = "itms";

/** Max pages to iterate when searching projects by IČO (best-effort). */
const MAX_PAGES = 5;
const PAGE_SIZE = 100;

export class ItmsAdapter {
  constructor(private readonly http: HttpClient) {}

  /**
   * Get subjekt (entity) by internal ITMS ID.
   */
  async getSubjekt(id: number): Promise<AdapterResult<ItmsSubjektRaw>> {
    const start = Date.now();
    try {
      const url = `${ITMS_BASE_URL}/subjekty/${id}`;
      const resp = await this.http.get<ItmsSubjektRaw>(url, { source: SOURCE });

      if (resp.status === 404) {
        return { found: false, durationMs: Date.now() - start, source: SOURCE };
      }

      if (resp.status >= 400) {
        return {
          found: false,
          error: `ITMS API error: HTTP ${resp.status}`,
          durationMs: Date.now() - start,
          source: SOURCE,
        };
      }

      return { found: true, data: resp.data, durationMs: Date.now() - start, source: SOURCE };
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
   * Best-effort search for EU fund projects by IČO.
   * Iterates project pages and filters by prijimatel.subjekt.ico.
   * Limited to MAX_PAGES to avoid excessive API calls.
   */
  async findPrijimatel(ico: string): Promise<AdapterResult<CompanyEuFundsResult>> {
    const start = Date.now();
    try {
      const matchedProjects: EuFundProject[] = [];
      let prijimatel: { id: number; nazov: string } | null = null;

      for (let page = 0; page < MAX_PAGES; page++) {
        const url = `${ITMS_BASE_URL}/projekty?minimalProject=true&page=${page}&size=${PAGE_SIZE}`;
        const resp = await this.http.get<ItmsProjektyPageRaw>(url, { source: SOURCE });

        if (resp.status >= 400) break;

        const projects = resp.data?.content ?? [];
        if (projects.length === 0) break;

        for (const p of projects) {
          if (p.prijimatel?.subjekt?.ico === ico) {
            if (!prijimatel && p.prijimatel.subjekt.id && p.prijimatel.subjekt.nazov) {
              prijimatel = {
                id: p.prijimatel.subjekt.id,
                nazov: p.prijimatel.subjekt.nazov,
              };
            }
            matchedProjects.push({
              kod: p.kod ?? null,
              nazov: p.nazov ?? null,
              stav: p.stav ?? null,
              sumaZazmluvnena: p.sumaZazmluvnena ?? null,
              operacnyProgram: p.operacnyProgram?.nazov ?? p.programoveStrukturyNazov ?? null,
            });
          }
        }

        // If we found matches, stop early — we have enough
        if (matchedProjects.length > 0) break;

        // Stop if this was the last page
        const totalPages = resp.data?.totalPages ?? 0;
        if (page + 1 >= totalPages) break;
      }

      const celkovaSuma = matchedProjects.reduce(
        (sum, p) => sum + (p.sumaZazmluvnena ?? 0),
        0,
      );

      const result: CompanyEuFundsResult = {
        ico,
        found: matchedProjects.length > 0,
        prijimatel,
        projekty: matchedProjects,
        celkovaSuma,
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
