/**
 * Adapter for Finančná správa SR API (iz.opendata.financnasprava.sk/api).
 *
 * Quirks (verified 2026-03-24):
 * - Requires API key in header `key`
 * - Search min 5 chars (IČO = 8 → OK)
 * - Slugs: ds_dphs (DPH), ds_dsdd (dlžníci), ds_dphz (zrušenie), ds_dphv (vymazanie), ds_ids (index)
 * - Endpoint: /api/data/{slug}/search?column=ico&search={ico}&page=1
 */

import { HttpClient } from "../utils/http-client.js";
import type { AdapterResult } from "../types/common.types.js";
import type {
  FinsprSearchResponse,
  FinsprDphRow,
  FinsprDlznikRow,
  FinsprDphZrusenieRow,
  FinsprDphVymazanieRow,
  FinsprIndexRow,
  CompanyTaxStatusResult,
  FinsprSubStatus,
} from "../types/finspr.types.js";
import { FINSPR_SLUGS } from "../types/finspr.types.js";

const FINSPR_BASE_URL = "https://iz.opendata.financnasprava.sk/api";
const SOURCE = "finspr";

export class FinsprAdapter {
  private readonly apiKey: string;

  constructor(
    private readonly http: HttpClient,
    apiKey?: string,
  ) {
    this.apiKey = apiKey ?? process.env.FINSPR_API_KEY ?? "";
  }

  /**
   * Generic search in a FinSpr dataset.
   */
  private async search<T>(
    slug: string,
    column: string,
    value: string,
  ): Promise<AdapterResult<T[]>> {
    const start = Date.now();

    if (!this.apiKey) {
      return {
        found: false,
        error: "FINSPR_API_KEY is not configured",
        durationMs: Date.now() - start,
        source: SOURCE,
      };
    }

    try {
      const url =
        `${FINSPR_BASE_URL}/data/${slug}/search?column=${encodeURIComponent(column)}&search=${encodeURIComponent(value)}&page=1`;

      const resp = await this.http.get<FinsprSearchResponse>(url, {
        source: SOURCE,
        headers: { key: this.apiKey },
      });

      if (resp.status >= 400) {
        return {
          found: false,
          error: `FinSpr API error: HTTP ${resp.status}`,
          durationMs: Date.now() - start,
          source: SOURCE,
        };
      }

      const data = resp.data;
      const rows = (data?.results ?? []) as T[];

      return {
        found: rows.length > 0,
        data: rows,
        durationMs: Date.now() - start,
        source: SOURCE,
      };
    } catch (err) {
      return {
        found: false,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - start,
        source: SOURCE,
      };
    }
  }

  /** DPH registration search by IČO. */
  async getDph(ico: string): Promise<AdapterResult<FinsprDphRow[]>> {
    return this.search<FinsprDphRow>(FINSPR_SLUGS.DPH, "ico", ico);
  }

  /** DPH registration search by DIČ — used by resolver to find IČO from DIČ. */
  async getDphByDic(dic: string): Promise<AdapterResult<FinsprDphRow[]>> {
    return this.search<FinsprDphRow>(FINSPR_SLUGS.DPH, "dic", dic);
  }

  /** Tax debtors search by IČO. */
  async getDlznici(ico: string): Promise<AdapterResult<FinsprDlznikRow[]>> {
    return this.search<FinsprDlznikRow>(FINSPR_SLUGS.DLZNICI, "ico", ico);
  }

  /** DPH cancellation search by IČO. */
  async getDphZrusenie(ico: string): Promise<AdapterResult<FinsprDphZrusenieRow[]>> {
    return this.search<FinsprDphZrusenieRow>(FINSPR_SLUGS.DPH_ZRUSENIE, "ico", ico);
  }

  /** DPH removal search by IČO. */
  async getDphVymazanie(ico: string): Promise<AdapterResult<FinsprDphVymazanieRow[]>> {
    return this.search<FinsprDphVymazanieRow>(FINSPR_SLUGS.DPH_VYMAZANIE, "ico", ico);
  }

  /** Reliability index search by IČO. */
  async getIndex(ico: string): Promise<AdapterResult<FinsprIndexRow[]>> {
    return this.search<FinsprIndexRow>(FINSPR_SLUGS.INDEX, "ico", ico);
  }

  /**
   * Aggregate all FinSpr data sources into a single tax status.
   * Uses Promise.allSettled for graceful degradation.
   */
  async getTaxStatus(ico: string): Promise<AdapterResult<CompanyTaxStatusResult>> {
    const start = Date.now();

    const [dphResult, dlzniciResult, zrusenieResult, vymazanieResult, indexResult] =
      await Promise.allSettled([
        this.getDph(ico),
        this.getDlznici(ico),
        this.getDphZrusenie(ico),
        this.getDphVymazanie(ico),
        this.getIndex(ico),
      ]);

    // Extract results with sub-status tracking
    const dph = unwrapResult(dphResult);
    const dlznici = unwrapResult(dlzniciResult);
    const zrusenie = unwrapResult(zrusenieResult);
    const vymazanie = unwrapResult(vymazanieResult);
    const index = unwrapResult(indexResult);

    // Build zdrojeStatus (TOOLS-SPEC names, not internal slug names)
    const zdrojeStatus: Record<string, FinsprSubStatus> = {
      dph_registracia: toSubStatus(dph),
      dph_vymazani: toSubStatus(vymazanie),
      dph_zrusenie: toSubStatus(zrusenie),
      index_spolahlivosti: toSubStatus(index),
      danovi_dlznici: toSubStatus(dlznici),
    };

    // DPH registration
    const dphRow = dph?.data?.[0] as FinsprDphRow | undefined;
    const zrusenieRow = zrusenie?.data?.[0] as FinsprDphZrusenieRow | undefined;
    const vymazanieRow = vymazanie?.data?.[0] as FinsprDphVymazanieRow | undefined;

    // Reliability index
    const indexRow = index?.data?.[0] as FinsprIndexRow | undefined;

    // Tax debtor
    const dlznikRows = dlznici?.data ?? [];

    const result: CompanyTaxStatusResult = {
      ico,
      dph: {
        registrovany: !!dphRow,
        icDph: dphRow?.ic_dph ?? null,
        paragraf: dphRow?.paragraf ?? null,
        datumRegistracie: dphRow?.datum_registracie ?? null,
        vymazany: !!vymazanieRow,
        dovodyZrusenia: zrusenieRow?.dovod_zrusenia ?? null,
      },
      indexSpolahlivosti: indexRow?.index_danovej_spolahlivosti ?? null,
      danovyDlznik: dlznikRows.length > 0,
      zdrojeStatus,
    };

    return {
      found: true,
      data: result,
      durationMs: Date.now() - start,
      source: SOURCE,
    };
  }
}

// --- Helpers ---

/** Unwrap Promise.allSettled result, returning null on rejection. */
function unwrapResult<T>(
  settled: PromiseSettledResult<AdapterResult<T[]>>,
): AdapterResult<T[]> | null {
  if (settled.status === "fulfilled") return settled.value;
  return null;
}

/** Convert an AdapterResult into a FinsprSubStatus for zdrojeStatus. */
function toSubStatus<T>(result: AdapterResult<T[]> | null): FinsprSubStatus {
  if (!result) return { status: "error", durationMs: 0, error: "Promise rejected" };
  if (result.error) return { status: "error", durationMs: result.durationMs, error: result.error };
  if (!result.found) return { status: "not_found", durationMs: result.durationMs };
  return { status: "ok", durationMs: result.durationMs };
}
