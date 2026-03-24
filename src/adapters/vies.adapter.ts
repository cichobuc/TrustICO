/**
 * Adapter for EU VIES VAT number validation.
 * Endpoint: POST https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number
 *
 * Quirks (verified 2026-03-24):
 * - Uses REST API, NOT SOAP
 * - Uses DIČ (not IČO)! countryCode + vatNumber (without country prefix)
 * - Auto-prefix "SK" if missing
 */

import { HttpClient } from "../utils/http-client.js";
import type { AdapterResult } from "../types/common.types.js";

const VIES_BASE_URL = "https://ec.europa.eu/taxation_customs/vies/rest-api";
const SOURCE = "vies";

// --- VIES response type ---

type ViesResponse = {
  isValid: boolean;
  requestDate: string;
  userError?: string;
  name?: string;
  address?: string;
  requestIdentifier?: string;
  vatNumber?: string;
  viesApproximate?: {
    name?: string;
    street?: string;
    postalCode?: string;
    city?: string;
    companyType?: string;
    matchName?: number;
    matchStreet?: number;
    matchPostalCode?: number;
    matchCity?: number;
    matchCompanyType?: number;
  };
};

// --- Mapped output type ---

export type CompanyVatCheckResult = {
  vatNumber: string;
  valid: boolean;
  nazov: string | null;
  adresa: string | null;
  datumOverenia: string;
};

export class ViesAdapter {
  constructor(private readonly http: HttpClient) {}

  /**
   * Check VAT number via EU VIES REST API.
   * Accepts "SK2021869234", "2021869234", or just the 10-digit DIČ.
   * Auto-prefixes SK if no country code is present.
   */
  async checkVat(vatNumber: string): Promise<AdapterResult<CompanyVatCheckResult>> {
    const start = Date.now();
    try {
      const { countryCode, number } = parseVatNumber(vatNumber);

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
        valid: data.isValid,
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

/**
 * Parse VAT number into country code and number.
 * "SK2021869234" → { countryCode: "SK", number: "2021869234" }
 * "2021869234"   → { countryCode: "SK", number: "2021869234" }
 */
function parseVatNumber(input: string): { countryCode: string; number: string } {
  const trimmed = input.trim().toUpperCase();

  // Check if starts with 2 letter country code
  const match = trimmed.match(/^([A-Z]{2})(\d+)$/);
  if (match) {
    return { countryCode: match[1], number: match[2] };
  }

  // Pure digits — default to SK
  if (/^\d+$/.test(trimmed)) {
    return { countryCode: "SK", number: trimmed };
  }

  // Fallback: try to use as-is with SK prefix
  return { countryCode: "SK", number: trimmed };
}
