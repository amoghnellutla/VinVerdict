/**
 * Removes phone numbers and email addresses from text before it goes into a
 * report (the same rules as scripts/add-case.mjs, which can't import this file).
 */
export function redact(text: string): { text: string; removed: number } {
  let n = 0;
  const out = text
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, () => (n++, "[email removed]"))
    .replace(/(?<![\w#$])(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}(?!\d)/g, () => (n++, "[phone removed]"));
  return { text: out, removed: n };
}
