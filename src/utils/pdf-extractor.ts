/**
 * PDF text extraction with OCR fallback.
 *
 * Strategy:
 *   1. Try digital text extraction via unpdf (fast, ~50-100ms)
 *   2. If avg chars/page < 50 → scanned PDF → OCR via tesseract.js (slk+eng)
 *   3. If both fail → return method: "none"
 *
 * tesseract.js worker is lazily initialized on first OCR call
 * and reused across subsequent calls (singleton pattern).
 * Worker init failures are retried on next call (no permanent bricking).
 */

import { extractText, renderPageAsImage, getMeta } from "unpdf";
import type { PdfExtractionResult } from "../types/pdf.types.js";

const MIN_CHARS_PER_PAGE = 50;
const MAX_OCR_PAGES = 15;
const OCR_TIMEOUT_MS = 60_000;
const PER_PAGE_TIMEOUT_MS = 30_000;
const RENDER_SCALE = 2.0; // 2x scale ≈ 144 DPI (good balance speed/quality)

// --- Lazy Tesseract worker singleton ---

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let tesseractWorker: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let tesseractInitPromise: Promise<any> | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getTesseractWorker(): Promise<any> {
  if (tesseractWorker) return tesseractWorker;
  if (tesseractInitPromise) return tesseractInitPromise;

  tesseractInitPromise = (async () => {
    try {
      const Tesseract = await import("tesseract.js");
      const worker = await Tesseract.createWorker("slk+eng");
      tesseractWorker = worker;
      return worker;
    } catch (err) {
      // Clear promise so next call retries init (no permanent bricking)
      tesseractInitPromise = null;
      throw err;
    }
  })();

  return tesseractInitPromise;
}

/**
 * Extract text from a PDF buffer.
 * Tries digital extraction first, falls back to OCR for scanned documents.
 */
export async function extractPdfText(buffer: Buffer): Promise<PdfExtractionResult> {
  const start = Date.now();
  const data = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);

  // Step 1: Try digital text extraction
  try {
    const result = await extractText(data, { mergePages: false });
    const totalPages = result.totalPages;
    const textPages = Array.isArray(result.text) ? result.text : [String(result.text)];
    const fullText = textPages.join("\n\n");
    const avgCharsPerPage = totalPages > 0 ? fullText.length / totalPages : 0;

    if (avgCharsPerPage >= MIN_CHARS_PER_PAGE) {
      return {
        text: fullText,
        pages: totalPages,
        method: "text_extraction",
        confidence: null,
        durationMs: Date.now() - start,
      };
    }

    // Low text content → likely scanned, try OCR
    const pageCount = Math.min(totalPages, MAX_OCR_PAGES);
    const ocrResult = await ocrFromPdf(data, pageCount);
    if (ocrResult) {
      return {
        ...ocrResult,
        durationMs: Date.now() - start,
      };
    }
  } catch {
    // extractText failed — try OCR directly
    try {
      const meta = await getMeta(data);
      const pageCount = Math.min(meta.info?.numPages ?? 1, MAX_OCR_PAGES);
      const ocrResult = await ocrFromPdf(data, pageCount);
      if (ocrResult) {
        return {
          ...ocrResult,
          durationMs: Date.now() - start,
        };
      }
    } catch {
      // Both extraction and meta failed
    }
  }

  // Everything failed
  return {
    text: "",
    pages: 0,
    method: "none",
    confidence: null,
    durationMs: Date.now() - start,
  };
}

/**
 * Run a promise with a timeout. Rejects with "PAGE_TIMEOUT" on expiry.
 */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("PAGE_TIMEOUT")), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer));
}

/**
 * OCR a PDF by rendering pages to images and running tesseract.js.
 * Returns null if OCR fails entirely.
 */
async function ocrFromPdf(
  data: Uint8Array,
  pageCount: number,
): Promise<Omit<PdfExtractionResult, "durationMs"> | null> {
  try {
    const worker = await getTesseractWorker();

    const pageTexts: string[] = [];
    let totalConfidence = 0;
    let processedPages = 0;

    // Process pages sequentially to limit memory usage
    const timeoutAt = Date.now() + OCR_TIMEOUT_MS;

    for (let page = 1; page <= pageCount; page++) {
      if (Date.now() > timeoutAt) break;

      try {
        // Per-page timeout prevents a single complex page from blocking forever
        const ocrText = await withTimeout(
          (async () => {
            const imageBuffer = await renderPageAsImage(data, page, {
              scale: RENDER_SCALE,
            });
            const { data: ocrData } = await worker.recognize(
              Buffer.from(imageBuffer),
            );
            return ocrData;
          })(),
          PER_PAGE_TIMEOUT_MS,
        );

        if (ocrText.text.trim()) {
          pageTexts.push(ocrText.text.trim());
          totalConfidence += ocrText.confidence;
          processedPages++;
        }
      } catch {
        // Skip failed/timed-out pages, continue with rest
        continue;
      }
    }

    if (processedPages === 0) return null;

    // tesseract.js confidence is 0-100, normalize to 0-1
    const avgConfidence = (totalConfidence / processedPages) / 100;

    return {
      text: pageTexts.join("\n\n"),
      pages: processedPages,
      method: "ocr",
      confidence: Math.round(avgConfidence * 100) / 100,
    };
  } catch {
    return null;
  }
}

/**
 * Cleanup tesseract worker. Call on graceful shutdown.
 */
export async function terminateTesseractWorker(): Promise<void> {
  if (tesseractWorker) {
    await tesseractWorker.terminate();
    tesseractWorker = null;
    tesseractInitPromise = null;
  } else if (tesseractInitPromise) {
    // Init is in-flight — wait for it, then terminate
    try {
      const worker = await tesseractInitPromise;
      await worker.terminate();
    } catch {
      // Init failed anyway, nothing to terminate
    }
    tesseractWorker = null;
    tesseractInitPromise = null;
  }
}
