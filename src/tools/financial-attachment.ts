/**
 * MCP tools: financial_attachment + financial_report_pdf
 *
 * financial_attachment: Download PDF attachment (poznámky, skeny) from RegisterUZ.
 *   Supports optional text extraction (digital) + OCR fallback (scanned).
 * financial_report_pdf: Download generated PDF of a report from RegisterUZ.
 *   Supports optional text extraction.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { sharedRuzAdapter as adapter } from "./_shared-clients.js";
import { extractPdfText } from "../utils/pdf-extractor.js";
import type { PdfExtractionResult } from "../types/pdf.types.js";

export function registerFinancialAttachment(server: McpServer): void {
  // --- financial_attachment ---
  server.tool(
    "financial_attachment",
    "Stiahne PDF prílohu (poznámky k závierke, skeny) z RegisterUZ. Ak extractText=true, extrahuje text z digitálneho PDF alebo použije OCR pre naskenované dokumenty. Vstup: attachmentId z company_financials.",
    {
      attachmentId: z.number().int().positive().describe("ID prílohy z company_financials (pole prilohy[].id)"),
      nazov: z.string().optional().describe("Názov prílohy (z company_financials prilohy[].nazov)"),
      velkost: z.number().optional().describe("Veľkosť prílohy v bytoch (z company_financials prilohy[].velkost)"),
      extractText: z.boolean().nullish().default(false).describe("Ak true, extrahuje text z PDF (digitálny) alebo OCR (sken). Default: false."),
    },
    async ({ attachmentId, nazov, velkost, extractText: shouldExtract }) => {
      const start = Date.now();
      const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
      // Base64 of large PDFs can overwhelm MCP transport / LLM context.
      // Auto-extract text for files >1MB to keep responses manageable.
      const AUTO_EXTRACT_THRESHOLD = 1 * 1024 * 1024; // 1 MB

      if (velkost && velkost > MAX_SIZE_BYTES) {
        return {
          isError: true,
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              error: `Príloha je príliš veľká (${Math.round(velkost / 1024 / 1024)}MB). Maximum je 5MB.`,
              _meta: { source: "ruz", durationMs: Date.now() - start, timestamp: new Date().toISOString() },
            }, null, 2),
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

        // Auto-extract text for large PDFs to avoid sending huge base64 blobs
        const pdfBuffer = Buffer.from(result.data.content, "base64");
        const doExtract = shouldExtract || pdfBuffer.length > AUTO_EXTRACT_THRESHOLD;

        let extractedText: PdfExtractionResult | null = null;
        if (doExtract && result.data.mimeType.startsWith("application/pdf")) {
          try {
            extractedText = await extractPdfText(pdfBuffer);
          } catch {
            // Extraction failed — still return the PDF
          }
        }

        // When text was extracted, return text (saves tokens) instead of base64 blob
        const hasText = extractedText && extractedText.method !== "none";

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              attachmentId,
              nazov: nazov ?? null,
              mimeType: result.data.mimeType,
              velkost: pdfBuffer.length,
              ...(hasText
                ? { extractedText }
                : { content: result.data.content }),
              _meta: {
                source: "ruz",
                durationMs: Date.now() - start,
                timestamp: new Date().toISOString(),
                ...(hasText && pdfBuffer.length > AUTO_EXTRACT_THRESHOLD
                  ? { note: "Text extrahovaný automaticky — PDF bolo príliš veľké pre priamy prenos" }
                  : {}),
              },
            }),
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
    "Generovaný PDF účtovného výkazu z RegisterUZ. Ak extractText=true, extrahuje text z PDF. Vstup: reportId z company_financials.",
    {
      reportId: z.number().int().positive().describe("ID výkazu z company_financials (pole vykazy[].id)"),
      extractText: z.boolean().nullish().default(false).describe("Ak true, extrahuje text z PDF. Default: false."),
    },
    async ({ reportId, extractText: shouldExtract }) => {
      const start = Date.now();
      const AUTO_EXTRACT_THRESHOLD = 1 * 1024 * 1024; // 1 MB

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

        // Auto-extract text for large PDFs to avoid sending huge base64 blobs
        const pdfBuffer = Buffer.from(result.data.content, "base64");
        const doExtract = shouldExtract || pdfBuffer.length > AUTO_EXTRACT_THRESHOLD;

        let extractedText: PdfExtractionResult | null = null;
        if (doExtract && result.data.mimeType.startsWith("application/pdf")) {
          try {
            extractedText = await extractPdfText(pdfBuffer);
          } catch {
            // Extraction failed — still return the PDF
          }
        }

        const hasText = extractedText && extractedText.method !== "none";

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              reportId,
              mimeType: result.data.mimeType,
              velkost: pdfBuffer.length,
              ...(hasText
                ? { extractedText }
                : { content: result.data.content }),
              _meta: {
                source: "ruz",
                durationMs: Date.now() - start,
                timestamp: new Date().toISOString(),
                ...(hasText && pdfBuffer.length > AUTO_EXTRACT_THRESHOLD
                  ? { note: "Text extrahovaný automaticky — PDF bolo príliš veľké pre priamy prenos" }
                  : {}),
              },
            }),
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
