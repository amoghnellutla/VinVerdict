/** Small text helpers shared by the listing parser and the scam rules. */

/** Lowercase, straighten curly quotes, collapse whitespace. */
export function normalizeText(raw: string): string {
  return raw
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// A negating word up to 3 words before a match flips its meaning
// ("no accidents", "never been in an accident"). Punctuation breaks the
// link, so "no rust, minor accident" still counts the accident.
const NEGATION = /\b(no|not|never|non|zero|without|free of|isn'?t|wasn'?t)(?:[\s-]+[\w']+){0,3}[\s-]*$/;

/**
 * True if `re` matches somewhere in `text` that isn't negated just before it.
 * "no accidents" → false for /accident/, "minor accident" → true.
 * `re` must not be global; a global copy is made internally.
 */
export function hasUnnegated(text: string, re: RegExp): boolean {
  const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  for (const m of text.matchAll(g)) {
    const before = text.slice(Math.max(0, m.index - 30), m.index);
    if (!NEGATION.test(before)) return true;
  }
  return false;
}
