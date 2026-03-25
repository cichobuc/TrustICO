/**
 * RUZ Pipeline — IČO → entity → statements → reports → parsed data.
 *
 * Workflow (verified against live API):
 * 1. findEntity(ico) → entity IDs
 * 2. getEntity(id) → entity detail (includes idUctovnychZavierok)
 * 3. getStatement(id) → statement detail (includes idUctovnychVykazov)
 * 4. getReport(id) → report with obsah.tabulky + prilohy
 * 5. getTemplate(id) → template for parsing
 * 6. parseReport → named rows with columns
 *
 * Error handling on every step — graceful degradation.
 * Entire pipeline is wrapped in a hard 25s timeout via Promise.race.
 */

import { RuzAdapter } from "../adapters/ruz.adapter.js";
import { parseReport, extractKlucoveUkazovatele } from "../utils/ruz-parser.js";
import type {
  RuzStatementRaw,
  RuzReportRaw,
  RuzUctovnaJednotka,
  RuzZavierkaSummary,
  KlucoveUkazovatele,
  ParsedTable,
  CompanyFinancialsResult,
  FinancialReportDetail,
} from "../types/ruz.types.js";

const PIPELINE_TIMEOUT_MS = 25_000; // 25s hard timeout for entire pipeline
const MAX_STMT_FETCH = 10; // Max statements to fetch (newest IDs)
const MAX_REPORT_FETCH = 15; // Max reports to fetch across all statements
const MAX_STATEMENTS = 5; // Max statements in output

export class RuzPipeline {
  constructor(private readonly adapter: RuzAdapter) {}

