/**
 * Fix broken UTF-8 encoding from ŠÚSR RPO API.
 *
 * The RPO API returns responses where the content is encoded as latin1
 * but the Content-Type claims UTF-8. This results in mojibake.
 * Fix: treat the raw bytes as latin1, then re-encode as UTF-8.
 */
export function fixBrokenUtf8(buffer: Buffer): string {
  // Decode the buffer as latin1 (iso-8859-1) to get the original bytes as characters,
  // then create a new buffer from those characters and decode as UTF-8.
  const latin1 = buffer.toString("latin1");
  return Buffer.from(latin1, "latin1").toString("utf-8");
}

/**
 * Detect if a string likely has broken UTF-8 encoding.
 * Checks for common mojibake patterns in Slovak text.
 */
export function hasBrokenEncoding(text: string): boolean {
  // Common mojibake patterns for Slovak diacritics
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
    /Ä/, // ď
  ];
  return mojibakePatterns.some((pattern) => pattern.test(text));
}
