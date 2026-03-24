/**
 * MCP tool: financial_report
 *
 * Detailný účtovný výkaz — všetky riadky s pomenovaním podľa šablóny.
 * Input: reportId (ID výkazu z company_financials).
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { sharedRuzPipeline as pipeline } from "./_shared-clients.js";

export function registerFinancialReport(server: McpServer): void {
  server.tool(
    "financial_report_detail",
    "Detailný účtovný výkaz — všetky riadky s pomenovaním podľa šablóny. Vstup: reportId z company_financials výsledku.",
    {
      reportId: z.number().int().positive().describe("ID výkazu z company_financials (pole vykazy[].id)"),
    },
    async ({ reportId }) => {
      const start = Date.now();

      try {
        const result = await pipeline.getReportDetail(reportId);

        if (!result.success || !result.data) {
          return {
            isError: true,
            content: [{
              type: "text" as const,
              text: JSON.stringify({
                error: result.error ?? "Nepodarilo sa získať výkaz",
                _meta: {
                  source: "ruz",
                  durationMs: result.durationMs,
                  timestamp: new Date().toISOString(),
                },
              }, null, 2),
            }],
          };
        }

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              ...result.data,
              _meta: {
                source: "ruz",
                durationMs: result.durationMs,
                timestamp: new Date().toISOString(),
              },
            }, null, 2),
          }],
        };
      } catch (err) {
        return {
          isError: true,
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              error: err instanceof Error ? err.message : "Neočakávaná chyba pri získavaní výkazu",
              _meta: { source: "ruz", durationMs: Date.now() - start, timestamp: new Date().toISOString() },
            }, null, 2),
          }],
        };
      }
    },
  );
}
