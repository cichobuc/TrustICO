/**
 * Types for PDF text extraction and OCR.
 */

/** Method used to extract text from PDF. */
export type PdfExtractionMethod = "text_extraction" | "ocr" | "none";

/** Result of PDF text extraction / OCR. */
export interface PdfExtractionResult {
  /** Extracted text content. */
  text: string;
  /** Number of pages in the PDF. */
  pages: number;
  /** Method used: text_extraction (digital), ocr (scanned), none (failed). */
  method: PdfExtractionMethod;
  /** OCR confidence score (0-1). Only present when method is "ocr". */
  confidence: number | null;
  /** Time spent on extraction in milliseconds. */
  durationMs: number;
}
