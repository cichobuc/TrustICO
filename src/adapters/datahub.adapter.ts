/**
 * Adapter for DataHub slovensko.digital (CRZ + OV).
 * Endpoint: data.slovensko.digital
 *
 * Quirks (from CLAUDE.md):
 * - Uses internal IDs, not IČO — for IČO lookup use RPO instead
 * - Rate limit: 60 req/min per IP (source: "datahub" in rate limiter)
 * - CRZ: /api/data/crz/contracts/{id}
 * - OV:  /api/data/ov/{type}/{id}
 */

import { HttpClient } from "../utils/http-client.js";
import type { AdapterResult } from "../types/common.types.js";
import type {
  CrzContractRaw,
  CrzContractResult,
  OvFilingRaw,
  OvFilingType,
  OvFilingResult,
} from "../types/datahub.types.js";

const DATAHUB_BASE_URL = "https://data.slovensko.digital/api/data";
const SOURCE = "datahub";

export class DatahubAdapter {
  constructor(private readonly http: HttpClient) {}

  /**
   * Get a CRZ contract by internal ID.
   */
  async getCRZContract(id: number): Promise<AdapterResult<CrzContractResult>> {
    const start = Date.now();
    try {
      const url = `${DATAHUB_BASE_URL}/crz/contracts/${id}`;
      const resp = await this.http.get<CrzContractRaw>(url, { source: SOURCE });

      if (resp.status === 404) {
        return {
          found: false,
          data: undefined,
          durationMs: Date.now() - start,
          source: `${SOURCE}-crz`,
        };
      }

      if (resp.status >= 400) {
        return {
          found: false,
          error: `DataHub CRZ API error: HTTP ${resp.status}`,
          durationMs: Date.now() - start,
          source: `${SOURCE}-crz`,
        };
      }

      const raw = resp.data;

      // Merge departments + contractors into strany
      const strany: { nazov: string | null; ico: string | null }[] = [];
      for (const d of raw.departments ?? []) {
        strany.push({ nazov: d.name ?? null, ico: d.cin ?? null });
      }
      for (const c of raw.contractors ?? []) {
        strany.push({ nazov: c.name ?? null, ico: c.cin ?? null });
      }

      const result: CrzContractResult = {
        id: raw.id ?? id,
        cisloZmluvy: raw.contract_identifier ?? null,
        predmet: raw.subject ?? null,
        suma: raw.total_amount ?? null,
        datumZverejnenia: raw.published_at ?? null,
        datumUcinnosti: raw.effective_from ?? null,
        strany,
      };

      return { found: true, data: result, durationMs: Date.now() - start, source: `${SOURCE}-crz` };
    } catch (err) {
      return {
        found: false,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - start,
        source: `${SOURCE}-crz`,
      };
    }
  }

  /**
   * Get an OV (Obchodný vestník) filing by internal ID and type.
   * Types: "or_podanie", "konkurz", "likvidacia"
   */
  async getOVFiling(id: number, type: OvFilingType): Promise<AdapterResult<OvFilingResult>> {
    const start = Date.now();
    try {
      const url = `${DATAHUB_BASE_URL}/ov/${type}/${id}`;
      const resp = await this.http.get<OvFilingRaw>(url, { source: SOURCE });

      if (resp.status === 404) {
        return {
          found: false,
          data: undefined,
          durationMs: Date.now() - start,
          source: `${SOURCE}-ov`,
        };
      }

      if (resp.status >= 400) {
        return {
          found: false,
          error: `DataHub OV API error: HTTP ${resp.status}`,
          durationMs: Date.now() - start,
          source: `${SOURCE}-ov`,
        };
      }

      const raw = resp.data;
      const result: OvFilingResult = {
        id: raw.id ?? id,
        typ: raw.document_type ?? type,
        cisloVestnika: raw.raw_issue_id ?? null,
        datumZverejnenia: raw.published_at ?? null,
        firma: {
          nazov: raw.corporate_body_name ?? null,
          ico: raw.cin ?? null,
        },
        obsah: raw.content ?? null,
      };

      return { found: true, data: result, durationMs: Date.now() - start, source: `${SOURCE}-ov` };
    } catch (err) {
      return {
        found: false,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - start,
        source: `${SOURCE}-ov`,
      };
    }
  }
}
