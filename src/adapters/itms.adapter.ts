/**
 * Adapter for ITMS2014+ (eurofondy).
 * Endpoint: opendata.itms2014.sk/v2
 *
 * Quirks (verified 2026-03-25):
 * - No /v2/projekty endpoint (returns 404)!
 * - /v2/subjekty/{id} works only with internal ID (IDs are sparse)
 * - /v2/operacneProgramy works (list/detail)
 * - /v2/pohladavkovyDoklad works (list, has dlznik with ICO)
 * - No way to search projects by IČO — best-effort via pohladavkovyDoklad
 */

import { HttpClient } from "../utils/http-client.js";
import type { AdapterResult } from "../types/common.types.js";
import type {
  ItmsSubjektRaw,
  CompanyEuFundsResult,
  EuFundProject,
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
   * Best-effort search for EU fund involvement by IČO.
   *
   * The ITMS v2 API does NOT have a /projekty endpoint or IČO search.
   * We check /pohladavkovyDoklad (debt claims) which references subjekty with ICO.
   * This gives partial signal but not full project data.
   */
  async findPrijimatel(ico: string): Promise<AdapterResult<CompanyEuFundsResult>> {
    const start = Date.now();
    try {
      // Try pohladavkovyDoklad — it lists claims with dlznik.ico
      const url = `${ITMS_BASE_URL}/pohladavkovyDoklad`;
      const resp = await this.http.get<PohladavkovyDokladRow[]>(url, { source: SOURCE });

      if (resp.status >= 400) {
        return {
          found: false,
          data: {
            ico,
            found: false,
            prijimatel: null,
            projekty: [],
            celkovaSuma: 0,
          },
          error: `ITMS API error: HTTP ${resp.status}`,
          durationMs: Date.now() - start,
          source: SOURCE,
        };
      }

      const rows = resp.data ?? [];
      const matched = rows.filter((r) => r.dlznik?.ico === ico);

      if (matched.length === 0) {
        // No results — this is expected for most companies
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

      // Extract subjekt info from the first match
      const first = matched[0];
      const prijimatel = first.dlznik?.id && first.dlznik?.nazov
        ? { id: first.dlznik.id, nazov: first.dlznik.nazov }
        : (first.dlznik?.id
          ? { id: first.dlznik.id, nazov: ico }
          : null);

      // pohladavkovyDoklad doesn't have full project data,
      // but we can extract what's available
      const projekty: EuFundProject[] = matched.map((r) => ({
        kod: null,
        nazov: r.dovodVratenia?.nazov ?? "Pohľadávkový doklad",
        stav: r.dopadNaRozpocetEU ?? null,
        sumaZazmluvnena: null,
        operacnyProgram: null,
      }));

      const result: CompanyEuFundsResult = {
        ico,
        found: true,
        prijimatel,
        projekty,
        celkovaSuma: 0,
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
}

// --- Internal types for pohladavkovyDoklad response ---

type PohladavkovyDokladRow = {
  dlznik?: {
    id?: number;
    ico?: string;
    dic?: string;
    nazov?: string;
    href?: string;
  };
  dopadNaRozpocetEU?: string;
  dovodVratenia?: {
    nazov?: string;
  };
};
