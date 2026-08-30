/**
 * ISIN handling.
 *
 * An ISIN is a 2-letter country prefix, a 9-character national identifier and
 * a check digit. The check digit is a Luhn checksum over the identifier with
 * every letter expanded to its two-digit alphabet position (A=10 … Z=35), so a
 * single mistyped character is caught before any network call is made.
 */

const ISIN_SHAPE = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;

/** Uppercases and strips spaces, dots and dashes people paste in. */
export function normalizeIsin(input: string): string {
  return input.toUpperCase().replace(/[\s.\-_]/g, '');
}

/** True when the string is shaped like an ISIN, checksum aside. */
export function looksLikeIsin(input: string): boolean {
  return ISIN_SHAPE.test(normalizeIsin(input));
}

export function isValidIsin(input: string): boolean {
  const isin = normalizeIsin(input);
  if (!ISIN_SHAPE.test(isin)) return false;

  // Expand letters to their alphabet positions, then Luhn from the right.
  let digits = '';
  for (const ch of isin) {
    digits += /[0-9]/.test(ch) ? ch : String(ch.charCodeAt(0) - 55);
  }

  let sum = 0;
  let double = true; // The rightmost digit is the check digit and is not doubled.
  for (let i = digits.length - 2; i >= 0; i -= 1) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  const check = (10 - (sum % 10)) % 10;
  return check === digits.charCodeAt(digits.length - 1) - 48;
}

/** The two-letter country/region prefix, e.g. "IE" for an Irish-domiciled fund. */
export function isinCountry(input: string): string | null {
  const isin = normalizeIsin(input);
  return ISIN_SHAPE.test(isin) ? isin.slice(0, 2) : null;
}

/** Rough shape check for a ticker symbol, so it can be told apart from an ISIN. */
export function looksLikeTicker(input: string): boolean {
  return /^[A-Za-z0-9]{1,6}([.\-][A-Za-z]{1,4})?$/.test(input.trim()) && !looksLikeIsin(input);
}
