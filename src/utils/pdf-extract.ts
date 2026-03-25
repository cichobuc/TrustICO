/**
 * PDF text extraction utility.
 *
 * Strategy:
 * 1. Native text extraction via pdf-parse (fast, works for text PDFs)
 * 2. If no copyable text found → return "none" so Claude reads the PDF visually
 *    from the embedded resource blob
 *
 * Claude is multimodal and reads scanned PDFs natively — no OCR needed.
 */

import { PDFParse } from "pdf-parse";

/** Max characters to return — keeps MCP response reasonable. */
const MAX_TEXT_LENGTH = 50_000;

/** Max base64 input size (50MB base64 ≈ 37.5MB binary). */
const MAX_BASE64_LENGTH = 50 * 1024 * 1024;

/** Below this many non-whitespace chars, treat as scanned/image PDF. */
const MIN_TEXT_CHARS = 20;

/** Timeout for native text extraction. */
const TEXT_EXTRACTION_TIMEOUT_MS = 15_000;

export interface PdfExtractResult {
  text: string;
  pages: number;
  truncated: boolean;
  totalTextLength: number;
  method: "text" | "none";
  error?: string;
}

/** Clearable timeout — prevents timer leaks in Promise.race. */
function createTimeout(ms: number, reason: string): { promise: Promise<never>; clear: () => void } {
  let timer: ReturnType<typeof setTimeout>;
  const promise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(reason)), ms);
  });
  return { promise, clear: () => clearTimeout(timer) };
}

/**
 * Extract text from a base64-encoded PDF.
 *
 * Tries native text extraction. If the PDF is scanned (no copyable text),
 * returns method "none" — the caller should provide the PDF as an embedded
 * resource for Claude to read visually.
 *
 * Never throws.
 */
export async function extractTextFromPdf(base64: string): Promise<PdfExtractResult> {
  // Guard against excessively large inputs
  if (base64.length > MAX_BASE64_LENGTH) {
    return {
      text: "",
      pages: 0,
      truncated: false,
      totalTextLength: 0,
      method: "none",
      error: `PDF príliš veľké (${Math.round(base64.length / 1024 / 1024)}MB base64). Maximum je ${MAX_BASE64_LENGTH / 1024 / 1024}MB.`,
    };
  }

  const buf = Buffer.from(base64, "base64");
  let parser: PDFParse | null = null;

  try {
    parser = new PDFParse({ data: buf });

    const { promise: timeoutPromise, clear: clearTimer } = createTimeout(TEXT_EXTRACTION_TIMEOUT_MS, "TEXT_TIMEOUT");
    let textResult: { text?: string; total?: number };
    try {
      textResult = await Promise.race([parser.getText(), timeoutPromise]);
    } finally {
      clearTimer();
    }

    const rawText = (textResult.text ?? "").trim();
    const pages = textResult.total ?? 0;
    const nonWhitespace = rawText.replace(/\s/g, "").length;

    if (nonWhitespace < MIN_TEXT_CHARS) {
      return {
        text: "",
        pages,
        truncated: false,
        totalTextLength: 0,
        method: "none",
        error: "PDF neobsahuje kopírovateľný text (pravdepodobne sken). Claude ho prečíta vizuálne z priloženého PDF.",
      };
    }

    // Clean up page separators ("-- 1 of 5 --")
    const cleaned = rawText.replace(/\n-- \d+ of \d+ --\n/g, "\n");
    const truncated = cleaned.length > MAX_TEXT_LENGTH;
    const text = truncated ? cleaned.slice(0, MAX_TEXT_LENGTH) : cleaned;

    return { text, pages, truncated, totalTextLength: cleaned.length, method: "text" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      text: "",
      pages: 0,
      truncated: false,
      totalTextLength: 0,
      method: "none",
      error: msg === "TEXT_TIMEOUT"
        ? `Extrakcia textu trvala príliš dlho (timeout ${TEXT_EXTRACTION_TIMEOUT_MS / 1000}s)`
        : `Nepodarilo sa extrahovať text: ${msg}`,
    };
  } finally {
    if (parser) {
      try { await parser.destroy(); } catch { /* ignore */ }
    }
  }
}
