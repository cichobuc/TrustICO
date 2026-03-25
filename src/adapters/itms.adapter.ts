/**
 * Adapter for ITMS2014+ (eurofondy).
 * Endpoint: opendata.itms2014.sk/v2
 *
 * Quirks (verified 2026-03-25):
 * - No /v2/projekty endpoint (returns 404)!
 * - /v2/subjekty/{id} works only with internal ID (IDs are sparse)
 * - /v2/operacneProgramy works (list/detail)
 * - /v2/pohladavkovyDoklad works but returns ALL records (no server-side IČO filter)
 * - No feasible way to search projects by IČO via API
 */

import { HttpClient } from "../utils/http-client.js";
import type { AdapterResult } from "../types/common.types.js";
import type {
  ItmsSubjektRaw,
  CompanyEuFundsResult,
} from "../types/itms.types.js";

const ITMS_BASE_URL = "https://opendata.itms2014.sk/v2";
const SOURCE = "itms";

export class ItmsAdapter {
  constructor(private readonly http: HttpClient) {}

  /**
   * Get subjekt (entity) by internal ITMS ID.
   */
  async getSubjekt(id: number): Promise<AdapterResult<ItmsSubjektRaw>> {
    const start = Date.now();
    try {
      if (!Number.isInteger(id) || id <= 0) {
        return { found: false, error: "Invalid ITMS subject ID", durationMs: Date.now() - start, source: SOURCE };
      }

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
   * Search for EU fund involvement by IČO.
   *
   * The ITMS v2 API does NOT have a /projekty endpoint or server-side IČO filter.
   * The /pohladavkovyDoklad endpoint returns the entire dataset (potentially huge),
   * making client-side filtering impractical. Returns not-found with explanation.
   */
  async findPrijimatel(ico: string): Promise<AdapterResult<CompanyEuFundsResult>> {
    const start = Date.now();

    // The ITMS API lacks server-side IČO filtering on any project-related endpoint.
    // Downloading the entire pohladavkovyDoklad dataset for client-side filtering
    // is not feasible (unbounded response size, slow, wastes bandwidth).
    return {
      found: false,
      data: {
        ico,
        found: false,
        prijimatel: null,
        projekty: [],
        celkovaSuma: 0,
      },
      durationMs: Date.now() - start,
      source: SOURCE,
    };
  }
}