  /**
   * Full pipeline: IČO → entity → statements → reports → parsed data.
   * If `year` is provided, filters to statements matching that year.
   * Wrapped in a hard timeout — always returns within PIPELINE_TIMEOUT_MS.
   */
  async getFinancials(
    ico: string,
    year?: number,
  ): Promise<{
    success: boolean;
    data?: CompanyFinancialsResult;
    error?: string;
    durationMs: number;
  }> {
    const start = Date.now();

    // Hard timeout via Promise.race — ensures we ALWAYS respond
    let timer: ReturnType<typeof setTimeout>;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`Pipeline timeout po ${PIPELINE_TIMEOUT_MS / 1000}s`)),
        PIPELINE_TIMEOUT_MS,
      );
    });

    try {
      const result = await Promise.race([
        this._getFinancialsInner(ico, year, start),
        timeoutPromise,
      ]);
      return result;
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - start,
      };
    } finally {
      clearTimeout(timer!);
    }
  }

  /** Inner pipeline logic — separated so Promise.race can wrap it. */
  private async _getFinancialsInner(
    ico: string,
    year: number | undefined,
    start: number,
  ): Promise<{
    success: boolean;
    data?: CompanyFinancialsResult;
    error?: string;
    durationMs: number;
  }> {
    // Step 1: Search by IČO → entity IDs
    const searchResult = await this.adapter.findEntity(ico);
    if (!searchResult.found || !searchResult.data || searchResult.data.length === 0) {
      return {
        success: false,
        error: searchResult.error ?? `Účtovná jednotka s IČO ${ico} nebola nájdená v RegisterUZ`,
        durationMs: Date.now() - start,
      };
    }

    // Step 2: Get entity detail
    const entityId = searchResult.data[0];
    const entityResult = await this.adapter.getEntity(entityId);
    if (!entityResult.found || !entityResult.data) {
      return {
        success: false,
        error: entityResult.error ?? `Nepodarilo sa načítať účtovnú jednotku ${entityId}`,
        durationMs: Date.now() - start,
      };
    }

    const entity: RuzUctovnaJednotka = this.adapter.mapEntity(entityResult.data);
    const statementIds = entityResult.data.idUctovnychZavierok ?? [];

    if (statementIds.length === 0) {
      return {
        success: true,
        data: {
          uctovnaJednotka: entity,
          zavierky: [],
          klucoveUkazovatele: emptyUkazovatele(),
        },
        durationMs: Date.now() - start,
      };
    }

    // Step 3: Fetch statement details in parallel to sort by date.
    // Limit fetches to avoid rate-limiter bottleneck for entities with many závierky.
    // Higher IDs generally correspond to newer statements, so take the last N IDs.
    const idsToFetch = statementIds.length > MAX_STMT_FETCH
      ? statementIds.slice(-MAX_STMT_FETCH)
      : statementIds;

    const stmtResults = await Promise.allSettled(
      idsToFetch.map((id) => this.adapter.getStatement(id)),
    );

    const allStatements: RuzStatementRaw[] = [];
    for (const r of stmtResults) {
      if (r.status === "fulfilled" && r.value.found && r.value.data) {
        allStatements.push(r.value.data);
      }
    }
    allStatements.sort((a, b) => (b.obdobieDo ?? "").localeCompare(a.obdobieDo ?? ""));

    // Filter by year if requested (exact 4-digit year match)
    let filteredStatements = allStatements;
    if (year != null) {
      const yearStr = String(year);
      filteredStatements = allStatements.filter((s) => {
        const endYear = s.obdobieDo?.substring(0, 4);
        const startYear = s.obdobieOd?.substring(0, 4);
        return endYear === yearStr || startYear === yearStr;
      });
    }

    // Take top N (already sorted: latest first)
    const statementsToProcess = filteredStatements.slice(0, MAX_STATEMENTS);

    // Step 4: Fetch reports for statements in parallel.
    // CAP total report fetches to prevent rate-limiter exhaustion.
    const allReportIds = statementsToProcess.flatMap((stmt) =>
      (stmt.idUctovnychVykazov ?? []),
    );
    const reportIdsToFetch = allReportIds.slice(0, MAX_REPORT_FETCH);
    const reportCache = new Map<number, RuzReportRaw>();

    if (reportIdsToFetch.length > 0) {
      const reportResults = await Promise.allSettled(
        reportIdsToFetch.map((id) => this.adapter.getReport(id)),
      );
      for (let i = 0; i < reportResults.length; i++) {
        const r = reportResults[i];
        if (r.status === "fulfilled" && r.value.found && r.value.data) {
          reportCache.set(reportIdsToFetch[i], r.value.data);
        }
      }
    }

    // Map statements using cached reports
    const mappedStatements: RuzZavierkaSummary[] = [];
    for (const stmt of statementsToProcess) {
      const reportIds = stmt.idUctovnychVykazov ?? [];
      const reportSummaries: Array<{
        id: number;
        idSablony: number | null;
        nazov: string | null;
        prilohy: RuzReportRaw["prilohy"];
      }> = [];

      for (const reportId of reportIds) {
        const report = reportCache.get(reportId);
        if (report) {
          const firstTableName = report.obsah?.tabulky?.[0]?.nazov?.sk ?? null;
          reportSummaries.push({
            id: report.id,
            idSablony: report.idSablony,
            nazov: firstTableName,
            prilohy: report.prilohy ?? [],
          });
        }
      }

      mappedStatements.push(this.adapter.mapStatement(stmt, reportSummaries));
    }

    // Step 5: Extract key indicators from ALL reports in the latest statement.
    // A závierka typically has multiple výkazy (Súvaha aktíva, Súvaha pasíva, VZaS),
    // each with a different template. Parse ALL to get complete indicators.
    let klucoveUkazovatele = emptyUkazovatele();
    if (mappedStatements.length > 0) {
      const latestStatement = mappedStatements[0];
      const reportsWithTemplates = latestStatement.vykazy.filter(
        (v) => v.idSablony != null,
      );

      if (reportsWithTemplates.length > 0) {
        // Fetch all templates in parallel (cached — no duplicate fetches)
        const templateResults = await Promise.allSettled(
          reportsWithTemplates.map((v) => this.adapter.getTemplate(v.idSablony!)),
        );

        // Parse each report with its template, collect all parsed tables
        const allParsedTables: ParsedTable[] = [];
        for (let i = 0; i < reportsWithTemplates.length; i++) {
          const tr = templateResults[i];
          if (tr.status === "fulfilled" && tr.value.found && tr.value.data) {
            const cachedReport = reportCache.get(reportsWithTemplates[i].id);
            if (cachedReport) {
              const parsed = parseReport(cachedReport, tr.value.data);
              allParsedTables.push(...parsed);
            }
          }
        }

        if (allParsedTables.length > 0) {
          klucoveUkazovatele = extractKlucoveUkazovatele(allParsedTables);
        }
      }
    }

    return {
      success: true,
      data: {
        uctovnaJednotka: entity,
        zavierky: mappedStatements,
        klucoveUkazovatele,
      },
      durationMs: Date.now() - start,
    };
  }

  /**
   * Get full parsed report detail: report + template → named tables.
   */
  async getReportDetail(
    reportId: number,
  ): Promise<{
    success: boolean;
    data?: FinancialReportDetail;
    error?: string;
    durationMs: number;
  }> {
    const start = Date.now();

    // Step 1: Fetch the report
    const reportResult = await this.adapter.getReport(reportId);
    if (!reportResult.found || !reportResult.data) {
      return {
        success: false,
        error: reportResult.error ?? `Výkaz ${reportId} nebol nájdený`,
        durationMs: Date.now() - start,
      };
    }

    const report = reportResult.data;
    const idSablony = report.idSablony;

    // Map attachments
    const prilohy = (report.prilohy ?? []).map((p) => ({
      id: p.id,
      nazov: p.meno,
      velkost: p.velkostPrilohy,
      strany: p.pocetStran ?? null,
    }));

    // No template or no data → return metadata only
    if (!idSablony || !report.obsah?.tabulky?.length) {
      return {
        success: true,
        data: {
          reportId,
          idSablony,
          nazovSablony: null,
          tabulky: [],
          prilohy,
        },
        durationMs: Date.now() - start,
      };
    }

    // Step 2: Fetch template (cached) — graceful degradation if unavailable
    const templateResult = await this.adapter.getTemplate(idSablony);
    if (!templateResult.found || !templateResult.data) {
      return {
        success: true,
        data: {
          reportId,
          idSablony,
          nazovSablony: null,
          tabulky: [],
          prilohy,
        },
        durationMs: Date.now() - start,
      };
    }

    const template = templateResult.data;

    // Step 3: Parse report using template
    const tabulky = parseReport(report, template);

    return {
      success: true,
      data: {
        reportId,
        idSablony,
        nazovSablony: template.nazov,
        tabulky,
        prilohy,
      },
      durationMs: Date.now() - start,
    };
  }

}

function emptyUkazovatele(): KlucoveUkazovatele {
  return {
    aktivaCelkom: null,
    neobeznyMajetok: null,
    obeznyMajetok: null,
    vlastneImanie: null,
    zavazky: null,
    kratkodobeZavazky: null,
    trzby: null,
    vysledokHospodarenia: null,
    zadlzenost: null,
    roa: null,
    roe: null,
    currentRatio: null,
  };
}
