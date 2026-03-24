/**
 * Fix broken UTF-8 encoding from ŠÚSR RPO API.
 *
 * The RPO API returns responses where the bytes are valid UTF-8,
 * but something in the pipeline decodes them as latin1 (iso-8859-1),
 * producing mojibake. Fix: treat each character as a byte value
 * (latin1 encoding), then re-decode those bytes as UTF-8.
 */

/**
 * Fix a mojibake string that was incorrectly decoded as latin1
 * instead of UTF-8. Takes the broken string, converts each char
 * back to its byte value, and re-decodes as UTF-8.
 */
export function fixBrokenUtf8(text: string): string {
  return Buffer.from(text, "latin1").toString("utf-8");
}

/**
 * Fix broken encoding from a raw response Buffer.
 * Use this when you have the raw bytes (e.g. from `raw: true` fetch).
 */
export function decodeUtf8Buffer(buffer: Buffer): string {
  return buffer.toString("utf-8");
}

/**
 * Detect if a string likely has broken UTF-8 encoding (mojibake).
 * Checks for common mojibake patterns in Slovak text.
 */
export function hasBrokenEncoding(text: string): boolean {
  // Common mojibake patterns for Slovak diacritics (UTF-8 bytes read as latin1)
  const mojibakePatterns = [
    /Ã¡/, // á
    /Ã©/, // é
    /Ã­/, // í
    /Ã³/, // ó
    /Ãº/, // ú
    /Ã½/, // ý
    /Å¾/, // ž
    /Å¡/, // š
    /ÄŤ/, // č
    /Å¥/, // ť
    /Ä¾/, // ľ
    /Åˆ/, // ň
    /Ä\x8F/, // ď (U+010F → 0xC4 0x8F → "Ä" + \x8F in latin1)
  ];
  return mojibakePatterns.some((pattern) => pattern.test(text));
}
