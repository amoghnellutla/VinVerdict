/** Small display helpers shared by pages. */

export const usd = (n: number | null | undefined) => (n == null ? "—" : `$${Math.round(n).toLocaleString("en-US")}`);
export const mi = (n: number | null | undefined) => (n == null ? "—" : `${Math.round(n).toLocaleString("en-US")} mi`);
export const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

export const VERDICT_TEXT = { hide: "Walk away", verify: "Check in person", caution: "Go carefully", clear: "No red flags" } as const;
export const VERDICT_TAG = { hide: "bg-bad-soft text-bad", verify: "bg-warn-soft text-warn", caution: "bg-warn-soft text-warn", clear: "bg-good-soft text-good" } as const;
