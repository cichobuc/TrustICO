/**
 * MCP tool: financial_report
 *
 * Detailný účtovný výkaz — všetky riadky s pomenovaním podľa šablóny.
 * Input: reportId (ID výkazu z company_financials).
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { HttpClient } from "../utils/http-client.js";
import { RuzAdapter } from "../adapters/ruz.adapter.js";
import { RuzPipeline } from "../orchestrator/ruz-pipeline.js";

const http = new HttpClient();
const adapter = new RuzAdapter(http);
const pipeline = new RuzPipeline(adapter);

export function registerFinancialReport(server: McpServer): void {
  server.tool(
    "financial_report",
    "Detailný účtovný výkaz — všetky riadky s pomenovaním podľa šablóny. Vstup: reportId z company_financials výsledku.",
    {
      reportId: z.number().describe("ID výkazu z company_financials (pole vykazy[].id)"),
    },
    async ({ reportId }) => {
      if (!reportId || reportId <= 0) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: JSON.stringify({ error: "reportId musí byť kladné číslo" }) }],
        };
      }

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
    },
  );
}
