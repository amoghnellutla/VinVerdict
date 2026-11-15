/**
 * Loan arithmetic for a car loan (simple-interest installment loan, equal monthly payments): the payment a
 * principal, rate and term give, the interest paid, and what a lower rate or a shorter term would save.
 * Pure math, so it's certain; the only tolerance is for rounding and the first payment's date.
 */

const r2 = (n: number) => Math.round(n * 100) / 100;

/** The monthly payment for `principal` at `aprPct` (e.g. 7.9) over `months`. */
export function monthlyPayment(principal: number, aprPct: number, months: number): number {
  if (months <= 0) return NaN;
  const r = aprPct / 1200;
  if (r === 0) return r2(principal / months);
  return r2((principal * r) / (1 - Math.pow(1 + r, -months)));
}

/** Interest over the whole loan at the formula's payment. */
export function totalInterest(principal: number, aprPct: number, months: number): number {
  return r2(monthlyPayment(principal, aprPct, months) * months - principal);
}

/** Cents of rounding plus a first payment due later than a month (odd-days interest) stay within this. */
export const PAYMENT_TOLERANCE = 3;

export type LoanCheck = {
  principal: number;
  aprPct: number;
  months: number;
  stated: number;
  /** What the loan math gives. */
  expected: number;
  /** Stated minus expected, per month. */
  diff: number;
  /** The difference over the whole loan. */
  overLoan: number;
  ok: boolean;
};

export function checkPayment(principal: number, aprPct: number, months: number, stated: number): LoanCheck {
  const expected = monthlyPayment(principal, aprPct, months);
  const diff = r2(stated - expected);
  return { principal, aprPct, months, stated, expected, diff, overLoan: r2(diff * months), ok: Math.abs(diff) <= PAYMENT_TOLERANCE };
}

/**
 * A schedule whose last payment differs ("71 payments of $468.51 and 1 final payment of $469.10", or a balloon):
 * the regular payment that pays off `principal` with that final payment, over `months` payments in all (the final
 * one included). Never guessed from the payment: a padded payment can look like a shorter loan.
 */
export function checkPaymentWithFinal(principal: number, aprPct: number, months: number, stated: number, final: number): LoanCheck {
  const regular = (n: number) => {
    const r = aprPct / 1200;
    if (n < 2) return NaN;
    if (r === 0) return r2((principal - final) / (n - 1));
    return r2(((principal - final / Math.pow(1 + r, n)) * r) / (1 - Math.pow(1 + r, -(n - 1))));
  };
  const expected = regular(months);
  const diff = r2(stated - expected);
  return { principal, aprPct, months, stated, expected, diff, overLoan: r2(diff * (months - 1)), ok: Math.abs(diff) <= PAYMENT_TOLERANCE };
}

/** Interest saved by borrowing the same amount at `otherPct` (a bank or credit union's pre-approval). */
export function savingAtRate(principal: number, aprPct: number, months: number, otherPct: number): number {
  return r2(totalInterest(principal, aprPct, months) - totalInterest(principal, otherPct, months));
}
