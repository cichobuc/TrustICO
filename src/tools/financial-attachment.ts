/**
 * MCP tools: financial_attachment + financial_report_pdf
 *
 * financial_attachment: Download PDF attachment (poznámky, skeny) from RegisterUZ.
 * financial_report_pdf: Download generated PDF of a report from RegisterUZ.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { sharedRuzAdapter as adapter } from "./_shared-clients.js";

export function registerFinancialAttachment(server: McpServer): void {
  // --- financial_attachment ---
  server.tool(
    "financial_attachment",
    "Stiahne PDF prílohu (poznámky k závierke, skeny) z RegisterUZ. Vstup: attachmentId z company_financials.",
    {
      attachmentId: z.number().int().positive().describe("ID prílohy z company_financials (pole prilohy[].id)"),
      nazov: z.string().optional().describe("Názov prílohy (z company_financials prilohy[].nazov)"),
      velkost: z.number().optional().describe("Veľkosť prílohy v bytoch (z company_financials prilohy[].velkost)"),
    },
    async ({ attachmentId, nazov, velkost }) => {
      const start = Date.now();

      try {
        const result = await adapter.getAttachment(attachmentId);

        if (!result.found || !result.data) {
          return {
            isError: true,
            content: [{
              type: "text" as const,
              text: JSON.stringify({
                error: result.error ?? `Príloha ${attachmentId} nebola nájdená`,
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
              attachmentId,
              nazov: nazov ?? null,
              mimeType: result.data.mimeType,
              velkost: velkost ?? null,
              content: result.data.content,
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
              error: err instanceof Error ? err.message : "Neočakávaná chyba pri sťahovaní prílohy",
              _meta: { source: "ruz", durationMs: Date.now() - start, timestamp: new Date().toISOString() },
            }, null, 2),
          }],
        };
      }
    },
  );

  // --- financial_report_pdf ---
  server.tool(
    "financial_report_pdf",
    "Generovaný PDF účtovného výkazu z RegisterUZ. Vstup: reportId z company_financials.",
    {
      reportId: z.number().int().positive().describe("ID výkazu z company_financials (pole vykazy[].id)"),
    },
    async ({ reportId }) => {
      const start = Date.now();

      try {
        const result = await adapter.getReportPdf(reportId);

        if (!result.found || !result.data) {
          return {
            isError: true,
            content: [{
              type: "text" as const,
              text: JSON.stringify({
                error: result.error ?? `PDF pre výkaz ${reportId} nebolo nájdené`,
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
              reportId,
              mimeType: result.data.mimeType,
              content: result.data.content,
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
              error: err instanceof Error ? err.message : "Neočakávaná chyba pri generovaní PDF",
              _meta: { source: "ruz", durationMs: Date.now() - start, timestamp: new Date().toISOString() },
            }, null, 2),
          }],
        };
      }
    },
  );
}
