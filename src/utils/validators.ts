/**
 * Validation and normalization for Slovak business identifiers.
 */

export type ValidationResult =
  | { valid: true; normalized: string }
  | { valid: false; error: string };

/**
 * Validate and normalize IČO (8 digits, left-padded with zeros).
 * Accepts string or number input.
 */
export function validateICO(input: string | number): ValidationResult {
  const raw = String(input).trim();
  if (!/^\d+$/.test(raw)) {
    return { valid: false, error: "IČO musí obsahovať len číslice" };
  }
  if (raw.length > 8) {
    return { valid: false, error: "IČO nesmie mať viac ako 8 číslic" };
  }
  const normalized = raw.padStart(8, "0");
  return { valid: true, normalized };
}

/**
 * Validate and normalize DIČ (exactly 10 digits).
 */
export function validateDIC(input: string | number): ValidationResult {
  const raw = String(input).trim();
  if (!/^\d+$/.test(raw)) {
    return { valid: false, error: "DIČ musí obsahovať len číslice" };
  }
  if (raw.length !== 10) {
    return { valid: false, error: "DIČ musí mať presne 10 číslic" };
  }
  return { valid: true, normalized: raw };
}

/**
 * Validate and normalize IČ DPH (SK prefix + 10 digits).
 * Accepts with or without "SK" prefix.
 */
export function validateICDPH(input: string): ValidationResult {
  const raw = input.trim().toUpperCase();
  let digits: string;

  if (raw.startsWith("SK")) {
    digits = raw.slice(2);
  } else {
    digits = raw;
  }

  if (!/^\d{10}$/.test(digits)) {
    return {
      valid: false,
      error: "IČ DPH musí obsahovať 10 číslic (s alebo bez SK prefixu)",
    };
  }

  return { valid: true, normalized: `SK${digits}` };
}
