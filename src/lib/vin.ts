/**
 * VIN helpers. No network: these run anywhere (server or browser).
 *
 * A VIN is 17 characters, letters and digits only, never I, O or Q.
 * Position 9 is a check digit computed from the other 16, so a typo or a
 * made-up VIN usually fails the check. That makes it a cheap scam signal.
 */

const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;

// Letter → number table from the North American VIN standard (49 CFR 565).
const TRANSLIT: Record<string, number> = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8,
  J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
  S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
};
const WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

// Model-year code (position 10). Codes repeat every 30 years, so a code can
// mean two years (e.g. "H" = 1987 or 2017); callers pick the plausible one.
const YEAR_CODES = "ABCDEFGHJKLMNPRSTVWXY123456789";

export function normalizeVin(raw: string): string {
  return raw.replace(/[\s-]/g, "").toUpperCase();
}

export function isVinFormat(vin: string): boolean {
  return VIN_RE.test(vin);
}

/** Expected check digit ("0"–"9" or "X"). Assumes isVinFormat(vin). */
export function vinCheckDigit(vin: string): string {
  let total = 0;
  for (let i = 0; i < 17; i++) {
    if (i === 8) continue;
    const ch = vin[i];
    const value = ch >= "0" && ch <= "9" ? Number(ch) : TRANSLIT[ch];
    total += value * WEIGHTS[i];
  }
  const rem = total % 11;
  return rem === 10 ? "X" : String(rem);
}

/** Both possible model years for the VIN's year code, newest first. */
export function vinModelYears(vin: string): number[] {
  const idx = YEAR_CODES.indexOf(vin[9]);
  if (idx < 0) return [];
  return [2010 + idx, 1980 + idx];
}

export type VinCheck =
  | { ok: true; vin: string }
  | { ok: false; vin: string; reason: "format" | "check-digit"; message: string };

export function checkVin(raw: string): VinCheck {
  const vin = normalizeVin(raw);
  if (!isVinFormat(vin)) {
    return {
      ok: false,
      vin,
      reason: "format",
      message: "A VIN is 17 letters and digits, with no I, O or Q.",
    };
  }
  const expected = vinCheckDigit(vin);
  if (vin[8] !== expected) {
    return {
      ok: false,
      vin,
      reason: "check-digit",
      message: `The VIN's check digit (9th character) should be ${expected}, not ${vin[8]}. The VIN may be mistyped or fake.`,
    };
  }
  return { ok: true, vin };
}
