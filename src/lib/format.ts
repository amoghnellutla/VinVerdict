/** Small display helpers shared by pages. */

export const usd = (n: number | null | undefined) => (n == null ? "—" : `$${Math.round(n).toLocaleString("en-US")}`);
export const mi = (n: number | null | undefined) => (n == null ? "—" : `${Math.round(n).toLocaleString("en-US")} mi`);
export const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

// Saved cars keep the rule engine's verdict; these labels match the result page's wording, and never say "safe".
export const VERDICT_TEXT = { hide: "Serious warning", verify: "Verify in person", caution: "Check with the seller", clear: "Nothing found so far" } as const;
export const VERDICT_TAG = { hide: "bg-bad-soft text-bad", verify: "bg-warn-soft text-warn", caution: "bg-warn-soft text-warn", clear: "bg-surface-muted text-foreground" } as const;
