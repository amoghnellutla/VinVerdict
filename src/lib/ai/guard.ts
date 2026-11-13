/**
 * Checks on what an AI model says, against what it was given (PLAN.md "AI mode":
 * accuracy over completeness). Pure. A claim the source text can't back is dropped,
 * and an answer that invents numbers or links is rejected outright, so the person
 * never sees it.
 */

const squash = (s: string) => s.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim();

/** A short quote that appears in the source, give or take spacing and case. Quotes under 6 characters prove nothing. */
export function quoteIn(quote: string, source: string): boolean {
  const q = squash(quote).replace(/^["'“]|["'”]$/g, "");
  return q.length >= 6 && squash(source).includes(q);
}

/** The numbers that matter in a text: any $ amount, and any figure with 3+ digits (prices, miles, years, VIN digits aside). */
export function numbersIn(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/\$\s?(\d[\d,]*(?:\.\d+)?)|(?<![\w.])(\d{1,3}(?:,\d{3})+|\d{3,})(?:\.\d+)?(?![\w])/g)) {
    const raw = (m[1] ?? m[2]).replace(/,/g, "").replace(/\.0+$/, "");
    out.add(raw);
  }
  return [...out];
}

/** Numbers in `answer` that `source` doesn't contain (the source's own numbers, with or without commas and cents). */
export function inventedNumbers(answer: string, source: string): string[] {
  const known = new Set(numbersIn(source).flatMap((n) => [n, n.replace(/\.\d+$/, "")]));
  return numbersIn(answer).filter((n) => !known.has(n) && !known.has(n.replace(/\.\d+$/, "")));
}

/** Links in `answer` that aren't https or aren't in `source`. */
export function foreignLinks(answer: string, source: string): string[] {
  const links = answer.match(/\bhttps?:\/\/[^\s)\]"'<>]+/gi) ?? [];
  return links.filter((l) => !l.toLowerCase().startsWith("https://") || !source.includes(l.replace(/[.,;:]+$/, "")));
}

/** Plain text for the page: no markup, no control characters, bounded. */
export function plain(s: unknown, max: number): string {
  if (typeof s !== "string") return "";
  // Tags out, then any "<" or ">" left over ("<scr<script>ipt>"), so no tag can be rebuilt.
  return s.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").replace(/<[^>]*>/g, "").replace(/[<>]/g, "").trim().slice(0, max);
}
