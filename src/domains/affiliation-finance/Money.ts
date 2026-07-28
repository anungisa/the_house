/**
 * Minimal, dependency-free money helpers for the affiliation-finance domain.
 *
 * Amounts are carried as DECIMAL STRINGS (JSON-exact, DB numeric(14,2)-compatible) and compared
 * as integer cents to avoid binary-float drift. The domain persists numeric(14,2) with a
 * positive CHECK; these helpers enforce the same shape at the service boundary so a malformed or
 * non-positive amount is rejected before it ever reaches the kernel or the database.
 */

/** Currency must be an ISO-4217-style three-letter uppercase code (matches the DB CHECK). */
const CURRENCY_PATTERN = /^[A-Z]{3}$/;

/** A positive decimal with at most two fractional digits (matches numeric(14,2) CHECK > 0). */
const AMOUNT_PATTERN = /^\d{1,12}(?:\.\d{1,2})?$/;

/** True when `value` is a well-formed positive amount with ≤ 2 fractional digits. */
export function isValidAmount(value: unknown): value is string {
  if (typeof value !== 'string' || !AMOUNT_PATTERN.test(value)) return false;
  return toCents(value) > 0;
}

/** True when `value` is a well-formed three-letter uppercase currency code. */
export function isValidCurrency(value: unknown): value is string {
  return typeof value === 'string' && CURRENCY_PATTERN.test(value);
}

/** Convert a validated decimal amount string to integer cents. */
export function toCents(amount: string): number {
  const [whole, frac = ''] = amount.split('.');
  const cents = Number.parseInt(whole ?? '0', 10) * 100 + Number.parseInt(frac.padEnd(2, '0'), 10);
  return cents;
}

/** Normalize a validated amount to a canonical two-decimal string (e.g. "5" → "5.00"). */
export function normalizeAmount(amount: string): string {
  const cents = toCents(amount);
  const whole = Math.trunc(cents / 100);
  const frac = Math.abs(cents % 100)
    .toString()
    .padStart(2, '0');
  return `${whole}.${frac}`;
}

/** Signed discrepancy (confirmed − expected) of two validated amounts as a canonical string. */
export function discrepancy(expected: string, confirmed: string): string {
  const cents = toCents(confirmed) - toCents(expected);
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${Math.trunc(abs / 100)}.${(abs % 100).toString().padStart(2, '0')}`;
}

/** True when two validated amounts are equal to the cent. */
export function amountsEqual(a: string, b: string): boolean {
  return toCents(a) === toCents(b);
}
