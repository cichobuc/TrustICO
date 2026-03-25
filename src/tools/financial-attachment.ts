/**
 * MCP tools: financial_attachment + financial_report_pdf
 *
 * financial_attachment: Download PDF attachment (poznámky, skeny) from RegisterUZ.
 *   Supports optional text extraction (digital) + OCR fallback (scanned).
 * financial_report_pdf: Download generated PDF of a report from RegisterUZ.
 *   Supports optional text extraction.
 *
 * Memory strategy: avoid redundant base64→Buffer decode. Use base64 length
 * to estimate binary size (base64.length * 3/4 ≈ binary size).
 * For large PDFs (>1MB), auto-extract text to avoid overwhelming MCP transport.
 * If extraction fails for a large PDF, return metadata-only (not raw base64).
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { sharedRuzAdapter as adapter } from "./_shared-clients.js";
import { extractPdfText } from "../utils/pdf-extractor.js";
import type { PdfExtractionResult } from "../types/pdf.types.js";

const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
// Base64 of large PDFs can overwhelm MCP transport / LLM context.
// Auto-extract text for files >1MB to keep responses manageable.
const AUTO_EXTRACT_THRESHOLD = 1 * 1024 * 1024; // 1 MB

/** Estimate binary size from base64 string length (avoids decoding). */
function estimateBinarySize(base64: string): number {
  // base64 encodes 3 bytes as 4 chars, with possible padding
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

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

        // Estimate binary size from base64 length — avoids full decode
        const binarySize = estimateBinarySize(result.data.content);
        const isLarge = binarySize > AUTO_EXTRACT_THRESHOLD;
        const doExtract = shouldExtract || isLarge;
        const isPdf = result.data.mimeType.startsWith("application/pdf");

        let extractedText: PdfExtractionResult | null = null;
        if (doExtract && isPdf) {
          try {
            const pdfBuffer = Buffer.from(result.data.content, "base64");
            extractedText = await extractPdfText(pdfBuffer);
          } catch {
            // Extraction failed
          }
        }

        const hasText = extractedText && extractedText.method !== "none";

        // If large PDF and extraction failed → return metadata-only (not the huge base64 blob)
        if (isLarge && !hasText) {
          return {
            content: [{
              type: "text" as const,
              text: JSON.stringify({
                attachmentId,
                nazov: nazov ?? null,
                mimeType: result.data.mimeType,
                velkost: binarySize,
                note: `PDF má ${Math.round(binarySize / 1024)}KB — príliš veľké pre priamy prenos a text extraction zlyhala. Skúste extractText=true alebo stiahnite priamo z RegisterUZ.`,
                _meta: {
                  source: "ruz",
                  durationMs: Date.now() - start,
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
              velkost: binarySize,
              ...(hasText
                ? { extractedText }
                : { content: result.data.content }),
              _meta: {
                source: "ruz",
                durationMs: Date.now() - start,
                timestamp: new Date().toISOString(),
                ...(hasText && isLarge
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

        const binarySize = estimateBinarySize(result.data.content);

        // Size check (mirrors adapter check, but provides MCP-level error)
        if (binarySize > MAX_SIZE_BYTES) {
          return {
            isError: true,
            content: [{
              type: "text" as const,
              text: JSON.stringify({
                error: `PDF je príliš veľké (${Math.round(binarySize / 1024 / 1024)}MB). Maximum je 5MB.`,
                _meta: { source: "ruz", durationMs: Date.now() - start, timestamp: new Date().toISOString() },
              }, null, 2),
            }],
          };
        }

        const isLarge = binarySize > AUTO_EXTRACT_THRESHOLD;
        const doExtract = shouldExtract || isLarge;
        const isPdf = result.data.mimeType.startsWith("application/pdf");

        let extractedText: PdfExtractionResult | null = null;
        if (doExtract && isPdf) {
          try {
            const pdfBuffer = Buffer.from(result.data.content, "base64");
            extractedText = await extractPdfText(pdfBuffer);
          } catch {
            // Extraction failed
          }
        }

        const hasText = extractedText && extractedText.method !== "none";

        // If large PDF and extraction failed → return metadata-only
        if (isLarge && !hasText) {
          return {
            content: [{
              type: "text" as const,
              text: JSON.stringify({
                reportId,
                mimeType: result.data.mimeType,
                velkost: binarySize,
                note: `PDF má ${Math.round(binarySize / 1024)}KB — príliš veľké pre priamy prenos a text extraction zlyhala. Skúste extractText=true alebo použite financial_report_detail pre štrukturované dáta.`,
                _meta: {
                  source: "ruz",
                  durationMs: Date.now() - start,
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
              velkost: binarySize,
              ...(hasText
                ? { extractedText }
                : { content: result.data.content }),
              _meta: {
                source: "ruz",
                durationMs: Date.now() - start,
                timestamp: new Date().toISOString(),
                ...(hasText && isLarge
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
