/** Small display helpers shared by pages. */

export const usd = (n: number | null | undefined) => (n == null ? "—" : `$${Math.round(n).toLocaleString("en-US")}`);
export const mi = (n: number | null | undefined) => (n == null ? "—" : `${Math.round(n).toLocaleString("en-US")} mi`);
export const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

// Saved cars keep the rule engine's verdict; these labels match the result page's wording, and never say "safe".
/** Makes whose usual spelling isn't plain title case ("BMW", not "Bmw"; "McLaren"). */
const MAKE_SPELLING: Record<string, string> = { bmw: "BMW", gmc: "GMC", mini: "MINI", mclaren: "McLaren", "mclaren automotive": "McLaren" };

/** A make as people write it, from NHTSA's capitals ("LAND ROVER" → "Land Rover", "BMW" stays "BMW"). */
export function makeName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const k = raw.trim().toLowerCase();
  return MAKE_SPELLING[k] ?? k.replace(/(^|[\s-])([a-z])/g, (_, sep: string, c: string) => sep + c.toUpperCase());
}

export const VERDICT_TEXT = { hide: "Serious warning", verify: "Verify in person", caution: "Check with the seller", clear: "Nothing found so far" } as const;
export const VERDICT_TAG = { hide: "bg-bad-soft text-bad", verify: "bg-warn-soft text-warn", caution: "bg-warn-soft text-warn", clear: "bg-surface-muted text-foreground" } as const;
