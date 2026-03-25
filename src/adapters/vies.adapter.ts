/**
 * Adapter for EU VIES VAT number validation.
 * Endpoint: POST https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number
 *
 * Quirks (verified 2026-03-24):
 * - Uses REST API, NOT SOAP
 * - Uses DIČ (not IČO)! countryCode + vatNumber (without country prefix)
 * - Input is pre-validated by tool handler via validateICDPH → always "SK{10digits}"
 */

import { HttpClient } from "../utils/http-client.js";
import type { AdapterResult } from "../types/common.types.js";
import type { ViesResponse, CompanyVatCheckResult } from "../types/vies.types.js";

const VIES_BASE_URL = "https://ec.europa.eu/taxation_customs/vies/rest-api";
const SOURCE = "vies";

export class ViesAdapter {
  constructor(private readonly http: HttpClient) {}

  /**
   * Check VAT number via EU VIES REST API.
   * Expects pre-validated input in format "SK{digits}" from validateICDPH.
   */
  async checkVat(vatNumber: string): Promise<AdapterResult<CompanyVatCheckResult>> {
    const start = Date.now();
    try {
      // Input is pre-validated by tool handler — always "XX{digits}" format
      const countryCode = vatNumber.slice(0, 2);
      const number = vatNumber.slice(2);

      const resp = await this.http.post<ViesResponse>(
        `${VIES_BASE_URL}/check-vat-number`,
        { countryCode, vatNumber: number },
        { source: SOURCE },
      );

      if (resp.status >= 400) {
        return {
          found: false,
          error: `VIES API error: HTTP ${resp.status}`,
          durationMs: Date.now() - start,
          source: SOURCE,
        };
      }

      const data = resp.data;
      if (!data) {
        return {
          found: false,
          error: "Empty VIES response",
          durationMs: Date.now() - start,
          source: SOURCE,
        };
      }

      if (data.userError && data.userError !== "VALID") {
        return {
          found: false,
          error: `VIES error: ${data.userError}`,
          durationMs: Date.now() - start,
          source: SOURCE,
        };
      }

      const result: CompanyVatCheckResult = {
        vatNumber: `${countryCode}${number}`,
        valid: data.valid,
        nazov: data.name?.trim() || null,
        adresa: data.address?.trim() || null,
        datumOverenia: data.requestDate ?? new Date().toISOString().split("T")[0],
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
