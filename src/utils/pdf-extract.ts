/**
 * PDF text extraction utility.
 *
 * Strategy:
 * 1. Try native text extraction via pdf-parse (fast, works for text PDFs)
 * 2. If that yields < 20 chars → PDF is likely scanned → run OCR via tesseract.js
 * 3. OCR renders each page to canvas via pdfjs-dist, then recognizes text
 *
 * Heavy deps (pdfjs-dist, canvas, tesseract.js) are dynamically imported
 * only when OCR is needed — no cold start penalty for text PDFs.
 */

import { PDFParse } from "pdf-parse";

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
 * Tries native text first, falls back to OCR for scanned documents.
 * Never throws.
 */
export async function extractTextFromPdf(base64: string): Promise<PdfExtractResult> {
  // Decode base64 once — shared between native extraction and OCR
  const buf = Buffer.from(base64, "base64");

  // Phase 1: Try native text extraction (fast)
  const textResult = await extractNativeText(buf);

  // If we got enough text, return it
  if (!textResult.error && textResult.text.length > 0) {
    return { ...textResult, method: "text" };
  }

  // Phase 2: Scanned PDF → OCR fallback
  const ocrResult = await extractOcrText(buf, textResult.pages);
  return ocrResult;
}

// --- Phase 1: Native text extraction ---

async function extractNativeText(buf: Buffer): Promise<Omit<PdfExtractResult, "method">> {
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

// --- Phase 2: OCR fallback (heavy deps loaded dynamically) ---

async function extractOcrText(buf: Buffer, knownPages: number): Promise<PdfExtractResult> {
  // Dynamic imports — only loaded when OCR is actually needed
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const { createCanvas } = await import("canvas");
  const Tesseract = (await import("tesseract.js")).default;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let doc: any = null;
  let worker: Tesseract.Worker | null = null;
  const ocrStart = Date.now();

  try {
    const data = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    doc = await pdfjs.getDocument({ data, verbosity: 0 }).promise;

    const totalPages = doc.numPages;
    const pagesToOcr = Math.min(totalPages, OCR_MAX_PAGES);

    // Create tesseract worker (Slovak + Czech + English)
    const langPath = process.env.TESSERACT_LANG_PATH ?? undefined;
    const { promise: initTimeout, clear: clearInit } = createTimeout(30_000, "OCR_INIT_TIMEOUT");
    try {
      worker = await Promise.race([
        Tesseract.createWorker("slk+ces+eng", undefined, langPath ? { langPath } : undefined),
        initTimeout,
      ]);
    } finally {
      clearInit();
    }

    const pageTexts: string[] = [];
    let totalTextLength = 0;
    let reachedLimit = false;

    // Reusable canvas — resized each iteration to avoid native memory leaks
    let canvas = createCanvas(1, 1);

    for (let i = 1; i <= pagesToOcr; i++) {
      if (reachedLimit) break;
      if (Date.now() - ocrStart > OCR_TOTAL_TIMEOUT_MS) break;

      const page = await doc.getPage(i);
      const viewport = page.getViewport({ scale: OCR_RENDER_DPI / 72 });

      // Resize canvas instead of creating new one
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const ctx = canvas.getContext("2d");

      // pdfjs v5 requires `canvas` in RenderParameters alongside canvasContext
      await page.render({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        canvasContext: ctx as any,
        canvas: canvas as any,
        viewport,
      }).promise;

      // OCR the rendered image — JPEG is faster and smaller than PNG
      const imgBuffer = canvas.toBuffer("image/jpeg");

      const { promise: pageTimeout, clear: clearPage } = createTimeout(OCR_PER_PAGE_TIMEOUT_MS, "OCR_PAGE_TIMEOUT");
      let ocrResult: Tesseract.RecognizeResult;
      try {
        ocrResult = await Promise.race([worker.recognize(imgBuffer), pageTimeout]);
      } finally {
        clearPage();
      }

      const pageText = (ocrResult.data.text ?? "").trim();
      if (pageText) {
        pageTexts.push(pageText);
        totalTextLength += pageText.length;
        if (totalTextLength > MAX_TEXT_LENGTH) {
          reachedLimit = true;
        }
      }
    }

    // Release canvas native memory
    canvas.width = 0;
    canvas.height = 0;

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
