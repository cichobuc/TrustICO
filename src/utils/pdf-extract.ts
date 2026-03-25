/**
 * PDF text extraction utility.
 *
 * Uses pdf-parse v2 (pdfjs-dist) to extract readable text from PDF buffers.
 * Used by financial_attachment and financial_report_pdf tools so Claude gets
 * both the raw PDF and its text content.
 */

import { PDFParse } from "pdf-parse";

/** Max characters to return — keeps MCP response reasonable. */
const MAX_TEXT_LENGTH = 50_000;

/** Below this many non-whitespace chars, treat as scanned/image PDF. */
const MIN_TEXT_CHARS = 20;

/** Timeout for text extraction — prevents blocking on huge/corrupted PDFs. */
const EXTRACTION_TIMEOUT_MS = 5_000;

export interface PdfExtractResult {
  text: string;
  pages: number;
  truncated: boolean;
  totalTextLength: number;
  error?: string;
}

/**
 * Extract text from a base64-encoded PDF.
 * Returns extracted text or an error — never throws.
 */
export async function extractTextFromPdf(base64: string): Promise<PdfExtractResult> {
  let parser: PDFParse | null = null;

  try {
    const buf = Buffer.from(base64, "base64");
    parser = new PDFParse({ data: buf });

    // Race extraction against timeout
    const textResult = await Promise.race([
      parser.getText(),
      timeout(EXTRACTION_TIMEOUT_MS),
    ]);

    const rawText = (textResult.text ?? "").trim();
    const pages = textResult.total ?? 0;
    const nonWhitespace = rawText.replace(/\s/g, "").length;

    // Scanned/image PDF detection
    if (nonWhitespace < MIN_TEXT_CHARS) {
      return {
        text: "",
        pages,
        truncated: false,
        totalTextLength: 0,
        error: "PDF neobsahuje extrahovateľný text (pravdepodobne sken/obrázok)",
      };
    }

    // Clean up page separators from pdf-parse ("-- 1 of 5 --")
    const cleaned = rawText.replace(/\n-- \d+ of \d+ --\n/g, "\n");

    // Truncate if needed
    const truncated = cleaned.length > MAX_TEXT_LENGTH;
    const text = truncated ? cleaned.slice(0, MAX_TEXT_LENGTH) : cleaned;

    return { text, pages, truncated, totalTextLength: cleaned.length };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      text: "",
      pages: 0,
      truncated: false,
      totalTextLength: 0,
      error: msg === "EXTRACTION_TIMEOUT"
        ? `Extrakcia textu trvala príliš dlho (timeout ${EXTRACTION_TIMEOUT_MS / 1000}s)`
        : `Nepodarilo sa extrahovať text z PDF: ${msg}`,
    };
  } finally {
    if (parser) {
      try { await parser.destroy(); } catch { /* ignore cleanup errors */ }
    }
  }
}

function timeout(ms: number): Promise<never> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error("EXTRACTION_TIMEOUT")), ms),
  );
}
