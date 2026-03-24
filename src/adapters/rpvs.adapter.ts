/**
 * Adapter for RPVS (Register partnerov verejného sektora).
 * Endpoint: rpvs.gov.sk/OpenData
 *
 * Quirks (verified 2026-03-24):
 * - OData v4 — $filter=Ico eq '{ico}'
 * - $top=0 is NOT allowed!
 * - Most companies are NOT in the register (only public sector partners)
 * - Always return { found: false } for empty results, not an error
 */

import { HttpClient } from "../utils/http-client.js";
import type { AdapterResult } from "../types/common.types.js";
import type {
  RpvsODataResponse,
  RpvsPartner,
  CompanyKuvResult,
} from "../types/rpvs.types.js";

const RPVS_BASE_URL = "https://rpvs.gov.sk/OpenData";
const SOURCE = "rpvs";

export class RpvsAdapter {
  constructor(private readonly http: HttpClient) {}

  /**
   * Look up KÚV (konečný užívateľ výhod) and oprávnené osoby by IČO.
   * Expands KonecniUzivateliaVyhod and OpravneneOsoby.
   */
  async getKuv(ico: string): Promise<AdapterResult<CompanyKuvResult>> {
    const start = Date.now();
    try {
      const filter = encodeURIComponent(`Ico eq '${ico}'`);
      const expand = encodeURIComponent("KonecniUzivateliaVyhod,OpravneneOsoby");
      const url = `${RPVS_BASE_URL}/PartneriVerejnehoSektora?$filter=${filter}&$expand=${expand}`;

      const resp = await this.http.get<RpvsODataResponse<RpvsPartner>>(url, {
        source: SOURCE,
      });

      if (resp.status >= 400) {
        return {
          found: false,
          error: `RPVS API error: HTTP ${resp.status}`,
          durationMs: Date.now() - start,
          source: SOURCE,
        };
      }

      const data = resp.data;
      const partners = data?.value ?? [];

      if (partners.length === 0) {
        return {
          found: false,
          data: {
            ico,
            found: false,
            poznamka: "Firma nie je registrovaná v RPVS (nie je partner verejného sektora)",
          },
          durationMs: Date.now() - start,
          source: SOURCE,
        };
      }

      const partner = partners[0];
      const result: CompanyKuvResult = {
        ico,
        found: true,
        partner: {
          id: partner.Id,
          obchodneMeno: partner.ObchodneMeno,
          datumRegistracie: partner.DatumRegistracie ?? null,
        },
        konecniUzivatelia: (partner.KonecniUzivateliaVyhod ?? []).map((kuv) => ({
          meno: kuv.Meno ?? null,
          priezvisko: kuv.Priezvisko ?? null,
          datumNarodenia: kuv.DatumNarodenia ?? null,
          statnaPrislusnost: kuv.StatnaPrislusnost ?? null,
          jeVerejnyCinitel: kuv.VerejnyCinitel ?? false,
          od: kuv.PlatnostOd ?? null,
          do: kuv.PlatnostDo ?? null,
        })),
        opravneneOsoby: (partner.OpravneneOsoby ?? []).map((o) => ({
          meno: o.ObchodneMeno ?? ([o.Meno, o.Priezvisko].filter(Boolean).join(" ") || null),
          ico: o.Ico ?? null,
          od: o.PlatnostOd ?? null,
        })),
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
