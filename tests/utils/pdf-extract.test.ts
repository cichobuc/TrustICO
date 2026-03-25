/**
 * Unit tests for PDF text extraction utility.
 */
import { describe, it, expect } from "vitest";
import { extractTextFromPdf } from "../../src/utils/pdf-extract.js";

// Minimal valid PDF (1 page, no text content)
const EMPTY_PDF_BASE64 =
  "JVBERi0xLjAKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCA2MTIgNzkyXSA+PgplbmRvYmoKeHJlZgowIDQKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDA5IDAwMDAwIG4gCjAwMDAwMDAwNjMgMDAwMDAgbiAKMDAwMDAwMDEyMCAwMDAwMCBuIAp0cmFpbGVyCjw8IC9TaXplIDQgL1Jvb3QgMSAwIFIgPj4Kc3RhcnR4cmVmCjIxMgolJUVPRg==";

describe("extractTextFromPdf", () => {
  it("returns scanned-PDF error for empty PDF", async () => {
    const result = await extractTextFromPdf(EMPTY_PDF_BASE64);

    expect(result.text).toBe("");
    expect(result.pages).toBeGreaterThanOrEqual(0);
    expect(result.truncated).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error).toContain("sken");
  });

  it("handles garbage input gracefully", async () => {
    const result = await extractTextFromPdf("not-valid-base64-pdf-data!!!");

    expect(result.text).toBe("");
    expect(result.pages).toBe(0);
    expect(result.truncated).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error).toContain("Nepodarilo sa");
  });

  it("handles empty string input", async () => {
    const result = await extractTextFromPdf("");

    expect(result.text).toBe("");
    expect(result.error).toBeDefined();
  });

  it("returns PdfExtractResult shape for any input", async () => {
    const result = await extractTextFromPdf(EMPTY_PDF_BASE64);

    expect(result).toHaveProperty("text");
    expect(result).toHaveProperty("pages");
    expect(result).toHaveProperty("truncated");
    expect(result).toHaveProperty("totalTextLength");
    expect(typeof result.text).toBe("string");
    expect(typeof result.pages).toBe("number");
    expect(typeof result.truncated).toBe("boolean");
    expect(typeof result.totalTextLength).toBe("number");
  });
});
