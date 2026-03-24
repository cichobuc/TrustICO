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
 */

import { RuzAdapter } from "../adapters/ruz.adapter.js";
import { parseReport, extractKlucoveUkazovatele } from "../utils/ruz-parser.js";
import type {
  RuzStatementRaw,
  RuzReportRaw,
  RuzUctovnaJednotka,
  RuzZavierkaSummary,
  KlucoveUkazovatele,
  CompanyFinancialsResult,
  FinancialReportDetail,
  ParsedTable,
} from "../types/ruz.types.js";

export class RuzPipeline {
  constructor(private readonly adapter: RuzAdapter) {}

  /**
   * Full pipeline: IČO → entity → statements → reports → parsed data.
   * If `year` is provided, filters to statements matching that year.
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

    // Step 3: Fetch ALL statement details in parallel to sort by date
    // (IDs are NOT in chronological order)
    const stmtResults = await Promise.allSettled(
      statementIds.map((id) => this.adapter.getStatement(id)),
    );

    const allStatements: RuzStatementRaw[] = [];
    for (const r of stmtResults) {
      if (r.status === "fulfilled" && r.value.found && r.value.data) {
        allStatements.push(r.value.data);
      }
    }
    allStatements.sort((a, b) => (b.obdobieDo ?? "").localeCompare(a.obdobieDo ?? ""));

    // Filter by year if requested
    let filteredStatements = allStatements;
    if (year) {
      const yearStr = String(year);
      filteredStatements = allStatements.filter(
        (s) => s.obdobieDo?.startsWith(yearStr) || s.obdobieOd?.startsWith(yearStr),
      );
    }

    // Take top 5 (already sorted: latest first)
    const statementsToProcess = filteredStatements.slice(0, 5);
    const mappedStatements: RuzZavierkaSummary[] = [];

    for (const stmt of statementsToProcess) {
      // Step 4: Fetch report summaries for this statement
      const reportIds = stmt.idUctovnychVykazov ?? [];
      const reportSummaries: Array<{
        id: number;
        idSablony: number | null;
        nazov: string | null;
        prilohy: RuzReportRaw["prilohy"];
      }> = [];

      for (const reportId of reportIds) {
        const reportResult = await this.adapter.getReport(reportId);
        if (reportResult.found && reportResult.data) {
          const firstTableName = reportResult.data.obsah?.tabulky?.[0]?.nazov?.sk ?? null;
          reportSummaries.push({
            id: reportResult.data.id,
            idSablony: reportResult.data.idSablony,
            nazov: firstTableName,
            prilohy: reportResult.data.prilohy ?? [],
          });
        }
      }

      mappedStatements.push(this.adapter.mapStatement(stmt, reportSummaries));
    }

    // Step 5: Extract key indicators from the latest statement's report
    // Find a report that has BOTH a template AND actual data (obsah.tabulky)
    let klucoveUkazovatele = emptyUkazovatele();
    if (mappedStatements.length > 0) {
      const latestStatement = mappedStatements[0];
      // Prefer reports with a known typ (they have obsah.tabulky data)
      const reportWithData = latestStatement.vykazy.find(
        (v) => v.idSablony !== null && v.typ !== null,
      ) ?? latestStatement.vykazy.find((v) => v.idSablony !== null);

      if (reportWithData) {
        const parsedTables = await this.getReportParsed(
          reportWithData.id,
          reportWithData.idSablony!,
        );
        if (parsedTables && parsedTables.length > 0) {
          klucoveUkazovatele = extractKlucoveUkazovatele(parsedTables);
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

    // Step 2: Fetch template (cached)
    const templateResult = await this.adapter.getTemplate(idSablony);
    if (!templateResult.found || !templateResult.data) {
      return {
        success: false,
        error: templateResult.error ?? `Šablóna ${idSablony} nebola nájdená`,
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

  // --- Internal ---

  private async getReportParsed(
    reportId: number,
    templateId: number,
  ): Promise<ParsedTable[] | null> {
    const [reportResult, templateResult] = await Promise.all([
      this.adapter.getReport(reportId),
      this.adapter.getTemplate(templateId),
    ]);

    if (
      !reportResult.found || !reportResult.data ||
      !templateResult.found || !templateResult.data
    ) {
      return null;
    }

    return parseReport(reportResult.data, templateResult.data);
  }
}

function emptyUkazovatele(): KlucoveUkazovatele {
  return {
    aktivaCelkom: null,
    neobeznyMajetok: null,
    obeznyMajetok: null,
    vlastneImanie: null,
    zavazky: null,
    trzby: null,
    vysledokHospodarenia: null,
  };
}
