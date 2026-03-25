/**
 * PDF text extraction utility.
 *
 * Strategy:
 * 1. Try native text extraction via pdf-parse (fast, works for text PDFs)
 * 2. If that yields < 20 chars → PDF is likely scanned → run OCR via tesseract.js
 * 3. OCR renders each page to canvas via pdfjs-dist, then recognizes text
 *
 * Used by financial_attachment and financial_report_pdf tools.
 */

import { PDFParse } from "pdf-parse";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { createCanvas } from "canvas";
import Tesseract from "tesseract.js";

/** Max characters to return — keeps MCP response reasonable. */
const MAX_TEXT_LENGTH = 50_000;

/** Below this many non-whitespace chars, treat as scanned/image PDF. */
const MIN_TEXT_CHARS = 20;

/** Timeout for native text extraction. */
const TEXT_EXTRACTION_TIMEOUT_MS = 15_000;

/** Timeout for OCR (per page). */
const OCR_PER_PAGE_TIMEOUT_MS = 15_000;

/** Timeout for total OCR process (all pages). */
const OCR_TOTAL_TIMEOUT_MS = 120_000;

/** Max pages to OCR — prevents excessively long processing. */
const OCR_MAX_PAGES = 20;

/** DPI for rendering PDF pages to images for OCR. */
const OCR_RENDER_DPI = 200;

export interface PdfExtractResult {
  text: string;
  pages: number;
  truncated: boolean;
  totalTextLength: number;
  method: "text" | "ocr" | "none";
  error?: string;
}

/**
 * Extract text from a base64-encoded PDF.
 * Tries native text first, falls back to OCR for scanned documents.
 * Never throws.
 */
export async function extractTextFromPdf(base64: string): Promise<PdfExtractResult> {
  // Phase 1: Try native text extraction (fast)
  const textResult = await extractNativeText(base64);

  // If we got enough text, return it
  if (!textResult.error && textResult.text.length > 0) {
    return { ...textResult, method: "text" };
  }

  // Phase 2: Scanned PDF → OCR fallback
  const ocrResult = await extractOcrText(base64, textResult.pages);
  return ocrResult;
}

// --- Phase 1: Native text extraction ---

