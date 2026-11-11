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
const NEGATION = /\b(no|not|never|non|zero|without|free of|isn'?t|wasn'?t|don'?t|doesn'?t|won'?t|can'?t)((?:[\s-]+[\w']+){0,3})[\s-]*$/;
// A negation that already ended ("no title issues reported") doesn't reach the
// next phrase. Pasted pages lose their line breaks, so without this
// "No title issues reported / 1 accident reported" would hide the accident.
const NEGATION_CLOSED = /\b(reported|issues?|problems?|found|needed|required)\b/;
// Private ads often answer their own questions: "Salvage? No. Flood: no. Accidents - none."
// A term followed (within two words) by "?", ":" or a dash and then no/none/never/0 is answered no.
// "Salvage title? No problem" and "Accident: no injuries" are not answers, so they still count.
const ANSWERED_NO = /^(?:[\s-]+[\w']+){0,2}\s*[?:\-–—]+\s*(?:no|none|nope|zero|0|never|n\/a)\b(?![- ]?(?:problem|issue|big deal|worr|biggie|injur|one (?:was )?hurt))/;

/**
 * True if `re` matches somewhere in `text` that isn't negated just before it,
 * or answered "no" just after it.
 * "no accidents" or "Accidents? None" → false for /accident/, "minor accident" → true.
 * `re` must not be global; a global copy is made internally.
 */
export function hasUnnegated(text: string, re: RegExp): boolean {
  const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  for (const m of text.matchAll(g)) {
    if (ANSWERED_NO.test(text.slice(m.index + m[0].length, m.index + m[0].length + 40).toLowerCase())) continue;
    const before = text.slice(Math.max(0, m.index - 30), m.index);
    const neg = NEGATION.exec(before);
    if (!neg || NEGATION_CLOSED.test(neg[2])) return true;
  }
  return false;
}
