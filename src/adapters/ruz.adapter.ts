/**
 * Adapter for RegisterUZ API (registeruz.sk/cruz-public/api).
 *
 * Verified against live API responses (2026-03-24).
 *
 * Quirks:
 * - `zmenene-od` is MANDATORY for search! Use `2000-01-01`
 * - Search returns only IDs, not full entities
 * - Entity contains `idUctovnychZavierok` (statement IDs)
 * - Statement contains `idUctovnychVykazov` (report IDs)
 * - Report has `obsah.tabulky` with flat string data arrays
 * - Attachments are on reports, not statements
 * - Templates define structure via `hlavicka` + `riadky`
 */

import { HttpClient } from "../utils/http-client.js";
import { LRUCache } from "../utils/cache.js";
import type { AdapterResult } from "../types/common.types.js";
import type {
  RuzSearchResponse,
  RuzEntityRaw,
  RuzStatementRaw,
  RuzReportRaw,
  RuzTemplateRaw,
  RuzUctovnaJednotka,
  RuzZavierkaSummary,
} from "../types/ruz.types.js";

const RUZ_BASE_URL = "https://www.registeruz.sk/cruz-public";
const SOURCE = "ruz";
const ZMENENE_OD = "2000-01-01";

// Template cache — templates rarely change, cache for 24h
const templateCache = new LRUCache<RuzTemplateRaw>(50, 86_400_000);

export class RuzAdapter {
  constructor(private readonly http: HttpClient) {}

  /** Search accounting entities by IČO → returns entity IDs. */
  async findEntity(ico: string): Promise<AdapterResult<number[]>> {
    const start = Date.now();
    try {
      const url =
        `${RUZ_BASE_URL}/api/uctovne-jednotky?zmenene-od=${ZMENENE_OD}&ico=${encodeURIComponent(ico)}`;
      const resp = await this.http.get<RuzSearchResponse>(url, { source: SOURCE });

      if (resp.status >= 400 || !resp.data) {
        return { found: false, data: [], durationMs: Date.now() - start, source: SOURCE };
      }

      const ids = resp.data.id ?? [];
      if (ids.length === 0) {
        return { found: false, data: [], durationMs: Date.now() - start, source: SOURCE };
      }

      return { found: true, data: ids, durationMs: Date.now() - start, source: SOURCE };
    } catch (err) {
      return {
        found: false,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - start,
        source: SOURCE,
      };
    }
  }

