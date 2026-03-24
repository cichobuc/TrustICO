/**
 * IČO Resolver — detects input type and resolves to IČO.
 *
 * Logic:
 * 1. /^\d{8}$/ → IČO → direct RPO search by identifier
 * 2. /^(SK)?\d{10}$/ → DIČ → FinSpr DPH search → extract IČO
 * 3. Otherwise → company name → RPO fullName search
 */

import { RpoAdapter } from "../adapters/rpo.adapter.js";
import { HttpClient } from "../utils/http-client.js";
import type { CompanySearchResult } from "../types/rpo.types.js";

export type QueryType = "ico" | "dic" | "name";

export interface ResolverResult {
  queryType: QueryType;
  results: CompanySearchResult[];
  error?: string;
  durationMs: number;
}

const ICO_REGEX = /^\d{8}$/;
const DIC_REGEX = /^(SK)?\d{10}$/i;

export function detectQueryType(query: string): QueryType {
  const trimmed = query.trim();
  if (ICO_REGEX.test(trimmed)) return "ico";
  if (DIC_REGEX.test(trimmed)) return "dic";
  return "name";
}

export class IcoResolver {
  private readonly rpo: RpoAdapter;
  private readonly http: HttpClient;

  constructor(http: HttpClient) {
    this.http = http;
    this.rpo = new RpoAdapter(http);
  }

  get rpoAdapter(): RpoAdapter {
    return this.rpo;
  }

  async resolve(query: string): Promise<ResolverResult> {
    const start = Date.now();
    const trimmed = query.trim();
    const queryType = detectQueryType(trimmed);

    switch (queryType) {
      case "ico":
        return this.resolveByIco(trimmed, start);
      case "dic":
        return this.resolveByDic(trimmed, start);
      case "name":
        return this.resolveByName(trimmed, start);
    }
  }

  private async resolveByIco(ico: string, start: number): Promise<ResolverResult> {
    const result = await this.rpo.search(ico);
    return {
      queryType: "ico",
      results: result.data ?? [],
      error: result.error,
      durationMs: Date.now() - start,
    };
  }

  private async resolveByDic(raw: string, start: number): Promise<ResolverResult> {
    // Strip SK prefix if present
    const dic = raw.toUpperCase().startsWith("SK") ? raw.slice(2) : raw;

    // Try FinSpr DPH registry to find IČO from DIČ
    try {
      const apiKey = process.env.FINSPR_API_KEY;
      if (!apiKey) {
        // Fallback: search RPO by DIČ digits (won't match well, but try)
        return this.resolveByName(dic, start);
      }

      const url =
        `https://iz.opendata.financnasprava.sk/api/data/ds_dphs/search?column=dic&search=${encodeURIComponent(dic)}&page=1`;
      const resp = await this.http.get<FinSprDphResponse>(url, {
        headers: { key: apiKey },
        source: "finspr",
      });

      if (resp.status === 200 && resp.data?.records?.length > 0) {
        const record = resp.data.records[0];
        const ico = String(record.ico).padStart(8, "0");

        // Now search RPO with this IČO for full data
        const rpoResult = await this.rpo.search(ico);
        return {
          queryType: "dic",
          results: rpoResult.data ?? [],
          durationMs: Date.now() - start,
        };
      }

      return {
        queryType: "dic",
        results: [],
        error: "DIČ nebolo nájdené v registri DPH",
        durationMs: Date.now() - start,
      };
    } catch (err) {
      return {
        queryType: "dic",
        results: [],
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - start,
      };
    }
  }

  private async resolveByName(name: string, start: number): Promise<ResolverResult> {
    const result = await this.rpo.searchByName(name);
    return {
      queryType: "name",
      results: result.data ?? [],
      error: result.error,
      durationMs: Date.now() - start,
    };
  }
}

// FinSpr DPH response shape (minimal)
interface FinSprDphResponse {
  records: Array<{
    ico: number | string;
    dic: string;
    nazov: string;
    [key: string]: unknown;
  }>;
}
