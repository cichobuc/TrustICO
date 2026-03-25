/**
 * MCP tools: financial_attachment + financial_report_pdf
 *
 * Both tools return 3 content blocks:
 *   [0] TextContent  — metadata JSON
 *   [1] TextContent  — extracted text from PDF (or error message)
 *   [2] EmbeddedResource — raw PDF blob for native viewing
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { sharedRuzAdapter as adapter } from "./_shared-clients.js";
import { extractTextFromPdf, type PdfExtractResult } from "../utils/pdf-extract.js";

function metaJson(source: string, durationMs: number, extra?: Record<string, unknown>) {
  return JSON.stringify({
    ...extra,
    _meta: { source, durationMs, timestamp: new Date().toISOString() },
  }, null, 2);
}

function buildTextBlock(extract: PdfExtractResult): { type: "text"; text: string } {
  if (!extract.text) {
    return {
      type: "text" as const,
      text: `[PDF text extraction]\n${extract.error ?? "Žiadny text v PDF"}`,
    };
  }

  const methodLabel = extract.method === "ocr" ? "OCR rozpoznávanie" : "extrakcia textu";
  const parts: string[] = [`[${methodLabel} — ${extract.pages} strán`];
  if (extract.truncated) {
    parts.push(`, skrátené na 50 000 z ${extract.totalTextLength} znakov`);
  }
  if (extract.error) {
    parts.push(` — poznámka: ${extract.error}`);
  }
  parts.push("]\n\n");
  parts.push(extract.text);

  return { type: "text" as const, text: parts.join("") };
}

function errorResponse(source: string, durationMs: number, error: string) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: metaJson(source, durationMs, { error }) }],
  };
}

export function registerFinancialAttachment(server: McpServer): void {
  // --- financial_attachment ---
  server.tool(
    "financial_attachment",
    "Stiahne PDF prílohu (poznámky k závierke, skeny) z RegisterUZ. Vráti extrahovaný text aj samotné PDF. Vstup: attachmentId z company_financials.",
    {
      attachmentId: z.number().int().positive().describe("ID prílohy z company_financials (pole prilohy[].id)"),
      nazov: z.string().optional().describe("Názov prílohy (z company_financials prilohy[].nazov)"),
      velkost: z.number().optional().describe("Veľkosť prílohy v bytoch (z company_financials prilohy[].velkost)"),
    },
    async ({ attachmentId, nazov, velkost }) => {
      const start = Date.now();
      const MAX_SIZE_BYTES = 10 * 1024 * 1024;

      if (velkost && velkost > MAX_SIZE_BYTES) {
        return errorResponse("ruz", Date.now() - start,
          `Príloha je príliš veľká (${Math.round(velkost / 1024 / 1024)}MB). Maximum je 10MB.`);
      }

      try {
        const result = await adapter.getAttachment(attachmentId);

        if (!result.found || !result.data) {
          return errorResponse("ruz", result.durationMs,
            result.error ?? `Príloha ${attachmentId} nebola nájdená`);
        }

        // Server-side size check on actual downloaded content (don't trust client-supplied velkost)
        const actualBytes = Math.ceil(result.data.content.length * 3 / 4); // base64 → binary size estimate
        if (actualBytes > MAX_SIZE_BYTES) {
          return errorResponse("ruz", Date.now() - start,
            `Stiahnutá príloha je príliš veľká (${Math.round(actualBytes / 1024 / 1024)}MB). Maximum je 10MB.`);
        }

        const isPdf = result.data.mimeType.includes("pdf");

        // Extract text from PDF (skip for non-PDF attachments)
        const extract = isPdf
          ? await extractTextFromPdf(result.data.content)
          : { text: "", pages: 0, truncated: false, totalTextLength: 0, method: "none" as const, error: "Príloha nie je PDF — extrakcia textu nie je dostupná" };

        return {
          content: [
            {
              type: "text" as const,
              text: metaJson("ruz", Date.now() - start, {
                attachmentId,
                nazov: nazov ?? null,
                mimeType: result.data.mimeType,
                velkost: velkost ?? null,
                textExtraction: {
                  method: extract.method,
                  pages: extract.pages,
                  truncated: extract.truncated,
                  totalTextLength: extract.totalTextLength,
                  ...(extract.error ? { error: extract.error } : {}),
                },
              }),
            },
            buildTextBlock(extract),
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
        return errorResponse("ruz", Date.now() - start,
          err instanceof Error ? err.message : "Neočakávaná chyba pri sťahovaní prílohy");
      }
    },
  );

  // --- financial_report_pdf ---
  server.tool(
    "financial_report_pdf",
    "Generovaný PDF účtovného výkazu z RegisterUZ. Vráti extrahovaný text aj samotné PDF. Vstup: reportId z company_financials.",
    {
      reportId: z.number().int().positive().describe("ID výkazu z company_financials (pole vykazy[].id)"),
    },
    async ({ reportId }) => {
      const start = Date.now();

      try {
        const result = await adapter.getReportPdf(reportId);

        if (!result.found || !result.data) {
          return errorResponse("ruz", result.durationMs,
            result.error ?? `PDF pre výkaz ${reportId} nebolo nájdené`);
        }

        // Extract text
        const extract = await extractTextFromPdf(result.data.content);

        return {
          content: [
            {
              type: "text" as const,
              text: metaJson("ruz", Date.now() - start, {
                reportId,
                mimeType: result.data.mimeType,
                textExtraction: {
                  method: extract.method,
                  pages: extract.pages,
                  truncated: extract.truncated,
                  totalTextLength: extract.totalTextLength,
                  ...(extract.error ? { error: extract.error } : {}),
                },
              }),
            },
            buildTextBlock(extract),
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
        return errorResponse("ruz", Date.now() - start,
          err instanceof Error ? err.message : "Neočakávaná chyba pri generovaní PDF");
      }
    },
  );
}
