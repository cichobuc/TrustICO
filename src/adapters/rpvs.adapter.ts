/**
 * Adapter for RPVS (Register partnerov verejného sektora).
 * Endpoint: rpvs.gov.sk/OpenData
 *
 * Quirks (verified 2026-03-25):
 * - OData v4
 * - $top is NOT allowed (server returns 400)
 * - KonecniUzivateliaVyhod and OpravneneOsoby live on Partneri entity,
 *   NOT on PartneriVerejnehoSektora. Must query:
 *   Partneri?$filter=PartneriVerejnehoSektora/any(p: p/Ico eq '{ico}')
 *   &$expand=KonecniUzivateliaVyhod,OpravneneOsoby,PartneriVerejnehoSektora
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
   *
   * Queries Partneri entity set with any() filter on nested
   * PartneriVerejnehoSektora collection, then expands KUV and OO.
   */
  async getKuv(ico: string): Promise<AdapterResult<CompanyKuvResult>> {
    const start = Date.now();
    try {
      // Validate ICO is pure digits to prevent OData injection
      if (!/^\d{1,8}$/.test(ico)) {
        return {
          found: false,
          error: `Invalid IČO format for RPVS query: ${ico}`,
          durationMs: Date.now() - start,
          source: SOURCE,
        };
      }

      const filter = encodeURIComponent(`PartneriVerejnehoSektora/any(p: p/Ico eq '${ico}')`);
      const expand = encodeURIComponent("KonecniUzivateliaVyhod,OpravneneOsoby,PartneriVerejnehoSektora");
      const url = `${RPVS_BASE_URL}/Partneri?$filter=${filter}&$expand=${expand}`;

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

      const partners = resp.data?.value ?? [];

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

      // Find the most recent active PVS entry matching this ICO
      const pvsEntries = (partner.PartneriVerejnehoSektora ?? [])
        .filter((pvs) => pvs.Ico === ico)
        .sort((a, b) => (b.PlatnostOd ?? "").localeCompare(a.PlatnostOd ?? ""));
      const latestPvs = pvsEntries[0];

      const result: CompanyKuvResult = {
        ico,
        found: true,
        partner: {
          id: partner.Id,
          obchodneMeno: latestPvs?.ObchodneMeno ?? ico,
          datumRegistracie: latestPvs?.PlatnostOd ?? null,
        },
        konecniUzivatelia: (partner.KonecniUzivateliaVyhod ?? []).map((kuv) => ({
          meno: kuv.Meno ?? null,
          priezvisko: kuv.Priezvisko ?? null,
          datumNarodenia: kuv.DatumNarodenia ?? null,
          jeVerejnyCinitel: kuv.JeVerejnyCinitel ?? false,
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
