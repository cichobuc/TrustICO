/**
 * IČO Resolver — detects input type and resolves to IČO.
 *
 * Logic:
 * 1. /^\d{8}$/ → IČO → direct RPO search by identifier
 * 2. /^(SK)?\d{10}$/ → DIČ → FinSpr DPH search → extract IČO
 * 3. Otherwise → company name → RPO fullName search
 */

import { RpoAdapter } from "../adapters/rpo.adapter.js";
import { FinsprAdapter } from "../adapters/finspr.adapter.js";
import { HttpClient } from "../utils/http-client.js";
import type { CompanySearchResult } from "../types/rpo.types.js";

export type QueryType = "ico" | "dic" | "name";

export interface ResolverResult {
  queryType: QueryType;
  results: CompanySearchResult[];
  source: string;
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
  private readonly finspr: FinsprAdapter;

  constructor(http: HttpClient) {
    this.rpo = new RpoAdapter(http);
    this.finspr = new FinsprAdapter(http);
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
      source: "rpo",
      error: result.error,
      durationMs: Date.now() - start,
    };
  }

  private async resolveByDic(raw: string, start: number): Promise<ResolverResult> {
    // Strip SK prefix if present
    const dic = raw.toUpperCase().startsWith("SK") ? raw.slice(2) : raw;

    try {
      const dphResult = await this.finspr.getDphByDic(dic);

      if (!dphResult.found || !dphResult.data || dphResult.data.length === 0) {
        return {
          queryType: "dic",
          results: [],
          source: "finspr",
          error: "DIČ nebolo nájdené v registri DPH",
          durationMs: Date.now() - start,
        };
      }

      const record = dphResult.data[0];
      const ico = String(record.ico).padStart(8, "0");

      // Validate extracted IČO before RPO search
      if (!ICO_REGEX.test(ico)) {
        return {
          queryType: "dic",
          results: [],
          source: "finspr",
          error: `Neplatné IČO '${ico}' extrahované z registra DPH`,
          durationMs: Date.now() - start,
        };
      }

      // Now search RPO with this IČO for full data
      const rpoResult = await this.rpo.search(ico);
      return {
        queryType: "dic",
        results: rpoResult.data ?? [],
        source: "finspr+rpo",
        durationMs: Date.now() - start,
      };
    } catch (err) {
      return {
        queryType: "dic",
        results: [],
        source: "finspr",
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
      source: "rpo",
      error: result.error,
      durationMs: Date.now() - start,
    };
  }
}
