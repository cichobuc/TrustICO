/**
 * MCP tools: financial_attachment + financial_report_pdf
 *
 * financial_attachment: Download PDF attachment (poznámky, skeny) from RegisterUZ.
 * financial_report_pdf: Download generated PDF of a report from RegisterUZ.
 *
 * Both tools return PDF as an MCP embedded resource (type: "resource" with blob)
 * so that LLM clients can natively read the PDF content.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { sharedRuzAdapter as adapter } from "./_shared-clients.js";

function metaText(source: string, durationMs: number, extra?: Record<string, unknown>) {
  return JSON.stringify({
    ...extra,
    _meta: { source, durationMs, timestamp: new Date().toISOString() },
  }, null, 2);
}

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
      const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

      if (velkost && velkost > MAX_SIZE_BYTES) {
        return {
          isError: true,
          content: [{
            type: "text" as const,
            text: metaText("ruz", Date.now() - start, {
              error: `Príloha je príliš veľká (${Math.round(velkost / 1024 / 1024)}MB). Maximum je 10MB.`,
            }),
          }],
        };
      }

      try {
        const result = await adapter.getAttachment(attachmentId);

        if (!result.found || !result.data) {
          return {
            isError: true,
            content: [{
              type: "text" as const,
              text: metaText("ruz", result.durationMs, {
                error: result.error ?? `Príloha ${attachmentId} nebola nájdená`,
              }),
            }],
          };
        }

        return {
          content: [
            {
              type: "text" as const,
              text: metaText("ruz", result.durationMs, {
                attachmentId,
                nazov: nazov ?? null,
                mimeType: result.data.mimeType,
                velkost: velkost ?? null,
              }),
            },
            {
              type: "resource" as const,
              resource: {
                uri: `ruz://attachment/${attachmentId}`,
                mimeType: result.data.mimeType,
                blob: result.data.content,
              },
            },
          ],
        };
      } catch (err) {
        return {
          isError: true,
          content: [{
            type: "text" as const,
            text: metaText("ruz", Date.now() - start, {
              error: err instanceof Error ? err.message : "Neočakávaná chyba pri sťahovaní prílohy",
            }),
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
              text: metaText("ruz", result.durationMs, {
                error: result.error ?? `PDF pre výkaz ${reportId} nebolo nájdené`,
              }),
            }],
          };
        }

        return {
          content: [
            {
              type: "text" as const,
              text: metaText("ruz", result.durationMs, { reportId, mimeType: result.data.mimeType }),
            },
            {
              type: "resource" as const,
              resource: {
                uri: `ruz://report-pdf/${reportId}`,
                mimeType: result.data.mimeType,
                blob: result.data.content,
              },
            },
          ],
        };
      } catch (err) {
        return {
          isError: true,
          content: [{
            type: "text" as const,
            text: metaText("ruz", Date.now() - start, {
              error: err instanceof Error ? err.message : "Neočakávaná chyba pri generovaní PDF",
            }),
          }],
        };
      }
    },
  );
}
