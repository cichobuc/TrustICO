/**
 * Types for EU VIES VAT number validation REST API.
 * Endpoint: POST https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number
 *
 * Quirks:
 * - Uses REST API, NOT SOAP
 * - Uses DIČ (not IČO)! countryCode + vatNumber (without country prefix)
 * - Auto-prefix "SK" if missing
 */

// --- Raw VIES API response ---

export type ViesResponse = {
  valid: boolean;
  requestDate: string;
  userError?: string;
  name?: string;
  address?: string;
  requestIdentifier?: string;
  countryCode?: string;
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