async function extractNativeText(base64: string): Promise<Omit<PdfExtractResult, "method">> {
  let parser: PDFParse | null = null;

  try {
    const buf = Buffer.from(base64, "base64");
    parser = new PDFParse({ data: buf });

    const textResult = await Promise.race([
      parser.getText(),
      rejectAfter(TEXT_EXTRACTION_TIMEOUT_MS, "TEXT_TIMEOUT"),
    ]);

    const rawText = (textResult.text ?? "").trim();
    const pages = textResult.total ?? 0;
    const nonWhitespace = rawText.replace(/\s/g, "").length;

    if (nonWhitespace < MIN_TEXT_CHARS) {
      return {
        text: "",
        pages,
        truncated: false,
        totalTextLength: 0,
        error: "native-empty",
      };
    }

    // Clean up page separators ("-- 1 of 5 --")
    const cleaned = rawText.replace(/\n-- \d+ of \d+ --\n/g, "\n");
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

// --- Phase 2: OCR fallback ---

async function extractOcrText(base64: string, knownPages: number): Promise<PdfExtractResult> {
  let doc: pdfjs.PDFDocumentProxy | null = null;
  let worker: Tesseract.Worker | null = null;
  const ocrStart = Date.now();

  try {
    const buf = Buffer.from(base64, "base64");
    const data = new Uint8Array(buf);
    doc = await pdfjs.getDocument({ data, verbosity: 0 }).promise;

    const totalPages = doc.numPages;
    const pagesToOcr = Math.min(totalPages, OCR_MAX_PAGES);

    // Create tesseract worker (Slovak + Czech + English)
    // Uses langPath from TESSERACT_LANG_PATH env if set (for Docker/offline)
    const langPath = process.env.TESSERACT_LANG_PATH ?? undefined;
    worker = await Promise.race([
      Tesseract.createWorker("slk+ces+eng", undefined, langPath ? { langPath } : undefined),
      rejectAfter(30_000, "OCR_INIT_TIMEOUT"),
    ]);

    const pageTexts: string[] = [];
    let totalTextLength = 0;
    let reachedLimit = false;

    for (let i = 1; i <= pagesToOcr; i++) {
      if (reachedLimit) break;

      // Check total OCR timeout
      if (Date.now() - ocrStart > OCR_TOTAL_TIMEOUT_MS) {
        break;
      }

      const page = await doc.getPage(i);
      const viewport = page.getViewport({ scale: OCR_RENDER_DPI / 72 });

      // Render page to canvas
      const canvas = createCanvas(
        Math.round(viewport.width),
        Math.round(viewport.height),
      );
      const ctx = canvas.getContext("2d");

      // pdfjs v5 requires `canvas` in RenderParameters alongside canvasContext
      await page.render({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        canvasContext: ctx as any,
        canvas: canvas as any,
        viewport,
      }).promise;

      // OCR the rendered image with per-page timeout
      const pngBuffer = canvas.toBuffer("image/png");

      const ocrResult = await Promise.race([
        worker.recognize(pngBuffer),
        rejectAfter(OCR_PER_PAGE_TIMEOUT_MS, "OCR_PAGE_TIMEOUT"),
      ]);

      const pageText = (ocrResult.data.text ?? "").trim();
      if (pageText) {
        pageTexts.push(pageText);
        totalTextLength += pageText.length;

        if (totalTextLength > MAX_TEXT_LENGTH) {
          reachedLimit = true;
        }
      }
    }

    const fullText = pageTexts.join("\n\n");
    const nonWhitespace = fullText.replace(/\s/g, "").length;

    if (nonWhitespace < MIN_TEXT_CHARS) {
      return {
        text: "",
        pages: totalPages,
        truncated: false,
        totalTextLength: 0,
        method: "none",
        error: "PDF neobsahuje čitateľný text ani po OCR rozpoznávaní (kvalita skenu je príliš nízka alebo PDF obsahuje len obrázky)",
      };
    }

    const truncated = fullText.length > MAX_TEXT_LENGTH;
    const text = truncated ? fullText.slice(0, MAX_TEXT_LENGTH) : fullText;

    const result: PdfExtractResult = {
      text,
      pages: totalPages,
      truncated: truncated || pagesToOcr < totalPages,
      totalTextLength: fullText.length,
      method: "ocr",
    };

    if (pagesToOcr < totalPages) {
      result.error = `OCR spracované len prvých ${pagesToOcr} z ${totalPages} strán`;
    }

    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    let errorMsg: string;
    if (msg === "OCR_INIT_TIMEOUT") {
      errorMsg = "Inicializácia OCR trvala príliš dlho (timeout 30s) — jazykové modely sa nepodarilo načítať";
    } else if (msg === "OCR_PAGE_TIMEOUT") {
      errorMsg = `OCR rozpoznávanie trvalo príliš dlho (timeout ${OCR_PER_PAGE_TIMEOUT_MS / 1000}s na stranu)`;
    } else if (msg.includes("fetch failed") || msg.includes("network")) {
      errorMsg = "OCR jazykové modely sa nepodarilo stiahnuť (sieťová chyba). Nastavte TESSERACT_LANG_PATH pre offline režim.";
    } else {
      errorMsg = `OCR zlyhalo: ${msg}`;
    }

    return {
      text: "",
      pages: knownPages,
      truncated: false,
      totalTextLength: 0,
      method: "none",
      error: errorMsg,
    };
  } finally {
    if (worker) {
      try { await worker.terminate(); } catch { /* ignore */ }
    }
    if (doc) {
      try { await doc.destroy(); } catch { /* ignore */ }
    }
  }
}

function rejectAfter(ms: number, reason: string): Promise<never> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error(reason)), ms),
  );
}