  /** Get entity detail by entity ID. */
  async getEntity(id: number): Promise<AdapterResult<RuzEntityRaw>> {
    const start = Date.now();
    try {
      const url = `${RUZ_BASE_URL}/api/uctovna-jednotka?id=${id}`;
      const resp = await this.http.get<RuzEntityRaw>(url, { source: SOURCE });

      if (resp.status >= 400 || !resp.data || !resp.data.id) {
        return { found: false, durationMs: Date.now() - start, source: SOURCE };
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

  /** Get single statement detail (contains report IDs). */
  async getStatement(id: number): Promise<AdapterResult<RuzStatementRaw>> {
    const start = Date.now();
    try {
      const url = `${RUZ_BASE_URL}/api/uctovna-zavierka?id=${id}`;
      const resp = await this.http.get<RuzStatementRaw>(url, { source: SOURCE });

      if (resp.status >= 400 || !resp.data || !resp.data.id) {
        return { found: false, durationMs: Date.now() - start, source: SOURCE };
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

  /** Get report with raw data tables and attachments. */
  async getReport(id: number): Promise<AdapterResult<RuzReportRaw>> {
    const start = Date.now();
    try {
      const url = `${RUZ_BASE_URL}/api/uctovny-vykaz?id=${id}`;
      const resp = await this.http.get<RuzReportRaw>(url, { source: SOURCE });

      if (resp.status >= 400 || !resp.data || !resp.data.id) {
        return { found: false, durationMs: Date.now() - start, source: SOURCE };
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

  /** Get template — CACHED. Maps row numbers to human-readable names. */
  async getTemplate(id: number): Promise<AdapterResult<RuzTemplateRaw>> {
    const start = Date.now();
    const cacheKey = `template_${id}`;

    const cached = templateCache.get(cacheKey);
    if (cached) {
      return { found: true, data: cached, durationMs: Date.now() - start, source: SOURCE };
    }

    try {
      const url = `${RUZ_BASE_URL}/api/sablona?id=${id}`;
      const resp = await this.http.get<RuzTemplateRaw>(url, { source: SOURCE });

      if (resp.status >= 400 || !resp.data || !resp.data.id) {
        return { found: false, durationMs: Date.now() - start, source: SOURCE };
      }

      templateCache.set(cacheKey, resp.data);
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

  /** Download binary PDF attachment → base64. */
  async getAttachment(id: number): Promise<AdapterResult<{ content: string; mimeType: string }>> {
    const start = Date.now();
    try {
      const url = `${RUZ_BASE_URL}/domain/financialreport/attachment/${id}`;
      const resp = await this.http.get<Buffer>(url, {
        source: SOURCE,
        raw: true,
        timeoutMs: 15_000,
      });

      if (resp.status >= 400) {
        return { found: false, durationMs: Date.now() - start, source: SOURCE };
      }

      const contentType = resp.headers["content-type"] ?? "application/pdf";
      // Validate binary response — reject HTML/JSON error pages
      if (contentType.includes("text/html") || contentType.includes("application/json")) {
        return { found: false, error: "Server vrátil neočakávaný content-type namiesto PDF", durationMs: Date.now() - start, source: SOURCE };
      }
      const base64 = (resp.data as Buffer).toString("base64");

      return {
        found: true,
        data: { content: base64, mimeType: contentType },
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

  /** Download generated PDF of a report → base64. */
  async getReportPdf(id: number): Promise<AdapterResult<{ content: string; mimeType: string }>> {
    const start = Date.now();
    try {
      const url = `${RUZ_BASE_URL}/domain/financialreport/pdf/${id}`;
      const resp = await this.http.get<Buffer>(url, {
        source: SOURCE,
        raw: true,
        timeoutMs: 15_000,
      });

      if (resp.status >= 400) {
        return { found: false, durationMs: Date.now() - start, source: SOURCE };
      }

      const contentType = resp.headers["content-type"] ?? "application/pdf";
      // Validate binary response — reject HTML/JSON error pages
      if (contentType.includes("text/html") || contentType.includes("application/json")) {
        return { found: false, error: "Server vrátil neočakávaný content-type namiesto PDF", durationMs: Date.now() - start, source: SOURCE };
      }
      const base64 = (resp.data as Buffer).toString("base64");

      return {
        found: true,
        data: { content: base64, mimeType: contentType },
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

  // --- Mapping helpers ---

  mapEntity(raw: RuzEntityRaw): RuzUctovnaJednotka {
    return {
      id: raw.id,
      ico: raw.ico,
      dic: raw.dic,
      nazov: raw.nazovUJ,
      pravnaForma: raw.pravnaForma,
      skNace: raw.skNace,
      velkost: raw.velkostOrganizacie,
    };
  }

  mapStatement(
    raw: RuzStatementRaw,
    reports: Array<{ id: number; idSablony: number | null; nazov: string | null; prilohy: RuzReportRaw["prilohy"] }>,
  ): RuzZavierkaSummary {
    return {
      id: raw.id,
      obdobieOd: raw.obdobieOd,
      obdobieDo: raw.obdobieDo,
      typ: raw.typ,
      datumPodania: raw.datumPodania,
      datumZostavenia: raw.datumZostavenia,
      vykazy: reports.map((r) => ({
        id: r.id,
        typ: r.nazov,
        idSablony: r.idSablony,
      })),
      prilohy: reports.flatMap((r) =>
        (r.prilohy ?? []).map((p) => ({
          id: p.id,
          nazov: p.meno,
          velkost: p.velkostPrilohy,
          strany: p.pocetStran ?? null,
        })),
      ),
    };
  }
}
