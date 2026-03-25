/**
 * Unit tests for PDF text extraction utility.
 *
 * Note: OCR requires tesseract language models which are downloaded from CDN.
 * In restricted environments (proxy, offline), OCR will fail gracefully.
 * These tests verify the extraction pipeline works correctly regardless.
 */
import { describe, it, expect } from "vitest";
import { extractTextFromPdf } from "../../src/utils/pdf-extract.js";

// Minimal valid PDF (1 page, no text content)
const EMPTY_PDF_BASE64 =
  "JVBERi0xLjAKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCA2MTIgNzkyXSA+PgplbmRvYmoKeHJlZgowIDQKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDA5IDAwMDAwIG4gCjAwMDAwMDAwNjMgMDAwMDAgbiAKMDAwMDAwMDEyMCAwMDAwMCBuIAp0cmFpbGVyCjw8IC9TaXplIDQgL1Jvb3QgMSAwIFIgPj4Kc3RhcnR4cmVmCjIxMgolJUVPRg==";

describe("extractTextFromPdf", () => {
  it("returns no text for empty PDF (native or OCR fallback)", async () => {
    const result = await extractTextFromPdf(EMPTY_PDF_BASE64);

    // Empty PDF → native extraction finds no text → OCR fallback
    // OCR may fail (no network) or succeed (blank page → no text)
    // Either way: no useful text
    expect(result.text).toBe("");
    expect(result.method).toMatch(/^(none|ocr)$/);
    expect(result.truncated).toBe(false);
    expect(result.error).toBeDefined();
  }, 60_000);

  it("handles garbage input gracefully", async () => {
    const result = await extractTextFromPdf("not-valid-base64-pdf-data!!!");

    expect(result.text).toBe("");
    expect(result.pages).toBe(0);
    expect(result.truncated).toBe(false);
    expect(result.error).toBeDefined();
    // Error should be from native extraction or OCR, both are acceptable
    expect(typeof result.error).toBe("string");
  });

  it("handles empty string input", async () => {
    const result = await extractTextFromPdf("");

    expect(result.text).toBe("");
    expect(result.error).toBeDefined();
  });

  it("returns correct PdfExtractResult shape", async () => {
    const result = await extractTextFromPdf(EMPTY_PDF_BASE64);

    expect(result).toHaveProperty("text");
    expect(result).toHaveProperty("pages");
    expect(result).toHaveProperty("truncated");
    expect(result).toHaveProperty("totalTextLength");
    expect(result).toHaveProperty("method");
    expect(typeof result.text).toBe("string");
    expect(typeof result.pages).toBe("number");
    expect(typeof result.truncated).toBe("boolean");
    expect(typeof result.totalTextLength).toBe("number");
    expect(["text", "ocr", "none"]).toContain(result.method);
  }, 60_000);
});
